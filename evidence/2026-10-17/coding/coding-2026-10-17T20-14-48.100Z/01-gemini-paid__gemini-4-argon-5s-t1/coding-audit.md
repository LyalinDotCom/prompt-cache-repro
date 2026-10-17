# Independent coding audit

Model: gemini-4-argon. Captured transport attempts: 4; valid raw usage: 4; unknown usage: 0.

Checks: 46 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 20992 | 0 | 0 | 20992 | 31 | — |
| 1 | 200 | 25257 | 20993 | 0 | 4264 | 536 | 100.00% |
| 2 | 200 | 25884 | 23208 | 0 | 2676 | 89 | 91.89% |
| 3 | 200 | 28548 | 25885 | 0 | 2663 | 480 | 100.00% |

Input charge estimate: $0.06819860. Output charge estimate: $0.01136000.

Previous-input coverage below 95%: 1/3. Public eligible frontier fully reused: 0/0 (implicit-write frontier unavailable).

Follow-up input charges: $0.02621460; whole-prior-input counterfactual: $0.02232530 (1.1742×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
