import type { BenchmarkConfig, CellSummary, Observation, Profile, RunReport, TokenUsage } from './types';

const validCounter = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Invalid or missing telemetry is unknown, never an observed zero or a miss. */
export function normalizeUsage(usage: TokenUsage | null): TokenUsage | null {
  if (!usage || !validCounter(usage.inputTokens) || !validCounter(usage.outputTokens) || !validCounter(usage.thinkingTokens)) return null;
  if ([usage.cachedReadTokens, usage.cacheWriteTokens, usage.uncachedInputTokens].some(value => value != null && !validCounter(value))) return null;
  const read = validCounter(usage.cachedReadTokens) ? usage.cachedReadTokens : null;
  const write = validCounter(usage.cacheWriteTokens) ? usage.cacheWriteTokens : null;
  const uncached = validCounter(usage.uncachedInputTokens) ? usage.uncachedInputTokens : null;
  if ((read ?? 0) + (write ?? 0) > usage.inputTokens || (uncached != null && read != null && write != null && Math.abs(uncached + read + write - usage.inputTokens) > 0.01)) return null;
  return { ...usage, cachedReadTokens: read, cacheWriteTokens: write, uncachedInputTokens: uncached };
}

export function actualInputCost(usage: TokenUsage | null, profile: Profile): number | null {
  const p = profile.pricing;
  if (!p || !usage || usage.uncachedInputTokens == null || usage.cachedReadTokens == null || usage.cacheWriteTokens == null) return null;
  return (usage.uncachedInputTokens * p.input + usage.cachedReadTokens * p.cachedRead + usage.cacheWriteTokens * p.cacheWrite) / 1e6;
}

export function idealInputCost(usage: TokenUsage | null, previousInput: number | null, profile: Profile, scenario: BenchmarkConfig['scenario'], firstCost: number | null): number | null {
  if (!usage || !profile.pricing || scenario === 'perturb') return null;
  if (previousInput == null) return firstCost;
  if (previousInput < profile.cacheMinTokens) return null;
  // New prefix segments use the provider's automatic/checkpoint write policy.
  let freshRate: number;
  if (profile.provider === 'gemini') freshRate = profile.pricing.input;
  else if (profile.provider === 'anthropic' || (profile.provider === 'openai' && /gpt[- ]?6\.1/i.test(profile.model))) freshRate = profile.pricing.cacheWrite;
  else return null;
  const reusable = Math.min(previousInput, usage.inputTokens);
  return (reusable * profile.pricing.cachedRead + Math.max(0, usage.inputTokens - reusable) * freshRate) / 1e6;
}

export function wilsonInterval(hits: number, n: number): [number, number] | null {
  if (!n) return null;
  const z = 1.959963984540054, p = hits / n, den = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / den;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function cellId(profileId: string, gapSeconds: number): string { return `${profileId}@${gapSeconds}s`; }
const sumKnown = (values: (number | null)[]): number | null => values.length && values.every(x => x != null) ? values.reduce<number>((sum, x) => sum + x!, 0) : null;
const ratio = (a: number | null, b: number | null) => a != null && b != null && b > 0 ? a / b : null;

export function summarizeObservations(config: BenchmarkConfig, observations: Observation[]): CellSummary[] {
  return config.profiles.flatMap(profile => config.gapsSeconds.map(gapSeconds => {
    const id = cellId(profile.id, gapSeconds);
    const all = observations.filter(o => o.cellId === id);
    const ok = all.filter(o => o.status === 'ok');
    const measured = ok.filter(o => o.turn > 0 && o.fullHit != null);
    const followups = ok.filter(o => o.turn > 0);
    const hits = measured.filter(o => o.fullHit).length;
    const readKnown = followups.filter(o => o.usage?.cachedReadTokens != null);
    const anyKnown = followups.filter(o => o.anyHit != null);
    const captureKnown = measured.filter(o => o.usage?.cachedReadTokens != null && o.expectedReusableTokens != null);
    const totalInput = readKnown.reduce((s, o) => s + o.usage!.inputTokens, 0);
    const totalRead = readKnown.reduce((s, o) => s + o.usage!.cachedReadTokens!, 0);
    const totalExpected = captureKnown.reduce((s, o) => s + o.expectedReusableTokens!, 0);
    const captureRead = captureKnown.reduce((s, o) => s + o.usage!.cachedReadTokens!, 0);
    const actual = sumKnown(ok.map(o => o.actualInputCostUsd));
    const ideal = sumKnown(ok.map(o => o.idealInputCostUsd));
    const output = sumKnown(ok.map(o => o.outputCostUsd));
    const durations = ok.map(o => o.durationMs).sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const warnings = [...new Set(all.flatMap(o => o.warnings))];
    if (measured.length) warnings.push('Wilson 95% interval describes turns only; turns within a trial are clustered and are not independent experimental replicates.');
    if (measured.length) warnings.push('Full hit is a previous-input token-count heuristic. Hidden provider prefixes, rounding, and minimum cache lengths prevent proof of exact prefix reuse.');
    if (all.some(o => o.status !== 'ok')) warnings.push('Failed/cancelled attempts are excluded from hit and cost denominators; cost totals cover observed successful requests only.');
    return { cellId: id, profile, scenario: config.scenario, gapSeconds, attempts: all.length, successes: ok.length, errors: all.filter(o => o.status === 'error').length,
      measuredTurns: measured.length, anyHitMeasuredTurns: anyKnown.length, tokenMeasuredTurns: readKnown.length, fullHits: hits, fullHitRate: measured.length ? hits / measured.length : null, fullHitInterval: wilsonInterval(hits, measured.length),
      anyHitRate: anyKnown.length ? anyKnown.filter(o => o.anyHit).length / anyKnown.length : null,
      tokenHitRate: totalInput ? totalRead / totalInput : null, reusableCaptureRate: totalExpected ? Math.min(1, captureRead / totalExpected) : null,
      actualInputCostUsd: actual, idealInputCostUsd: ideal, inputCostMultiplier: ratio(actual, ideal),
      followupCostMultiplier: ratio(sumKnown(followups.map(o => o.actualInputCostUsd)), sumKnown(followups.map(o => o.idealInputCostUsd))),
      outputCostUsd: output, totalCostUsd: actual != null && output != null ? actual + output : null,
      p50DurationMs: durations.length ? (durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2) : null,
      warnings,
    };
  }));
}
export function summarize(report: RunReport): CellSummary[] { return summarizeObservations(report.config, report.observations); }
