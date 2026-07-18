"use client";

/**
 * Oversight — the "is this system trustworthy?" view. Live session tallies (appeals filed, QM
 * disagreements with the AI, flagged auto-decisions) sit above a simulated 12-week pilot history
 * in which challenges decline as thresholds and the tagger get tuned — the trend that validates
 * the system. Live numbers are never mixed into the simulated series.
 */

import { useMemo, useState } from "react";
import type { Appeal, AutoFlag, QmDecision } from "../lib/client-store";
import { resolveAppeal } from "../lib/client-store";
import { OUTCOME, OutcomeKind } from "../lib/outcomes";
import { OVERSIGHT_HISTORY } from "../lib/oversight";

function Stat({ n, label, sub }: { n: string; label: string; sub: string }) {
  return (
    <div className="uc-card flex-1 px-4 py-3">
      <div className="text-[26px] font-extrabold leading-none">{n}</div>
      <div className="mt-1 text-[12px] font-semibold text-[var(--ink-2)]">{label}</div>
      <div className="text-[11px] text-[var(--ink-3)]">{sub}</div>
    </div>
  );
}

// Single-series count-per-week trend line: zero baseline, one clean gridline, first/last labeled,
// every dot hoverable, table twin underneath.
function TrendChart({ title, note, points }: { title: string; note: string; points: { label: string; value: number }[] }) {
  const W = 560, H = 132, padL = 30, padR = 14, padT = 20, padB = 26;
  const max = Math.max(1, ...points.map((p) => p.value)) * 1.25;
  const step = (W - padL - padR) / Math.max(1, points.length - 1);
  const x = (i: number) => padL + i * step;
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const last = points.length - 1;
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const drop = Math.round((1 - points[last].value / Math.max(1, points[0].value)) * 100);
  const tick = Math.max(1, Math.round(max / 1.25 / 5) * 5);
  return (
    <div className="uc-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[13px] font-bold">{title}</h4>
        <span className="text-[12px] font-bold text-[var(--good)]">↓ {drop}% since pilot start</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={title}>
        <line x1={padL} y1={y(tick)} x2={W - padR} y2={y(tick)} stroke="var(--line)" strokeWidth={1} />
        <text x={padL - 6} y={y(tick) + 3} textAnchor="end" fontSize={10} fill="var(--ink-3)">{tick}</text>
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="var(--line)" strokeWidth={1} />
        <text x={padL - 6} y={y(0) + 3} textAnchor="end" fontSize={10} fill="var(--ink-3)">0</text>
        <polygon points={`${x(0)},${y(0)} ${line} ${x(last)},${y(0)}`} fill="var(--ink)" opacity={0.06} />
        <polyline points={line} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <title>{`Week of ${p.label}: ${p.value}`}</title>
            <circle cx={x(i)} cy={y(p.value)} r={11} fill="transparent" />
            <circle cx={x(i)} cy={y(p.value)} r={3.5} fill="var(--ink)" stroke="var(--card)" strokeWidth={2} />
            {(i === 0 || i === last) && (
              <text x={x(i)} y={y(p.value) - 8} textAnchor={i === 0 ? "start" : "end"} fontSize={10.5} fontWeight={700} fill="var(--ink-2)">{p.value}</text>
            )}
            {(i % 2 === 0 || i === last) && (
              <text x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} fontSize={9.5} fill="var(--ink-3)">{p.label}</text>
            )}
          </g>
        ))}
      </svg>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">{note}</p>
      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] font-semibold text-[var(--ink-3)]">Data table</summary>
        <table className="mt-1 text-[11px] text-[var(--ink-2)]">
          <tbody>
            <tr>{points.map((p) => <td key={p.label} className="pr-3 font-semibold text-[var(--ink-3)]">{p.label}</td>)}</tr>
            <tr>{points.map((p) => <td key={p.label} className="pr-3 tabular-nums">{p.value}</td>)}</tr>
          </tbody>
        </table>
      </details>
    </div>
  );
}

// One appeal: open → resolve here (a different QM re-reviews — uphold reverses & remediates); resolved → the record.
function AppealCard({ a }: { a: Appeal }) {
  const [note, setNote] = useState("");
  const canSubmit = note.trim().length >= 8;
  const incomeAffecting = OUTCOME[a.action as OutcomeKind]?.incomeAffecting ?? false;
  return (
    <div className="rounded-lg bg-[var(--page)] px-3 py-2 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <b>{a.partnerName}</b>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--ink-2)] ring-1 ring-[var(--line)]">{a.sku}</span>
        <span className="text-[var(--ink-3)]">contesting: {a.decisionLabel}</span>
        <span className="ml-auto text-[10px] text-[var(--ink-3)]">{new Date(a.createdAt).toLocaleString()}</span>
        {a.status === "open" && <span className="rounded-full bg-[var(--info-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--info)]">Open</span>}
        {a.status === "upheld" && <span className="rounded-full bg-[var(--good-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--good)]">Upheld — reversed</span>}
        {a.status === "denied" && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--ink-2)] ring-1 ring-[var(--line)]">Denied — action stands</span>}
      </div>
      <p className="mt-1 italic text-[var(--ink-2)]">&ldquo;{a.reason}&rdquo;</p>
      {a.status === "open" ? (
        <div className="mt-2 border-t border-[var(--line)] pt-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution rationale (one line — required; you are the second reviewer)"
            className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[12px] outline-none focus:border-[var(--brand)]" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button disabled={!canSubmit} onClick={() => resolveAppeal(a.id, "upheld", note.trim(), { incomeAffecting })}
              className="rounded-lg bg-[var(--good)] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">✓ Uphold — reverse{incomeAffecting ? " & remediate" : ""}</button>
            <button disabled={!canSubmit} onClick={() => resolveAppeal(a.id, "denied", note.trim(), { incomeAffecting })}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-bold text-[var(--ink-2)] disabled:opacity-40">Deny — action stands</button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] text-[var(--ink-3)]">
          {a.resolutionNote && <span className="italic">&ldquo;{a.resolutionNote}&rdquo; · </span>}
          resolved {a.resolvedAt ? new Date(a.resolvedAt).toLocaleString() : ""} by a different reviewer
          {a.remediation && (
            <div className="mt-1.5 rounded-lg bg-[var(--good-tint)] px-2.5 py-1.5 text-[11px] text-[var(--ink-2)]">
              <b className="text-[var(--good)]">Remediation applied:</b> {a.remediation.reversedAction && <>reversed &ldquo;{OUTCOME[a.remediation.reversedAction as OutcomeKind]?.label(a.sku) ?? a.remediation.reversedAction}&rdquo; · </>}
              record corrected (excluded from future escalation history) · booking priority restored for {a.remediation.priorityBoostDays} days · {a.remediation.compensationNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OversightView({ appeals, decisions, flags }: { appeals: Appeal[]; decisions: QmDecision[]; flags: AutoFlag[] }) {
  const disagreed = decisions.filter((d) => d.outcome !== d.suggested);
  const agreedPct = decisions.length > 0 ? `${Math.round(((decisions.length - disagreed.length) / decisions.length) * 100)}%` : "—";
  const resolved = appeals.filter((a) => a.status !== "open");
  const upheld = appeals.filter((a) => a.status === "upheld");
  const reversalPct = resolved.length > 0 ? `${Math.round((upheld.length / resolved.length) * 100)}%` : "—";
  const remedyMins = useMemo(() => {
    const mins = upheld
      .filter((a) => a.resolvedAt)
      .map((a) => (new Date(a.resolvedAt!).getTime() - new Date(a.createdAt).getTime()) / 60000)
      .sort((x, y) => x - y);
    if (mins.length === 0) return "—";
    const m = mins[Math.floor(mins.length / 2)];
    return m < 60 ? `${Math.max(1, Math.round(m))}m` : `${(m / 60).toFixed(1)}h`;
  }, [upheld]);
  const auditLog = useMemo(() => [...decisions].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)), [decisions]);
  const history = useMemo(() => ({
    appeals: OVERSIGHT_HISTORY.map((w) => ({ label: w.label, value: w.appeals })),
    overrides: OVERSIGHT_HISTORY.map((w) => ({ label: w.label, value: w.overrides })),
  }), []);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-[var(--ink-3)]">
        How often the system gets challenged — by partners (appeals) and by you (overrides, flags). Falling challenge rates are the evidence the calls can be trusted.
      </p>

      {/* live — this browser session */}
      <div className="flex flex-wrap gap-3">
        <Stat n={String(appeals.length)} label="Partner appeals" sub="filed this session" />
        <Stat n={String(disagreed.length)} label="You disagreed with the AI" sub="decisions changed or rejected" />
        <Stat n={String(flags.length)} label="Auto-decisions flagged" sub="marked as tagged wrong" />
        <Stat n={agreedPct} label="AI–human agreement" sub={decisions.length > 0 ? `of your ${decisions.length} decision${decisions.length === 1 ? "" : "s"}` : "no decisions yet"} />
        <Stat n={reversalPct} label="Appeals upheld" sub={resolved.length > 0 ? `${upheld.length} of ${resolved.length} resolved — reversal rate` : "none resolved yet"} />
        <Stat n={remedyMins} label="Time to remedy" sub="median, appeal filed → reversed" />
      </div>

      {/* 12-week pilot history (simulated) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <TrendChart title="Partner appeals per week" points={history.appeals}
          note="Simulated pilot history (~40 cases reviewed weekly). Appeals fell as decisions and partner-facing wording got fairer." />
        <TrendChart title="QM disagreed with the AI per week" points={history.overrides}
          note="Simulated pilot history. Overrides and rejections fell as thresholds and the tagger were tuned on QM feedback." />
      </div>

      {/* every appeal, verbatim — open ones are resolved right here by a second reviewer */}
      <div className="uc-card p-4">
        <h4 className="text-[13px] font-bold">⚖ Appeals filed this session</h4>
        <p className="mt-1 text-[11px] text-[var(--ink-3)]">A different QM than the original approver resolves each appeal. Upholding an income-affecting action reverses it immediately and applies the remediation policy: record corrected, booking priority restored, compensation reviewed.</p>
        {appeals.length === 0 ? (
          <p className="mt-2 text-[12px] text-[var(--ink-3)]">None yet. Partners file appeals from the partner app — open it via &ldquo;Partner view ↗&rdquo; in the top bar.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {appeals.map((a) => <AppealCard key={a.id} a={a} />)}
          </div>
        )}
      </div>

      {/* audit log — every human decision this session, newest first, mirrored to the durable sink */}
      <div className="uc-card p-4">
        <h4 className="text-[13px] font-bold">🗂 Decision audit log</h4>
        <p className="mt-1 text-[11px] text-[var(--ink-3)]">Every human decision: who, what the AI suggested, what was applied, and the recorded rationale. Each entry is also mirrored server-side to the durable audit trail (Langfuse) when configured.</p>
        {auditLog.length === 0 ? (
          <p className="mt-2 text-[12px] text-[var(--ink-3)]">No decisions yet this session.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {auditLog.map((d) => (
              <div key={`${d.partnerId}|${d.sku}|${d.decidedAt}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--page)] px-3 py-2 text-[12px]">
                <b>{d.partnerId}</b>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--ink-2)] ring-1 ring-[var(--line)]">{d.sku}</span>
                <span className={d.outcome !== d.suggested ? "font-semibold text-[var(--warn)]" : "text-[var(--ink-2)]"}>
                  {d.outcome !== d.suggested ? `overrode AI (${d.suggested}) → ` : "approved: "}{d.label}
                </span>
                {d.note && <span className="italic text-[var(--ink-3)]">&ldquo;{d.note}&rdquo;</span>}
                <span className="ml-auto text-[10px] text-[var(--ink-3)]">{d.decidedBy} · {new Date(d.decidedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* what you flagged, so QC can retrain the tagger */}
      {flags.length > 0 && (
        <div className="uc-card p-4">
          <h4 className="text-[13px] font-bold">🚩 Auto-decisions you flagged</h4>
          <div className="mt-2 space-y-1.5">
            {flags.map((f) => (
              <div key={`${f.partnerId}|${f.sku}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--page)] px-3 py-2 text-[12px]">
                <b>{f.partnerName}</b>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--ink-2)] ring-1 ring-[var(--line)]">{f.sku}</span>
                <span className="text-[var(--ink-3)]">tagged &ldquo;{f.cause}&rdquo; → {f.autoLabel}</span>
                <span className="ml-auto text-[10px] text-[var(--ink-3)]">{new Date(f.flaggedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink-3)]">Flags feed tagger QC — they don&apos;t change the partner&apos;s outcome unless you also override.</p>
        </div>
      )}
    </div>
  );
}
