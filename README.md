# Cachebench

**An unofficial community project.** Not affiliated with or endorsed by Google, OpenAI, Anthropic, or Theo. Results are experimental and are not guaranteed to be accurate. Feedback and methodology corrections are welcome through [GitHub issues](https://github.com/LyalinDotCom/prompt-cache-repro/issues); **pull requests are not accepted**. The repository is private for now.

Licensed under [Apache 2.0](LICENSE). See [feedback guidelines](CONTRIBUTING.md).

A small outside-in prompt-cache benchmark for public Gemini, OpenAI, and Anthropic APIs. Run it in a browser or from the CLI; both share the same workloads, official SDK adapters, accounting, and report generator.

The question is whether Theo's reported cache behavior appears under reproducible public API conditions. A report preserves the requests and usage counters behind every result. It does not claim a short smoke test proves a provider-wide rate or identifies an internal cause.

## Run locally

Requires Node 22 or newer.

```sh
npm ci
npm run dev
```

Open the printed local URL. Add keys under **API keys** and select models separately. Keys stay in tab memory and requests go directly to the chosen provider. Download a report before reloading or closing the tab. Long unattended tests are better suited to the CLI because browsers can suspend background tabs.

## CLI and credentials

Put keys in the ignored `.env` file at the project root:

```dotenv
GEMINI_API_KEY="..."
ANTHROPIC_API_KEY="..."
CODEX_API_KEY="..."
```

`CODEX_API_KEY` is a name for the OpenAI public API key, not a Codex subscription login. Never prefix these names with `VITE_`.

```sh
npm run bench -- profiles
npm run bench -- run --config config/smoke.json --dry-run
npm run bench -- run --config config/smoke.json
npm run bench -- run --config config/agent-smoke.json
npm run bench -- run --config config/timing-smoke.json
npm run bench -- report runs/<run-id>/report.json
```

Accounts own credentials and declared tiers. Models own their model ID and price card. One Gemini key runs both `gemini-3.8-flash` and `gemini-4-argon`; two Gemini keys run both models twice, producing four separate account/model cells per workload and gap. Current comparison models are `gpt-6.1-sol` and `claude-opus-5-5`.

Add accounts by environment-variable reference in a config, as shown in [config/two-gemini-accounts.json](config/two-gemini-accounts.json). There is one supported config format: separate `accounts` and `models`. See [configuration and commands](config/README.md).

## Experiments and evidence

- **Exact replay:** identical requests, independent of generated responses.
- **Text growth:** deterministic append-only conversation fixtures.
- **Tool loop:** live native function calls with deterministic fixture results; original signatures and reasoning items remain intact.
- **Prefix change:** a deliberate early-prefix mutation as a negative control.

Reports include per-attempt request/response JSON, serialized wire JSON, raw usage, hashes, model/account identity, requested and measured gaps, errors, and dated prices. The CLI writes partial results after every observation to `runs/<id>/report.json`, `turns.jsonl`, `summary.md`, and `summary.csv`. The web UI imports complete JSON reports and exports JSON, JSONL, CSV, and Markdown without further API calls.

Full-hit classification compares cached reads to the previous request's input count within a configurable tolerance. Providers' hidden overhead and cache boundaries can make this stricter than actual eligible-prefix reuse. Always inspect token coverage and shortfall alongside the full-hit fraction. Warm-ups and failed requests are excluded from hit denominators; missing telemetry stays unknown. Cost ratios compare input charges with a transparent theoretical previous-prefix baseline, retain required writes, and show output charges separately. These are estimates, not verified bills.

The small default configurations establish behavior and telemetry. The optional `retention.json` sweep is much longer; inspect its request count, duration, and conservative cost estimate with `--dry-run` first. Spend guards cannot enforce provider-side billing limits.

## First measured data

[Initial results and limitations](docs/INITIAL_RESULTS.md) include 50 real public API attempts, with complete raw evidence retained for all six runs.

## Project documents

- [Implementation contract](docs/IMPLEMENTATION.md)
- [Review of the two proposed specs](docs/spec-review.md)
- [Verified provider behavior and adapter decisions](docs/provider-notes.md)
- [Original proposed HTTP harness](docs/references/proposed-http-harness.txt)
- [Original proposed layered benchmark](docs/references/proposed-layered-benchmark.txt)
- [Source post](https://x.com/theo/status/2111370893561909423)

Original chart: Sonnet 5.5 and GPT-6.1 Sol had 228/228 reported full hits; Gemini 4 Argon had 167/228. Gemini's reported cost multipliers were 1.20×, 1.34×, and 1.48× at 5/30/120-second gaps. Our requested Anthropic comparison uses Opus 5.5, so it is not an exact recreation of that model lineup. The original prompts and complete method are unavailable.

```sh
npm test
npm run build
```
