import { detectInjection } from "./guardrails";
import { mockTagReview } from "./mockTagger";
import { clampTag, emptyTag, isThinText, quarantineTag } from "./tagGuardrails";
import { Customer, ReviewInput, Tag } from "./tagTypes";

/**
 * Guards that run before any tagging backend, so untrusted review text never reaches
 * a model: thin text short-circuits to an empty tag, injection is quarantined.
 * Returns a finished Tag when short-circuited, else null (proceed to the backend).
 */
export function preBackendGuard(review: ReviewInput, customer: Customer): Tag | null {
  if (isThinText(review.review_text)) return emptyTag(review, customer, "thin_text");
  if (detectInjection(review.review_text)) return quarantineTag(review, customer);
  return null;
}

export function tagReview(review: ReviewInput, customer: Customer): Tag {
  return preBackendGuard(review, customer) ?? clampTag(mockTagReview(review), review, customer);
}

export function tagCorpus(reviews: ReviewInput[], customers: Customer[]): Tag[] {
  const customersById = new Map(customers.map((customer) => [customer.customer_id, customer]));
  return reviews.map((review) => {
    const customer = customersById.get(review.customer_id);
    if (!customer) throw new Error(`customer ${review.customer_id} missing for review ${review.review_id}`);
    return tagReview(review, customer);
  });
}
