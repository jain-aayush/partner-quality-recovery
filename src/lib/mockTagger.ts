import { RawTag, ReviewInput, Tagger } from "./tagTypes";

type Rule = { cls: RawTag["problem_classes"][number]; words: string[]; target?: RawTag["target"]; severity: 1 | 2 | 3 | 4 | 5 };
const RULES: Rule[] = [
  { cls: "skill_issue", words: ["patchy", "uneven", "wrong shade", "crooked", "botched", "incorrect diagnosis", "missed sections"], severity: 3 },
  { cls: "time", words: ["rushed", "late", "left early", "cut short", "in a hurry", "half done"], severity: 2 },
  { cls: "undisclosed_supplies", words: ["substituted", "unbranded", "no bill", "no invoice", "cheap product", "refilled", "canister"], severity: 3 },
  { cls: "partner_attitude", words: ["rude", "shouted", "abusive", "misbehaved", "argued"], severity: 3 },
  { cls: "unfair_review", words: ["already damaged", "unrealistic", "different hair", "not in my package", "unfixable"], target: "customer_self", severity: 2 },
  { cls: "pricing", words: ["hidden charge", "charged", "overpriced", "price", "labour capped", "paise waste", "lutere"], target: "pricing", severity: 2 },
  { cls: "out_of_taxonomy", words: ["app crashed", "parking", "booking flow", "cancellation policy"], target: "urban_company", severity: 2 },
];

function quote(text: string, word: string): string {
  return text.split(/(?<=[.!?])\s+/).find((line) => line.toLowerCase().includes(word))?.trim() ?? text.trim();
}

export const mockTagReview: Tagger = (review: ReviewInput): RawTag => {
  const text = review.review_text;
  const lower = text.toLowerCase();
  const hits = RULES.flatMap((rule) => {
    const word = rule.words.find((candidate) => lower.includes(candidate));
    return word ? [{ rule, word }] : [];
  });
  const negative = hits.length > 0 || (review.rating !== null && review.rating <= 2);
  if (!negative) return { sentiment: review.rating !== null && review.rating >= 4 ? "positive" : "neutral", target: "irrelevant", problem_classes: [], problem_detail: null, severity: 1, safety_flag: false, safety_subtype: null, evidence_quotes: [], confidence: 1 };
  const classes = [...new Set(hits.map((hit) => hit.rule.cls))];
  const first = hits[0];
  const skill = classes.includes("skill_issue");
  return {
    sentiment: "negative", target: first?.rule.target ?? "partner", problem_classes: classes,
    problem_detail: skill && review.sku ? { sku: review.sku, skill_gap: "service_quality_gap" } : null,
    severity: Math.max(1, ...hits.map((hit) => hit.rule.severity)) as RawTag["severity"], safety_flag: false, safety_subtype: null,
    evidence_quotes: [...new Set(hits.slice(0, 3).map((hit) => quote(text, hit.word)))], confidence: hits.length ? 0.86 : 0.45,
  };
};
