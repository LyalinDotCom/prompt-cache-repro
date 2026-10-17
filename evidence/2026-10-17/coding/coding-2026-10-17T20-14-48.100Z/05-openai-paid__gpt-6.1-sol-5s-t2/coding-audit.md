# Independent coding audit

Model: gpt-6.1-sol. Captured transport attempts: 8; valid raw usage: 8; unknown usage: 0.

Checks: 81 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 17874 | 0 | 17871 | 3 | 57 | — |
| 1 | 200 | 18756 | 17871 | 882 | 3 | 52 | 99.98% |
| 2 | 200 | 22199 | 18753 | 3443 | 3 | 73 | 99.98% |
| 3 | 200 | 22296 | 22196 | 97 | 3 | 158 | 99.99% |
| 4 | 200 | 22478 | 22293 | 182 | 3 | 54 | 99.99% |
| 5 | 200 | 22557 | 22475 | 79 | 3 | 105 | 99.99% |
| 6 | 200 | 23519 | 22554 | 962 | 3 | 51 | 99.99% |
| 7 | 200 | 24792 | 23516 | 1273 | 3 | 213 | 99.99% |

Input charge estimate: $0.07698630. Output charge estimate: $0.00763000.

Previous-input coverage below 95%: 0/7. Public eligible frontier fully reused: 7/7.

Follow-up input charges: $0.03230280; whole-prior-input counterfactual: $0.03226290 (1.0012×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
