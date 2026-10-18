# Current verified coding pilot evidence

Read the [short findings and limitations](../../docs/LATEST_RESULTS.md) first. This directory contains one current study: the registered confirmation and one explicit Opus transport-failure replacement. Initial failures remain visible. Excluded calibration is kept only in private Git history.

- `metrics.json`: account/model/session outcomes and weighted counters, including every failed attempt.
- `turns.csv`: every captured attempt, raw-usage validity, token counters, prior-input shortfalls, actual timing, status and errors.
- `confirmation.tar.gz`, `transport-recovery.tar.gz`: complete frozen evidence, each with its own batch summaries, audits, original workspaces, clean library-only replays and source snapshots.
- Cohort-prefixed JSON/CSV files: convenient copies of the original batch summaries; combined results are in `metrics.json`.
- `analysis.py`: standard-library-only, offline report assembly and stricter artifact/acceptance verification. Its source hash is retained in `metrics.json`.
- `archives.json` and `SHA256SUMS`: archive provenance and file integrity.

From the repository root, verify and rebuild without keys or API calls:

```sh
(cd results/latest && shasum -a 256 -c SHA256SUMS)
study_dir=$(mktemp -d)
tar -xzf results/latest/confirmation.tar.gz -C "$study_dir"
tar -xzf results/latest/transport-recovery.tar.gz -C "$study_dir"
python3 results/latest/analysis.py "$study_dir/confirmation" "$study_dir/transport-recovery" "$study_dir/rebuilt"
```

The rebuilt `metrics.json` and `turns.csv` should be byte-identical to the files here. To reconstruct a per-request audit, use the **frozen auditor inside its archive**, for example:

```sh
node --import tsx "$study_dir/confirmation/harness-source/scripts/audit-coding.ts" "$study_dir/confirmation/07-gemini-paid__gemini-4-argon-coding-csv-parse-30s-t1"
```

Audit generation time and local extraction paths change on a rebuild; the underlying usage and check results should agree. Archive hashes bind the originally retained evidence. No native CLI authentication or settings are needed for offline analysis.
