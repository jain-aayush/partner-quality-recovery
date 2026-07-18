import { Config, Diagnosis, PartnerPublic, Review } from "../types";
import {
  buildUserContent,
  DIAGNOSIS_JSON_SCHEMA,
  DIAGNOSIS_TOOL_NAME,
  fetchWithRetry,
  RawLlmDiagnosis,
  RecordLlmCall,
  SYSTEM_PROMPT,
  toDiagnosis,
} from "./shared";

/** OpenAI Chat Completions with strict JSON-schema structured output. */
export async function openaiDiagnose(
  partner: PartnerPublic,
  reviews: Review[],
  config: Config,
  record?: RecordLlmCall
): Promise<Diagnosis> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserContent(partner, reviews) },
  ];
  const res = await fetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: { name: DIAGNOSIS_TOOL_NAME, strict: true, schema: DIAGNOSIS_JSON_SCHEMA },
        },
        messages,
      }),
    },
    "OpenAI"
  );

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenAI returned no message content");
  const raw = JSON.parse(content) as RawLlmDiagnosis;
  record?.({
    provider: "openai",
    model: config.model,
    input: messages,
    output: raw,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  });
  return toDiagnosis(raw, partner.id);
}
