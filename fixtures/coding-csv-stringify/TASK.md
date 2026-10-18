# Repair a CSV library regression

The CSV stringifier emits unquoted delimiter-containing fields. Round trips change the number of columns or throw; custom and multi-byte delimiters must be handled as well as commas.

Inspect README.md, the actual library source under src/upstream and relevant regression tests. Run `node --test test/*.test.mjs` before editing, fix the library source, then run the same complete test command and `node bin/check.mjs`. Use real tools. Do not change test/data/reference/manifests or install packages. The complete selected upstream source snapshot is provided as a controlled large-context workload; use it as repository context. It is not an organic native-CLI session. Finish naturally with a brief account of the actual fix and commands/results.
