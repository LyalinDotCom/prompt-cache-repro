import type { RunReport } from './types';
export { summarize, summarizeObservations } from './metrics';

const number = (value: number | null, digits = 3) => value == null ? 'unknown' : value.toFixed(digits);
const percent = (value: number | null) => value == null ? 'unknown' : `${(value * 100).toFixed(1)}%`;
const clean = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');

export function toMarkdown(report: RunReport): string {
  const lines = [
    '# Prompt cache benchmark report', '',
    `Run: ${report.runId} · ${report.status} · ${report.runtime}`, '',
    `Created: ${report.createdAt}. Finished: ${report.finishedAt ?? 'pending'}.`, '',
    `Scenario: ${report.config.scenario}; ${report.config.turns} turns per trial (turn 0 is excluded from hit rates); ${report.config.trials} trials; seed: ${clean(report.config.seed)}.`, '',
    '| Profile | Gap (s) | Attempts / errors | Measured followups | Strict previous-input match | Any hit | Token hit | Reusable capture | Input cost | Theoretical ideal input | Theoretical input multiplier | Theoretical followup multiplier | Output cost |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.summaries.map(s => `| ${clean(s.profile.label)} | ${s.gapSeconds} | ${s.attempts} / ${s.errors} | ${s.measuredTurns} | ${percent(s.fullHitRate)} | ${percent(s.anyHitRate)} | ${percent(s.tokenHitRate)} | ${percent(s.reusableCaptureRate)} | $${number(s.actualInputCostUsd, 6)} | $${number(s.idealInputCostUsd, 6)} | ${number(s.inputCostMultiplier)} | ${number(s.followupCostMultiplier)} | $${number(s.outputCostUsd, 6)} |`),
    '', 'Full hit compares reported cached reads against previous successful input tokens with the configured token tolerance. It is a heuristic: hidden prefixes and provider rounding prevent proving exact prefix reuse. Any hit means cached reads > 0. Any-hit and token-hit metrics include all successful followups with a known cached-read counter, including perturbation and inputs below the minimum; their sample counts may differ from full-hit eligibility. Token hit is cached-read / total-input tokens on those followups. Reusable capture is cached-read / previous-input tokens (capped at 1).', '',
    'The theoretical previous-input baseline is a hypothetical lower bound, not proof that ordinary input overhead was eligible for caching. Input costs use uncached input × input rate + cache reads × read rate + cache writes × write rate, per million tokens. Ideal input includes actual first-turn cost and then assumes all reusable prior input reads from cache and all new delta follows the provider write policy. Output costs are separate. Unknown counters remain unknown. Perturbation has no ideal reuse baseline.', '',
    'Provider-eligible frontier metrics are available only for OpenAI/Anthropic with explicit read and write counters. Reusable = min(previous reads + writes, current reads + writes). Ordinary current input stays charged at its ordinary rate, reusable tokens at the read rate, and remaining current cache-boundary tokens at the write rate. Gemini exposes no equivalent write frontier; these metrics remain unknown. This is a boundary-aware counterfactual, not proof of provider-internal prefix identity.', '',
    '| Profile | Gap (s) | Eligible measured turns | Eligible full match | Eligible capture | Boundary-aware ideal input | Boundary-aware input multiplier | Boundary-aware followup multiplier |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.summaries.map(s=>`| ${clean(s.profile.label)} | ${s.gapSeconds} | ${s.eligibleMeasuredTurns ?? 0} | ${percent(s.eligibleFullHitRate ?? null)} | ${percent(s.eligibleCaptureRate ?? null)} | $${number(s.eligibleIdealInputCostUsd ?? null,6)} | ${number(s.eligibleInputCostMultiplier ?? null)} | ${number(s.eligibleFollowupCostMultiplier ?? null)} |`), '',
    'Wilson 95% intervals are descriptive turn-level intervals, not independent-sample confidence intervals: turns are clustered within trials. Compare independent trials and repeated randomized runs before drawing conclusions.', '',
    ...report.summaries.filter(s => s.fullHitInterval).map(s => `${clean(s.profile.label)} at ${s.gapSeconds}s: Wilson interval ${percent(s.fullHitInterval![0])}–${percent(s.fullHitInterval![1])}.`),
    '', 'Warnings:', ...[...new Set([...report.warnings, ...report.summaries.flatMap(s => s.warnings)])].map(w => `- ${w}`), '',
    `SDK versions: ${Object.entries(report.sdkVersions).map(([name, version]) => `${name} ${version}`).join(', ')}.`, '',
    'Pricing snapshots:', ...report.config.profiles.map(p => `- ${clean(p.label)}: ${p.pricing ? `as of ${p.pricing.asOf}; input ${p.pricing.input}, read ${p.pricing.cachedRead}, write ${p.pricing.cacheWrite}, output ${p.pricing.output} USD / million tokens. Source: ${p.pricing.source}${p.pricing.note ? `; ${p.pricing.note}` : ''}` : 'unknown'}.`), '',
  ];
  return lines.join('\n');
}

const columns = ['runId','cellId','trialId','profileId','accountId','provider','model','resolvedModel','tier','scenario','trial','turn','gapSeconds','actualIdleGapMs','startedAt','durationMs','status','error','httpStatus','transportAttemptCount','responseId','continuationValid','stopReason','requestHash','prefixHash','previousInputTokens','expectedReusableTokens','fullHit','anyHit','reuseShortfallTokens','eligibleReusableTokens','eligibleFullHit','eligibleReuseShortfallTokens','inputTokens','cachedReadTokens','cacheWriteTokens','uncachedInputTokens','outputTokens','thinkingTokens','actualInputCostUsd','idealInputCostUsd','theoreticalIdealInputCostUsd','eligibleIdealInputCostUsd','outputCostUsd','warnings'] as const;
function csv(value: unknown): string {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Spreadsheet import safety for provider-supplied strings (error/model/headers).
  const safe = typeof value === 'string' && /^[=+@\-]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
export function toCsv(report: RunReport): string {
  return [columns.join(','), ...report.observations.map(o => {
    const row: Record<string, unknown> = { ...o, ...o.usage };
    return columns.map(key => csv(row[key])).join(',');
  })].join('\n') + '\n';
}

/** Self-contained JSONL: metadata, every attempt, and final cell summaries. */
export function toJsonl(report: RunReport): string {
  const { observations, summaries, ...metadata } = report;
  return [JSON.stringify({ type: 'run', ...metadata }), ...observations.map(observation => JSON.stringify({ type: 'observation', ...observation })), ...summaries.map(summary => JSON.stringify({ type: 'summary', ...summary }))].join('\n') + '\n';
}

/** One row per profile × gap cell for summary.csv. */
export function toSummaryCsv(report: RunReport): string {
  const keys = ['cellId','profileId','accountId','provider','model','tier','scenario','gapSeconds','attempts','successes','errors','measuredTurns','anyHitMeasuredTurns','tokenMeasuredTurns','fullHits','fullHitRate','fullHitIntervalLow','fullHitIntervalHigh','anyHitRate','tokenHitRate','reusableCaptureRate','eligibleMeasuredTurns','eligibleFullHits','eligibleFullHitRate','eligibleCaptureRate','actualInputCostUsd','idealInputCostUsd','theoreticalIdealInputCostUsd','theoreticalInputCostMultiplier','eligibleIdealInputCostUsd','eligibleInputCostMultiplier','eligibleFollowupCostMultiplier','inputCostMultiplier','followupCostMultiplier','outputCostUsd','totalCostUsd','p50DurationMs','warnings'];
  return [keys.join(','), ...report.summaries.map(summary => {
    const row: Record<string,unknown> = { ...summary, profileId:summary.profile.id, accountId:summary.profile.accountId, provider:summary.profile.provider,model:summary.profile.model,tier:summary.profile.tier,fullHitIntervalLow:summary.fullHitInterval?.[0] ?? null,fullHitIntervalHigh:summary.fullHitInterval?.[1] ?? null };
    return keys.map(key=>csv(row[key])).join(',');
  })].join('\n')+'\n';
}
