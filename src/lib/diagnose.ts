import {
  clampDiagnosis,
  detectInjection,
  minReviewsGuard,
  stripGroundTruth,
  validateEvidence,
} from "./guardrails";
import { llmDiagnose } from "./llm";
import { mockDiagnose } from "./mockLlm";
import { Config, Diagnosis, Partner, Review } from "./types";

/**
 * The single diagnosis entry point. Guardrail order:
 * strip ground truth → min-reviews guard (no model call) → quarantine injected
 * reviews → backend (mock | llm) → clamp/type-check → validate cited evidence
 * against the clean corpus only.
 */
export async function diagnosePartner(
  partner: Partner,
  reviews: Review[],
  config: Config
): Promise<Diagnosis> {
  const pub = stripGroundTruth(partner);

  const guard = minReviewsGuard(partner.id, reviews, config.minReviews);
  if (guard) return guard;

  const flagged = reviews.filter((r) => detectInjection(r.text));
  const clean = reviews.filter((r) => !detectInjection(r.text));

  let raw: unknown;
  try {
    raw =
      config.mode === "llm"
        ? await llmDiagnose(pub, clean, config)
        : await mockDiagnose(pub, clean, config);
  } catch (err) {
    raw = {
      rootCause: "insufficient_evidence",
      confidence: 0,
      reasoning: `Diagnosis backend failed: ${err instanceof Error ? err.message : String(err)}. Routed to human review.`,
    };
  }

  const diagnosis = clampDiagnosis(raw, partner.id);
  diagnosis.flaggedReviews = flagged.map((r) => r.id);
  return validateEvidence(diagnosis, clean);
}
