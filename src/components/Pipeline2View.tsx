"use client";

/**
 * Quality-manager console — plain-language, tabbed, decision-first. Anyone can open it and know
 * what needs their call, why, and act on it. Data comes from /api/pipeline2.
 */

import { useMemo, useState } from "react";
import type { CaseReview, Decision, Diagnosis, ExcludedSummary, Progress, ProgressStatus, SkuAggregate, WeekBucket } from "../lib/model";

export interface SkuCase {
  row: SkuAggregate; diagnosis: Diagnosis; decision: Decision;
  weekly: WeekBucket[]; complaints: CaseReview[]; excluded: ExcludedSummary; priorCoached: boolean;
}
export interface PartnerRollup {
  partnerId: string; name: string; zone: string; avgRating: number;
  activeSkus: number; failingSkus: number; unimprovable: boolean;
}
export interface Pipeline2Response { cases: SkuCase[]; partners: PartnerRollup[]; progress?: Progress[]; config?: Record<string, number>; source?: string; rowCount?: number; issues?: string[]; backfillCount?: number }

type Choice = "approved" | "rejected" | "info";
type Tone = "red" | "amber" | "green" | "purple" | "info" | "gray";

const TONE: Record<Tone, { chip: string; bar: string; strip: string }> = {
  red: { chip: "bg-[var(--bad-tint)] text-[var(--bad)]", bar: "bg-[var(--bad)]", strip: "bg-[var(--bad)]" },
  amber: { chip: "bg-[var(--warn-tint)] text-[var(--warn)]", bar: "bg-[var(--warn)]", strip: "bg-[var(--warn)]" },
  green: { chip: "bg-[var(--good-tint)] text-[var(--good)]", bar: "bg-[var(--good)]", strip: "bg-[var(--good)]" },
  purple: { chip: "bg-[var(--brand-tint)] text-[var(--brand-deep)]", bar: "bg-[var(--brand)]", strip: "bg-[var(--brand)]" },
  info: { chip: "bg-[var(--info-tint)] text-[var(--info)]", bar: "bg-[var(--info)]", strip: "bg-[var(--info)]" },
  gray: { chip: "bg-[var(--page)] text-[var(--ink-2)]", bar: "bg-[var(--ink-3)]", strip: "bg-[var(--line)]" },
};

const CAUSE: Record<string, { label: string; icon: string }> = {
  skill_issue: { label: "Skill gap", icon: "🎯" },
  time: { label: "Rushing jobs", icon: "⏱️" },
  partner_attitude: { label: "Attitude", icon: "😟" },
  undisclosed_supplies: { label: "Cheap supplies", icon: "🧴" },
  unfair_review: { label: "Possibly unfair reviews", icon: "⚖️" },
  unimprovable: { label: "Consistently poor", icon: "🚫" },
  pricing: { label: "Pricing (not the partner)", icon: "💸" },
  out_of_taxonomy: { label: "Uncategorised — read the reviews", icon: "❓" },
  none: { label: "Safety issue", icon: "⚠️" },
};
const ACTION: Record<string, string> = {
  skill_training: "Free training", warning_scrutiny: "Warning + watch", supply_kit: "Supply kit",
  review_protection: "Shield from unfair reviews", protective_soft_ban: "7-day pause (this service)",
  soft_ban: "7-day pause", hard_ban: "Remove from this service", offboard: "Remove from platform",
  safety_pause: "Pause now — safety", do_nothing: "Keep watching",
};

/** Priority bucket the QM reads at a glance. */
function bucket(c: SkuCase): { tone: Tone; label: string } {
  const d = c.decision;
  if (d.immediateActions.includes("safety_pause")) return { tone: "red", label: "Safety — paused, your call" };
  if (d.track === "safety" && d.gate === "held_for_corroboration") return { tone: "gray", label: "Waiting for 2nd report" };
  if (d.actions.includes("offboard") || d.actions.includes("hard_ban") || d.cause === "unimprovable") return { tone: "red", label: "Consider removing" };
  if (d.incomeAffecting) return { tone: "amber", label: "Affects earnings" };
  if (d.actions.includes("review_protection")) return { tone: "info", label: "Protect the partner" };
  if (d.gate === "held_for_corroboration") return { tone: "gray", label: "Waiting for 2nd report" };
  return { tone: "info", label: "Routine" };
}
const key = (c: SkuCase) => `${c.row.partnerId}|${c.row.sku}`;
const nameOf = (ps: PartnerRollup[], id: string) => ps.find((p) => p.partnerId === id)?.name ?? id;

function Stars({ r }: { r: number }) {
  return <span className="text-[var(--warn)]">{"★".repeat(Math.round(r))}<span className="text-[var(--line)]">{"★".repeat(5 - Math.round(r))}</span></span>;
}
function Chip({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE[tone].chip}`}>{children}</span>;
}
function Bar({ rate, tone }: { rate: number; tone: Tone }) {
  const pct = Math.min(100, (rate / 0.3) * 100);
  return <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--line)]"><div className={`h-full rounded-full ${TONE[tone].bar}`} style={{ width: `${pct}%` }} /></div>;
}

const SAFETY_LABEL: Record<string, string> = { injury: "Injury", harassment: "Harassment", theft: "Theft", hygiene: "Hygiene" };

// Week-over-week: counted complaints out of jobs, one bar per 7-day bucket in the decision window.
function WeekStrip({ weekly, tone }: { weekly: WeekBucket[]; tone: Tone }) {
  if (weekly.length === 0) return null;
  const max = Math.max(0.0001, ...weekly.map((w) => w.rate));
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--ink-3)]">Week by week — complaints / jobs</div>
      <div className="flex items-end gap-1.5">
        {weekly.map((w, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-[var(--ink-2)]">{w.complaints}/{w.bookings}</span>
            <div className="flex h-9 w-full items-end overflow-hidden rounded bg-[var(--page)]" title={`${w.label}: ${w.complaints} of ${w.bookings} jobs (${Math.round(w.rate * 100)}%)`}>
              <div className={`w-full ${TONE[tone].bar}`} style={{ height: `${Math.max(8, (w.rate / max) * 100)}%` }} />
            </div>
            <span className="text-[10px] text-[var(--ink-3)]">{w.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Read every counted review verbatim, with how each one was weighted, plus a tally of what was set aside.
function ReviewList({ complaints, excluded }: { complaints: CaseReview[]; excluded: ExcludedSummary }) {
  const n = complaints.length;
  const hasExcluded = excluded.offTarget > 0 || excluded.lowSignal > 0 || excluded.quarantined > 0;
  if (n === 0 && !hasExcluded) return null;
  return (
    <details className="mt-3 rounded-xl bg-[var(--page)] p-3">
      <summary className="cursor-pointer select-none text-[12px] font-bold text-[var(--ink-2)]">📄 Read all {n} counted review{n === 1 ? "" : "s"}</summary>
      <div className="mt-2 space-y-2">
        {complaints.map((r, i) => (
          <div key={i} className="rounded-lg bg-white p-2.5">
            <div className="flex items-center justify-between gap-2">
              <Stars r={r.rating} />
              <span className="text-[10px] text-[var(--ink-3)]">{r.date} · severity {r.severity}/5</span>
            </div>
            <p className="mt-1 text-[12px] italic text-[var(--ink-2)]">&ldquo;{r.text}&rdquo;</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {r.safetySubtype && <Chip tone="red">⚠ {SAFETY_LABEL[r.safetySubtype] ?? r.safetySubtype}</Chip>}
              {r.problemClasses.filter((pc) => pc !== "out_of_taxonomy").map((pc) => <Chip key={pc} tone="gray">{CAUSE[pc]?.label ?? pc}</Chip>)}
              {r.problemClasses.includes("out_of_taxonomy") && <Chip tone="gray">Other — see text</Chip>}
              {r.lowTrust && <Chip tone="gray">⤓ low-trust · counted ×{r.weight}</Chip>}
              {r.highValue && <Chip tone="green">★ valued · counted ×{r.weight}</Chip>}
            </div>
          </div>
        ))}
        {hasExcluded && (
          <p className="pt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
            {excluded.offTarget > 0 && <>{excluded.offTarget} review{excluded.offTarget === 1 ? " was" : "s were"} about pricing or the app — <b>not counted</b> against the partner. </>}
            {excluded.lowSignal > 0 && <>{excluded.lowSignal} rating-only or neutral review{excluded.lowSignal === 1 ? "" : "s"} carried no usable complaint. </>}
            {excluded.quarantined > 0 && <>{excluded.quarantined} review{excluded.quarantined === 1 ? "" : "s"} blocked as <b>prompt-injection</b> attempt{excluded.quarantined === 1 ? "" : "s"}.</>}
          </p>
        )}
      </div>
    </details>
  );
}

// ── decision card ─────────────────────────────────────────────────────────────
function DecisionCard({ c, ps, cfg, decided, draft, onDraft, onDecide }: {
  c: SkuCase; ps: PartnerRollup[]; cfg?: Record<string, number>;
  decided?: { choice: Choice; note: string }; draft: string; onDraft: (v: string) => void; onDecide: (ch: Choice) => void;
}) {
  const { row, diagnosis, decision } = c;
  const b = bucket(c);
  const issue = row.issues.find((i) => i.problemClass === decision.cause);
  const cause = CAUSE[decision.cause] ?? CAUSE.none;
  const held = decision.gate === "held_for_corroboration";
  const isSafety = decision.track === "safety";
  const slaHrs = b.tone === "red" && isSafety ? (cfg?.safetyFastTrackHours ?? 6) : (cfg?.qmSlaHours ?? 72);
  const canSubmit = draft.trim().length >= 8;
  // out_of_taxonomy carries no keyword evidence — fall back to the verbatim complaint text as its summary.
  const summaryQuotes = diagnosis.evidenceQuotes.length > 0 ? diagnosis.evidenceQuotes.slice(0, 2) : c.complaints.slice(0, 2).map((r) => r.text);

  return (
    <div className="uc-card flex overflow-hidden">
      <div className={`w-1.5 shrink-0 ${TONE[b.tone].strip}`} />
      <div className="flex-1 p-4">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-extrabold">{nameOf(ps, row.partnerId)}</span>
            <Chip tone="purple">{row.sku}</Chip>
            <span className="text-[12px] text-[var(--ink-3)]">{row.zone}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {c.priorCoached && <Chip tone="amber">↻ Coached before</Chip>}
            <Chip tone={b.tone}>{b.label}</Chip>
            {!held && <span className="text-[11px] font-semibold text-[var(--ink-3)]">⏱ {slaHrs}h</span>}
          </div>
        </div>

        {/* the problem, in plain words + how common */}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[22px]">{cause.icon}</span>
          <div className="flex-1">
            <div className="text-[14px] font-bold">{cause.label}</div>
            {issue && (
              <div className="mt-1 flex items-center gap-2">
                <div className="w-32"><Bar rate={issue.issueRate} tone={b.tone} /></div>
                <span className="text-[12px] text-[var(--ink-2)]">
                  <b className="text-[var(--ink)]">{(issue.issueRate * 100).toFixed(0)}%</b> of her {row.sku.toLowerCase()} jobs · {issue.rawComplaints} complaints
                </span>
              </div>
            )}
          </div>
        </div>

        {/* customer trust signal (only if notable) */}
        {(row.highValueComplaints > 0 || row.lowTrustComplaints > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.highValueComplaints > 0 && <Chip tone="green">★ {row.highValueComplaints} from valued customers</Chip>}
            {row.lowTrustComplaints > 0 && <Chip tone="gray">⤓ {row.lowTrustComplaints} low-trust (counted less)</Chip>}
          </div>
        )}

        {/* decision-support context — severity spread, confidence, peer standing (quality cases only) */}
        {!isSafety && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--ink-3)]">
            {issue && <span>severity <b className="text-[var(--ink-2)]">{issue.severityP50}/5</b>{issue.severityMax > issue.severityP50 ? ` (up to ${issue.severityMax})` : ""}</span>}
            <span>confidence <b className="text-[var(--ink-2)]">{Math.round(diagnosis.confidence * 100)}%</b></span>
            <span>{row.sku.toLowerCase()} peers nearby: better than <b className="text-[var(--ink-2)]">{Math.round(row.cohortPctile * 100)}%</b></span>
          </div>
        )}

        {/* why — the diagnosis reasoning + what was ruled out */}
        {!isSafety && (
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
            {diagnosis.reasoning}
            {diagnosis.alternativesConsidered.length > 0 && <> · Ruled out: {diagnosis.alternativesConsidered.join("; ")}</>}
          </p>
        )}

        {/* week-over-week complaints / jobs */}
        <WeekStrip weekly={c.weekly} tone={b.tone} />

        {/* evidence — verbatim (out_of_taxonomy falls back to the complaint text) */}
        {summaryQuotes.length > 0 && (
          <div className="mt-3 space-y-1 rounded-xl bg-[var(--page)] p-3">
            {summaryQuotes.map((q, i) => (
              <p key={i} className="text-[12px] italic text-[var(--ink-2)]">&ldquo;{q}&rdquo;</p>
            ))}
          </div>
        )}

        {/* read every counted review + what was set aside */}
        <ReviewList complaints={c.complaints} excluded={c.excluded} />

        {/* already executed — the immediate, reversible precaution (safety only) */}
        {decision.immediateActions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--bad-tint)] px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--bad)]">Already done</span>
            {decision.immediateActions.map((a) => <Chip key={a} tone="red">{ACTION[a] ?? a}</Chip>)}
            <span className="text-[11px] text-[var(--ink-2)]">Precautionary and reversible — she is not taking bookings while you decide.</span>
          </div>
        )}

        {/* recommendation */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-3)]">{decision.immediateActions.length > 0 ? "Your decision" : "We suggest"}</span>
          {decision.actions.map((a) => <Chip key={a} tone="purple">{ACTION[a] ?? a}</Chip>)}
        </div>

        {/* decision */}
        {held ? (
          <p className="mt-3 rounded-xl bg-[var(--page)] px-3 py-2 text-[12px] text-[var(--ink-2)]">Just one report so far — we wait for a second before pausing, so a single complaint can&apos;t knock her offline unfairly.</p>
        ) : decided ? (
          <div className={`mt-3 rounded-xl px-3 py-2 text-[12px] font-semibold ${decided.choice === "approved" ? "bg-[var(--good-tint)] text-[var(--good)]" : decided.choice === "rejected" ? "bg-[var(--bad-tint)] text-[var(--bad)]" : "bg-[var(--warn-tint)] text-[var(--warn)]"}`}>
            {decided.choice === "approved" ? "✓ Approved by you" : decided.choice === "rejected" ? "✗ Rejected by you" : "↩ Sent back for more info"} — logged
            <div className="mt-0.5 font-normal italic text-[var(--ink-2)]">&ldquo;{decided.note}&rdquo;</div>
          </div>
        ) : (
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <input value={draft} onChange={(e) => onDraft(e.target.value)} placeholder="Why? (one line — saved with your decision)"
              className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[12px] outline-none focus:border-[var(--brand)]" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button disabled={!canSubmit} onClick={() => onDecide("approved")} className="rounded-lg bg-[var(--good)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">✓ Approve</button>
              <button disabled={!canSubmit} onClick={() => onDecide("rejected")} className="rounded-lg bg-[var(--bad)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">✗ Reject</button>
              <button disabled={!canSubmit} onClick={() => onDecide("info")} className="rounded-lg border border-[var(--line)] px-4 py-2 text-[13px] font-bold text-[var(--ink-2)] disabled:opacity-40">More info</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── partner breakdown ─────────────────────────────────────────────────────────
function PartnerRow({ p, cases }: { p: PartnerRollup; cases: SkuCase[] }) {
  return (
    <div className="uc-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-extrabold">{p.name}</div>
          <div className="text-[12px] text-[var(--ink-3)]"><Stars r={p.avgRating} /> {p.avgRating.toFixed(2)} · {p.zone}</div>
        </div>
        {p.unimprovable
          ? <Chip tone="red">🚫 Failing {p.failingSkus}/{p.activeSkus} services — consider removing</Chip>
          : <Chip tone="amber">{p.failingSkus} of {p.activeSkus} services need action</Chip>}
      </div>
      <div className="mt-3 space-y-1.5">
        {cases.map((c) => {
          const dom = [...c.row.issues].sort((a, b) => b.weightedComplaints - a.weightedComplaints)[0];
          const safety = c.row.safetyGraveCount + c.row.safetyLesserCount > 0;
          const status: { tone: Tone; label: string } = safety
            ? { tone: "red", label: "safety" }
            : !c.decision.actions.includes("do_nothing")
              ? { tone: "amber", label: "needs action" }
              : c.row.issues.length > 0 ? { tone: "info", label: "watching" } : { tone: "green", label: "healthy" };
          return (
            <div key={c.row.sku} className="flex items-center gap-3 rounded-lg bg-[var(--page)] px-3 py-2">
              <span className="w-28 shrink-0 text-[13px] font-semibold">{c.row.sku}</span>
              <div className="hidden w-24 sm:block"><Bar rate={dom?.issueRate ?? 0} tone={status.tone} /></div>
              <span className="flex-1 text-[12px] text-[var(--ink-2)]">
                {safety ? "safety flag" : dom ? `${CAUSE[dom.problemClass]?.label ?? dom.problemClass} · ${(dom.issueRate * 100).toFixed(0)}%` : "no complaints"}
                <span className="text-[var(--ink-3)]"> · {c.row.bookingsCount} jobs</span>
              </span>
              <Chip tone={status.tone}>{status.label}</Chip>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── progress / in-training card ────────────────────────────────────────────────
const PSTATUS: Record<ProgressStatus, { tone: Tone; label: string }> = {
  recovered: { tone: "green", label: "Recovered ✓" },
  improving: { tone: "purple", label: "Improving" },
  on_track: { tone: "info", label: "On track" },
  stalled: { tone: "red", label: "Stalled — your call" },
};
function Sparkline({ series, iv, measure, tone }: { series: { label: string; rate: number }[]; iv: number; measure: number; tone: Tone }) {
  const W = 320, H = 56, pad = 6;
  const max = Math.max(0.02, ...series.map((s) => s.rate));
  const step = series.length > 1 ? (W - 2 * pad) / (series.length - 1) : 0;
  const x = (i: number) => pad + i * step;
  const y = (r: number) => H - pad - (r / max) * (H - 2 * pad);
  const line = series.map((s, i) => `${x(i)},${y(s.rate)}`).join(" ");
  const colorVar = tone === "green" ? "--good" : tone === "red" ? "--bad" : tone === "purple" ? "--brand" : "--info";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" preserveAspectRatio="none">
      {/* training window shaded from start to the 15-day check */}
      {measure < series.length && <rect x={x(iv)} y={0} width={x(Math.min(measure, series.length - 1)) - x(iv)} height={H} fill="var(--brand-tint)" opacity={0.6} />}
      <line x1={x(iv)} y1={0} x2={x(iv)} y2={H} stroke="var(--brand)" strokeWidth={1} strokeDasharray="3 3" />
      {measure < series.length && <line x1={x(measure)} y1={0} x2={x(measure)} y2={H} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 2" />}
      <polyline points={line} fill="none" stroke={`var(${colorVar})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {series.map((s, i) => <circle key={i} cx={x(i)} cy={y(s.rate)} r={i === iv || i === measure ? 3 : 1.6} fill={`var(${colorVar})`} />)}
    </svg>
  );
}

function ProgressCard({ p }: { p: Progress }) {
  const st = PSTATUS[p.status];
  const toward = Math.min(100, (p.dropPct / p.targetDrop) * 100);
  return (
    <div className="uc-card flex overflow-hidden">
      <div className={`w-1.5 shrink-0 ${TONE[st.tone].strip}`} />
      <div className="flex-1 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-extrabold">{p.name}</span>
            <Chip tone="purple">{p.sku}</Chip>
            <span className="text-[12px] text-[var(--ink-3)]">{p.interventionLabel}</span>
          </div>
          <Chip tone={st.tone}>{st.label}</Chip>
        </div>

        {/* weekly complaint-rate trend; shaded = training, dotted = 15-day check */}
        <div className="mt-2">
          <Sparkline series={p.series} iv={p.interventionWeek} measure={p.interventionWeek + 2} tone={st.tone} />
          <div className="mt-0.5 flex justify-between text-[10px] text-[var(--ink-3)]">
            <span>weekly complaints</span>
            <span>▓ training · ┊ 15-day check</span>
          </div>
        </div>

        {/* 15-day check: 15d before vs 15d after training + toward the 20% target */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
          <span className="text-[var(--ink-2)]">15d before <b className="text-[var(--ink)]">{Math.round(p.preRate * 100)}%</b> → 15d after training <b className={TONE[st.tone].chip.split(" ")[1]}>{Math.round(p.currentRate * 100)}%</b></span>
          <div className="flex flex-1 items-center gap-2">
            <div className="relative h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
              <div className={`h-full rounded-full ${TONE[st.tone].bar}`} style={{ width: `${toward}%` }} />
            </div>
            <span className="whitespace-nowrap text-[var(--ink-3)]">↓{Math.round(p.dropPct * 100)}% / {Math.round(p.targetDrop * 100)}% target</span>
          </div>
        </div>

        {/* 60-day monitor window: coaching cycles + the day-60 escalation decision */}
        <div className="mt-2.5">
          <div className="mb-1 flex justify-between text-[10px] text-[var(--ink-3)]">
            <span>60-day monitor · day {Math.min(p.daysElapsed, p.windowDays)}</span>
            <span>day {p.windowDays}: {p.status === "recovered" ? "exit ✓" : p.status === "stalled" ? "→ soft-ban ladder" : "final check"}</span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-[var(--line)]">
            <div className="h-full rounded-full bg-[var(--ink-3)]" style={{ width: `${Math.min(100, (p.daysElapsed / p.windowDays) * 100)}%` }} />
            <span className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-[var(--ink-3)]" style={{ left: "50%" }} title="cycle-1 check (~day 30)" />
          </div>
        </div>

        <p className="mt-2 text-[12px] text-[var(--ink-2)]">{p.phase} · {p.note}</p>
      </div>
    </div>
  );
}

function Tile({ n, label, tone, active, onClick }: { n: number; label: string; tone: Tone; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex-1 rounded-2xl border p-4 text-left transition-all ${active ? "border-[var(--brand)] ring-2 ring-[var(--brand-tint)]" : "border-[var(--line)] hover:border-[var(--ink-3)]"} bg-white`}>
      <div className={`text-[30px] font-extrabold leading-none ${n > 0 ? TONE[tone].chip.split(" ")[1] : "text-[var(--ink-3)]"}`}>{n}</div>
      <div className="mt-1 text-[12px] font-semibold text-[var(--ink-2)]">{label}</div>
    </button>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function Pipeline2View({ data }: { data: Pipeline2Response }) {
  const { cases, partners, config } = data;
  const progress = data.progress ?? [];
  const [tab, setTab] = useState<"queue" | "progress" | "partners" | "auto">("queue");
  const [decided, setDecided] = useState<Record<string, { choice: Choice; note: string }>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const queue = useMemo(() => {
    const rank = (c: SkuCase) => ["red", "amber", "info", "gray"].indexOf(bucket(c).tone);
    return cases
      .filter((c) => c.decision.gate === "human_required" || c.decision.gate === "held_for_corroboration")
      .sort((a, b) => rank(a) - rank(b) || (b.row.issues[0]?.issueRate ?? 0) - (a.row.issues[0]?.issueRate ?? 0));
  }, [cases]);
  const decidable = queue.filter((c) => c.decision.gate === "human_required");
  const autoActed = cases.filter((c) => c.decision.gate === "auto_approved" && !c.decision.actions.includes("do_nothing"));
  const monitoring = cases.filter((c) => c.decision.actions.includes("do_nothing"));
  const safetyN = cases.filter((c) => c.decision.track === "safety").length;
  const unimpN = partners.filter((p) => p.unimprovable).length;
  const doneN = decidable.filter((c) => decided[key(c)]).length;

  const byPartner = useMemo(() => {
    const m = new Map<string, SkuCase[]>();
    for (const c of cases) (m.get(c.row.partnerId) ?? m.set(c.row.partnerId, []).get(c.row.partnerId)!).push(c);
    return m;
  }, [cases]);
  const sortedPartners = [...partners].sort((a, b) => Number(b.unimprovable) - Number(a.unimprovable) || a.avgRating - b.avgRating);
  const pOrder: Record<ProgressStatus, number> = { stalled: 0, improving: 1, on_track: 1, recovered: 2 };
  const progressSorted = [...progress].sort((a, b) => pOrder[a.status] - pOrder[b.status] || b.dropPct - a.dropPct);

  const TabBtn = ({ id, label, n }: { id: typeof tab; label: string; n: number }) => (
    <button onClick={() => setTab(id)} className={`rounded-xl px-4 py-2 text-[13px] font-bold transition-colors ${tab === id ? "bg-[var(--ink)] text-white" : "text-[var(--ink-2)] hover:bg-[var(--page)]"}`}>{label} <span className={tab === id ? "opacity-80" : "text-[var(--ink-3)]"}>{n}</span></button>
  );

  return (
    <div className="space-y-5">
      {/* upload validation notes — rows we could not (or must not) count */}
      {(data.issues?.length ?? 0) > 0 && (
        <div className="rounded-xl bg-[var(--warn-tint)] px-4 py-3 text-[12px] leading-relaxed text-[var(--ink-2)]">
          <b className="text-[var(--warn)]">Some rows need attention:</b>
          <ul className="mt-1 list-disc pl-5">{data.issues!.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      {/* summary tiles — click to jump */}
      <div className="flex flex-wrap gap-3">
        <Tile n={decidable.length - doneN} label="Need your decision" tone="amber" active={tab === "queue"} onClick={() => setTab("queue")} />
        <Tile n={progress.length} label="In training" tone="purple" active={tab === "progress"} onClick={() => setTab("progress")} />
        <Tile n={safetyN} label="Safety alerts" tone="red" active={false} onClick={() => setTab("queue")} />
        <Tile n={unimpN} label="Flag to remove" tone="red" active={tab === "partners"} onClick={() => setTab("partners")} />
        <Tile n={autoActed.length} label="Handled for you" tone="green" active={tab === "auto"} onClick={() => setTab("auto")} />
      </div>

      {/* tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[var(--line)] bg-white p-1.5">
        <TabBtn id="queue" label="Your decisions" n={decidable.length} />
        <TabBtn id="progress" label="In progress" n={progress.length} />
        <TabBtn id="partners" label="Partners" n={partners.length} />
        <TabBtn id="auto" label="Auto-handled" n={autoActed.length + monitoring.length} />
        {tab === "queue" && decidable.length > 0 && (
          <span className="ml-auto pr-2 text-[12px] font-semibold text-[var(--ink-3)]">{doneN}/{decidable.length} done</span>
        )}
      </div>

      {tab === "queue" && (
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--ink-3)]">Most important first. Approving anything that pauses or removes a partner takes effect only after your OK.</p>
          {queue.map((c) => (
            <DecisionCard key={key(c)} c={c} ps={partners} cfg={config}
              decided={decided[key(c)]} draft={drafts[key(c)] ?? ""}
              onDraft={(v) => setDrafts((d) => ({ ...d, [key(c)]: v }))}
              onDecide={(ch) => setDecided((r) => ({ ...r, [key(c)]: { choice: ch, note: drafts[key(c)] ?? "" } }))} />
          ))}
          {queue.length === 0 && <p className="uc-card py-8 text-center text-[13px] text-[var(--ink-3)]">🎉 Nothing needs you right now.</p>}
        </div>
      )}

      {tab === "progress" && (
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--ink-3)]">Week-by-week complaints per partner. The <b>15-day check</b> (shaded) sits inside the <b>60-day monitor</b>; at day 60 they either exit (recovered) or drop to the soft-ban ladder. <b className="text-[var(--bad)]">Stalled</b> first.</p>
          {progressSorted.map((p) => <ProgressCard key={`${p.partnerId}|${p.sku}`} p={p} />)}
          {progress.length === 0 && <p className="uc-card py-8 text-center text-[13px] text-[var(--ink-3)]">No partners in training in this data.</p>}
        </div>
      )}

      {tab === "partners" && (
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--ink-3)]">Each partner, service by service. Someone can be great at one service and struggling at another — we only act on the service that&apos;s failing.</p>
          {sortedPartners.map((p) => <PartnerRow key={p.partnerId} p={p} cases={byPartner.get(p.partnerId) ?? []} />)}
        </div>
      )}

      {tab === "auto" && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-[14px] font-bold">✅ Done automatically <span className="text-[12px] font-normal text-[var(--ink-3)]">— low-risk help, high confidence</span></h3>
            <div className="space-y-2">
              {autoActed.map((c) => (
                <div key={key(c)} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[12px]">
                  <b>{nameOf(partners, c.row.partnerId)}</b>
                  <Chip tone="purple">{c.row.sku}</Chip>
                  <span className="text-[var(--ink-3)]">{CAUSE[c.decision.cause]?.label ?? c.decision.cause}</span>
                  {c.decision.actions.map((a) => <Chip key={a} tone="green">{ACTION[a] ?? a}</Chip>)}
                </div>
              ))}
              {autoActed.length === 0 && <p className="text-[12px] text-[var(--ink-3)]">Nothing this cycle.</p>}
            </div>
          </div>
          <details className="uc-card p-4">
            <summary className="cursor-pointer text-[14px] font-bold">👀 Just watching ({monitoring.length})</summary>
            <p className="mt-2 text-[12px] text-[var(--ink-3)]">A few complaints, but too small a share of the partner&apos;s jobs to act on yet. We re-check every week — we act on <b>patterns</b>, not one-off reviews.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {monitoring.map((c) => <Chip key={key(c)} tone="gray">{nameOf(partners, c.row.partnerId)} · {c.row.sku}</Chip>)}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
