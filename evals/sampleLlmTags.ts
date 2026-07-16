/**
 * Live LLM-tagger sample (opt-in, real API spend — NOT part of `npm run eval`).
 * Tags the curated golden reviews through the real LLM backend and prints an
 * LLM-vs-mock-vs-golden comparison. Requires OPENAI_API_KEY (read from env / .env).
 * Usage: npm run sample:llm-tags   (or  OPENAI_API_KEY=sk-... npm run sample:llm-tags)
 */
import customersJson from "../data/customers.json";
import goldenJson from "../data/golden_tags.json";
import reviewsJson from "../data/tag_corpus.json";
import { tagReviewLlm } from "../src/lib/llmTagger";
import { tagReview } from "../src/lib/tag";
import { Customer, ReviewInput } from "../src/lib/tagTypes";
import { VERIFICATION_REVIEW_IDS } from "../src/lib/tagVerification";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

const reviews = reviewsJson as ReviewInput[];
const customersById = new Map((customersJson as Customer[]).map((c) => [c.customer_id, c]));
const golden = goldenJson as { review_id: string; problem_classes: string[]; severity: number; safety_flag: boolean }[];
const sample = reviews.filter((r) => (VERIFICATION_REVIEW_IDS as readonly string[]).includes(r.review_id));

async function main() {
  if (!apiKey) {
    console.log("OPENAI_API_KEY is not set — cannot run the live LLM tagger.");
    console.log("Add the key to .env (OPENAI_API_KEY=sk-...) or export it, then re-run `npm run sample:llm-tags`.");
    console.log(`Ready to sample ${sample.length} curated reviews against model=${model}.`);
    return;
  }
  console.log(`Sampling ${sample.length} reviews · model=${model}\n`);
  let classMatch = 0;
  let safetyOk = 0;
  let safetyTotal = 0;
  for (const review of sample) {
    const customer = customersById.get(review.customer_id)!;
    const g = golden.find((x) => x.review_id === review.review_id);
    const gClasses = JSON.stringify(g?.problem_classes ?? []);
    const mock = tagReview(review, customer);
    let llm;
    try {
      llm = await tagReviewLlm(review, customer, { apiKey, model });
    } catch (e) {
      console.log(`${review.review_id}  LLM ERROR: ${(e as Error).message}\n`);
      continue;
    }
    if (JSON.stringify(llm.problem_classes) === gClasses) classMatch++;
    if (g?.safety_flag) {
      safetyTotal++;
      if (llm.safety_flag && llm.severity >= 4) safetyOk++;
    }
    console.log(`${review.review_id} "${review.review_text || "(rating only)"}"`);
    console.log(`  golden: ${gClasses} sev${g?.severity} safety=${g?.safety_flag}`);
    console.log(`  mock  : ${JSON.stringify(mock.problem_classes)} sev${mock.severity} safety=${mock.safety_flag} sent=${mock.sentiment}`);
    console.log(`  llm   : ${JSON.stringify(llm.problem_classes)} sev${llm.severity} safety=${llm.safety_flag} sub=${llm.safety_subtype} sent=${llm.sentiment} conf=${llm.confidence.toFixed(2)} flags=[${llm.flags}] ev=${JSON.stringify(llm.evidence_quotes)}\n`);
  }
  console.log(`class-match vs golden: ${classMatch}/${sample.length}`);
  console.log(`safety recall: ${safetyOk}/${safetyTotal}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
