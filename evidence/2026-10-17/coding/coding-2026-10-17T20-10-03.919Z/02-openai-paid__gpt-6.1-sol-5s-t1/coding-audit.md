# Independent coding audit

Model: gpt-6.1-sol. Captured transport attempts: 9; valid raw usage: 9; unknown usage: 0.

Checks: 89 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 17795 | 0 | 17792 | 3 | 75 | — |
| 1 | 200 | 17909 | 17792 | 114 | 3 | 26 | 99.98% |
| 2 | 200 | 18760 | 17906 | 851 | 3 | 107 | 99.98% |
| 3 | 200 | 22257 | 18757 | 3497 | 3 | 71 | 99.98% |
| 4 | 200 | 22352 | 22254 | 95 | 3 | 141 | 99.99% |
| 5 | 200 | 22517 | 22349 | 165 | 3 | 54 | 99.99% |
| 6 | 200 | 22596 | 22514 | 79 | 3 | 29 | 99.99% |
| 7 | 200 | 23481 | 22593 | 885 | 3 | 51 | 99.99% |
| 8 | 200 | 23571 | 23478 | 90 | 3 | 232 | 99.99% |

Input charge estimate: $0.07573830. Output charge estimate: $0.00786000.

Previous-input coverage below 95%: 0/8. Public eligible frontier fully reused: 8/8.

Follow-up input charges: $0.03125230; whole-prior-input counterfactual: $0.03120670 (1.0015×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
