import { loadConfig, providerCreds } from "./config";
import { withTagTrace } from "./observability";
import { configuredTagEngine, ContentTag, LiveTagEngine, llmTagBatch, TagInput } from "./tagLlm";
import { contentKey, loadStoredTags, resolveTag, ruleOnly, TagSource } from "./tagStore";
import type { OrderRow, TagFn } from "./unified";

/**
 * Per-run tagging orchestration for /api/pipeline2. The bundled sample reuses its stored
 * tags and live-tags ONLY texts that aren't tagged yet; uploads are live-tagged in full.
 * Live tagging runs only in llm mode (DIAGNOSIS_MODE=llm + a provider key) — dev and evals
 * stay on the rule tagger with zero API spend. Every review that can't be LLM-tagged
 * (guardrail exits, provider failures, mock mode) falls back to the deterministic rules.
 */

export interface InferenceSummary {
  /** The engine live tagging ran on (or would run on) this deployment — the demo badge. */
  engine: "llm-anthropic" | "llm-openai" | "rule";
  model: string | null;
  /** Per-review counts by where its tag came from. */
  counts: { stored: number; llmAnthropic: number; llmOpenai: number; rule: number };
  /** Unique review texts tagged live (billed model calls) in this run. */
  liveTagged: number;
  llmErrors?: string[];
}

const BATCH_SIZE = 25;
const CONCURRENCY = 5;

const chunk = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

async function mapConcurrent<T>(xs: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < xs.length) await fn(xs[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, worker));
}

export async function buildTagRuntime(
  rows: OrderRow[],
  source: "sample" | "upload"
): Promise<{ tagFn: TagFn; summary: () => InferenceSummary }> {
  const config = loadConfig();
  const llmOn = config.mode === "llm";

  // Unique classifiable texts — guardrail exits (thin text, injections) stay rule-owned
  // and are never sent to a model; duplicate texts share one tag (and one model call).
  const unique = new Map<string, TagInput>();
  for (const r of rows) {
    const text = r.reviewText.trim();
    if (!text || ruleOnly(text)) continue;
    const key = contentKey(r.rating, text);
    if (!unique.has(key)) unique.set(key, { key, rating: r.rating, text });
  }

  const content = new Map<string, { tag: ContentTag; source: TagSource }>();
  if (source === "sample") for (const [k, t] of loadStoredTags()) content.set(k, { tag: t, source: "stored" });

  const untagged = [...unique.values()].filter((u) => !content.has(u.key));
  const llmErrors: string[] = [];
  let liveEngine: LiveTagEngine | null = null;
  let liveTagged = 0;

  if (llmOn && untagged.length > 0) {
    await withTagTrace(
      {
        source,
        mode: config.mode,
        provider: config.provider,
        model: config.model,
        reviewCount: rows.length,
        uniqueTexts: untagged.length,
      },
      async (trace) => {
        await mapConcurrent(chunk(untagged, BATCH_SIZE), CONCURRENCY, async (batch) => {
          try {
            const { tags, engine } = await llmTagBatch(batch, trace.generation);
            if (!liveEngine) liveEngine = engine;
            for (const [k, t] of tags) {
              content.set(k, { tag: t, source: engine });
              liveTagged++;
            }
          } catch (err) {
            if (llmErrors.length < 5) llmErrors.push(err instanceof Error ? err.message : String(err));
          }
        });
        trace.finish({ liveTagged, engine: liveEngine ?? "rule", failedBatches: llmErrors.length, untagged: untagged.length });
      }
    );
  }

  const counts = { stored: 0, llmAnthropic: 0, llmOpenai: 0, rule: 0 };
  const COUNT_KEY: Record<TagSource, keyof typeof counts> = {
    stored: "stored",
    "llm-anthropic": "llmAnthropic",
    "llm-openai": "llmOpenai",
    rule: "rule",
  };
  const counted = new Set<string>();

  const tagFn: TagFn = (review, customer) => {
    const entry = content.get(contentKey(review.rating, review.text));
    const { tag, source: used } = resolveTag(review, customer, entry?.tag, entry?.source ?? "rule");
    if (!counted.has(review.id)) {
      counted.add(review.id);
      counts[COUNT_KEY[used]]++;
    }
    return tag;
  };

  // Read AFTER runFromRows so the per-review counts are populated.
  const summary = (): InferenceSummary => {
    // Badge truthfulness: the configured engine is only claimed when nothing needed live
    // tagging; if live tagging ran and every batch failed, this run WAS rule-based.
    const engine = liveEngine ?? (llmOn && untagged.length === 0 ? (configuredTagEngine() ?? "rule") : "rule");
    const model = engine === "rule" ? null : providerCreds(engine === "llm-anthropic" ? "anthropic" : "openai").model;
    return { engine, model, counts: { ...counts }, liveTagged, ...(llmErrors.length ? { llmErrors } : {}) };
  };

  return { tagFn, summary };
}
