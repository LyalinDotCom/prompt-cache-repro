# Prompt cache benchmark report

Run: 50575f12-1f28-4a3f-b869-47372b22efff · cancelled · node

Created: 2026-10-17T19:33:04.841Z. Finished: 2026-10-17T19:34:07.698Z.

Scenario: agent; 4 turns per trial (turn 0 is excluded from hit rates); 1 trials; seed: cachebench-agent-smoke-v1.

| Profile | Gap (s) | Attempts / errors | Measured followups | Full hit | Any hit | Token hit | Reusable capture | Input cost | Ideal input | Input multiplier | Followup multiplier | Output cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini · paid | 5 | 4 / 0 | 3 | 0.0% | 100.0% | 83.4% | 86.5% | $0.048950 | $0.037270 | 1.313 | 2.461 | $0.000640 |
| OpenAI · paid | 5 | 4 / 0 | 3 | 0.0% | 100.0% | 95.3% | 99.0% | $0.039132 | $0.038380 | 1.020 | 1.100 | $0.000560 |
| Anthropic · paid | 5 | 1 / 0 | 0 | unknown | unknown | unknown | unknown | $0.048205 | $0.048205 | 1.000 | unknown | $0.000390 |

Full hit compares reported cached reads against previous successful input tokens with the configured token tolerance. It is a heuristic: hidden prefixes and provider rounding prevent proving exact prefix reuse. Any hit means cached reads > 0. Any-hit and token-hit metrics include all successful followups with a known cached-read counter, including perturbation and inputs below the minimum; their sample counts may differ from full-hit eligibility. Token hit is cached-read / total-input tokens on those followups. Reusable capture is cached-read / previous-input tokens (capped at 1).

Input costs use uncached input × input rate + cache reads × read rate + cache writes × write rate, per million tokens. Ideal input includes actual first-turn cost and then assumes all reusable prior input reads from cache and all new delta follows the provider write policy. Output costs are separate. Unknown counters remain unknown. Perturbation has no ideal reuse baseline.

Wilson 95% intervals are descriptive turn-level intervals, not independent-sample confidence intervals: turns are clustered within trials. Compare independent trials and repeated randomized runs before drawing conclusions.

Gemini · paid at 5s: Wilson interval 0.0%–56.1%.
OpenAI · paid at 5s: Wilson interval 0.0%–56.1%.

Warnings:
- Sequential requests; no automatic retries. Fresh nonce per trial isolates cache prefixes.
- Cost guard is an estimate and an observed-spend soft stop, not a guaranteed billing cap. Output cost is reported separately from input-cache multipliers.
- Gemini omitted cachedContentTokenCount; interpreted as protobuf scalar zero (assumption). Raw usage is preserved.
- request is the Google SDK object; wireRequest contains its transformed HTTP JSON (config fields move to generationConfig/tools).
- Wilson 95% interval describes turns only; turns within a trial are clustered and are not independent experimental replicates.
- Full hit is a previous-input token-count heuristic. Hidden provider prefixes, rounding, and minimum cache lengths prevent proof of exact prefix reuse.

SDK versions: @google/genai 2.30.0, openai 7.36.0, @anthropic-ai/sdk 0.135.0.

Pricing snapshots:
- Gemini · paid: as of 2026-10-17; input 2, read 0.1, write 2, output 10 USD / million tokens. Source: https://ai.google.dev/gemini-api/docs/pricing; Standard introductory rates through 2026-11-30; recheck before later runs..
- OpenAI · paid: as of 2026-10-17; input 2, read 0.1, write 2.5, output 10 USD / million tokens. Source: https://developers.openai.com/api/docs/pricing; Standard, global processing; GPT-6.1 Sol writes at 1.25x input. Under 100K input only in this version..
- Anthropic · paid: as of 2026-10-17; input 2, read 0.1, write 2.5, output 10 USD / million tokens. Source: https://platform.claude.com/docs/en/about-claude/pricing; Standard, global processing; 5-minute automatic cache writes..
