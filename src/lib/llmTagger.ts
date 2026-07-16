import { preBackendGuard } from "./tag";
import { clampTag } from "./tagGuardrails";
import { buildTagUserContent, SYSTEM1_TAGGING_PROMPT, TAG_SCHEMA } from "./tagPrompt";
import { Customer, RawTag, ReviewInput, Tag } from "./tagTypes";

export interface LlmTagConfig {
  apiKey?: string;
  model: string;
}

/**
 * LLM tagging backend. Same shape as the diagnosis LLM path (`llm.ts`): OpenAI
 * chat/completions, temperature 0, strict json_schema structured output. Returns the
 * raw model tag; the schema/safety/verbatim guardrails live in clampTag, shared with
 * the mock backend, so the two are held to an identical contract.
 */
export async function llmRawTag(review: ReviewInput, config: LlmTagConfig): Promise<RawTag> {
  if (!config.apiKey) throw new Error("OPENAI_API_KEY is not set (tagging mode=llm)");

  const body = JSON.stringify({
    model: config.model,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: { name: "review_tag", strict: true, schema: TAG_SCHEMA },
    },
    messages: [
      { role: "system", content: SYSTEM1_TAGGING_PROMPT },
      { role: "user", content: buildTagUserContent(review) },
    ],
  });

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body,
    });
    if (res.ok) break;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    throw new Error(`OpenAI request failed: ${res ? `${res.status} ${await res.text()}` : "no response"}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content) as RawTag;
}

/** LLM equivalent of tagReview: identical pre-backend guards and post-backend clamp, model in the middle. */
export async function tagReviewLlm(review: ReviewInput, customer: Customer, config: LlmTagConfig): Promise<Tag> {
  return preBackendGuard(review, customer) ?? clampTag(await llmRawTag(review, config), review, customer);
}
