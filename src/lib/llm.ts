import { anthropicDiagnose } from "./providers/anthropic";
import { geminiDiagnose } from "./providers/gemini";
import { openaiDiagnose } from "./providers/openai";
import { RecordLlmCall } from "./providers/shared";
import { Config, Diagnosis, PartnerPublic, Review } from "./types";

/**
 * Provider-agnostic diagnosis entry point (DIAGNOSIS_MODE=llm). Selects the backend
 * from config.provider; every backend returns the same Diagnosis shape, which the
 * diagnose.ts guardrail pipeline then clamps and evidence-checks identically.
 *
 * `record`, when supplied, receives the model, structured output, and token usage of the
 * call — used to build the Langfuse generation (with USD cost) in observability.ts.
 */
export async function llmDiagnose(
  partner: PartnerPublic,
  reviews: Review[],
  config: Config,
  record?: RecordLlmCall
): Promise<Diagnosis> {
  if (!config.apiKey) {
    throw new Error(
      `${config.provider} API key is not set (DIAGNOSIS_MODE=llm, LLM_PROVIDER=${config.provider})`
    );
  }

  switch (config.provider) {
    case "anthropic":
      return anthropicDiagnose(partner, reviews, config, record);
    case "gemini":
      return geminiDiagnose(partner, reviews, config, record);
    case "openai":
    default:
      return openaiDiagnose(partner, reviews, config, record);
  }
}
