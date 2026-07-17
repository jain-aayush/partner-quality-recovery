import partnersJson from "../../data/partners.json";
import reviewsJson from "../../data/reviews.json";
import { scoreAccuracy } from "./accuracy";
import { diagnosePartner } from "./diagnose";
import { gate, POLICY } from "./policy";
import { flagPartners } from "./screen";
import { simulateOutcome } from "./simulate";
import { Config, Partner, PartnerCase, PipelineResult, Review } from "./types";

const partners = partnersJson as unknown as Partner[];
const reviews = reviewsJson as unknown as Review[];

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Screen → parallel diagnose → policy → gate → simulate → re-diagnose loop.
 * Stateless: one call returns everything the dashboard needs.
 */
export async function runPipeline(config: Config): Promise<PipelineResult> {
  const reviewsByPartner = new Map<string, Review[]>();
  for (const r of reviews) {
    const list = reviewsByPartner.get(r.partnerId) ?? [];
    list.push(r);
    reviewsByPartner.set(r.partnerId, list);
  }

  const flagged = flagPartners(partners, config.ratingFlagThreshold);

  const diagnoses = await mapLimit(flagged, 5, (p) =>
    diagnosePartner(p, reviewsByPartner.get(p.id) ?? [], config)
  );

  const cases: PartnerCase[] = flagged.map((partner, i) => {
    const diagnosis = diagnoses[i];
    const policy = POLICY[diagnosis.rootCause];
    return {
      partner,
      diagnosis,
      policy,
      gate: gate(policy, diagnosis, config),
      simulated: simulateOutcome(partner, diagnosis, policy),
    };
  });

  // Monitor → re-diagnose loop: a non-improver is re-diagnosed; if nothing changed,
  // the case escalates to a HUMAN root-cause review — never auto-escalates to offboarding.
  const nonImprovers = cases.filter(
    (c) => !c.simulated.improved && c.diagnosis.rootCause !== "insufficient_evidence"
  );
  await mapLimit(nonImprovers, 5, async (c) => {
    const second = await diagnosePartner(
      c.partner,
      reviewsByPartner.get(c.partner.id) ?? [],
      config
    );
    c.simulated.escalatedToHuman = true;
    c.simulated.note +=
      second.rootCause === c.diagnosis.rootCause
        ? " Re-diagnosis returned the same cause — escalated to a human for root-cause review."
        : ` Re-diagnosis suggests ${second.rootCause} — escalated to a human with both hypotheses.`;
  });

  return {
    mode: config.mode,
    provider: config.mode === "llm" ? config.provider : null,
    model: config.mode === "llm" ? config.model : null,
    flagged: cases,
    accuracy: scoreAccuracy(cases, config),
    config: {
      confidenceThreshold: config.confidenceThreshold,
      minReviews: config.minReviews,
      ratingFlagThreshold: config.ratingFlagThreshold,
    },
  };
}
