import { normalize } from "./guardrails";
import { Customer, ProblemClass, PROBLEM_CLASSES, RawTag, ReviewInput, SafetySubtype, Tag, TagFlag, Target } from "./tagTypes";

export const SAFETY_GRAVE = /\b(burn(?:ed|t)?|jal gaya|current laga|electric shock|gas leak|harass(?:ed|ment)?|assault|stole|theft|chori)\b/i;
export const SAFETY_LESSER = /\b(hygiene|unclean|dirty tools?|reused? (cloth|towel|tool)|old cloth)\b/i;

const TARGETS: Target[] = ["partner", "urban_company", "pricing", "customer_self", "irrelevant"];
const isProblemClass = (value: unknown): value is ProblemClass =>
  typeof value === "string" && (PROBLEM_CLASSES as readonly string[]).includes(value);
const clamp = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function safetySubtype(text: string): SafetySubtype {
  return SAFETY_GRAVE.test(text) ? "grave" : SAFETY_LESSER.test(text) ? "lesser" : null;
}

export function hasSafetySignal(text: string): boolean {
  return safetySubtype(text) !== null;
}

export function isThinText(text: string): boolean {
  return text.trim().length < 4;
}

export function emptyTag(review: ReviewInput, customer: Customer, flag: TagFlag): Tag {
  return {
    review_id: review.review_id, order_id: review.order_id, partner_id: review.partner_id,
    sku: review.sku, location: review.location, sentiment: review.rating && review.rating >= 4 ? "positive" : "neutral",
    target: "irrelevant", problem_classes: [], problem_detail: null, severity: 1,
    safety_flag: false, safety_subtype: null, evidence_quotes: [],
    customer_context: { karma: customer.karma, aov_band: customer.aov_band, ltv_band: customer.ltv_band },
    confidence: 1, flags: [flag], model_version: "tagger-mock-2026-07",
  };
}

/**
 * Injection-quarantined tag. The untrusted text is never followed or cited, but a
 * deterministic safety signal in it still forces safety_flag — quarantine must not
 * become a safety-recall hole (a burn wrapped in an injection payload still escalates).
 */
export function quarantineTag(review: ReviewInput, customer: Customer): Tag {
  const subtype = safetySubtype(review.review_text);
  const base = emptyTag(review, customer, "injection_quarantined");
  if (subtype === null) return base;
  return { ...base, safety_flag: true, safety_subtype: subtype, severity: 4, flags: [...base.flags, "needs_human"] };
}

export function clampTag(raw: unknown, review: ReviewInput, customer: Customer): Tag {
  const source = (raw ?? {}) as Partial<RawTag>;
  const flags: TagFlag[] = [];
  const problem_classes = Array.isArray(source.problem_classes)
    ? source.problem_classes.filter(isProblemClass).slice(0, 4)
    : [];
  if (!Array.isArray(source.problem_classes) || (source.problem_classes.length > 0 && problem_classes.length === 0)) {
    flags.push("needs_human");
  }
  const safety_subtype = safetySubtype(review.review_text);
  const safety_flag = safety_subtype !== null || source.safety_flag === true;
  const severity = Math.max(safety_flag ? 4 : 1, Math.min(5, Math.max(1, Math.round(Number(source.severity) || 1)))) as Tag["severity"];
  const target = TARGETS.includes(source.target as Target) ? source.target as Target : "irrelevant";
  const safetyQuote = safety_flag
    ? review.review_text.split(/(?<=[.!?])\s+/).find((line) => hasSafetySignal(line))?.trim() ?? review.review_text.trim()
    : null;
  const tag: Tag = {
    review_id: review.review_id, order_id: review.order_id, partner_id: review.partner_id,
    sku: review.sku, location: review.location,
    sentiment: source.sentiment === "positive" || source.sentiment === "neutral" || source.sentiment === "negative" ? source.sentiment : "neutral",
    target, problem_classes, problem_detail: source.problem_detail && typeof source.problem_detail.sku === "string" && typeof source.problem_detail.skill_gap === "string" ? source.problem_detail : null,
    severity, safety_flag, safety_subtype: safety_subtype ?? (source.safety_subtype === "grave" || source.safety_subtype === "lesser" ? source.safety_subtype : null),
    evidence_quotes: safetyQuote ? [safetyQuote] : Array.isArray(source.evidence_quotes) ? source.evidence_quotes.filter((q): q is string => typeof q === "string").slice(0, 4) : [],
    customer_context: { karma: customer.karma, aov_band: customer.aov_band, ltv_band: customer.ltv_band },
    confidence: clamp(source.confidence, 0), flags, model_version: "tagger-mock-2026-07",
  };
  if (customer.karma < 0.3) tag.flags.push("low_trust_reviewer");
  if (tag.problem_classes.includes("out_of_taxonomy") && !tag.flags.includes("out_of_taxonomy")) tag.flags.push("out_of_taxonomy", "needs_human");
  return validateTagEvidence(tag, review.review_text);
}

export function validateTagEvidence(tag: Tag, text: string): Tag {
  if (tag.sentiment !== "negative") return tag;
  const normalizedText = normalize(text);
  const valid = tag.evidence_quotes.filter((quote) => {
    const nq = normalize(quote);
    return nq.length > 0 && normalizedText.includes(nq);
  });
  if (valid.length > 0) return { ...tag, evidence_quotes: valid };
  return { ...tag, evidence_quotes: [], confidence: Math.min(tag.confidence, 0.5), flags: [...tag.flags, "non_verbatim", "needs_human"] };
}
