/**
 * Unified pipeline — ORDER-BASED with per-SKU attribution. One review dataset (bundled or uploaded)
 * drives the WHOLE console. Each row is an order line-item (order × SKU); the review is the
 * customer's rating OF THE ORDER. A multi-SKU order's complaint is attributed to the SKU the review
 * names — co-services are delivered-without-complaint (they count as bookings, never as a complaint
 * on an innocent SKU). Bookings denominator = distinct order_ids per partner × SKU. Ground-truth-free.
 *
 * Intervention history (the `intervention` / `intervention_date` columns) is read as a per-SKU
 * event log: each row carries the latest intervention on-or-before its order date, so distinct
 * (kind, date) pairs reconstruct the §1b escalation-ladder state deterministically.
 */

import { aggregate, needsAttention, TaggedReview } from "./aggregate";
import { decide } from "./decide";
import { diagnoseSku } from "./diagnose2";
import { Band, CaseReview, Customer, Decision, Diagnosis, ExcludedSummary, LadderState, NO_LADDER_HISTORY, Progress, ProblemClass, ProgressStatus, Review, ReviewTag, SkuAggregate, WeekBucket } from "./model";
import { tagReview } from "./tag";
import { reviewWeight, THRESHOLDS } from "./thresholds";

const DECISION_WINDOW_DAYS = 35; // "this cycle" = the most recent 5 weeks of orders
const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

export interface OrderRow {
  orderId: string; partnerId: string; partnerName: string; zone: string; customerId: string;
  karma: number; aovBand: Band; sku: string; orderDate: string; rating: number; reviewText: string;
  intervention: string; interventionDate: string;
}

/** Pluggable per-review tagger. Defaults to the rule-based tag.ts; the API route passes an LLM-backed one (see tagRuntime.ts). */
export type TagFn = (review: Review, customer: Customer) => ReviewTag;

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
const shortDate = (ms: number) => { const d = new Date(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

/** A review counted against the partner: a safety event, or a classified negative about the partner (or a protective unfair claim). */
const isCounted = (t: ReviewTag): boolean =>
  t.safetyFlag ||
  (t.sentiment === "negative" &&
    (t.target === "partner" || t.problemClasses.includes("unfair_review")) &&
    t.problemClasses.length > 0);

/** Weekly complaints/bookings (true 7-day buckets — daily-dated uploads bucket correctly), the verbatim counted complaints, and a tally of what was set aside. */
function caseDetail(items: TaggedReview[]): { weekly: WeekBucket[]; complaints: CaseReview[]; excluded: ExcludedSummary } {
  const minMs = Math.min(...items.map((it) => Date.parse(it.review.date)));
  const byBucket = new Map<number, { orders: Set<string>; complaints: number }>();
  for (const it of items) {
    const idx = Math.floor((Date.parse(it.review.date) - minMs) / WEEK_MS);
    const b = byBucket.get(idx) ?? { orders: new Set<string>(), complaints: 0 };
    b.orders.add(orderIdOf(it.review.id));
    if (isCounted(it.tag)) b.complaints++;
    byBucket.set(idx, b);
  }
  const weekly: WeekBucket[] = [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, b]) => ({ label: shortDate(minMs + idx * WEEK_MS), bookings: b.orders.size, complaints: b.complaints, rate: b.orders.size ? Number((b.complaints / b.orders.size).toFixed(4)) : 0 }));

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
const keyOf = (partnerId: string, sku: string) => `${partnerId}|${sku}`;

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
export function tagOrders(rows: OrderRow[], tagFn: TagFn = tagReview): TaggedReview[] {
  const byOrder = new Map<string, OrderRow[]>();
  for (const r of rows) (byOrder.get(r.orderId) ?? byOrder.set(r.orderId, []).get(r.orderId)!).push(r);
  const out: TaggedReview[] = [];
  const mk = (r: OrderRow) => out.push({ review: toReview(r), tag: tagFn(toReview(r), toCustomer(r)) });

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
  for (const r of rows) (seen.get(keyOf(r.partnerId, r.sku)) ?? seen.set(keyOf(r.partnerId, r.sku), new Set()).get(keyOf(r.partnerId, r.sku))!).add(r.orderId);
  const out = new Map<string, number>();
  for (const [k, s] of seen) out.set(k, s.size);
  return out;
}

/** The per-SKU intervention event log: distinct (kind, date) pairs, date-ascending. */
export interface InterventionEvent { kind: string; date: string }
function interventionHistory(rows: OrderRow[]): Map<string, InterventionEvent[]> {
  const byKey = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (!r.interventionDate || !r.intervention) continue;
    const k = keyOf(r.partnerId, r.sku);
    (byKey.get(k) ?? byKey.set(k, new Map()).get(k)!).set(r.interventionDate, r.intervention);
  }
  const out = new Map<string, InterventionEvent[]>();
  for (const [k, m] of byKey) {
    out.set(k, [...m.entries()].map(([date, kind]) => ({ kind, date })).sort((a, b) => a.date.localeCompare(b.date)));
  }
  return out;
}

const isSoftBan = (kind: string) => kind === "soft_ban" || kind === "protective_soft_ban";

/** §1b ladder state per partner × SKU, from the intervention log + the monitor's verdict. */
function deriveLadder(
  events: InterventionEvent[],
  stillFailing: boolean,
  maxMs: number,
): LadderState {
  const softBans = events.filter((e) => isSoftBan(e.kind));
  const strikes = softBans.filter((e) => Date.parse(e.date) >= maxMs - THRESHOLDS.softBanWindowDays * DAY_MS).length;
  const lastSoftBan = softBans[softBans.length - 1];
  return {
    coachingCycles: events.filter((e) => !isSoftBan(e.kind) && e.kind !== "hard_ban").length,
    softBanStrikes: strikes,
    daysSinceLastSoftBan: lastSoftBan ? Math.floor((maxMs - Date.parse(lastSoftBan.date)) / DAY_MS) : null,
    stillFailing,
  };
}

/** CSV parse result: valid rows, row-level validation issues, and rows routed to the analyst back-fill queue. */
export interface CsvParseResult { rows: OrderRow[]; issues: string[]; backfillCount: number }

/**
 * Validating CSV parse — snake_case order headers. A missing/invalid rating is NEVER defaulted
 * to 5★: the row goes to the analyst back-fill queue (PRD). Malformed dates and SKU-less rows
 * are reported per-row, not silently dropped. Missing karma defaults to a NEUTRAL 0.5 — an
 * unknown reviewer is not a trusted one.
 */
export function parseUnifiedCsv(text: string): CsvParseResult {
  const issues: string[] = [];
  let backfillCount = 0;
  const lines = text.trim().split(/\r?\n/).filter((l) => l.length);
  if (lines.length < 2) return { rows: [], issues: ["No data rows found."], backfillCount };
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
  const missingCols = ["partner_id", "sku", "order_date", "rating", "review_text"].filter((k) => at(k) < 0);
  if (missingCols.length > 0) {
    return { rows: [], issues: [`Missing required column(s): ${missingCols.join(", ")}. Compare with the sample CSV.`], backfillCount };
  }

  const rows: OrderRow[] = [];
  const flag = (msg: string) => { if (issues.length < 20) issues.push(msg); };
  lines.slice(1).forEach((line, i) => {
    const rowNo = i + 2; // 1-based, counting the header
    const c = cells(line);
    const g = (k: string, d = "") => (at(k) >= 0 ? (c[at(k)] ?? d).trim() : d);

    const partnerId = g("partner_id");
    if (!partnerId) { flag(`Row ${rowNo}: missing partner_id — skipped.`); return; }
    const sku = g("sku");
    if (!sku) { flag(`Row ${rowNo}: missing sku — skipped; flagged for analyst review.`); return; }
    const orderDate = g("order_date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || Number.isNaN(Date.parse(orderDate))) {
      flag(`Row ${rowNo}: order_date "${orderDate}" is not a valid YYYY-MM-DD date — skipped.`);
      return;
    }
    const rating = Number(g("rating"));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      backfillCount++; // null/invalid rating → analyst back-fill queue, never a silent 5★
      return;
    }

    const karmaRaw = g("karma");
    const karma = Number(karmaRaw);
    const aov = g("aov_band", "medium") as Band;
    rows.push({
      orderId: g("order_id", `o${i}`), partnerId, partnerName: g("partner_name", partnerId),
      zone: g("zone", "—"), customerId: g("customer_id", `c${i}`),
      karma: karmaRaw !== "" && Number.isFinite(karma) && karma >= 0 && karma <= 1 ? karma : 0.5,
      aovBand: ["low", "medium", "high"].includes(aov) ? aov : "medium", sku, orderDate,
      rating, reviewText: g("review_text"),
      intervention: g("intervention", ""), interventionDate: g("intervention_date", ""),
    });
  });
  if (backfillCount > 0) {
    issues.push(`${backfillCount} row(s) with a missing/invalid rating routed to the analyst back-fill queue (not counted as 5★).`);
  }
  return { rows, issues, backfillCount };
}

export function runFromRows(rows: OrderRow[], tagFn: TagFn = tagReview): UnifiedResult {
  const nameOf = new Map(rows.map((r) => [r.partnerId, r.partnerName]));
  const zoneOf = (p: string) => rows.find((r) => r.partnerId === p)?.zone ?? "—";
  const maxMs = Math.max(...rows.map((r) => Date.parse(r.orderDate)));

  // ── monitor first: progress over the full record feeds ladder state into this cycle's decisions ──
  const history = interventionHistory(rows);
  const progress = computeProgress(rows, tagFn);
  const stillFailingByKey = new Map(progress.map((p) => [keyOf(p.partnerId, p.sku), p.status === "stalled"]));
  const ladderByKey = new Map<string, LadderState>();
  for (const [k, events] of history) {
    ladderByKey.set(k, deriveLadder(events, stillFailingByKey.get(k) ?? false, maxMs));
  }

  // ── this cycle's decisions: most recent window only ──
  const windowStart = maxMs - DECISION_WINDOW_DAYS * DAY_MS;
  const win = rows.filter((r) => Date.parse(r.orderDate) >= windowStart);

  const counts = orderCounts(win);
  const bookings = (p: string, s: string) => counts.get(keyOf(p, s)) ?? 0;

  const tagged = tagOrders(win, tagFn); // attributed per SKU
  const tagsByKey = new Map<string, ReviewTag[]>();
  const itemsByKey = new Map<string, TaggedReview[]>();
  for (const t of tagged) {
    const k = keyOf(t.tag.partnerId, t.tag.sku);
    (tagsByKey.get(k) ?? tagsByKey.set(k, []).get(k)!).push(t.tag);
    (itemsByKey.get(k) ?? itemsByKey.set(k, []).get(k)!).push(t);
  }

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
      const k = keyOf(row.partnerId, row.sku);
      const dx = diagnoseSku(row, tagsByKey.get(k) ?? []);
      const detail = caseDetail(itemsByKey.get(k) ?? []);
      return {
        row,
        diagnosis: dx,
        decision: decide(row, dx, ladderByKey.get(k) ?? NO_LADDER_HISTORY),
        ...detail,
        priorCoached: history.has(k),
      };
    });

  // unimprovable is DERIVED, never diagnosed: a partner whose ladder is exhausted (3 strikes in
  // the rolling window, monitor still failing, not low-N) on a majority of active SKUs becomes a
  // platform offboard candidate — a human makes the final call. A single failed SKU stays a
  // per-SKU hard-ban candidate, never a platform offboard.
  const byPartner = new Map<string, SkuCase[]>();
  for (const c of cases) (byPartner.get(c.row.partnerId) ?? byPartner.set(c.row.partnerId, []).get(c.row.partnerId)!).push(c);
  const partners: PartnerRollup[] = [];
  const exhausted = (c: SkuCase): boolean => {
    const l = ladderByKey.get(keyOf(c.row.partnerId, c.row.sku));
    return !!l && l.stillFailing && l.softBanStrikes >= THRESHOLDS.softBanMax && !c.row.lowN;
  };
  for (const [p, list] of byPartner) {
    const activeSkus = list.length;
    const failingSkus = list.filter((c) => needsAttention(c.row)).length;
    const exhaustedSkus = list.filter((c) => needsAttention(c.row) && c.decision.track !== "safety" && exhausted(c)).length;
    const partnerAvg = avg(ratingByPartner.get(p) ?? [5]);
    const unimprovable = activeSkus > 1 && exhaustedSkus / activeSkus >= THRESHOLDS.offboardMajority;
    if (unimprovable) {
      for (const c of list) if (needsAttention(c.row) && c.decision.track !== "safety" && exhausted(c)) {
        c.decision = { ...c.decision, cause: "unimprovable", actions: ["offboard"], immediateActions: [], incomeAffecting: true, grain: "platform", gate: "human_required", gateReason: `Unimprovable — full ladder exhausted (coaching + ${THRESHOLDS.softBanMax} soft-ban strikes, still failing) on ${exhaustedSkus}/${activeSkus} active SKUs (majority). Platform offboard candidate; human decides.` };
      }
    }
    partners.push({ partnerId: p, name: nameOf.get(p) ?? p, zone: zoneOf(p), avgRating: Number(partnerAvg.toFixed(2)), activeSkus, failingSkus, unimprovable });
  }

  return { cases, partners, progress, config: THRESHOLDS };
}

/**
 * Progress tracker — every partner × SKU with an intervention event log. Rates are attributed
 * complaints ÷ orders in true 7-day buckets. The 15-day check scores ONLY when the post window
 * has at least MIN_BOOKINGS_FLOOR bookings — below the floor the window is extended, never
 * scored as recovered and never a strike (a near-zero-volume week can't fake a recovery).
 */
export function computeProgress(rows: OrderRow[], tagFn: TagFn = tagReview): Progress[] {
  const history = interventionHistory(rows);
  if (history.size === 0) return [];
  const minMs = Math.min(...rows.map((r) => Date.parse(r.orderDate)));
  const maxMs = Math.max(...rows.map((r) => Date.parse(r.orderDate)));
  const bucketOf = (date: string) => Math.floor((Date.parse(date) - minMs) / WEEK_MS);
  const nWeeks = bucketOf(new Date(maxMs).toISOString().slice(0, 10)) + 1;

  const allTagged = tagOrders(rows, tagFn);
  const ACTION_LABEL: Record<string, string> = { skill_training: "Free training", warning_scrutiny: "Warning + watch", supply_kit: "Supply kit", protective_soft_ban: "7-day pause + coaching", soft_ban: "7-day soft-ban" };

  const out: Progress[] = [];
  for (const [gk, events] of history) {
    const [partnerId, sku] = gk.split("|");
    const groupRows = rows.filter((r) => r.partnerId === partnerId && r.sku === sku);
    const tags = allTagged.filter((t) => t.tag.partnerId === partnerId && t.tag.sku === sku);
    const tally: Partial<Record<ProblemClass, number>> = {};
    for (const t of tags) if (t.tag.sentiment === "negative") for (const c of t.tag.problemClasses) tally[c] = (tally[c] ?? 0) + reviewWeight(t.tag.customer.karma, t.tag.customer.highValue);
    const cause = (Object.entries(tally).sort((a, b) => b[1]! - a[1]!)[0]?.[0] as ProblemClass) ?? "skill_issue";

    const orders = new Array(nWeeks).fill(0).map(() => new Set<string>());
    for (const r of groupRows) orders[bucketOf(r.orderDate)].add(r.orderId);
    const wtd = new Array(nWeeks).fill(0);
    const raw = new Array(nWeeks).fill(0);
    for (const t of tags) if (t.tag.sentiment === "negative" && t.tag.problemClasses.includes(cause)) { const b = bucketOf(t.review.date); wtd[b] += reviewWeight(t.tag.customer.karma, t.tag.customer.highValue); raw[b] += 1; }
    // Soft-ban weeks are a 7-day pause with NO bookings — mark them so the chart shows a pause, not "0 complaints".
    const softBanWeeks = new Set(events.filter((e) => isSoftBan(e.kind)).map((e) => Math.min(nWeeks - 1, Math.max(0, bucketOf(e.date)))));
    // Which intervention landed each week (latest same-week event wins, e.g. a soft-ban over a same-day coaching note).
    const eventAt = new Map<number, string>();
    for (const e of events) eventAt.set(Math.min(nWeeks - 1, Math.max(0, bucketOf(e.date))), ACTION_LABEL[e.kind] ?? e.kind);
    const series = Array.from({ length: nWeeks }, (_, w) => ({ label: `W${w + 1}`, rate: orders[w].size > 0 ? Number((wtd[w] / orders[w].size).toFixed(4)) : 0, paused: softBanWeeks.has(w) && orders[w].size === 0, bookings: orders[w].size, complaints: raw[w], event: eventAt.get(w) }));

    const last = events[events.length - 1];
    const first = events[0]; // events are date-ascending → first = when the watch/coaching began
    const ladder = deriveLadder(events, false, maxMs);
    // Plain-language mix of what's in play — training-or-not, and how far up the soft-ban ladder.
    const kinds = new Set(events.map((e) => e.kind));
    const trained = kinds.has("skill_training") || kinds.has("protective_soft_ban");
    const interventionSummary =
      ladder.softBanStrikes > 0
        ? `7-day pause${ladder.softBanStrikes > 1 ? ` · strike ${Math.min(ladder.softBanStrikes, THRESHOLDS.softBanMax)}/${THRESHOLDS.softBanMax}` : ""}${trained ? " + training" : " (no training)"}`
        : kinds.has("warning_scrutiny") ? (trained ? "Warning + training" : "Warning + watch (no training)")
          : kinds.has("skill_training") ? "Free training"
            : kinds.has("supply_kit") ? "Supply kit"
              : ACTION_LABEL[last.kind] ?? last.kind;
    const interventionWeek = Math.min(nWeeks - 1, Math.max(0, bucketOf(last.date)));
    const watchStartWeek = Math.min(nWeeks - 1, Math.max(0, bucketOf(first.date)));
    const pre = avg(series.slice(Math.max(0, interventionWeek - 2), interventionWeek).map((s) => s.rate)) || series[Math.max(0, interventionWeek - 1)].rate;
    const measureWeek = interventionWeek + 2;
    const postSlice = series.slice(measureWeek, measureWeek + 2);
    const postBookings = orders.slice(measureWeek, measureWeek + 2).reduce((s, o) => s + o.size, 0);
    const measured = postSlice.length > 0;
    const floorMet = postBookings >= THRESHOLDS.minBookingsFloor;
    const scored = measured && floorMet;
    const currentRate = Number((scored ? avg(postSlice.map((s) => s.rate)) : series[series.length - 1].rate).toFixed(4));
    const dropPct = scored && pre > 0 ? Math.max(0, (pre - currentRate) / pre) : 0;
    const daysElapsed = Math.max(0, Math.floor((maxMs - Date.parse(last.date)) / DAY_MS));
    const target = THRESHOLDS.improvementDrop;

    let status: ProgressStatus;
    if (!scored) status = "on_track";
    else if (dropPct >= target) status = "recovered";
    else if (dropPct >= 0.1) status = "improving";
    else if (dropPct < 0.05) status = "stalled";
    else status = "on_track";

    const coachingDone = ladder.coachingCycles >= THRESHOLDS.coachingLoopMax;
    const phase =
      status === "recovered" ? "Recovered"
        : ladder.softBanStrikes >= THRESHOLDS.softBanMax && status === "stalled" ? "Ladder exhausted — hard-ban candidate"
          : isSoftBan(last.kind) ? `Soft-ban strike ${ladder.softBanStrikes}/${THRESHOLDS.softBanMax}`
            : status === "stalled" && coachingDone ? "Coaching exhausted — soft-ban queued"
              : `Coaching — cycle ${Math.max(1, ladder.coachingCycles)}/${THRESHOLDS.coachingLoopMax}`;
    const nextCheckDays = status === "recovered" ? 0 : Math.max(0, (daysElapsed < 30 ? 30 : THRESHOLDS.monitorWindowDays) - daysElapsed);
    const note = !measured ? "In training — first 15-day check not due yet."
      : !floorMet ? `Only ${postBookings} booking(s) since the intervention — below the ${THRESHOLDS.minBookingsFloor}-booking floor. Window extended; not scored (no recovery, no strike, on thin volume).`
        : status === "recovered" ? `15-day check: complaints down ${Math.round(dropPct * 100)}% — passed the ${Math.round(target * 100)}% bar.`
          : status === "stalled" ? `15-day check: only ${Math.round(dropPct * 100)}% down — next ladder step is queued for your call.`
            : `15-day check: down ${Math.round(dropPct * 100)}% — improving toward the ${Math.round(target * 100)}% bar.`;

    out.push({
      partnerId, name: groupRows[0].partnerName, zone: groupRows[0].zone, sku, interventionLabel: ACTION_LABEL[last.kind] ?? last.kind, interventionSummary,
      phase, daysElapsed, windowDays: THRESHOLDS.monitorWindowDays, preRate: Number(pre.toFixed(4)), currentRate,
      dropPct: Number(dropPct.toFixed(2)), targetDrop: target, status, nextCheckDays, note, series, interventionWeek, watchStartWeek,
    });
  }
  return out;
}
