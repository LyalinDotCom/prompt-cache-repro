# Fresh coding-cache result · 17 October 2026

**Gemini showed small reported cache-read shortfalls. We did not reproduce widespread cache loss in this pilot.** This is evidence about the configured Pi/API paths on two tasks; it does not establish an internal cache defect or refute Theo’s other workloads.

All **8 task/model pairs completed naturally**, passed all **41 immutable acceptance tests and the pipeline CLI**, and passed an independent clean replay of only the library edits. All eight patches restored the relevant pinned upstream file exactly. Actual generation-response input was **255,147–386,757 tokens**.

| Model | Verified repairs | ≥250K follow-ups | Cached reads / preceding input | Largest positive shortfall |
| --- | ---: | ---: | ---: | ---: |
| Gemini 3.8 Flash | 2/2 | 23 | 99.6284% | 2,100 tokens |
| Gemini 4 Argon | 2/2 | 9 | 99.7189% | 2,049 tokens |
| GPT-6.1 Sol | 2/2 | 13 | 99.9988% | 3 tokens |
| Claude Opus 5.5 | 2/2 | 5 | 99.9993% | 4 tokens |

**Metric:** sum of cached-read tokens on valid follow-ups divided by sum of their immediately preceding input tokens. Both inputs must be ≥250K. These public counters do not reveal the exact eligible cache frontier. Reads can include newly added history and exceed preceding input; negative shortfalls are retained, not clamped. Follow-ups within a session are correlated.

Under our optional **64-token strict-match rule**, Flash matched **6/23**, Argon **5/9**, GPT **13/13**, and Opus **5/5** follow-ups. Thus strict full-hit counts look much worse for Gemini even while token reuse remains high. The Gemini positive shortfalls were roughly 1.9K–2.1K tokens; their cause and eligibility are not established. No valid follow-up was below 95% of preceding input.

## What ran

- Two seeded, one-line regressions in the real MIT-licensed [node-csv source](https://github.com/adaltas/node-csv/tree/f12e6862a41f4324a06a26c87a3e28031d4faa7f): parser EOF emission and stringifier delimiter quoting. These are intentionally introduced bugs, not claims about upstream defects. The selected 449 unique source/test/example/documentation files were preloaded once, without repeated or random padding.
- Real Pi 1.3.0 read/edit/write and allowlisted Node test/CLI tools. Only library modules were writable; acceptance tests, adapters, CLI verifier, and reference/input material stayed unchanged.
- One operator-labeled paid key per provider, two sessions per model, **30-second minimum completion-to-next-request spacing**, requested high reasoning, and a fixed **32,768-token response allowance** verified in every captured request. Actual idle gaps were 30.0009–30.0038 seconds.
- Natural completion or a 20-minute wall-clock deadline per session, including enforced gaps. No spending cutoff, request-count cap, compaction, cache warming, hidden retries, fallback, or native CLI configuration changes. No completed session hit the deadline or output allowance.

## Complete attempt accounting

**9 session attempts, 59 captured transport attempts, 58 complete API responses, and 50 qualifying follow-ups.** The first Opus/stringifier attempt failed with `fetch failed` before any HTTP response or usage arrived. It remains in the confirmation archive and is not a cache miss. One explicit, separately recorded replacement used the same key/model/task/settings and completed successfully. It did not overlap another Anthropic session.

The confirmation itself completed 7 of its 8 planned repairs; the separate replacement completed the remaining pair. Both cohorts used clean source commit [`fda0dec`](https://github.com/LyalinDotCom/prompt-cache-repro/tree/fda0decb803e08b7f65366ea5ace8a2b13422c9e). The complete responses all passed their frozen independent audits. The only unknown telemetry belongs to the initial connection failure. No measured response was excluded for an integrity failure.

Earlier qualification/calibration attempts are **not pooled** here. Five-second calibration exposed Flash quota errors and Pi’s 272K catalog capacity reducing GPT’s output allowance. Before this confirmation, pacing was set to 30 seconds for all models and GPT’s in-memory capacity was set to its documented 1,050,000-token public API window. Calibration was checkpointed in [private Git history](https://github.com/LyalinDotCom/prompt-cache-repro/tree/ec4fba4/results/excluded-calibration) and removed from the checkout.

## Evidence and reproducibility

Read [per-turn counters](../results/latest/turns.csv), [per-session/model metrics](../results/latest/metrics.json), and the [raw-evidence/reanalysis instructions](../results/latest/README.md). The archives include serialized requests, raw SSE, agent events/messages, exact patches, immutable file hashes, test outputs, clean replay workspaces, audits, and frozen harness/config/lockfiles. A literal-key scan of all 8,672 evidence files found no supplied credentials.

The frozen experiment source and later offline report assembly are identified separately. The [offline assembly script](../results/latest/analysis.py) rechecks artifact hashes, exact test counts, full original replay contents, patch bindings to the recorded final state, actual token targets, timing, output allowance, and high-effort wire settings. These additional checks were completed after peer review and did not change the API workload. Future harness fixes do not rewrite these frozen artifacts.

Pi’s actual transitive SDKs were `@google/genai 2.21.0`, `openai 7.19.0`, and `@anthropic-ai/sdk 0.129.0`, as pinned in the retained lockfile; the browser uses separate newer SDK installations. GPT high effort is carried in `configuration_update` input items; Pi intentionally keeps envelope `reasoning.effort` at `medium`. Requested and returned model IDs matched in every complete response.

To run a new comparable study from the current checkout:

```sh
npm ci
npm run coding -- --dry-run
npm run coding
```

The command now defaults to the long-context allocation and always seed-shuffles. The frozen experiment used `npm run coding -- --config config/coding-long.json --shuffle` at `fda0dec`. The small ledger qualification is explicitly opt-in. Costs in raw batch reports are dated estimates, not invoices.

## Limits that matter

This preloads a large source snapshot, then runs genuine repairs. It **does not reproduce organically accumulated 250K-token native-agent history**. There are only two seeded tasks from one repository and one session per model/task, with one supplied paid key per provider and fixed 30-second pacing. Tier labels are operator declarations. Tokenizers, tool trajectories, and native cache treatments differ; Anthropic explicit breakpoints and the other API paths are not a provider-only causal comparison. No frequency estimate, statistical confidence claim, cache-eligibility guarantee, or internal eviction/routing diagnosis follows.

Opus 5.5 High and Gemini 4 Argon Medium both independently reviewed the harness and agreed that a limited descriptive pilot can be reported with these caveats. Their supported findings and decisions are recorded in [review notes](REVIEW_NOTES.md). The cancellation edge they identified was reproduced offline; it did not occur in these measured sessions.

For engineering: the reproducible observation is Gemini’s small prior-input/read-counter shortfall with preserved public history and passing repairs. Inspect the retained wire requests and provider eligibility semantics before labeling it a cache bug. Broader validation still needs organically grown histories, more repositories, repeated sessions, additional key tiers, and other pacing regimes.
