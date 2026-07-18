import {
  clampDiagnosis,
  detectInjection,
  minReviewsGuard,
  stripGroundTruth,
  validateEvidence,
} from "./guardrails";
import { llmDiagnose } from "./llm";
import { mockDiagnose } from "./mockLlm";
import { withDiagnosisTrace } from "./observability";
import { RecordLlmCall } from "./providers/shared";
import { Config, Diagnosis, Partner, Review } from "./types";

/**
 * The single diagnosis entry point. Guardrail order:
 * strip ground truth → min-reviews guard (no model call) → quarantine injected
 * reviews → backend (mock | llm) → clamp/type-check → validate cited evidence
 * against the clean corpus only.
 *
 * The whole thing is wrapped in a Langfuse trace (a strict no-op unless LANGFUSE_* keys are set
 * AND mode is llm): the model call becomes a nested generation with tokens + USD cost, and the
 * final gate/guardrail flags are stamped on the trace. `onLlmCall` lets a batch runner (the
 * experiment script) also observe the raw call meta without disturbing the guardrail path.
 */
export async function diagnosePartner(
  partner: Partner,
  reviews: Review[],
  config: Config,
  onLlmCall?: RecordLlmCall
): Promise<Diagnosis> {
  return withDiagnosisTrace(
    {
      partnerId: partner.id,
      mode: config.mode,
      provider: config.provider,
      model: config.model,
      reviewCount: reviews.length,
      sessionId: config.sessionId,
    },
    async (trace) => {
      const pub = stripGroundTruth(partner);

      const guard = minReviewsGuard(partner.id, reviews, config.minReviews);
      if (guard) {
        trace.finish(guard, { guardrail: "min_reviews", modelCalled: false });
        return guard;
      }

      const flagged = reviews.filter((r) => detectInjection(r.text));
      const clean = reviews.filter((r) => !detectInjection(r.text));

      const record: RecordLlmCall = (m) => {
        trace.generation(m);
        onLlmCall?.(m);
      };

      let raw: unknown;
      try {
        raw =
          config.mode === "llm"
            ? await llmDiagnose(pub, clean, config, record)
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
      const final = validateEvidence(diagnosis, clean);
      trace.finish(final, { modelCalled: config.mode === "llm" });
      return final;
    }
  );
}
