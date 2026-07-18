import { AccuracyReport, Config, Diagnosis, Partner, RootCause } from "./types";

/**
 * The label a correct diagnoser should produce for a partner — thin-data partners are expected
 * to refuse (insufficient_evidence), everyone else to match the hidden trueCause. This is the
 * ONLY sanctioned read of trueCause outside simulate.ts; scorers and dataset seeders import it
 * rather than touching ground truth themselves.
 */
export function expectedCause(partner: Partner, minReviews: number): RootCause {
  return partner.reviewCount < minReviews
    ? "insufficient_evidence"
    : (partner.trueCause as RootCause);
}

/**
 * Scores diagnoses against the hidden ground truth AFTER the fact — the labels never
 * enter a diagnosis. Thin-data partners are expected to yield insufficient_evidence.
 */
export function scoreAccuracy(
  cases: { partner: Partner; diagnosis: Diagnosis }[],
  config: Config
): AccuracyReport {
  const perCause: AccuracyReport["perCause"] = {};
  const misses: AccuracyReport["misses"] = [];
  let correct = 0;

  for (const c of cases) {
    const expected: RootCause = expectedCause(c.partner, config.minReviews);
    perCause[expected] ??= { correct: 0, total: 0 };
    perCause[expected].total += 1;
    if (c.diagnosis.rootCause === expected) {
      correct += 1;
      perCause[expected].correct += 1;
    } else {
      misses.push({ partnerId: c.partner.id, expected, got: c.diagnosis.rootCause });
    }
  }

  const thin = cases.filter((c) => c.partner.reviewCount < config.minReviews);
  return {
    total: cases.length,
    correct,
    accuracy: cases.length ? Math.round((correct / cases.length) * 1000) / 1000 : 0,
    perCause,
    thinDataGuardPass: thin.every((c) => c.diagnosis.rootCause === "insufficient_evidence"),
    misses,
  };
}
