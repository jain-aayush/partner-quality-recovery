/**
 * System 2 — Aggregation + prevalence gate. Non-agentic, fully deterministic.
 * Rolls tagged reviews up to Partner × SKU, computes the booking-denominated, karma-weighted
 * `issueRate` per problem class, and marks which issues clear the prevalence bar (the action
 * trigger). Reviews whose target ≠ partner are excluded from the quality signal (safety aside).
 */

import {
  IssueStat,
  isGraveSafety,
  ProblemClass,
  PROBLEM_CLASSES,
  Review,
  ReviewTag,
  SkuAggregate,
} from "./model";
import { isActionable, reviewWeight, THRESHOLDS } from "./thresholds";

export interface TaggedReview {
  review: Review;
  tag: ReviewTag;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Bookings this partner served for this SKU in the window — the prevalence denominator. */
export type BookingsLookup = (partnerId: string, sku: string) => number;

export function aggregate(
  items: TaggedReview[],
  bookings: BookingsLookup,
  zoneOf: (partnerId: string) => string,
): SkuAggregate[] {
  const groups = new Map<string, TaggedReview[]>();
  for (const it of items) {
    const key = `${it.tag.partnerId}|${it.tag.sku}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
  }

  const rows: SkuAggregate[] = [];
  for (const [key, group] of groups) {
    const [partnerId, sku] = key.split("|");
    const bookingsCount = Math.max(0, bookings(partnerId, sku));
    const reviewCount = group.length;
    const avgRating = group.reduce((s, g) => s + g.review.rating, 0) / reviewCount;

    // Quality signal excludes reviews not about the partner (TARGET_EXCLUSION) — but an
    // `unfair_review` (target = customer_self) is a protective signal we must still aggregate,
    // so the system can shield the partner rather than silently drop it.
    const partnerNeg = group.filter(
      (g) =>
        g.tag.sentiment === "negative" &&
        (g.tag.target === "partner" || g.tag.problemClasses.includes("unfair_review")),
    );

    const issues: IssueStat[] = [];
    const problemMix: Partial<Record<ProblemClass, number>> = {};
    let totalComplaints = 0;

    for (const cls of PROBLEM_CLASSES) {
      // Pricing is never a partner-quality issue — a mixed review keeps its partner classes
      // (skill/time/…) counted here while the pricing gripe stays off the partner's record.
      if (cls === "pricing") continue;
      // A customer-self review contributes ONLY its protective unfair_review signal. Its other
      // mentions ("…but it's still patchy") must not raise the partner's issue rates — the same
      // evidence cannot both shield the partner and push her toward training (FM1).
      const hits = partnerNeg.filter(
        (g) =>
          g.tag.problemClasses.includes(cls) &&
          (g.tag.target !== "customer_self" || cls === "unfair_review"),
      );
      if (hits.length === 0) continue;
      totalComplaints += hits.length;
      const weighted = hits.reduce(
        (s, g) => s + reviewWeight(g.tag.customer.karma, g.tag.customer.highValue),
        0,
      );
      const severities = hits.map((g) => g.tag.severity);
      const severityP50 = median(severities);
      const issueRate = bookingsCount > 0 ? weighted / bookingsCount : 0;
      issues.push({
        problemClass: cls,
        rawComplaints: hits.length,
        weightedComplaints: Number(weighted.toFixed(2)),
        issueRate: Number(issueRate.toFixed(4)),
        severityP50,
        severityMax: Math.max(...severities),
        actionable: isActionable(issueRate, hits.length, severityP50),
      });
    }
    for (const iss of issues) problemMix[iss.problemClass] = Number((iss.rawComplaints / totalComplaints).toFixed(2));

    const safetyTags = group.filter((g) => g.tag.safetyFlag);
    const safetyQuotes = [...new Set(safetyTags.flatMap((g) => g.tag.evidenceQuotes.slice(0, 1)))].slice(0, 3);
    rows.push({
      partnerId,
      sku,
      zone: zoneOf(partnerId),
      bookingsCount,
      reviewCount,
      avgRating: Number(avgRating.toFixed(2)),
      issues,
      problemMix,
      safetyGraveCount: safetyTags.filter((g) => isGraveSafety(g.tag.safetySubtype)).length,
      safetyLesserCount: safetyTags.filter((g) => !isGraveSafety(g.tag.safetySubtype)).length,
      safetyQuotes,
      highValueComplaints: partnerNeg.filter((g) => g.tag.customer.highValue).length,
      lowTrustComplaints: partnerNeg.filter((g) => g.tag.customer.karma < THRESHOLDS.karmaLowTrust).length,
      cohortPctile: 0, // filled in below
      lowN: reviewCount < THRESHOLDS.minReviews,
    });
  }

  // Cohort-relative percentile within same SKU × zone (0 = worst rating in the peer group).
  const byCohort = new Map<string, SkuAggregate[]>();
  for (const r of rows) {
    const k = `${r.sku}|${r.zone}`;
    (byCohort.get(k) ?? byCohort.set(k, []).get(k)!).push(r);
  }
  for (const peers of byCohort.values()) {
    for (const r of peers) {
      if (peers.length === 1) {
        r.cohortPctile = 0.5;
        continue;
      }
      const below = peers.filter((p) => p.avgRating < r.avgRating).length;
      r.cohortPctile = Number((below / (peers.length - 1)).toFixed(2));
    }
  }

  return rows;
}

/** Actionable, non-safety issues on a row (the tuples System 2.5/3 will diagnose and act on). */
export function actionableIssues(row: SkuAggregate): IssueStat[] {
  return row.issues.filter((i) => i.actionable);
}

/** True when the row warrants attention at all — an actionable issue or any safety signal. */
export function needsAttention(row: SkuAggregate): boolean {
  return (
    actionableIssues(row).length > 0 ||
    row.safetyGraveCount > 0 ||
    row.safetyLesserCount >= THRESHOLDS.unfairCorroborationMin
  );
}
