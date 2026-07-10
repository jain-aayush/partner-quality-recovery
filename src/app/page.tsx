"use client";

import { useState } from "react";
import AccuracyBanner from "../components/AccuracyBanner";
import HumanGateQueue from "../components/HumanGateQueue";
import PartnerCard, { Decision } from "../components/PartnerCard";
import { PipelineResult } from "../lib/types";

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
  const threshold = result?.config.confidenceThreshold ?? 0.7;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Partner Quality Recovery</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Screens the bottom cohort, diagnoses <em>why</em> each partner is failing from review
            text + booking behaviour, prescribes the matching intervention — and keeps every
            income-affecting decision behind a human gate.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={revealTruth}
                onChange={(e) => setRevealTruth(e.target.checked)}
              />
              Reveal ground truth
            </label>
          )}
          <button
            onClick={run}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-zinc-400"
          >
            {loading ? "Diagnosing…" : result ? "Re-run pipeline" : "Run pipeline"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!result && !loading && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-500">
          <p className="font-medium">50 synthetic partners loaded · bottom cohort awaiting diagnosis</p>
          <p className="mt-1 text-sm">
            Run the pipeline: screen → diagnose (in parallel) → policy → human gate → monitor.
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <AccuracyBanner accuracy={result.accuracy} mode={result.mode} model={result.model} />

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 text-lg font-semibold">
                Human review queue{" "}
                <span className="text-sm font-normal text-zinc-500">
                  ({human.filter((c) => !decisions[c.partner.id]).length} pending · income-affecting,
                  low-confidence &amp; policy-mandated cases)
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
              <h2 className="mb-3 text-lg font-semibold">
                Auto-approved{" "}
                <span className="text-sm font-normal text-zinc-500">
                  ({auto.length} · low-stakes, supportive, high-confidence only)
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
                  <p className="text-sm text-zinc-500">Nothing met the auto-approve bar.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
