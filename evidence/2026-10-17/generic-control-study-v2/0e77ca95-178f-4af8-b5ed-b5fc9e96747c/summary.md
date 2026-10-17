# Prompt cache benchmark report

Run: 0e77ca95-178f-4af8-b5ed-b5fc9e96747c · completed · node

Created: 2026-10-17T19:57:38.112Z. Finished: 2026-10-17T19:58:17.585Z.

Scenario: replay; 2 turns per trial (turn 0 is excluded from hit rates); 1 trials; seed: validation-v2-control-replay.

| Profile | Gap (s) | Attempts / errors | Measured followups | Strict previous-input match | Any hit | Token hit | Reusable capture | Input cost | Theoretical ideal input | Theoretical input multiplier | Theoretical followup multiplier | Output cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini Argon 4 · Gemini paid account | 5 | 2 / 0 | 1 | 0.0% | 100.0% | 84.8% | 84.8% | $0.032178 | $0.028285 | 1.138 | 3.890 | $0.000100 |
| Gemini Flash 3.8 · Gemini paid account | 5 | 2 / 0 | 1 | 0.0% | 100.0% | 84.8% | 84.8% | $0.012488 | $0.011107 | 1.124 | 2.368 | $0.000008 |
| GPT-6.1 Sol · OpenAI paid account | 5 | 2 / 0 | 1 | 100.0% | 100.0% | 100.0% | 100.0% | $0.029265 | $0.029259 | 1.000 | 1.005 | $0.000100 |
| Claude Opus 5.5 · Anthropic paid account | 5 | 2 / 0 | 1 | 0.0% | 0.0% | 0.0% | 0.0% | $0.174062 | $0.090512 | 1.923 | 24.999 | $0.000000 |

Full hit compares reported cached reads against previous successful input tokens with the configured token tolerance. It is a heuristic: hidden prefixes and provider rounding prevent proving exact prefix reuse. Any hit means cached reads > 0. Any-hit and token-hit metrics include all successful followups with a known cached-read counter, including perturbation and inputs below the minimum; their sample counts may differ from full-hit eligibility. Token hit is cached-read / total-input tokens on those followups. Reusable capture is cached-read / previous-input tokens (capped at 1).

The theoretical previous-input baseline is a hypothetical lower bound, not proof that ordinary input overhead was eligible for caching. Input costs use uncached input × input rate + cache reads × read rate + cache writes × write rate, per million tokens. Ideal input includes actual first-turn cost and then assumes all reusable prior input reads from cache and all new delta follows the provider write policy. Output costs are separate. Unknown counters remain unknown. Perturbation has no ideal reuse baseline.

Provider-eligible frontier metrics are available only for OpenAI/Anthropic with explicit read and write counters. Reusable = min(previous reads + writes, current reads + writes). Ordinary current input stays charged at its ordinary rate, reusable tokens at the read rate, and remaining current cache-boundary tokens at the write rate. Gemini exposes no equivalent write frontier; these metrics remain unknown. This is a boundary-aware counterfactual, not proof of provider-internal prefix identity.

| Profile | Gap (s) | Eligible measured turns | Eligible full match | Eligible capture | Boundary-aware ideal input | Boundary-aware input multiplier | Boundary-aware followup multiplier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gemini Argon 4 · Gemini paid account | 5 | 0 | unknown | unknown | $unknown | unknown | unknown |
| Gemini Flash 3.8 · Gemini paid account | 5 | 0 | unknown | unknown | $unknown | unknown | unknown |
| GPT-6.1 Sol · OpenAI paid account | 5 | 1 | 100.0% | 100.0% | $0.029265 | 1.000 | 1.000 |
| Claude Opus 5.5 · Anthropic paid account | 5 | 1 | 0.0% | 0.0% | $0.090528 | 1.923 | 24.890 |

Wilson 95% intervals are descriptive turn-level intervals, not independent-sample confidence intervals: turns are clustered within trials. Compare independent trials and repeated randomized runs before drawing conclusions.

Gemini Argon 4 · Gemini paid account at 5s: Wilson interval 0.0%–79.3%.
Gemini Flash 3.8 · Gemini paid account at 5s: Wilson interval 0.0%–79.3%.
GPT-6.1 Sol · OpenAI paid account at 5s: Wilson interval 20.7%–100.0%.
Claude Opus 5.5 · Anthropic paid account at 5s: Wilson interval 0.0%–79.3%.

Warnings:
- Sequential requests; no automatic retries. Fresh nonce per trial isolates cache prefixes.
- Cost guard is an estimate and an observed-spend soft stop, not a guaranteed billing cap. Output cost is reported separately from input-cache multipliers.
- Gemini omitted cachedContentTokenCount; decoded as zero under the proto3 non-presence int32 / ProtoJSON default-zero contract. Raw usage is preserved.
- request is the Google SDK object; wireRequest contains its transformed HTTP JSON (config fields move to generationConfig/tools).
- Wilson 95% interval describes turns only; turns within a trial are clustered and are not independent experimental replicates.
- Full hit is a previous-input token-count heuristic. Hidden provider prefixes, rounding, and minimum cache lengths prevent proof of exact prefix reuse.

SDK versions: @google/genai 2.30.0, openai 7.36.0, @anthropic-ai/sdk 0.135.0.

Pricing snapshots:
- Gemini Argon 4 · Gemini paid account: as of 2026-10-17; input 2, read 0.1, write 2, output 10 USD / million tokens. Source: https://ai.google.dev/gemini-api/docs/pricing; Argon Standard introductory rates through 2026-11-30; recheck before later runs..
- Gemini Flash 3.8 · Gemini paid account: as of 2026-10-17; input 0.75, read 0.075, write 0.75, output 3.75 USD / million tokens. Source: https://ai.google.dev/gemini-api/docs/pricing; Flash 3.8 Standard introductory rates through 2026-12-31; implicit cache only in this benchmark..
- GPT-6.1 Sol · OpenAI paid account: as of 2026-10-17; input 2, read 0.1, write 2.5, output 10 USD / million tokens. Source: https://developers.openai.com/api/docs/pricing; Standard, global processing; GPT-6.1 Sol writes at 1.25x input. Under 100K input only in this version..
- Claude Opus 5.5 · Anthropic paid account: as of 2026-10-17; input 4, read 0.2, write 5, output 20 USD / million tokens. Source: https://platform.claude.com/docs/en/about-claude/pricing; Opus 5.5 Standard, global processing; 5-minute automatic cache writes..
