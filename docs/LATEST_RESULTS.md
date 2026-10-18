# Report: did we reproduce Theo’s Gemini caching criticism?

**Not yet. We found a measurable difference in Gemini’s reported cache counters, but we have not established that it is the problem Theo reported, reproduced its cost impact, or disproved his criticism. The original validation goal remains incomplete.**

These are fresh measurements from 17 October 2026. This report separates the evidence we have from the conclusion we still cannot draw.

## What this says about Theo’s claims

**18 October follow-up:** A [review of Theo’s public GitHub projects](THEO_GITHUB_REVIEW.md) found useful accounting and session-recording code, but did not locate the benchmark or full-hit definition behind his post. It does not change this report’s verdict.

The [reference supplied with this project](references/proposed-layered-benchmark.txt) describes [Theo’s post](https://x.com/theo/status/2111370893561909423) as reporting fewer full cache hits for Gemini in an API test simulating agent work, and discusses a possible material cost penalty. That reference is a secondary account. We do not have his complete executable test or verified full-hit definition; the X page also returned HTTP 403 when rechecked for this report. **This is a related experiment, not an exact reproduction of his benchmark.**

| Question | What our data says | Verdict |
| --- | --- | --- |
| Does Gemini show a cache-counter difference versus the controls during coding work? | Yes. Gemini often reported about 2,000 fewer cached tokens than the preceding request’s input. GPT and Opus had differences of only 2–4 tokens. | A difference worth investigating. Its cause is unknown. |
| Does Gemini get fewer nearly complete cache matches? | Yes under **our** rule: Flash 6/23, Argon 5/9, GPT 13/13, Opus 5/5 follow-ups matched within 64 tokens. | Same general direction as the supplied criticism, but a different workload and an unverified match definition. These rates cannot be compared directly to Theo’s. |
| Did Gemini repeatedly lose large portions of the preceding input? | We did not observe that in these sessions. Aggregate cached reads were about 99.6–99.7% of preceding input. | This test does not demonstrate large cache loss. It also does not establish that all eligible tokens were cached. |
| Did we reproduce the reported cost penalty? | No. We have not established a controlled cost comparison that reproduces it. | Unanswered. |
| Is Theo wrong, or is the problem fixed? | This small, different experiment cannot answer either question. | **Neither conclusion is supported.** |

## Why “99.7%” did not answer your question

A **full-hit rate** counts how many requests meet a near-total match rule. A **token ratio** measures how much input was reported as cached. They answer different questions.

For example, in our actual Flash data, a follow-up reported **320,561 cached tokens** after a request with **322,548 input tokens**. That is **99.38%** of the preceding input, but a **1,987-token shortfall**: it fails our strict match rule. So high token ratios and frequent strict-match failures can both be true. Leading with “99.7% cached” made our results sound more reassuring than the evidence supports.

We also cannot tell from these public counters whether those roughly 2,000 tokens were eligible for reuse, why the difference occurs, or whether it reflects an internal cache defect. Some follow-ups report *more* cached tokens than the preceding input, because the conversation grows; those observations remain in the aggregates. These ratios are observations, not a direct measurement of the provider’s eligible-cache hit probability.

## What we actually tested—and the important gap

Four models each repaired two deliberately introduced bugs in real CSV-library code. **All eight repairs passed all 41 acceptance tests, the pipeline CLI, and a clean replay of just the library edits.** Actual API-reported input ranged from **255,147 to 386,757 tokens**. The agents really read, edited, and tested code.

However, most of that large context was loaded at the start as repository files. It was **not** 250K tokens of accumulated coding conversation, edits, and tool results. There were only two tasks from one repository, one paid key per provider, and a fixed 30-second pause between requests. Those choices limit how well this represents everyday coding sessions. Passing the repairs validates the coding workload; it does not validate a conclusion about Theo’s cache problem.

**The next useful experiment is a repeated, controlled agent-style API replay with growing coding/tool history and recorded per-turn cache counters and cost assumptions.** It should exercise the history growth and timing relevant to the criticism, rather than achieve a large token count mainly through a starting preload. We also need Theo’s exact full-hit definition before claiming a numerical replication. Native CLI testing is a separate follow-up if we want conclusions about particular coding products.

## A factual FYI for engineering

> In a small outside-in coding pilot, Gemini Flash and Argon often reported cached-token counts about 2K below the previous request’s input; GPT and Opus differed by only 2–4 tokens. All eight coding repairs passed independent checks at 255K–387K input. Gemini therefore showed fewer strict matches, despite high aggregate token reuse. We have not established cache eligibility or cause, reproduced Theo’s cost penalty, or replicated his benchmark. Please treat this as a counter discrepancy to investigate, not proof of a Gemini cache bug or evidence that the reported problem is fixed.

## Measured results and technical details

| Model | Verified repairs | ≥250K follow-ups | Cached reads / preceding input | Largest positive shortfall |
| --- | ---: | ---: | ---: | ---: |
| Gemini 3.8 Flash | 2/2 | 23 | 99.6284% | 2,100 tokens |
| Gemini 4 Argon | 2/2 | 9 | 99.7189% | 2,049 tokens |
| GPT-6.1 Sol | 2/2 | 13 | 99.9988% | 3 tokens |
| Claude Opus 5.5 | 2/2 | 5 | 99.9993% | 4 tokens |

**Metric:** sum of cached-read tokens on valid follow-ups divided by sum of their immediately preceding input tokens. Both inputs must be ≥250K. Reads can include newly added history and exceed preceding input; negative shortfalls are retained, not clamped. Follow-ups within a session are correlated. Our strict rule counts a match when cached reads are no more than 64 tokens below preceding input; it is not verified as Theo’s rule. No valid follow-up was below 95% of preceding input.

## What ran

- Two seeded, one-line regressions in the real MIT-licensed [node-csv source](https://github.com/adaltas/node-csv/tree/f12e6862a41f4324a06a26c87a3e28031d4faa7f): parser EOF emission and stringifier delimiter quoting. These are intentionally introduced bugs, not claims about upstream defects. The selected 449 unique source/test/example/documentation files were preloaded once, without repeated or random padding.
- Real Pi 1.3.0 read/edit/write and allowlisted Node test/CLI tools. Only library modules were writable; acceptance tests, adapters, CLI verifier, and reference/input material stayed unchanged.
- One operator-labeled paid key per provider, two sessions per model, **30-second minimum completion-to-next-request spacing**, requested high reasoning, and a fixed **32,768-token response allowance** verified in every captured request. Actual idle gaps were 30.0009–30.0038 seconds.
- Natural completion or a 20-minute wall-clock deadline per session, including enforced gaps. No spending cutoff, request-count cap, compaction, cache warming, hidden retries, fallback, or native CLI configuration changes. No completed session hit the deadline or output allowance.

## Complete attempt accounting

**9 session attempts, 59 captured transport attempts, 58 complete API responses, and 50 qualifying follow-ups.** The first Opus/stringifier attempt failed with `fetch failed` before any HTTP response or usage arrived. It remains in the confirmation archive and is not a cache miss. One explicit, separately recorded replacement used the same key/model/task/settings and completed successfully. It did not overlap another Anthropic session.

The confirmation itself completed 7 of its 8 planned repairs; the separate replacement completed the remaining pair. Both cohorts used clean source commit [`fda0dec`](https://github.com/LyalinDotCom/prompt-cache-repro/tree/fda0decb803e08b7f65366ea5ace8a2b13422c9e). The complete responses all passed their frozen independent audits. The only unknown telemetry belongs to the initial connection failure. No measured response was excluded for an integrity failure.

Earlier qualification/calibration attempts are **not pooled** here. Five-second calibration exposed Flash quota errors and Pi’s 272K catalog capacity reducing GPT’s output allowance. Before this confirmation, pacing was set to 30 seconds for all models and GPT’s in-memory capacity was set to its documented 1,050,000-token public API window. Calibration was checkpointed in [Git history](https://github.com/LyalinDotCom/prompt-cache-repro/tree/ec4fba4/results/excluded-calibration) and removed from the checkout.

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
