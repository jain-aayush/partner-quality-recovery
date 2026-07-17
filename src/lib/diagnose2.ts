/**
 * System 2.5 — Diagnosis Agent (mock). Per partner × SKU, reasons over the aggregated signal +
 * the tagged review evidence to form a root-cause hypothesis. Deterministic mock (default for
 * demos/evals); an LLM agent slots behind the same `diagnoseSku` signature later.
 *
 * It proposes diagnoses only — it never selects an action (that is System 3). Ground truth is
 * never in scope here: it reads SkuAggregate + ReviewTags, which carry no hidden labels.
 */

import { Diagnosis, DiagnosisFlag, ProblemClass, ReviewTag, SkuAggregate } from "./model";
import { THRESHOLDS } from "./thresholds";

/** Evidence for a cause, drawn verbatim from the tags for this partner × SKU. */
function evidenceFor(cause: ProblemClass, tags: ReviewTag[]): string[] {
  const quotes: string[] = [];
  for (const t of tags) {
    if (t.target === "partner" && t.problemClasses.includes(cause)) quotes.push(...t.evidenceQuotes);
  }
  return [...new Set(quotes)].slice(0, 3);
}

export function diagnoseSku(row: SkuAggregate, tags: ReviewTag[]): Diagnosis {
  const base = { partnerId: row.partnerId, sku: row.sku };

  // Thin data — refuse to guess.
  if (row.lowN) {
    return {
      ...base,
      primaryCause: "out_of_taxonomy",
      significantCauses: [],
      evidenceQuotes: [],
      confidence: 1,
      alternativesConsidered: [],
      reasoning: `Only ${row.reviewCount} review(s), below the minimum of ${THRESHOLDS.minReviews}. No diagnosis.`,
      flags: ["insufficient_evidence", "needs_human"],
      evidenceValid: true,
    };
  }

  const ranked = [...row.issues].sort((a, b) => b.weightedComplaints - a.weightedComplaints);
  const actionable = ranked.filter((i) => i.actionable);

  // Nothing clears the prevalence bar → dominant issue named for context, but nothing to act on.
  if (actionable.length === 0) {
    const dominant = ranked[0];
    return {
      ...base,
      primaryCause: dominant?.problemClass ?? "out_of_taxonomy",
      significantCauses: [],
      evidenceQuotes: dominant ? evidenceFor(dominant.problemClass, tags) : [],
      confidence: 0.4,
      alternativesConsidered: [],
      reasoning: dominant
        ? `Dominant signal is ${dominant.problemClass} at ${(dominant.issueRate * 100).toFixed(1)}% of bookings — below the prevalence bar. Monitor.`
        : "No partner-attributable complaint signal.",
      flags: [],
      evidenceValid: true,
    };
  }

  const primary = actionable[0];
  const significantCauses = actionable.map((i) => i.problemClass);
  const evidenceQuotes = evidenceFor(primary.problemClass, tags);

  const top = primary.weightedComplaints;
  const second = actionable[1]?.weightedComplaints ?? 0;
  const confidence =
    Math.round(
      Math.min(0.95, (0.5 + 0.45 * ((top - second) / Math.max(top, 1))) * Math.min(1, top / 3)) * 100,
    ) / 100;

  const flags: DiagnosisFlag[] = [];
  if (actionable.length > 1 && second / Math.max(top, 1) > 0.7) flags.push("conflicting_signal");
  if (evidenceQuotes.length === 0) flags.push("needs_human");

  const alternativesConsidered: string[] = [];
  const unfair = row.issues.find((i) => i.problemClass === "unfair_review");
  if (unfair && unfair.rawComplaints < THRESHOLDS.unfairCorroborationMin) {
    alternativesConsidered.push(`unfair_review (rejected: only ${unfair.rawComplaints} reviewer(s), needs ${THRESHOLDS.unfairCorroborationMin})`);
  }
  if (actionable[1]) alternativesConsidered.push(`${actionable[1].problemClass} (secondary — also actionable)`);

  return {
    ...base,
    primaryCause: primary.problemClass,
    significantCauses,
    evidenceQuotes,
    confidence: evidenceQuotes.length === 0 ? Math.min(confidence, 0.5) : confidence,
    alternativesConsidered,
    reasoning: `${primary.rawComplaints} complaint(s) at ${(primary.issueRate * 100).toFixed(1)}% of this partner's ${row.sku} bookings clear the prevalence bar for ${primary.problemClass}${
      significantCauses.length > 1 ? `; also ${significantCauses.slice(1).join(", ")}` : ""
    }.`,
    flags,
    evidenceValid: evidenceQuotes.length > 0,
  };
}
