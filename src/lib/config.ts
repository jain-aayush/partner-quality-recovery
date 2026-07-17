import { Config, Provider } from "./types";

/** Sensible, low-cost default model per provider — overridable with LLM_MODEL. */
const PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-2.0-flash",
};

/** Which env var holds each provider's key. Only the selected provider's key is read. */
const PROVIDER_KEY_ENV: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

function resolveProvider(raw: string | undefined): Provider {
  const p = (raw ?? "").toLowerCase();
  return p === "anthropic" || p === "gemini" ? p : "openai";
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const provider = resolveProvider(process.env.LLM_PROVIDER);
  return {
    mode: process.env.DIAGNOSIS_MODE === "llm" ? "llm" : "mock",
    provider,
    // LLM_MODEL wins for any provider; OPENAI_MODEL kept for back-compat (openai only).
    model:
      process.env.LLM_MODEL ||
      (provider === "openai" ? process.env.OPENAI_MODEL : undefined) ||
      PROVIDER_DEFAULT_MODEL[provider],
    confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD) || 0.7,
    minReviews: Number(process.env.MIN_REVIEWS) || 5,
    ratingFlagThreshold: Number(process.env.RATING_FLAG_THRESHOLD) || 3.5,
    apiKey: process.env[PROVIDER_KEY_ENV[provider]],
    ...overrides,
  };
}
