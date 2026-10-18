# Cachebench

**An unofficial community project.** Not affiliated with or endorsed by Google, OpenAI, Anthropic, or Theo. Experimental results are not guaranteed to be accurate. Feedback and methodology corrections are welcome through [GitHub issues](https://github.com/LyalinDotCom/prompt-cache-repro/issues); **pull requests are not accepted**. The repository is private for now. Licensed under [Apache 2.0](LICENSE).

Our goal is credible outside-in evidence about prompt-cache reuse during real coding-agent work. The coding harness runs Pi against public provider APIs, retains serialized requests and raw responses, and independently checks patches and tests. The browser contains separate diagnostic controls.

**Read the [latest verified 250K+ coding pilot](docs/LATEST_RESULTS.md).** Gemini Flash reported 99.63% and Argon 99.72% cached reads relative to preceding input; small shortfalls remained, with high overall reuse in this limited test. Its [current evidence](results/latest/) contains raw request/response archives, per-turn data, audits, and independently replayed repairs. Previous experimental evidence and excluded calibration are retained only in private Git history. Read the [methodology](docs/METHODOLOGY.md) and [registered long-context protocol](docs/LONG_CONTEXT_PROTOCOL.md) before interpreting the result.

## Run locally

Requires Node 22 or newer.

```sh
npm ci
npm run dev
```

The browser calls providers directly using official SDKs. Enter keys in the tab; they stay in memory. Its experiments are synthetic diagnostics. **Use the CLI below for the real coding study**, which needs a disposable filesystem and Node test execution.

## Coding runs

Put keys in the ignored project-root `.env`:

```dotenv
GEMINI_API_KEY="..."
ANTHROPIC_API_KEY="..."
CODEX_API_KEY="..."
```

`CODEX_API_KEY` means an OpenAI public API key. Never use `VITE_` for credentials. Installed native CLI authentication and settings remain untouched.

```sh
npm run coding -- --dry-run
npm run coding
npm run coding -- --model gemini-4-argon,gemini-3.8-flash
```

Accounts own keys and declared tier labels. Each account runs every selected model for its provider: two Gemini keys and two Gemini models produce four sessions per trial/gap. See [configuration](config/README.md).

The default allocation repairs two seeded regressions in pinned public CSV-library code on all four models. It preloads the selected source once and targets **at least 250K actual API-reported input tokens**. Each repair must pass all 41 immutable tests and the pipeline CLI; the independent replay applies only library edits to a clean fixture. The configured seed always shuffles cell order.

Sessions finish naturally or stop at a **20-minute session deadline**. There is no spending or request-count cutoff. Cost estimates are observations only. This is a controlled source-preload pilot, not an organically accumulated 250K-token native-agent session or a provider-wide failure-rate estimate. The small ledger qualification is opt-in: `npm run coding -- --config config/coding-qualification.json`.

New run artifacts, independent audits, Markdown reports, and CSV summaries are written under ignored `runs/`. Failed and interrupted attempts remain visible in each fresh study; they do not become cache misses or disappear from its accounting. Follow-ups within a session are correlated, and public counters do not expose every cache-eligibility rule. Every result remains limited to its declared workload, account, timing, and API path.

## Diagnostic controls

```sh
npm run bench -- profiles
npm run bench -- run --config config/smoke.json --dry-run
npm run bench -- run --config config/smoke.json
npm run bench -- report runs/<id>/report.json
```

Replay, text-growth, deterministic tool-loop, and prefix-change controls help investigate API behavior. They do not establish performance in real coding sessions. Both browser and CLI controls use the same official SDK adapters and analysis. Costs are estimates, not provider invoices.

## Project documents

- [Current methodology](docs/METHODOLOGY.md)
- [Implementation contract](docs/IMPLEMENTATION.md)
- [Review of the supplied specs](docs/spec-review.md)
- [Provider API/accounting notes](docs/provider-notes.md)
- [Original HTTP-harness proposal](docs/references/proposed-http-harness.txt)
- [Original layered-benchmark proposal](docs/references/proposed-layered-benchmark.txt)
- [Source criticism](https://x.com/theo/status/2111370893561909423)

```sh
npm test
npm run build
```
