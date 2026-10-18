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
- Pinned two real CSV-library regressions and 41 executable acceptance tests. Both seeded baselines have exact declared failing counts; restoring pinned upstream code passes all 41 tests and the pipeline CLI.
- Restricted CSV writes to library modules. The test adapter and CLI verifier are immutable. A separate verifier replays only library edits in a clean fixture with the original acceptance code.
- Matched assistant turns to captured HTTP attempts and required at least one actual request. Interrupted terminal telemetry remains unknown without erasing preceding complete responses.
- Replaced Pi's stale GPT context capacity in memory with the documented public API capacity, so the fixed output allowance is preserved at 250K+ input. Native CLI settings remain untouched.
- Set common 30-second spacing after calibration exposed Flash quota errors at five seconds. Those attempts are not pooled into the matched confirmation.
- Added actual 250K+ follow-up denominators to reports, raw-byte artifact hashes, and portable workspace auditing.

## Reviewer suggestions that remain hypotheses or do not apply

- A near-fixed residual does not prove block quantization, cache eviction, or the location of an uncached segment.
- A public token-count endpoint can help measure supplied content, but it does not prove the provider's hidden cache eligibility or internal rendering.
- Gemini 4 Argon does not support explicit cache objects; an explicit-cache comparison cannot be silently substituted for its implicit API path. See [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon).
- Long-context surcharge assumptions must be checked against each exact model's current rate card, rather than inherited from another model.
- A reviewer asserted that OpenAI has no cache-write counter or write premium. That advice was rejected: the current GPT-6.1 Sol documentation and captured responses expose `input_tokens_details.cache_write_tokens`, and its rate card prices writes separately. Missing counters must not be fabricated as zero.

## Scope after the long-context revision

The ledger fixture remains a small qualification workflow. The registered long-context arm uses two seeded repairs in one public repository, with the selected source preloaded once. Its results are a controlled pilot, not evidence about the frequency of failures across coding agents. Organically accumulated long histories, more repositories, repeated independent sessions, and account-tier comparisons remain separate follow-up experiments. Review agreement does not validate a result; retained raw evidence, executable repairs, and independent checks do.

## Confirmation close-out review

Both exact reviewers completed a second source review after the major corrections. Both allowed publication as a limited descriptive source-preload pilot, with no internal-cause or provider-wide claim. Their additional findings were handled as follows:

- Reproduced the cancellation-during-idle-gap bug with real Pi and an offline transport: two captured responses could produce a third aborted assistant turn before another HTTP dispatch. The audit now records that final uncertainty as UNKNOWN, preserves earlier valid usage, and still rejects an unexplained extra successful turn. An end-to-end regression runs both the auditor and summarizer. Final messages are saved even if the agent throws.
- Bound replay patches to the recorded final hashes, recomputed changes from before/after maps, detected non-library edits, handled library deletions, matched the fixture’s declared test count, ignored Finder metadata consistently, and made replay automatic for future coding runs. Repair outcome and natural completion are reported separately. The current pilot’s independent assembly additionally checked full replay contents and bindings against the frozen artifacts; all eight patches restored pinned upstream files exactly.
- Added declared wire-output allowance checks, guarded invalid predecessors in the auditor, used declared mutability over added/deleted paths, required the whole final suite with no skips, and added per-session context/coverage to generated reports.
- The exact current executed adapter imports are relative paths; no CSV packages are installed in parent node_modules. The parent-package-resolution concern does not affect these tasks. Arbitrary dependency-bearing repositories need their own environment validation.
- Kept conservative whole-session exclusion for actual integrity failures, with explicit report text. No measured response in this pilot was excluded that way. A missing final aborted inference is now uncertainty, not an integrity failure.
- Rejected hashing only redacted request text as proof of original wire bytes. If redaction changes a body, original-wire integrity must fail. A literal scan found no supplied credentials in the retained pilot evidence.

The experiment remains frozen at `fda0dec`. Later offline validation and future-run harness fixes are identified separately and do not rewrite its source snapshots, raw responses, original audits, or replay artifacts. Archive extraction reproduced `metrics.json` and `turns.csv` byte-for-byte without credentials or API calls.

A focused re-review by both exact reviewers accepted the main fixes. Opus identified cleanup that could fail before restoring global fetch and an overall 30-second replay timeout; message/disposal errors are now caught before restoration, and replay has no batch deadline (individual fixture subprocess limits remain). Required fixture specs replace legacy fallbacks. The manifest already records the verifier source hash, including in the frozen cohort. Running the updated auditor and summarizer offline on scratch copies preserved all eight verified repairs, all 50 qualifying follow-ups, and every model aggregate. Tampered workspace patches and tampered replay bindings were rejected. Final validation: 106 tests, TypeScript/build, byte-identical archive reanalysis, and the visible results link in the browser.
