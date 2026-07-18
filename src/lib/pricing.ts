/**
 * Token → USD cost, the Session-4 "token economics" piece the app never had.
 * The providers used to discard `response.usage`; now we capture it and price it here.
 *
 * Prices are USD per 1,000,000 tokens [input, output]. Output is ~5× input — "the model
 * writes your bill" (Session 4, Theory A). VERIFY against each provider's current pricing
 * page before quoting a number to anyone; these move.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** USD per 1M tokens. Keys match the model ids in src/lib/model.ts + the handbook's Claude tiers. */
const PRICING: Record<string, { in: number; out: number }> = {
  // OpenAI
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  // Anthropic (Session-4 pricing: Opus 4.8 $5/$25 · Sonnet 4.6 $3/$15 · Haiku 4.5 $1/$5)
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
  // Gemini
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
  "gemini-1.5-flash": { in: 0.075, out: 0.3 },
  "gemini-1.5-pro": { in: 1.25, out: 5 },
};

/** Match an exact model id, then a dated/suffixed variant (e.g. claude-haiku-4-5-20251001). */
function priceFor(model: string): { in: number; out: number } | null {
  if (PRICING[model]) return PRICING[model];
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  return key ? PRICING[key] : null;
}

/** Exact USD for one call. Returns null for an unknown model rather than guessing a price. */
export function costUsd(model: string, usage: TokenUsage): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (usage.inputTokens * p.in + usage.outputTokens * p.out) / 1_000_000;
}
