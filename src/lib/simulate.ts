import { Diagnosis, Partner, PolicyEntry, SimOutcome } from "./types";

// This module and accuracy.ts are the ONLY consumers of partner.trueCause.
// It plays the role of the real world during the 60-day follow-up window:
// the right intervention tends to fix the cause, the wrong one doesn't.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUALITY_BAR = 3.8;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Outcome if the prescribed intervention were approved and executed. Seeded per partner — reproducible. */
export function simulateOutcome(
  partner: Partner,
  diagnosis: Diagnosis,
  policy: PolicyEntry
): SimOutcome {
  const rng = mulberry32(hashString(partner.id));

  if (diagnosis.rootCause === "insufficient_evidence") {
    return {
      ratingAfter: partner.avgRating,
      improved: false,
      escalatedToHuman: false,
      note: "Case held — more data gathered before any action is taken.",
    };
  }

  const matched = diagnosis.rootCause === partner.trueCause;

  if (diagnosis.rootCause === "unimprovable") {
    return matched
      ? {
          ratingAfter: partner.avgRating,
          improved: true,
          escalatedToHuman: false,
          note: "Offboarding executed after human approval — capacity freed for better partners.",
        }
      : {
          ratingAfter: partner.avgRating,
          improved: false,
          escalatedToHuman: true,
          note: "If approved, an improvable partner would be wrongly removed — the false-offboard case the mandatory human gate exists to catch.",
        };
  }

  if (matched && diagnosis.rootCause === "unfair_reviews") {
    return {
      ratingAfter: round2(4.3 + rng() * 0.4),
      improved: true,
      escalatedToHuman: false,
      note: "Unfair reviews moderated out after human confirmation — partner shielded, no penalty applied.",
    };
  }

  if (matched) {
    if (rng() < 0.85) {
      return {
        ratingAfter: round2(QUALITY_BAR + rng() * 0.7),
        improved: true,
        escalatedToHuman: false,
        note: `Partner responded to "${policy.intervention}" — rating recovered above the ${QUALITY_BAR}★ bar over the 60-day window.`,
      };
    }
    return {
      ratingAfter: round2(Math.min(5, partner.avgRating + 0.3)),
      improved: false,
      escalatedToHuman: false,
      note: "Intervention matched the diagnosis but recovery is incomplete after the follow-up window.",
    };
  }

  return {
    ratingAfter: round2(Math.max(1, Math.min(5, partner.avgRating + (rng() * 0.4 - 0.2)))),
    improved: false,
    escalatedToHuman: false,
    note: "No rating recovery observed over the follow-up window.",
  };
}
