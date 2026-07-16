export const PROBLEM_CLASSES = [
  "time",
  "partner_attitude",
  "skill_issue",
  "undisclosed_supplies",
  "unfair_review",
  "pricing",
  "out_of_taxonomy",
] as const;

export type ProblemClass = (typeof PROBLEM_CLASSES)[number];
export type Sentiment = "positive" | "neutral" | "negative";
export type Target = "partner" | "urban_company" | "pricing" | "customer_self" | "irrelevant";
export type SafetySubtype = "grave" | "lesser" | null;
export type TagFlag =
  | "out_of_taxonomy"
  | "injection_quarantined"
  | "thin_text"
  | "non_verbatim"
  | "low_trust_reviewer"
  | "needs_human";

export interface Customer {
  customer_id: string;
  karma: number;
  aov_band: "low" | "med" | "high";
  ltv_band: "low" | "med" | "high";
}

export interface ReviewInput {
  review_id: string;
  order_id: string;
  partner_id: string;
  customer_id: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  review_text: string;
  category: string;
  sku: string | null;
  location: string;
  booking_time: string;
  start_time: string;
}

export interface Tag {
  review_id: string;
  order_id: string;
  partner_id: string;
  sku: string | null;
  location: string;
  sentiment: Sentiment;
  target: Target;
  problem_classes: ProblemClass[];
  problem_detail: { sku: string; skill_gap: string } | null;
  severity: 1 | 2 | 3 | 4 | 5;
  safety_flag: boolean;
  safety_subtype: SafetySubtype;
  evidence_quotes: string[];
  customer_context: Omit<Customer, "customer_id">;
  confidence: number;
  flags: TagFlag[];
  model_version: string;
}

export type RawTag = Omit<Tag, "review_id" | "order_id" | "partner_id" | "sku" | "location" | "customer_context" | "flags" | "model_version">;
export type Tagger = (review: ReviewInput) => RawTag;
