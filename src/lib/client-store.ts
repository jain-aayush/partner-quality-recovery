"use client";

/**
 * Client-side demo state, persisted in localStorage. The QM dashboard (/) and the partner app
 * (/partner) share one browser-local record of QM decisions, partner appeals, and flags on
 * auto-handled cases — so a demo round-trips on Vercel (serverless instances share no memory)
 * and survives refreshes, at zero infra cost. "Reset demo data" in the nav clears it.
 */

import { useSyncExternalStore } from "react";
import type { OutcomeKind } from "./outcomes";

export interface QmDecision {
  partnerId: string;
  sku: string;
  outcome: OutcomeKind; // the action the QM actually applied (keep_watching = rejected)
  suggested: OutcomeKind; // what the AI recommended at decision time (for the oversight tally)
  label: string;
  note: string;
  status: "applied" | "rejected";
  decidedBy: string;
  decidedAt: string;
}

export interface Appeal {
  id: string;
  partnerId: string;
  partnerName: string;
  sku: string;
  cause: string;
  action: string; // the headline action the partner is contesting
  decisionLabel: string; // the partner-facing title they saw
  reason: string;
  createdAt: string;
  status: "open";
}

/** A QM marking an auto-handled case as incorrectly tagged (feeds the oversight tally). */
export interface AutoFlag {
  partnerId: string;
  partnerName: string;
  sku: string;
  autoLabel: string; // the auto action being disputed
  cause: string;
  flaggedAt: string;
}

/** The QM's uploaded CSV — the dataset BOTH routes render, so /partner mirrors the dashboard. */
export interface ActiveCsv {
  name: string;
  csv: string;
  uploadedAt: string;
}

export interface DemoState {
  decisions: Record<string, QmDecision>; // keyed by `${partnerId}|${sku}`
  appeals: Appeal[];
  flags: Record<string, AutoFlag>; // keyed by `${partnerId}|${sku}`
  activeCsv: ActiveCsv | null; // null → bundled sample
}

const KEY = "uc-demo-state-v1";
const EMPTY: DemoState = { decisions: {}, appeals: [], flags: {}, activeCsv: null };

// Cache keyed on the raw string so useSyncExternalStore gets a stable snapshot reference.
let cache: DemoState = EMPTY;
let cacheRaw: string | null = null;

function read(): DemoState {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { return cache; }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try { cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as DemoState) } : EMPTY; }
    catch { cache = EMPTY; }
  }
  return cache;
}

function write(next: DemoState) {
  cache = next;
  cacheRaw = JSON.stringify(next);
  try { window.localStorage.setItem(KEY, cacheRaw); } catch { /* quota/private mode — state stays in-memory */ }
  window.dispatchEvent(new Event("uc-demo-state"));
}

function subscribe(onChange: () => void) {
  // Same-tab writes fire "uc-demo-state"; the browser fires "storage" for other tabs.
  window.addEventListener("uc-demo-state", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("uc-demo-state", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export const demoKey = (partnerId: string, sku: string) => `${partnerId}|${sku}`;

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function saveDecision(input: Omit<QmDecision, "decidedAt">): QmDecision {
  const decision: QmDecision = { ...input, decidedAt: new Date().toISOString() };
  const s = read();
  write({ ...s, decisions: { ...s.decisions, [demoKey(input.partnerId, input.sku)]: decision } });
  return decision;
}

export function fileAppeal(input: Omit<Appeal, "id" | "createdAt" | "status">): Appeal {
  const s = read();
  const appeal: Appeal = { ...input, id: `ap-${s.appeals.length + 1}-${Date.now()}`, createdAt: new Date().toISOString(), status: "open" };
  write({ ...s, appeals: [...s.appeals, appeal] });
  return appeal;
}

export function toggleFlag(input: Omit<AutoFlag, "flaggedAt">) {
  const s = read();
  const k = demoKey(input.partnerId, input.sku);
  const flags = { ...s.flags };
  if (flags[k]) delete flags[k];
  else flags[k] = { ...input, flaggedAt: new Date().toISOString() };
  write({ ...s, flags });
}

/** Set (or clear, with null) the dataset the whole demo runs on. */
export function setActiveCsv(active: { name: string; csv: string } | null) {
  const s = read();
  write({ ...s, activeCsv: active ? { ...active, uploadedAt: new Date().toISOString() } : null });
}

export function resetDemoState() {
  write(EMPTY);
}
