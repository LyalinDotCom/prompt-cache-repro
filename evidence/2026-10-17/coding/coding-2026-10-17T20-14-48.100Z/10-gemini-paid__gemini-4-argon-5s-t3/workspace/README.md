# Coding Ledger

Coding Ledger imports supplier invoice CSV files into an integer-cent ledger, detects duplicate or conflicting imports, and optionally reconciles payment files. It is a small, dependency-free accounting utility. Every public result includes the source record number so discrepancies can be traced back to a vendor feed.

Requires Node 22 or newer. There are no packages to install and no network calls.

```sh
node --test test/*.test.mjs
node bin/ledger.mjs import data/invoices.csv --format json
node bin/ledger.mjs import data/invoices.csv --payments data/payments.csv --as-of 2026-03-01
node bin/ledger.mjs schema invoice
```

## Data contract

Invoice columns are `vendor_id,invoice_id,issued_on,due_on,currency,amount,status,description`. The required subset is vendor, invoice, issue date, currency, and amount. Optional due dates default to 30 days after issue; status defaults to `open`; description defaults to empty. Header aliases are declared centrally in `src/schema.mjs`. Unsupported columns are rejected rather than silently ignored.

Amounts are signed decimal major units with up to four fractional digits. Convert them to cents by rounding half away from zero; credits follow the same symmetric rule as invoices. Once parsed, all monetary operations use safe integer cents. Currencies are never mixed or implicitly converted. Date-only values use the ISO calendar and UTC arithmetic.

An invoice number is unique only within its supplier. Vendor identifiers are case-sensitive and trimmed. Invoice identifiers are trimmed and normalized to uppercase. Exact repeated financial rows collapse into one entry; a conflicting row for an existing supplier/invoice identity is diagnosed and the first occurrence retained. Descriptions are not part of financial duplicate identity, so an explanatory wording change does not change totals.

CSV records may end at a newline or at end-of-file. Quoted fields support embedded commas, doubled quotes, and embedded newlines. A final line ending is optional. Empty source records are ignored by the import pipeline. Ragged records become diagnostics instead of being silently truncated.

## Architecture

- `csv.mjs` is a record scanner and writer, independent of accounting semantics.
- `schema.mjs` normalizes headers and validates file shape.
- `validation.mjs` normalizes fields, dates, statuses, currencies, and amounts, collecting all row errors.
- `money.mjs` implements cent parsing, safe arithmetic, formatting, basis points, and deterministic allocation.
- `dates.mjs` provides calendar arithmetic and aging buckets.
- `dedupe.mjs` defines invoice/payment identities and conflict handling.
- `pipeline.mjs` parses and validates whole files before deduplication and report selection.
- `payments.mjs` allocates explicit supplier/invoice payments without currency conversion.
- `ledger.mjs` groups totals, vendors, months, and aging without mutating imported rows.
- `reports.mjs` serializes normalized public records and diagnostics.
- `bin/ledger.mjs` handles argument parsing, file reads, output streams, and exit codes.

Report selection happens after validation and deduplication so filtering cannot conceal malformed or conflicting imports. Payment allocations preserve overpayments as negative outstanding amounts and report unknown invoices, currency mismatches, and post-cutoff payments separately. Paid/void status invoices and credit notes do not absorb new payments.

## Exit and output behavior

The CLI exits 0 after a clean import, 1 for invalid arguments or unreadable/invalid files, and 2 when row conflicts, invalid rows, or unapplied payments remain. Reports are emitted to stdout; curated operational errors go to stderr. JSON output has `schema_version: 1`. The CSV report exports canonical invoice columns plus the source record number; it is an audit export, not a supported re-import format.

Tests exercise the scanner, monetary boundary cases, validation, duplicate identities, payment routing, report totals, and actual CLI subprocess behavior. The supplied vendor feed demonstrates the regressions described in `TASK.md`.
