/**
 * In-app demo store for partner appeals — deliberately in-memory (no DB), per the demo's
 * "one link, two routes" shape. The partner app (/partner) POSTs appeals here and the QM
 * dashboard (/) reads them back, so an appeal round-trips within a single deployment.
 *
 * Caveat (documented on purpose): on serverless this lives per-instance and resets on cold
 * start — fine for a demo, not durable. Swap `store` for a KV/Redis client to make it real.
 * Backed by globalThis so Next.js dev hot-reload doesn't wipe it between edits.
 */

export interface Appeal {
  id: string;
  partnerId: string;
  partnerName: string;
  sku: string;
  cause: string; // diagnosed root cause of the decision being appealed
  action: string; // the headline action the partner is contesting
  decisionLabel: string; // the partner-facing title they saw
  reason: string; // the partner's free-text response
  createdAt: string; // ISO timestamp
  status: "open";
}

interface Store { appeals: Appeal[]; seq: number }
const g = globalThis as unknown as { __ucAppeals?: Store };
const store: Store = g.__ucAppeals ?? (g.__ucAppeals = { appeals: [], seq: 0 });

/** Newest first. */
export function listAppeals(): Appeal[] {
  return [...store.appeals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addAppeal(input: Omit<Appeal, "id" | "createdAt" | "status">): Appeal {
  const appeal: Appeal = { ...input, id: `ap-${++store.seq}`, createdAt: new Date().toISOString(), status: "open" };
  store.appeals.push(appeal);
  return appeal;
}
