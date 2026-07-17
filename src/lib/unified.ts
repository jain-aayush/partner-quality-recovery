/**
 * Unified pipeline — ORDER-BASED with per-SKU attribution. One review dataset (bundled or uploaded)
 * drives the WHOLE console. Each row is an order line-item (order × SKU); the review is the
 * customer's rating OF THE ORDER. A multi-SKU order's complaint is attributed to the SKU the review
 * names — co-services are delivered-without-complaint (they count as bookings, never as a complaint
 * on an innocent SKU). Bookings denominator = distinct order_ids per partner × SKU. Ground-truth-free.
 */

import { aggregate, needsAttention, TaggedReview } from "./aggregate";
import { decide } from "./decide";
import { diagnoseSku } from "./diagnose2";
import { Band, CaseReview, Customer, Decision, Diagnosis, ExcludedSummary, Progress, ProblemClass, ProgressStatus, Review, ReviewTag, SkuAggregate, WeekBucket } from "./model";
import { tagReview } from "./tag";
import { reviewWeight, THRESHOLDS } from "./thresholds";

const DECISION_WINDOW_DAYS = 35; // "this cycle" = the most recent 5 weeks of orders

export interface OrderRow {
  orderId: string; partnerId: string; partnerName: string; zone: string; customerId: string;
  karma: number; aovBand: Band; sku: string; orderDate: string; rating: number; reviewText: string;
  intervention: string; interventionDate: string;
}

export interface SkuCase {
  row: SkuAggregate;
  diagnosis: Diagnosis;
  decision: Decision;
  weekly: WeekBucket[]; // complaints/bookings per 7-day bucket in the decision window
  complaints: CaseReview[]; // the counted partner complaints backing this decision (readable verbatim)
  excluded: ExcludedSummary; // reviews present for this SKU but NOT counted against the partner
  priorCoached: boolean; // this partner × SKU was coached before (repeat concern)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[(m || 1) - 1]}`; };

/** A review counted against the partner: a safety event, or a classified negative about the partner (or a protective unfair claim). */
const isCounted = (t: ReviewTag): boolean =>
  t.safetyFlag ||
  (t.sentiment === "negative" &&
    (t.target === "partner" || t.problemClasses.includes("unfair_review")) &&
    t.problemClasses.length > 0);

/** Weekly complaints/bookings, the verbatim counted complaints, and a tally of what was set aside. */
function caseDetail(items: TaggedReview[]): { weekly: WeekBucket[]; complaints: CaseReview[]; excluded: ExcludedSummary } {
  const byDate = new Map<string, { orders: Set<string>; complaints: number }>();
  for (const it of items) {
    const b = byDate.get(it.review.date) ?? { orders: new Set<string>(), complaints: 0 };
    b.orders.add(orderIdOf(it.review.id));
    if (isCounted(it.tag)) b.complaints++;
    byDate.set(it.review.date, b);
  }
  const weekly: WeekBucket[] = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, b]) => ({ label: shortDate(date), bookings: b.orders.size, complaints: b.complaints, rate: b.orders.size ? Number((b.complaints / b.orders.size).toFixed(4)) : 0 }));

  const complaints: CaseReview[] = items
    .filter((it) => isCounted(it.tag))
    .map((it) => ({
      date: it.review.date, rating: it.review.rating, text: it.review.text,
      problemClasses: it.tag.problemClasses, safetySubtype: it.tag.safetySubtype, severity: it.tag.severity,
      highValue: it.tag.customer.highValue, lowTrust: it.tag.customer.karma < THRESHOLDS.karmaLowTrust,
      weight: Number(reviewWeight(it.tag.customer.karma, it.tag.customer.highValue).toFixed(2)),
    }))
    .sort((a, b) => b.severity - a.severity || a.rating - b.rating);

  let offTarget = 0, lowSignal = 0, quarantined = 0;
  for (const { tag: t } of items) {
    if (t.flags.includes("injection_quarantined")) { quarantined++; continue; }
    if (t.sentiment === "positive") continue;
    if (t.target === "pricing" || t.target === "urban_company") offTarget++;
    else if (t.flags.includes("thin_text") || t.sentiment === "neutral") lowSignal++;
  }
  return { weekly, complaints, excluded: { offTarget, lowSignal, quarantined } };
}
export interface PartnerRollup {
  partnerId: string; name: string; zone: string; avgRating: number;
  activeSkus: number; failingSkus: number; unimprovable: boolean;
}
export interface UnifiedResult { cases: SkuCase[]; partners: PartnerRollup[]; progress: Progress[]; config: typeof THRESHOLDS }

const toReview = (r: OrderRow): Review => ({ id: `${r.orderId}::${r.sku}`, partnerId: r.partnerId, customerId: r.customerId, sku: r.sku, rating: Math.max(1, Math.min(5, r.rating)) as 1 | 2 | 3 | 4 | 5, text: r.reviewText, date: r.orderDate });
const toCustomer = (r: OrderRow): Customer => ({ id: r.customerId, karma: r.karma, aovBand: r.aovBand, ltvBand: r.aovBand });
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const orderIdOf = (reviewId: string) => reviewId.split("::")[0];

// SKU-name detection so a multi-SKU order's complaint lands on the right service.
const SKU_ALIASES: Record<string, string[]> = {
  "Waxing": ["wax"], "Facial": ["facial"], "Hair Coloring": ["colour", "color", "hair colo"],
  "Manicure": ["manicure", "nail"], "Pedicure": ["pedicure", "feet"], "Haircut": ["haircut", "hair cut", "trim"],
  "Makeup": ["makeup", "make up", "make-up"], "Hair Spa": ["hair spa"], "Massage": ["massage"],
};
function mentionsSku(text: string, sku: string): boolean {
  const t = text.toLowerCase();
  return t.includes(sku.toLowerCase()) || (SKU_ALIASES[sku] ?? []).some((a) => t.includes(a));
}

/**
 * Tag orders with per-SKU attribution. Single-SKU orders tag straight through. For a multi-SKU
 * order with a negative review:
 *   • if the review NAMES a service → the complaint goes only to that SKU; the others are clean.
 *   • if it names NO service (vague "it was botched") → attribute to ALL services in the order, so
 *     we don't lose the signal (the prevalence gate + human review guard against over-reacting).
 */
export function tagOrders(rows: OrderRow[]): TaggedReview[] {
  const byOrder = new Map<string, OrderRow[]>();
  for (const r of rows) (byOrder.get(r.orderId) ?? byOrder.set(r.orderId, []).get(r.orderId)!).push(r);
  const out: TaggedReview[] = [];
  const mk = (r: OrderRow) => out.push({ review: toReview(r), tag: tagReview(toReview(r), toCustomer(r)) });

  for (const [, lines] of byOrder) {
    const skus = [...new Set(lines.map((l) => l.sku))];
    if (skus.length === 1) { mk(lines[0]); continue; }

    const rev = [...lines].sort((a, b) => a.rating - b.rating)[0]; // the order's review (worst-rated line carries it)
    const negative = rev.rating <= 3 && rev.reviewText.trim().length > 0;
    const target = negative ? (skus.find((s) => mentionsSku(rev.reviewText, s)) ?? null) : null;
    for (const sku of skus) {
      const line = lines.find((l) => l.sku === sku)!;
      if (!negative) mk(line); // positive order → every service gets the good review
      else if (target === null || sku === target) mk({ ...line, reviewText: rev.reviewText, rating: rev.rating }); // named service, OR unattributable → attribute to all (keep the signal)
      else mk({ ...line, reviewText: "", rating: 3 }); // a DIFFERENT service was named → this co-service is clean
    }
  }
  return out;
}

/** Distinct order count per partner × SKU — the derived bookings denominator. */
function orderCounts(rows: OrderRow[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const r of rows) (seen.get(`${r.partnerId}|${r.sku}`) ?? seen.set(`${r.partnerId}|${r.sku}`, new Set()).get(`${r.partnerId}|${r.sku}`)!).add(r.orderId);
  const out = new Map<string, number>();
  for (const [k, s] of seen) out.set(k, s.size);
  return out;
}

/** Tolerant CSV parse — snake_case order headers; missing optionals default sensibly. */
export function parseUnifiedCsv(text: string): OrderRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.length);
  if (lines.length < 2) return [];
  const cells = (line: string): string[] => {
    const out: string[] = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur); return out;
  };
  const header = cells(lines[0]).map((h) => h.trim());
  const at = (k: string) => header.indexOf(k);
  return lines.slice(1).map((line, i) => {
    const c = cells(line);
    const g = (k: string, d = "") => (at(k) >= 0 ? (c[at(k)] ?? d).trim() : d);
    const karma = Number(g("karma", "0.8"));
    const aov = g("aov_band", "medium") as Band;
    return {
      orderId: g("order_id", `o${i}`), partnerId: g("partner_id"), partnerName: g("partner_name", g("partner_id")),
      zone: g("zone", "—"), customerId: g("customer_id", `c${i}`), karma: Number.isFinite(karma) ? karma : 0.8,
      aovBand: ["low", "medium", "high"].includes(aov) ? aov : "medium", sku: g("sku"), orderDate: g("order_date"),
      rating: Number(g("rating", "5")) || 5, reviewText: g("review_text"),
      intervention: g("intervention", ""), interventionDate: g("intervention_date", ""),
    };
  }).filter((r) => r.partnerId && r.sku && r.orderDate);
}

export function runFromRows(rows: OrderRow[]): UnifiedResult {
  const nameOf = new Map(rows.map((r) => [r.partnerId, r.partnerName]));
  const zoneOf = (p: string) => rows.find((r) => r.partnerId === p)?.zone ?? "—";

  // ── this cycle's decisions: most recent window only ──
  const maxMs = Math.max(...rows.map((r) => Date.parse(r.orderDate)));
  const windowStart = maxMs - DECISION_WINDOW_DAYS * 86400000;
  const win = rows.filter((r) => Date.parse(r.orderDate) >= windowStart);

  const counts = orderCounts(win);
  const bookings = (p: string, s: string) => counts.get(`${p}|${s}`) ?? 0;

  const tagged = tagOrders(win); // attributed per SKU
  const tagsByKey = new Map<string, ReviewTag[]>();
  const itemsByKey = new Map<string, TaggedReview[]>();
  for (const t of tagged) {
    const k = `${t.tag.partnerId}|${t.tag.sku}`;
    (tagsByKey.get(k) ?? tagsByKey.set(k, []).get(k)!).push(t.tag);
    (itemsByKey.get(k) ?? itemsByKey.set(k, []).get(k)!).push(t);
  }

  // Prior-coaching history (repeat concern) — any intervention on this partner × SKU in the full record.
  const coachedKey = new Set<string>();
  for (const r of rows) if (r.interventionDate) coachedKey.add(`${r.partnerId}|${r.sku}`);

  const aggs = aggregate(tagged, bookings, zoneOf);

  // Screen by PREVALENCE, not average rating: with realistic order data a partner's average stays
  // high while one SKU has a concentrated problem. A partner is in scope if ANY SKU needs attention.
  const ratingByPartner = new Map<string, number[]>();
  for (const r of win) (ratingByPartner.get(r.partnerId) ?? ratingByPartner.set(r.partnerId, []).get(r.partnerId)!).push(r.rating);
  const flagged = new Set<string>();
  for (const a of aggs) if (needsAttention(a)) flagged.add(a.partnerId);

  const cases: SkuCase[] = aggs
    .filter((a) => flagged.has(a.partnerId))
    .map((row) => {
      const k = `${row.partnerId}|${row.sku}`;
      const dx = diagnoseSku(row, tagsByKey.get(k) ?? []);
      const detail = caseDetail(itemsByKey.get(k) ?? []);
      return { row, diagnosis: dx, decision: decide(row, dx), ...detail, priorCoached: coachedKey.has(k) };
    });

  // unimprovable → offboard candidate only when a majority of active SKUs are coached-and-still-failing
  const byPartner = new Map<string, SkuCase[]>();
  for (const c of cases) (byPartner.get(c.row.partnerId) ?? byPartner.set(c.row.partnerId, []).get(c.row.partnerId)!).push(c);
  const partners: PartnerRollup[] = [];
  for (const [p, list] of byPartner) {
    const activeSkus = list.length;
    const failingSkus = list.filter((c) => needsAttention(c.row)).length;
    const exhausted = list.filter((c) => needsAttention(c.row) && coachedKey.has(`${c.row.partnerId}|${c.row.sku}`)).length;
    const partnerAvg = avg(ratingByPartner.get(p) ?? [5]);
    const unimprovable = activeSkus > 1 && exhausted / activeSkus >= THRESHOLDS.offboardMajority;
    if (unimprovable) {
      for (const c of list) if (needsAttention(c.row) && c.decision.track !== "safety") {
        c.decision = { ...c.decision, cause: "unimprovable", actions: ["offboard"], incomeAffecting: true, grain: "platform", gate: "human_required", gateReason: `Unimprovable — coached but still failing ${failingSkus}/${activeSkus} active SKUs (majority). Platform offboard candidate; human decides.` };
      }
    }
    partners.push({ partnerId: p, name: nameOf.get(p) ?? p, zone: zoneOf(p), avgRating: Number(partnerAvg.toFixed(2)), activeSkus, failingSkus, unimprovable });
  }

  return { cases, partners, progress: computeProgress(rows), config: THRESHOLDS };
}

/** Progress tracker — only partner × SKU with an intervention_date; attributed complaints ÷ orders. */
export function computeProgress(rows: OrderRow[]): Progress[] {
  const weeks = [...new Set(rows.map((r) => r.orderDate))].sort();
  const wIdx = new Map(weeks.map((d, i) => [d, i]));
  const allTagged = tagOrders(rows);
  const ACTION_LABEL: Record<string, string> = { skill_training: "Free training", warning_scrutiny: "Warning + watch", supply_kit: "Supply kit", protective_soft_ban: "7-day pause + coaching" };

  const skuGroups = new Map<string, OrderRow[]>();
  for (const r of rows) if (r.interventionDate) (skuGroups.get(`${r.partnerId}|${r.sku}`) ?? skuGroups.set(`${r.partnerId}|${r.sku}`, []).get(`${r.partnerId}|${r.sku}`)!).push(r);

  const out: Progress[] = [];
  for (const [gk, groupRows] of skuGroups) {
    const [partnerId, sku] = gk.split("|");
    const tags = allTagged.filter((t) => t.tag.partnerId === partnerId && t.tag.sku === sku);
    const tally: Partial<Record<ProblemClass, number>> = {};
    for (const t of tags) if (t.tag.sentiment === "negative") for (const c of t.tag.problemClasses) tally[c] = (tally[c] ?? 0) + reviewWeight(t.tag.customer.karma, t.tag.customer.highValue);
    const cause = (Object.entries(tally).sort((a, b) => b[1]! - a[1]!)[0]?.[0] as ProblemClass) ?? "skill_issue";

    const orders = new Array(weeks.length).fill(0).map(() => new Set<string>());
    for (const r of groupRows) orders[wIdx.get(r.orderDate)!].add(r.orderId);
    const wtd = new Array(weeks.length).fill(0);
    for (const t of tags) if (t.tag.sentiment === "negative" && t.tag.problemClasses.includes(cause)) wtd[wIdx.get(t.review.date)!] += reviewWeight(t.tag.customer.karma, t.tag.customer.highValue);
    const series = weeks.map((_, w) => ({ label: `W${w + 1}`, rate: orders[w].size > 0 ? Number((wtd[w] / orders[w].size).toFixed(4)) : 0 }));

    const interventionWeek = wIdx.get(groupRows[0].interventionDate) ?? series.reduce((b, s, i) => (s.rate > series[b].rate ? i : b), 0);
    const pre = avg(series.slice(Math.max(0, interventionWeek - 2), interventionWeek).map((s) => s.rate)) || series[Math.max(0, interventionWeek - 1)].rate;
    const measureWeek = interventionWeek + 2;
    const postSlice = series.slice(measureWeek, measureWeek + 2).map((s) => s.rate);
    const measured = postSlice.length > 0;
    const currentRate = Number((measured ? avg(postSlice) : series[series.length - 1].rate).toFixed(4));
    const dropPct = pre > 0 ? Math.max(0, (pre - currentRate) / pre) : 0;
    const daysElapsed = (weeks.length - 1 - interventionWeek) * 7;
    const target = THRESHOLDS.improvementDrop;

    let status: ProgressStatus;
    if (!measured) status = "on_track";
    else if (dropPct >= target) status = "recovered";
    else if (dropPct >= 0.1) status = "improving";
    else if (dropPct < 0.05) status = "stalled";
    else status = "on_track";

    const action = groupRows[0].intervention || "skill_training";
    const phase = status === "recovered" ? "Recovered" : status === "stalled" ? "Stalled — escalating" : action === "protective_soft_ban" ? "Soft-ban + coaching" : daysElapsed < 30 ? "Coaching — cycle 1" : "Coaching — cycle 2";
    const nextCheckDays = status === "recovered" ? 0 : Math.max(0, (daysElapsed < 30 ? 30 : THRESHOLDS.monitorWindowDays) - daysElapsed);
    const note = !measured ? "In training — first 15-day check not due yet."
      : status === "recovered" ? `15-day check: complaints down ${Math.round(dropPct * 100)}% — passed the 20% bar.`
        : status === "stalled" ? `15-day check: only ${Math.round(dropPct * 100)}% down — next step is a soft-ban (your call).`
          : `15-day check: down ${Math.round(dropPct * 100)}% — improving toward the 20% bar.`;

    out.push({
      partnerId, name: groupRows[0].partnerName, zone: groupRows[0].zone, sku, interventionLabel: ACTION_LABEL[action] ?? action,
      phase, daysElapsed, windowDays: THRESHOLDS.monitorWindowDays, preRate: Number(pre.toFixed(4)), currentRate,
      dropPct: Number(dropPct.toFixed(2)), targetDrop: target, status, nextCheckDays, note, series, interventionWeek,
    });
  }
  return out;
}
