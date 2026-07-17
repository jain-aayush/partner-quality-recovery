/**
 * System 1 — per-review tagging. Turns one raw review + its customer context into a
 * structured, evidence-grounded ReviewTag. This mock is deterministic (default for demos
 * and evals); an LLM tagger can slot behind the same `tagReview` signature later.
 *
 * Guardrails reused from the legacy path: prompt-injection quarantine, and verbatim
 * evidence (the quote is always a real substring of the review, so grounding holds).
 */

import { detectInjection } from "./guardrails";
import {
  Customer,
  CustomerContext,
  ProblemClass,
  Review,
  ReviewTag,
  SafetySubtype,
  Sentiment,
  Target,
} from "./model";
import { isHighValue, THRESHOLDS } from "./thresholds";

// Recall-first safety lexicons (grave subtypes take priority over hygiene).
const SAFETY: Record<SafetySubtype, string[]> = {
  injury: ["burned", "burn ", "burnt", "cut me", "bleeding", "wound", "swelling", "allergic reaction", "chemical burn", "scalded"],
  harassment: ["harassed", "inappropriate", "touched me", "creepy", "abusive", "misbehaved", "uncomfortable advances"],
  theft: ["stole", "stolen", "went missing", "took my", "robbed"],
  hygiene: ["dirty tools", "unhygienic", "unclean", "reused", "not sanitized", "not sanitised", "filthy", "unsterilized"],
};

// Non-safety problem-class keywords → the closed taxonomy.
const PROBLEM: Partial<Record<ProblemClass, string[]>> = {
  skill_issue: ["patchy", "uneven", "streak", "wrong shade", "bad technique", "botched", "one side", "poorly done", "messed up my"],
  time: ["rushed", "hurried", "left early", "on the phone", "next booking", "half done", "in a hurry", "hours late", "arrived late"],
  undisclosed_supplies: ["cheap product", "unbranded", "not the brand", "substituted", "refilled", "local product", "different product"],
  partner_attitude: ["rude", "unprofessional", "arrogant", "argued", "disrespectful", "attitude", "shouted"],
  pricing: ["overcharged", "too expensive", "extra charge", "hidden charge", "asked for more money", "overpriced"],
};

// Signal that a bad outcome was outside the partner's control (feeds unfair_review).
const UNFAIR = ["already damaged", "like the photo", "like the picture", "celebrity", "unrealistic", "previous salon", "film star", "my hair was", "expected too much"];

// Intensity words bump numeric severity toward the quality-severe (>=4) band.
const INTENSITY = ["worst", "terrible", "ruined", "disaster", "total mess", "never again", "horrible", "awful"];

const has = (t: string, kws: string[]): string | null => {
  const lower = t.toLowerCase();
  return kws.find((k) => lower.includes(k)) ?? null;
};

/** The exact sentence containing the keyword — verbatim, so evidence validation passes. */
function sentenceWith(text: string, keyword: string): string {
  const s = text.split(/(?<=[.!?])\s+/).find((x) => x.toLowerCase().includes(keyword));
  return (s ?? text).trim();
}

function customerContext(c: Customer): CustomerContext {
  return {
    karma: c.karma,
    aovBand: c.aovBand,
    ltvBand: c.ltvBand,
    highValue: isHighValue(c.karma, c.aovBand),
  };
}

function detectTarget(text: string, problemClasses: ProblemClass[]): Target {
  const t = text.toLowerCase();
  if (has(t, UNFAIR)) return "customer_self";
  if (problemClasses.includes("pricing")) return "pricing";
  if (/\b(app|website|otp|payment failed|booking system|customer care)\b/.test(t)) return "urban_company";
  return "partner";
}

/**
 * Tag a single review. Empty/rating-only → thin_text (analyst back-fill). Injection → quarantined,
 * neither followed nor cited. Positive → no problem classes. Safety is recall-first: any safety
 * keyword forces safetyFlag + severity >= 4.
 */
export function tagReview(review: Review, customer: Customer): ReviewTag {
  const customerCtx = customerContext(customer);
  const flags: ReviewTag["flags"] = [];
  if (customer.karma < THRESHOLDS.karmaLowTrust) flags.push("low_trust_reviewer");

  const base = {
    reviewId: review.id,
    partnerId: review.partnerId,
    sku: review.sku,
    customer: customerCtx,
    safetyFlag: false,
    safetySubtype: null as SafetySubtype | null,
    problemClasses: [] as ProblemClass[],
    evidenceQuotes: [] as string[],
  };

  // Injection quarantine — untrusted text is never read as an instruction, never cited.
  if (detectInjection(review.text)) {
    return {
      ...base,
      sentiment: "negative",
      target: "irrelevant",
      severity: 1,
      confidence: 0.2,
      flags: [...flags, "injection_quarantined"],
    };
  }

  // Thin text — a bare rating with no usable words. Never invent a problem from a star.
  const words = review.text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) {
    return {
      ...base,
      sentiment: review.rating >= 4 ? "positive" : review.rating === 3 ? "neutral" : "negative",
      target: "partner",
      severity: 1,
      confidence: 0.3,
      flags: [...flags, "thin_text"],
    };
  }

  const positive = review.rating >= 4;
  if (positive) {
    return { ...base, sentiment: "positive", target: "irrelevant", severity: 1, confidence: 0.8, flags };
  }

  const sentiment: Sentiment = review.rating === 3 ? "neutral" : "negative";

  // Safety first (recall-first). Grave subtypes win over hygiene.
  let safetySubtype: SafetySubtype | null = null;
  let safetyQuote: string | null = null;
  for (const sub of ["injury", "harassment", "theft", "hygiene"] as SafetySubtype[]) {
    const kw = has(review.text, SAFETY[sub]);
    if (kw) {
      safetySubtype = sub;
      safetyQuote = sentenceWith(review.text, kw);
      break;
    }
  }

  // Problem classes.
  const problemClasses: ProblemClass[] = [];
  const quotes: string[] = [];
  for (const [cls, kws] of Object.entries(PROBLEM) as [ProblemClass, string[]][]) {
    const kw = has(review.text, kws);
    if (kw) {
      problemClasses.push(cls);
      quotes.push(sentenceWith(review.text, kw));
    }
  }
  const unfairKw = has(review.text, UNFAIR);
  if (unfairKw) {
    problemClasses.push("unfair_review");
    quotes.push(sentenceWith(review.text, unfairKw));
  }

  // Relevance first: who is the complaint actually about? An off-target review — the app/platform
  // (urban_company), pricing, or the customer's own doing (customer_self) — is never a partner
  // penalty; `target` carries that signal and aggregation drops it from the partner quality rate.
  const target = detectTarget(review.text, problemClasses);

  // Escape hatch ONLY for a genuinely partner-directed complaint we couldn't classify. An off-target
  // review is already explained by `target`, so we don't mislabel it out_of_taxonomy / needs_human
  // (that would wrongly route a pricing/app issue into the partner's human-triage queue).
  if (problemClasses.length === 0 && !safetySubtype && target === "partner") {
    problemClasses.push("out_of_taxonomy");
    flags.push("out_of_taxonomy", "needs_human");
  }

  // Severity (1–5), gauged from text: neutral base 2, negative base 3; intensity words → 4;
  // safety → ≥4; a grave incident described with intensity language → 5.
  const intense = has(review.text, INTENSITY);
  let severity = review.rating <= 2 ? 3 : 2;
  if (intense) severity = 4;
  if (safetySubtype) severity = Math.max(severity, 4);
  if (safetySubtype && intense) severity = 5;

  const evidenceQuotes = safetyQuote ? [safetyQuote, ...quotes] : quotes;

  return {
    reviewId: review.id,
    partnerId: review.partnerId,
    sku: review.sku,
    sentiment,
    target,
    problemClasses,
    severity,
    safetyFlag: safetySubtype !== null,
    safetySubtype,
    evidenceQuotes: evidenceQuotes.slice(0, 4),
    customer: customerCtx,
    confidence: problemClasses.includes("out_of_taxonomy") ? 0.4 : 0.75,
    flags,
  };
}
