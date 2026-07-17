import { anthropicDiagnose } from "./providers/anthropic";
import { geminiDiagnose } from "./providers/gemini";
import { openaiDiagnose } from "./providers/openai";
import { Config, Diagnosis, PartnerPublic, Review } from "./types";

/**
 * Provider-agnostic diagnosis entry point (DIAGNOSIS_MODE=llm). Selects the backend
 * from config.provider; every backend returns the same Diagnosis shape, which the
 * diagnose.ts guardrail pipeline then clamps and evidence-checks identically.
 */
export async function llmDiagnose(
  partner: PartnerPublic,
  reviews: Review[],
  config: Config
): Promise<Diagnosis> {
  if (!config.apiKey) {
    throw new Error(
      `${config.provider} API key is not set (DIAGNOSIS_MODE=llm, LLM_PROVIDER=${config.provider})`
    );
  }

  switch (config.provider) {
    case "anthropic":
      return anthropicDiagnose(partner, reviews, config);
    case "gemini":
      return geminiDiagnose(partner, reviews, config);
    case "openai":
    default:
      return openaiDiagnose(partner, reviews, config);
  }
}
