# Prompt cache benchmark report

Run: d264db57-b20e-4f1e-b9df-ac18393c089d · completed · node

Created: 2026-10-17T19:31:35.641Z. Finished: 2026-10-17T19:32:03.218Z.

Scenario: replay; 3 turns per trial (turn 0 is excluded from hit rates); 1 trials; seed: cachebench-smoke-v1.

| Profile | Gap (s) | Attempts / errors | Measured followups | Full hit | Any hit | Token hit | Reusable capture | Input cost | Ideal input | Input multiplier | Followup multiplier | Output cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini · paid | 0 | 3 / 0 | 2 | 0.0% | 100.0% | 85.9% | 85.9% | $0.039792 | $0.032006 | 1.243 | 3.676 | $0.000150 |
| OpenAI · paid | 0 | 3 / 0 | 2 | 100.0% | 100.0% | 100.0% | 100.0% | $0.032818 | $0.032806 | 1.000 | 1.005 | $0.000150 |
| Anthropic · paid | 0 | 3 / 0 | 2 | 100.0% | 100.0% | 100.0% | 100.0% | $0.050868 | $0.050853 | 1.000 | 1.004 | $0.000120 |

Full hit compares reported cached reads against previous successful input tokens with the configured token tolerance. It is a heuristic: hidden prefixes and provider rounding prevent proving exact prefix reuse. Any hit means cached reads > 0. Token hit is cached-read / total-input tokens on eligible followups. Reusable capture is cached-read / previous-input tokens (capped at 1).

Input costs use uncached input × input rate + cache reads × read rate + cache writes × write rate, per million tokens. Ideal input includes actual first-turn cost and then assumes all reusable prior input reads from cache and all new delta follows the provider write policy. Output costs are separate. Unknown counters remain unknown. Perturbation has no ideal reuse baseline.

Wilson 95% intervals are descriptive turn-level intervals, not independent-sample confidence intervals: turns are clustered within trials. Compare independent trials and repeated randomized runs before drawing conclusions.

Gemini · paid at 0s: Wilson interval 0.0%–65.8%.
OpenAI · paid at 0s: Wilson interval 34.2%–100.0%.
Anthropic · paid at 0s: Wilson interval 34.2%–100.0%.

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
