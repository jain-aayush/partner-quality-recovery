import { Config } from "./types";

export function loadConfig(overrides: Partial<Config> = {}): Config {
  return {
    mode: process.env.DIAGNOSIS_MODE === "llm" ? "llm" : "mock",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD) || 0.7,
    minReviews: Number(process.env.MIN_REVIEWS) || 5,
    ratingFlagThreshold: Number(process.env.RATING_FLAG_THRESHOLD) || 3.5,
    apiKey: process.env.OPENAI_API_KEY,
    ...overrides,
  };
}
