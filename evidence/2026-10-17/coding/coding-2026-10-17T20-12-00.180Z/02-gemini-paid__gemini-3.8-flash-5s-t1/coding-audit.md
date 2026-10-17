# Independent coding audit

Model: gemini-3.8-flash. Captured transport attempts: 8; valid raw usage: 8; unknown usage: 0.

Checks: 86 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 21289 | 0 | 0 | 21289 | 27 | — |
| 1 | 200 | 25617 | 21289 | 0 | 4328 | 112 | 100.00% |
| 2 | 200 | 25756 | 23563 | 0 | 2193 | 445 | 91.98% |
| 3 | 200 | 26228 | 23703 | 0 | 2525 | 81 | 92.03% |
| 4 | 200 | 26337 | 24175 | 0 | 2162 | 27 | 92.17% |
| 5 | 200 | 27436 | 24288 | 0 | 3148 | 57 | 92.22% |
| 6 | 200 | 28996 | 25389 | 0 | 3607 | 20 | 92.54% |
| 7 | 200 | 30087 | 26948 | 0 | 3139 | 545 | 92.94% |

Input charge estimate: $0.04449488. Output charge estimate: $0.00492750.

Previous-input coverage below 95%: 6/7. Public eligible frontier fully reused: 0/0 (implicit-write frontier unavailable).

Follow-up input charges: $0.02852813; whole-prior-input counterfactual: $0.02022292 (1.4107×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
