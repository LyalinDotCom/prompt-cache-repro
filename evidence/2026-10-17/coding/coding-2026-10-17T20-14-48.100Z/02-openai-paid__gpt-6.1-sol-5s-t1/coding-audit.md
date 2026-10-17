# Independent coding audit

Model: gpt-6.1-sol. Captured transport attempts: 6; valid raw usage: 6; unknown usage: 0.

Checks: 62 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 17883 | 0 | 17880 | 3 | 26 | — |
| 1 | 200 | 18734 | 17880 | 851 | 3 | 106 | 99.98% |
| 2 | 200 | 22230 | 18731 | 3496 | 3 | 290 | 99.98% |
| 3 | 200 | 22589 | 22227 | 359 | 3 | 29 | 99.99% |
| 4 | 200 | 23472 | 22586 | 883 | 3 | 51 | 99.99% |
| 5 | 200 | 24745 | 23469 | 1273 | 3 | 230 | 99.99% |

Input charge estimate: $0.07238030. Output charge estimate: $0.00732000.

Previous-input coverage below 95%: 0/5. Public eligible frontier fully reused: 5/5.

Follow-up input charges: $0.02767430; whole-prior-input counterfactual: $0.02764580 (1.0010×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
