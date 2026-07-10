import { Diagnosis } from "../lib/types";
import { CAUSES, CauseChip } from "./causes";

export default function DiagnosisPanel({
  diagnosis,
  threshold,
}: {
  diagnosis: Diagnosis;
  threshold: number;
}) {
  const pct = Math.round(diagnosis.confidence * 100);
  const above = diagnosis.confidence >= threshold;
  const cause = CAUSES[diagnosis.rootCause];

  return (
    <div className="space-y-3.5 text-[13px]">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Model confidence
          </span>
          <span className="font-semibold text-[var(--ink)]">
            {pct}%{" "}
            <span className="font-normal text-[var(--ink-3)]">
              · auto-clear bar {Math.round(threshold * 100)}%
            </span>
          </span>
        </div>
        {/* meter: fill carries state, track is a lighter step of the same ramp */}
        <div
          className="relative h-1.5 rounded-full"
          style={{ background: above ? "#ede7fd" : "#fdf3d7" }}
        >
          <div
            className="h-1.5 rounded-full"
            style={{ width: `${pct}%`, background: above ? "var(--brand)" : "#d97706" }}
          />
          <div
            className="absolute top-[-3px] h-3 w-0.5 rounded bg-[var(--ink)]"
            style={{ left: `${threshold * 100}%` }}
            title={`auto-clear threshold ${Math.round(threshold * 100)}%`}
          />
        </div>
      </div>

      <p className="leading-relaxed text-[var(--ink-2)]">{diagnosis.reasoning}</p>

      {diagnosis.evidenceQuotes.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Cited evidence — verbatim from reviews
          </div>
          <ul className="space-y-1.5">
            {diagnosis.evidenceQuotes.map((q, i) => (
              <li
                key={i}
                className="rounded-r-lg border-l-2 bg-white py-1.5 pl-3 pr-2 italic leading-snug text-[var(--ink-2)]"
                style={{ borderColor: cause?.color ?? "var(--line)" }}
              >
                “{q}”
              </li>
            ))}
          </ul>
        </div>
      )}

      {!diagnosis.evidenceValid && (
        <p className="flex items-start gap-1.5 rounded-lg bg-[#fdf3d7] px-3 py-2 font-medium text-[#92400e]">
          <span aria-hidden>⚠</span> Cited evidence could not be verified against source reviews —
          confidence downgraded, case routed to a human.
        </p>
      )}

      {diagnosis.secondaryHypothesis && (
        <p className="flex items-center gap-2 text-[var(--ink-3)]">
          Dissenting hypothesis <CauseChip cause={diagnosis.secondaryHypothesis} small />
        </p>
      )}

      {diagnosis.flaggedReviews.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-[#fdeaec] px-3 py-2 font-medium text-[#b30012]">
          <span aria-hidden>⛨</span> {diagnosis.flaggedReviews.length} review(s) quarantined as
          suspected prompt injection ({diagnosis.flaggedReviews.join(", ")}) — excluded from the
          corpus before the model saw it.
        </p>
      )}
    </div>
  );
}
