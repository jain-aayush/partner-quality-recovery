"use client";

import { useState } from "react";
import { PartnerCase } from "../lib/types";
import DiagnosisPanel, { CAUSE_LABELS } from "./DiagnosisPanel";
import InterventionBadge from "./InterventionBadge";

export type Decision = { choice: "approved" | "rejected"; rationale?: string };

const CAUSE_CHIP: Record<string, string> = {
  skill_gap: "bg-blue-100 text-blue-800",
  rushing: "bg-orange-100 text-orange-800",
  undisclosed_supplies: "bg-purple-100 text-purple-800",
  unfair_reviews: "bg-teal-100 text-teal-800",
  unimprovable: "bg-red-100 text-red-800",
  insufficient_evidence: "bg-zinc-200 text-zinc-700",
};

export default function PartnerCard({
  c,
  threshold,
  revealTruth,
  decision,
  actions,
}: {
  c: PartnerCase;
  threshold: number;
  revealTruth: boolean;
  decision?: Decision;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const executed = c.gate.route === "auto_approved" || decision?.choice === "approved";
  const correct = revealTruth && c.diagnosis.rootCause === c.partner.trueCause;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{c.partner.name}</span>
            <span className="font-mono text-xs text-zinc-400">{c.partner.id}</span>
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {c.partner.zone} · {c.partner.services.join(", ")} · ★{c.partner.avgRating.toFixed(2)}{" "}
            · {c.partner.reviewCount} reviews · {c.partner.monthlyBookings} bookings/mo · rebook{" "}
            {Math.round(c.partner.rebookRate * 100)}%
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${CAUSE_CHIP[c.diagnosis.rootCause]}`}
        >
          {CAUSE_LABELS[c.diagnosis.rootCause]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <InterventionBadge policy={c.policy} />
        {revealTruth && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${correct ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
          >
            truth: {CAUSE_LABELS[c.partner.trueCause] ?? c.partner.trueCause}
            {correct ? " ✓" : " ✗"}
          </span>
        )}
      </div>

      <button
        onClick={() => setOpen(!open)}
        className="mt-3 text-xs font-medium text-blue-600 hover:underline"
      >
        {open ? "Hide diagnosis ▲" : "Show diagnosis & evidence ▼"}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-zinc-50 p-3">
          <DiagnosisPanel diagnosis={c.diagnosis} threshold={threshold} />
        </div>
      )}

      {actions}

      {executed ? (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${c.simulated.improved ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
        >
          <span className="font-semibold">
            60-day outcome: {c.simulated.improved ? "recovered" : "not recovered"} (★
            {c.simulated.ratingAfter.toFixed(2)})
          </span>{" "}
          — {c.simulated.note}
          {c.simulated.escalatedToHuman && (
            <span className="mt-1 block font-medium">↳ Escalated to human root-cause review.</span>
          )}
        </div>
      ) : decision?.choice === "rejected" ? (
        <div className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
          Rejected by reviewer — no action taken against the partner.
        </div>
      ) : null}
    </div>
  );
}
