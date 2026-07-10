/** Shared cause presentation tokens. Strong colors are CVD-validated as a set. */
export const CAUSES: Record<
  string,
  { label: string; color: string; tint: string; text: string }
> = {
  skill_gap: { label: "Skill gap", color: "#2a5cdb", tint: "#e8eefc", text: "#1e46b0" },
  rushing: { label: "Rushing", color: "#c2410c", tint: "#fdeee5", text: "#9a3412" },
  undisclosed_supplies: {
    label: "Undisclosed supplies",
    color: "#6e42e5",
    tint: "#f0eafd",
    text: "#572ac8",
  },
  unfair_reviews: { label: "Unfair reviews", color: "#0d9488", tint: "#e6f5f3", text: "#0b7268" },
  unimprovable: { label: "Unimprovable", color: "#dd0017", tint: "#fdeaec", text: "#b30012" },
  insufficient_evidence: {
    label: "Insufficient evidence",
    color: "#757575",
    tint: "#f0f0f0",
    text: "#545454",
  },
};

export function CauseChip({ cause, small }: { cause: string; small?: boolean }) {
  const c = CAUSES[cause] ?? CAUSES.insufficient_evidence;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]"}`}
      style={{ background: c.tint, color: c.text }}
    >
      <span
        className={`rounded-full ${small ? "h-1.5 w-1.5" : "h-2 w-2"}`}
        style={{ background: c.color }}
      />
      {c.label}
    </span>
  );
}
