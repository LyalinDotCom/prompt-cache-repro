# Independent coding audit

Model: gemini-3.8-flash. Captured transport attempts: 12; valid raw usage: 12; unknown usage: 0.

Checks: 126 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 21286 | 0 | 0 | 21286 | 27 | — |
| 1 | 200 | 25608 | 21286 | 0 | 4322 | 29 | 100.00% |
| 2 | 200 | 26731 | 23556 | 0 | 3175 | 29 | 91.99% |
| 3 | 200 | 27354 | 24679 | 0 | 2675 | 28 | 92.32% |
| 4 | 200 | 28028 | 25302 | 0 | 2726 | 31 | 92.50% |
| 5 | 200 | 29852 | 25981 | 0 | 3871 | 28 | 92.70% |
| 6 | 200 | 30663 | 27802 | 0 | 2861 | 112 | 93.13% |
| 7 | 200 | 30802 | 28611 | 0 | 2191 | 81 | 93.31% |
| 8 | 200 | 30911 | 28751 | 0 | 2160 | 412 | 93.34% |
| 9 | 200 | 31350 | 28862 | 0 | 2488 | 27 | 93.37% |
| 10 | 200 | 32448 | 29304 | 0 | 3144 | 57 | 93.47% |
| 11 | 200 | 34008 | 30405 | 0 | 3603 | 21 | 93.70% |

Input charge estimate: $0.06296692. Output charge estimate: $0.00330750.

Previous-input coverage below 95%: 10/11. Public eligible frontier fully reused: 0/0 (implicit-write frontier unavailable).

Follow-up input charges: $0.04700242; whole-prior-input counterfactual: $0.03316897 (1.4171×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
