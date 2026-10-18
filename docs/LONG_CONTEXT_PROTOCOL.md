# 250K+ code-context pilot

Registered before the first generation request in this arm. This is a controlled large-source coding experiment, separately reported from the small ledger qualification.

## Allocation and workload

Run two distinct seeded regression tasks on four exact models, using the existing paid account for each provider: **8 coding sessions**. The models are `gemini-4-argon`, `gemini-3.8-flash`, `gpt-6.1-sol`, and `claude-opus-5-5`. One independent session per task/model; this is a pilot, not a provider-wide probability estimate. Use `config/coding-long.json` with its fixed shuffle seed.

The public source is the MIT-licensed [Adaltas node-csv monorepo](https://github.com/adaltas/node-csv/tree/f12e6862a41f4324a06a26c87a3e28031d4faa7f), pinned at `f12e6862a41f4324a06a26c87a3e28031d4faa7f`. The executable library modules, upstream tests, examples, and documentation provide coding context. Generated distribution bundles, declaration duplicates, browser samples, and the website are excluded. Source is included once; no random or repeated padding is added. The provenance hash map is retained on disk and excluded from the initial model snapshot.

- `coding-csv-parse`: restore final-record emission at EOF in the real parser implementation. Acceptance covers sync, chunked streaming, quoted/trailing-empty fields, Unicode, and terminators.
- `coding-csv-stringify`: restore delimiter-aware quoting in the real stringifier implementation. Acceptance covers commas, custom/multibyte delimiters, escaped quotes, and multiline fields.

Both fixtures use the same **41 immutable Node acceptance tests** and an independently executed four-record pipeline CLI. The seeded baselines must fail; restoring the exact pinned upstream source must pass all tests and the CLI. `node tools/verify-csv-fixtures.mjs` verifies this without API calls. Task descriptions, test/data/reference material, and manifests are immutable. Changes are restricted to `src/` and `bin/`.

This deliberately preloads the selected source. It measures caching during genuine tool-driven repairs with large code context. It does not stand in for organically accumulated 250K-token native-agent history. Both tasks come from one repository and do not establish broad workload representativeness.

## Settings and stopping

Use Pi's native provider adapters at high reasoning, a 32,768-token response allowance, no compaction or proactive cache warming, no hidden retries or continuations, and the same disclosed file/test tools. Installed native CLI logins and settings remain untouched. Public SDKs/endpoints and explicit API keys are retained.

Allow natural completion with a **20-minute session deadline**. No request-count cap, spending cutoff, or batch deadline. Keep every attempt, error, timeout, and length-truncated response. A target-size failure does not erase the attempt or turn it into a cache miss.

Target a five-second minimum completion-to-next-request gap; record actual monotonic timing. Do not claim this is natural human/tool pacing. All models receive the same selected source files and task for a given fixture; token counts and generated trajectories may differ.

## Measurements and decision scope

The target is **at least 250,000 actual reported input tokens**, not an advertised context capacity. Record initial and per-request input counts, and count follow-ups for which both current and preceding inputs meet the target. Off-target calls remain visible and do not qualify as 250K+ evidence. SDK token-count endpoints are used for planning only; generation-response usage is authoritative for the measured range.

For each account/model/task, report successful repairs and natural completions separately, captured attempts, raw-usage/audit validity, absolute prior-input deficits, cached reads / preceding input, and the complete per-turn sequence. Report target-sized follow-up denominators explicitly. Retain negative deficits or ratios above 100% as counter observations, not probabilities.

Do not classify a fixed residual as a provider defect or locate an uncached segment from counters alone. Strict64 and below-95% remain optional descriptive diagnostics, not the primary verdict. Explicit Anthropic breakpoints and implicit Gemini/OpenAI caching are distinct treatments. Compare the configured Pi/API paths, not a provider-only causal intervention. A result can support or weaken the reported concern for these tasks and settings without proving or refuting the unavailable original benchmark.

Costs are estimates only. GPT-6.1 Sol requests above **272K input tokens** use 2× input/read/write rates and 1.5× output for the whole request; other selected models use their verified dated standard cards at these sizes. No model substitution, price-driven stopping, or invoice claim. Sources: [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [Anthropic context pricing](https://platform.claude.com/docs/en/build-with-claude/context-windows).
