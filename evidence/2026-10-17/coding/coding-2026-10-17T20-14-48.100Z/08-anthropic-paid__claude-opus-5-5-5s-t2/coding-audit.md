# Independent coding audit

Model: claude-opus-5-5. Captured transport attempts: 4; valid raw usage: 4; unknown usage: 0.

Checks: 44 PASS, 0 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 200 | 30187 | 1405 | 28778 | 4 | 89 | — |
| 1 | 200 | 35597 | 30183 | 5412 | 2 | 1021 | 99.99% |
| 2 | 200 | 36772 | 35595 | 1175 | 2 | 222 | 99.99% |
| 3 | 200 | 40148 | 36770 | 3376 | 2 | 834 | 99.99% |

Input charge estimate: $0.21453560. Output charge estimate: $0.04332000.

Previous-input coverage below 95%: 0/3. Public eligible frontier fully reused: 3/3.

Follow-up input charges: $0.07034860; whole-prior-input counterfactual: $0.07031620 (1.0005×). This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 0; changed source: src/csv.mjs, src/dedupe.mjs, src/money.mjs; immutable files checked: 10.


- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
