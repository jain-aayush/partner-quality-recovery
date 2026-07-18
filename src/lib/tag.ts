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
// Hinglish terms included — FM5: "thoda jal gaya" is a safety event, whatever the star rating.
const SAFETY: Record<SafetySubtype, string[]> = {
  injury: ["burned", "burn ", "burnt", "cut me", "bleeding", "wound", "swelling", "allergic reaction", "chemical burn", "scalded", "jal gaya", "jal gayi", "jala diya", "current laga", "shock laga", "khoon nikla"],
  harassment: ["harassed", "inappropriate", "touched me", "creepy", "abusive", "misbehaved", "uncomfortable advances", "badtameezi", "galat harkat"],
  theft: ["stole", "stolen", "went missing", "took my", "robbed", "chori", "chura liya", "gayab ho gaya"],
  hygiene: ["dirty tools", "unhygienic", "unclean", "reused", "not sanitized", "not sanitised", "filthy", "unsterilized", "gande tools", "saaf nahi"],
};

// Non-safety problem-class keywords → the closed taxonomy.
const PROBLEM: Partial<Record<ProblemClass, string[]>> = {
  skill_issue: ["patchy", "uneven", "streak", "wrong shade", "bad technique", "botched", "one side", "poorly done", "messed up my",
    // home-cleaning quality terms
    "missed spot", "missed the corner", "missed corners", "still dirty", "still grimy", "left grime", "left dirty", "hard water", "water stain", "water mark", "soap scum", "grease left", "grease everywhere", "left grease", "not scrubbed", "damaged my", "scratched my", "untrained", "undertrained"],
  time: ["rushed", "hurried", "left early", "on the phone", "next booking", "half done", "in a hurry", "hours late", "arrived late",
    // home-cleaning timing terms
    "no show", "no-show", "did not show", "didn't show", "didn't turn up", "cancelled last minute"],
  undisclosed_supplies: ["cheap product", "unbranded", "not the brand", "substituted", "refilled", "local product", "different product",
    // home-cleaning supplies terms
    "cheap cleaner", "own cleaner", "used my own", "brought no supplies", "no supplies"],
  partner_attitude: ["rude", "unprofessional", "arrogant", "argued", "disrespectful", "attitude", "shouted"],
  pricing: ["overcharged", "too expensive", "extra charge", "hidden charge", "asked for more money", "overpriced"],
};

// Signal that a bad outcome was outside the partner's control (feeds unfair_review).
const UNFAIR = ["already damaged", "like the photo", "like the picture", "celebrity", "unrealistic", "previous salon", "film star", "my hair was", "expected too much",
  // customer's-own-doing terms (home-cleaning): the mess/stain pre-existed the visit
  "already there", "already stained", "already broken", "was already"];

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

// Problem classes that are complaints about the PARTNER's work (vs pricing/app/customer-self).
const PARTNER_CLASSES: ProblemClass[] = ["skill_issue", "time", "undisclosed_supplies", "partner_attitude"];

/**
 * Who is the complaint actually about? Partner-attributable content outranks an off-target
 * gripe on the same review — "patchy AND overcharged" is a partner complaint that also
 * mentions pricing, never a pricing review (the skill complaint must not be lost). A
 * customer-self signal still wins: the unfair-review shield is aggregated protectively.
 */
function detectTarget(text: string, problemClasses: ProblemClass[], hasSafety: boolean): Target {
  const t = text.toLowerCase();
  if (has(t, UNFAIR)) return "customer_self";
  if (hasSafety || problemClasses.some((c) => PARTNER_CLASSES.includes(c))) return "partner";
  if (problemClasses.includes("pricing")) return "pricing";
  if (/\b(app|website|otp|payment failed|booking system|customer care)\b/.test(t)) return "urban_company";
  return "partner";
}

/**
 * Tag a single review. SAFETY IS SCANNED FIRST, on the raw text, before any early exit —
 * a safety keyword forces safetyFlag + severity >= 4 regardless of star rating, text length,
 * sentiment, or an injection payload wrapped around it (FM5 / QC1: safety recall is the
 * hardest gate). Then: injection → quarantined, neither followed nor cited; empty/rating-only
 * → thin_text (analyst back-fill); positive → no problem classes.
 */
export function tagReview(review: Review, customer: Customer): ReviewTag {
  const customerCtx = customerContext(customer);
  const flags: ReviewTag["flags"] = [];
  if (customer.karma < THRESHOLDS.karmaLowTrust) flags.push("low_trust_reviewer");

  // Safety first (recall-first) — before the quarantine/thin/positive exits. Grave wins over hygiene.
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

  const base = {
    reviewId: review.id,
    partnerId: review.partnerId,
    sku: review.sku,
    customer: customerCtx,
    safetyFlag: safetySubtype !== null,
    safetySubtype,
    problemClasses: [] as ProblemClass[],
    evidenceQuotes: [] as string[],
  };

  // Injection quarantine — untrusted text is never read as an instruction, never cited.
  // A deterministic safety signal inside the payload still escalates (flag without quoting),
  // so quarantine can't become a safety-recall hole.
  if (detectInjection(review.text)) {
    return {
      ...base,
      sentiment: "negative",
      target: safetySubtype ? "partner" : "irrelevant",
      severity: safetySubtype ? 4 : 1,
      confidence: 0.2,
      flags: safetySubtype ? [...flags, "injection_quarantined", "needs_human"] : [...flags, "injection_quarantined"],
    };
  }

  // Thin text — a bare rating with no usable words. Never invent a problem from a star —
  // but a safety keyword in a terse review ("Burned me.") still flags, with the verbatim quote.
  const words = review.text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3 && !safetySubtype) {
    return {
      ...base,
      sentiment: review.rating >= 4 ? "positive" : review.rating === 3 ? "neutral" : "negative",
      target: "partner",
      severity: 1,
      confidence: 0.3,
      flags: [...flags, "thin_text"],
    };
  }

  // Positive exit only when no safety signal — "nice haircut but she burned my neck" (4★)
  // is a mixed-sentiment safety event, not a positive review.
  const positive = review.rating >= 4;
  if (positive && !safetySubtype) {
    return { ...base, sentiment: "positive", target: "irrelevant", severity: 1, confidence: 0.8, flags };
  }

  const sentiment: Sentiment = positive ? "positive" : review.rating === 3 ? "neutral" : "negative";

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
  const target = detectTarget(review.text, problemClasses, safetySubtype !== null);

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
