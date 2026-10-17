# Harness review decisions

Requested independent reviewers completed through the existing AGY CLI login, without modifying native CLI authentication or global settings:

- `claude-opus-5-5-high`, high effort.
- `gemini-4-argon-medium`, medium effort, including a review of the revised fresh-study harness.

Both reviewers challenged a provider-defect conclusion and emphasized actual context occupancy, meaningful task diversity, public cache-boundary uncertainty, and differences between native provider adapters. Raw historical review bundles/results are not retained in this checkout.

## Verified corrections

- Removed spending cutoffs throughout the application and coding request-count caps. Coding sessions finish naturally or reach their 20-minute session deadline.
- Tested deadline cancellation both before headers and during a stalled SSE response. Interrupted evidence is retained.
- Added configurable reasoning (high by default) and a 32,768-token response allowance.
- Replaced study-specific report prose with descriptive reports; removed automatic provider verdicts and hardcoded trial allocations.
- Kept account/model cells separate. Reports reject undeclared sessions and verify artifact hashes before trusting an audit. Valid completed observations survive a truncated final request.
- Added source/config/fixture hashes, Git commit/dirty state, Node version, and source snapshots to fresh batches. Pi package versions are read from installed metadata.
- Audits hash captured request bytes directly, check non-history wire settings as well as history, and retain absolute prior-input deficits.
- Included scripts in the normal TypeScript build checks.

## Reviewer suggestions that remain hypotheses or do not apply

- A near-fixed residual does not prove block quantization, cache eviction, or the location of an uncached segment.
- A public token-count endpoint can help measure supplied content, but it does not prove the provider's hidden cache eligibility or internal rendering.
- Gemini 4 Argon does not support explicit cache objects; an explicit-cache comparison cannot be silently substituted for its implicit API path. See [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon).
- Long-context surcharge assumptions must be checked against each exact model's current rate card, rather than inherited from another model.

## Still required for a useful study

The current ledger fixture is a small qualification workflow. A representative long-context arm with actual input around 250K tokens, pinned relevant public code, independent functional checks, and multiple tasks is still required. Preloaded source and organically accumulated sessions must be reported separately. No new measured result or provider conclusion is claimed here.
