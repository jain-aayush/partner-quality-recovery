/**
 * Power-up A — push the golden set into Langfuse as a dataset (Session-4 appendix).
 * "The golden set is an asset, not a file": once hosted, experiments and the UI run against it
 * and SMEs can extend cases without a JSON diff.
 *
 * Usage:  LANGFUSE_PUBLIC_KEY=... LANGFUSE_SECRET_KEY=... npm run seed:langfuse
 *
 * Ground-truth isolation (a hard repo rule): the dataset INPUT is the stripped PartnerPublic +
 * reviews — exactly what a diagnoser sees. The expected label comes from accuracy.ts (the
 * sanctioned ground-truth reader) and only ever appears in expectedOutput, never in input.
 * Idempotent: re-running upserts by a stable item id.
 *
 * ⚠️ SDK: targets the `langfuse` v3 client. Verify method names against langfuse.com/docs.
 */

import partnersJson from "../data/partners.json";
import reviewsJson from "../data/reviews.json";
import { expectedCause } from "../src/lib/accuracy";
import { loadConfig } from "../src/lib/config";
import { stripGroundTruth } from "../src/lib/guardrails";
import { flagPartners } from "../src/lib/screen";
import { Partner, Review } from "../src/lib/types";

// Next auto-loads .env.local; standalone tsx does not. Load it if present (Node ≥ 20.12), typed
// defensively so an older @types/node still compiles. No-op when the file/method is absent.
try {
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  /* fall back to shell env */
}

const DATASET = "partner-quality-gold";

async function main() {
  if (!process.env.LANGFUSE_SECRET_KEY || !process.env.LANGFUSE_PUBLIC_KEY) {
    console.log(
      "Langfuse keys not set — nothing to seed.\n" +
        "Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY (and LANGFUSE_BASE_URL for the US region), then re-run."
    );
    return;
  }

  const partners = partnersJson as unknown as Partner[];
  const reviews = reviewsJson as unknown as Review[];
  const config = loadConfig();
  const reviewsFor = (id: string) =>
    reviews.filter((r) => r.partnerId === id).map((r) => ({ id: r.id, rating: r.rating, service: r.service, text: r.text }));

  // The pipeline diagnoses the flagged (below-rating-bar) partners — that is the golden set.
  const flagged = flagPartners(partners, config.ratingFlagThreshold);

  const { Langfuse } = await import("langfuse");
  // Typed as any to isolate the SDK surface (see observability.ts) — one place to change if it shifts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lf: any = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  });

  await lf.createDataset({
    name: DATASET,
    description: "Partner Quality Recovery golden set — flagged partners, root-cause labels from hidden trueCause.",
    metadata: { source: "data/partners.json + data/reviews.json", cases: flagged.length },
  });

  let thin = 0;
  for (const p of flagged) {
    const expected = expectedCause(p, config.minReviews);
    if (p.reviewCount < config.minReviews) thin++;
    await lf.createDatasetItem({
      datasetName: DATASET,
      id: `pqr-${p.id}`, // stable → idempotent upsert
      input: { partner: stripGroundTruth(p), reviews: reviewsFor(p.id) },
      // Ground truth lives ONLY in expectedOutput (via accuracy.ts, the sanctioned reader) —
      // never in input, and not duplicated raw into metadata.
      expectedOutput: { rootCause: expected },
      metadata: {
        zone: p.zone,
        reviewCount: p.reviewCount,
        thinData: p.reviewCount < config.minReviews,
      },
    });
  }

  await lf.flushAsync();
  console.log(
    `Seeded dataset "${DATASET}": ${flagged.length} cases (${thin} thin-data → expected insufficient_evidence).\n` +
      `Open Langfuse → Datasets → ${DATASET}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
