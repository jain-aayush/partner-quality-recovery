import customersJson from "../../../data/customers.json";
import reviewsJson from "../../../data/tag_corpus.json";
import { tagCorpus } from "../../lib/tag";
import { Customer, ReviewInput } from "../../lib/tagTypes";
import { VERIFICATION_REVIEW_IDS } from "../../lib/tagVerification";

const verificationReviews = (reviewsJson as ReviewInput[]).filter((review) =>
  (VERIFICATION_REVIEW_IDS as readonly string[]).includes(review.review_id)
);
const tags = tagCorpus(verificationReviews, customersJson as Customer[]);
const reviewsById = new Map(verificationReviews.map((review) => [review.review_id, review]));

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "alert" | "safe" }) {
  const styles = tone === "alert" ? "bg-[#fdeaec] text-[#b30012]" : tone === "safe" ? "bg-[#eef7ee] text-[#2e7d32]" : "bg-[#f2f0ff] text-[var(--brand-deep)]";
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${styles}`}>{children}</span>;
}

export default function System1Page() {
  const negative = tags.filter((tag) => tag.sentiment === "negative");
  const safety = tags.filter((tag) => tag.safety_flag);
  const flagged = tags.filter((tag) => tag.flags.length > 0);
  const rows = tags.filter((tag) => tag.sentiment === "negative" || tag.safety_flag || tag.flags.length > 0);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-10 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--brand-deep)]">System 1 · Review tagging</div>
          <h1 className="mt-2 text-[30px] font-extrabold tracking-tight">One review in. Grounded structured signal out.</h1>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-[var(--ink-2)]">
            This sanity run tags 16 curated reviews—not the entire corpus. Safety, injection, thin-text and evidence checks are deterministic guardrails; this page does not make any partner-level decision.
          </p>
        </div>
        <Pill tone="safe">mock mode · no API spend</Pill>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [String(tags.length), "Reviews tagged", "curated sanity batch"],
          [String(negative.length), "Complaint tags", "structured classification"],
          [String(safety.length), "Safety flags", "severity forced to ≥4"],
          [String(flagged.length), "Human-routing flags", "thin text, injection or trust context"],
        ].map(([value, label, sub]) => <div key={label} className="rounded-2xl border border-[var(--line)] bg-white px-5 py-4"><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</div><div className="mt-1 text-[28px] font-extrabold leading-none">{value}</div><div className="mt-1 text-[12px] text-[var(--ink-3)]">{sub}</div></div>)}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
        <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-[16px] font-bold">Tag audit trail</h2><p className="mt-1 text-[12px] text-[var(--ink-3)]">Curated fixtures cover every complaint class, safety tier, and input guardrail.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-[13px]"><thead><tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]"><th className="px-5 py-3">Review</th><th className="px-3 py-3">Tag</th><th className="px-3 py-3">Evidence</th><th className="px-3 py-3">Severity</th><th className="px-5 py-3">Guardrails</th></tr></thead><tbody className="divide-y divide-[var(--line)]">{rows.map((tag) => { const review = reviewsById.get(tag.review_id)!; return <tr key={tag.review_id} className="align-top"><td className="max-w-md px-5 py-3"><div className="font-mono text-[11px] text-[var(--ink-3)]">{tag.review_id} · {review.sku}</div><p className="mt-1 leading-relaxed text-[var(--ink-2)]">{review.review_text || "Rating without review text"}</p></td><td className="px-3 py-3"><div className="flex min-w-[160px] flex-wrap gap-1">{tag.problem_classes.length ? tag.problem_classes.map((item) => <Pill key={item}>{item}</Pill>) : <span className="text-[var(--ink-3)]">No complaint class</span>}</div><div className="mt-2 text-[11px] text-[var(--ink-3)]">target: {tag.target} · {tag.sentiment}</div></td><td className="max-w-xs px-3 py-3 text-[12px] leading-relaxed text-[var(--ink-2)]">{tag.evidence_quotes.length ? `“${tag.evidence_quotes[0]}”` : "—"}</td><td className="px-3 py-3"><Pill tone={tag.safety_flag ? "alert" : "neutral"}>{tag.severity}/5{tag.safety_flag ? ` · ${tag.safety_subtype}` : ""}</Pill></td><td className="px-5 py-3"><div className="flex min-w-[140px] flex-wrap gap-1">{tag.flags.length ? tag.flags.map((flag) => <Pill key={flag} tone={flag.includes("injection") ? "alert" : "neutral"}>{flag}</Pill>) : <span className="text-[var(--ink-3)]">verified</span>}</div></td></tr>; })}</tbody></table></div>
      </section>
    </main>
  );
}
