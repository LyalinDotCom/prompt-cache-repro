# Coding-agent validation protocol

Registered October 17, 2026, before the first coding-agent API request.

The operator clarified that a useful test must exercise a coding agent working on code and producing a verified result. The generic reference-manual study was stopped after 30 attempts. Its evidence remains diagnostic control data; it does not qualify as a coding-agent reproduction.

## Acceptance bar

Use an actual Pi coding-agent session against a disposable copy of a dependency-free JavaScript invoice-import repository. Start every trial from the same buggy source. The task requires reading source, fixing actual defects, and running the repository's tests. Include a snapshot of real repository source and tests in the initial context so the cache experiment concerns substantial code context, rather than unrelated filler.

A qualified trajectory must retain:

- The original repository hashes and actual failing baseline test output.
- Native tool calls, returned file contents, edits, and actual test output.
- The final patch, unchanged test hashes, and independently executed passing final tests.
- Every HTTP request's serialized body, raw response stream, provider usage, model ID, endpoint, timing, and outcome.

Natural agent completion determines task completion. Request and time limits stop incomplete tasks; they do not manufacture extra tool calls. A task that fails, refuses, changes the tests, or exceeds its limits remains in the report and does not count as a successful coding qualification.

## First allocation

First qualify one trial on each requested model: `gemini-4-argon`, `gemini-3.8-flash`, `gpt-6.1-sol`, and `claude-opus-5-5`, using the supplied paid API keys. Start with Argon and GPT to establish a working coding comparison quickly. Each model receives the same issue, initial files, and source snapshot. Responses, tool choices, patches, and task lengths can differ and must remain visible.

Use low reasoning effort, up to 4,096 output tokens per request, at most 12 API requests and eight minutes per task, and a five-second minimum response-completion-to-next-request gap. Disable Pi retries, provider retries, compaction, and proactive cache warming. Count every HTTP attempt, including any unexpected auxiliary request. Preserve Pi/package versions and all effective model settings. No fallback models or authentication routes.

The first four tasks share a $5 known observed-spend soft stop and a 30-minute deadline. These are local guards, not provider billing caps. Stop and report qualification failures before launching a larger sweep.

## Interpretation

The primary question is whether substantial prior coding context is reused during successful real coding work. Decode raw provider usage independently and report actual input/read/write/ordinary partitions, cached reads relative to prior input, cacheable frontiers where publicly exposed, and individual trajectories. A strict previous-total-input threshold remains a secondary heuristic. Costs are dated usage estimates with explicit counterfactual assumptions, never verified invoices.

Qualification establishes that the measurement concerns functioning coding work. One task per model cannot establish a provider-wide rate or Theo's exact 167/228 result. Once qualified, register repeated independent tasks and controlled timing experiments before running them. Report successful and unsuccessful trials together. A well-qualified failure to reproduce a criticism is evidence under the tested conditions; do not tune the task to obtain a preferred result.

Pi's public-API route is the primary representative coding-agent arm. Native Codex, Claude Code, and AGY runs are useful separate application checks when their model, authentication route, retries, and request accounting can be established. Subscription and paid API observations must remain labeled separately.
