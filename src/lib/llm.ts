import { providerCreds } from "./config";
import { anthropicDiagnose } from "./providers/anthropic";
import { geminiDiagnose } from "./providers/gemini";
import { openaiDiagnose } from "./providers/openai";
import { RecordLlmCall } from "./providers/shared";
import { Config, Diagnosis, PartnerPublic, Provider, Review } from "./types";

/**
 * Provider-agnostic diagnosis entry point (DIAGNOSIS_MODE=llm) with a fallback chain:
 * the configured provider (anthropic by default) runs first; if it fails or has no key,
 * the remaining keyed providers in FALLBACK_ORDER are tried. Every backend returns the
 * same Diagnosis shape, which the diagnose.ts guardrail pipeline then clamps and
 * evidence-checks identically. If every provider fails, this throws — diagnose.ts
 * catches and falls back to the rule-based diagnoser.
 *
 * `record`, when supplied, receives the model, structured output, and token usage of the
 * call — used to build the Langfuse generation (with USD cost) in observability.ts.
 */
const FALLBACK_ORDER: Provider[] = ["anthropic", "openai"];

const BACKEND: Record<Provider, typeof anthropicDiagnose> = {
  anthropic: anthropicDiagnose,
  openai: openaiDiagnose,
  gemini: geminiDiagnose,
};

export async function llmDiagnose(
  partner: PartnerPublic,
  reviews: Review[],
  config: Config,
  record?: RecordLlmCall
): Promise<Diagnosis> {
  const chain = [config.provider, ...FALLBACK_ORDER.filter((p) => p !== config.provider)];
  const errors: string[] = [];

  for (const provider of chain) {
    const { apiKey, model } =
      provider === config.provider ? { apiKey: config.apiKey, model: config.model } : providerCreds(provider);
    if (!apiKey) {
      errors.push(`${provider}: API key not set`);
      continue;
    }
    try {
      return await BACKEND[provider](partner, reviews, { ...config, provider, model, apiKey }, record);
    } catch (err) {
      errors.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`all LLM providers failed — ${errors.join(" | ")}`);
}
