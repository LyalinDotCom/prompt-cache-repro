# First live smoke results — October 17, 2026

Unofficial community experiment. Results are experimental and are not guaranteed to be accurate. These small tests establish real public API telemetry and useful diagnostic examples. They do not reproduce Theo's exact workload or establish his reported 27% full-hit miss rate or 50% cost overhead.

Across six runs during construction and validation, the harness recorded **50 API attempts**, including two errors and one successful HTTP response carrying an Opus refusal. Known usage-based input/output cost estimates total **$0.773923**. This excludes unknown charges from failed or interrupted traffic and is not a verified bill. Every run, including cancelled and incomplete runs, is retained in [the evidence index](../evidence/2026-10-17/index.json).

## Deterministic replay with measured gaps

One paid Gemini account ran both requested models against identical within-trial payloads. Each cell had one warm-up and **one measured follow-up**. There is only one trial per cell, so no reliable conclusion about population hit rates or timing sensitivity follows.

| Model | Requested gap | Follow-up cached input coverage | Prior-input shortfall | Strict previous-input matches (64-token heuristic) | Input cost / theoretical baseline, warm-up included |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gemini 4 Argon | 5s | 85.94% | 2,049 tokens | 0/1 | 1.127x |
| Gemini 4 Argon | 30s | 85.94% | 2,049 tokens | 0/1 | 1.127x |
| Gemini 4 Argon | 120s | 85.94% | 2,049 tokens | 0/1 | 1.127x |
| Gemini 3.8 Flash | 5s | 85.94% | 2,046 tokens | 0/1 | 1.115x |
| Gemini 3.8 Flash | 30s | 85.94% | 2,046 tokens | 0/1 | 1.115x |
| Gemini 3.8 Flash | 120s | 85.94% | 2,046 tokens | 0/1 | 1.115x |

The within-trial wire-payload hashes were identical. Actual completion-to-SDK-send gaps are recorded in the raw observations and were at least the requested gaps. The observed deficits were 2,049 tokens for Argon and 2,046 for Flash. These are external observations; it does not prove a particular internal checkpoint or eviction mechanism.

[Complete timed report and raw requests/responses](../evidence/2026-10-17/58a98334-66b2-4cb4-a071-a3106b8720db/report.json) · [Readable report](../evidence/2026-10-17/58a98334-66b2-4cb4-a071-a3106b8720db/summary.md)

## Other observed cases

- **Opus 5.5, exact replay:** two measured follow-ups met the strict 64-token previous-input threshold. Each retained four uncached tokens. [Report](../evidence/2026-10-17/8ea191b7-7477-43fa-b9e8-336f6eeada0d/report.json).
- **GPT-6.1 Sol, exact replay:** two measured follow-ups met the threshold. The initial development run also tested Sonnet 5.5, before the requested switch to Opus; its model IDs and prices remain labeled. [Report](../evidence/2026-10-17/d264db57-b20e-4f1e-b9df-ac18393c089d/report.json).
- **Gemini tool loop, 5s gap:** three Argon follow-ups reused about 83.4% of current input tokens; three Flash follow-ups omitted the cached-read counter. Google’s public proto defines this counter as an integer without explicit presence, and ProtoJSON omits default-valued fields, so these valid usage objects decode to zero cached-read tokens. This is protocol decoding of the reported counter, not an assertion about internal cache state. See the [public proto](https://github.com/googleapis/googleapis/blob/master/google/ai/generativelanguage/v1beta/generative_service.proto#L574-L582) and [ProtoJSON defaults](https://protobuf.dev/programming-guides/json/#presence-and-default-values). These were successful native tool continuations with preserved history. This is a different workload from exact replay. [Report](../evidence/2026-10-17/3e1f5fa4-d656-4306-93e9-f075cc18bf4b/report.json).
- **GPT-6.1 Sol tool loop:** a completed four-turn cell had about 95.3% cached coverage of current input and 99.0% capture relative to previous input. All three follow-ups failed the strict 64-token previous-input heuristic because each had 132 ordinary input tokens. Those ordinary tokens were outside the explicit cache read + write frontier: all three follow-ups reused the entire preceding reported frontier. Recomputing costs with ordinary input held at its ordinary rate gives **1.000× boundary-aware input cost**, rather than the pilot’s artificial **1.019593× hypothetical all-input ratio**. The original evidence remains unchanged; its old strict-hit and cost fields must be interpreted with this correction. [Report](../evidence/2026-10-17/607900a8-7604-4514-9bbc-c638d1c4a32c/report.json).
- **Opus tool loop:** the API first rejected an unsupported thinking setting. After a documented adapter correction, it returned a provider refusal with no tool call. The harness stopped that trajectory, preserved the input charges, and marked it incomplete. No follow-up cache conclusion is available for that cell. One OpenAI connection error is also retained; no automatic retry concealed it.

## Interpretation

These observations reproduce partial Gemini reuse under the tested conditions and show that workload structure matters. They do **not** reproduce Theo's exact full-hit rate or establish his total-cost multiplier. Different native serialization, small sample size, provider-hidden overhead, and unavailable original methodology limit the comparison. The table’s cost ratios cover input charges against a hypothetical all-previous-input-cached lower bound; that bound is not proven attainable, and ordinary overhead can inflate it. Boundary-aware costs for OpenAI and Anthropic instead use reusable = min(previous reads + writes, current reads + writes), retain current ordinary-input charges, and charge new frontier tokens at the write rate. Gemini does not expose an equivalent write frontier, so its eligible-frontier cost remains unknown. Output cost is separate.

A larger run should repeat independent trials, retain strict-match, continuous token-coverage, and eligible-frontier views, and compare account tiers when additional keys are available. The existing CLI and web matrix support that without changing the provider adapters.
