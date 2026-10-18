# CSV pipeline regression workspace

This fixture vendors executable library source plus tests/examples/documentation from the pinned public node-csv monorepo. See UPSTREAM.json and UPSTREAM_LICENSE. `src/upstream/packages/*/lib` holds executable modules; `reference/upstream` is immutable upstream context, not the executable acceptance suite. No dependency install is required. Acceptance tests are the Node tests in `test/`.

Repair the reported regression in the library implementation rather than special-casing test inputs or changing expectations. Keep unrelated behavior intact. Only src/ and bin/ may change. Tests, data, manifests and reference material are immutable.

Commands: `node --test test/*.test.mjs` and `node bin/check.mjs`.
