Overall: the skeleton is faithful to the PRD — 3-system split, deterministic policy table, human gate on income-affecting
actions, prevalence
  gate, karma weighting, safety tiering all exist and the safety invariant (no income-affecting auto-approvals) holds. The problems are in what's
  around that skeleton.

  ---
  A. Safety recall bugs — the PRD's own "worst failure in the system"

  - 1. A safety complaint inside a 4–5★ review is never detected. (verified)
    - The tagger checks "is this a positive review?" before scanning for safety words. A 4★ "nice haircut but she burned my neck" review exits
  early as "positive" — no safety flag, no pause, nothing. Same for very short reviews: "Burned me." (1★) is dismissed as "too thin" before the
  safety scan runs. PRD FM5 explicitly requires safety keywords to force a flag regardless of sentiment; QC1 sets safety recall ≥99% as the
  hardest gate.
  - 2. Hinglish safety events are undetectable — and untested.
    - The safety word list is English-only. The PRD's own example — "thoda jal gaya" (got slightly burned) — sails through unflagged. There is
  zero Hinglish/sarcasm anywhere in the new corpus or the 22 evals, so FM5 (the failure mode the PRD says a traditional PM would miss) has no
  coverage at all in v2.

  B. Wrong-verdict logic — fairness bugs in both directions

  - 3. A review with a real complaint + a pricing gripe is thrown away entirely. (verified)
    - "The colour came out patchy and she overcharged me" → the whole review is classified as "about pricing" and excluded from the partner's
  quality signal. The skill complaint is lost. Each review gets exactly one target, and pricing/app wins over partner — so any mixed review
  under-counts real issues.
  - 4. "Not her fault" reviews still count against the partner. (verified)
    - "My hair was already damaged from a previous salon, but it's still patchy" is correctly recognized as customer-self/unfair — but its skill
  mention also increments the partner's skill-issue rate. So the very evidence that should shield her (FM1, the headline failure) simultaneously
  pushes her toward a skill-training action. A partner can end up with training and review-protection for the same reviews.
  - 5. Thin-data cases are silently auto-passed instead of routed to a human. (verified)
    - Below 5 reviews the diagnosis correctly refuses and flags insufficient_evidence + needs_human — but the decision layer ignores diagnosis
  flags entirely. The case ends as auto-approved "do nothing", when the PRD says it goes to the analyst back-fill queue. (The refusal also
reports
  confidence = 1.0, which is nonsense on its face.) Nothing catastrophic executes, but the human-routing contract is broken.
  - 6. The injection filter quarantines genuine praise. (verified)
    - Patterns like "you are a…" and "rate this partner" are treated as attack signatures, so "You are an amazing stylist, I'd rate this partner
5
  stars!" gets quarantined and internally marked negative. Low direct harm (quarantined reviews don't count), but it corrupts the "quarantined
  attempts" tally the QM sees and erodes trust in that console number.

  C. PRD scope that isn't actually there (behind eval labels that suggest it is)

  - 7. The escalation ladder — the PRD's core due-process protection — doesn't exist.
    - No soft-ban is ever issued, no strike counting, no per-SKU hard-ban, no coaching-cycle cap. Concretely: a partner failing on one SKU gets
  auto-approved training, and if it doesn't work, next cycle they get… auto-approved training again, forever. And "unimprovable" (platform
  offboard candidate) is reached by "was coached once + still failing on a majority of SKUs" — skipping the entire soft-ban phase the PRD spends
  §1b defining (the "~150 days of due process"). It also doesn't respect the "never offboard on <5 reviews" rule.
  - 8. The monitor can declare a fake recovery. (verified)
    - I built a partner whose post-training weeks had almost no bookings: the tracker reported "complaints down 100% — recovered." The
  MIN_BOOKINGS_FLOOR ("extend the window, never score on thin volume") is unenforced — exactly the self-fulfilling failure the PRD claims is
  "resolved in-spec" in §7. Related: the monitor is display-only — a stalled partner never generates the queued soft-ban recommendation the PRD
  describes; the loop never feeds back into decisions.
  - 9. There is no AI in the new pipeline.
    - The v2 tagger and diagnosis agent are keyword-matching mocks with no LLM behind them. The PR's "multi-provider LLM layer" only serves the
  old v1 flow, which the new console no longer uses — and that old LLM prompt offers "unimprovable" as a model-choosable verdict, which the PRD
  explicitly forbids (derived state only, never a model output). The diagnosis agent also never sees booking patterns or prior-intervention
  history (PRD-specified inputs). Mock-first is fine per repo rules — but there's currently no seam to ever run System 1/2.5 with a real model,
  and the synthetic reviews are generated from the same keyword pools the mock matches on, so the evals partly test a circle.
  - 10. Diagnostic accuracy is unmeasured for what's actually demoed.
    - The new corpus carries no hidden ground-truth labels, so PRD E11 ("≥85% vs hidden labels") can't run against the v2 pipeline. The "100%
  accuracy" number comes from the legacy eval on the old 15-partner dataset.
  - 11. The accelerated (quality-severe) track is unreachable in the demo and untested.
    - The generator deliberately keeps every complaint at severity 3, no eval covers severity 4–5 routing (PRD E16), and the "1 coaching cycle"
  leash isn't implemented. Severity ≥4 only triggers via 8 English intensity words.
  - 12. The safety pause waits for a human — the PRD says it's the one thing that must not.
    - For a grave flag (burn/harassment/theft), the PRD's design is: immediate precautionary pause, then a fast-tracked human decides
  offboard-vs-exonerate. The implementation puts the pause and the offboard behind the same human gate — so an allegedly unsafe partner keeps
  taking bookings until a QM acts. Safety decisions also carry empty evidence quotes ("evidence or silence" rule).
  - 13. The eval labeled "E10/E15" doesn't test E15.
    - There's no SLA/timeout/queue machinery at all (fine for v0), but the eval name claims the timeout auto-approve bound is covered. It only
  checks the (real, passing) no-auto-income-action invariant.

  D. Input-validation misses (the CSV upload path)

  - 14. A missing/invalid rating silently becomes a 5★ positive review — complaint text is then ignored entirely. PRD says null rating →
  thin/back-fill queue. Also: missing karma defaults to 0.8 (trusted), rows without a SKU are silently dropped (PRD: infer or flag), and the
  "week-over-week" charts assume weekly-bucketed dates — a real daily-dated CSV renders mislabeled trends.
  - 15. Config drift: the hygiene-corroboration count is UNFAIR_CORROBORATION_MIN in one file and a hardcoded 2 in another (tuning one silently
  diverges the other); a dozen registry values (soft-ban, coaching caps, SLAs, rating screen) are dead config because of #7/#13.

  Deviations I checked and would keep (implemented > PRD)

  - Off-target relevance routing (pricing/app → excluded with a "not counted" tally, instead of dumping into partner triage) — better; the PR
  honestly edited the PRD to match. One loss to note: the PRD's "pricing → routed to ops" concept now goes nowhere.
  - Prevalence-based screening instead of the avg-rating < 3.5 screen — better; with order-level data partner averages stay high while one SKU
  rots, which is FM4's whole point.
  - Multi-SKU order attribution (complaint lands on the named service; co-services stay clean) — a sensible addition beyond the PRD, and tested.


---

No-ship: the supplied safety, fairness, thin-data, monitoring, and escalation findings are materially supported; the new flow can miss grave
  events and make misleading or premature recommendations.

  Findings:
  - [critical] Safety detection is bypassed before the safety scan (src/lib/tag.ts:107-137)
  A 4–5★ review returns as positive before safety keywords are checked, and a review under three words returns as thin text first. Thus "nice
  haircut but she burned my neck" and "Burned me." never set safetyFlag; the English-only lexicon also cannot detect the PRD's Hinglish safety
  example. A grave incident can consequently receive no pause or fast-track review.
  Recommendation: Run multilingual safety detection before positive/thin-text exits, preserve a safety flag for all ratings/text lengths, and add
  adversarial Hinglish and mixed-sentiment safety fixtures.
  - [high] A grave safety flag is only a human-gated recommendation, not an immediate precautionary pause (src/lib/decide.ts:18-32)
  The grave-safety result includes safety_pause but marks the whole decision human_required. There is no separate immediately executable pause
  state, so the partner remains bookable until a reviewer acts; evidenceQuotes is also discarded despite the tag carrying the quoted incident.
  Recommendation: Emit and execute a distinct immediate provisional pause for grave flags, retain the tag evidence, and gate only the subsequent
  offboard/exoneration decision.
  - [high] Mixed pricing and partner complaints are excluded wholesale (src/lib/tag.ts:66-71)
  detectTarget gives pricing priority whenever a pricing keyword exists. Aggregation then excludes every non-partner target, including any
  skill/time class on that same review. A review saying the colour was patchy and she overcharged therefore loses the partner-quality complaint
  entirely.
  Recommendation: Represent target/relevance per problem class, or retain partner-attributable classes when an off-target complaint coexists; add
  a mixed-complaint evaluation.
  - [high] Customer-self evidence both shields and penalizes the partner (src/lib/aggregate.ts:52-83)
  An unfair-review tag is intentionally admitted to partnerNeg, but all its problem classes are then counted. For an out-of-partner-control review
  that also says "patchy," the skill_issue rate rises while unfair_review may trigger protection, producing contradictory action against the same
  evidence.
  Recommendation: Aggregate customer-self reviews only for the protective signal; exclude their non-protective classes from partner issue rates
  unless separately verified partner attribution exists.
  - [high] Insufficient-evidence cases can silently auto-pass (src/lib/decide.ts:84-101)
  The diagnoser emits needs_human and insufficient_evidence for low-N rows, but decide only considers significant causes, evidence validity, and
  confidence. Since low-N has no causes, it returns do_nothing with auto_approved, ignoring both flags; the reported 1.0 confidence makes this
  especially misleading.
  Recommendation: Make insufficient_evidence/needs_human a first-class human-routing condition before the no-action branch, and use non-decisive
  confidence for refusals.
  - [high] The escalation ladder is not implemented and "unimprovable" is derived from a single prior intervention (src/lib/unified.ts:188-223)
  Prior history is reduced to whether any intervention_date exists, then a partner can become an offboard candidate when coached-and-still-failing
  SKUs form a majority. The decision path never tracks coaching cycles, soft-ban strikes, re-evaluation windows, or hard-ban progression, so it
  can bypass the specified due-process ladder.
  Recommendation: Persist per-SKU intervention state and enforce coaching caps, soft-ban/re-evaluation/strike transitions, and low-N restrictions
  before deriving unimprovable.
  - [medium] Progress can report recovery from near-zero post-intervention volume (src/lib/unified.ts:249-270)
  The tracker averages post-window rates even when the denominator has zero or very few bookings. Although minBookingsFloor is configured, it is
  never checked, so zero complaints across one or zero bookings can be reported as recovered instead of extending the window.
  Recommendation: Track post-window booking counts and refuse recovery/strike scoring until MIN_BOOKINGS_FLOOR is met; extend the measurement
  window otherwise.
  - [medium] CSV parsing silently turns invalid ratings into five stars and accepts invalid dates (src/lib/unified.ts:152-164)
  Missing, zero, or nonnumeric ratings become 5 via || 5; malformed dates pass the filter and later make the decision-window timestamp NaN,
  yielding an empty result rather than an upload error. This can hide complaint data in a real upload.
  Recommendation: Validate required headers, rating values/null semantics, and ISO dates; return row-level validation errors or route valid
  null-rating rows to back-fill instead of defaulting them.