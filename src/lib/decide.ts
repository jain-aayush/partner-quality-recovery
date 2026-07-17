/**
 * System 3 — Decision + gate. Deterministic: maps a diagnosed root cause → intervention via a
 * fixed table, routes by severity track, walks the §1b escalation ladder from persisted
 * per-SKU intervention state, and gates every income-affecting action to a human.
 * No model output selects an action here (the core governance invariant).
 *
 * Safety is handled first and independently of the diagnosis. A grave flag (or corroborated
 * lesser hygiene) executes an IMMEDIATE precautionary pause — `immediateActions`, reversible,
 * not waiting on a queue — while the consequential offboard-vs-exonerate call stays behind the
 * fast-tracked human gate. A single lesser signal is held for corroboration.
 */

import {
  ActionKind,
  Decision,
  Diagnosis,
  LadderState,
  NO_LADDER_HISTORY,
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
      immediateActions: ["safety_pause"],
      actions: ["offboard"],
      incomeAffecting: true,
      grain: "platform",
      gate: "human_required",
      gateReason: `Grave safety flag — precautionary platform-wide pause already in effect (immediate, reversible). Fast-track (${THRESHOLDS.safetyFastTrackHours}h) human review decides offboard vs exonerate.`,
      evidenceQuotes: row.safetyQuotes,
    };
  }
  if (row.safetyLesserCount >= THRESHOLDS.unfairCorroborationMin) {
    return {
      partnerId: row.partnerId,
      sku: row.sku,
      cause: "none",
      track: "safety",
      immediateActions: ["safety_pause"],
      actions: ["offboard"],
      incomeAffecting: true,
      grain: "platform",
      gate: "human_required",
      gateReason: `Lesser safety (hygiene) corroborated by ≥${THRESHOLDS.unfairCorroborationMin} signals — precautionary pause in effect; human decides offboard vs exonerate.`,
      evidenceQuotes: row.safetyQuotes,
    };
  }
  if (row.safetyLesserCount === 1) {
    return {
      partnerId: row.partnerId,
      sku: row.sku,
      cause: "none",
      track: "safety",
      immediateActions: [],
      actions: ["do_nothing"],
      incomeAffecting: false,
      grain: null,
      gate: "held_for_corroboration",
      gateReason: "Single lesser safety (hygiene) signal — not paused; awaiting a 2nd corroborating signal so one report can't be weaponized.",
      evidenceQuotes: row.safetyQuotes,
    };
  }
  return null;
}

/**
 * Decide for one partner × SKU. `diagnosis` supplies the root cause(s); `row` supplies the
 * severity, prevalence, and safety signal; `ladder` supplies where this partner × SKU stands
 * on the §1b escalation ladder (derived from intervention history — never a model output).
 * Interventions for a multi-cause partner fire in parallel (one per significant cause).
 */
export function decide(
  row: SkuAggregate,
  diagnosis: Diagnosis,
  ladder: LadderState = NO_LADDER_HISTORY,
): Decision {
  // 1. Safety overrides everything.
  const safety = safetyDecision(row);
  if (safety) return safety;

  // 2. Refusals are a first-class human-routing condition, never an automated pass:
  //    thin data goes to the analyst back-fill queue (PRD), not to auto-approved "do nothing".
  if (diagnosis.flags.includes("insufficient_evidence")) {
    return {
      partnerId: row.partnerId,
      sku: row.sku,
      cause: "none",
      track: "standard",
      immediateActions: [],
      actions: ["do_nothing"],
      incomeAffecting: false,
      grain: null,
      gate: "human_required",
      gateReason: `Insufficient evidence (${row.reviewCount} review(s) < ${THRESHOLDS.minReviews}) — routed to the analyst back-fill queue; no automated pass on thin data.`,
      evidenceQuotes: [],
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
      immediateActions: [],
      actions: ["do_nothing"],
      incomeAffecting: false,
      grain: null,
      gate: "auto_approved",
      gateReason: "No issue clears the prevalence bar — monitor; re-evaluate next weekly run.",
      evidenceQuotes: [],
    };
  }

  const worstSeverity = Math.max(
    ...causes.map((c) => row.issues.find((i) => i.problemClass === c)?.severityP50 ?? 1),
  );
  const track: SeverityTrack = severityTrack(worstSeverity, false);

  // 4. Escalation ladder (§1b) — only when the monitor scored the last intervention as still
  //    failing. Coaching (≤2 cycles standard, 1 accelerated) → 7d per-SKU soft-bans (≤3 in the
  //    rolling 90d window, 15d re-eval between strikes) → per-SKU hard-ban candidate.
  //    Every rung is income-affecting → human. Never on low_n (no offboard-path on <5 reviews).
  const coachingCap =
    track === "accelerated" ? THRESHOLDS.coachingLoopAccelerated : THRESHOLDS.coachingLoopMax;
  if (ladder.stillFailing && !row.lowN) {
    if (ladder.softBanStrikes >= THRESHOLDS.softBanMax) {
      return {
        partnerId: row.partnerId,
        sku: row.sku,
        cause: diagnosis.primaryCause,
        track,
        immediateActions: [],
        actions: ["hard_ban"],
        incomeAffecting: true,
        grain: "per_sku",
        gate: "human_required",
        gateReason: `${ladder.softBanStrikes} soft-ban strikes within the rolling ${THRESHOLDS.softBanWindowDays}d window and still failing — per-SKU hard-ban candidate (partner keeps every other SKU); human decides.`,
        evidenceQuotes: diagnosis.evidenceQuotes,
      };
    }
    if (ladder.coachingCycles >= coachingCap) {
      const reevalGapDays = THRESHOLDS.softBanDays + THRESHOLDS.softBanReevalDays;
      if (ladder.daysSinceLastSoftBan !== null && ladder.daysSinceLastSoftBan < reevalGapDays) {
        return {
          partnerId: row.partnerId,
          sku: row.sku,
          cause: diagnosis.primaryCause,
          track,
          immediateActions: [],
          actions: ["do_nothing"],
          incomeAffecting: false,
          grain: null,
          gate: "auto_approved",
          gateReason: `Strike ${ladder.softBanStrikes}/${THRESHOLDS.softBanMax} still in its ${THRESHOLDS.softBanReevalDays}d re-evaluation window — no new strike until ${reevalGapDays}d post-ban.`,
          evidenceQuotes: diagnosis.evidenceQuotes,
        };
      }
      return {
        partnerId: row.partnerId,
        sku: row.sku,
        cause: diagnosis.primaryCause,
        track,
        immediateActions: [],
        actions: ["soft_ban"],
        incomeAffecting: true,
        grain: "per_sku",
        gate: "human_required",
        gateReason: `Coaching exhausted (${ladder.coachingCycles}/${coachingCap} cycles) and still failing — ${THRESHOLDS.softBanDays}-day per-SKU soft-ban queued (strike ${ladder.softBanStrikes + 1}/${THRESHOLDS.softBanMax}); takes effect only on human approval.`,
        evidenceQuotes: diagnosis.evidenceQuotes,
      };
    }
    // Coaching capacity remains → fall through to another (final) coaching cycle.
  }

  // 5. Parallel interventions, one per significant cause.
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
    immediateActions: [],
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

/**
 * PRD §5 SLA-timeout bound: when the human queue fully stalls, the ONLY action that may
 * auto-fire is the reversible per-SKU soft-ban. Safety, offboard, hard-ban, and anything
 * platform-grained stay queued indefinitely — they never auto-fire.
 */
export function timeoutAutoAction(decision: Decision): ActionKind | null {
  if (decision.gate !== "human_required") return null;
  if (decision.track === "safety" || decision.grain === "platform") return null;
  if (decision.actions.includes("offboard") || decision.actions.includes("hard_ban")) return null;
  return decision.actions.find((a) => a === "soft_ban" || a === "protective_soft_ban") ?? null;
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
