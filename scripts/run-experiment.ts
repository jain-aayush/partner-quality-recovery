/**
 * Power-up B — the provider/model flip as a scored experiment (Session-4 appendix).
 * "You just ran an A/B test, now with the standard tooling": the variable is the provider,
 * the dataset is the golden set, and the referee is your EXISTING accuracy metric — no new scoring.
 *
 * Two layers, by design:
 *   1. A local scored comparison table — runs on whichever providers have API keys, no Langfuse
 *      needed. This is the deliverable and it's verifiable offline-of-Langfuse.
 *   2. When LANGFUSE_* keys are set, each provider is ALSO pushed as a Langfuse dataset run
 *      (runName = screener-<provider>) so the runs line up item-by-item in the comparison view.
 *
 * Usage:  ANTHROPIC_API_KEY=... OPENAI_API_KEY=... npm run experiment
 *         (add LANGFUSE_* keys to also publish the runs; run seed:langfuse first for layer 2)
 *
 * ⚠️ Real API calls cost money — one diagnosis per flagged partner per provider. ⚠️ SDK: langfuse v3.
 */

import partnersJson from "../data/partners.json";
import reviewsJson from "../data/reviews.json";
import { scoreAccuracy } from "../src/lib/accuracy";
import { loadConfig } from "../src/lib/config";
import { diagnosePartner } from "../src/lib/diagnose";
import { costUsd } from "../src/lib/pricing";
import type { LlmCallMeta } from "../src/lib/observability";
import { flagPartners } from "../src/lib/screen";
import { Config, Diagnosis, Partner, Provider, Review, RootCause } from "../src/lib/types";

// Next auto-loads .env.local; standalone tsx does not. Load it if present (Node ≥ 20.12), typed
// defensively so an older @types/node still compiles. No-op when the file/method is absent.
try {
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  /* fall back to shell env */
}

const DATASET = "partner-quality-gold";
const PROVIDER_KEY_ENV: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

interface Row {
  provider: Provider;
  model: string;
  labelMatch: number; // accuracy vs ground truth (E9)
  thinGuard: boolean;
  evidenceValidRate: number;
  avgConfidence: number;
  avgCostUsd: number | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const expectedCause = (p: Partner, minReviews: number): RootCause =>
  p.reviewCount < minReviews ? "insufficient_evidence" : (p.trueCause as RootCause);

async function main() {
  // We own trace creation for the dataset runs below — suppress the per-diagnosis auto-trace.
  process.env.LANGFUSE_SUPPRESS_AUTOTRACE = "1";

  const partners = partnersJson as unknown as Partner[];
  const reviews = reviewsJson as unknown as Review[];
  const reviewsFor = (id: string) => reviews.filter((r) => r.partnerId === id);
  const base = loadConfig();
  const flagged = flagPartners(partners, base.ratingFlagThreshold);

  const providers = (Object.keys(PROVIDER_KEY_ENV) as Provider[]).filter(
    (p) => !!process.env[PROVIDER_KEY_ENV[p]]
  );
  if (providers.length === 0) {
    console.log(
      "No provider API keys set — nothing to run.\n" +
        "Set at least one of OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY and re-run."
    );
    return;
  }

  const langfuseOn = !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lf: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dataset: any = null;
  if (langfuseOn) {
    const { Langfuse } = await import("langfuse");
    lf = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    });
    try {
      dataset = await lf.getDataset(DATASET);
    } catch {
      console.warn(`Dataset "${DATASET}" not found — run "npm run seed:langfuse" first. Publishing runs without item links.`);
    }
  }

  const rows: Row[] = [];
  for (const provider of providers) {
    const config: Config = loadConfig({
      mode: "llm",
      provider,
      apiKey: process.env[PROVIDER_KEY_ENV[provider]],
    });
    const runName = `screener-${provider}`;
    console.log(`\n▶ ${runName} (${config.model}) — ${flagged.length} cases…`);

    const cases: { partner: Partner; diagnosis: Diagnosis }[] = [];
    const costs: number[] = [];

    for (const p of flagged) {
      let meta: LlmCallMeta | undefined;
      const diagnosis = await diagnosePartner(p, reviewsFor(p.id), config, (m) => (meta = m));
      cases.push({ partner: p, diagnosis });

      const cost = meta ? costUsd(config.model, { inputTokens: meta.inputTokens, outputTokens: meta.outputTokens }) : null;
      if (cost != null) costs.push(cost);

      if (lf) {
        try {
          const trace = lf.trace({ name: "experiment-diagnosis", metadata: { provider, partnerId: p.id } });
          if (meta) {
            const usage = {
              input: meta.inputTokens,
              output: meta.outputTokens,
              unit: "TOKENS" as const,
              ...(cost != null ? { totalCost: cost } : {}),
            };
            trace.generation({ name: `${provider}-diagnosis`, model: config.model, input: meta.input, usage }).end({ output: meta.output, usage });
          }
          trace.update({ output: { rootCause: diagnosis.rootCause, confidence: diagnosis.confidence } });
          const expected = expectedCause(p, config.minReviews);
          trace.score({ name: "label_match", value: diagnosis.rootCause === expected ? 1 : 0 });
          trace.score({ name: "evidence_valid", value: diagnosis.evidenceValid ? 1 : 0 });
          const item = dataset?.items?.find((i: { id: string }) => i.id === `pqr-${p.id}`);
          if (item) await item.link(trace, runName);
        } catch (err) {
          console.warn(`  (langfuse push failed for ${p.id}: ${err instanceof Error ? err.message : String(err)})`);
        }
      }
    }

    const acc = scoreAccuracy(cases, config);
    rows.push({
      provider,
      model: config.model,
      labelMatch: acc.accuracy,
      thinGuard: acc.thinDataGuardPass,
      evidenceValidRate: Number(mean(cases.map((c) => (c.diagnosis.evidenceValid ? 1 : 0))).toFixed(3)),
      avgConfidence: Number(mean(cases.map((c) => c.diagnosis.confidence)).toFixed(3)),
      avgCostUsd: costs.length ? Number((costs.reduce((s, x) => s + x, 0) / cases.length).toFixed(6)) : null,
    });
  }

  if (lf) await lf.flushAsync();

  // ── comparison table ──
  console.log("\n=== Provider flip — golden set (label_match = accuracy vs ground truth, E9) ===\n");
  const head = ["provider", "model", "label_match", "thin_guard", "evidence_valid", "avg_conf", "avg_cost/dx"];
  console.log(head.join("  |  "));
  for (const r of rows) {
    console.log(
      [
        r.provider.padEnd(9),
        r.model.padEnd(28),
        r.labelMatch.toFixed(3),
        r.thinGuard ? "PASS" : "FAIL",
        r.evidenceValidRate.toFixed(3),
        r.avgConfidence.toFixed(3),
        r.avgCostUsd == null ? "n/a" : `$${r.avgCostUsd.toFixed(6)}`,
      ].join("  |  ")
    );
  }
  if (langfuseOn) console.log(`\nRuns published to Langfuse dataset "${DATASET}" as screener-<provider> — open the dataset → Runs to compare.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
