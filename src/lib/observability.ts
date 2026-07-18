/**
 * Langfuse observability — the durable store the Session-4 control-plane lesson asks for,
 * and the immutable per-decision audit trail the PRD (§"Audit record") already requires.
 *
 * OFF BY DEFAULT. With no LANGFUSE_* keys in the environment this module is a strict no-op:
 * the SDK is never imported, nothing changes, and `npm run eval` / mock mode stay offline and
 * free (the CLAUDE.md invariant). Add the two keys and run in DIAGNOSIS_MODE=llm, and every
 * diagnosis becomes one durable trace: the model call nested inside it with token counts + exact
 * USD cost, plus the guardrail/gate flags stamped as metadata.
 *
 * All Langfuse SDK calls are isolated to THIS file (the "copy the pattern from two files" shape
 * the Session-4 Langfuse appendix points at). The rest of the app only ever sees the small
 * interface below — so if the SDK surface shifts, only this file changes.
 *
 * ⚠️ SDK NOTE: this targets the mature imperative `langfuse` v3 client (self-contained, no
 * OpenTelemetry wiring — right for an app that calls providers over `fetch`, with no Anthropic
 * SDK for OTel to auto-instrument). The appendix's examples use the newer OTel-based `@langfuse/*`
 * v5 line; either works. Verify current signatures against langfuse.com/docs before a demo.
 */

import { costUsd } from "./pricing";
import type { Diagnosis } from "./types";

/** One captured model call, handed up from a provider so we can price + record it. */
export interface LlmCallMeta {
  provider: string;
  model: string;
  input: unknown;
  output: unknown;
  inputTokens: number;
  outputTokens: number;
}

export type RecordLlmCall = (meta: LlmCallMeta) => void;

/** What diagnose.ts drives during one diagnosis. No-op unless Langfuse is on and mode is llm. */
export interface DiagnosisTrace {
  generation(meta: LlmCallMeta): void;
  finish(diagnosis: Diagnosis, extra?: Record<string, unknown>): void;
}

const NOOP_TRACE: DiagnosisTrace = { generation() {}, finish() {} };

const keysPresent = () =>
  !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);

// Experiment/other batch runners set this so they can own trace creation without duplicate
// auto-traces firing underneath them.
const autoTraceSuppressed = () => process.env.LANGFUSE_SUPPRESS_AUTOTRACE === "1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let clientPromise: Promise<any | null> | null = null;
let announced = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> {
  if (!keysPresent()) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const { Langfuse } = await import("langfuse");
        const client = new Langfuse({
          publicKey: process.env.LANGFUSE_PUBLIC_KEY,
          secretKey: process.env.LANGFUSE_SECRET_KEY,
          baseUrl: process.env.LANGFUSE_BASE_URL, // undefined → Langfuse EU default
        });
        if (!announced) {
          console.log("[observability] Langfuse tracing enabled");
          announced = true;
        }
        return client;
      } catch (err) {
        console.warn(
          `[observability] Langfuse unavailable, tracing disabled: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return null;
      }
    })();
  }
  return clientPromise;
}

/**
 * Wrap one diagnosis in a Langfuse trace. When tracing is off (no keys), or the diagnosis runs
 * in mock mode, this just calls `fn(NOOP_TRACE)` — zero overhead, zero behaviour change.
 * Telemetry failures are swallowed: a broken trace must never break a diagnosis.
 */
export async function withDiagnosisTrace<T>(
  ctx: {
    partnerId: string;
    mode: string;
    provider: string;
    model: string;
    reviewCount: number;
    sessionId?: string;
  },
  fn: (trace: DiagnosisTrace) => Promise<T>
): Promise<T> {
  const client = ctx.mode === "llm" && !autoTraceSuppressed() ? await getClient() : null;
  if (!client) return fn(NOOP_TRACE);

  let trace: ReturnType<typeof client.trace> | null = null;
  try {
    trace = client.trace({
      name: "diagnose-partner",
      sessionId: ctx.sessionId,
      input: { partnerId: ctx.partnerId, reviewCount: ctx.reviewCount },
      metadata: { provider: ctx.provider, model: ctx.model },
    });
  } catch {
    return fn(NOOP_TRACE);
  }

  const t: DiagnosisTrace = {
    generation(m) {
      try {
        const cost = costUsd(m.model, {
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
        });
        const usage = {
          input: m.inputTokens,
          output: m.outputTokens,
          unit: "TOKENS" as const,
          ...(cost != null ? { totalCost: cost } : {}),
        };
        const gen = trace!.generation({
          name: `${m.provider}-diagnosis`,
          model: m.model,
          input: m.input,
          usage,
        });
        gen.end({ output: m.output, usage });
      } catch {
        /* never break the product for telemetry */
      }
    },
    finish(diagnosis, extra) {
      try {
        trace!.update({
          output: {
            rootCause: diagnosis.rootCause,
            confidence: diagnosis.confidence,
            evidenceValid: diagnosis.evidenceValid,
            evidenceQuoteCount: diagnosis.evidenceQuotes.length,
          },
          metadata: {
            rootCause: diagnosis.rootCause,
            confidence: diagnosis.confidence,
            evidenceValid: diagnosis.evidenceValid,
            injectionDetected: diagnosis.flaggedReviews.length > 0,
            quarantinedReviews: diagnosis.flaggedReviews.length,
            ...extra,
          },
        });
      } catch {
        /* ignore */
      }
    },
  };

  return fn(t);
}

/** What the pipeline2 tag runtime drives during one run's live tagging. Same no-op contract as DiagnosisTrace. */
export interface TagTrace {
  generation(meta: LlmCallMeta): void;
  finish(output: Record<string, unknown>): void;
}

const NOOP_TAG_TRACE: TagTrace = { generation() {}, finish() {} };

/**
 * Wrap one pipeline run's live review-tagging in a Langfuse trace ("tag-reviews"): each provider
 * batch call becomes a nested generation with token counts + USD cost. Strict no-op unless the
 * LANGFUSE_* keys are set AND tagging runs in llm mode — mock/dev stays offline and free.
 */
export async function withTagTrace<T>(
  ctx: { source: string; mode: string; provider: string; model: string; reviewCount: number; uniqueTexts: number },
  fn: (trace: TagTrace) => Promise<T>
): Promise<T> {
  const client = ctx.mode === "llm" && !autoTraceSuppressed() ? await getClient() : null;
  if (!client) return fn(NOOP_TAG_TRACE);

  let trace: ReturnType<typeof client.trace> | null = null;
  try {
    trace = client.trace({
      name: "tag-reviews",
      input: { source: ctx.source, reviewCount: ctx.reviewCount, uniqueTexts: ctx.uniqueTexts },
      metadata: { provider: ctx.provider, model: ctx.model },
    });
  } catch {
    return fn(NOOP_TAG_TRACE);
  }

  const t: TagTrace = {
    generation(m) {
      try {
        const cost = costUsd(m.model, { inputTokens: m.inputTokens, outputTokens: m.outputTokens });
        const usage = {
          input: m.inputTokens,
          output: m.outputTokens,
          unit: "TOKENS" as const,
          ...(cost != null ? { totalCost: cost } : {}),
        };
        const gen = trace!.generation({ name: `${m.provider}-tagging`, model: m.model, input: m.input, usage });
        gen.end({ output: m.output, usage });
      } catch {
        /* never break the product for telemetry */
      }
    },
    finish(output) {
      try {
        trace!.update({ output, metadata: output });
      } catch {
        /* ignore */
      }
    },
  };

  return fn(t);
}

/**
 * Durable audit record for a HUMAN decision (QM decision, appeal filed/resolved). Unlike the
 * diagnosis/tag traces this is NOT gated on llm mode — a human approving an income-affecting
 * action must be auditable regardless of which diagnosis engine ran. Still a strict no-op
 * without the LANGFUSE_* keys (mock/eval stay offline and free). Returns whether it was recorded,
 * so the caller can tell the client if the durable trail is active.
 */
export async function logAuditEvent(
  name: "qm-decision" | "appeal-filed" | "appeal-resolved",
  payload: Record<string, unknown>
): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    client.trace({ name, input: payload, metadata: { audit: true, ...payload } });
    await client.flushAsync();
    return true;
  } catch {
    return false; // telemetry must never break the product
  }
}

/** Flush queued events at a batch boundary (pipeline run, API request, script). No-op when off. */
export async function flushObservability(): Promise<void> {
  if (!keysPresent()) return;
  const client = await getClient();
  if (!client) return;
  try {
    await client.flushAsync();
  } catch {
    /* ignore */
  }
}
