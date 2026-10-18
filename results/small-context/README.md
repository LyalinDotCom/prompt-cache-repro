# Small context cache study evidence

[Read the findings and engineering FYI](../../docs/LATEST_RESULTS.md). This folder contains the focused 18 October study: 97 attempted calls from 134 planned, five Argon HTTP 429 errors, four Opus refusals, and 29 zero-read Gemini follow-up responses. A separate eight-call qualification includes two additional Opus refusals. No failed trajectory was silently replaced. The large proposed grid was not run.

- `metrics.json`: cells, diagnostics, counts, observed costs, frozen source and offline analysis hash.
- `turns.csv`: every focused attempt, exact input/cache counters, raw deficits, actual added tokens, timings, strict64/strict2100, boundary-aware controls, response IDs and audit results.
- `cells.csv`: all 18 planned arms, including incomplete/refused arms and error counts.
- `hard-misses.csv`: 29 successful zero-read follow-ups, with Gemini response IDs. Quota failures and initial requests are excluded.
- `evidence.tar.gz`: full `study/` and separate `qualification/`, configs, final plan/exits, serialized HTTP request/response text, parsed raw responses, usage, headers, logs and report sidecars. It also includes frozen `harness/` source/lockfiles and the later `analysis/` scripts. The harness source is 322d962; qualification used 645ec07, with unchanged API adapter/core.
- `analysis.py`: standard-library-only offline assembly. It rederives usage and costs and checks request/response hashes, replay identity, preserved native history, timing and strict rules.
- `SHA256SUMS`: hashes of the evidence and analysis outputs.

To reassemble without API keys or network access, from this repository:

```sh
mkdir -p /tmp/cachebench-small-context
tar -xzf results/small-context/evidence.tar.gz -C /tmp/cachebench-small-context
python3 results/small-context/analysis.py /tmp/cachebench-small-context/study --out /tmp/cachebench-small-context/reanalysis
python3 /tmp/cachebench-small-context/analysis/test-theo-analysis.py /tmp/cachebench-small-context/study
```

`metrics.json`, `turns.csv`, `cells.csv`, and `hard-misses.csv` should match the committed files byte for byte. Generated `table.md` is a fragment intended for insertion into `docs/LATEST_RESULTS.md`, not a standalone results document. The negative controls confirm that altered usage, strict-hit classification, a thought signature, and replay content are rejected. Supplied credential values were checked before publication and are absent from the retained evidence.

The source archive excludes dependencies and credentials. `npm ci` under `harness/` installs its pinned SDKs if a new live run is desired. Read [the protocol](../../docs/SMALL_CONTEXT_PROTOCOL.md) and [configuration instructions](../../config/README.md) first. Public provider behavior and future costs may change. These artifacts contain nonstreaming HTTP JSON; no SSE stream was produced. Five-second gaps do not test long-gap eviction or TTL claims. Refused responses are retained in costs and accounting but excluded from comparable hit/multiplier rates.
