# Independent coding audit

Model: gemini-3.8-flash. Captured transport attempts: 12; valid raw usage: 12; unknown usage: 0.

Checks: 126 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 21289 | 0 | 0 | 21289 | 27 | — |
| 1 | 200 | 25615 | 21289 | 0 | 4326 | 29 | 100.00% |
| 2 | 200 | 26738 | 23563 | 0 | 3175 | 29 | 91.99% |
| 3 | 200 | 27881 | 24687 | 0 | 3194 | 30 | 92.33% |
| 4 | 200 | 28573 | 25829 | 0 | 2744 | 29 | 92.64% |
| 5 | 200 | 29438 | 26523 | 0 | 2915 | 110 | 92.83% |
| 6 | 200 | 29575 | 27386 | 0 | 2189 | 81 | 93.03% |
| 7 | 200 | 29684 | 27523 | 0 | 2161 | 410 | 93.06% |
| 8 | 200 | 30121 | 27634 | 0 | 2487 | 21 | 93.09% |
| 9 | 200 | 31217 | 28075 | 0 | 3142 | 27 | 93.21% |
| 10 | 200 | 32321 | 29171 | 0 | 3150 | 57 | 93.45% |
| 11 | 200 | 33881 | 30278 | 0 | 3603 | 601 | 93.68% |

Input charge estimate: $0.06267810. Output charge estimate: $0.00544125.

Previous-input coverage below 95%: 10/11. Public eligible frontier fully reused: 0/0 (implicit-write frontier unavailable).

Follow-up input charges: $0.04671135; whole-prior-input counterfactual: $0.03287790 (1.4208×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
