/**
 * Simulated 12-week pilot history for the oversight view — how often partners appealed and how
 * often the QM disagreed with (overrode) the system, week by week. Deterministic literals, styled
 * after a pilot that improves as thresholds and the tagger get tuned: both series trend down,
 * which is the evidence that the system's calls are increasingly trusted. Live session activity
 * (localStorage) is shown alongside, never mixed into this history.
 */

export interface OversightWeek {
  label: string; // week-commencing, matches the sample-data timeline ending 29 Jun
  reviewed: number; // cases the console surfaced that week
  appeals: number; // partner appeals filed
  overrides: number; // QM decisions that disagreed with the AI suggestion
}

export const OVERSIGHT_HISTORY: OversightWeek[] = [
  { label: "13 Apr", reviewed: 41, appeals: 16, overrides: 11 },
  { label: "20 Apr", reviewed: 44, appeals: 14, overrides: 10 },
  { label: "27 Apr", reviewed: 39, appeals: 13, overrides: 8 },
  { label: "4 May", reviewed: 42, appeals: 11, overrides: 8 },
  { label: "11 May", reviewed: 40, appeals: 9, overrides: 7 },
  { label: "18 May", reviewed: 43, appeals: 9, overrides: 6 },
  { label: "25 May", reviewed: 41, appeals: 7, overrides: 5 },
  { label: "1 Jun", reviewed: 38, appeals: 6, overrides: 5 },
  { label: "8 Jun", reviewed: 42, appeals: 6, overrides: 4 },
  { label: "15 Jun", reviewed: 40, appeals: 5, overrides: 3 },
  { label: "22 Jun", reviewed: 39, appeals: 4, overrides: 3 },
  { label: "29 Jun", reviewed: 41, appeals: 3, overrides: 2 },
];
