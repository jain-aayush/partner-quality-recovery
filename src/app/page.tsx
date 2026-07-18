"use client";

import { useState } from "react";
import partnersJson from "../../data/partners.json";
import Pipeline2View, { Pipeline2Response } from "../components/Pipeline2View";
import { Partner } from "../lib/types";

const partners = partnersJson as unknown as Partner[];
const FLAG_BAR = 3.5;

const STEPS = [
  { icon: "🗣️", title: "Read every review", desc: "We tag what each customer is really complaining about." },
  { icon: "🔍", title: "Find the real problem", desc: "Skill gap? Rushing? Cheap supplies? Or an unfair review?" },
  { icon: "✅", title: "You approve the big calls", desc: "Anything that affects earnings waits for your OK." },
];

function Landing({ onRun, onUpload, loading }: { onRun: () => void; onUpload: (f: File) => void; loading: boolean }) {
  const bottom = partners.filter((p) => p.avgRating < FLAG_BAR);
  const reviews = partners.reduce((s, p) => s + p.reviewCount, 0);

  return (
    <div className="space-y-8 pt-10">
      <section className="text-center">
        <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">Quality Console</div>
        <h1 className="mx-auto mt-3 max-w-2xl text-[36px] font-extrabold leading-[1.12] tracking-tight">
          Which partners need help — and <em className="not-italic underline decoration-[var(--ink-3)] decoration-[3px] underline-offset-8">why</em>.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--ink-2)]">
          The same low rating can mean five different things. We find the real reason, fix the small
          stuff automatically, and hand you only the calls that matter.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button onClick={onRun} disabled={loading}
            className="rounded-xl bg-[var(--brand)] px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_6px_20px_rgba(0,0,0,0.22)] transition-colors hover:bg-[var(--brand-deep)] disabled:opacity-60">
            {loading ? "Checking…" : "Run on sample data"}
          </button>
          <label className="cursor-pointer rounded-xl border border-[var(--line)] bg-white px-6 py-3.5 text-[15px] font-bold text-[var(--ink)] transition-colors hover:bg-[var(--page)]">
            Upload your CSV
            <input type="file" accept=".csv,text/csv" className="hidden" disabled={loading} onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          </label>
        </div>
        <a href="/uc-sample.csv" download className="mt-3 inline-block text-[12px] font-semibold text-[var(--brand)]">Download the sample CSV to see the format</a>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={i} className="uc-card p-5 text-center">
            <div className="text-[28px]">{s.icon}</div>
            <div className="mt-2 text-[15px] font-bold">{s.title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-2)]">{s.desc}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap justify-center gap-3 text-center">
        {[
          { v: String(partners.length), l: "partners watched" },
          { v: String(bottom.length), l: "need a closer look" },
          { v: reviews.toLocaleString(), l: "reviews read" },
        ].map((s, i) => (
          <div key={i} className="uc-card min-w-[150px] flex-1 px-5 py-4">
            <div className="text-[26px] font-extrabold">{s.v}</div>
            <div className="text-[12px] font-semibold text-[var(--ink-3)]">{s.l}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<Pipeline2Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline2", body ? { method: "POST", headers: { "content-type": "application/json" }, body } : { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Something went wrong (${res.status})`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  const run = () => post();
  async function upload(file: File) {
    const csv = await file.text();
    await post(JSON.stringify({ csv }));
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-12">
      {error && <div className="mt-4 rounded-xl bg-[var(--bad-tint)] px-4 py-3 text-[13px] font-semibold text-[var(--bad)]">{error}</div>}

      {!data && <Landing onRun={run} onUpload={upload} loading={loading} />}

      {data && (
        <div className="space-y-5 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-extrabold tracking-tight">This week&apos;s check</h1>
              <p className="text-[13px] text-[var(--ink-2)]">
                Beauty · Delhi NCR · {data.source === "upload" ? `your uploaded data (${data.rowCount} order rows)` : "sample data"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--ink)] transition-colors hover:bg-[var(--page)]">
                {loading ? "Loading…" : "Upload CSV"}
                <input type="file" accept=".csv,text/csv" className="hidden" disabled={loading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              <button onClick={() => setData(null)} className="text-[13px] font-semibold text-[var(--ink-3)] hover:text-[var(--ink)]">Home</button>
            </div>
          </div>
          <Pipeline2View data={data} />
        </div>
      )}
    </main>
  );
}
