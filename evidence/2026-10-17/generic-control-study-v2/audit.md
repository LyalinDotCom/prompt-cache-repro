# Independent validation audit — final batch snapshot

Snapshot: 2026-10-17T20:00:50.924Z. Audited 30/96 planned requests across 4/12 stage reports. Stop reason: SIGINT. Full allocation completed: false.

337 checks passed; 0 failed; 0 remain unknown. Counters, costs, hashes, history, and fixtures were recomputed independently of application normalizers and metrics.

| Scenario | Model | Gap | Valid followups | Any reads | Prior-input coverage <95% | Strict64 full | Eligible frontier full |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| replay | claude-opus-5-5 | 5s | 0 | 0/0 | 0/0 | 0/0 | 0/0 (unavailable) |
| replay | gpt-6.1-sol | 5s | 1 | 1/1 | 0/1 | 1/1 | 1/1 |
| replay | gemini-3.8-flash | 5s | 1 | 1/1 | 1/1 | 0/1 | 0/0 (unavailable) |
| replay | gemini-4-argon | 5s | 1 | 1/1 | 1/1 | 0/1 | 0/0 (unavailable) |
| append | claude-opus-5-5 | 5s | 0 | 0/0 | 0/0 | 0/0 | 0/0 (unavailable) |
| append | gpt-6.1-sol | 5s | 1 | 1/1 | 0/1 | 1/1 | 1/1 |
| append | gemini-3.8-flash | 5s | 1 | 0/1 | 1/1 | 0/1 | 0/0 (unavailable) |
| append | gemini-4-argon | 5s | 1 | 1/1 | 1/1 | 0/1 | 0/0 (unavailable) |
| perturb | claude-opus-5-5 | 5s | 0 | 0/0 | 0/0 | 0/0 | 0/0 (unavailable) |
| perturb | gpt-6.1-sol | 5s | 1 | 0/1 | 1/1 | 0/1 | 0/0 (unavailable) |
| perturb | gemini-3.8-flash | 5s | 1 | 0/1 | 1/1 | 0/1 | 0/0 (unavailable) |
| perturb | gemini-4-argon | 5s | 1 | 0/1 | 1/1 | 0/1 | 0/0 (unavailable) |
| agent | claude-opus-5-5 | 5s | 0 | 0/0 | 0/0 | 0/0 | 0/0 (unavailable) |
| agent | gemini-3.8-flash | 5s | 0 | 0/0 | 0/0 | 0/0 | 0/0 (unavailable) |
| agent | gemini-4-argon | 5s | 3 | 3/3 | 3/3 | 0/3 | 0/0 (unavailable) |

Eligible frontier means the preceding publicly reported reads plus writes for OpenAI/Anthropic. Gemini has no exposed implicit-write frontier. Strict64 is the secondary whole-prior-input heuristic; <95% is the preregistered descriptive shortfall threshold. First rows, rejected workloads and their next comparison, failed attempts, invalid agent continuations, and unavailable counters do not enter accepted-task follow-up denominators. Their usage-based charges remain in cost totals.

Observed invalid agent continuations: 1. Failed transport/API observations: 0.

## First-followup timing windows

| Model | Block | Gap | Actual idle ms | Read / prior input | Paired reference | Paired fixture |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| gemini-4-argon | 1 | 5s | 5002 | 84.89% | null | null |

These compare t0→t1 only. Reference and deterministic fixture pairing does not imply identical generated native history. Three seed blocks are small, correlated trajectory samples; no provider-wide hit probability or internal cache mechanism is established.

## Exceptions

No integrity-check failures in the available snapshot.

- QUALIFICATION: 0e77ca95-178f-4af8-b5ed-b5fc9e96747c/row-0/anthropic-paid::claude-opus-5-5/t0; rejected workload (cyber), excluded from accepted-task reuse comparisons.
- QUALIFICATION: 0e77ca95-178f-4af8-b5ed-b5fc9e96747c/row-1/anthropic-paid::claude-opus-5-5/t1; rejected workload (cyber), excluded from accepted-task reuse comparisons.
- QUALIFICATION: 93d61acc-6d61-44d8-bb48-08328d511cda/row-0/anthropic-paid::claude-opus-5-5/t0; rejected workload (cyber), excluded from accepted-task reuse comparisons.
- QUALIFICATION: a38627de-c268-4ec5-95aa-e2a03461e3b8/row-2/anthropic-paid::claude-opus-5-5/t0; rejected workload (cyber), excluded from accepted-task reuse comparisons.
- QUALIFICATION: a38627de-c268-4ec5-95aa-e2a03461e3b8/row-3/anthropic-paid::claude-opus-5-5/t1; rejected workload (cyber), excluded from accepted-task reuse comparisons.
- QUALIFICATION: 746cd808-fa78-4dcf-9723-d7d2e2e0e64a/row-0/anthropic-paid::claude-opus-5-5/t0; rejected workload (cyber), excluded from accepted-task reuse comparisons.

- HTTP attempt count is instrumentation evidence, not an external network trace.
- Eligible frontier is prior reported reads+writes for OpenAI/Anthropic only; Gemini implicit writes expose no corresponding frontier.
- First requests are warm-up allocations, not proven backend-cold requests.
- Timing uses first followups only; matching reference seed and fixture does not make independently generated native histories identical.
- Failed attempts and invalid continuations remain visible and are excluded from reuse denominators.
- Costs are usage-based estimates, not invoices. The all-prior-input baseline is a counterfactual, not a provider guarantee.

Machine-readable per-row derivations, exact hashes, denominator counts, and check results: [audit.json](audit.json).
