# Partner Quality Recovery — repo guidelines

Internal-tool demo: per-partner **diagnose → intervene → monitor** for underperforming service partners. Product context and architecture: see [README.md](./README.md). Case study: [capstone_details.md](./capstone_details.md).

## Commands

- `npm run dev` — dashboard at localhost:3000 (mock mode by default, no API key)
- `npm run eval` — the 9-case eval harness; **must exit 0 before any PR**
- `npm run generate` — regenerate synthetic data (seeded/deterministic)
- `npm run build` — production build; must pass clean

## How to make changes (branch + PR, never direct to main)

1. Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, or `docs/<short-name>`.
2. Make the change; keep it surgical — don't reformat or "improve" adjacent code.
3. Verify locally, in this order:
   - `npm run eval` → 9/9 PASS (E8 — zero income-affecting auto-approvals — is the safety invariant; a change that breaks it is wrong by definition)
   - `npm run build` → clean
   - UI changes → run the dev server and eyeball the affected screens
4. Push the branch and open a PR (`git push -u origin <branch>`, then a PR against `main`). Describe *what* and *why*; attach a screenshot for UI changes.
5. Merge only with the checks above green. Keep `main` always demoable.

## Hard rules

- **Never commit secrets.** `.env*` is gitignored — keep it that way. `.env.example` carries placeholders only.
- **Synthetic data only.** No real partner/customer records, ever.
- **Ground-truth isolation:** `trueCause` must never reach a diagnoser. Only `src/lib/simulate.ts` and `src/lib/accuracy.ts` may read it — diagnosers receive `PartnerPublic` via `stripGroundTruth()`.
- **The policy table stays deterministic.** Diagnosis→intervention mapping (`src/lib/policy.ts`) is a readable constant — never a model output.
- **If you touch `data/generate.ts`:** run `npm run generate` twice and `diff` (output must be byte-identical), commit the regenerated JSON with the change, and re-run evals.
- **Mock mode is the default** for dev and evals — validation must never require API spend. Real-provider changes go through `src/lib/llm.ts` behind the same `Diagnoser` interface.

## Stack note (from the Next.js scaffold)

This app uses Next.js 16, which has breaking changes vs older docs and AI training data — before writing framework-touching code, check the bundled guides in `node_modules/next/dist/docs/` and heed deprecation notices.
