export type RootCause =
  | "skill_gap"
  | "rushing"
  | "undisclosed_supplies"
  | "unfair_reviews"
  | "unimprovable"
  | "insufficient_evidence";

export const ROOT_CAUSES: RootCause[] = [
  "skill_gap",
  "rushing",
  "undisclosed_supplies",
  "unfair_reviews",
  "unimprovable",
  "insufficient_evidence",
];

/** Hidden ground truth carried by synthetic partners. Healthy partners are never flagged. */
export type TrueCause = Exclude<RootCause, "insufficient_evidence"> | "healthy";

export interface Partner {
  id: string;
  name: string;
  zone: string;
  services: string[];
  tenureMonths: number;
  avgRating: number;
  reviewCount: number;
  completionRate: number;
  cancellationRate: number;
  rebookRate: number;
  monthlyBookings: number;
  trueCause: TrueCause;
}

/** The only partner shape a diagnoser is ever allowed to see. */
export type PartnerPublic = Omit<Partner, "trueCause">;

export interface Review {
  id: string;
  partnerId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  service: string;
  text: string;
  date: string;
}

export interface Diagnosis {
  partnerId: string;
  rootCause: RootCause;
  confidence: number;
  evidenceQuotes: string[];
  secondaryHypothesis: RootCause | null;
  reasoning: string;
  /** Review ids excluded from the corpus as suspected prompt injection. */
  flaggedReviews: string[];
  /** False when cited quotes could not be verified against the source reviews. */
  evidenceValid: boolean;
}

export interface Config {
  mode: "mock" | "llm";
  model: string;
  confidenceThreshold: number;
  minReviews: number;
  ratingFlagThreshold: number;
  apiKey?: string;
}

export type Stakes = "low" | "medium" | "high";

export interface PolicyEntry {
  intervention: string;
  stakes: Stakes;
  incomeAffecting: boolean;
}

export type GateRoute = "auto_approved" | "human_review";

export interface Gate {
  route: GateRoute;
  reason: string;
}

export interface SimOutcome {
  ratingAfter: number;
  improved: boolean;
  escalatedToHuman: boolean;
  note: string;
}

export interface PartnerCase {
  /** Includes trueCause — used only for display reveal and accuracy scoring, never diagnosis. */
  partner: Partner;
  diagnosis: Diagnosis;
  policy: PolicyEntry;
  gate: Gate;
  simulated: SimOutcome;
}

export interface AccuracyReport {
  total: number;
  correct: number;
  accuracy: number;
  perCause: Record<string, { correct: number; total: number }>;
  thinDataGuardPass: boolean;
  misses: { partnerId: string; expected: RootCause; got: RootCause }[];
}

export interface PipelineResult {
  mode: "mock" | "llm";
  model: string | null;
  flagged: PartnerCase[];
  accuracy: AccuracyReport;
  config: {
    confidenceThreshold: number;
    minReviews: number;
    ratingFlagThreshold: number;
  };
}
