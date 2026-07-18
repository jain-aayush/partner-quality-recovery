/**
 * The shared action vocabulary both sides agree on. The QM picks one of these outcomes on the
 * dashboard; the partner app renders the matching (succinct, calm) message. Kept separate from the
 * pipeline's ActionKind so the QM's *human* choices (incl. "7-day overall pause") are first-class.
 */
import type { Decision } from "./model";

export type OutcomeKind =
  | "keep_watching" // no action / cleared
  | "skill_training"
  | "warning_scrutiny"
  | "supply_kit"
  | "review_protection"
  | "soft_ban_sku" // 7-day pause, this service
  | "soft_ban_platform" // 7-day pause, all services
  | "hard_ban_sku" // permanent removal from one service
  | "offboard" // removal from the platform
  | "safety_pause"; // immediate precautionary pause

/** Short QM-facing label. `sku` fills service-specific outcomes. */
export const OUTCOME: Record<OutcomeKind, { label: (sku: string) => string; incomeAffecting: boolean }> = {
  keep_watching: { label: () => "No action — keep watching", incomeAffecting: false },
  skill_training: { label: () => "Free training", incomeAffecting: false },
  warning_scrutiny: { label: () => "Warning + watch", incomeAffecting: false },
  supply_kit: { label: () => "Supply kit", incomeAffecting: false },
  review_protection: { label: () => "Protect from reviews", incomeAffecting: false },
  soft_ban_sku: { label: (s) => `7-day pause · ${s}`, incomeAffecting: true },
  soft_ban_platform: { label: () => "7-day pause · all services", incomeAffecting: true },
  hard_ban_sku: { label: (s) => `Remove from ${s}`, incomeAffecting: true },
  offboard: { label: () => "Remove from platform", incomeAffecting: true },
  safety_pause: { label: (s) => `Safety pause · ${s}`, incomeAffecting: true },
};

/** What the AI recommended, as an OutcomeKind (the headline of the decision's actions). */
export function suggestedOutcome(d: Decision): OutcomeKind {
  const a = new Set([...d.immediateActions, ...d.actions]);
  if (a.has("offboard")) return "offboard";
  if (a.has("hard_ban")) return "hard_ban_sku";
  if (a.has("safety_pause")) return "safety_pause";
  if (a.has("protective_soft_ban") || a.has("soft_ban")) return "soft_ban_sku";
  if (a.has("review_protection")) return "review_protection";
  if (a.has("supply_kit")) return "supply_kit";
  if (a.has("warning_scrutiny")) return "warning_scrutiny";
  if (a.has("skill_training")) return "skill_training";
  return "keep_watching";
}

/** The consequential actions a QM can escalate to, in order — the "take a different action" menu. */
export const QM_ALTERNATIVES: OutcomeKind[] = ["soft_ban_sku", "soft_ban_platform", "hard_ban_sku", "offboard"];
