import { Config, Diagnosis, PartnerPublic, Review, RootCause } from "./types";

/**
 * Deterministic keyword-based diagnoser. Same interface as the LLM backend, zero
 * dependencies, reproducible output — the default mode for demos and evals.
 */
export const KEYWORDS: Record<string, string[]> = {
  skill_gap: ["patchy", "uneven", "streak", "wrong shade", "technique", "botched", "one side"],
  rushing: ["rushed", "hurried", "left early", "on the phone", "next booking", "half done", "in a hurry"],
  undisclosed_supplies: ["cheap product", "unbranded", "smelled", "burned", "not the brand", "substituted", "rash", "refilled"],
  unfair_reviews: ["already damaged", "like the photo", "like the picture", "celebrity", "unrealistic", "previous salon", "film star"],
};
const UNIMPROVABLE = ["hours late", "rude", "no-show", "total mess", "unprofessional", "never again"];

function matchedKeywords(text: string, keywords: string[]): string[] {
  const t = text.toLowerCase();
  return keywords.filter((k) => t.includes(k));
}

/** The exact sentence containing the keyword — verbatim substring, so evidence validation passes. */
function evidenceSentence(text: string, keyword: string): string {
  const sentence = text
    .split(/(?<=[.!?])\s+/)
    .find((s) => s.toLowerCase().includes(keyword));
  return (sentence ?? text).trim();
}

export async function mockDiagnose(
  _partner: PartnerPublic,
  reviews: Review[],
  _config: Config
): Promise<Diagnosis> {
  const signal = reviews.filter((r) => r.rating <= 3);

  const scores: Record<string, { count: number; hits: { review: Review; keyword: string }[] }> = {};
  for (const cause of [...Object.keys(KEYWORDS), "unimprovable"]) {
    scores[cause] = { count: 0, hits: [] };
  }
  for (const review of signal) {
    for (const [cause, keywords] of Object.entries(KEYWORDS)) {
      const matched = matchedKeywords(review.text, keywords);
      if (matched.length > 0) {
        scores[cause].count += 1;
        scores[cause].hits.push({ review, keyword: matched[0] });
      }
    }
    const unimp = matchedKeywords(review.text, UNIMPROVABLE);
    if (unimp.length > 0) {
      scores.unimprovable.count += 1;
      scores.unimprovable.hits.push({ review, keyword: unimp[0] });
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1].count - a[1].count);
  const causesWithSignal = ranked.filter(([, s]) => s.count >= 2).length;

  let rootCause: RootCause;
  // "bad across every dimension" beats any single-cause reading
  if (scores.unimprovable.count >= 2 || causesWithSignal >= 3) {
    rootCause = "unimprovable";
  } else if (ranked[0][1].count === 0) {
    rootCause = "insufficient_evidence";
  } else {
    rootCause = ranked[0][0] as RootCause;
  }

  if (rootCause === "insufficient_evidence") {
    return {
      partnerId: _partner.id,
      rootCause,
      confidence: 0.3,
      evidenceQuotes: [],
      secondaryHypothesis: null,
      reasoning: `${signal.length} negative review(s) carry no recognizable root-cause signal.`,
      flaggedReviews: [],
      evidenceValid: true,
    };
  }

  const winner = scores[rootCause];
  const runnerUp = ranked.find(([cause]) => cause !== rootCause)!;
  const top = winner.count;
  const second = rootCause === "unimprovable" ? 0 : runnerUp[1].count;
  const confidence =
    Math.round(
      Math.min(0.95, (0.5 + 0.45 * ((top - second) / Math.max(top, 1))) * Math.min(1, top / 3)) * 100
    ) / 100;

  const evidenceQuotes = winner.hits
    .slice(0, 3)
    .map((h) => evidenceSentence(h.review.text, h.keyword));
  const keywordList = [...new Set(winner.hits.map((h) => `'${h.keyword}'`))].slice(0, 3).join(", ");

  return {
    partnerId: _partner.id,
    rootCause,
    confidence,
    evidenceQuotes,
    secondaryHypothesis: runnerUp[1].count > 0 ? (runnerUp[0] as RootCause) : null,
    reasoning: `${top}/${signal.length} negative reviews carry ${rootCause} signals (${keywordList})${
      runnerUp[1].count > 0 ? `; ${runnerUp[1].count} suggest ${runnerUp[0]}` : ""
    }.`,
    flaggedReviews: [],
    evidenceValid: true,
  };
}
