/**
 * Stability eval — are repeated diagnoses consistent enough for operational use?
 * Diagnoses every flagged partner N times (default 3) and checks agreement with the per-partner
 * modal root cause; reports the confidence spread. Categories must agree ≥ 90% overall.
 *
 * Mock mode is deterministic (verifies the harness, free). The real check is --mode=llm before a
 * release/demo: ~15 partners × N runs on a Haiku-class model — cents, not dollars.
 *
 * Usage: npm run eval:stability [-- --mode=llm --runs=5]
 */
import partnersJson from "../data/partners.json";
import reviewsJson from "../data/reviews.json";
import { loadConfig } from "../src/lib/config";
import { diagnosePartner } from "../src/lib/diagnose";
import { flagPartners } from "../src/lib/screen";
import { Partner, Review } from "../src/lib/types";

const mode = process.argv.includes("--mode=llm") ? "llm" : "mock";
const runsArg = process.argv.find((a) => a.startsWith("--runs="));
const RUNS = Math.max(2, runsArg ? parseInt(runsArg.split("=")[1], 10) || 3 : 3);
const AGREEMENT_BAR = 0.9;
const config = loadConfig({ mode, sessionId: `stability-${new Date().toISOString()}` });
const partners = partnersJson as unknown as Partner[];
const reviews = reviewsJson as unknown as Review[];

async function main() {
  const reviewsByPartner = new Map<string, Review[]>();
  for (const r of reviews) reviewsByPartner.set(r.partnerId, [...(reviewsByPartner.get(r.partnerId) ?? []), r]);
  const flagged = flagPartners(partners, config.ratingFlagThreshold);

  console.log(`\nStability eval · mode=${mode}${mode === "llm" ? ` model=${config.model}` : ""} · ${RUNS} runs × ${flagged.length} partners\n`);

  let agreeing = 0;
  let total = 0;
  for (const p of flagged) {
    const revs = reviewsByPartner.get(p.id) ?? [];
    const results = [];
    for (let i = 0; i < RUNS; i++) results.push(await diagnosePartner(p, revs, config));
    const counts = new Map<string, number>();
    for (const d of results) counts.set(d.rootCause, (counts.get(d.rootCause) ?? 0) + 1);
    const [modal, modalN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const confs = results.map((d) => d.confidence);
    const spread = Math.max(...confs) - Math.min(...confs);
    agreeing += modalN;
    total += RUNS;
    const flaky = modalN < RUNS;
    console.log(`${flaky ? "VARY" : "  ok"}  ${p.id}  ${modal.padEnd(22)} ${modalN}/${RUNS} agree · confidence ${Math.min(...confs).toFixed(2)}–${Math.max(...confs).toFixed(2)} (spread ${spread.toFixed(2)})${flaky ? ` · also saw: ${[...counts.keys()].filter((c) => c !== modal).join(", ")}` : ""}`);
  }

  const agreement = agreeing / total;
  const pass = agreement >= AGREEMENT_BAR;
  console.log(`\n${pass ? "PASS" : "FAIL"}  Modal-category agreement ${(agreement * 100).toFixed(1)}% (bar ${AGREEMENT_BAR * 100}%)`);
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
