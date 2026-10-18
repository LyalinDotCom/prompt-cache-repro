# Cachebench: implementation contract

Status: primary coding study and separate browser diagnostic controls. This document describes the implemented scope. The original proposals are preserved unchanged in `docs/references/`.

## Purpose

Run an outside-in public API experiment and produce enough inspectable evidence to evaluate Theo's prompt-cache observation for the tested conditions. Support different keys, account/tier labels, models, idle gaps, and repeated runs. Accounts own keys; models are independent. Every account runs every selected model for its provider. Two Gemini keys and two Gemini models produce four cells per workload/gap. Never turn a short smoke test into a provider-wide verdict or claim to identify an internal root cause.

## Product

The primary validation runs the real pinned Pi 1.3.0 coding agent on two seeded regressions in pinned, MIT-licensed `node-csv` source: `fixtures/coding-csv-parse` and `fixtures/coding-csv-stringify`. The selected source, tests, examples, and documentation are preloaded once, targeting at least 250K actual reported input tokens. Native read/edit/write tools operate on a disposable workspace; only `src/upstream/` library modules may change. The 41 acceptance tests, test adapter, CLI verifier, and input/reference material are immutable. This is a controlled source-preload arm, not organically accumulated native-agent history. The small ledger fixture remains an explicitly selected qualification task.

The bash tool runs a disclosed allowlist of real Node test and fixture CLI commands with an empty child environment. It is a trusted fixture workflow, not an operating-system sandbox. Installed native CLI settings and authentication remain untouched.

Each coding task finishes naturally or reaches a 20-minute session deadline. There is no spending or request-count cutoff; costs are observations only. The driver independently verifies exact failing baseline counts, all final tests passing without skips, unchanged acceptance files, a real source patch, and successful CLI output. A separate verifier replays only library edits in a clean fixture with original acceptance code. It preserves serialized HTTP bodies, raw response streams, native agent/tool events, effective settings, file hashes, patches, and actual subprocess outputs. A standalone auditor reconstructs usage and costs from raw streams without importing app normalizers. `npm run coding` defaults to `config/coding-long.json`; allocation order is always shuffled using its recorded seed. The browser controls below remain a separate diagnostic arm.

A static web app calls each provider directly from the visitor's browser using its official TypeScript SDK. Visitors enter their own keys, select profiles and a test, run it, inspect turn results, and download JSON, JSONL, CSV, and Markdown reports. Keys live only in page memory and go only to the selected provider. No benchmark proxy, app server, analytics, key storage, or third-party fonts/scripts.

A Node CLI uses the exact same runner, workloads, adapters, and analysis. It reads key values from `.env` using public configuration references (`keyEnv`). It writes each observation immediately and saves partial runs after errors or cancellation. Use the CLI for long unattended tests; a browser tab can be suspended. Requested and actual idle times are recorded.

Browser access uses the SDK's explicit browser opt-in where required. CORS/auth/rate-limit failures are error evidence, never cache misses. Browser/Node runtime and pinned SDK versions are included in each report. Browser response headers are limited to what the provider exposes through CORS.

## Initial experiments

- `replay`: resend an identical large prompt; ignore generated output. Control for caller-side prompt changes.
- `append`: append a deterministic assistant/user text pair, independent of generated output. Controlled growing history.
- `agent`: live model function calls with a fixed local fixture tool. Preserve full native assistant response items, thought signatures, and tool-call IDs. Tool results use the same fixture text across providers. Stop a trial when a valid tool continuation is not produced; do not manufacture a trajectory.
- `perturb`: deliberately change early prefix content after warm-up. Negative control; excluded from previous-prefix full-hit and ideal-reuse comparisons.

The browser/synthetic controls do not execute a shell. Neither path uses built-in provider tools, ACP, native agent CLI execution, internal endpoints, Vertex, hidden retries, provider/model fallback, explicit Gemini cache objects, or cache repair. The coding path executes the allowlisted local Node commands described above.

Each profile/gap/trial has a unique prompt nonce. Nonce isolation reduces accidental prefix reuse; it does not prove the backend cache is empty. Providers necessarily serialize the shared semantic workload differently, and live tool arguments/outputs can differ. Preserve actual payloads rather than claiming byte-identical prompts across providers.

The quick synthetic control uses exact replay: 1 trial, 6 turns, 5-second completion-to-next-request gaps, 48,000 reference characters, 2,400 fixture characters per growth step, short generation, one paid account per provider and four model cells (Gemini Flash 3.8, Gemini Argon 4, GPT-6.1 Sol, Claude Opus 5.5). Sizes are characters, not claimed token counts. Actual API input counters establish whether the cache threshold was reached. The original chart's 5/30/120-second gaps and 12×20-turn allocation are configurable controls, separate from the default coding study.

## Evidence and metrics

Each actual model request retains identity, declared tier, configured/returned model, timing, status, request hashes, serialized wire payload, response, raw usage, normalized counters, and warnings. The coding path retains raw SSE and matches assistant turns to captured HTTP attempts; it does not currently retain response headers. Diagnostic adapters additionally retain SDK payloads and exposed trace headers. Redact credentials from error paths and exports. SDK retries and automatic continuations are disabled.

Normalize input as `total = uncached + cached reads + cache writes`. Anthropic's `input_tokens` is already exclusive of reads and writes. OpenAI Responses and Gemini report inclusive input counts. OpenAI GPT-6.1 Sol has a distinct cache-write counter. Preserve unknown telemetry as unknown rather than inventing a hit/miss.

Report separately:

- Previous-prompt full-hit fraction over eligible follow-ups, with an explicit token tolerance (default 64), counts, and descriptive Wilson interval. Turns in one trial are correlated; this is not a confidence claim about independent infrastructure samples.
- Any-hit fraction and token-weighted cached-read fraction.
- Reusable-prefix capture, with the previous request's input count as an observable reference, not proof of the provider's hidden rendered prefix.
- Actual usage-based input cost, theoretical ideal input cost, their multiplier including and excluding warm-up, and output/total estimated cost separately.
- Errors and unclassifiable turns, kept out of cache denominators. Initial turns are warm-up. Missing/unusable usage, below-threshold prefixes, invalid continuations, and negative-control changes get explicit caveats.

Read/write/input/output rates are dated and editable per profile. Ideal cost retains required initial write charges and new-prefix write charges for models that bill them. It uses the same observed workload and outputs. It is a transparent counterfactual, not verified billing. Unknown rate cards yield unknown costs. The synthetic diagnostic runner currently stops beyond its supported 100K pricing band. The primary coding runner supports the registered 250K+ contexts and applies GPT's whole-request surcharge above 272K; it has no context-size or spending stop below the selected model's API capacity.

Cost estimates do not control execution. Interrupted or failed requests can have unknown charges. No automatic retry means a failed trial ends and remains visible.

## Configuration and reports

Key environment names initially: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `CODEX_API_KEY` (OpenAI API). Multiple keys for a provider use separate account IDs, labels, `keyEnv` references, and declared tiers, independently of the model catalog. There are no legacy configuration formats. Account billing tier cannot be inferred reliably from a key and is explicitly user declared. Free keys that cannot access a paid-only model record access errors.

Reports include complete public run configuration and rate cards. Every grouping includes profile, provider, model, scenario, and gap so tiers and workloads are not silently pooled. A downloaded/imported run can be viewed and exported offline without keys or more API spending. Raw evidence is retained for independent reanalysis. Results survive CLI interruption; browser results must be downloaded before closing/reloading the page.

## Validation and first live data

Before live spending: unit tests for usage normalization, cost baselines, payload determinism, signature-preserving continuation, cancellation, failure denominators, and secret redaction; typecheck/build; inspect real browser flows.

Qualify the coding workflow, then validate representative context sizes and task diversity under the current methodology. Preserve every attempt, including access and SDK compatibility failures. Record actual context occupancy, sample size, and limitations with each study.

## Public documentation

- Google: https://ai.google.dev/gemini-api/docs/generate-content/caching and https://ai.google.dev/gemini-api/docs/generate-content/latest-model
- OpenAI: https://developers.openai.com/api/docs/guides/prompt-caching and https://developers.openai.com/api/docs/models/gpt-6.1-sol
- Anthropic: https://platform.claude.com/docs/en/build-with-claude/prompt-caching and https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5

Verify current SDK schemas and model rules during implementation. Claims in the supplied proposals about internal eviction floors, hidden timestamps, checkpoint windows, and specific causes remain unverified hypotheses.
