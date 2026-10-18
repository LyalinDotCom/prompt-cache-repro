# Coding cache methodology

## Question

Do public Gemini APIs show worse reported prompt-cache reuse than comparison APIs during real coding-agent work, and under which tested conditions? Cache counters describe the configured API/agent path; they do not identify an internal cause. The original criticism's complete workload and cache-eligibility definition are unavailable, so exact replication is not claimed.

## Session rules

- Use the exact selected models and explicit account keys; no fallback, auth changes, hidden retry, or automatic continuation.
- Run a genuine coding task on a disposable repository, with real source edits, actual failing baseline tests, independent final tests, unchanged acceptance material, and retained patches.
- Allow natural completion or a **20-minute deadline per session**. No spending cutoff, request-count cutoff, or batch deadline. Cost estimates are recorded only. The API timeout defaults to the same 20 minutes. Dependency-free fixture subprocesses have a 30-second timeout for hung tests.
- Default per-response output allowance: 32,768 tokens. Record any length truncation. Default reasoning effort is high. Reasoning settings must be explicit and retained; equal effort names do not imply equal computation across providers.
- Retain native tool-call history and signatures, effective configuration, exact endpoint/model IDs, serialized requests, raw response streams, UTC timestamps, actual idle gaps, and public usage counters.
- Keep all attempts in a study, including provider errors, refusals, missing usage, failed repairs, and timeouts. Do not infer a cache miss from an error or missing telemetry.

The current small qualification fixture is `fixtures/coding-ledger`. Its full source/test snapshot is preloaded into the user prompt. Tools can read the workspace, edit `src/` and `bin/`, and execute a disclosed allowlist of real test/CLI commands. This is a controlled coding workflow, not an unrestricted native-agent environment or an operating-system sandbox.

## Long context

Advertised window capacity and actual input occupancy are different measurements. A long-context result must show provider-reported input counts around **250K tokens**, with the precise observed range and qualifying follow-up count. Character counts, file sizes, and a model's advertised 1M window do not qualify.

Use pinned public source and relevant tasks, preserving licenses and hashes. Avoid repeated filler, random padding, or an unrelated code dump solely to inflate context. Multiple tasks/repositories are required before generalizing. A large source preload is a controlled context-load arm; a session that accumulates file reads, tool results, edits, and reasoning is a separate arm. Do not pool them.

The [250K+ code-context pilot](LONG_CONTEXT_PROTOCOL.md) uses two seeded regressions in pinned public CSV-library source, with independent executable acceptance checks. Its allocation is registered separately. Actual generation-response input counters, task outcomes, and audits determine whether it qualifies; planning counts alone are not results.

## Analysis

Report absolute prior-input deficits, token-weighted cache coverage, per-task outcomes, actual timing, and known/unknown eligibility. Preserve small residual differences without calling them internal cache failures. A fixed-size uncached tail can fail a percentage threshold at small context and pass at large context; a binary full-hit count alone is insufficient.

Strict64 and below-95% are descriptive diagnostics, not provider guarantees or cross-provider defect tests. Public cached-read counts can include different boundaries and token framing. Anthropic's explicit cache markers and Gemini/OpenAI implicit caching are distinct treatments. Native serialization and tool trajectories also differ.

Reconstruct counters from captured raw streams independently of the agent's summaries. Input is partitioned into ordinary input, cache reads, and cache writes using the documented provider semantics. Unknown counters and unsupported accounting stay unknown. Date rate cards and verify their context bands before pricing a new arm. Estimated costs are not bills; hypothetical full-cache baselines are not proof of attainable service behavior.

A constant tail, block alignment, accounting offset, caller prefix mutation, and provider-side cache loss are competing explanations to test, not established causes. Public prefix equality is necessary evidence but cannot prove identical hidden server rendering.

## Fresh-study policy

No previous experimental evidence or results are retained in the working tree. Git history records their deletion. New studies start from a frozen protocol/source/config, run under one declared allocation, and keep their actual failures alongside successful observations. Publish conclusions only when their scope matches the verified workload and evidence.
