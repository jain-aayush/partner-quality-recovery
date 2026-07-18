"use client";

/**
 * Partner-facing companion app (mock) — what a partner sees in their Urban Company app. Copy is
 * short and calm, and states plainly whether an action is one service or the whole account. It
 * reflects the QM's ACTUAL decision (from /api/decisions, polled) — until a human decides an
 * income-affecting case, the partner just sees a neutral "under review", never a scary outcome.
 * A demo dropdown swaps the partner. Every card has an Appeal button → /api/appeals.
 */

import { useEffect, useMemo, useState } from "react";
import type { QmDecision } from "../lib/decisions-store";
import type { Decision } from "../lib/model";
import { OutcomeKind, suggestedOutcome } from "../lib/outcomes";
import type { Pipeline2Response, SkuCase } from "./Pipeline2View";

type Tone = "red" | "amber" | "info" | "purple" | "green";
const STRIP: Record<Tone, string> = { red: "bg-[var(--bad)]", amber: "bg-[var(--warn)]", info: "bg-[var(--info)]", purple: "bg-[var(--brand)]", green: "bg-[var(--good)]" };
const CHIP: Record<Tone, string> = { red: "bg-[var(--bad-tint)] text-[var(--bad)]", amber: "bg-[var(--warn-tint)] text-[var(--warn)]", info: "bg-[var(--info-tint)] text-[var(--info)]", purple: "bg-[var(--brand-tint)] text-[var(--brand-deep)]", green: "bg-[var(--good-tint)] text-[var(--good)]" };

type View = { tone: Tone; icon: string; title: string; status: string; body: string };

// Short, plain, non-alarming. Each states clearly if it's one service or the whole account.
function copy(kind: OutcomeKind | "pending" | "cleared", sku: string): View {
  switch (kind) {
    case "skill_training": return { tone: "purple", icon: "🎓", title: `Free ${sku} training added`, status: "Free training", body: `A quick lesson to sharpen your ${sku} work. No penalty.` };
    case "warning_scrutiny": return { tone: "amber", icon: "👀", title: `Heads-up on ${sku}`, status: "Heads-up", body: `We'll keep an eye on your next few ${sku} jobs. No penalty.` };
    case "supply_kit": return { tone: "info", icon: "🧴", title: "Free supply kit on the way", status: "On the way", body: `Branded supplies are coming, on us. Nothing needed from you.` };
    case "review_protection": return { tone: "green", icon: "🛡️", title: "We've got your back", status: "Protected", body: `Some unfair ${sku} reviews won't count against you.` };
    case "soft_ban_sku": return { tone: "amber", icon: "⏸️", title: `${sku} paused for 7 days`, status: "7-day pause", body: `Only ${sku} is on hold for a week. Your other services keep running.` };
    case "soft_ban_platform": return { tone: "amber", icon: "⏸️", title: "Bookings paused for 7 days", status: "7-day pause", body: `All services are on hold for a week, then we re-check.` };
    case "hard_ban_sku": return { tone: "red", icon: "⛔", title: `${sku} stopped`, status: "This service only", body: `You can no longer take ${sku}. Your other services are unaffected.` };
    case "offboard": return { tone: "red", icon: "🚫", title: "Account deactivated", status: "Whole account", body: `Your account is off the platform after repeated feedback. You can appeal below.` };
    case "safety_pause": return { tone: "red", icon: "🛑", title: `${sku} paused — safety check`, status: "Paused · reviewing", body: `A safety report came in. ${sku} is on hold during a quick review. Tell us your side.` };
    case "cleared": return { tone: "green", icon: "✅", title: `All clear on ${sku}`, status: "No action", body: `We looked into it and are taking no action. Thanks for your patience.` };
    case "keep_watching":
    case "pending":
    default: return { tone: "info", icon: "🔍", title: `We're reviewing your ${sku}`, status: "Under review", body: `Some recent ${sku} feedback is being looked into. Nothing's changed yet.` };
  }
}

function communicated(d: Decision): boolean {
  return [...d.immediateActions, ...d.actions].some((a) => a !== "do_nothing");
}

/** What the partner actually sees: the QM's applied decision if any, else a calm interim state. */
function partnerView(c: SkuCase, qm: QmDecision | undefined): View {
  const d = c.decision;
  if (qm) return copy(qm.status === "rejected" ? "cleared" : qm.outcome, c.row.sku);
  if (d.immediateActions.includes("safety_pause")) return copy("safety_pause", c.row.sku);
  if (d.gate === "auto_approved") return copy(suggestedOutcome(d), c.row.sku);
  return copy("pending", c.row.sku); // human-gated, not yet decided → neutral
}

const keyOf = (c: SkuCase) => `${c.row.partnerId}|${c.row.sku}`;

export default function PartnerApp() {
  const [data, setData] = useState<Pipeline2Response | null>(null);
  const [qm, setQm] = useState<Record<string, QmDecision>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<{ c: SkuCase; view: View } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pipeline2", { method: "POST" });
        const j = (await res.json()) as Pipeline2Response;
        if (!res.ok) throw new Error("Couldn't load your updates.");
        setData(j);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  // Poll QM decisions so the partner view updates live when a QM acts on the dashboard.
  useEffect(() => {
    const load = () => fetch("/api/decisions").then((r) => r.json())
      .then((j: { decisions: QmDecision[] }) => setQm(Object.fromEntries((j.decisions ?? []).map((d) => [`${d.partnerId}|${d.sku}`, d]))))
      .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const partnerOptions = useMemo(() => {
    if (!data) return [] as { id: string; name: string }[];
    const shown = new Set(data.cases.filter((c) => communicated(c.decision) || qm[keyOf(c)]).map((c) => c.row.partnerId));
    return data.partners.filter((p) => shown.has(p.partnerId)).map((p) => ({ id: p.partnerId, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, qm]);

  useEffect(() => { if (!selected && partnerOptions.length) setSelected(partnerOptions[0].id); }, [partnerOptions, selected]);

  const partner = partnerOptions.find((p) => p.id === selected);
  const cards = useMemo(() => {
    if (!data || !selected) return [] as SkuCase[];
    return data.cases.filter((c) => c.row.partnerId === selected && (communicated(c.decision) || qm[keyOf(c)]));
  }, [data, selected, qm]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--brand-tint)] to-[var(--page)] px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand)]">Demo · viewing as</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 text-[13px] font-semibold outline-none focus:border-[var(--brand)]">
            {partnerOptions.length === 0 && <option value="">—</option>}
            {partnerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <a href="/" className="rounded-lg px-2 py-1.5 text-[12px] font-bold text-[var(--ink-3)] hover:text-[var(--ink)]">QM view →</a>
        </div>

        <div className="mx-auto w-full max-w-[400px] rounded-[44px] border-[11px] border-[#0c0c0c] bg-[#0c0c0c] shadow-[0_30px_60px_rgba(16,12,40,0.35)]">
          <div className="relative overflow-hidden rounded-[33px] bg-[var(--page)]">
            <div className="relative flex items-center justify-between bg-[var(--brand)] px-6 pt-2.5 text-[11px] font-semibold text-white">
              <span>9:41</span>
              <div className="pointer-events-none absolute left-1/2 top-1 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-[#0c0c0c]" />
              <span>5G ▮</span>
            </div>
            <div className="bg-[var(--brand)] px-5 pb-4 pt-2 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-[15px] font-extrabold">{(partner?.name ?? "?").slice(0, 1)}</div>
                <div className="leading-tight">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">UC Partner</div>
                  <div className="text-[16px] font-extrabold">{partner?.name ?? "—"}</div>
                </div>
                <span className="ml-auto rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">Inbox</span>
              </div>
            </div>

            <div className="max-h-[560px] space-y-3 overflow-y-auto px-4 py-4">
              <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--ink-3)]">Updates for you</div>
              {loading && <p className="py-10 text-center text-[13px] text-[var(--ink-3)]">Loading…</p>}
              {error && <p className="rounded-xl bg-[var(--bad-tint)] px-3 py-2 text-[12px] font-semibold text-[var(--bad)]">{error}</p>}
              {!loading && !error && cards.length === 0 && (
                <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
                  <div className="text-[26px]">✅</div>
                  <div className="mt-1 text-[14px] font-bold">You&apos;re in good standing</div>
                  <p className="mt-1 text-[12px] text-[var(--ink-2)]">No actions on your account. Keep it up!</p>
                </div>
              )}

              {cards.map((c) => {
                const v = partnerView(c, qm[keyOf(c)]);
                const cite = c.complaints[0]?.text;
                const done = submitted[keyOf(c)];
                return (
                  <div key={keyOf(c)} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[var(--line)]">
                    <div className={`h-1 w-full ${STRIP[v.tone]}`} />
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-[22px] leading-none">{v.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-[var(--page)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-2)]">{c.row.sku}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CHIP[v.tone]}`}>{v.status}</span>
                          </div>
                          <h3 className="mt-1.5 text-[14px] font-extrabold leading-snug">{v.title}</h3>
                        </div>
                      </div>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-2)]">{v.body}</p>
                      {cite && (
                        <p className="mt-2 text-[11px] text-[var(--ink-3)]">Feedback we saw: <span className="italic">&ldquo;{cite}&rdquo;</span></p>
                      )}
                      <div className="mt-3">
                        {done ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--good-tint)] px-3 py-2 text-[12px] font-bold text-[var(--good)]">✓ Appeal sent</span>
                        ) : (
                          <button onClick={() => setModal({ c, view: v })} className={`rounded-lg px-4 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 ${STRIP[v.tone]}`}>Appeal</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-center text-[10px] text-[var(--ink-3)]">Demo · synthetic data · mock of the partner app</p>
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <AppealDialog partnerName={partner?.name ?? modal.c.row.partnerId} skuCase={modal.c} view={modal.view} qm={qm[keyOf(modal.c)]}
          onClose={() => setModal(null)}
          onSubmitted={() => { setSubmitted((s) => ({ ...s, [keyOf(modal.c)]: true })); setModal(null); }} />
      )}
    </div>
  );
}

function AppealDialog({ partnerName, skuCase, view, qm, onClose, onSubmitted }: {
  partnerName: string; skuCase: SkuCase; view: View; qm: QmDecision | undefined; onClose: () => void; onSubmitted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canSubmit = reason.trim().length >= 3 && !busy;

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/appeals", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          partnerId: skuCase.row.partnerId, partnerName, sku: skuCase.row.sku,
          cause: skuCase.decision.cause, action: qm?.outcome ?? suggestedOutcome(skuCase.decision),
          decisionLabel: view.title, reason: reason.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Couldn't submit your appeal.");
      onSubmitted();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand)]">Appeal · {skuCase.row.sku}</div>
        <h3 className="mt-1 text-[16px] font-extrabold leading-snug">{view.title}</h3>
        <p className="mt-1 text-[12px] text-[var(--ink-2)]">Tell us why this isn&apos;t fair. A different reviewer reads it — bookings continue during an appeal (unless there&apos;s a safety pause).</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} autoFocus
          placeholder="e.g. The customer's hair was already damaged before the appointment…"
          className="mt-3 w-full resize-none rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[13px] outline-none focus:border-[var(--brand)]" />
        {err && <p className="mt-2 text-[12px] font-semibold text-[var(--bad)]">{err}</p>}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-bold text-[var(--ink-2)] hover:bg-[var(--page)]">Cancel</button>
          <button onClick={submit} disabled={!canSubmit} className="rounded-lg bg-[var(--brand)] px-5 py-2 text-[13px] font-bold text-white hover:bg-[var(--brand-deep)] disabled:opacity-40">{busy ? "Sending…" : "Submit appeal"}</button>
        </div>
      </div>
    </div>
  );
}
