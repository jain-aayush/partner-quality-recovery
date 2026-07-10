import { Config, Diagnosis, Gate, PolicyEntry, RootCause } from "./types";

/**
 * Diagnosis → intervention is a transparent, readable policy table — never a model
 * output. The consequential step stays auditable (PM decision #2).
 */
export const POLICY: Record<RootCause, PolicyEntry> = {
  skill_gap: {
    intervention: "Targeted training module",
    stakes: "low",
    incomeAffecting: false,
  },
  rushing: {
    intervention: "Increased scrutiny + coaching",
    stakes: "medium",
    incomeAffecting: false,
  },
  undisclosed_supplies: {
    intervention: "Supply kit + increased scrutiny",
    stakes: "medium",
    incomeAffecting: false,
  },
  unfair_reviews: {
    intervention: "Review-protection (flag unfair reviews for moderation)",
    stakes: "low",
    incomeAffecting: false,
  },
  unimprovable: {
    intervention: "Offboarding recommendation",
    stakes: "high",
    incomeAffecting: true,
  },
  insufficient_evidence: {
    intervention: "Gather more data / hold diagnosis",
    stakes: "low",
    incomeAffecting: false,
  },
};

/**
 * Route by stakes × confidence. Nothing that can reduce a partner's income is ever
 * automated (PM decision #3); rules are evaluated in order.
 */
export function gate(policy: PolicyEntry, diagnosis: Diagnosis, config: Config): Gate {
  if (policy.incomeAffecting || policy.stakes === "high") {
    return { route: "human_review", reason: "Income-affecting action — human approval is mandatory." };
  }
  if (diagnosis.rootCause === "insufficient_evidence") {
    return { route: "human_review", reason: "Insufficient evidence — a human decides whether to gather more data." };
  }
  if (diagnosis.rootCause === "unfair_reviews") {
    return { route: "human_review", reason: "Review moderation requires human confirmation before shielding." };
  }
  if (!diagnosis.evidenceValid) {
    return { route: "human_review", reason: "Cited evidence could not be verified against source reviews." };
  }
  if (diagnosis.confidence < config.confidenceThreshold) {
    return {
      route: "human_review",
      reason: `Confidence ${diagnosis.confidence.toFixed(2)} below the ${config.confidenceThreshold} auto-approve threshold.`,
    };
  }
  if (policy.stakes === "low") {
    return { route: "auto_approved", reason: "Low-stakes supportive action at high confidence with cited evidence." };
  }
  return { route: "human_review", reason: "Medium-stakes action — reviewed by a human before execution." };
}
