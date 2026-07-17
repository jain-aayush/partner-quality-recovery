/**
 * Config & Threshold Registry — single source of truth for every tunable (AI-PRD.md §1a).
 * Env-overridable; defaults are the PRD build values. Pure data + tiny helpers, no I/O
 * beyond reading env at load, so it is safe to import anywhere (mock evals never spend).
 */

import { Band, ProblemClass, SeverityTrack } from "./model";

const num = (env: string | undefined, fallback: number): number => {
  const n = Number(env);
  return Number.isFinite(n) && env !== undefined && env !== "" ? n : fallback;
};

export interface Thresholds {
  // Screening & evidence
  ratingFlag: number;
  minReviews: number;
  confidenceThreshold: number;

  // Customer weighting
  karmaLowTrust: number; // < this → down-weight
  karmaGood: number; // >= this → "good karma" (high-value eligibility)
  highValueMultiplier: number;
  karmaFloor: number; // hard floor on the karma weight

  // Prevalence gate (severity-scaled) — issueRate over the partner's own SKU bookings
  prevalenceStandard: number; // severity 1–3
  prevalenceQualitySevere: number; // severity 4–5
  minComplaints: number; // absolute floor for significance

  // Improvement / monitor
  improvementDrop: number; // >= this fractional drop in issue-rate = improved
  prepostWindowDays: number;
  minBookingsFloor: number; // below → extend window, no strike
  monitorWindowDays: number;

  // Ladder
  coachingLoopMax: number; // standard track
  coachingLoopAccelerated: number; // quality-severe track
  softBanDays: number;
  softBanMax: number; // strikes → per-SKU hard-ban candidate
  softBanWindowDays: number; // rolling window for the strike count
  softBanReevalDays: number;
  offboardMajority: number; // fraction of active SKUs failing → platform offboard

  // Unfair-review corroboration
  unfairCorroborationMin: number; // distinct reviewers before an unfair_review shield

  // Safety
  safetyFastTrackHours: number;

  // Human ops
  qmSlaHours: number;
  qmLeadSlaHours: number;
  appealSlaHours: number;
  increasedScrutinyJobs: number;
  stateResumeMonths: number;
  auditRetentionMonths: number;
}

export const THRESHOLDS: Thresholds = {
  ratingFlag: num(process.env.RATING_FLAG_THRESHOLD, 3.5),
  minReviews: num(process.env.MIN_REVIEWS, 5),
  confidenceThreshold: num(process.env.CONFIDENCE_THRESHOLD, 0.7),

  karmaLowTrust: num(process.env.KARMA_LOW_TRUST, 0.3),
  karmaGood: num(process.env.KARMA_GOOD, 0.7),
  highValueMultiplier: num(process.env.HIGH_VALUE_MULTIPLIER, 1.5),
  karmaFloor: num(process.env.KARMA_FLOOR, 0.1),

  prevalenceStandard: num(process.env.PREVALENCE_STANDARD, 0.15),
  prevalenceQualitySevere: num(process.env.PREVALENCE_QUALITY_SEVERE, 0.07),
  minComplaints: num(process.env.MIN_COMPLAINTS, 3),

  improvementDrop: num(process.env.IMPROVEMENT_DROP, 0.2),
  prepostWindowDays: num(process.env.PREPOST_WINDOW_DAYS, 15),
  minBookingsFloor: num(process.env.MIN_BOOKINGS_FLOOR, 5),
  monitorWindowDays: num(process.env.MONITOR_WINDOW_DAYS, 60),

  coachingLoopMax: num(process.env.COACHING_LOOP_MAX, 2),
  coachingLoopAccelerated: num(process.env.COACHING_LOOP_ACCELERATED, 1),
  softBanDays: num(process.env.SOFTBAN_DURATION_DAYS, 7),
  softBanMax: num(process.env.SOFTBAN_MAX, 3),
  softBanWindowDays: num(process.env.SOFTBAN_WINDOW_DAYS, 90),
  softBanReevalDays: num(process.env.SOFTBAN_REEVAL_DAYS, 15),
  offboardMajority: num(process.env.OFFBOARD_MAJORITY, 0.5),

  unfairCorroborationMin: num(process.env.UNFAIR_CORROBORATION_MIN, 2),

  safetyFastTrackHours: num(process.env.SAFETY_FASTTRACK_HOURS, 6),

  qmSlaHours: num(process.env.QM_SLA_HOURS, 72),
  qmLeadSlaHours: num(process.env.QM_LEAD_SLA_HOURS, 120),
  appealSlaHours: num(process.env.APPEAL_SLA_HOURS, 48),
  increasedScrutinyJobs: num(process.env.INCREASED_SCRUTINY_JOBS, 5),
  stateResumeMonths: num(process.env.STATE_RESUME_MONTHS, 6),
  auditRetentionMonths: num(process.env.AUDIT_RETENTION_MONTHS, 24),
};

/** Per-category order-value bands (₹). Customer blended band lives on the Customer record. */
export const AOV_BANDS_BY_CATEGORY: Record<string, { low: number; high: number }> = {
  grooming: { low: 300, high: 600 },
  beauty: { low: 800, high: 2000 },
  spa: { low: 1200, high: 2800 },
  cleaning: { low: 700, high: 1800 },
  appliance: { low: 500, high: 1200 },
  trades: { low: 300, high: 900 },
  pest: { low: 1000, high: 2500 },
  painting: { low: 8000, high: 25000 },
};

export function aovBand(category: string, orderValue: number): Band {
  const b = AOV_BANDS_BY_CATEGORY[category] ?? AOV_BANDS_BY_CATEGORY.beauty;
  return orderValue < b.low ? "low" : orderValue > b.high ? "high" : "medium";
}

/** Numeric severity → track: 4–5 (non-safety) is quality-severe, else standard. Safety is set separately. */
export function severityTrack(severity: number, safetyFlag: boolean): SeverityTrack {
  if (safetyFlag) return "safety";
  return severity >= 4 ? "accelerated" : "standard";
}

/** Prevalence bar for an issue, scaled by its aggregated severity. */
export function prevalenceBar(severityP50: number): number {
  return severityP50 >= 4 ? THRESHOLDS.prevalenceQualitySevere : THRESHOLDS.prevalenceStandard;
}

/**
 * A review's contribution weight from reviewer trust, tiered so the prevalence bar stays
 * interpretable: a normal-trust reviewer counts 1.0, a high-value reviewer ×1.5, and only a
 * low-trust reviewer (< KARMA_LOW_TRUST) is down-weighted toward its karma (hard floor).
 */
export function reviewWeight(karma: number, highValue: boolean): number {
  if (highValue) return THRESHOLDS.highValueMultiplier;
  if (karma < THRESHOLDS.karmaLowTrust) return Math.max(THRESHOLDS.karmaFloor, karma);
  return 1;
}

export const isHighValue = (karma: number, aovBand: Band): boolean =>
  aovBand === "high" && karma >= THRESHOLDS.karmaGood;

/** An issue is actionable iff it clears the (severity-scaled) prevalence bar AND the min-complaints floor. */
export function isActionable(issueRate: number, rawComplaints: number, severityP50: number): boolean {
  return issueRate >= prevalenceBar(severityP50) && rawComplaints >= THRESHOLDS.minComplaints;
}

/** Intervention type per root cause (System 3 deterministic table — never a model output). */
export const CAUSE_ACTION: Record<ProblemClass, {
  action: import("./model").ActionKind;
  incomeAffecting: boolean;
}> = {
  skill_issue: { action: "skill_training", incomeAffecting: false },
  time: { action: "warning_scrutiny", incomeAffecting: false },
  partner_attitude: { action: "warning_scrutiny", incomeAffecting: false },
  undisclosed_supplies: { action: "supply_kit", incomeAffecting: false },
  unfair_review: { action: "review_protection", incomeAffecting: false },
  pricing: { action: "do_nothing", incomeAffecting: false }, // target is UC/pricing, not the partner
  out_of_taxonomy: { action: "do_nothing", incomeAffecting: false }, // human triage, no partner action
};
