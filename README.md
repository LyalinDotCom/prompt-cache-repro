# Cachebench

**An unofficial community project.** Not affiliated with or endorsed by Google, OpenAI, Anthropic, or Theo. Experimental results are not guaranteed to be accurate. Feedback and methodology corrections are welcome through [GitHub issues](https://github.com/LyalinDotCom/prompt-cache-repro/issues); **pull requests are not accepted**. The repository is private for now. Licensed under [Apache 2.0](LICENSE).

Our goal is credible outside-in evidence about prompt-cache reuse during real coding-agent work. The coding harness runs Pi against public provider APIs, retains serialized requests and raw responses, and independently checks patches and tests. The browser contains separate diagnostic controls.

**No benchmark results are currently published in this checkout.** Previous experimental artifacts and reports were removed to start a clean study. Their deletion is tracked in Git history. Read the [current methodology](docs/METHODOLOGY.md) before running or interpreting experiments.

## Run locally

Requires Node 22 or newer.

```sh
npm ci
npm run dev
```

The browser calls providers directly using official SDKs. Enter keys in the tab; they stay in memory. Browser controls do not run a real coding agent.

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

Sessions finish naturally or stop at a **20-minute session deadline**. There is no spending or request-count cutoff. Cost estimates are observations only. The dependency-free ledger fixture is a small qualification task, **not a 250K-token experiment**. Context occupancy must be established by actual API input counters, separately from the model's advertised window capacity.

New run artifacts, independent audits, Markdown reports, and CSV summaries are written under ignored `runs/`. Failed and interrupted attempts remain visible in each fresh study; they do not become cache misses or disappear from its accounting. Results are experimental until the workload, raw evidence, and conclusions have been reviewed.

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
