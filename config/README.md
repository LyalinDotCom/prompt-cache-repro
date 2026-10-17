# CLI configurations

Run commands from the repository root so `.env` and `runs` resolve there:

```sh
npm run bench -- profiles
npm run bench -- run --config config/smoke.json --dry-run
npm run bench -- run --config config/smoke.json
npm run bench -- run --account gemini-paid --model gemini-3.8-flash --dry-run
npm run bench -- report runs/<id>/report.json
```

Accounts own credentials, independently of models. The three default accounts reference `GEMINI_API_KEY`, `CODEX_API_KEY` (OpenAI public API), and `ANTHROPIC_API_KEY`. The model catalog contains Gemini Argon 4, Gemini Flash 3.8, GPT-6.1 Sol, and Claude Opus 5.5. The one Gemini account/key runs both Gemini models. Model records contain model IDs, pricing, and cache minimums; they contain no key references.

Config `accounts` and `models` arrays select public catalog IDs or complete public metadata objects. The runner expands every account × model pair with the same provider. Two Gemini accounts × Argon and Flash produce four cells for each gap/workload, while each account still needs just one key. `two-gemini-accounts.json` demonstrates this using `GEMINI_API_KEY` and `GEMINI_SECOND_API_KEY`. To add another account, supply `id`, `label`, `provider`, `tier`, and `keyEnv`. Account IDs must be unique. `keyEnv` is an environment variable name, never a credential. Account tier labels are operator declarations; the tool cannot verify billing tier from a key.

`--account id[,id]` and `--model id[,id]` filter the accounts/models in the selected config. Both flags are repeatable. With no config, they filter the default catalogs. For example, `--account gemini-paid` runs both Gemini models, while adding `--model gemini-3.8-flash` runs Flash only. Literal API keys, endpoint overrides, and unsupported metadata fields are rejected. CLI accounts require a `keyEnv` reference. Shell values take precedence over `.env`; use `--env path` for another dotenv file.

`profiles` prints the expanded account/model cells, environment variable names, and availability; it never prints credential values. Missing keys stop the run before any provider request. Dry runs require no keys and make no provider requests. Saved configs/reports retain resolved cell profiles with `accountId`, model, tier, rate card, and key variable name so a result remains interpretable without a live catalog.

Other overrides: `--scenario replay|append|agent|perturb`, `--turns`, `--trials`, `--gaps 0,5,30`, `--prefix-chars`, `--delta-chars`, and `--out`. Prefix/delta sizes are characters, not token promises. Dry-run estimates include requests, minimum idle time, and a conservative spend estimate; actual server usage determines measured costs. Costs are observations only; no spending cutoff is applied.

`smoke.json` makes 12 requests across four account/model cells. `agent-smoke.json` plans 16 requests across the same four cells. `retention.json` is an opt-in sweep: 2,880 requests with at least 39.27 hours of idle time, plus response latency. Preview it with `--dry-run` before running it.

The config schema accepts separate `accounts` and `models` catalogs. Derived cell profiles are internal report metadata, not configuration input.

Each observation triggers atomic snapshots in `runs/<id>/`: `report.json`, `turns.jsonl`, `summary.md`, and grouped `summary.csv`. JSONL rows have a `type`: `run` metadata, `observation` turns, and `summary` cells. Turn records preserve the SDK request, captured HTTP JSON when available, parsed raw response, raw usage, and hashes. Authorization headers are excluded. SIGINT cancels the current request/wait and saves completed observations. Summaries regenerate after each observation; a hard process kill can leave files at adjacent snapshots, so `report.json` is authoritative.

Exit codes: `0` means every planned observation succeeded (or the report/dry-run command succeeded); `1` means invalid configuration, a runtime failure, an incomplete trajectory, no observations, or at least one failed observation; `130` means cancellation. A successful API response can still stop an agent trajectory if it lacks a valid tool continuation; its usage remains saved while the run is marked incomplete. A partly successful run remains available even with a nonzero exit code. The report command formats a saved report without loading `.env` or calling any provider.

## Real coding sessions

`npm run coding` reads `config/coding.json`. Select accounts/models, trials, gaps, seed, output allowance, transport timeout, and `sessionTimeoutMs` (default and maximum 1,200,000 milliseconds). There is no `turns` or budget field for coding sessions. They finish naturally or reach their session deadline. The current fixture is a small qualification task, not a long-context benchmark.
