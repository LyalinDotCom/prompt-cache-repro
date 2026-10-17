# Independent final integrity audit

**PASS**: 82 captured HTTP requests, 82 unique native responses, 874 raw-audit checks passed; zero failed or unknown raw-audit checks. All 12 repairs independently pass 44 tests and the four-invoice CLI import; 11 tasks naturally completed.

| Model | Natural / repair | All raw follow-ups | <95% | Strict64 full | Positive read | Public eligible fully reused |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| gemini-4-argon | 3/3 | 11 | 3 | 8 | 11 | unknown |
| gpt-6.1-sol | 3/3 | 17 | 0 | 17 | 17 | 17/17 |
| gemini-3.8-flash | 2/3 | 33 | 30 | 3 | 33 | unknown |
| claude-opus-5-5 | 3/3 | 9 | 0 | 9 | 9 | 9/9 |

All 12 task/source payloads match after removing the fresh 64-character identity; system instructions match after substituting the task cwd. Every fixed wire request field stays stable within each task. All native history/signature checks pass; 121 of 122 executed tool results appear unchanged in later wire requests, with the sole expected unsubmitted result at the stopped task cap. Known usage estimate: $1.538777425.

- One Flash task reached the registered 12-request cap after a verified repair; its final executed tool result is saved locally but not submitted in a 13th API request. All 12 attempts remain in secondary raw counts; the task is excluded from the registered natural-completion primary subset.
- Anthropic cache_control markers move; content and native signed-history prefixes are preserved after removing only cache-control metadata. OpenAI input configuration_update reasoning.low and Anthropic in-context system output_config effort.low remain in history; top-level defaults alone do not identify effective effort.
- The smallest actual idle gap was 4999.035708 ms: less than one millisecond below 5000 ms because JavaScript timers can wake fractionally early. All actual timings are recorded without rounding.
- Later Opus initial requests reuse 1405 common system/tool tokens. Fresh task identities prevent full code-context carryover; first requests are excluded from follow-up denominators.
- Gemini rawPromptTokenCount is retained but is absent from the checked current official UsageMetadata schema and public proto; its semantics remain unknown. Documented promptTokenCount and totalTokenCount drive partitions and estimates; no extra billing bucket is inferred.
- Gemini implicit eligible-write frontier remains unobservable. Prior-total-input coverage and hypothetical full-prior-input cost are descriptive counterfactuals, not guaranteed cache eligibility or internal-cause identification.

Source, settings, native response, and per-task evidence: [cross-task-integrity.json](cross-task-integrity.json).
