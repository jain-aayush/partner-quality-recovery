import { Diagnosis, Partner, PartnerPublic, Review, RootCause, ROOT_CAUSES } from "./types";

/** Ground truth must never reach a diagnoser — this is the only sanctioned strip point. */
export function stripGroundTruth(partner: Partner): PartnerPublic {
  const { trueCause: _trueCause, ...pub } = partner;
  return pub;
}

/** Below the minimum review count we refuse to diagnose — guardrail outcome, not a verdict. */
export function minReviewsGuard(
  partnerId: string,
  reviews: Review[],
  minReviews: number
): Diagnosis | null {
  if (reviews.length >= minReviews) return null;
  return {
    partnerId,
    rootCause: "insufficient_evidence",
    confidence: 1,
    evidenceQuotes: [],
    secondaryHypothesis: null,
    reasoning: `Only ${reviews.length} review(s), below the minimum of ${minReviews} required for a responsible diagnosis. No model call was made.`,
    flaggedReviews: [],
    evidenceValid: true,
  };
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /disregard\s+(the\s+)?(system|previous|prior|above)/i,
  /system\s+prompt/i,
  /rate\s+(this|the)\s+partner/i,
  /root_cause/i,
  /respond\s+with/i,
  /you\s+are\s+(now\s+)?(a|an)\s/i,
];

/** Review text is untrusted data: anything that reads like an instruction to the model is quarantined. */
export function detectInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "")
    .replace(/\.{3,}$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Every quote must be verbatim from a clean source review. Quotes that aren't are dropped;
 * if none survive, confidence is capped below the auto-approve threshold so the case
 * always reaches a human ("no quote → downgrade", PLAN §8.5).
 */
export function validateEvidence(diagnosis: Diagnosis, cleanReviews: Review[]): Diagnosis {
  if (diagnosis.rootCause === "insufficient_evidence") return diagnosis;
  const corpus = cleanReviews.map((r) => normalize(r.text));
  const valid = diagnosis.evidenceQuotes.filter((q) => {
    const nq = normalize(q);
    return nq.length > 0 && corpus.some((t) => t.includes(nq));
  });
  if (valid.length > 0) return { ...diagnosis, evidenceQuotes: valid, evidenceValid: true };
  return {
    ...diagnosis,
    evidenceQuotes: [],
    evidenceValid: false,
    confidence: Math.min(diagnosis.confidence, 0.5),
  };
}

const isRootCause = (v: unknown): v is RootCause =>
  typeof v === "string" && (ROOT_CAUSES as string[]).includes(v);

/**
 * Type-checks and clamps a raw diagnosis-shaped object. A malformed payload becomes
 * insufficient_evidence at confidence 0 (→ human queue) — never a thrown error.
 */
export function clampDiagnosis(raw: unknown, partnerId: string): Diagnosis {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rootCause = isRootCause(r.rootCause) ? r.rootCause : null;
  if (!rootCause) {
    return {
      partnerId,
      rootCause: "insufficient_evidence",
      confidence: 0,
      evidenceQuotes: [],
      secondaryHypothesis: null,
      reasoning: "Diagnoser returned a malformed result; routed to human review.",
      flaggedReviews: [],
      evidenceValid: false,
    };
  }
  const confidence =
    typeof r.confidence === "number" && Number.isFinite(r.confidence)
      ? Math.min(1, Math.max(0, r.confidence))
      : 0;
  return {
    partnerId,
    rootCause,
    confidence,
    evidenceQuotes: Array.isArray(r.evidenceQuotes)
      ? r.evidenceQuotes.filter((q): q is string => typeof q === "string").slice(0, 5)
      : [],
    secondaryHypothesis: isRootCause(r.secondaryHypothesis) ? r.secondaryHypothesis : null,
    reasoning: typeof r.reasoning === "string" ? r.reasoning : "",
    flaggedReviews: [],
    evidenceValid: true,
  };
}
