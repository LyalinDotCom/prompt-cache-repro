# Independent coding audit

Model: claude-opus-5-5. Captured transport attempts: 6; valid raw usage: 6; unknown usage: 0.

Checks: 62 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 30068 | 0 | 30064 | 4 | 125 | — |
| 1 | 200 | 30245 | 30064 | 179 | 2 | 80 | 99.99% |
| 2 | 200 | 35646 | 30243 | 5401 | 2 | 893 | 99.99% |
| 3 | 200 | 36693 | 35644 | 1047 | 2 | 240 | 99.99% |
| 4 | 200 | 37069 | 36691 | 376 | 2 | 80 | 99.99% |
| 5 | 200 | 38598 | 37067 | 1529 | 2 | 683 | 99.99% |

Input charge estimate: $0.22697780. Output charge estimate: $0.04202000.

Previous-input coverage below 95%: 0/5. Public eligible frontier fully reused: 5/5.

Follow-up input charges: $0.07664180; whole-prior-input counterfactual: $0.07659420 (1.0006×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
