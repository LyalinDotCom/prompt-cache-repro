/** Independent, offline evidence audit. Imports only Node standard library; never reads credentials. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

type J = Record<string, any>;
type Verdict = 'PASS' | 'FAIL' | 'UNKNOWN';
type Counts = { input: number; read: number; write: number; ordinary: number; output: number; thinking: number; readDecodedZero: boolean };
const root = resolve(process.argv[2] ?? (() => { throw new Error('Usage: npx tsx scripts/audit-validation.ts <batch-directory>'); })());
const batch = JSON.parse(readFileSync(join(root, 'batch.json'), 'utf8')) as J;
const rates: Record<string, [number, number, number, number]> = {
  'gemini-4-argon': [2, .1, 2, 10], 'gemini-3.8-flash': [.75, .075, .75, 3.75],
  'gpt-6.1-sol': [2, .1, 2.5, 10], 'claude-opus-5-5': [4, .2, 5, 20],
};
const hash = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const same = isDeepStrictEqual;
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const close = (a: unknown, b: number): boolean => typeof a === 'number' && Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-10);
const mean = (a: number[]): number | null => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const checks: { check: string; row: string; verdict: Verdict; detail?: unknown }[] = [];
function check(name: string, row: string, valid: boolean | null, detail?: unknown): void {
  checks.push({ check: name, row, verdict: valid === null ? 'UNKNOWN' : valid ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : { detail }) });
}
function decode(raw: J | null, provider: string): Counts | null {
  if (!raw) return null;
  let input: number, read: number, write: number, ordinary: number, output: number, thinking: number;
  let readDecodedZero = false;
  if (provider === 'gemini') {
    input = raw.promptTokenCount;
    readDecodedZero = !Object.hasOwn(raw, 'cachedContentTokenCount');
    read = readDecodedZero ? 0 : raw.cachedContentTokenCount;
    write = 0; ordinary = input - read;
    thinking = raw.thoughtsTokenCount === undefined ? 0 : raw.thoughtsTokenCount;
    output = (raw.candidatesTokenCount === undefined ? 0 : raw.candidatesTokenCount) + thinking;
    if ((raw.toolUsePromptTokenCount ?? 0) !== 0) return null;
    if (raw.totalTokenCount !== undefined && (!integer(raw.totalTokenCount) || raw.totalTokenCount !== input + output)) return null;
  } else if (provider === 'openai') {
    input = raw.input_tokens; read = raw.input_tokens_details?.cached_tokens;
    write = raw.input_tokens_details?.cache_write_tokens; ordinary = input - read - write;
    output = raw.output_tokens; thinking = raw.output_tokens_details?.reasoning_tokens === undefined ? 0 : raw.output_tokens_details.reasoning_tokens;
    if (raw.total_tokens !== undefined && (!integer(raw.total_tokens) || raw.total_tokens !== input + output)) return null;
  } else if (provider === 'anthropic') {
    ordinary = raw.input_tokens; read = raw.cache_read_input_tokens; write = raw.cache_creation_input_tokens;
    input = ordinary + read + write; output = raw.output_tokens;
    thinking = raw.output_tokens_details?.thinking_tokens === undefined ? 0 : raw.output_tokens_details.thinking_tokens;
    if (raw.cache_creation && Object.values(raw.cache_creation).every(integer) && Object.values(raw.cache_creation).reduce<number>((a, x) => a + Number(x), 0) !== write) return null;
    if ((raw.cache_creation?.ephemeral_1h_input_tokens ?? 0) > 0) return null;
  } else return null;
  return [input, read, write, ordinary, output, thinking].every(integer) && thinking <= output && input === ordinary + read + write
    ? { input, read, write, ordinary, output, thinking, readDecodedZero } : null;
}
function messages(wire: J, provider: string): J[] {
  return wire?.[provider === 'gemini' ? 'contents' : provider === 'openai' ? 'input' : 'messages'] ?? [];
}
function firstText(wire: J, provider: string): string | null {
  const first = messages(wire, provider)[0];
  if (provider === 'gemini') return first?.parts?.map((p: J) => p.text ?? '').join('') ?? null;
  if (typeof first?.content === 'string') return first.content;
  if (Array.isArray(first?.content)) return first.content.map((p: J) => p.text ?? '').join('');
  return null;
}
function stripIdentity(text: string): string {
  return text.replace(/^PERTURB-\d+\n/, '').replace(/^Benchmark trial identity: [^\n]+\n/, '');
}
function emptyArgs(value: unknown): boolean {
  try { const v = typeof value === 'string' ? JSON.parse(value) : value; return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0; }
  catch { return false; }
}
function nativeResult(raw: J, provider: string): { valid: boolean; output: J[]; signatureBlocks: number; stop: string | null } {
  let output: J[], calls: J[], valid: boolean, stop: string | null;
  if (provider === 'openai') {
    output = raw.output ?? []; calls = output.filter(x => x.type === 'function_call'); stop = raw.status ?? null;
    valid = stop === 'completed' && calls.length === 1 && calls.every(x => x.name === 'read_fixture' && typeof x.call_id === 'string' && emptyArgs(x.arguments));
  } else if (provider === 'anthropic') {
    output = raw.content ?? []; calls = output.filter(x => x.type === 'tool_use'); stop = raw.stop_reason ?? null;
    valid = stop === 'tool_use' && calls.length === 1 && calls.every(x => x.name === 'read_fixture' && typeof x.id === 'string' && emptyArgs(x.input));
  } else {
    const candidates = raw.candidates ?? []; const content = candidates[0]?.content;
    output = content ? [content] : []; calls = (content?.parts ?? []).filter((x: J) => x.functionCall); stop = candidates[0]?.finishReason ?? null;
    valid = candidates.length === 1 && stop === 'STOP' && calls.length === 1 && calls.every(x => x.functionCall.name === 'read_fixture' && emptyArgs(x.functionCall.args));
  }
  const blocks = provider === 'gemini' ? output.flatMap(x => x.parts ?? []) : output;
  return { valid, output, stop, signatureBlocks: blocks.filter(x => Object.hasOwn(x, 'thoughtSignature') || Object.hasOwn(x, 'signature') || Object.hasOwn(x, 'encrypted_content') || x.type === 'redacted_thinking').length };
}

const reports: J[] = [];
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try { reports.push(JSON.parse(readFileSync(join(root, entry.name, 'report.json'), 'utf8'))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
}
reports.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const rows: J[] = [], trajectories: J[] = [];
const responseIds = new Map<string, string>();
const fixtureHashes = new Map<number, { hash: string; chars: number; rows: string[] }[]>();
for (const report of reports) {
  const config = report.config;
  const stage = batch.stages.find((s: J) => s.config.seed === config.seed && s.config.scenario === config.scenario && same(s.config.gapsSeconds, config.gapsSeconds));
  if (!stage) throw new Error(`No registered stage for ${report.runId}`);
  const groups = new Map<string, J[]>();
  for (const [index, obs] of report.observations.entries()) {
    const rowId = `${report.runId}/row-${index}/${obs.profileId}/t${obs.turn}`;
    const wire = obs.wireRequest; const raw = obs.rawResponse; const provider = obs.provider;
    const nativeUsage = raw?.[provider === 'gemini' ? 'usageMetadata' : 'usage'] ?? null;
    const decoded = decode(nativeUsage, provider);
    const rate = rates[obs.model];
    const declaredRate = config.profiles.find((p: J) => p.id === obs.profileId)?.pricing;
    check('registered-rate-card', rowId, rate && declaredRate ? same([declaredRate.input, declaredRate.cachedRead, declaredRate.cacheWrite, declaredRate.output], rate) : null);
    check('wire-hash', rowId, wire ? hash(wire) === obs.requestHash : null);
    check('one-transport-attempt', rowId, integer(obs.transportAttemptCount) ? obs.transportAttemptCount === 1 : null, obs.transportAttemptCount ?? null);
    check('raw-usage-copy', rowId, raw ? same(nativeUsage, obs.rawUsage) : null);
    check('raw-counter-partition', rowId, obs.status === 'ok' ? !!decoded : null);
    if (obs.responseId) {
      check('unique-response-id', rowId, !responseIds.has(obs.responseId), responseIds.get(obs.responseId));
      responseIds.set(obs.responseId, rowId);
    }
    const own = decoded && rate ? {
      inputCostUsd: (decoded.ordinary * rate[0] + decoded.read * rate[1] + decoded.write * rate[2]) / 1e6,
      outputCostUsd: decoded.output * rate[3] / 1e6,
    } : null;
    if (decoded) {
      const n = obs.usage;
      check('normalized-counters-agree', rowId, n ? n.inputTokens === decoded.input && n.cachedReadTokens === decoded.read && n.cacheWriteTokens === decoded.write && n.uncachedInputTokens === decoded.ordinary && n.outputTokens === decoded.output && (n.thinkingTokens === decoded.thinking || (provider === 'anthropic' && n.thinkingTokens === 0)) : false);
    }
    if (own) {
      check('actual-input-cost-agrees', rowId, close(obs.actualInputCostUsd, own.inputCostUsd));
      check('output-cost-agrees', rowId, close(obs.outputCostUsd, own.outputCostUsd));
    }
    const rawNative = raw ? nativeResult(raw, provider) : null;
    const taskRejected = rawNative?.stop === 'refusal' || !!raw?.promptFeedback?.blockReason ||
      (provider === 'openai' && (raw?.output ?? []).some((item: J) => (item.content ?? []).some((part: J) => part.type === 'refusal'))) ||
      ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(rawNative?.stop ?? '');
    const row: J = { rowId, stageId: stage.id, runId: report.runId, index, profileId: obs.profileId, provider, model: obs.model,
      scenario: config.scenario, seed: config.seed, block: /block-(\d+)$/.exec(config.seed)?.[1] ?? null,
      trial: obs.trial, turn: obs.turn, gapSeconds: obs.gapSeconds, status: obs.status,
      transportAttemptCount: obs.transportAttemptCount ?? null, rawStopReason: rawNative?.stop ?? null,
      rawToolContinuationValid: rawNative?.valid ?? null, signatureBlocks: rawNative?.signatureBlocks ?? 0,
      taskRejected, refusalCategory: raw?.stop_details?.category ?? raw?.promptFeedback?.blockReason ?? null,
      reuseAdmissible: !!decoded && obs.status === 'ok' && obs.transportAttemptCount === 1 && !taskRejected && (config.scenario !== 'agent' || rawNative?.valid === true),
      rawCounts: decoded, independentCosts: own, actualIdleGapMs: obs.actualIdleGapMs,
      startedAt: obs.startedAt, durationMs: obs.durationMs,
      referenceWithoutIdentityHash: wire && firstText(wire, provider) !== null ? hash(stripIdentity(firstText(wire, provider)!)) : null,
      wireHash: wire ? hash(wire) : null, responseId: obs.responseId,
      _obs: obs, _native: rawNative,
    };
    if (config.scenario === 'agent' && wire) check('finite-validation-v2-task', rowId, firstText(wire, provider)?.includes('Retrieve four fixture chunks using read_fixture.') ?? false);
    rows.push(row); const groupKey = obs.trialId;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(row);
  }
  for (const [trialId, members] of groups) {
    members.sort((a, b) => a.turn - b.turn);
    const first = members[0];
    const trajectory: J = { stageId: stage.id, runId: report.runId, trialId, model: first.model, scenario: config.scenario,
      plannedRequests: config.turns, attemptedRequests: members.length, rawValidUsageRequests: members.filter(x => x.rawCounts && x.transportAttemptCount === 1 && x.status === 'ok').length,
      rawInvalidAgentResponses: config.scenario === 'agent' ? members.filter(x => x.status === 'ok' && !x.rawToolContinuationValid).map(x => x.rowId) : [],
      completeAllocation: members.length === config.turns, runStatus: report.status };
    trajectories.push(trajectory);
    if (config.scenario === 'replay') check('replay-identical-wire-payloads', trialId, members.every(x => JSON.stringify(x._obs.wireRequest) === JSON.stringify(first._obs.wireRequest)));
    for (let i = 1; i < members.length; i++) {
      const prev = members[i - 1], row = members[i]; const obs = row._obs, raw = row.rawCounts as Counts | null, prior = prev.rawCounts as Counts | null;
      if (row.scenario === 'append') check('append-control-preserves-history', row.rowId, same(messages(obs.wireRequest, row.provider).slice(0, messages(prev._obs.wireRequest, row.provider).length), messages(prev._obs.wireRequest, row.provider)));
      if (row.scenario === 'perturb') check('perturb-control-only-first-line-changes', row.rowId, JSON.stringify(prev._obs.wireRequest).replace(`PERTURB-${String(prev.turn).padStart(6, '0')}`, `PERTURB-${String(row.turn).padStart(6, '0')}`) === JSON.stringify(obs.wireRequest));
      if (row.turn !== prev.turn + 1) check('contiguous-turns', row.rowId, false);
      if (row.actualIdleGapMs !== null) check('minimum-idle-gap', row.rowId, row.actualIdleGapMs + 2 >= row.gapSeconds * 1000, row.actualIdleGapMs);
      if (row.status === 'ok' && raw && prior && row.transportAttemptCount === 1 && prev.transportAttemptCount === 1) {
        row.reuseAdmissible = row.reuseAdmissible && prev.reuseAdmissible;
        row.priorInputTokens = prior.input; row.readOverPriorInput = raw.read / prior.input;
        row.priorInputBelow95Percent = raw.read < .95 * prior.input;
        row.previousInputStrict64FullHit = raw.read >= prior.input - 64 && raw.read > 0;
        row.priorInputShortfallTokens = Math.max(0, prior.input - raw.read);
        const rate = rates[row.model];
        if (row.scenario !== 'perturb' && rate) {
          const delta = Math.max(0, raw.input - prior.input);
          row.fullPriorInputCounterfactualUsd = (Math.min(prior.input, raw.input) * rate[1] + delta * (row.provider === 'gemini' ? rate[0] : rate[2])) / 1e6;
          row.actualVsFullPriorInputCounterfactual = row.independentCosts.inputCostUsd / row.fullPriorInputCounterfactualUsd;
          if (row.provider !== 'gemini') {
            const frontier = prior.read + prior.write;
            row.previousPublicCacheFrontierTokens = frontier;
            row.frontierReuseExact = frontier > 0 ? raw.read >= frontier : null;
            row.frontierReuseWithin64 = frontier > 0 ? raw.read >= frontier - 64 : null;
            row.frontierReuseShortfallTokens = Math.max(0, frontier - raw.read);
            row.eligibleFrontierCounterfactualUsd = (raw.ordinary * rate[0] + Math.min(frontier, raw.input - raw.ordinary) * rate[1] + Math.max(0, raw.input - raw.ordinary - frontier) * rate[2]) / 1e6;
            row.actualVsEligibleFrontierCounterfactual = row.independentCosts.inputCostUsd / row.eligibleFrontierCounterfactualUsd;
            check('reported-eligible-frontier-agrees', row.rowId, obs.eligibleReusableTokens === frontier, { independent: frontier, reported: obs.eligibleReusableTokens ?? null });
            check('reported-eligible-fullhit-agrees', row.rowId, obs.eligibleFullHit === row.frontierReuseWithin64);
            check('reported-eligible-cost-baseline-agrees', row.rowId, close(obs.eligibleIdealInputCostUsd, row.eligibleFrontierCounterfactualUsd), { independent: row.eligibleFrontierCounterfactualUsd, reported: obs.eligibleIdealInputCostUsd ?? null });
          }
        }
      }
      if (row.scenario !== 'agent' || row.status !== 'ok' || !prev._obs.wireRequest || !obs.wireRequest || !prev._native) continue;
      const oldMessages = messages(prev._obs.wireRequest, row.provider), newMessages = messages(obs.wireRequest, row.provider);
      check('agent-append-only-prefix', row.rowId, same(newMessages.slice(0, oldMessages.length), oldMessages));
      const appended = newMessages.slice(oldMessages.length); const nativeOutput = prev._native.output;
      const nativeSame = row.provider === 'openai' ? same(appended.slice(0, nativeOutput.length), nativeOutput)
        : row.provider === 'anthropic' ? same(appended[0]?.content, nativeOutput) : same(appended[0], nativeOutput[0]);
      check('complete-native-output-preserved', row.rowId, nativeSame, { signedOrEncryptedBlocks: prev._native.signatureBlocks });
      row.preservedSignedOrEncryptedBlocks = nativeSame ? prev._native.signatureBlocks : 0;
      const last = appended.at(-1);
      const priorCall = row.provider === 'openai' ? nativeOutput.find((x: J) => x.type === 'function_call') : row.provider === 'anthropic' ? nativeOutput.find((x: J) => x.type === 'tool_use') : nativeOutput[0]?.parts?.find((x: J) => x.functionCall)?.functionCall;
      const bindingValid = !!priorCall && (row.provider === 'openai' ? last?.type === 'function_call_output' && last.call_id === priorCall.call_id
        : row.provider === 'anthropic' ? last?.content?.[0]?.type === 'tool_result' && last.content[0].tool_use_id === priorCall.id
          : last?.parts?.[0]?.functionResponse?.name === priorCall.name && (priorCall.id === undefined || last?.parts?.[0]?.functionResponse?.id === priorCall.id));
      check('tool-result-bound-to-real-call', row.rowId, bindingValid);
      const fixture: unknown = row.provider === 'openai' ? last?.output : row.provider === 'anthropic' ? last?.content?.[0]?.content : last?.parts?.[0]?.functionResponse?.response?.content;
      check('fixture-exact-character-count', row.rowId, typeof fixture === 'string' && fixture.length === config.deltaChars, typeof fixture === 'string' ? fixture.length : null);
      if (typeof fixture === 'string') {
        row.returnedFixtureHash = hash(fixture); row.returnedFixtureChars = fixture.length;
        if (!fixtureHashes.has(row.turn)) fixtureHashes.set(row.turn, []);
        fixtureHashes.get(row.turn)!.push({ hash: hash(fixture), chars: fixture.length, rows: [row.rowId] });
      }
      const responseStartDelta = Date.parse(row.startedAt) - Date.parse(prev.startedAt);
      row.requestStartGapMs = responseStartDelta;
      check('wallclock-idle-gap-consistent', row.rowId, Math.abs((responseStartDelta - prev.durationMs) - row.actualIdleGapMs) < 25,
        { recordedIdleMs: row.actualIdleGapMs, wallclockMinusPriorDurationMs: responseStartDelta - prev.durationMs });
    }
  }
}

for (const stage of batch.stages) {
  const initialRows = rows.filter(x => x.stageId === stage.id && x.turn === 0);
  if (initialRows.length > 1) check('reference-fixture-matches-across-models', stage.id, new Set(initialRows.map(x => x.referenceWithoutIdentityHash)).size === 1, { rows: initialRows.length, hashes: [...new Set(initialRows.map(x => x.referenceWithoutIdentityHash))] });
}
for (const [step, fixtures] of fixtureHashes) check('fixture-consistency-across-trajectories', `tool-step-${step}`, new Set(fixtures.map(x => x.hash)).size === 1, { fixtureHashes: [...new Set(fixtures.map(x => x.hash))], rows: fixtures.length });
const summaries: J[] = [];
for (const scenario of [...new Set(rows.map(x => x.scenario))]) for (const model of [...new Set(rows.map(x => x.model))]) for (const gap of [...new Set(rows.filter(x => x.scenario === scenario && x.model === model).map(x => x.gapSeconds))]) {
  const selected = rows.filter(x => x.scenario === scenario && x.model === model && x.gapSeconds === gap);
  const valid = selected.filter(x => x.rawCounts && x.status === 'ok' && x.transportAttemptCount === 1);
  const followups = valid.filter(x => x.reuseAdmissible && x.priorInputTokens !== undefined);
  const eligible = followups.filter(x => x.frontierReuseExact !== null && x.frontierReuseExact !== undefined);
  summaries.push({ scenario, model, gapSeconds: gap, attempted: selected.length, validUsage: valid.length, failedAttempts: selected.filter(x => x.status !== 'ok').length,
    rawTaskRejections: selected.filter(x => x.taskRejected).length,
    invalidAgentContinuation: scenario === 'agent' ? valid.filter(x => !x.rawToolContinuationValid).length : null,
    followupDenominator: followups.length, anyReadFollowups: followups.filter(x => x.rawCounts.read > 0).length,
    priorInputBelow95Percent: followups.filter(x => x.priorInputBelow95Percent).length,
    strict64FullHits: followups.filter(x => x.previousInputStrict64FullHit).length,
    eligibleFrontierDenominator: eligible.length, eligibleFrontierExactFullReuse: eligible.filter(x => x.frontierReuseExact).length,
    preservedSignedOrEncryptedBlocks: followups.reduce((s, x) => s + (x.preservedSignedOrEncryptedBlocks ?? 0), 0),
    meanReadOverPriorInput: mean(followups.map(x => x.readOverPriorInput)),
    aggregateInputTokens: valid.reduce((s, x) => s + x.rawCounts.input, 0), aggregateReadTokens: valid.reduce((s, x) => s + x.rawCounts.read, 0),
    independentInputCostUsd: valid.reduce((s, x) => s + (x.independentCosts?.inputCostUsd ?? 0), 0), independentOutputCostUsd: valid.reduce((s, x) => s + (x.independentCosts?.outputCostUsd ?? 0), 0),
    meanFollowupActualVsFullPriorCounterfactual: mean(followups.filter(x => x.actualVsFullPriorInputCounterfactual !== undefined).map(x => x.actualVsFullPriorInputCounterfactual)),
    meanFollowupActualVsEligibleFrontierCounterfactual: mean(eligible.map(x => x.actualVsEligibleFrontierCounterfactual)),
    observedOrdinaryTokenValues: [...new Set(valid.map(x => x.rawCounts.ordinary))].sort((a, b) => Number(a) - Number(b)),
  });
}
const timing = rows.filter(x => x.scenario === 'agent' && x.turn === 1 && x.block !== null && x.model.startsWith('gemini')).map(row => {
  const matches = rows.filter(x => x.scenario === 'agent' && x.turn === 1 && x.model === row.model && x.block === row.block);
  const references = [...new Set(matches.map(x => x.referenceWithoutIdentityHash))];
  const fixtures = [...new Set(matches.map(x => x.returnedFixtureHash).filter(Boolean))];
  return { rowId: row.rowId, model: row.model, block: row.block, gapSeconds: row.gapSeconds, actualIdleGapMs: row.actualIdleGapMs,
    priorInputTokens: row.priorInputTokens ?? null, counts: row.rawCounts, readOverPriorInput: row.readOverPriorInput ?? null, reuseAdmissible: row.reuseAdmissible,
    inputCostUsd: row.independentCosts?.inputCostUsd ?? null, referenceWithoutNoncePaired: matches.length > 1 ? references.length === 1 : null,
    firstToolFixturePaired: matches.length > 1 ? fixtures.length === 1 : null, availableGapConditions: matches.map(x => x.gapSeconds).sort((a, b) => a - b),
    completeThreeGapPairing: [5, 30, 120].every(gap => matches.some(x => x.gapSeconds === gap)),
    exactNativeHistoryPaired: false };
});
const complete = batch.completed.length === batch.stages.length || batch.stopReason !== null;
const failChecks = checks.filter(x => x.verdict === 'FAIL');
const qualificationWarnings = rows.filter(x => x.taskRejected).map(x => ({ rowId: x.rowId, reason: 'Raw response rejects the workload. Input/cost telemetry is retained, but this row and its next-followup comparison cannot establish accepted-task cache reuse.', category: x.refusalCategory }));
const audit = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), batchRoot: root, revision: batch.revision,
  batchSnapshotUpdatedAt: batch.updatedAt, batchFinished: complete, stopReason: batch.stopReason,
  allocationComplete: batch.completed.length === batch.stages.length && batch.completed.every((s: J) => s.status === 'completed') && rows.length === batch.plannedRequests,
  plannedRequests: batch.plannedRequests,
  stageReportsAvailable: reports.length, completedStages: batch.completed.length, plannedStages: batch.stages.length,
  counts: { attemptedRows: rows.length, successRows: rows.filter(x => x.status === 'ok').length, validRawUsageOneAttempt: rows.filter(x => x.status === 'ok' && x.rawCounts && x.transportAttemptCount === 1).length,
    passChecks: checks.filter(x => x.verdict === 'PASS').length, failChecks: failChecks.length, unknownChecks: checks.filter(x => x.verdict === 'UNKNOWN').length },
  ratesAsOf: '2026-10-17', ratesPerMillion: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, { input: v[0], read: v[1], write: v[2], output: v[3] }])),
  methodology: 'All derived counters come from rawResponse.usage/usageMetadata; only wireRequest supplies payload/history/fixture evidence. No application module is imported. Rates are independent fixed standard published rates. Normalized fields are compared only after independent derivation. Gemini omitted non-presence cache scalar decodes to zero by public proto3/ProtoJSON contract.',
  limitations: ['HTTP attempt count is instrumentation evidence, not an external network trace.', 'Eligible frontier is prior reported reads+writes for OpenAI/Anthropic only; Gemini implicit writes expose no corresponding frontier.', 'First requests are warm-up allocations, not proven backend-cold requests.', 'Timing uses first followups only; matching reference seed and fixture does not make independently generated native histories identical.', 'Failed attempts and invalid continuations remain visible and are excluded from reuse denominators.', 'Costs are usage-based estimates, not invoices. The all-prior-input baseline is a counterfactual, not a provider guarantee.'],
  failures: failChecks, qualificationWarnings, checks, trajectories, summaries, timingFirstFollowups: timing,
  rows: rows.map(({ _obs, _native, ...row }) => row),
};
writeFileSync(join(root, 'audit.json'), JSON.stringify(audit, null, 2) + '\n', { mode: 0o600 });
const lines = [`# Independent validation audit — ${complete ? 'final batch snapshot' : 'provisional, batch ongoing'}`, '',
  `Snapshot: ${batch.updatedAt}. Audited ${rows.length}/${batch.plannedRequests} planned requests across ${reports.length}/${batch.stages.length} stage reports. Stop reason: ${batch.stopReason ?? 'still running'}. Full allocation completed: ${audit.allocationComplete}.`, '',
  `${audit.counts.passChecks} checks passed; ${audit.counts.failChecks} failed; ${audit.counts.unknownChecks} remain unknown. Counters, costs, hashes, history, and fixtures were recomputed independently of application normalizers and metrics.`, '',
  '| Scenario | Model | Gap | Valid followups | Any reads | Prior-input coverage <95% | Strict64 full | Eligible frontier full |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...summaries.map(s => `| ${s.scenario} | ${s.model} | ${s.gapSeconds}s | ${s.followupDenominator} | ${s.anyReadFollowups}/${s.followupDenominator} | ${s.priorInputBelow95Percent}/${s.followupDenominator} | ${s.strict64FullHits}/${s.followupDenominator} | ${s.eligibleFrontierExactFullReuse}/${s.eligibleFrontierDenominator}${s.eligibleFrontierDenominator ? '' : ' (unavailable)'} |`), '',
  'Eligible frontier means the preceding publicly reported reads plus writes for OpenAI/Anthropic. Gemini has no exposed implicit-write frontier. Strict64 is the secondary whole-prior-input heuristic; <95% is the preregistered descriptive shortfall threshold. First rows, rejected workloads and their next comparison, failed attempts, invalid agent continuations, and unavailable counters do not enter accepted-task follow-up denominators. Their usage-based charges remain in cost totals.', '',
  `Observed invalid agent continuations: ${trajectories.flatMap(t => t.rawInvalidAgentResponses).length}. Failed transport/API observations: ${rows.filter(x => x.status !== 'ok').length}.`, '',
  '## First-followup timing windows', '',
  '| Model | Block | Gap | Actual idle ms | Read / prior input | Paired reference | Paired fixture |',
  '| --- | ---: | ---: | ---: | ---: | --- | --- |',
  ...timing.map(t => `| ${t.model} | ${t.block} | ${t.gapSeconds}s | ${Math.round(t.actualIdleGapMs ?? 0)} | ${t.readOverPriorInput === null ? 'unknown' : (100 * t.readOverPriorInput).toFixed(2) + '%'} | ${t.referenceWithoutNoncePaired} | ${t.firstToolFixturePaired} |`), '',
  'These compare t0→t1 only. Reference and deterministic fixture pairing does not imply identical generated native history. Three seed blocks are small, correlated trajectory samples; no provider-wide hit probability or internal cache mechanism is established.', '',
  '## Exceptions', '',
  ...(failChecks.length ? failChecks.map(c => `- FAIL ${c.check}: ${c.row}; ${JSON.stringify(c.detail ?? '')}`) : ['No integrity-check failures in the available snapshot.']), '',
  ...qualificationWarnings.map(w => `- QUALIFICATION: ${w.rowId}; rejected workload (${w.category ?? 'unspecified'}), excluded from accepted-task reuse comparisons.`), '',
  ...audit.limitations.map(x => `- ${x}`), '',
  'Machine-readable per-row derivations, exact hashes, denominator counts, and check results: [audit.json](audit.json).', ''];
writeFileSync(join(root, 'audit.md'), lines.join('\n'), { mode: 0o600 });
console.log(JSON.stringify({ batchFinished: complete, reports: reports.length, ...audit.counts, failures: failChecks.map(x => ({ check: x.check, row: x.row })) }, null, 2));
