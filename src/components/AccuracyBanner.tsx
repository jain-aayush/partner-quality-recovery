import { AccuracyReport } from "../lib/types";
import { CAUSES } from "./causes";

function Tile({ value, label, sub }: { value: string; label: string; sub?: string }) {
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

export default function AccuracyBanner({
  accuracy,
  mode,
  model,
  autoCount,
  humanPending,
}: {
  accuracy: AccuracyReport;
  mode: string;
  model: string | null;
  autoCount: number;
  humanPending: number;
}) {
  const pct = (accuracy.accuracy * 100).toFixed(1);
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
      <div className="grid grid-cols-2 divide-x divide-[var(--line)] lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Diagnostic accuracy · vs hidden ground truth
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[48px] font-extrabold leading-none tracking-tight">{pct}%</span>
            <span className="text-[13px] font-medium text-[var(--ink-3)]">
              {accuracy.correct}/{accuracy.total} partners
            </span>
          </div>
        </div>
        <Tile value={String(accuracy.total)} label="Flagged this cycle" sub="rating below 3.5★" />
        <Tile
          value={String(autoCount)}
          label="Auto-cleared"
          sub="low-stakes · high-confidence"
        />
        <Tile value={String(humanPending)} label="Pending human decisions" sub="stakes-gated" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] bg-[var(--page)] px-5 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(accuracy.perCause).map(([cause, s]) => (
            <span
              key={cause}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-2)] ring-1 ring-[var(--line)]"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: CAUSES[cause]?.color ?? "var(--ink-3)" }}
              />
              {CAUSES[cause]?.label ?? cause} {s.correct}/{s.total}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span
            className={`text-[12px] font-semibold ${accuracy.thinDataGuardPass ? "text-[#2e7d32]" : "text-[var(--bad)]"}`}
          >
            {accuracy.thinDataGuardPass
              ? "✓ Thin-data guard held"
              : "✗ Thin-data guard violated"}
          </span>
          <span className="rounded-full bg-[var(--ink)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
            {mode === "mock" ? "offline demo · deterministic" : `live · ${model}`}
          </span>
        </div>
      </div>
      {accuracy.misses.length > 0 && (
        <p className="border-t border-[var(--line)] px-5 py-2 text-[12px] text-[var(--ink-3)]">
          Misses:{" "}
          {accuracy.misses
            .map(
              (m) =>
                `${m.partnerId} (${CAUSES[m.expected]?.label ?? m.expected} → ${CAUSES[m.got]?.label ?? m.got})`
            )
            .join(", ")}
        </p>
      )}
    </div>
  );
}
