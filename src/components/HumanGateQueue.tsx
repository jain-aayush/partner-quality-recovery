"use client";

import { useState } from "react";
import { PartnerCase } from "../lib/types";
import PartnerCard, { Decision } from "./PartnerCard";

function CaseActions({
  c,
  onDecide,
}: {
  c: PartnerCase;
  onDecide: (choice: Decision["choice"], rationale?: string) => void;
}) {
  const [rationale, setRationale] = useState("");
  const highStakes = c.policy.stakes === "high" || c.policy.incomeAffecting;

  return (
    <div className="mt-3 space-y-2.5 rounded-xl border border-[var(--line)] bg-[var(--page)] p-3.5">
      <div className="text-[12px] leading-relaxed text-[var(--ink-2)]">
        <span className="font-bold text-[var(--ink)]">Awaiting your decision.</span>{" "}
        {c.gate.reason}
      </div>
      {highStakes && (
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Decision rationale — required for income-affecting actions
          </label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Record what evidence you reviewed and why you're approving…"
            className="w-full rounded-lg border border-[var(--line)] bg-white p-2.5 text-[13px] outline-none focus:border-[var(--brand)]"
            rows={2}
          />
        </div>
      )}
      <div className="flex gap-2">
        <button
          disabled={highStakes && rationale.trim().length === 0}
          onClick={() => onDecide("approved", rationale.trim() || undefined)}
          className="rounded-lg bg-[var(--ink)] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#212121] disabled:cursor-not-allowed disabled:bg-[#c9c9c9]"
        >
          Approve
        </button>
        <button
          onClick={() => onDecide("rejected")}
          className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--ink-2)] transition-colors hover:bg-[var(--page)]"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default function HumanGateQueue({
  cases,
  decisions,
  onDecide,
  threshold,
  revealTruth,
}: {
  cases: PartnerCase[];
  decisions: Record<string, Decision>;
  onDecide: (partnerId: string, choice: Decision["choice"], rationale?: string) => void;
  threshold: number;
  revealTruth: boolean;
}) {
  const pending = cases.filter((c) => !decisions[c.partner.id]);
  return (
    <div className="space-y-3">
      {cases.map((c) => {
        const decision = decisions[c.partner.id];
        return (
          <PartnerCard
            key={c.partner.id}
            c={c}
            threshold={threshold}
            revealTruth={revealTruth}
            decision={decision}
            actions={
              !decision ? (
                <CaseActions
                  c={c}
                  onDecide={(choice, rationale) => onDecide(c.partner.id, choice, rationale)}
                />
              ) : null
            }
          />
        );
      })}
      {pending.length === 0 && cases.length > 0 && (
        <p className="rounded-xl border border-dashed border-[var(--line)] bg-white py-4 text-center text-[13px] font-medium text-[var(--ink-3)]">
          Queue cleared — every case has a named human decision.
        </p>
      )}
    </div>
  );
}
