import { Diagnosis } from "../lib/types";

export const CAUSE_LABELS: Record<string, string> = {
  skill_gap: "Skill gap",
  rushing: "Rushing",
  undisclosed_supplies: "Undisclosed supplies",
  unfair_reviews: "Unfair reviews",
  unimprovable: "Unimprovable",
  insufficient_evidence: "Insufficient evidence",
};

export default function DiagnosisPanel({
  diagnosis,
  threshold,
}: {
  diagnosis: Diagnosis;
  threshold: number;
}) {
  const pct = Math.round(diagnosis.confidence * 100);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Confidence</span>
          <span className="font-mono text-xs text-zinc-600">
            {pct}% (auto-approve bar: {Math.round(threshold * 100)}%)
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-zinc-200">
          <div
            className={`h-2 rounded-full ${diagnosis.confidence >= threshold ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-[-3px] h-3.5 w-0.5 bg-zinc-700"
            style={{ left: `${threshold * 100}%` }}
            title={`threshold ${threshold}`}
          />
        </div>
      </div>

      <p className="text-zinc-700">{diagnosis.reasoning}</p>

      {diagnosis.evidenceQuotes.length > 0 && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
            Cited evidence (verbatim from reviews)
          </div>
          <ul className="space-y-1">
            {diagnosis.evidenceQuotes.map((q, i) => (
              <li key={i} className="border-l-2 border-zinc-300 pl-2 italic text-zinc-600">
                “{q}”
              </li>
            ))}
          </ul>
        </div>
      )}

      {!diagnosis.evidenceValid && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-800">
          ⚠ Cited evidence could not be verified against source reviews — confidence downgraded,
          case sent to a human.
        </p>
      )}

      {diagnosis.secondaryHypothesis && (
        <p className="text-zinc-500">
          Dissenting hypothesis:{" "}
          <span className="font-medium text-zinc-700">
            {CAUSE_LABELS[diagnosis.secondaryHypothesis]}
          </span>
        </p>
      )}

      {diagnosis.flaggedReviews.length > 0 && (
        <p className="rounded bg-red-50 px-2 py-1 text-red-800">
          ⚠ {diagnosis.flaggedReviews.length} review(s) quarantined as suspected prompt injection
          ({diagnosis.flaggedReviews.join(", ")}) — excluded from the evidence the model saw.
        </p>
      )}
    </div>
  );
}
