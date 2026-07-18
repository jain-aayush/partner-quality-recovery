import storedTagsJson from "../../data/uc-sample-tags.json";
import { detectInjection } from "./guardrails";
import { Customer, Review, ReviewTag, TagFlag } from "./model";
import { customerContext, scanSafety, tagReview } from "./tag";
import { ContentTag } from "./tagLlm";
import { THRESHOLDS } from "./thresholds";

/**
 * Content-keyed review tags. The bundled sample ships pre-tagged (data/uc-sample-tags.json,
 * generated once by Claude Code sonnet subagents — zero API spend), keyed by (rating, text)
 * so identical review texts share one tag. composeTag() turns a content-level classification
 * (stored or live-LLM) into a full ReviewTag, with the DETERMINISTIC GUARDRAILS ALWAYS ON TOP:
 * injection quarantine and the thin-text exit run before the content tag is consulted, and the
 * safety lexicon is unioned in — an LLM miss can never lower the recall-first safety floor.
 */

export type TagSource = "stored" | "llm-anthropic" | "llm-openai" | "rule";

export const contentKey = (rating: number, text: string) => `${rating}|${text.trim()}`;

const VALID_FLAGS: TagFlag[] = ["out_of_taxonomy", "injection_quarantined", "thin_text", "non_verbatim", "low_trust_reviewer", "needs_human"];

/** The pre-tagged sample corpus as a content-keyed map. */
export function loadStoredTags(): Map<string, ContentTag> {
  return new Map(Object.entries((storedTagsJson as { tags: Record<string, ContentTag> }).tags));
}

const isThin = (text: string) => text.trim().split(/\s+/).filter(Boolean).length < 3;

/** True when the deterministic tagger must own this review outright (guardrail exits). */
export const ruleOnly = (text: string) => isThin(text) || detectInjection(text);

/** Compose a full ReviewTag from a content-level classification + per-review facts. */
export function composeTag(review: Review, customer: Customer, content: ContentTag): ReviewTag {
  const ctx = customerContext(customer);
  const flags: TagFlag[] = content.flags.filter((f): f is TagFlag => (VALID_FLAGS as string[]).includes(f));
  if (customer.karma < THRESHOLDS.karmaLowTrust && !flags.includes("low_trust_reviewer")) flags.push("low_trust_reviewer");

  let safetySubtype = content.safetySubtype;
  let severity = Math.max(1, Math.min(5, Math.round(content.severity)));
  const quotes = content.evidenceQuotes.filter((q) => review.text.includes(q));

  // Recall-first union: the lexicon scan can add a safety flag the LLM missed, never remove one.
  const lexicon = scanSafety(review.text);
  if (lexicon && !safetySubtype) {
    safetySubtype = lexicon.subtype;
    if (!quotes.includes(lexicon.quote)) quotes.unshift(lexicon.quote);
  }
  if (safetySubtype) severity = Math.max(severity, 4);

  return {
    reviewId: review.id,
    partnerId: review.partnerId,
    sku: review.sku,
    sentiment: content.sentiment,
    target: content.target,
    problemClasses: content.problemClasses,
    severity,
    safetyFlag: safetySubtype !== null,
    safetySubtype,
    evidenceQuotes: quotes.slice(0, 4),
    customer: ctx,
    confidence: Math.max(0, Math.min(1, content.confidence)),
    flags,
  };
}

/** Resolve one review: guardrail exits and missing content tags go to the rule tagger. */
export function resolveTag(
  review: Review,
  customer: Customer,
  content: ContentTag | undefined,
  source: TagSource
): { tag: ReviewTag; source: TagSource } {
  if (!content || ruleOnly(review.text)) return { tag: tagReview(review, customer), source: "rule" };
  return { tag: composeTag(review, customer, content), source };
}
