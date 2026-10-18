# Theo GitHub review for the prompt cache investigation

**Checked 18 October 2026. I did not locate the specific testing tool, raw results, or full-hit definition behind Theo’s caching post. I did find useful public code in T3 Code for measuring real coding sessions. This discovery improves our testing approach; it does not change the verdict on Gemini.**

The account is [t3dotgg, Theo Browne](https://github.com/t3dotgg), whose profile links to `@theo` and identifies his projects. The review covered every public personal repository and extended to the relevant project organizations linked from his profile. Organization projects and forks are not automatically code personally authored by Theo.

## What was checked

| Public material | Coverage |
| --- | --- |
| Personal repositories | All **137** inventoried: 103 originals and 34 forks. |
| Associated organizations | All **33** public repositories across `pingdotgg` (14), `T3-Content` (11), and `t3-oss` (8). TanStack membership alone was not treated as ownership of its projects. |
| Source contents | Default-branch archives of all **134 non-fork repositories**, plus five relevant personal forks: UI Design Bench, Vibe Kanban, Claude Code, CodexBar, and Melee4Mac. **157,551 text files** scanned across these 139 archives. Candidate code was then read directly. |
| Branches | **4,938 branch names and head commits** inventoried across the 170 repositories, including 1,369 T3 Code branches. Relevant names were investigated, including `t3/provider-testing` and `claude/claude-probe-cache-iq315g`. This was not a content scan of every branch. |
| Other public material | All **16 public gists**, the 300 events returned by the paginated public activity endpoint, targeted code/issue/PR searches, and an October cache-related commit search. The last returned 376 rows representing 302 distinct commits, including duplicated commits in other people’s forks. |

The complete [repository inventory](research/theo-github-inventory.csv), [structured inventory](research/theo-github-inventory.json), and [branch inventory](research/theo-github-branches.csv) make the scope inspectable. Each repository has a finding and its inspection depth. The structured inventory records observed default commits and downloaded archive hashes separately because these active repositories can change during inspection.

Text scanning looked for provider cache counters, prompt/prefix caching, cache misses and benchmarks, Gemini model references, and full-hit terminology. It skipped binaries and individual files over 4 MB. GitHub’s recursive tree response was truncated for Chromium and `create-t3-app-diffs`; the latter was additionally covered by its full downloaded archive. Chromium was screened as an upstream browser fork, without a full content download. Search results were used to find candidates, not to prove absence. Two numeric code searches hit GitHub’s short search-rate limit; those failed requests are not counted as successful checks.

## The useful findings

### T3 Code has the most relevant measurement code

At the inspected [T3 Code commit](https://github.com/pingdotgg/t3code/tree/9c161462c94f7d9d6d9169da5c841457cbadf213), there is a Pi provider and a reader for its session usage. It maps Pi’s input, cache-read, and cache-write counts into separate categories and handles session identity and duplicate records. This supports continuing with Pi as a practical coding harness; it does not establish that Theo used Pi for his cache experiment. [Pi usage reader](https://github.com/pingdotgg/t3code/blob/9c161462c94f7d9d6d9169da5c841457cbadf213/packages/provider-pi/src/server/usage.ts).

The shared contract explicitly separates uncached input, cached input, and cache creation. Its usage page computes cache hit rate as **cached input divided by the sum of those three input categories**. That is a token share for the measured requests, whereas our prominent ratio compared reads with the *preceding* request’s input. Neither formula supplies the missing request-level full-hit rule from Theo’s screenshot. We should present both current-input token share and prior-input shortfall with clear names. [Token contract](https://github.com/pingdotgg/t3code/blob/9c161462c94f7d9d6d9169da5c841457cbadf213/packages/contracts/src/usage.ts), [usage-page formula](https://github.com/pingdotgg/t3code/blob/9c161462c94f7d9d6d9169da5c841457cbadf213/apps/web/src/components/usage/usageBreakdown.ts).

For orientation, our existing data gives Flash **98.95%** and Argon **98.74%** cached reads relative to *current* follow-up input, versus **99.63%** and **99.72%** relative to preceding input. These are two views of the same small pilot, not new measurements or a reproduction of Theo’s rates. New conversation content naturally affects the current-input ratio. [Our recorded metrics](../results/latest/metrics.json).

### The replay toolkit is useful for recording sessions but cannot test live caches offline

T3 Code includes recording scripts for Pi, Claude, Codex, and other adapters, plus a provider replay toolkit. The `t3/provider-testing` branch extracts replay parsing, synchronization, and workspace support; its three branch-specific commits describe this refactoring rather than a new cache benchmark. [Branch comparison](https://github.com/pingdotgg/t3code/compare/main...4fcd89e408b710a2b71b7787e3d61828a11fbf72), [replay parser](https://github.com/pingdotgg/t3code/blob/9c161462c94f7d9d6d9169da5c841457cbadf213/packages/provider-testing/src/replayTranscript.ts).

These fixtures replay recorded adapter traffic to verify application behavior. Offline replay does not make fresh provider requests, so it cannot measure today’s cache performance. The Pi recorder also normalizes identifiers, paths, and times, drops system-context text in a normalization path, disables personal extensions/context, and sets a tiny compaction retention for fixture scenarios. Those choices serve adapter testing. Copying them as a cache benchmark would undermine the workload we want to measure. The useful idea is retaining real session traffic; our cache evidence must preserve the exact API workload and usage responses. [Pi recorder](https://github.com/pingdotgg/t3code/blob/9c161462c94f7d9d6d9169da5c841457cbadf213/apps/server/scripts/record-pi-rpc-replay-fixture.ts).

### Antigravity usage may be observable without changing its authentication

T3 Code contains a reader for local Antigravity conversation databases and protobuf usage records. It extracts separate input/cache counts and reconciles overlapping records. This is a plausible future route to observing a normal Antigravity coding session without changing its login or routing. [Antigravity reader](https://github.com/pingdotgg/t3code/blob/9c161462c94f7d9d6d9169da5c841457cbadf213/apps/server/src/provider/Drivers/antigravityUsageReader.ts).

That reader uses internal field numbers, and its numeric helper defaults absent values to zero. We must validate the schema against the installed version and distinguish missing telemetry from a genuine zero before using this as evidence. It is not an official stable telemetry contract or proof that native CLI counters alone can reproduce Theo’s API test. No native agent settings or authentication were changed in this review.

### Native harness behavior is a separate possible cause of cache loss

An open T3 Code issue reports a Claude session losing cache reuse after Stop/resume, with reconnecting tools and instructions changing the prompt. This is a user report about an older build, not an independently verified current defect or an explanation for Gemini. It gives us a concrete future test condition: distinguish uninterrupted API history from restart/resume and prompt changes. [Issue 10955](https://github.com/pingdotgg/t3code/issues/10955).

An open, unmerged proposal also tries to compact idle threads before assumed cache expiry. Its TTL assumptions and forced one-minute demonstration are application behavior, not verified Gemini eviction measurements. It should not become our provider-cache baseline. [PR 19662](https://github.com/pingdotgg/t3code/pull/19662).

## Other plausible leads and why they do not supply the missing experiment

| Project | What it contains | Value for this investigation |
| --- | --- | --- |
| [azure-bench](https://github.com/t3dotgg/azure-bench/blob/bf7aa0a354b7c24844d6a71324789aac3a173afe/src/bench.ts) | Azure/OpenAI latency measurements using five short standalone prompts, repeated calls, streaming timing, and retries. | An example of published measurement code. It does not test Gemini or long growing coding histories, and does not define the sought full-hit metric. |
| [lust-lang](https://github.com/t3dotgg/lust-lang/blob/d221efb225b61334695c789d1b3add1c4fb6f920/scripts/cache_check.py) and [its agent loop](https://github.com/t3dotgg/lust-lang/blob/d221efb225b61334695c789d1b3add1c4fb6f920/bench/realish/agent_loop.py) | Cached/uncached compiler builds and scripted edit/check/build loops. | The names look promising, but these measure compiler caches and execution, without LLM API calls. |
| [ts-rust](https://github.com/pingdotgg/ts-rust) | Compiler implementation and performance tests. | Compiler/build caching, rather than provider prompt caching. |
| [slotslop](https://github.com/t3dotgg/slotslop) | Selects a coding harness, model, and effort, then launches it. | A launcher, without the cache experiment we need. |
| [SnitchBench](https://github.com/T3-Content/SnitchBench) and [skatebench](https://github.com/T3-Content/skatebench) | Behavior and skateboard-recognition benchmarks, using OpenRouter. | Existing AI benchmarks, but different workloads and endpoints. Skatebench’s result-cache persistence is not prompt caching. |
| [ui-design-bench](https://github.com/t3dotgg/ui-design-bench) | A fork with generated design galleries and Gemini model branches. | Design comparison material, not a located provider-cache test. Fork contents are not automatically Theo’s own methodology. |
| [CodexBar](https://github.com/t3dotgg/CodexBar) and [Vibe Kanban](https://github.com/t3dotgg/vibe-kanban) | Forked usage-monitoring and agent-orchestration software. | Examples of reading usage counters, not the missing benchmark. |
| Public gists | A model-price CSV, a Next.js application-cache example, and unrelated snippets. | No located agentic prompt-cache test. The price CSV concerns older models and should not supply current rates. |
| Other benchmark repositories | Web hosting, server rendering, database, upload, and build performance projects. | Their benchmark/cache names do not indicate LLM prompt-cache measurements. Each is listed in the inventory. |

The `claude/claude-probe-cache-iq315g` branch was another false lead: its four commits cache CLI capability-probe results across instances. They do not benchmark LLM prompt caching. [Branch comparison](https://github.com/pingdotgg/t3code/compare/main...9b8a6af3c11229a6cf5928e2fc356b3ac41d42ad).

## What this changes for our validation

**Keep Pi and the captured public API requests. The missing work is a closer workload and a defensible comparison, not another application or a wholesale harness replacement.** T3 Code provides useful examples of session accounting and recording, but no located shortcut to Theo’s exact test.

The next controlled experiment should grow a coding/tool conversation over many turns, hold that history constant across comparable API replays, and retain exact input/cache/output counters and timing. Report absolute prior-input shortfalls, current-input cached share, and a separately declared strict-match rule. Compute the cache-related cost impact against an explicit counterfactual within each model, keeping fresh content and output costs separate. Natural coding sessions then check whether that controlled result carries over to actual agent work.

Our existing 64-token rule remains our own diagnostic. No new GitHub finding establishes that it matches Theo’s, that Gemini is defective, or that his criticism is false. At the time of this search, the original claim remained unvalidated. The [experimental report](LATEST_RESULTS.md) now includes the subsequent focused small-context measurements; those findings come from new API calls, not from discovering Theo’s benchmark.

This is a broad public-source review, not proof that no test exists anywhere. Private/deleted repositories, every historical commit, every branch’s full contents, Git LFS payloads, and all release/Actions artifacts were not exhaustively inspected. The inspected public material did not yield an executable reproduction of the specific post.
