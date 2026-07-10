import { PolicyEntry } from "../lib/types";

const STAKES: Record<string, { label: string; cls: string }> = {
  low: { label: "Low stakes", cls: "bg-[#eef7ee] text-[#2e7d32]" },
  medium: { label: "Medium stakes", cls: "bg-[#fdf3d7] text-[#92400e]" },
  high: { label: "High stakes", cls: "bg-[#fdeaec] text-[#b30012]" },
};

export default function InterventionBadge({ policy }: { policy: PolicyEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-semibold text-[var(--ink)]">{policy.intervention}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STAKES[policy.stakes].cls}`}
      >
        {STAKES[policy.stakes].label}
      </span>
      {policy.incomeAffecting && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bad)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          Income-affecting
        </span>
      )}
    </div>
  );
}
