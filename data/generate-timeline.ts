/**
 * Timeline generator — the "already in training from prior weeks" dataset that drives the real
 * week-over-week progress view. Same tracked partners, ~12 weeks of reviews, an explicit
 * intervention week, and genuine rate changes (recovered / improving / stalled).
 *
 * Emits data/timeline.json (canonical rows the app reads) and data/timeline-sample.csv (the exact
 * upload format, so a QM can replace it with their own multi-week export). Deterministic.
 * Run: npm run generate:timeline
 */
import { writeFileSync } from "node:fs";

const WEEKS = 12;
const INTERVENTION_WEEK = 4;
const BASE = new Date("2026-04-06T00:00:00Z"); // week 0 Monday

interface Row {
  reviewId: string; partnerId: string; partnerName: string; sku: string; customerId: string;
  karma: number; aovBand: "low" | "medium" | "high"; rating: number; text: string; date: string;
  weeklyBookings: number; intervention: string;
}

const COMPLAINT: Record<string, string> = {
  skill: "The colour came out patchy on one side.",
  time: "She was in a hurry and left early before it was done.",
  supplies: "She used some cheap product, not the brand promised.",
};
const POSITIVE = "Great job, very happy with the service.";
const ACTION: Record<string, string> = { skill: "skill_training", time: "warning_scrutiny", supplies: "supply_kit" };

// tracked partners: [id, name, sku, cause, weekly complaint counts over 12 weeks].
// Measurement is 15d pre (wks 3–4) vs 15d post-completion (wks 7–8), i.e. counts[2..3] vs [6..7].
const TRACKED: [string, string, string, keyof typeof COMPLAINT, number[]][] = [
  ["t01", "Anita Rao", "Hair Coloring", "skill", [6, 6, 6, 6, 6, 4, 3, 2, 1, 1, 0, 0]], // recovered (big drop)
  ["t02", "Meena Joshi", "Facial", "skill", [5, 6, 6, 6, 6, 4, 2, 2, 1, 1, 1, 0]], // recovered
  ["t03", "Sunita Devi", "Waxing", "time", [6, 6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4]], // improving (~17%)
  ["t04", "Reena Malik", "Hair Coloring", "supplies", [6, 6, 6, 6, 6, 5, 5, 5, 4, 4, 3, 3]], // improving
  ["t05", "Kavya Nair", "Manicure", "skill", [6, 6, 6, 6, 6, 6, 6, 6, 5, 6, 5, 6]], // stalled (flat)
  ["t06", "Pooja Iyer", "Haircut", "time", [5, 6, 6, 6, 6, 6, 6, 6, 6, 5, 6, 6]], // stalled
];

const WEEKLY_BOOKINGS = 24;
const POSITIVES_PER_WEEK = 2;

const rows: Row[] = [];
for (const [pid, name, sku, cause, counts] of TRACKED) {
  for (let w = 0; w < WEEKS; w++) {
    const date = new Date(BASE.getTime() + w * 7 * 86400000).toISOString().slice(0, 10);
    const intervention = w === INTERVENTION_WEEK ? ACTION[cause] : "";
    const nComplaints = counts[w];
    for (let k = 0; k < nComplaints; k++) {
      // Uniform normal-trust reviewers in the tracker, so the weekly rate = raw complaints ÷ bookings
      // (trust-weighting is exercised in the decision queue, not needed for the trend).
      rows.push({
        reviewId: `${pid}-w${w}-c${k}`, partnerId: pid, partnerName: name, sku,
        customerId: `${pid}-w${w}-c${k}-cust`, karma: 0.8, aovBand: "medium",
        rating: k % 2 === 0 ? 2 : 1, text: COMPLAINT[cause], date, weeklyBookings: WEEKLY_BOOKINGS, intervention,
      });
    }
    for (let k = 0; k < POSITIVES_PER_WEEK; k++) {
      rows.push({
        reviewId: `${pid}-w${w}-p${k}`, partnerId: pid, partnerName: name, sku,
        customerId: `${pid}-w${w}-p${k}-cust`, karma: 0.85, aovBand: "medium",
        rating: 5, text: POSITIVE, date, weeklyBookings: WEEKLY_BOOKINGS, intervention: "",
      });
    }
  }
}

writeFileSync(new URL("./timeline.json", import.meta.url), JSON.stringify(rows, null, 2) + "\n");

const HEADERS = ["review_id", "partner_id", "partner_name", "sku", "customer_id", "karma", "aov_band", "rating", "text", "date", "weekly_bookings", "intervention"];
const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [
  HEADERS.join(","),
  ...rows.map((r) => [r.reviewId, r.partnerId, r.partnerName, r.sku, r.customerId, r.karma, r.aovBand, r.rating, r.text, r.date, r.weeklyBookings, r.intervention].map(esc).join(",")),
].join("\n") + "\n";
writeFileSync(new URL("./timeline-sample.csv", import.meta.url), csv);

console.log(`wrote ${rows.length} timeline rows (${TRACKED.length} partners × ${WEEKS} weeks) → timeline.json + timeline-sample.csv`);
