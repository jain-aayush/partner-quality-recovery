import customersJson from "../data/customers.json";
import goldenJson from "../data/golden_tags.json";
import reviewsJson from "../data/tag_corpus.json";
import { tagCorpus } from "../src/lib/tag";
import { Customer, ReviewInput } from "../src/lib/tagTypes";
import { VERIFICATION_REVIEW_IDS } from "../src/lib/tagVerification";

const verificationReviews = (reviewsJson as ReviewInput[]).filter((review) =>
  (VERIFICATION_REVIEW_IDS as readonly string[]).includes(review.review_id)
);
const tags = tagCorpus(verificationReviews, customersJson as Customer[]);
const golden = goldenJson as { review_id: string; problem_classes: string[]; severity: number; safety_flag: boolean }[];
const byId = (id: string) => {
  const tag = tags.find((item) => item.review_id === id);
  if (!tag) throw new Error(`missing ${id}`);
  return tag;
};
const results: [string, boolean, string][] = [];
const add = (id: string, pass: boolean, detail: string) => results.push([id, pass, detail]);

add("T1", byId("G1").problem_classes.includes("skill_issue") && byId("G1").evidence_quotes.length > 0, "skill + grounded evidence");
add("T2", byId("G2").problem_classes.includes("time"), "time/rushing");
add("T3", byId("G3").problem_classes.includes("undisclosed_supplies"), "supplies");
add("T4", byId("G4").problem_classes.includes("unfair_review"), "unfair review is only a candidate tag");
add("T5", byId("G5").flags.includes("low_trust_reviewer"), "low-trust context");
add("T6", byId("G6").flags.includes("injection_quarantined") && byId("G6").evidence_quotes.length === 0, "injection quarantined");
add("T7", byId("G7").safety_flag && byId("G7").severity >= 4 && byId("G16").severity < 5, "safety override and no mild over-escalation");
add("T8", byId("G13").flags.includes("thin_text") && byId("G13").problem_classes.length === 0, "thin text");
add("T9", tags.every((tag) => tag.evidence_quotes.every((quote) => verificationReviews.find((review) => review.review_id === tag.review_id)?.review_text.includes(quote))), "100% verbatim evidence");
add("T10", byId("G9").safety_subtype === "grave" && byId("G8").safety_subtype === "lesser", "safety tiers");
add("T11", byId("G10").problem_classes.includes("out_of_taxonomy") && byId("G10").target === "urban_company", "out-of-taxonomy routing");
add("T12", byId("G11").problem_classes.includes("pricing") && byId("G11").target === "pricing", "pricing routing");
add("T13", byId("G2").customer_context.aov_band === "high" && byId("G2").customer_context.karma >= 0.7, "high-value context");
add("T14", byId("G14").problem_classes.includes("skill_issue") && byId("G14").problem_classes.includes("time"), "multi-label");
add("T16", byId("G17").safety_flag && byId("G18").safety_flag && byId("G17").evidence_quotes.length > 0 && byId("G18").evidence_quotes.length > 0, "mixed-sentiment and short-text safety recall");
add("T17", !byId("G19").flags.includes("injection_quarantined") && byId("G19").sentiment === "positive", "genuine praise is not quarantined");
const goldenTags = tags.filter((tag) => golden.some((row) => row.review_id === tag.review_id));
const classAccuracy = goldenTags.filter((tag) => JSON.stringify(tag.problem_classes) === JSON.stringify(golden.find((row) => row.review_id === tag.review_id)?.problem_classes)).length / goldenTags.length;
const severityAccuracy = goldenTags.filter((tag) => Math.abs(tag.severity - (golden.find((row) => row.review_id === tag.review_id)?.severity ?? 0)) <= 1).length / goldenTags.length;
const safetyGold = golden.filter((row) => row.safety_flag);
const safetyRecall = safetyGold.filter((row) => byId(row.review_id).safety_flag && byId(row.review_id).severity >= 4).length / safetyGold.length;
add("T15", classAccuracy >= 0.85 && severityAccuracy >= 0.9 && safetyRecall >= 0.99, `class ${(classAccuracy * 100).toFixed(0)}%, severity ${(severityAccuracy * 100).toFixed(0)}%, safety ${(safetyRecall * 100).toFixed(0)}%`);
for (const [id, pass, detail] of results) console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${detail}`);
const failed = results.filter(([, pass]) => !pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
