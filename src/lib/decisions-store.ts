/**
 * In-app demo store for the QM's applied decisions (one per partner × SKU). The dashboard writes
 * here when a QM approves / overrides / rejects; the partner app reads it back so the QM's actual
 * choice — not just the AI suggestion — is what the partner sees. In-memory (demo), globalThis-backed
 * for dev hot-reload. Swap for KV/Redis to make durable.
 */
import type { OutcomeKind } from "./outcomes";

export interface QmDecision {
  partnerId: string;
  sku: string;
  outcome: OutcomeKind; // the action the QM actually applied (or keep_watching = rejected)
  label: string; // human-readable label shown at decision time
  note: string; // QM's rationale
  status: "applied" | "rejected"; // rejected = keep_watching / no action
  decidedBy: string;
  decidedAt: string;
}

interface Store { byKey: Map<string, QmDecision> }
const g = globalThis as unknown as { __ucDecisions?: Store };
const store: Store = g.__ucDecisions ?? (g.__ucDecisions = { byKey: new Map() });
const keyOf = (partnerId: string, sku: string) => `${partnerId}|${sku}`;

export function listDecisions(): QmDecision[] {
  return [...store.byKey.values()].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
}
export function getDecision(partnerId: string, sku: string): QmDecision | undefined {
  return store.byKey.get(keyOf(partnerId, sku));
}
export function setDecision(input: Omit<QmDecision, "decidedAt">): QmDecision {
  const decision: QmDecision = { ...input, decidedAt: new Date().toISOString() };
  store.byKey.set(keyOf(input.partnerId, input.sku), decision);
  return decision;
}
