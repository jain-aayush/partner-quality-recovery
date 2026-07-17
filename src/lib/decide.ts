/**
 * System 3 — Decision + gate. Deterministic: maps a diagnosed root cause → intervention via a
 * fixed table, routes by severity track, and gates every income-affecting action to a human.
 * No model output selects an action here (the core governance invariant).
 *
 * Safety is handled first and independently of the diagnosis: grave → immediate platform pause;
 * lesser hygiene → pause only on a 2nd corroborating signal (else held_for_corroboration).
 */

import {
  ActionKind,
  Decision,
  Diagnosis,
  ProblemClass,
  SeverityTrack,
  SkuAggregate,
} from "./model";
import { CAUSE_ACTION, severityTrack, THRESHOLDS } from "./thresholds";

function safetyDecision(row: SkuAggregate): Decision | null {
  if (row.safetyGraveCount > 0) {
    return {
      partnerId: row.partnerId,
      sku: row.sku,
      cause: "none",
      track: "safety",
      actions: ["safety_pause", "offboard"],
      incomeAffecting: true,
      grain: "platform",
      gate: "human_required",
      gateReason: `Grave safety flag — immediate platform-wide pause, fast-track (${THRESHOLDS.safetyFastTrackHours}h) human review.`,
      evidenceQuotes: [],
    };
  }
  if (row.safetyLesserCount >= THRESHOLDS.unfairCorroborationMin) {
    return {
      partnerId: row.partnerId,
      sku: row.sku,
      cause: "none",
      track: "safety",
      actions: ["safety_pause"],
      incomeAffecting: true,
      grain: "platform",
      gate: "human_required",
      gateReason: "Lesser safety (hygiene) corroborated by ≥2 signals — platform pause, human review.",
      evidenceQuotes: [],
    };
  }
  if (row.safetyLesserCount === 1) {
    return {
      partnerId: row.partnerId,
      sku: row.sku,
      cause: "none",
      track: "safety",
      actions: ["do_nothing"],
      incomeAffecting: false,
      grain: null,
      gate: "held_for_corroboration",
      gateReason: "Single lesser safety (hygiene) signal — not paused; awaiting a 2nd corroborating signal so one report can't be weaponized.",
      evidenceQuotes: [],
    };
  }
  return null;
}

/**
 * Decide for one partner × SKU. `diagnosis` supplies the root cause(s); `row` supplies the
 * severity, prevalence, and safety signal. Interventions for a multi-cause partner fire in
 * parallel (one per significant cause).
 */
export function decide(row: SkuAggregate, diagnosis: Diagnosis): Decision {
  // 1. Safety overrides everything.
  const safety = safetyDecision(row);
  if (safety) return safety;

  // 2. Derived unimprovable → platform offboard candidate (human).
  if (diagnosis.primaryCause === "unimprovable") {
    return {
      partnerId: row.partnerId,
      sku: row.sku,
      cause: "unimprovable",
      track: "standard",
      actions: ["offboard"],
      incomeAffecting: true,
      grain: "platform",
      gate: "human_required",
      gateReason: "Unimprovable across a majority of active SKUs — platform offboard candidate; human decides.",
      evidenceQuotes: diagnosis.evidenceQuotes,
    };
  }

  // 3. Below the prevalence bar / no evidence → do nothing, keep monitoring.
  const causes = diagnosis.significantCauses.filter((c) => actionableCause(row, c));
  if (causes.length === 0) {
    return {
      partnerId: row.partnerId,
      sku: row.sku,
      cause: "none",
      track: "standard",
      actions: ["do_nothing"],
      incomeAffecting: false,
      grain: null,
      gate: "auto_approved",
      gateReason: "No issue clears the prevalence bar — monitor; re-evaluate next weekly run.",
      evidenceQuotes: [],
    };
  }

  // 4. Parallel interventions, one per significant cause. Track from the worst issue's severity.
  const worstSeverity = Math.max(
    ...causes.map((c) => row.issues.find((i) => i.problemClass === c)?.severityP50 ?? 1),
  );
  const track: SeverityTrack = severityTrack(worstSeverity, false);

  const actions: ActionKind[] = [];
  let incomeAffecting = false;
  for (const c of causes) {
    if (c === "unfair_review") {
      // Shield only with corroboration; one customer can neither condemn nor clear.
      const raw = row.issues.find((i) => i.problemClass === "unfair_review")?.rawComplaints ?? 0;
      actions.push(raw >= THRESHOLDS.unfairCorroborationMin ? "review_protection" : "do_nothing");
      continue;
    }
    actions.push(CAUSE_ACTION[c].action);
  }
  // Quality-severe: add a concurrent protective per-SKU soft-ban (income-affecting → human).
  if (track === "accelerated") {
    actions.push("protective_soft_ban");
    incomeAffecting = true;
  }

  const gate = gateDecision(diagnosis, incomeAffecting);
  return {
    partnerId: row.partnerId,
    sku: row.sku,
    cause: diagnosis.primaryCause,
    track,
    actions: [...new Set(actions)],
    incomeAffecting,
    grain: incomeAffecting ? "per_sku" : null,
    gate: gate.route,
    gateReason: gate.reason,
    evidenceQuotes: diagnosis.evidenceQuotes,
  };
}

function actionableCause(row: SkuAggregate, cause: ProblemClass): boolean {
  return row.issues.some((i) => i.problemClass === cause && i.actionable);
}

/** Income-affecting → always human. Otherwise supportive auto-approves only at high confidence with evidence. */
function gateDecision(
  diagnosis: Diagnosis,
  incomeAffecting: boolean,
): { route: Decision["gate"]; reason: string } {
  if (incomeAffecting) {
    return { route: "human_required", reason: "Income-affecting action (protective soft-ban) — human approval mandatory before it takes effect." };
  }
  if (diagnosis.primaryCause === "unfair_review") {
    return { route: "human_required", reason: "Unfair-review shield requires human confirmation before protecting the partner." };
  }
  if (!diagnosis.evidenceValid) {
    return { route: "human_required", reason: "Cited evidence could not be verified — routed to a human." };
  }
  if (diagnosis.confidence < THRESHOLDS.confidenceThreshold) {
    return {
      route: "human_required",
      reason: `Diagnosis confidence ${diagnosis.confidence.toFixed(2)} below the ${THRESHOLDS.confidenceThreshold} auto-approve threshold.`,
    };
  }
  return { route: "auto_approved", reason: "Supportive, low-stakes action at high confidence with cited evidence." };
}
