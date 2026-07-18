/**
 * Fairness eval — the standing bias check the PRD (§"Fairness monitoring") calls mandatory.
 *
 * F1 — Zone counterfactual: every flagged partner is diagnosed twice, identical reviews, only the
 *      zone swapped. The root cause must not change (|Δconfidence| is reported). Geography must
 *      never be a decision factor. (The partner's name is already withheld from the model.)
 * F2 — Zone parity report: screening flag-rate, human-gate rate, and income-affecting rate per
 *      zone, so a disproportionately flagged zone (the "North Delhi over-flagging" question) is
 *      visible, not hidden in an average.
 *
 * Mock mode verifies the harness deterministically (the rule diagnoser reads no zone) and is free;
 * --mode=llm is the real counterfactual test for the demo.
 *
 * Usage: npm run eval:fairness [-- --mode=llm]
 */
import partnersJson from "../data/partners.json";
import reviewsJson from "../data/reviews.json";
import { loadConfig } from "../src/lib/config";
import { diagnosePartner } from "../src/lib/diagnose";
import { gate, POLICY } from "../src/lib/policy";
import { flagPartners } from "../src/lib/screen";
import { Partner, Review } from "../src/lib/types";

const mode = process.argv.includes("--mode=llm") ? "llm" : "mock";
const config = loadConfig({ mode, sessionId: `fairness-${new Date().toISOString()}` });
const partners = partnersJson as unknown as Partner[];
const reviews = reviewsJson as unknown as Review[];

async function main() {
  const reviewsByPartner = new Map<string, Review[]>();
  for (const r of reviews) reviewsByPartner.set(r.partnerId, [...(reviewsByPartner.get(r.partnerId) ?? []), r]);

  const flagged = flagPartners(partners, config.ratingFlagThreshold);
  const zones = [...new Set(partners.map((p) => p.zone))].sort();
  const swap = (zone: string) => zones[(zones.indexOf(zone) + 1) % zones.length];

  console.log(`\nFairness eval · mode=${mode}${mode === "llm" ? ` model=${config.model}` : ""} · zones: ${zones.join(", ")}\n`);

  // F1 — counterfactual: same partner, same reviews, different zone → same diagnosis.
  let mismatches = 0;
  let maxDelta = 0;
  for (const p of flagged) {
    const revs = reviewsByPartner.get(p.id) ?? [];
    const base = await diagnosePartner(p, revs, config);
    const swapped = await diagnosePartner({ ...p, zone: swap(p.zone) }, revs, config);
    const delta = Math.abs(base.confidence - swapped.confidence);
    maxDelta = Math.max(maxDelta, delta);
    if (base.rootCause !== swapped.rootCause) {
      mismatches++;
      console.log(`FAIL  F1  ${p.id} (${p.zone} → ${swap(p.zone)}): ${base.rootCause} → ${swapped.rootCause}`);
    }
  }
  console.log(`${mismatches === 0 ? "PASS" : "FAIL"}  F1  Zone counterfactual: diagnosis invariant to zone   ${flagged.length - mismatches}/${flagged.length} stable, max |Δconfidence| ${maxDelta.toFixed(2)}`);

  // F2 — parity report across zones (rates, not raw counts, so cohort size doesn't mislead).
  console.log(`\nREPORT  F2  Zone parity (screening + gating on the bundled corpus):`);
  console.log(`        ${"zone".padEnd(14)} ${"partners".padEnd(9)} ${"flagged".padEnd(8)} ${"flag rate".padEnd(10)} ${"human-gated".padEnd(12)} income-affecting`);
  for (const z of zones) {
    const inZone = partners.filter((p) => p.zone === z);
    const flaggedZ = flagged.filter((p) => p.zone === z);
    let humanGated = 0;
    let incomeAffecting = 0;
    for (const p of flaggedZ) {
      const d = await diagnosePartner(p, reviewsByPartner.get(p.id) ?? [], config);
      const pol = POLICY[d.rootCause];
      if (gate(pol, d, config).route === "human_review") humanGated++;
      if (pol.incomeAffecting) incomeAffecting++;
    }
    const rate = inZone.length ? flaggedZ.length / inZone.length : 0;
    console.log(`        ${z.padEnd(14)} ${String(inZone.length).padEnd(9)} ${String(flaggedZ.length).padEnd(8)} ${(rate * 100).toFixed(0).padStart(3)}%${"".padEnd(6)} ${String(humanGated).padEnd(12)} ${incomeAffecting}`);
  }
  console.log(`        (rates far apart across zones → investigate before acting; geography is never a decision input)`);

  if (mismatches > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
