# Prompt cache benchmark report

Run: 58a98334-66b2-4cb4-a071-a3106b8720db · completed · node

Created: 2026-10-17T19:37:01.267Z. Finished: 2026-10-17T19:43:09.940Z.

Scenario: replay; 2 turns per trial (turn 0 is excluded from hit rates); 1 trials; seed: cachebench-timing-smoke-v1.

| Profile | Gap (s) | Attempts / errors | Measured followups | Full hit | Any hit | Token hit | Reusable capture | Input cost | Ideal input | Input multiplier | Followup multiplier | Output cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini Argon 4 · Gemini paid account | 5 | 2 / 0 | 1 | 0.0% | 100.0% | 85.9% | 85.9% | $0.034488 | $0.030595 | 1.127 | 3.672 | $0.000100 |
| Gemini Argon 4 · Gemini paid account | 30 | 2 / 0 | 1 | 0.0% | 100.0% | 85.9% | 85.9% | $0.034490 | $0.030597 | 1.127 | 3.672 | $0.000100 |
| Gemini Argon 4 · Gemini paid account | 120 | 2 / 0 | 1 | 0.0% | 100.0% | 85.9% | 85.9% | $0.034492 | $0.030599 | 1.127 | 3.672 | $0.000100 |
| Gemini Flash 3.8 · Gemini paid account | 5 | 2 / 0 | 1 | 0.0% | 100.0% | 85.9% | 85.9% | $0.013385 | $0.012004 | 1.115 | 2.266 | $0.000008 |
| Gemini Flash 3.8 · Gemini paid account | 30 | 2 / 0 | 1 | 0.0% | 100.0% | 85.9% | 85.9% | $0.013386 | $0.012005 | 1.115 | 2.265 | $0.000008 |
| Gemini Flash 3.8 · Gemini paid account | 120 | 2 / 0 | 1 | 0.0% | 100.0% | 85.9% | 85.9% | $0.013386 | $0.012005 | 1.115 | 2.265 | $0.000008 |

Full hit compares reported cached reads against previous successful input tokens with the configured token tolerance. It is a heuristic: hidden prefixes and provider rounding prevent proving exact prefix reuse. Any hit means cached reads > 0. Any-hit and token-hit metrics include all successful followups with a known cached-read counter, including perturbation and inputs below the minimum; their sample counts may differ from full-hit eligibility. Token hit is cached-read / total-input tokens on those followups. Reusable capture is cached-read / previous-input tokens (capped at 1).

Input costs use uncached input × input rate + cache reads × read rate + cache writes × write rate, per million tokens. Ideal input includes actual first-turn cost and then assumes all reusable prior input reads from cache and all new delta follows the provider write policy. Output costs are separate. Unknown counters remain unknown. Perturbation has no ideal reuse baseline.

Wilson 95% intervals are descriptive turn-level intervals, not independent-sample confidence intervals: turns are clustered within trials. Compare independent trials and repeated randomized runs before drawing conclusions.

Gemini Argon 4 · Gemini paid account at 5s: Wilson interval 0.0%–79.3%.
Gemini Argon 4 · Gemini paid account at 30s: Wilson interval 0.0%–79.3%.
Gemini Argon 4 · Gemini paid account at 120s: Wilson interval 0.0%–79.3%.
Gemini Flash 3.8 · Gemini paid account at 5s: Wilson interval 0.0%–79.3%.
Gemini Flash 3.8 · Gemini paid account at 30s: Wilson interval 0.0%–79.3%.
Gemini Flash 3.8 · Gemini paid account at 120s: Wilson interval 0.0%–79.3%.

Warnings:
- Sequential requests; no automatic retries. Fresh nonce per trial isolates cache prefixes.
- Cost guard is an estimate and an observed-spend soft stop, not a guaranteed billing cap. Output cost is reported separately from input-cache multipliers.
- Gemini omitted cachedContentTokenCount; interpreted as protobuf scalar zero (assumption). Raw usage is preserved.
- request is the Google SDK object; wireRequest contains its transformed HTTP JSON (config fields move to generationConfig/tools).
- Wilson 95% interval describes turns only; turns within a trial are clustered and are not independent experimental replicates.
- Full hit is a previous-input token-count heuristic. Hidden provider prefixes, rounding, and minimum cache lengths prevent proof of exact prefix reuse.

SDK versions: @google/genai 2.30.0, openai 7.36.0, @anthropic-ai/sdk 0.135.0.

Pricing snapshots:
- Gemini Argon 4 · Gemini paid account: as of 2026-10-17; input 2, read 0.1, write 2, output 10 USD / million tokens. Source: https://ai.google.dev/gemini-api/docs/pricing; Argon Standard introductory rates through 2026-11-30; recheck before later runs..
- Gemini Flash 3.8 · Gemini paid account: as of 2026-10-17; input 0.75, read 0.075, write 0.75, output 3.75 USD / million tokens. Source: https://ai.google.dev/gemini-api/docs/pricing; Flash 3.8 Standard introductory rates through 2026-12-31; implicit cache only in this benchmark..
