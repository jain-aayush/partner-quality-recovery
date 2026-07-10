import { PolicyEntry } from "../lib/types";

const STAKES_STYLES: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

export default function InterventionBadge({ policy }: { policy: PolicyEntry }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-sm font-medium text-zinc-800">
        {policy.intervention}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STAKES_STYLES[policy.stakes]}`}
      >
        {policy.stakes} stakes
      </span>
      {policy.incomeAffecting && (
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold uppercase text-white">
          income-affecting
        </span>
      )}
    </span>
  );
}
