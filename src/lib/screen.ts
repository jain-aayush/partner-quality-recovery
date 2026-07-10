import { Partner } from "./types";

/** Screening is a deterministic metric rule, not AI (PM decision #1). */
export function flagPartners(partners: Partner[], ratingThreshold: number): Partner[] {
  return partners.filter((p) => p.avgRating < ratingThreshold);
}
