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
    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-zinc-300 p-3">
      <div className="text-xs text-zinc-500">
        <span className="font-semibold text-zinc-700">Needs human decision:</span> {c.gate.reason}
      </div>
      {highStakes && (
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Required: record your rationale before approving an income-affecting action…"
          className="w-full rounded-md border border-zinc-300 p-2 text-sm"
          rows={2}
        />
      )}
      <div className="flex gap-2">
        <button
          disabled={highStakes && rationale.trim().length === 0}
          onClick={() => onDecide("approved", rationale.trim() || undefined)}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          Approve
        </button>
        <button
          onClick={() => onDecide("rejected")}
          className="rounded-md bg-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-300"
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
        <p className="text-center text-sm text-zinc-500">Queue cleared — all cases decided.</p>
      )}
    </div>
  );
}
