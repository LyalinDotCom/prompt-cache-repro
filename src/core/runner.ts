import { SDK_VERSIONS } from './defaults';
import type { BenchmarkConfig, Observation, ProviderResult, RunReport, RunnerEvent, SessionFactory, TokenUsage } from './types';
import { createProviderSession } from '../providers/index';
import { actualInputCost, cellId, eligibleFrontier, idealInputCost, normalizeUsage, summarize } from './metrics';
import { makePrefix, perturbPrefix, seededRandom, sha256 } from './workload';

export interface RunOptions {
  signal?: AbortSignal;
  onEvent?: (event: RunnerEvent) => void | Promise<void>;
  sessionFactory?: SessionFactory;
  runtime?: RunReport['runtime'];
}

export function estimateRun(config: BenchmarkConfig): { requests: number; minDurationSeconds: number; conservativeCostUsd: number | null; knownCostUsd: number; hasUnknownPricing: boolean } {
  const requests = config.profiles.length * config.gapsSeconds.length * config.trials * config.turns;
  let cost = 0;
  let hasUnknownPricing = false;
  for (const p of config.profiles) {
    if (!p.pricing) { hasUnknownPricing = true; continue; }
    for (let turn = 0; turn < config.turns; turn++) {
      // ASCII fixture characters bound their content tokens conservatively. Wrappers and
      // provider-hidden tokens are unknown, so this remains an estimate, never a hard cap.
      const growing = config.scenario === 'append' || config.scenario === 'agent';
      const input = config.prefixChars + 1024 + (growing ? turn * (config.deltaChars + config.maxOutputTokens + 128) : config.deltaChars);
      cost += (input * Math.max(p.pricing.input, p.pricing.cachedRead, p.pricing.cacheWrite) + config.maxOutputTokens * p.pricing.output) / 1e6 * config.trials * config.gapsSeconds.length;
    }
  }
  return { requests, minDurationSeconds: config.profiles.length * config.trials * Math.max(0, config.turns - 1) * config.gapsSeconds.reduce((a,b) => a+b,0), conservativeCostUsd: hasUnknownPricing ? null : cost, knownCostUsd: cost, hasUnknownPricing };
}

export function validateConfig(config: BenchmarkConfig): void {
  if (!['replay', 'append', 'agent', 'perturb'].includes(config.scenario)) throw new Error('Unknown scenario.');
  const integer = (key: keyof BenchmarkConfig, min: number, max: number) => {
    const value = config[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  };
  integer('turns', 2, 1000); integer('trials', 1, 1000); integer('prefixChars', 1, 200000);
  integer('deltaChars', 0, 50000); integer('maxOutputTokens', 1, 32768); integer('toleranceTokens', 0, 100000); integer('timeoutMs', 1, 3600000);
  if (!config.seed || typeof config.seed !== 'string') throw new Error('A nonempty seed is required.');
  if (!config.profiles.length || !config.gapsSeconds.length) throw new Error('Select at least one profile and gap.');
  if (new Set(config.profiles.map(p => p.id)).size !== config.profiles.length) throw new Error('Profile IDs must be unique.');
  if (new Set(config.gapsSeconds).size !== config.gapsSeconds.length || config.gapsSeconds.some(gap => !Number.isFinite(gap) || gap < 0 || gap > 86400)) throw new Error('Gaps must be unique finite seconds between 0 and 86400.');
  const accountBindings = new Map<string,string>();
  for (const profile of config.profiles) {
    if (!profile.id || !profile.accountId || !profile.model || !['openai','anthropic','gemini'].includes(profile.provider)) throw new Error('Each resolved cell needs an ID, account ID, supported provider, and model.');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile.accountId) || Object.hasOwn(Object.prototype,profile.accountId)) throw new Error('Resolved cell account ID is invalid.');
    const binding = JSON.stringify([profile.provider,profile.keyEnv ?? null,profile.tier]);
    if (accountBindings.has(profile.accountId) && accountBindings.get(profile.accountId) !== binding) throw new Error('Cells sharing an account ID must share provider, keyEnv, and tier.');
    accountBindings.set(profile.accountId,binding);
    if (!Number.isFinite(profile.cacheMinTokens) || profile.cacheMinTokens < 0) throw new Error('Cache minimum tokens must be nonnegative.');
    if (profile.pricing && ['input','cachedRead','cacheWrite','output'].some(key => !Number.isFinite(profile.pricing![key as 'input']) || profile.pricing![key as 'input'] < 0)) throw new Error('Pricing rates must be finite and nonnegative.');
  }
}

function abortError(): Error { return new DOMException('Run cancelled.', 'AbortError'); }
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(abortError()); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
async function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(abortError()); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Exported artifacts contain request/response evidence, but never supplied credentials. */
function redactor(secrets: Record<string, string>) {
  const values = [...new Set(Object.values(secrets).filter(Boolean))].sort((a,b) => b.length - a.length);
  const redactString = (text: string) => values.reduce((value, secret) => value.split(secret).join('[REDACTED]'), text);
  const visit = (value: unknown, seen = new WeakSet<object>()): unknown => {
    if (typeof value === 'string') return redactString(value);
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map(item => visit(item, seen));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(authorization|x-api-key|apiKey|api_key|access_token|refresh_token)$/i.test(key) ? '[REDACTED]' : visit(item, seen)]));
  };
  return { text: redactString, value: visit };
}

export async function runBenchmark(config: BenchmarkConfig, secrets: Record<string, string>, options: RunOptions = {}): Promise<RunReport> {
  validateConfig(config);
  const estimate = estimateRun(config);
  const scrub = redactor(secrets);
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const signal = controller.signal;
  const report: RunReport = { schemaVersion: 1, runId: crypto.randomUUID(), createdAt: new Date().toISOString(), finishedAt: null, status: 'running', runtime: options.runtime ?? (typeof window === 'undefined' ? 'node' : 'browser'), config: structuredClone(config), observations: [], summaries: [], sdkVersions: SDK_VERSIONS,
    warnings: ['Sequential requests; no automatic retries. Fresh nonce per trial isolates cache prefixes.', 'Costs are estimates, not verified bills. No spending cutoff is applied. Output cost is reported separately from input-cache multipliers.'] };
  if (estimate.conservativeCostUsd == null) report.warnings.push('Some pricing is unknown: estimates cover only requests with known pricing.');
  const emit = async (event: RunnerEvent) => { await options.onEvent?.(event); };
  const cells = config.profiles.flatMap(profile => config.gapsSeconds.map(gapSeconds => ({ profile, gapSeconds })));
  const random = seededRandom(`${config.seed}:cell-order`);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  try {
    cellsLoop: for (const { profile, gapSeconds } of cells) {
      for (let trial = 0; trial < config.trials; trial++) {
        if (signal.aborted) break cellsLoop;
        const id = cellId(profile.id, gapSeconds), trialId = `${id}/trial-${trial + 1}`;
        const trialNonce = await sha256(`${report.runId}:${trialId}`);
        const prefix = `Benchmark trial identity: ${trialNonce}\n${makePrefix(config.prefixChars, `${config.seed}:trial-${trial}`)}`;
        const prefixHash = await sha256(prefix);
        const ownKey = (id: string | undefined) => id && Object.hasOwn(secrets,id) && typeof secrets[id] === 'string' ? secrets[id] : undefined;
        const key = ownKey(profile.accountId) ?? '';
        let session;
        try { session = (options.sessionFactory ?? createProviderSession)({ profile, apiKey: key, scenario: config.scenario, prefix, deltaChars: config.deltaChars, turns: config.turns, maxOutputTokens: config.maxOutputTokens, timeoutMs: config.timeoutMs, trialNonce }); }
        catch (error) { throw new Error(scrub.text(error instanceof Error ? error.message : String(error))); }
        let previousInput: number | null = null;
        let previousUsage: TokenUsage | null = null;
        let completedAt: number | null = null;
        for (let turn = 0; turn < config.turns; turn++) {
          if (signal.aborted) break cellsLoop;
          if (completedAt != null) {
            const remaining = Math.max(0, completedAt + gapSeconds * 1000 - performance.now());
            await emit({ type: 'waiting', until: Date.now() + remaining, message: `${profile.label}: trial ${trial + 1}, turn ${turn + 1}` });
            try {
              const target = completedAt + gapSeconds * 1000;
              while (performance.now() < target) await wait(Math.ceil(target - performance.now()), signal);
            } catch { break cellsLoop; }
          }
          let request: Record<string, unknown> = {}, requestHash = '';
          const effectivePrefixHash = config.scenario === 'perturb' ? await sha256(perturbPrefix(prefix, turn)) : prefixHash;
          const warnings: string[] = [];
          const observation: Observation = { runId: report.runId, cellId: id, trialId, profileId: profile.id, accountId:profile.accountId, provider: profile.provider, model: profile.model, resolvedModel: null, tier: profile.tier, scenario: config.scenario, trial, turn, gapSeconds,
            actualIdleGapMs: null, startedAt: '', durationMs: 0, status: 'ok', error: null, httpStatus: null, responseId: null, headers: {}, requestHash, prefixHash: effectivePrefixHash, request,
            rawResponse: null, rawUsage: null, usage: null, previousInputTokens: previousInput, expectedReusableTokens: turn > 0 && config.scenario !== 'perturb' && previousInput != null && previousInput >= profile.cacheMinTokens ? previousInput : null,
            fullHit: null, anyHit: null, reuseShortfallTokens: null, eligibleReusableTokens:null,eligibleFullHit:null,eligibleReuseShortfallTokens:null,eligibleIdealInputCostUsd:null,theoreticalIdealInputCostUsd:null, actualInputCostUsd: null, idealInputCostUsd: null, outputCostUsd: null, warnings };
          let result: ProviderResult | null = null;
          let started = performance.now();
          const requestController = new AbortController();
          const cancelRequest = () => requestController.abort();
          signal.addEventListener('abort', cancelRequest, { once: true });
          const timer = setTimeout(() => requestController.abort(), config.timeoutMs);
          try {
            request = session.buildRequest(turn);
            requestHash = await sha256(JSON.stringify(request));
            if (signal.aborted) throw abortError();
            // Hash/build time belongs to idle time. Timestamp immediately before SDK send.
            started = performance.now();
            observation.startedAt = new Date().toISOString();
            observation.actualIdleGapMs = completedAt == null ? null : started - completedAt;
            result = await abortable(session.send(request, requestController.signal), requestController.signal);
            completedAt = performance.now();
            observation.durationMs = completedAt - started;
            observation.usage = normalizeUsage(result.usage);
            observation.rawResponse = scrub.value(result.rawResponse);
            observation.rawUsage = scrub.value(result.rawUsage) as Record<string, unknown> | null;
            observation.resolvedModel = result.resolvedModel;
            observation.httpStatus = result.httpStatus;
            observation.responseId = result.responseId;
            observation.transportAttemptCount = result.transportAttemptCount;
            observation.wireRequestText = result.wireRequestText === undefined ? undefined : scrub.text(result.wireRequestText);
            observation.wireResponseText = result.wireResponseText === undefined ? undefined : scrub.text(result.wireResponseText);
            observation.continuationValid = result.continuationValid;
            observation.stopReason = result.stopReason;
            observation.headers = scrub.value(result.headers) as Record<string, string>;
            warnings.push(...result.warnings.map(scrub.text));
            const wireRequest = (result as ProviderResult & { wireRequest?: Record<string, unknown> }).wireRequest;
            if (wireRequest) { observation.wireRequest = scrub.value(wireRequest) as Record<string,unknown>; requestHash = await sha256(JSON.stringify(wireRequest)); }
            else warnings.push('Request hash covers SDK parameters; exact serialized wire request was unavailable.');
            if (!observation.usage) warnings.push('Usage telemetry absent or invalid; excluded from cache denominators and costs.');
            else if (observation.usage.cachedReadTokens == null) warnings.push('Cached-read counter unknown; this turn is excluded from cache-hit denominators.');
            if (observation.usage) {
              if (turn > 0 && observation.usage.cachedReadTokens != null) observation.anyHit = observation.usage.cachedReadTokens > 0;
              if (observation.expectedReusableTokens != null && observation.usage.cachedReadTokens != null) {
                observation.reuseShortfallTokens = Math.max(0,observation.expectedReusableTokens - observation.usage.cachedReadTokens);
                observation.fullHit = observation.usage.cachedReadTokens > 0 && observation.usage.cachedReadTokens >= Math.max(0, observation.expectedReusableTokens - config.toleranceTokens);
              }
              observation.actualInputCostUsd = actualInputCost(observation.usage, profile);
              observation.idealInputCostUsd = turn > 0 && previousInput == null ? null : idealInputCost(observation.usage, previousInput, profile, config.scenario, observation.actualInputCostUsd);
              observation.theoreticalIdealInputCostUsd = observation.idealInputCostUsd;
              const frontier = eligibleFrontier(previousUsage,observation.usage,profile,config.scenario);
              observation.eligibleIdealInputCostUsd = turn === 0 && profile.provider !== 'gemini' && config.scenario !== 'perturb' ? observation.actualInputCostUsd : frontier?.idealCostUsd ?? null;
              if (frontier && frontier.reusableTokens >= profile.cacheMinTokens && observation.usage.cachedReadTokens != null) {
                observation.eligibleReusableTokens=frontier.reusableTokens;
                observation.eligibleReuseShortfallTokens=Math.max(0,frontier.reusableTokens-observation.usage.cachedReadTokens);
                observation.eligibleFullHit=observation.usage.cachedReadTokens>0 && observation.usage.cachedReadTokens>=Math.max(0,frontier.reusableTokens-config.toleranceTokens);
              }
              observation.outputCostUsd = profile.pricing ? observation.usage.outputTokens * profile.pricing.output / 1e6 : null;
              if (observation.actualInputCostUsd == null) warnings.push('Input cost unknown because pricing or a required input partition counter is missing.');
              if (turn > 0 && config.scenario !== 'perturb' && observation.idealInputCostUsd == null) warnings.push('Ideal baseline unknown: prior telemetry, cache minimum, pricing, or a supported write policy is unavailable.');
              if (observation.usage.inputTokens > 100000) {
                warnings.push('Input exceeds supported 100,000-token pricing band; costs unknown and entire run stopped.');
                observation.actualInputCostUsd = observation.idealInputCostUsd = observation.outputCostUsd = observation.eligibleIdealInputCostUsd = observation.theoreticalIdealInputCostUsd = null;
              }
            }
          } catch (error) {
            completedAt = performance.now();
            observation.durationMs = completedAt - started;
            observation.startedAt ||= new Date().toISOString();
            observation.status = signal.aborted ? 'cancelled' : 'error';
            observation.error = scrub.text(requestController.signal.aborted && !signal.aborted ? `Request timed out after ${config.timeoutMs}ms.` : error instanceof Error ? error.message : String(error));
            if (error && typeof error === 'object') {
              const meta = error as { status?: number; headers?: Record<string,string>; rawResponse?: unknown; rawUsage?: Record<string,unknown>; wireRequest?: Record<string,unknown>; transportAttemptCount?: number; wireRequestText?: string; wireResponseText?: string };
              if (meta.wireRequest) { observation.wireRequest = scrub.value(meta.wireRequest) as Record<string,unknown>; requestHash = await sha256(JSON.stringify(meta.wireRequest)); }
              observation.httpStatus = meta.status ?? null;
              observation.transportAttemptCount = meta.transportAttemptCount;
              observation.wireRequestText = meta.wireRequestText === undefined ? undefined : scrub.text(meta.wireRequestText);
              observation.wireResponseText = meta.wireResponseText === undefined ? undefined : scrub.text(meta.wireResponseText);
              observation.headers = scrub.value(meta.headers ?? {}) as Record<string,string>;
              observation.rawResponse = scrub.value(meta.rawResponse ?? null);
              observation.rawUsage = scrub.value(meta.rawUsage ?? null) as Record<string,unknown> | null;
            }
          } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', cancelRequest);
          }
          observation.request = scrub.value(request) as Record<string,unknown>;
          observation.requestHash = requestHash || await sha256(JSON.stringify(request));
          if (result && !result.continuationValid) warnings.push('Provider continuation is invalid; trial stopped before the next request.');
          if (observation.status === 'ok' && result && result.continuationValid && (observation.usage?.inputTokens ?? 0) <= 100000) {
            try { session.advance(result, turn); }
            catch (error) { warnings.push(`Continuation update failed; trial stopped: ${scrub.text(error instanceof Error ? error.message : String(error))}`); result = { ...result, continuationValid: false }; observation.continuationValid = false; }
          }
          report.observations.push(observation);
          report.summaries = summarize(report);
          await emit({ type: 'observation', observation, report });
          await emit({ type: 'status', message: `${profile.label}: ${observation.status}`, completed: report.observations.length, total: estimate.requests });
          if ((observation.usage?.inputTokens ?? 0) > 100000) { report.status = 'incomplete'; report.warnings.push('Stopped entire run: observed input exceeds supported 100,000-token pricing band. Cost totals are partial.'); break cellsLoop; }
          if (observation.status !== 'ok' || !result?.continuationValid || (observation.usage?.inputTokens ?? 0) > 100000) break;
          previousInput = observation.usage?.inputTokens ?? null;
          previousUsage = observation.usage;
        }
      }
    }
    if (report.status === 'running') {
      const incomplete = report.observations.length !== estimate.requests || report.observations.some(o => o.status === 'error' || o.continuationValid === false);
      report.status = signal.aborted ? 'cancelled' : incomplete ? 'incomplete' : 'completed';
      if (incomplete && !signal.aborted) report.warnings.push('Run incomplete: a failed attempt or invalid continuation stopped a trial, or the planned attempt count was not reached. Successful input-cache measurements remain available.');
    }
  } finally {
    options.signal?.removeEventListener('abort', abort);
    report.finishedAt = new Date().toISOString();
    report.summaries = summarize(report);
  }
  await emit({ type: 'complete', report });
  return report;
}
