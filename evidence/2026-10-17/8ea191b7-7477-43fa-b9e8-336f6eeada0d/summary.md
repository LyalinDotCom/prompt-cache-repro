# Prompt cache benchmark report

Run: 8ea191b7-7477-43fa-b9e8-336f6eeada0d · completed · node

Created: 2026-10-17T19:38:19.821Z. Finished: 2026-10-17T19:38:25.816Z.

Scenario: replay; 3 turns per trial (turn 0 is excluded from hit rates); 1 trials; seed: cachebench-smoke-v1.

| Profile | Gap (s) | Attempts / errors | Measured followups | Full hit | Any hit | Token hit | Reusable capture | Input cost | Ideal input | Input multiplier | Followup multiplier | Output cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Claude Opus 5.5 · Anthropic paid account | 0 | 3 / 0 | 2 | 100.0% | 100.0% | 100.0% | 100.0% | $0.101816 | $0.101786 | 1.000 | 1.004 | $0.000240 |

Full hit compares reported cached reads against previous successful input tokens with the configured token tolerance. It is a heuristic: hidden prefixes and provider rounding prevent proving exact prefix reuse. Any hit means cached reads > 0. Any-hit and token-hit metrics include all successful followups with a known cached-read counter, including perturbation and inputs below the minimum; their sample counts may differ from full-hit eligibility. Token hit is cached-read / total-input tokens on those followups. Reusable capture is cached-read / previous-input tokens (capped at 1).

Input costs use uncached input × input rate + cache reads × read rate + cache writes × write rate, per million tokens. Ideal input includes actual first-turn cost and then assumes all reusable prior input reads from cache and all new delta follows the provider write policy. Output costs are separate. Unknown counters remain unknown. Perturbation has no ideal reuse baseline.

Wilson 95% intervals are descriptive turn-level intervals, not independent-sample confidence intervals: turns are clustered within trials. Compare independent trials and repeated randomized runs before drawing conclusions.

Claude Opus 5.5 · Anthropic paid account at 0s: Wilson interval 34.2%–100.0%.

Warnings:
- Sequential requests; no automatic retries. Fresh nonce per trial isolates cache prefixes.
- Cost guard is an estimate and an observed-spend soft stop, not a guaranteed billing cap. Output cost is reported separately from input-cache multipliers.
- Wilson 95% interval describes turns only; turns within a trial are clustered and are not independent experimental replicates.
- Full hit is a previous-input token-count heuristic. Hidden provider prefixes, rounding, and minimum cache lengths prevent proof of exact prefix reuse.

SDK versions: @google/genai 2.30.0, openai 7.36.0, @anthropic-ai/sdk 0.135.0.

Pricing snapshots:
- Claude Opus 5.5 · Anthropic paid account: as of 2026-10-17; input 4, read 0.2, write 5, output 20 USD / million tokens. Source: https://platform.claude.com/docs/en/about-claude/pricing; Opus 5.5 Standard, global processing; 5-minute automatic cache writes..
