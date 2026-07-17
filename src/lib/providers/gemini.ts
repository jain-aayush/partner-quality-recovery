import { Config, Diagnosis, PartnerPublic, Review } from "../types";
import { buildUserContent, fetchWithRetry, RawLlmDiagnosis, SYSTEM_PROMPT, toDiagnosis } from "./shared";

const CAUSE_ENUM = [
  "skill_gap",
  "rushing",
  "undisclosed_supplies",
  "unfair_reviews",
  "unimprovable",
  "insufficient_evidence",
];

/**
 * Gemini's responseSchema is an OpenAPI 3.0 subset, not JSON Schema: uppercase
 * types, `nullable` instead of a `["string","null"]` union, no additionalProperties.
 * secondary_hypothesis is left off `required` (→ omitted/null) and its value is
 * re-validated against the enum by clampDiagnosis downstream.
 */
const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    root_cause: { type: "STRING", enum: CAUSE_ENUM },
    confidence: { type: "NUMBER" },
    evidence_quotes: { type: "ARRAY", items: { type: "STRING" } },
    secondary_hypothesis: { type: "STRING", nullable: true },
    reasoning: { type: "STRING" },
  },
  required: ["root_cause", "confidence", "evidence_quotes", "reasoning"],
  propertyOrdering: ["root_cause", "confidence", "evidence_quotes", "secondary_hypothesis", "reasoning"],
};

/** Google Gemini generateContent with a JSON response schema. */
export async function geminiDiagnose(
  partner: PartnerPublic,
  reviews: Review[],
  config: Config
): Promise<Diagnosis> {
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey ?? "" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserContent(partner, reviews) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }),
    },
    "Gemini"
  );

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini returned no content");
  return toDiagnosis(JSON.parse(text) as RawLlmDiagnosis, partner.id);
}
