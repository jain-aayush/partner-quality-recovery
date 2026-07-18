/**
 * v2 pipeline entry. The whole console is driven by one unified review dataset (see unified.ts):
 * bundled by default (data/uc-sample.json), or an uploaded CSV. Recent reviews → this cycle's
 * decisions; dated history + intervention columns → the progress tracker.
 */

import ucSample from "../../data/uc-sample.json";
import { runFromRows, OrderRow, TagFn, UnifiedResult } from "./unified";

export type { SkuCase, PartnerRollup } from "./unified";
export type Pipeline2Result = UnifiedResult;

export function sampleRows(): OrderRow[] {
  return ucSample as unknown as OrderRow[];
}

export function runPipeline2(tagFn?: TagFn): UnifiedResult {
  return runFromRows(sampleRows(), tagFn);
}
