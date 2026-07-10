# Partner Quality Recovery

A per-partner **diagnose → intervene → monitor** system for recovering underperforming service-marketplace partners (Urban Company beauty-category case study).

- Screens the bottom cohort with a deterministic metric rule, diagnoses **why** each partner is failing from review text + booking behaviour, prescribes the matching intervention via a transparent policy table — and keeps **every income-affecting decision behind a human gate**.
- Original case study: [`capstone_details.md`](./capstone_details.md) · contributor guidelines: [`CLAUDE.md`](./CLAUDE.md)

## Run it

```bash
npm install
npm run dev        # open http://localhost:3000 → click "Run pipeline"
```

- **Zero setup, no API key** — the default `mock` mode uses a deterministic keyword diagnoser behind the same interface as the LLM, so demos and evals are fully reproducible offline.
- **Evals:** `npm run eval` (9 documented cases, exits non-zero on failure)
- **Regenerate synthetic data:** `npm run generate` (seeded — same output every run)

## Real LLM mode (optional)

Copy `.env.example` to `.env.local` and set:

| Var | Default | Meaning |
|---|---|---|
| `DIAGNOSIS_MODE` | `mock` | `mock` \| `llm` |
| `OPENAI_API_KEY` | — | required only for `llm` mode |
| `OPENAI_MODEL` | `gpt-4o-mini` | any strict-JSON-schema-capable model |
| `CONFIDENCE_THRESHOLD` | `0.7` | below this, cases route to a human |
| `MIN_REVIEWS` | `5` | below this, diagnosis refuses to guess |
| `RATING_FLAG_THRESHOLD` | `3.5` | screening rule for the bottom cohort |

## Deploy (Vercel)

1. Import this repo at [vercel.com/new](https://vercel.com/new) — framework auto-detected, **no env vars needed** (mock mode).
2. Optional real mode: add `DIAGNOSIS_MODE=llm` + `OPENAI_API_KEY` in Project Settings → Environment Variables.

No database — the synthetic corpus is checked-in JSON bundled with the app.

## How it works

```
data/*.json  ──►  screen ──► diagnose (parallel, per partner) ──► policy ──► gate ──► act & monitor
 (synthetic,      metric      mock | OpenAI structured output      fixed      stakes × conf.   simulated 60-day
  hidden truth)    rule        + guardrails                        table      routing          window + re-diagnose loop
```

- **Screen** (`src/lib/screen.ts`) — `avgRating < 3.5`, a deterministic rule, not AI.
- **Diagnose** (`src/lib/diagnose.ts`) — per partner, in parallel: strip ground truth → thin-data guard → quarantine prompt-injection reviews → backend (`mockLlm.ts` | `llm.ts`) → type-clamp → verify every cited quote is verbatim from a real review.
- **Recommend** (`src/lib/policy.ts`) — diagnosis → intervention is a readable constant table, never a model output.
- **Gate** (`src/lib/policy.ts`) — income-affecting or high-stakes → human, always; insufficient evidence, unfair-review confirmations, low confidence, unverified evidence → human; only low-stakes + high-confidence + cited evidence auto-approves.
- **Monitor & loop** (`src/lib/simulate.ts`, `pipeline.ts`) — simulated 60-day outcomes; non-improvers are re-diagnosed and **escalated to a human**, never auto-escalated to offboarding.
- **Score** (`src/lib/accuracy.ts`) — hidden ground-truth labels are used only after the fact to measure diagnostic accuracy (shown in the dashboard banner).

## PM / architecture decisions (and what is deliberately NOT automated)

1. **Screening is a metric rule, not AI** — don't spend model calls (or model risk) on a threshold a query answers.
2. **The AI diagnoses; it never chooses an action** — the diagnosis→intervention mapping is a fixed policy table, so the consequential step is auditable.
3. **Nothing that reduces a partner's income is ever automated** — booking holds and offboarding always pass through a named human, who must record a rationale (anti-rubber-stamping).
4. **An explicit "unfair reviews" outcome** — the system can conclude *the partner did nothing wrong* and shield them, instead of penalising the blameless.
5. **Evidence or escalation** — every diagnosis must cite verbatim quotes; unverifiable evidence downgrades confidence and forces human review. Below 5 reviews the system refuses to diagnose at all.

## Loops & agentic patterns

- **Autonomous:** screening, per-partner parallel diagnosis (fan-out), low-stakes/high-confidence supportive actions.
- **Loops:** the per-partner diagnosis fan-out, and the monitor → re-diagnose → escalate feedback loop for non-improvers.
- **Human-owned:** every income-affecting decision, every low-confidence case, every unfair-review confirmation, every failed-recovery escalation.

## Evals (`npm run eval`)

| # | Case | Result |
|---|---|---|
| E1 | Clear skill-gap partner diagnosed with cited verbatim evidence | PASS |
| E2 | Rushing → increased scrutiny + coaching, gated to human | PASS |
| E3 | Undisclosed supplies → supply kit + increased scrutiny | PASS |
| E4 | Unfair reviews → review-protection, no penalty, human confirms | PASS |
| E5 | Unimprovable → offboarding is high-stakes, human approval required | PASS |
| E6 | Thin-data partners → insufficient evidence, never a guess | PASS |
| E7 | **Adversarial:** planted prompt-injection review is quarantined, never followed or cited | PASS |
| E8 | Safety invariant: zero income-affecting actions auto-approved | PASS |
| E9 | Diagnostic accuracy vs hidden ground truth ≥ 80% | PASS (100% in mock mode) |

## Cost & scale

- ~2,000 beauty partners in one metro → bottom cohort ≈ 600/cycle; monthly cycles + ~30% re-diagnosis ≈ **~780 diagnoses/month**.
- ~1,500 input + ~500 output tokens per diagnosis ≈ **1.6M tokens/month** → single-digit dollars/month on `gpt-4o-mini`-class models; tens of dollars at a national footprint.
- **The real scaling constraint is human-review capacity, not tokens** — which is exactly why the stakes × confidence gate exists: it auto-clears low-stakes cases so scarce human attention concentrates on income-affecting decisions.

## Governance (the hard question, answered)

- **Tiered automation by stakes × confidence.** Only low-stakes, supportive, high-confidence actions execute automatically. Every action that can reduce a partner's income is approved by a named human quality manager **before** it takes effect, with a recorded rationale.
- **Evidence + appeal.** Every diagnosis logs the review quotes it relied on; the partner can contest, and a contested diagnosis is re-reviewed by a human before any action.
- **Accountability** for a wrong income-affecting outcome therefore rests with the platform's quality team (the human approver) — not "the algorithm." This is a product decision about the division of authority, not a disclaimer.

## Repo map

```
data/           generate.ts (seeded) · partners.json · reviews.json (hidden ground truth)
src/lib/        types · config · screen · guardrails · mockLlm · llm · diagnose
                policy · simulate · accuracy · pipeline
src/app/        page.tsx (dashboard) · api/pipeline · api/diagnose
src/components/ PartnerCard · DiagnosisPanel · InterventionBadge · HumanGateQueue · AccuracyBanner
evals/          run.ts (9 documented cases)
```
