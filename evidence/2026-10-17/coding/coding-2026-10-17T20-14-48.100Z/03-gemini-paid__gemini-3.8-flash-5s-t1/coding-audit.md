# Independent coding audit

Model: gemini-3.8-flash. Captured transport attempts: 12; valid raw usage: 12; unknown usage: 0.

Checks: 126 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 21283 | 0 | 0 | 21283 | 27 | — |
| 1 | 200 | 25618 | 21283 | 0 | 4335 | 29 | 100.00% |
| 2 | 200 | 26741 | 23566 | 0 | 3175 | 28 | 91.99% |
| 3 | 200 | 27415 | 24689 | 0 | 2726 | 29 | 92.33% |
| 4 | 200 | 28106 | 25363 | 0 | 2743 | 28 | 92.52% |
| 5 | 200 | 28970 | 26056 | 0 | 2914 | 112 | 92.71% |
| 6 | 200 | 29109 | 26918 | 0 | 2191 | 81 | 92.92% |
| 7 | 200 | 29218 | 27058 | 0 | 2160 | 441 | 92.95% |
| 8 | 200 | 29686 | 27169 | 0 | 2517 | 21 | 92.99% |
| 9 | 200 | 30772 | 27640 | 0 | 3132 | 27 | 93.11% |
| 10 | 200 | 31874 | 28727 | 0 | 3147 | 57 | 93.35% |
| 11 | 200 | 33434 | 29831 | 0 | 3603 | 589 | 93.59% |

Input charge estimate: $0.06206700. Output charge estimate: $0.00550875.

Previous-input coverage below 95%: 10/11. Public eligible frontier fully reused: 0/0 (implicit-write frontier unavailable).

Follow-up input charges: $0.04610475; whole-prior-input counterfactual: $0.03227265 (1.4286×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
