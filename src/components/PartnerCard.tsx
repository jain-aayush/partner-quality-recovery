"use client";

import { useState } from "react";
import { PartnerCase } from "../lib/types";
import { CAUSES, CauseChip } from "./causes";
import DiagnosisPanel from "./DiagnosisPanel";
import InterventionBadge from "./InterventionBadge";

export type Decision = { choice: "approved" | "rejected"; rationale?: string };

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
  const correct = c.diagnosis.rootCause === c.partner.trueCause;
  const initials = c.partner.name
    .split(" ")
    .map((w) => w[0])
    .join("");

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-4 transition-shadow hover:shadow-[0_2px_12px_rgba(15,15,15,0.06)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f0eafd] text-[13px] font-bold text-[var(--brand-deep)]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[15px] font-bold">{c.partner.name}</span>
            <span className="font-mono text-[11px] text-[var(--ink-3)]">{c.partner.id}</span>
          </div>
          <div className="mt-0.5 text-[12px] leading-relaxed text-[var(--ink-3)]">
            <span className="font-semibold text-[var(--ink-2)]">
              <span className="text-[var(--good)]">★</span> {c.partner.avgRating.toFixed(2)}
            </span>{" "}
            · {c.partner.reviewCount} reviews · {c.partner.zone} ·{" "}
            {c.partner.services.slice(0, 3).join(", ")} · {c.partner.monthlyBookings} bookings/mo ·
            rebook {Math.round(c.partner.rebookRate * 100)}%
          </div>
        </div>
        <CauseChip cause={c.diagnosis.rootCause} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
        <InterventionBadge policy={c.policy} />
        {revealTruth && (
          <span
            className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
              correct
                ? "border-[var(--good)] text-[#2e7d32]"
                : "border-[var(--bad)] text-[var(--bad)]"
            }`}
          >
            {correct ? "✓" : "✗"} truth:{" "}
            {CAUSES[c.partner.trueCause]?.label ?? c.partner.trueCause}
          </span>
        )}
      </div>

      <button
        onClick={() => setOpen(!open)}
        className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--brand-deep)] hover:underline"
      >
        <span
          aria-hidden
          className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
        Diagnosis &amp; evidence
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-[var(--page)] p-3.5">
          <DiagnosisPanel diagnosis={c.diagnosis} threshold={threshold} />
        </div>
      )}

      {actions}

      {executed ? (
        <div
          className={`mt-3 rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
            c.simulated.improved ? "bg-[#eef7ee] text-[#1e5c22]" : "bg-[#fdf3d7] text-[#7c3d0e]"
          }`}
        >
          <span className="font-bold">
            {c.simulated.improved ? "✓" : "⏳"} 60-day outcome:{" "}
            {c.simulated.improved ? "recovered" : "not recovered"} (★
            {c.simulated.ratingAfter.toFixed(2)})
          </span>{" "}
          — {c.simulated.note}
          {c.simulated.escalatedToHuman && (
            <span className="mt-1 block font-semibold">
              ↳ Escalated to human root-cause review.
            </span>
          )}
        </div>
      ) : decision?.choice === "rejected" ? (
        <div className="mt-3 rounded-xl bg-[var(--page)] px-3.5 py-2.5 text-[13px] text-[var(--ink-2)]">
          Rejected by reviewer — no action taken against the partner.
        </div>
      ) : null}
    </div>
  );
}
