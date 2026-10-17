# Fix incorrect invoice import and reconciliation

Finance has found linked regressions in the importer: the last invoice can disappear from a feed, half-cent amounts can round incorrectly (including credit notes), and two unrelated suppliers sharing an invoice number can be treated as a conflict. These issues also affect reconciliation totals and the CLI exit status.

Implement the smallest credible source fixes that restore the documented data contract. Keep the architecture and CLI interface intact. You may edit `src/` and `bin/` source files only. Do not change tests, fixture data, README.md, TASK.md, or package.json; those are immutable acceptance material.

Before editing, read README.md and inspect all source modules under `src/` and `bin/` so you understand the complete import/reconciliation path. Read relevant regression tests. Run `node --test test/*.test.mjs` to reproduce the actual baseline failures. Implement the source fix and run the same complete test command again. Also run `node bin/ledger.mjs import data/invoices.csv --payments data/payments.csv --as-of 2026-03-01 --format json` and inspect its real output.

Acceptance rules:

1. End-of-file is a valid CSV record terminator, including a quoted final field or trailing empty field. Existing newline-terminated behavior must not add phantom records.
2. Decimal amounts with up to four fractional digits round half away from zero to cents. Do not use a floating-point adjustment or hard-coded example lookup; preserve safe-integer and format validation.
3. Invoice identity must be scoped by vendor and collision-safe for arbitrary printable identifiers. Exact repeats within one vendor still collapse; conflicts within one vendor retain the first occurrence and remain diagnosed. Payment routing must use the same rule.
4. The complete immutable test suite passes and the mixed feed imports all four invoices. Preserve currency totals, source-record evidence, status handling, and explicit payment allocation.

Finish with a brief explanation of changes, commands run, and their actual results. Do not commit, access the network, install dependencies, or inspect anything outside this repository.
