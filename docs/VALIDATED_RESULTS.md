# Real coding-agent cache validation — October 17, 2026

**Completed, independently audited batch**. Generated 2026-10-17T20:29:32.006Z. The following counts describe this registered batch only.

**The real coding results support the qualitative prior-input reuse gap under these tested conditions.** Both Gemini models had a follow-up reading less than 95% of the preceding input in all three tasks; GPT-6.1 Sol and Claude Opus 5.5 had none. This describes reported reuse relative to previous input, not a proven failure to reuse every provider-eligible token. Gemini’s eligible frontier is unknown.

All **12/12 repairs were verified**: actual baseline 38 pass / 6 fail became 44 pass / 0 fail, acceptance material stayed unchanged, and the invoice CLI passed. There were 82 captured HTTP attempts and $1.538777 in independently reconstructed known charges. 11 agents completed naturally; 11/12 tasks met the unchanged primary qualification.

**All attempted tasks, including the capped Flash repair (secondary analysis):**

| Model | Verified repairs | Tasks with <95% follow-up | <95% follow-ups | Strict previous-input match, 64-token tolerance | Eligible frontier fully reused |
| --- | ---: | ---: | ---: | ---: | ---: |
| gemini-4-argon | 3/3 | 3/3 | 3/11 | 8/11 (72.73%) | unknown |
| gpt-6.1-sol | 3/3 | 0/3 | 0/17 | 17/17 (100.00%) | 17/17 |
| gemini-3.8-flash | 3/3 | 3/3 | 30/33 | 3/33 (9.09%) | unknown |
| claude-opus-5-5 | 3/3 | 0/3 | 0/9 | 9/9 (100.00%) | 9/9 |

The strict-match column is a whole-previous-input heuristic, not a provider-eligibility guarantee. All-task rows preserve valid usage from stopped tasks; they do not replace the preregistered natural-completion subset. The exact original 73% claim and the reported 30/120-second cost effects remain unestablished.

The preregistered natural-completion subset does not contain three qualified tasks for every model, so a full four-model primary repeated-pattern judgment remains incomplete. Per-model outcomes and the secondary all-task measurements remain visible; a completion cap does not erase valid raw cache observations.

**Completion-cap limitation:** gemini-3.8-flash trial 2 produced verified source repairs with all 44 tests and CLI passing but stopped without a natural agent completion (Maximum API request count reached). These tasks remain outside primary qualification and inside the secondary all-valid-usage view.

The [independent cross-task integrity audit](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/cross-task-integrity.md) ([JSON evidence](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/cross-task-integrity.json)) records 874 raw-audit checks passed, 0 failed, 0 unknown, and 82 unique native responses. It also checks fixed request fields, task payload equivalence, native history/signature preservation, and actual tool-result replay.

The nominal idle interval was five seconds. The smallest recorded completion-to-send gap was **4999.035708 ms** (less than one millisecond short of 5000 ms; actual timings are retained rather than rounded into compliance).

This study asks whether substantial prior code context is reused while a real coding agent repairs a repository and runs actual tests. It uses the same pinned Pi 1.3.0 agent through public paid APIs, separately for Gemini Argon 4, Gemini Flash 3.8, GPT-6.1 Sol, and Claude Opus 5.5. It is a representative shared coding-agent workflow; it does not run the native Codex, Claude Code, or AGY applications.

Every task starts from the same 62,386-byte, dependency-free invoice-import repository with genuine CSV, decimal-money, and vendor-identity defects. Qualification requires actual source changes, baseline **38 pass / 6 fail**, final **44 pass / 0 fail**, unchanged acceptance material, and an independently executed CLI import of all four invoices. Primary qualification additionally requires natural agent completion; verified-repair outcomes are reported separately when a cap prevents completion. Model claims of success are never accepted as proof.

The [preregistered confirmation protocol](CODING_CONFIRMATION_PROTOCOL.md) specifies three fresh tasks per model, shuffled seed blocks, a five-second idle floor, low reasoning, no retries/cache warming/compaction, and request/time/spend stops. The earlier qualification tasks are listed separately and are not pooled into the three-task confirmation.

## What is supported

| Question | Current scope and judgment |
| --- | --- |
| Is this actual successful coding work? | 12/12 verified repairs passed all 44 tests and CLI; 11/12 also met natural-completion and audit qualification. |
| Does gemini-4-argon repeatedly show a material prior-input shortfall? | Repeated under registered rule: 3/3 qualified tasks contain a follow-up below 95%. |
| Does gpt-6.1-sol repeatedly show a material prior-input shortfall? | Not repeated under registered rule: 0/3 qualified tasks contain a follow-up below 95%. |
| Does gemini-3.8-flash repeatedly show a material prior-input shortfall? | Incomplete: fewer than three qualified tasks: 2/2 qualified tasks contain a follow-up below 95%. |
| Does claude-opus-5-5 repeatedly show a material prior-input shortfall? | Not repeated under registered rule: 0/3 qualified tasks contain a follow-up below 95%. |
| Are Theo’s exact 167/228 full matches or 1.20×/1.34×/1.48× costs replicated? | Not established. The original prompts, cache-eligibility definition, cost denominator, and exact agent method are unavailable. |
| Do 30/120-second gaps cause an additional effect in real coding? | Not tested by this five-second confirmation batch. Earlier generic controls are separate evidence. |
| Is an internal routing, checkpoint, or eviction mechanism identified? | No. Public counters alone cannot identify an internal cause. |

## Three-task confirmation

Source: [coding-2026-10-17T20-14-48.100Z](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/batch.json). Planned tasks: 12; finished tasks: 12; independent audits available: 12. All planned task artifacts are present.

| Model | Qualified tasks / planned | Tasks with <95% follow-up | Audited HTTP attempts / captured | Qualified follow-ups | <95% / strict64 / any read | Prior-input capture in each task | Eligible frontier reused | Boundary-aware follow-up cost |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| gemini-4-argon | 3/3 | 3/3 | 14/14 | 11 | 3 / 8 / 11 | 97.16%, 98.78%, 97.16% | unknown | unknown |
| gpt-6.1-sol | 3/3 | 0/3 | 20/20 | 17 | 0 / 17 / 17 | 99.99%, 99.99%, 99.99% | 17/17 | 1.0000× |
| gemini-3.8-flash | 2/3 | 2/2 | 36/36 | 22 | 20 / 2 / 22 | 93.36%, 93.44% | unknown | unknown |
| claude-opus-5-5 | 3/3 | 0/3 | 12/12 | 9 | 0 / 9 / 9 | 99.99%, 99.99%, 99.99% | 9/9 | 1.0000× |

The three counts in “<95% / strict64 / any read” share the qualified-follow-up denominator. Reuse fractions above 100% are retained when reported reads exceed the preceding input count; these are descriptive counters, not probabilities.

### Secondary view: all valid raw follow-ups, including stopped tasks

| Model | Verified repairs / attempted | Natural completions | Tasks with <95% | Valid raw follow-ups | <95% / strict64 / any read | Prior capture | Eligible reused | Boundary-aware follow-up cost |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| gemini-4-argon | 3/3 | 3 | 3/3 | 11 | 3 / 8 / 11 | 98.03% | unknown | unknown |
| gpt-6.1-sol | 3/3 | 3 | 0/3 | 17 | 0 / 17 / 17 | 99.99% | 17/17 | 1.0000× |
| gemini-3.8-flash | 3/3 | 2 | 3/3 | 33 | 30 / 3 / 33 | 93.43% | unknown | unknown |
| claude-opus-5-5 | 3/3 | 3 | 0/3 | 9 | 0 / 9 / 9 | 99.99% | 9/9 | 1.0000× |

This secondary view retains valid independently decoded usage from every attempted task, including tasks stopped at a request/time cap. A verified repair means the actual baseline failed, all 44 final tests and the CLI passed, acceptance files stayed unchanged, and source changed. It does not require a natural agent completion. It does not replace or relax the preregistered primary qualification; stopped tasks and their raw measurements must not disappear merely because their final message is absent.

| Model | Audited input / reads / writes / ordinary | Audited output | Known input cost | Known output cost |
| --- | --- | ---: | ---: | ---: |
| gemini-4-argon | 411982 / 305574 / 0 / 106408 | 3742 | $0.243373 | $0.037420 |
| gpt-6.1-sol | 508373 / 419063 / 89250 / 60 | 2756 | $0.265151 | $0.027560 |
| gemini-3.8-flash | 1037600 / 874797 / 0 / 162803 | 3802 | $0.187712 | $0.014257 |
| claude-opus-5-5 | 427142 / 309966 / 117146 / 30 | 5773 | $0.647843 | $0.115460 |

| Task | Status / qualification | Tests before → after | Requests; known usage | <95% / follow-ups | Strict64 / any read | Prior capture; minimum | Largest prior deficit | Eligible reused | Boundary / hypothetical follow-up cost | Known task cost |
| --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | --- | ---: |
| [gemini-4-argon · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/01-gemini-paid__gemini-4-argon-5s-t1/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 4; 4 | 1/3 | 2 / 3 | 97.16%; 91.89% | 2049 | unknown | unknown / 1.1742× | $0.079559 |
| [gpt-6.1-sol · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/02-openai-paid__gpt-6.1-sol-5s-t1/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 6; 6 | 0/5 | 5 / 5 | 99.99%; 99.98% | 3 | 5/5 | 1.0000× / 1.0010× | $0.079700 |
| [gemini-3.8-flash · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/03-gemini-paid__gemini-3.8-flash-5s-t1/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 12; 12 | 10/11 | 1 / 11 | 93.36%; 91.99% | 2052 | unknown | unknown / 1.4286× | $0.067576 |
| [claude-opus-5-5 · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/04-anthropic-paid__claude-opus-5-5-5s-t1/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 4; 4 | 0/3 | 3 / 3 | 99.99%; 99.99% | 4 | 3/3 | 1.0000× / 1.0005× | $0.257759 |
| [gpt-6.1-sol · trial 2](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/05-openai-paid__gpt-6.1-sol-5s-t2/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 8; 8 | 0/7 | 7 / 7 | 99.99%; 99.98% | 3 | 7/7 | 1.0000× / 1.0012× | $0.084616 |
| [gemini-3.8-flash · trial 2](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/06-gemini-paid__gemini-3.8-flash-5s-t2/coding-audit.json) | stopped; not qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 12; 12 | 10/11 | 1 / 11 | 93.49%; 91.99% | 2052 | unknown | unknown / 1.4171× | $0.066274 |
| [gemini-4-argon · trial 2](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/07-gemini-paid__gemini-4-argon-5s-t2/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 6; 6 | 1/5 | 4 / 5 | 98.78%; 94.86% | 2049 | unknown | unknown / 1.0636× | $0.122166 |
| [claude-opus-5-5 · trial 2](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/08-anthropic-paid__claude-opus-5-5-5s-t2/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 4; 4 | 0/3 | 3 / 3 | 99.99%; 99.99% | 4 | 3/3 | 1.0000× / 1.0005× | $0.257856 |
| [claude-opus-5-5 · trial 3](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/09-anthropic-paid__claude-opus-5-5-5s-t3/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 4; 4 | 0/3 | 3 / 3 | 99.99%; 99.99% | 4 | 3/3 | 1.0000× / 1.0005× | $0.247688 |
| [gemini-4-argon · trial 3](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/10-gemini-paid__gemini-4-argon-5s-t3/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 4; 4 | 1/3 | 2 / 3 | 97.16%; 91.89% | 2049 | unknown | unknown / 1.1738× | $0.079068 |
| [gemini-3.8-flash · trial 3](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/11-gemini-paid__gemini-3.8-flash-5s-t3/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 12; 12 | 10/11 | 1 / 11 | 93.44%; 91.99% | 2052 | unknown | unknown / 1.4208× | $0.068119 |
| [gpt-6.1-sol · trial 3](../evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z/12-openai-paid__gpt-6.1-sol-5s-t3/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 6; 6 | 0/5 | 5 / 5 | 99.99%; 99.98% | 3 | 5/5 | 1.0000× / 1.0004× | $0.128395 |

Task rows preserve unsuccessful and unaudited tasks. Model reuse counts above use only functionally qualified tasks with a current audit containing no failed checks. Costs in task rows come from independently parsed valid raw usage, including unsuccessful tasks where available. Missing usage and unreported charges remain unknown.

- 06-gemini-paid__gemini-3.8-flash-5s-t2: Maximum API request count reached; audit FAIL 0, UNKNOWN 0; audit matches captured artifacts.

## Method and limits of the coding workload

A roughly 63K-character snapshot of the real repository is preloaded into the initial prompt, with task instructions adding further text. This is substantial coding context, but it differs from a typical interactive agent that discovers the repository through incremental reads. The agent can read/edit source and run a small declared set of real Node test/CLI commands; it does not have an unrestricted shell. Three fresh runs per model repeat one invoice-import issue, not three different task types.

The first request is excluded from reuse-rate denominators because it has no within-task predecessor; it is not guaranteed cold. Shared system/tool prefixes may already be cached, and later Opus initial requests reported cached reads. Those reads and their actual charges remain in the raw evidence and cost totals.

Pi uses explicit Anthropic cache breakpoints, while Gemini and GPT use their configured implicit caching routes. Native serialization, tool choices, signatures, tokenization, and eligible boundaries differ. These are measurements of the configured public-API coding-agent paths, not an experiment that changes only the provider behind otherwise identical wire requests.

Effective reasoning was held at low: GPT’s wire configuration_update and Anthropic’s effective system-message output_config carry low effort. Fixed top-level wrapper values may show medium/high; those wrapper defaults do not describe the effective per-message configuration. Raw requests retain both representations for inspection.

## Reading the measurements

Material shortfall means reported cached reads below 95% of the preceding total input. This is a descriptive threshold, not a documented eligible-cache guarantee. Strict64 means cached reads at least the entire previous input minus 64 tokens; ordinary provider overhead can fail it even when the entire public cache frontier was reused. Any read means a positive reported cached-token count. Initial requests are excluded from follow-up counts without assuming a cold cache; failed/unknown-usage attempts never become cache misses.

For OpenAI and Anthropic, explicit read + write counters expose a public frontier. Boundary-aware costs retain current ordinary-input charges, price the reusable prior frontier at the read rate, and price the newly processed frontier at its write rate. Gemini has no equivalent exposed implicit-write frontier, so boundary-aware metrics remain unknown. Its zero separately billed write partition does not assert that no internal cache write occurred. The hypothetical all-prior-input reference assumes all prior input could be cached; it is a theoretical counterfactual rather than a proven attainable service baseline. Output costs are separate.

Gemini accounting uses documented promptTokenCount for input and prompt-relative cache coverage. Some Flash responses also expose rawPromptTokenCount, whose semantics are absent from the current public UsageMetadata definition and public proto. That additional field is retained as raw evidence but is not silently substituted into billing or reuse denominators; no extra charge bucket or internal-cache explanation is inferred. See [Google UsageMetadata](https://ai.google.dev/api/generate-content#UsageMetadata).

Gemini omitted cached-token counters in an otherwise valid usage object decode to zero under its public proto3/ProtoJSON contract; absent whole usage remains unknown. Each audit retains raw usage and the zero-decoding flag. See the [provider accounting notes](provider-notes.md).

Task capture is the sum of follow-up cached reads divided by the sum of their preceding input counts; the minimum is the lowest individual follow-up ratio. CSV also reports the equally weighted mean of task capture values. Each task is the unit of repetition. Within-task requests are correlated, task lengths and tool choices differ, and these three tasks cannot determine a provider-wide miss probability. Individual task values are shown instead of treating pooled turns as independent observations. The registered repeated-pattern rule requires at least two of three successfully completed tasks to contain a below-95% follow-up.

Usage and cost numbers are reconstructed from captured public-API SSE/JSON by scripts/audit-coding.ts, independently of Pi’s normalized summaries. Functional outcomes are checked from actual subprocess exit codes, saved Node test output, source/acceptance-file hashes, patches, and final CLI output. Estimated charges use the audit’s dated standard rate cards, not an invoice; missing/interrupted charges can exceed known costs. Different task paths make total task costs unsuitable for a matched-workload provider-price ranking.

## Development qualification 1 — separate from confirmation

Source: [coding-2026-10-17T20-10-03.919Z](../evidence/2026-10-17/coding/coding-2026-10-17T20-10-03.919Z/batch.json). Planned tasks: 4; finished tasks: 4; independent audits available: 4. All planned task artifacts are present.

| Model | Qualified tasks / planned | Tasks with <95% follow-up | Audited HTTP attempts / captured | Qualified follow-ups | <95% / strict64 / any read | Prior-input capture in each task | Eligible frontier reused | Boundary-aware follow-up cost |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| gemini-4-argon | 0/1 | 0/0 | 0/0 | 0 | 0 / 0 / 0 | unknown | unknown | unknown |
| gpt-6.1-sol | 1/1 | 0/1 | 9/9 | 8 | 0 / 8 / 8 | 99.99% | 8/8 | 1.0000× |
| gemini-3.8-flash | 0/1 | 0/0 | 0/0 | 0 | 0 / 0 / 0 | unknown | unknown | unknown |
| claude-opus-5-5 | 1/1 | 0/1 | 6/6 | 5 | 0 / 5 / 5 | 99.99% | 5/5 | 1.0000× |

The three counts in “<95% / strict64 / any read” share the qualified-follow-up denominator. Reuse fractions above 100% are retained when reported reads exceed the preceding input count; these are descriptive counters, not probabilities.

### Secondary view: all valid raw follow-ups, including stopped tasks

| Model | Verified repairs / attempted | Natural completions | Tasks with <95% | Valid raw follow-ups | <95% / strict64 / any read | Prior capture | Eligible reused | Boundary-aware follow-up cost |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| gemini-4-argon | 0/1 | 0 | 0/1 | 0 | 0 / 0 / 0 | unknown | unknown | unknown |
| gpt-6.1-sol | 1/1 | 1 | 0/1 | 8 | 0 / 8 / 8 | 99.99% | 8/8 | 1.0000× |
| gemini-3.8-flash | 0/1 | 0 | 0/1 | 0 | 0 / 0 / 0 | unknown | unknown | unknown |
| claude-opus-5-5 | 1/1 | 1 | 0/1 | 5 | 0 / 5 / 5 | 99.99% | 5/5 | 1.0000× |

This secondary view retains valid independently decoded usage from every attempted task, including tasks stopped at a request/time cap. A verified repair means the actual baseline failed, all 44 final tests and the CLI passed, acceptance files stayed unchanged, and source changed. It does not require a natural agent completion. It does not replace or relax the preregistered primary qualification; stopped tasks and their raw measurements must not disappear merely because their final message is absent.

| Model | Audited input / reads / writes / ordinary | Audited output | Known input cost | Known output cost |
| --- | --- | ---: | ---: | ---: |
| gemini-4-argon | unknown | unknown | unknown | unknown |
| gpt-6.1-sol | 191238 / 167643 / 23568 / 27 | 786 | $0.075738 | $0.007860 |
| gemini-3.8-flash | unknown | unknown | unknown | unknown |
| claude-opus-5-5 | 208319 / 169709 / 38596 / 14 | 2101 | $0.226978 | $0.042020 |

| Task | Status / qualification | Tests before → after | Requests; known usage | <95% / follow-ups | Strict64 / any read | Prior capture; minimum | Largest prior deficit | Eligible reused | Boundary / hypothetical follow-up cost | Known task cost |
| --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | --- | ---: |
| [gemini-4-argon · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-10-03.919Z/01-gemini-paid__gemini-4-argon-5s-t1/coding-audit.json) | stopped; not qualified | 38 pass, 6 fail → 38 pass, 6 fail | 0; 0 | 0/0 | 0 / 0 | unknown; unknown | unknown | unknown | unknown / unknown | unknown |
| [gpt-6.1-sol · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-10-03.919Z/02-openai-paid__gpt-6.1-sol-5s-t1/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 9; 9 | 0/8 | 8 / 8 | 99.99%; 99.98% | 3 | 8/8 | 1.0000× / 1.0015× | $0.083598 |
| [gemini-3.8-flash · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-10-03.919Z/03-gemini-paid__gemini-3.8-flash-5s-t1/coding-audit.json) | stopped; not qualified | 38 pass, 6 fail → 38 pass, 6 fail | 0; 0 | 0/0 | 0 / 0 | unknown; unknown | unknown | unknown | unknown / unknown | unknown |
| [claude-opus-5-5 · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-10-03.919Z/04-anthropic-paid__claude-opus-5-5-5s-t1/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 6; 6 | 0/5 | 5 / 5 | 99.99%; 99.99% | 4 | 5/5 | 1.0000× / 1.0006× | $0.268998 |

Task rows preserve unsuccessful and unaudited tasks. Model reuse counts above use only functionally qualified tasks with a current audit containing no failed checks. Costs in task rows come from independently parsed valid raw usage, including unsuccessful tasks where available. Missing usage and unreported charges remain unknown.

- 01-gemini-paid__gemini-4-argon-5s-t1: Pi assistant error; audit FAIL 4, UNKNOWN 0; audit matches captured artifacts.
- 03-gemini-paid__gemini-3.8-flash-5s-t1: Pi assistant error; audit FAIL 4, UNKNOWN 0; audit matches captured artifacts.

## Development qualification 2 — separate from confirmation

Source: [coding-2026-10-17T20-12-00.180Z](../evidence/2026-10-17/coding/coding-2026-10-17T20-12-00.180Z/batch.json). Planned tasks: 2; finished tasks: 2; independent audits available: 2. All planned task artifacts are present.

| Model | Qualified tasks / planned | Tasks with <95% follow-up | Audited HTTP attempts / captured | Qualified follow-ups | <95% / strict64 / any read | Prior-input capture in each task | Eligible frontier reused | Boundary-aware follow-up cost |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| gemini-4-argon | 1/1 | 1/1 | 4/4 | 3 | 1 / 2 / 3 | 97.16% | unknown | unknown |
| gemini-3.8-flash | 1/1 | 1/1 | 8/8 | 7 | 6 / 1 / 7 | 93.23% | unknown | unknown |

The three counts in “<95% / strict64 / any read” share the qualified-follow-up denominator. Reuse fractions above 100% are retained when reported reads exceed the preceding input count; these are descriptive counters, not probabilities.

### Secondary view: all valid raw follow-ups, including stopped tasks

| Model | Verified repairs / attempted | Natural completions | Tasks with <95% | Valid raw follow-ups | <95% / strict64 / any read | Prior capture | Eligible reused | Boundary-aware follow-up cost |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| gemini-4-argon | 1/1 | 1 | 1/1 | 3 | 1 / 2 / 3 | 97.16% | unknown | unknown |
| gemini-3.8-flash | 1/1 | 1 | 1/1 | 7 | 6 / 1 / 7 | 93.23% | unknown | unknown |

This secondary view retains valid independently decoded usage from every attempted task, including tasks stopped at a request/time cap. A verified repair means the actual baseline failed, all 44 final tests and the CLI passed, acceptance files stayed unchanged, and source changed. It does not require a natural agent completion. It does not replace or relax the preregistered primary qualification; stopped tasks and their raw measurements must not disappear merely because their final message is absent.

| Model | Audited input / reads / writes / ordinary | Audited output | Known input cost | Known output cost |
| --- | --- | ---: | ---: | ---: |
| gemini-4-argon | 100749 / 70137 / 0 / 30612 | 1242 | $0.068238 | $0.012420 |
| gemini-3.8-flash | 211746 / 169355 / 0 / 42391 | 1314 | $0.044495 | $0.004927 |

| Task | Status / qualification | Tests before → after | Requests; known usage | <95% / follow-ups | Strict64 / any read | Prior capture; minimum | Largest prior deficit | Eligible reused | Boundary / hypothetical follow-up cost | Known task cost |
| --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | --- | ---: |
| [gemini-4-argon · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-12-00.180Z/01-gemini-paid__gemini-4-argon-5s-t1/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 4; 4 | 1/3 | 2 / 3 | 97.16%; 91.89% | 2049 | unknown | unknown / 1.1740× | $0.080658 |
| [gemini-3.8-flash · trial 1](../evidence/2026-10-17/coding/coding-2026-10-17T20-12-00.180Z/02-gemini-paid__gemini-3.8-flash-5s-t1/coding-audit.json) | completed; qualified · repair verified | 38 pass, 6 fail → 44 pass, 0 fail | 8; 8 | 6/7 | 1 / 7 | 93.23%; 91.98% | 2054 | unknown | unknown / 1.4107× | $0.049422 |

Task rows preserve unsuccessful and unaudited tasks. Model reuse counts above use only functionally qualified tasks with a current audit containing no failed checks. Costs in task rows come from independently parsed valid raw usage, including unsuccessful tasks where available. Missing usage and unreported charges remain unknown.


## Reproduce this offline report

```sh
npx tsx scripts/summarize-coding.ts evidence/2026-10-17/coding/coding-2026-10-17T20-14-48.100Z --qualifier evidence/2026-10-17/coding/coding-2026-10-17T20-10-03.919Z --qualifier evidence/2026-10-17/coding/coding-2026-10-17T20-12-00.180Z --out docs/VALIDATED_RESULTS.md --final
```

The script writes model-summary.csv, trial-summary.csv, coding-summary.json, and coding-summary.md inside the selected batch. Without --final it explicitly labels a partial snapshot. --final requires completed planned tasks and current independent audit artifacts. It never reads credentials or starts a provider request.
