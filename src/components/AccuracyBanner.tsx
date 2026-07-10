import { AccuracyReport } from "../lib/types";
import { CAUSE_LABELS } from "./DiagnosisPanel";

export default function AccuracyBanner({
  accuracy,
  mode,
  model,
}: {
  accuracy: AccuracyReport;
  mode: string;
  model: string | null;
}) {
  const pct = (accuracy.accuracy * 100).toFixed(1);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Diagnostic accuracy vs hidden ground truth
          </div>
          <div className="text-3xl font-bold">
            {pct}%{" "}
            <span className="text-sm font-normal text-zinc-500">
              ({accuracy.correct}/{accuracy.total} flagged partners)
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(accuracy.perCause).map(([cause, s]) => (
            <span
              key={cause}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.correct === s.total ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
            >
              {CAUSE_LABELS[cause]} {s.correct}/{s.total}
            </span>
          ))}
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-semibold uppercase text-white">
            {mode === "mock" ? "mock mode (offline, deterministic)" : `llm mode · ${model}`}
          </span>
          <span
            className={`text-xs font-medium ${accuracy.thinDataGuardPass ? "text-emerald-700" : "text-red-700"}`}
          >
            {accuracy.thinDataGuardPass
              ? "✓ thin-data guard held (no partner diagnosed on scarce reviews)"
              : "✗ thin-data guard violated"}
          </span>
        </div>
      </div>
      {accuracy.misses.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          Misses:{" "}
          {accuracy.misses.map((m) => `${m.partnerId} (${m.expected} → ${m.got})`).join(", ")}
        </p>
      )}
    </div>
  );
}
