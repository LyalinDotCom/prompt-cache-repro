# Independent coding audit

Model: gemini-4-argon. Captured transport attempts: 6; valid raw usage: 6; unknown usage: 0.

Checks: 66 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 20996 | 0 | 0 | 20996 | 142 | — |
| 1 | 200 | 29259 | 20997 | 0 | 8262 | 228 | 100.00% |
| 2 | 200 | 36771 | 29260 | 0 | 7511 | 98 | 100.00% |
| 3 | 200 | 39864 | 36772 | 0 | 3092 | 543 | 100.00% |
| 4 | 200 | 40498 | 37815 | 0 | 2683 | 87 | 94.86% |
| 5 | 200 | 43151 | 40499 | 0 | 2652 | 426 | 100.00% |

Input charge estimate: $0.10692630. Output charge estimate: $0.01524000.

Previous-input coverage below 95%: 1/5. Public eligible frontier fully reused: 0/0 (implicit-write frontier unavailable).

Follow-up input charges: $0.06493430; whole-prior-input counterfactual: $0.06104880 (1.0636×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
