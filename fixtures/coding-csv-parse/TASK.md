# Repair a CSV library regression

The CSV parser silently drops the final record when a feed ends without a trailing record delimiter. Sync and chunked streaming input are affected; quoted and trailing empty final fields must work.

Inspect README.md, the actual library source under src/upstream and relevant regression tests. Run `node --test test/*.test.mjs` before editing, fix the library source, then run the same complete test command and `node bin/check.mjs`. Use real tools. Do not change test/data/reference/manifests or install packages. The complete selected upstream source snapshot is provided as a controlled large-context workload; use it as repository context. It is not an organic native-CLI session. Finish naturally with a brief account of the actual fix and commands/results.
