import { Config, Provider } from "./types";

/** Sensible, low-cost default model per provider — overridable with LLM_MODEL. */
export const PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-2.0-flash",
};

/** Which env var holds each provider's key. */
const PROVIDER_KEY_ENV: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

/** Anthropic is the default; openai/gemini only when explicitly selected. */
function resolveProvider(raw: string | undefined): Provider {
  const p = (raw ?? "").toLowerCase();
  return p === "openai" || p === "gemini" ? p : "anthropic";
}

/**
 * Key + model for one provider — used when walking the anthropic → openai fallback chain.
 * LLM_MODEL applies only to the selected provider; a fallback provider always runs its
 * own default model (an Anthropic model name would 404 on OpenAI, and vice versa).
 */
export function providerCreds(provider: Provider): { apiKey: string | undefined; model: string } {
  const selected = resolveProvider(process.env.LLM_PROVIDER);
  const model =
    provider === selected
      ? process.env.LLM_MODEL ||
        (provider === "openai" ? process.env.OPENAI_MODEL : undefined) ||
        PROVIDER_DEFAULT_MODEL[provider]
      : PROVIDER_DEFAULT_MODEL[provider];
  return { apiKey: process.env[PROVIDER_KEY_ENV[provider]], model };
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const provider = resolveProvider(process.env.LLM_PROVIDER);
  const { apiKey, model } = providerCreds(provider);
  return {
    mode: process.env.DIAGNOSIS_MODE === "llm" ? "llm" : "mock",
    provider,
    // LLM_MODEL wins for the selected provider; OPENAI_MODEL kept for back-compat (openai only).
    model,
    confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD) || 0.7,
    minReviews: Number(process.env.MIN_REVIEWS) || 5,
    ratingFlagThreshold: Number(process.env.RATING_FLAG_THRESHOLD) || 3.5,
    apiKey,
    ...overrides,
  };
}
