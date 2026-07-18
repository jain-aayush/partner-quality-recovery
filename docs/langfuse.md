# Langfuse observability

The durable store the Session-4 control-plane lesson asks for, and the immutable per-decision
audit trail the [PRD](../Partner-quality-recover-PRD.md) already requires (§"Audit record").

**Off by default.** With no `LANGFUSE_*` keys, this is a strict no-op — the SDK is never imported,
nothing changes, and `npm run eval` / mock mode stay offline and free (the `CLAUDE.md` invariant).
It only does anything in `DIAGNOSIS_MODE=llm` with keys present.

## What you get

Add the keys and run a real (llm-mode) diagnosis, and every diagnosis becomes one **trace**:

- the model call nested inside as a **generation** — input, structured output, token counts, and the
  **exact USD cost** (`src/lib/pricing.ts` — the token-economics piece the app never had; the
  providers used to discard `response.usage`);
- the guardrail/gate flags stamped as metadata — `injectionDetected`, `quarantinedReviews`,
  `evidenceValid`, `confidence`, `rootCause`;
- one **session** per weekly run (`runPipeline`), grouping every partner's diagnosis together.

## The 3-minute switch-on

1. Create a free project at **cloud.langfuse.com**; copy the public + secret keys.
2. Put them in `.env.local` (see `.env.example`), and set `DIAGNOSIS_MODE=llm` + a provider key.
3. Run something on the llm path — e.g. `npm run eval -- --mode=llm`, or the app's Diagnose action.
   You'll see `[observability] Langfuse tracing enabled` once. Open Langfuse → **Traces**.

## Power-up A — golden set as a hosted dataset

```bash
LANGFUSE_PUBLIC_KEY=... LANGFUSE_SECRET_KEY=... npm run seed:langfuse
```

Pushes the flagged partners into a dataset `partner-quality-gold`. Input is the **ground-truth-stripped**
`PartnerPublic` + reviews (a hard repo rule — `trueCause` only ever lands in `expectedOutput`/metadata).
Idempotent (stable item ids). → Langfuse → Datasets → `partner-quality-gold`.

## Power-up B — the provider flip as a scored experiment

```bash
# any subset of provider keys; runs each one it finds
ANTHROPIC_API_KEY=... OPENAI_API_KEY=... npm run experiment
```

Runs the **real diagnoser** over the golden set on each provider, scored by the **existing** accuracy
metric (`scoreAccuracy`, the E9 label-match) plus evidence-valid rate and avg cost/diagnosis, and
prints a comparison table. Add `LANGFUSE_*` keys (and run `seed:langfuse` first) and each provider is
also published as a Langfuse **dataset run** (`screener-openai` / `screener-anthropic` / `screener-gemini`)
so the runs line up item-by-item in the comparison view.

## Design notes

- All Langfuse SDK calls are isolated to `src/lib/observability.ts` and the two `scripts/`. The rest
  of the app only sees a small interface, so an SDK change touches one file.
- ⚠️ Targets the mature imperative **`langfuse` v3** client — self-contained, no OpenTelemetry wiring,
  the right fit for an app that calls providers over `fetch` (no Anthropic SDK for OTel to
  auto-instrument). The Session-4 appendix's examples use the newer OTel-based `@langfuse/*` v5 line;
  either works. **Verify current signatures against langfuse.com/docs before a demo** — the SDK moves.
- Telemetry never breaks a diagnosis: every Langfuse call is wrapped so a tracing failure is swallowed.
