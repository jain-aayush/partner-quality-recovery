import { Config, Diagnosis, PartnerPublic, Review } from "../types";
import {
  buildUserContent,
  DIAGNOSIS_JSON_SCHEMA,
  DIAGNOSIS_TOOL_NAME,
  fetchWithRetry,
  RawLlmDiagnosis,
  SYSTEM_PROMPT,
  toDiagnosis,
} from "./shared";

interface AnthropicContentBlock {
  type: string;
  input?: unknown;
}

/**
 * Anthropic Messages API. Structured output is obtained by forcing a single tool
 * call whose input_schema is the shared diagnosis schema — the model must return
 * the tool arguments, which we read straight off the tool_use block.
 */
export async function anthropicDiagnose(
  partner: PartnerPublic,
  reviews: Review[],
  config: Config
): Promise<Diagnosis> {
  const res = await fetchWithRetry(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // No `temperature`: Opus 4.7/4.8, Sonnet 5, and Fable 5 reject sampling
        // params with a 400. Forced tool_choice already makes the output deterministic.
        model: config.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: DIAGNOSIS_TOOL_NAME,
            description: "Return the single most likely root-cause diagnosis for this partner.",
            input_schema: DIAGNOSIS_JSON_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: DIAGNOSIS_TOOL_NAME },
        messages: [{ role: "user", content: buildUserContent(partner, reviews) }],
      }),
    },
    "Anthropic"
  );

  const data = await res.json();
  const blocks: AnthropicContentBlock[] = Array.isArray(data.content) ? data.content : [];
  const toolUse = blocks.find((b) => b.type === "tool_use");
  if (!toolUse?.input) throw new Error("Anthropic returned no tool_use block");
  return toDiagnosis(toolUse.input as RawLlmDiagnosis, partner.id);
}
