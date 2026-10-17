# Cachebench v1: implementation contract

Status: implementation in progress. This document describes the shipped scope, not every idea in the reference specs. The original proposals are preserved unchanged in `docs/references/`.

## Purpose

Run an outside-in public API experiment and produce enough inspectable evidence to evaluate Theo's prompt-cache observation for the tested conditions. Support different keys, account/tier labels, models, idle gaps, and repeated runs. Accounts own keys; models are independent. Every account runs every selected model for its provider. Two Gemini keys and two Gemini models produce four cells per workload/gap. Never turn a short smoke test into a provider-wide verdict or claim to identify an internal root cause.

## Product

A static web app calls each provider directly from the visitor's browser using its official TypeScript SDK. Visitors enter their own keys, select profiles and a test, run it, inspect turn results, and download JSON, JSONL, CSV, and Markdown reports. Keys live only in page memory and go only to the selected provider. No benchmark proxy, app server, analytics, key storage, or third-party fonts/scripts.

A Node CLI uses the exact same runner, workloads, adapters, and analysis. It reads key values from `.env` using public configuration references (`keyEnv`). It writes each observation immediately and saves partial runs after errors or cancellation. Use the CLI for long unattended tests; a browser tab can be suspended. Requested and actual idle times are recorded.

Browser access uses the SDK's explicit browser opt-in where required. CORS/auth/rate-limit failures are error evidence, never cache misses. Browser/Node runtime and pinned SDK versions are included in each report. Browser response headers are limited to what the provider exposes through CORS.

## Initial experiments

- `replay`: resend an identical large prompt; ignore generated output. Control for caller-side prompt changes.
- `append`: append a deterministic assistant/user text pair, independent of generated output. Controlled growing history.
- `agent`: live model function calls with a fixed local fixture tool. Preserve full native assistant response items, thought signatures, and tool-call IDs. Tool results use the same fixture text across providers. Stop a trial when a valid tool continuation is not produced; do not manufacture a trajectory.
- `perturb`: deliberately change early prefix content after warm-up. Negative control; excluded from previous-prefix full-hit and ideal-reuse comparisons.

No built-in provider tools, real shell execution, ACP, native agent CLIs, internal endpoints, Vertex, hidden retries, provider fallback, model fallback, explicit Gemini cache objects, or cache repair in v1.

Each profile/gap/trial has a unique prompt nonce. Nonce isolation reduces accidental prefix reuse; it does not prove the backend cache is empty. Providers necessarily serialize the shared semantic workload differently, and live tool arguments/outputs can differ. Preserve actual payloads rather than claiming byte-identical prompts across providers.

Default quick run: 1 trial, 6 turns, 5-second completion-to-next-request gaps, 48,000 reference characters, 2,400 fixture characters per growth step, short generation, one paid account per provider and four model cells (Gemini Flash 3.8, Gemini Argon 4, GPT-6.1 Sol, Claude Opus 5.5). Sizes are characters, not claimed token counts. Actual API input counters establish whether the cache threshold was reached. The original chart's 5/30/120-second gaps and 12×20-turn allocation are configurable, not mandatory defaults.

## Evidence and metrics

Each actual model request yields an observation with cell/profile/trial/turn identity, declared tier, exact configured model and returned model, UTC start, requested/actual gap, duration, status, response ID, exposed trace headers, SHA-256 payload/prefix hashes, SDK payload, serialized wire payload, response, raw usage, normalized counters, and warnings. Redact credentials from error paths and exports. SDK retries and automatic continuations are disabled.

Normalize input as `total = uncached + cached reads + cache writes`. Anthropic's `input_tokens` is already exclusive of reads and writes. OpenAI Responses and Gemini report inclusive input counts. OpenAI GPT-6.1 Sol has a distinct cache-write counter. Preserve unknown telemetry as unknown rather than inventing a hit/miss.

Report separately:

- Previous-prompt full-hit fraction over eligible follow-ups, with an explicit token tolerance (default 64), counts, and descriptive Wilson interval. Turns in one trial are correlated; this is not a confidence claim about independent infrastructure samples.
- Any-hit fraction and token-weighted cached-read fraction.
- Reusable-prefix capture, with the previous request's input count as an observable reference, not proof of the provider's hidden rendered prefix.
- Actual usage-based input cost, theoretical ideal input cost, their multiplier including and excluding warm-up, and output/total estimated cost separately.
- Errors and unclassifiable turns, kept out of cache denominators. Initial turns are warm-up. Missing/unusable usage, below-threshold prefixes, invalid continuations, and negative-control changes get explicit caveats.

Read/write/input/output rates are dated and editable per profile. Ideal cost retains required initial write charges and new-prefix write charges for models that bill them. It uses the same observed workload and outputs. It is a transparent counterfactual, not verified billing. Unknown rate cards yield unknown costs. V1 limits estimated pricing to short contexts and stops a trajectory beyond 100K observed input tokens.

A configured spend guard uses a conservative preflight estimate plus observed usage; it cannot guarantee a provider bill, especially for interrupted/failed requests. No automatic retry means a failed trial ends and remains visible.

## Configuration and reports

Key environment names initially: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `CODEX_API_KEY` (OpenAI API). Multiple keys for a provider use separate account IDs, labels, `keyEnv` references, and declared tiers, independently of the model catalog. There are no legacy configuration formats. Account billing tier cannot be inferred reliably from a key and is explicitly user declared. Free keys that cannot access a paid-only model record access errors.

Reports include complete public run configuration and rate cards. Every grouping includes profile, provider, model, scenario, and gap so tiers and workloads are not silently pooled. A downloaded/imported run can be reanalyzed offline without keys or more API spending. Results survive CLI interruption; browser results must be downloaded before closing/reloading the page.

## Validation and first live data

Before live spending: unit tests for usage normalization, cost baselines, payload determinism, signature-preserving continuation, cancellation, failure denominators, and secret redaction; typecheck/build; inspect real browser flows.

Then run a small paid-key replay and tool-loop test against the three configured model IDs. Add a small timed Gemini comparison if initial calls succeed. Preserve every attempt, including access or SDK compatibility failures. Record sample size and limitations with the first data. Expand repetitions and tiers after this path is sound.

## Public documentation

- Google: https://ai.google.dev/gemini-api/docs/generate-content/caching and https://ai.google.dev/gemini-api/docs/generate-content/latest-model
- OpenAI: https://developers.openai.com/api/docs/guides/prompt-caching and https://developers.openai.com/api/docs/models/gpt-6.1-sol
- Anthropic: https://platform.claude.com/docs/en/build-with-claude/prompt-caching and https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5

Verify current SDK schemas and model rules during implementation. Claims in the supplied proposals about internal eviction floors, hidden timestamps, checkpoint windows, and specific causes remain unverified hypotheses.
