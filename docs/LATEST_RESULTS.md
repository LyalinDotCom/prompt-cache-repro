# Gemini prompt cache findings

**We reproduced a specific small-context caching problem in Flash 3.8:** growing conversations had no cache reads below the proposed 16K boundary, while identical prompts around 8K reused the cache. In the sampled growing trajectories, reads appeared only after the preceding request exceeded 16,384 tokens. Argon showed a different pattern: roughly 2K-token read shortfalls on small additions, with full prior-input reads on larger additions. These are observed public API behaviors; they do not establish an internal routing or eviction cause.

The 18 October focused study and qualification made **105 HTTP attempts**. Estimated cost from reported usage was **$1.07** ($0.9059 focused study + $0.1679 qualification), including refused responses. This is a rate-card estimate, not an invoice; the five quota-error responses supplied no billable usage. The large proposed grid was not run.

## What engineering should know

> In a controlled direct-API test, Flash 3.8 reported zero cached tokens on 18/18 growing-history follow-ups whose preceding input was below 16,384 tokens, and cache reads on 3/3 above it. Identical approximately 8K replay requests had cache reads on 14/14 follow-ups across two trials. The first request crossing 16K still missed; reuse appeared on the following request. These samples are consistent with the proposed 16,384-token boundary, but do not pinpoint its exact location. Native history and identical replay bodies were checked against captured HTTP JSON. Argon had a consistent 2,049-token shortfall on six successful small-growth follow-ups, versus reads one token above preceding input on four large-growth follow-ups. There are 29 zero-read Gemini follow-up response IDs in the evidence for investigation. This is a small screening study, with five Argon quota errors and no usable Opus control.

## How this relates to Theo

The data now supports **a concrete, reproducible caching criticism for growing small-context Flash conversations**. The earlier 250K+ coding pilot could not expose this range. High token reuse at 320K did not establish that small coding conversations would behave similarly.

We have **not reproduced Theo’s exact benchmark, full-hit definition, failure frequency, or total-session cost headline**. His executable methodology was not located in the [public GitHub review](THEO_GITHUB_REVIEW.md). “Theo/AA regime” below names the supplied hypothesis, not a claim of independently matching either organization’s protocol. A universal claim that Gemini never caches below 16K is also too broad: Flash’s identical 8K replay requests did get cache reads, and Argon reused input in its successful small-growth arm.

## Cost impact in this study

The multiplier compares **follow-up input cost** with a hypothetical baseline in which all preceding input is reusable. It excludes the initial request and output cost, and does not prove every prior token was eligible for caching. It is not a multiplier for a complete coding bill.

| Completed arm | Follow-up input multiplier | Interpretation |
| --- | ---: | --- |
| Flash, 8K identical replay, two trials | 3.30× | Reused most input, with a 2,042-token shortfall on every follow-up. |
| Flash, 8K start, growing messages near 1.5K per turn, two trials | 4.41× | Most follow-ups had zero reads before the threshold was crossed. |
| Argon, 8K start, small tool-result additions near 600 tokens | 2.84× | Four follow-ups had a 2,049-token shortfall. |
| Argon, 8K start, additions near 3K tokens | 1.00× | All four follow-ups read the preceding input in full. |

The supplied estimate of a 1.15–1.25× small-delta penalty did **not** hold for this input-only baseline. A 25% uncached token share is not merely 25% extra input cost: Gemini’s cached tokens are priced at a large discount. For identical replay, the ratio is `1 + uncached_share × (ordinary_rate / cached_rate − 1)`. Actual output and fresh-content costs change the multiplier for a full session. Prices and definitions were held fixed across arms.

## Checks against the supplied predictions

| Prediction | Result |
| --- | --- |
| Flash growing history behaves differently from identical 8K replay, around a 16,384-token threshold. | **Supported in the sampled trajectories, with a correction:** reuse tracked the preceding request’s size. All three first-crossing requests still had zero reads. The repeated append arm and the native tool-loop arm both showed this distinction. |
| Gemini has a practical floor around 6K. | **Unresolved.** Both models had zero reads on two replay follow-ups around 4,053–4,055 input tokens. Those inputs are below the configured documented 4,096 minimum, so this does not establish a separate 6K floor. |
| Argon small additions fail strict64 but pass strict2100; large additions pass strict64. | **Supported where measured.** Six successful small-growth follow-ups had a deficit of 2,049; four large-growth follow-ups had a deficit of −1. Quota failures prevented complete Argon growing-history replication. The proposed small cost penalty was not supported. |
| A larger starting prefix reduces the cost multiplier. | **Observed in a matched first-two-follow-up comparison:** Argon 2.90× at 8K versus 1.87× at 32K, for the 600-token target. Flash fell from 6.25× to 1.48×, but that comparison mixes threshold behavior with the residual shortfall and does not isolate a fixed-tail cause. |
| Misses increase at 120/300-second gaps. | **Not tested.** Every focused cell used a five-second gap. No eviction or TTL conclusion follows. |

## Attempt accounting and controls

The focused allocation planned 134 requests across 18 arms. **97 were attempted: 92 complete HTTP responses and five HTTP 429 quota errors.** Thirty-seven planned requests were never sent after trajectories stopped on a refusal or error; there was no retry or replacement. Four arms were incomplete: Argon’s 1.5K tool loop, growing-message and replay arms, plus Opus’s tool loop. Fourteen arms reached their planned request counts; that includes the all-refused Opus replay arm, which is not a successful task control. All planned independent trials were attempted.

Opus refused all four focused requests and both qualification requests. These six refusals remain in evidence and estimated costs, but are excluded from comparable hit and multiplier statistics. We have not diagnosed why it refused this synthetic workload.

GPT’s growing-history strict64 score was 0/7 because 132 ordinary input tokens lay outside its reported read/write frontier. Its boundary-aware comparison matched on **7/7** follow-ups with a **1.000×** input multiplier. Its replay matched within 64 tokens on **2/2** follow-ups. This illustrates why a strict prior-input count mismatch alone does not prove cache loss. Gemini does not expose the equivalent cache-write frontier, so that comparison remains unknown there.

All five 429s belong to Argon: one in the tool loop, two in growing messages, and two in replay. They are **errors, not zero-cache observations**. The study exited nonzero because those trajectories and the Opus tool loop were incomplete. The eight qualification calls are retained separately and never pooled into the focused cell rates.

## What the large-context coding pilot established

The earlier study remains useful: all eight repairs passed 41 immutable acceptance tests, the pipeline CLI, and a clean library-only replay, with 255K–387K actual input tokens. In Argon’s nine follow-ups, all five reported input increases of at least 2,050 tokens had a deficit of −1; all four smaller increases had a deficit of exactly 2,049. The new small/large-delta arms reproduce that counter pattern at much smaller context sizes. It does **not** establish which tokens were eligible, that a particular tail is always re-prefilled internally, or the exact cache floor. [Coding evidence and reproduction instructions](../results/latest/README.md).

## Evidence and limits

The [registered protocol](SMALL_CONTEXT_PROTOCOL.md) preceded the focused run. The frozen API harness source is [322d962](https://github.com/LyalinDotCom/prompt-cache-repro/tree/322d9624c820ae8430cde091dd21dce837cea4fe); qualification used 645ec07, with the same API adapter/core. Actual installed SDK versions were Google 2.30.0, OpenAI 7.36.0 and Anthropic 0.135.0. These adapters used nonstreaming JSON; raw HTTP bodies and allowlisted response headers are retained, not an SSE stream.

Independent offline checks rederived usage, costs and strict64 classifications from raw responses, verified single HTTP attempts, unchanged prior messages, native signed/encrypted history, replay body identity and minimum gaps. The checker accepted original evidence and rejected altered usage, strict-hit classification, signatures and replay bodies. See the [evidence archive, checksums and offline analysis](../results/small-context/README.md), [per-turn CSV](../results/small-context/turns.csv), [cell CSV](../results/small-context/cells.csv), and [29 hard-miss response IDs](../results/small-context/hard-misses.csv).

These are synthetic reference-record API conversations, not additional coding repairs or long native-agent sessions. There is one supplied paid key per provider, only two independent trials for the primary replay/append arms, and one for the other arms. Turns within a trial are correlated. Quota errors reduce Argon coverage, and Opus provides no usable comparison. The observations support engineering investigation of the specific Flash pattern; they do not establish provider-wide miss rates, an internal routing/eviction mechanism, or total-session cost impact.

## Small-context sweep (Theo/AA regime)

Focused screening allocation: **97/134 planned requests attempted**, 14/18 arms completed. Estimated observed API cost: **$0.9059**, excluding the separately retained eight-call qualification. Audit failures: 0.

These are synthetic direct-API cache diagnostics, not additional coding repairs. All cells below use a five-second gap. Sizes/deltas in the labels are targets; the actual input range is measured. Refusal responses remain in evidence and costs but are excluded from comparable rates.

| Model | Scenario | Prefix / delta target | Actual input range | Attempts / plan (errors) | Follow-ups / strict n | Input cost multiplier | Strict64 | Strict2100 | Any hit | Weighted cache share | Reusable capture | Hard misses | Refusals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gemini-4-argon | agent | 8000 / 3000 | 8086–19984 | 5 / 5 (0) | 4 / 4 | 1.000× | 100.0% | 100.0% | 100.0% | 80.8% | 100.0% | 0 | 0 |
| gemini-3.8-flash | agent | 8000 / 1500 | 8066–18436 | 8 / 8 (0) | 7 / 7 | 4.420× | 0.0% | 14.3% | 14.3% | 15.2% | 17.0% | 6 | 0 |
| gemini-4-argon | replay | 4000 / 0 | 4053–4053 | 3 / 3 (0) | 2 / 0 | unknown | unknown | unknown | 0.0% | 0.0% | unknown | 2 | 0 |
| claude-opus-5-5 | replay | 8000 / 0 | 10409–10409 | 3 / 3 (0) | 0 / 0 | unknown | unknown | unknown | unknown | unknown | unknown | 0 | 3 |
| gemini-3.8-flash | agent | 32000 / 600 | 32181–33375 | 3 / 3 (0) | 2 / 2 | 1.481× | 0.0% | 100.0% | 100.0% | 92.0% | 93.7% | 0 | 0 |
| gpt-6.1-sol | agent | 8000 / 1500 | 6888–15826 | 8 / 8 (0) | 7 / 7 | 1.059× | 0.0% | 100.0% | 100.0% | 88.3% | 98.8% | 0 | 0 |
| gemini-4-argon | agent | 32000 / 600 | 32195–33406 | 3 / 3 (0) | 2 / 2 | 1.873× | 0.0% | 100.0% | 100.0% | 92.0% | 93.7% | 0 | 0 |
| gemini-3.8-flash | replay | 8000 / 0 | 7990–7999 | 16 / 16 (0) | 14 / 14 | 3.299× | 0.0% | 100.0% | 100.0% | 74.5% | 74.5% | 0 | 0 |
| gemini-3.8-flash | append | 8000 / 1500 | 7983–18258 | 16 / 16 (0) | 14 / 14 | 4.414× | 0.0% | 14.3% | 14.3% | 15.3% | 17.2% | 12 | 0 |
| gemini-4-argon | agent | 8000 / 600 | 8083–10512 | 5 / 5 (0) | 4 / 4 | 2.842× | 0.0% | 100.0% | 100.0% | 72.3% | 77.2% | 0 | 0 |
| gemini-4-argon | agent | 8000 / 1500 | 8068–8068 | 2 / 8 (1) | 0 / 0 | unknown | unknown | unknown | unknown | unknown | unknown | 0 | 0 |
| gemini-3.8-flash | agent | 8000 / 600 | 8058–10451 | 5 / 5 (0) | 4 / 4 | 6.395× | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 4 | 0 |
| gemini-3.8-flash | replay | 4000 / 0 | 4055–4055 | 3 / 3 (0) | 2 / 0 | unknown | unknown | unknown | 0.0% | 0.0% | unknown | 2 | 0 |
| gemini-4-argon | append | 8000 / 1500 | 7971–7990 | 4 / 16 (2) | 0 / 0 | unknown | unknown | unknown | unknown | unknown | unknown | 0 | 0 |
| gemini-3.8-flash | agent | 8000 / 3000 | 8047–19921 | 5 / 5 (0) | 4 / 4 | 2.762× | 25.0% | 25.0% | 25.0% | 27.4% | 33.9% | 3 | 0 |
| gpt-6.1-sol | replay | 8000 / 0 | 6743–6743 | 3 / 3 (0) | 2 / 2 | 1.008× | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| gemini-4-argon | replay | 8000 / 0 | 7989–7989 | 4 / 16 (2) | 1 / 1 | 5.873× | 0.0% | 100.0% | 100.0% | 74.4% | 74.4% | 0 | 0 |
| claude-opus-5-5 | agent | 8000 / 1500 | 10894–10894 | 1 / 8 (0) | 0 / 0 | unknown | unknown | unknown | unknown | unknown | unknown | 0 | 1 |

Multiplier = measured follow-up input cost / theoretical perfect-prior-input-reuse input cost, under frozen rate cards. Initial and output costs are excluded from that ratio. It is not a provider invoice or proof of eligible cache loss. Strict2100 is a separate sensitivity analysis; strict64 remains unchanged.

Hard-miss follow-ups: **29**. Full IDs, exact inputs, trial/turn, model, hash and timing are in [hard-misses.csv](../results/small-context/hard-misses.csv).

### Hard-miss request lookup list

These are successful follow-up responses with zero reported cached reads, including protocol-default zero decoding where Google omitted the scalar. Initial requests and quota errors are excluded. Full context and timing accompany each ID in the CSV.

**gemini-3.8-flash: 27 IDs**

```text
zxvVauqUJKKNytMP_qfQ6AM
1hvVau7NGKGiytMPxvHbyQM
3RvVatStAqLgytMPsanSwA8
4xvVaqnCLID7ytMPxcLviAs
6hvVau6NDOOH1sgPh4vfyQM
8BvVar74L8GjytMPqKWpmAs
uBzVavGtE6GiytMPxvHbyQM
vhzVaq_FJajhytMPu_fluA8
xRzVaoqyEtCHytMPs_zywQM
yxzVapqFIt6C1sgPhaGRmQs
0hzVaoqRC8WKytMPu7-PmAs
2BzVateJL8_gytMP4YLv2A8
6BzVaoiQHZfmytMP0Pv4iAs
7hzVau-aNfuD1sgP4KXV8AM
9RzVaprFCcG_ytMP0JPTkAs
_BzVaprtD6f_ytMPgdeDkAs
Ah3Vau6IOt7hytMP4qidkQs
CR3VavLAG4ndytMPh9X4iA4
Wx3Vau_LCcG_ytMP0JPTkAs
YR3VavHrKcGjytMPqKWpmAs
aB3Var1zid3K0w-H1fiIDg
bh3VarGfIcuMytMPvPfM2Qo
dx3VaqPOC8GjytMPqKWpmAs
fR3VapP-J9KOytMP1abx6QI
lh3VarKhAquvytMP49SGkAs
nR3Var6YC4_hytMP3KX0wAM
ox3Vat6oKY3ZytMP75_zmAs
```

**gemini-4-argon: 2 IDs**

```text
BhzVauTVIfK_uMYP-qyXsQ8
ERzVaormI43ZytMP75_zmAs
```
