/**
 * The "current active dataset" both routes share. When the QM uploads a CSV on the dashboard we
 * stash the parsed rows here; the partner app (a separate route) then reads the SAME dataset, so
 * what a partner sees matches what was uploaded — not the bundled sample. In-memory (demo),
 * globalThis-backed for dev hot-reload. Null rows = fall back to the bundled sample.
 */
import type { OrderRow } from "./unified";

interface Store { rows: OrderRow[] | null; source: "sample" | "upload" }
const g = globalThis as unknown as { __ucDataset?: Store };
const store: Store = g.__ucDataset ?? (g.__ucDataset = { rows: null, source: "sample" });

export function setDataset(rows: OrderRow[] | null, source: "sample" | "upload") {
  store.rows = rows;
  store.source = source;
}
export function getDataset(): Store {
  return store;
}
