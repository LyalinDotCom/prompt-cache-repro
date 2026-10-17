# Validation protocol: finite fixture, batch v2

Registered before the next API batch on 2026-10-17. This protocol governs the next 96 planned requests. Earlier development runs remain separate evidence and must not be pooled into this batch's results. Any change to this plan must be dated and disclosed before the affected requests run.

## Question and scope

Test the qualitative claim that Gemini reuses materially less prior agent context than the other tested public APIs, and whether longer idle gaps change that behavior. The original experiment's complete workload and cost denominator are unavailable. This is an independent experiment, not an exact reproduction of its 228 follow-up observations, reported approximately 73% full-hit rate, or approximately 50% cost claim.

Use one externally billed, operator-declared paid account per provider. The same Gemini account runs both Gemini models. Requested models are `gemini-4-argon`, `gemini-3.8-flash`, `gpt-6.1-sol`, and `claude-opus-5-5`. Preserve returned model IDs, actual account/model cells, dated standard rate cards, pinned SDK versions, and runtime. No model or provider fallback, automatic retries, built-in tools, or real filesystem/network tool execution is permitted.

## Fixed workload and settings

All agent requests use the same finite `validation-v2` task: retrieve four deterministic fixture chunks through `read_fixture`, one call per response, then complete the task. The first four responses therefore have an intended tool call; this replaces the earlier indefinite request to continue calling forever. Tool results contain identical fixture text for the same step across providers. Native tool serialization differs by API. Preserve complete assistant output and signed/encrypted continuation content. A refusal, missing/multiple/invalid tool call, truncation that prevents continuation, or transport failure ends that trajectory and remains visible; do not repair it by silently changing prompts or inventing history.

Every stage uses these settings unless a stage explicitly sets its turn/gap allocation:

| Setting | Value |
| --- | --- |
| Reference prefix | 48,000 characters |
| Added fixture per growth step | 2,400 characters |
| Maximum output | 512 tokens per request |
| Reasoning effort | Low, using each model's supported native API setting |
| Strict previous-input tolerance | 64 tokens |
| Per-request timeout | 90 seconds |
| Session identity | Fresh nonce per trajectory, unchanged within that trajectory |

Characters are not tokens; use returned usage to check model cache minimums. Equal-length opaque nonces are preferred. If the implementation embeds account/model identifiers and therefore varies nonce length, record that deviation; compare the shared fixture separately from nonce metadata. Never claim byte-identical requests across different provider schemas.

OpenAI/Gemini may request a function call explicitly. Opus uses automatic tool choice with the same finite task and strict schema, because its API rejects forced tool choice. These native API differences are a limitation of the agent comparison, not grounds for a fallback. [Opus migration requirements](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide)

## Allocation and execution

| Stage | Allocation | Planned requests |
| --- | --- | ---: |
| Controls | `replay`, `append`, and `perturb`; all four models; 5-second gap; one trial; two requests per trajectory | 24 |
| Main agent | Three independent seed blocks; all four models; 5-second gap; four requests per trajectory | 48 |
| Agent timing extension | Both Gemini models; 30- and 120-second gaps; three independent trial blocks; two requests per trajectory | 24 |
| Total | | 96 |

Register and preserve the actual seed strings before dispatch. Shuffle account/model/gap cells using the recorded seeds; keep requests sequential. Use the same three fixture seed blocks for the main agent and its timing extension where possible, with fresh independent trajectory nonces. Verify shared fixture hashes after excluding nonce metadata. If seed/content matching is not achieved, label timing comparisons independent rather than paired.

Timing comparisons use only the first request and first follow-up (`t0` and `t1`) at every gap. Do not compare a four-request 5-second cost aggregate against a two-request longer-gap aggregate. The timing extension uses the agent workload, so its 5-second baseline is the matching window from the main agent stage. The single-trial replay controls supply a separate static-prompt diagnostic, not a matched three-trial timing baseline.

Measure the idle gap from completion of the prior response to the next SDK send, and retain actual elapsed gaps. This does not equal provider cache age: response generation also consumes time between request starts. Anthropic measures its TTL from request start. [Claude caching guide](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

The shared batch has a 30-minute wall-clock deadline and a $5 known observed usage-cost stop, whichever occurs first. Check these between requests and abort ongoing work at the deadline. Preflight estimates and observed-cost checks are soft guards, not provider billing caps; interrupted requests, unknown usage, and unreported charges can exceed observed totals. Do not restart failed requests to fill the planned sample. Preserve every attempted request and any incomplete stages. The allocation is a maximum plan, not a promise of 96 valid measurements.

## Outcomes and decision rules

Primary evidence is the raw input/read/write/ordinary partition, cached reads divided by current total input, and cached reads relative to prior input. Report counts and individual trajectories, not percentages alone. Exclude first requests from follow-up rates while retaining their counters and costs. Describe each first request as a warm-up allocation; a nonce cannot guarantee that the backend was cold.

An exploratory material-shortfall flag means a follow-up's cached reads are less than 95% of prior total input. This is a disclosed descriptive threshold, not a documented provider guarantee or a significance test. The strict 64-token previous-input full-hit label is secondary and must be called a heuristic. Report shortfall magnitudes and any-hit fractions alongside it; do not equate a strict-threshold failure with complete cache loss.

For OpenAI and Anthropic, also assess the previous publicly accounted cache frontier, `previous reads + previous writes`. Their ordinary input may sit outside eligible cache boundaries. A follow-up can fully reuse that frontier while failing the total-previous-input threshold. The official OpenAI guide describes message-ending eligibility and cached reporting that excludes hidden tokens; Anthropic defines ordinary input as the region after the cache breakpoint. [OpenAI caching guide](https://developers.openai.com/api/docs/guides/prompt-caching#how-caching-works), [Claude usage accounting](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#tracking-cache-performance)

Keep actual estimated input charges, output charges, and total estimated charges separate. A full-previous-input theoretical cost baseline is a counterfactual, not proof of perfect eligible caching. Where the APIs expose reads and writes, additionally retain ordinary input at its ordinary rate, price reusable eligible input at the read rate, and price new eligible input at the write rate. State assumptions explicitly. Gemini exposes no equivalent implicit-write frontier; do not subtract an observed approximately 2K residual from its denominator and present that as documented eligibility.

Google documents implicit caching without a cost-saving guarantee and a 4,096-token minimum for both selected Gemini models; it does not establish a 2,049-token recovery window or a cause of eviction. [Google generateContent caching guide](https://ai.google.dev/gemini-api/docs/generate-content/caching)

For otherwise valid Gemini usage messages, an omitted `cachedContentTokenCount` decodes to reported zero: the official proto uses a plain proto3 `int32` field, and ProtoJSON omits default-valued implicit-presence scalars. Missing the entire usage message, malformed counters, and inconsistent totals remain unknown. Preserve whether zero was explicit or decoded. This establishes reported usage, not invisible backend work. [Official Google schema](https://github.com/googleapis/googleapis/blob/master/google/ai/generativelanguage/v1beta/generative_service.proto#L574-L582), [ProtoJSON defaults](https://protobuf.dev/programming-guides/json/#presence-and-default-values)

| Claim under examination | Evidence that can bear on it | What this batch cannot establish |
| --- | --- | --- |
| Gemini has lower prior-context reuse in agent work | Per-trajectory raw partitions, coverage, prior-input shortfalls, and eligible-frontier comparisons where available | Provider-wide reliability, identical hidden rendering, or real coding-agent behavior |
| Idle time changes reuse through 120 seconds | Same `t0+t1` agent windows at actual 5/30/120-second gaps | Routing, cache tiers, eviction causes, or a universal retention floor |
| The observed caching behavior increases cost | Dated usage-based charges and explicitly named input-cost counterfactuals | Actual invoices, total application cost, or the original claim's still-unknown denominator |
| The supplied approximately 73%/50% figures are reproduced | Qualitative agreement or disagreement under this registered workload | Exact numerical reproduction without the original methodology |

## Reporting and limitations

Publish stage completion, planned/attempted/valid counts, refusals, errors, timeouts, invalid continuations, unknown counters, actual gaps, raw artifacts, and protocol deviations. Keep failed attempts out of hit-rate denominators; disclose incomplete billing coverage. A successful initial Opus response followed by no valid tool trajectory supplies no agent follow-up conclusion. Retain those outcomes without substituting another model or excluding inconvenient runs from the evidence index.

There are three independent main seed blocks, only nine planned follow-ups per model, and three planned follow-ups per Gemini timing cell. Turns within one trajectory are correlated. These samples cannot precisely resolve a 73% hit probability, establish statistical equivalence, or support a general provider ranking. Controls have only one follow-up per cell. Paid accounts alone say nothing about free or other account tiers. Model tokenization, tool-choice policies, native overhead, and live outputs differ. Rates are estimates rather than actual billing. Report patterns and uncertainty without assigning an internal cause.
