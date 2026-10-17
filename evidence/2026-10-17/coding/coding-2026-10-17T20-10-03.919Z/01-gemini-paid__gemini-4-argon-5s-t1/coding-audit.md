# Independent coding audit

Model: gemini-4-argon. Captured transport attempts: 0; valid raw usage: 0; unknown usage: 0.

Checks: 4 PASS, 4 FAIL, 0 UNKNOWN. Model final text is never used as proof of a patch or passing tests.

| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

Input charge estimate: $0.00000000. Output charge estimate: $0.00000000.

Previous-input coverage below 95%: 0/0. Public eligible frontier fully reused: 0/0 (implicit-write frontier unavailable).

Follow-up input charges: $0.00000000; whole-prior-input counterfactual: unavailable. This counterfactual is separate from an eligible-cache guarantee.

## Functional qualification

Baseline exit: 1; final exit: 1; changed source: none; immutable files checked: 10.

- FAIL actual-final-process-passed: functional; 1
- FAIL final-test-output-shows-pass-and-zero-failures: functional; ""
- FAIL actual-source-edit-present: functional; []
- FAIL actual-source-diff-present: functional; ""

- Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.
- Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.
- Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.
- A patch and passing tests establish this task result, not general coding quality.
- A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.

Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).
