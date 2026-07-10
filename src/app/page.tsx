"use client";

import { useState } from "react";
import partnersJson from "../../data/partners.json";
import AccuracyBanner from "../components/AccuracyBanner";
import HumanGateQueue from "../components/HumanGateQueue";
import PartnerCard, { Decision } from "../components/PartnerCard";
import { Partner, PipelineResult } from "../lib/types";

const partners = partnersJson as unknown as Partner[];
const FLAG_BAR = 3.5;

const STEPS = [
  { n: 1, name: "Screen", how: "Deterministic rule", who: "Autonomous", desc: `Flag every partner below ${FLAG_BAR}★ — a metric threshold, not a model.` },
  { n: 2, name: "Diagnose", how: "AI + guardrails", who: "Autonomous · parallel", desc: "Read each partner's reviews and metrics; return root cause, confidence and verbatim evidence." },
  { n: 3, name: "Recommend", how: "Policy table", who: "Autonomous", desc: "Map cause → intervention through a fixed, human-readable table. Never a model output." },
  { n: 4, name: "Gate", how: "Stakes × confidence", who: "Human-owned", desc: "Anything income-affecting, low-confidence or unfair-review goes to a named human." },
  { n: 5, name: "Act & monitor", how: "Feedback loop", who: "Mixed", desc: "Execute approved actions; re-diagnose non-improvers and escalate to a human — never auto-offboard." },
];

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </div>
      <div className="mt-1 text-[28px] font-extrabold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-[var(--ink-3)]">{sub}</div>}
    </div>
  );
}

function Landing({ onRun, loading }: { onRun: () => void; loading: boolean }) {
  const bottom = partners.filter((p) => p.avgRating < FLAG_BAR);
  const top = partners.filter((p) => p.avgRating >= 4.7);
  const mid = partners.length - top.length - bottom.length;
  const reviewsTotal = partners.reduce((s, p) => s + p.reviewCount, 0);
  const bottomAvg = bottom.reduce((s, p) => s + p.avgRating, 0) / bottom.length;

  return (
    <div className="space-y-8">
      <section className="pt-6">
        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--brand-deep)]">
          Quality Ops · Beauty · Delhi NCR
        </div>
        <h1 className="mt-2 max-w-3xl text-[34px] font-extrabold leading-[1.15] tracking-tight">
          Find out <em className="not-italic text-[var(--brand-deep)]">why</em> a partner is
          underperforming — before deciding how to intervene.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-2)]">
          The same low rating can mean five different things. Each diagnosis cycle reads every
          flagged partner&apos;s reviews and booking behaviour, names the root cause with cited
          evidence, and prescribes the matching intervention — while every income-affecting
          decision waits for a named human.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={onRun}
            disabled={loading}
            className="rounded-lg bg-[var(--ink)] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#212121] disabled:bg-[#c9c9c9]"
          >
            {loading ? "Diagnosing 15 partners…" : "Run diagnosis cycle"}
          </button>
          <span className="text-[12px] font-medium text-[var(--ink-3)]">
            Runs offline in deterministic demo mode — no external calls, reproducible results.
          </span>
        </div>
      </section>

      <section className="grid grid-cols-2 divide-x divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white lg:grid-cols-4">
        <Stat value={String(partners.length)} label="Partners monitored" sub="beauty category" />
        <Stat
          value={String(bottom.length)}
          label="Bottom cohort"
          sub={`below ${FLAG_BAR}★ — generates ~70% of complaints`}
        />
        <Stat value={`★ ${bottomAvg.toFixed(2)}`} label="Cohort avg rating" sub="flagged partners" />
        <Stat value={String(reviewsTotal)} label="Reviews on file" sub="diagnosis corpus" />
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-[15px] font-bold">Cohort composition</h2>
        <div className="mt-3 flex h-7 w-full gap-0.5 overflow-hidden rounded-lg">
          <div className="bg-[#c9c9c9]" style={{ flex: top.length }} title={`Top ${top.length}`} />
          <div className="bg-[#e2e2e2]" style={{ flex: mid }} title={`Middle ${mid}`} />
          <div className="bg-[var(--bad)]" style={{ flex: bottom.length }} title={`Bottom ${bottom.length}`} />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] font-medium text-[var(--ink-2)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#c9c9c9]" /> Top {top.length} · ≥4.7★
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#e2e2e2]" /> Middle {mid}
          </span>
          <span className="inline-flex items-center gap-1.5 font-bold text-[var(--ink)]">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--bad)]" /> Bottom {bottom.length} ·
            &lt;{FLAG_BAR}★ — this cycle&apos;s focus
          </span>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-bold">How a diagnosis cycle runs</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ink)] text-[11px] font-bold text-white">
                  {s.n}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    s.who === "Human-owned"
                      ? "bg-[#fdeaec] text-[#b30012]"
                      : s.who === "Mixed"
                        ? "bg-[#fdf3d7] text-[#92400e]"
                        : "bg-[#eef7ee] text-[#2e7d32]"
                  }`}
                >
                  {s.who}
                </span>
              </div>
              <div className="mt-2.5 text-[14px] font-bold">{s.name}</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-deep)]">
                {s.how}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-2)]">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
        <div className="flex items-baseline justify-between px-5 pb-1 pt-4">
          <h2 className="text-[15px] font-bold">Bottom cohort — awaiting diagnosis</h2>
          <span className="text-[12px] text-[var(--ink-3)]">{bottom.length} partners</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                <th className="px-5 py-2.5 font-semibold">Partner</th>
                <th className="px-3 py-2.5 font-semibold">Zone</th>
                <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Services</th>
                <th className="px-3 py-2.5 text-right font-semibold">Rating</th>
                <th className="px-3 py-2.5 text-right font-semibold">Reviews</th>
                <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">
                  Bookings/mo
                </th>
                <th className="px-5 py-2.5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {bottom.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2.5">
                    <span className="font-semibold">{p.name}</span>{" "}
                    <span className="font-mono text-[11px] text-[var(--ink-3)]">{p.id}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-2)]">{p.zone}</td>
                  <td className="hidden max-w-[220px] truncate px-3 py-2.5 text-[var(--ink-2)] md:table-cell">
                    {p.services.join(", ")}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {p.avgRating.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink-2)]">
                    {p.reviewCount}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--ink-2)] sm:table-cell">
                    {p.monthlyBookings}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <span className="rounded-full bg-[var(--page)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-3)] ring-1 ring-[var(--line)]">
                      awaiting diagnosis
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [revealTruth, setRevealTruth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setDecisions({});
    try {
      const res = await fetch("/api/pipeline", { method: "POST" });
      if (!res.ok) throw new Error(`pipeline failed: ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const auto = result?.flagged.filter((c) => c.gate.route === "auto_approved") ?? [];
  const human = result?.flagged.filter((c) => c.gate.route === "human_review") ?? [];
  const humanPending = human.filter((c) => !decisions[c.partner.id]).length;
  const threshold = result?.config.confidenceThreshold ?? 0.7;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-10">
      {error && (
        <div className="mt-4 rounded-xl bg-[#fdeaec] px-4 py-3 text-[13px] font-medium text-[#b30012]">
          {error}
        </div>
      )}

      {!result && <Landing onRun={run} loading={loading} />}

      {result && (
        <div className="space-y-5 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-extrabold tracking-tight">Diagnosis cycle results</h1>
              <p className="text-[13px] text-[var(--ink-2)]">
                Every case shows its cause, cited evidence and prescribed intervention — decide the
                gated ones below.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-[var(--ink-2)]">
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={revealTruth}
                  onChange={(e) => setRevealTruth(e.target.checked)}
                />
                Reveal ground truth
              </label>
              <button
                onClick={run}
                disabled={loading}
                className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--ink)] transition-colors hover:bg-[var(--page)] disabled:text-[var(--ink-3)]"
              >
                {loading ? "Re-running…" : "Re-run cycle"}
              </button>
            </div>
          </div>

          <AccuracyBanner
            accuracy={result.accuracy}
            mode={result.mode}
            model={result.model}
            autoCount={auto.length}
            humanPending={humanPending}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <section>
              <h2 className="mb-3 text-[16px] font-bold">
                Human review queue{" "}
                <span className="text-[13px] font-medium text-[var(--ink-3)]">
                  {`${humanPending} pending — income-affecting, low-confidence & policy-mandated`}
                </span>
              </h2>
              <HumanGateQueue
                cases={human}
                decisions={decisions}
                onDecide={(id, choice, rationale) =>
                  setDecisions((d) => ({ ...d, [id]: { choice, rationale } }))
                }
                threshold={threshold}
                revealTruth={revealTruth}
              />
            </section>

            <section>
              <h2 className="mb-3 text-[16px] font-bold">
                Auto-cleared{" "}
                <span className="text-[13px] font-medium text-[var(--ink-3)]">
                  {auto.length} — low-stakes, supportive, high-confidence only
                </span>
              </h2>
              <div className="space-y-3">
                {auto.map((c) => (
                  <PartnerCard
                    key={c.partner.id}
                    c={c}
                    threshold={threshold}
                    revealTruth={revealTruth}
                  />
                ))}
                {auto.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[var(--line)] bg-white py-4 text-center text-[13px] text-[var(--ink-3)]">
                    Nothing met the auto-clear bar this cycle.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
