/** Offline audit: standard-library only, derives usage from captured raw public-API response files. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
type J = Record<string, any>;
const input = resolve(process.argv[2] ?? (() => { throw new Error('Usage: npx tsx scripts/audit-coding.ts <trial-directory-or-coding-report.json>'); })());
const root = input.endsWith('.json') ? dirname(input) : input;
const sourceArtifactHashes: Record<string, string> = {};
function readEvidence(path: string): string {
  const contents = readFileSync(path);
  sourceArtifactHashes[relative(root, path)] = createHash('sha256').update(contents).digest('hex');
  return contents.toString('utf8');
}
const report = JSON.parse(readEvidence(input.endsWith('.json') ? input : join(root, 'coding-report.json'))) as J;
const digest = (v: string): string => createHash('sha256').update(v).digest('hex');
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const obj = (v: unknown): v is J => v !== null && typeof v === 'object' && !Array.isArray(v);
const near = (a: unknown, b: number): boolean => typeof a === 'number' && Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-10);
const checks: J[] = [];
const check = (name: string, id: string, ok: boolean | null, detail?: unknown): void => { checks.push({ check: name, id, verdict: ok === null ? 'UNKNOWN' : ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : { detail }) }); };
const safeArtifact = (relative: string): string => {
  const target = resolve(root, relative);
  if (!target.startsWith(root + '/') || /(^|\/)\.env(?:\.|$)/.test(relative)) throw new Error('Unsafe artifact path in report');
  return target;
};
function events(text: string): { objects: J[]; malformedFrames: number } {
  const objects: J[] = []; let malformedFrames = 0;
  const append = (x: unknown): void => { if (Array.isArray(x)) x.forEach(append); else if (obj(x)) objects.push(x); };
  try { append(JSON.parse(text)); }
  catch {
    for (const frame of text.replaceAll('\r\n', '\n').split(/\n\s*\n/)) {
      const data = frame.split('\n').filter(x => x.startsWith('data:')).map(x => x.slice(5).trimStart()).join('\n');
      if (!data || data.trim() === '[DONE]') continue;
      try { append(JSON.parse(data)); } catch { malformedFrames++; }
    }
  }
  return { objects, malformedFrames };
}
function rawUsage(provider: string, data: J[]): { usage: J | null; snapshots: number; terminal: string | null } {
  let usage: J | null = null, snapshots = 0, terminal: string | null = null;
  for (const e of data) {
    let u: unknown;
    if (provider === 'gemini') {
      u = e.usageMetadata;
      for (const c of e.candidates ?? []) if (c.finishReason) terminal = c.finishReason;
    } else if (provider === 'openai') {
      if (['response.completed', 'response.incomplete', 'response.failed'].includes(e.type)) { u = e.response?.usage; terminal = e.type; }
      else if (e.object === 'response') { u = e.usage; terminal = e.status ?? null; }
    } else {
      if (e.type === 'message_start') u = e.message?.usage;
      if (e.type === 'message_delta' || e.type === 'message') u = e.usage;
      if (e.delta?.stop_reason || e.stop_reason) terminal = e.delta?.stop_reason ?? e.stop_reason;
    }
    if (!obj(u)) continue;
    snapshots++;
    if (provider !== 'anthropic') usage = u;
    else {
      const prior: J = usage ?? {};
      usage = { ...prior, ...u };
      for (const key of ['cache_creation', 'output_tokens_details']) if (obj(prior[key]) && obj(u[key])) usage[key] = { ...prior[key], ...u[key] };
    }
  }
  return { usage, snapshots, terminal };
}
function partition(provider: string, u: J | null): J | null {
  if (!u) return null;
  let input: number, read: number, write: number, ordinary: number, output: number, thinking: number;
  let zeroDecoded = false;
  if (provider === 'gemini') {
    input = u.promptTokenCount; zeroDecoded = !Object.hasOwn(u, 'cachedContentTokenCount'); read = zeroDecoded ? 0 : u.cachedContentTokenCount;
    write = 0; ordinary = input - read; thinking = u.thoughtsTokenCount === undefined ? 0 : u.thoughtsTokenCount;
    const candidates = u.candidatesTokenCount === undefined ? 0 : u.candidatesTokenCount;
    if (!integer(candidates)) return null;
    output = candidates + thinking;
    if ((u.toolUsePromptTokenCount ?? 0) !== 0 || (u.totalTokenCount !== undefined && u.totalTokenCount !== input + output)) return null;
  } else if (provider === 'openai') {
    input = u.input_tokens; read = u.input_tokens_details?.cached_tokens; write = u.input_tokens_details?.cache_write_tokens;
    ordinary = input - read - write; output = u.output_tokens; thinking = u.output_tokens_details?.reasoning_tokens === undefined ? 0 : u.output_tokens_details.reasoning_tokens;
    if (u.total_tokens !== undefined && u.total_tokens !== input + output) return null;
  } else {
    ordinary = u.input_tokens; read = u.cache_read_input_tokens; write = u.cache_creation_input_tokens;
    input = ordinary + read + write; output = u.output_tokens; thinking = u.output_tokens_details?.thinking_tokens === undefined ? 0 : u.output_tokens_details.thinking_tokens;
    if ((u.cache_creation?.ephemeral_1h_input_tokens ?? 0) !== 0) return null;
    if (u.cache_creation && (!Object.values(u.cache_creation).every(integer) || Object.values(u.cache_creation).reduce<number>((a, b) => a + Number(b), 0) !== write)) return null;
  }
  return [input, read, write, ordinary, output, thinking].every(integer) && thinking <= output && input === ordinary + read + write
    ? { input, read, write, ordinary, output, thinking, zeroDecoded } : null;
}
function continuationEvidence(data: J[]): { signatures: string[]; toolCallIds: string[] } {
  const signatures = new Set<string>(), toolCallIds = new Set<string>(), anthropicSignatureParts = new Map<number, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!obj(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (['thoughtSignature', 'encrypted_content', 'signature'].includes(key) && typeof child === 'string' && child && value.type !== 'signature_delta') signatures.add(child);
      if (key === 'call_id' && value.type === 'function_call' && typeof child === 'string') toolCallIds.add(child);
      if (key === 'id' && value.type === 'tool_use' && typeof child === 'string') toolCallIds.add(child);
      if (key === 'functionCall' && obj(child) && typeof child.id === 'string') toolCallIds.add(child.id);
      visit(child);
    }
  };
  const completedOpenAIItems = data.filter(event => event.type === 'response.output_item.done').map(event => event.item).filter(obj);
  for (const event of data) {
    // Added items can contain partial encrypted blobs. Completed output items are usable
    // native continuation units; a terminal response may re-encode the same item differently.
    if (event.type?.startsWith?.('response.') || event.object === 'response') {
      if (!completedOpenAIItems.length && (['response.completed', 'response.incomplete'].includes(event.type) || event.object === 'response')) visit(event.response?.output ?? event.output);
    } else visit(event);
    if (event.type === 'content_block_delta' && event.delta?.type === 'signature_delta' && typeof event.delta.signature === 'string') anthropicSignatureParts.set(event.index, (anthropicSignatureParts.get(event.index) ?? '') + event.delta.signature);
  }
  completedOpenAIItems.forEach(visit);
  for (const signature of anthropicSignatureParts.values()) if (signature) signatures.add(signature);
  return { signatures: [...signatures], toolCallIds: [...toolCallIds] };
}
function history(wire: J | null): unknown[] | null { return wire?.contents ?? wire?.input ?? wire?.messages ?? null; }
function withoutCacheMarkers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCacheMarkers);
  if (!obj(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'cache_control' && k !== 'prompt_cache_breakpoint').map(([k, v]) => [k, withoutCacheMarkers(v)]));
}
const rateCards: Record<string, [number, number, number, number]> = {
  'gemini-4-argon': [2, .1, 2, 10], 'gemini-3.8-flash': [.75, .075, .75, 3.75],
  'gpt-6.1-sol': [2, .1, 2.5, 10], 'claude-opus-5-5': [4, .2, 5, 20], 'claude-sonnet-5-5': [2, .1, 2.5, 10],
};
const provider = report.profile.provider, requestedModel = report.profile.model, baseRate = rateCards[requestedModel];
const rows: J[] = [];
check('captured-model-request-present', 'transport', report.requests.length > 0);
const nativeMessagesPath = join(root, 'messages.json');
const nativeMessages = existsSync(nativeMessagesPath) ? JSON.parse(readEvidence(nativeMessagesPath)) : null;
const assistants = Array.isArray(nativeMessages) ? nativeMessages.filter(message => message.role === 'assistant') : null;
const interrupted = ['stopped', 'error'].includes(report.status);
// A final aborted inference may never dispatch HTTP (for example, cancellation in the idle gap).
// Conversely a failed fetch can exist without a committed assistant message. Neither proves a
// missing successful capture. Preserve uncertainty for that last turn and retain earlier rows.
const trailingAbortUncertain = assistants && interrupted && (
  (assistants.length === report.requests.length + 1 && ['aborted', 'error'].includes(assistants.at(-1)?.stopReason)) ||
  (assistants.length === report.requests.length - 1 && Boolean(report.requests.at(-1)?.error))
);
check('assistant-turns-match-captured-requests', 'transport', !assistants ? null : assistants.length === report.requests.length ? true : trailingAbortUncertain ? null : false, { captured: report.requests.length, assistantTurns: assistants?.length ?? null, trailingAbortUncertain: Boolean(trailingAbortUncertain) });
for (const [position, request] of report.requests.entries()) {
  const id = `request-${request.index}`;
  check('consecutive-captured-attempt-index', id, request.index === position);
  check('endpoint-excludes-query-and-auth', id, typeof request.endpoint === 'string' && !request.endpoint.includes('?') && !request.endpoint.includes('@'));
  let wire: J | null = null, wireText: string | null = null, body: string | null = null;
  try { wireText = readEvidence(safeArtifact(request.requestFile)); wire = JSON.parse(wireText); } catch { /* Unknown evidence remains unknown. */ }
  try { body = readEvidence(safeArtifact(request.responseFile)); } catch { /* Partial capture remains unknown. */ }
  check('captured-wire-hash', id, wire && wireText !== null ? digest(wireText) === request.requestHash : null);
  const endpointModel = provider === 'gemini' ? /\/models\/([^/:]+):/.exec(request.endpoint)?.[1] ?? null : wire?.model ?? null;
  check('actual-model-matches-requested', id, endpointModel === null ? null : endpointModel === requestedModel, endpointModel);
  const allowance = provider === 'gemini' ? wire?.generationConfig?.maxOutputTokens : provider === 'anthropic' ? wire?.max_tokens : wire?.max_output_tokens;
  check('declared-output-allowance-on-wire', id, integer(allowance) && integer(report.settings?.maxTokens) ? allowance === report.settings.maxTokens : null, allowance);
  const parsed = body === null ? { objects: [], malformedFrames: 0 } : events(body);
  const native = rawUsage(provider, parsed.objects), tokens = partition(provider, native.usage);
  const responseComplete = Boolean(request.completedAt && !request.error && native.terminal);
  check('raw-stream-frames-well-formed', id, parsed.malformedFrames === 0 ? true : request.error ? null : false);
  check('terminal-response-available', id, native.terminal ? true : null);
  const continuation = continuationEvidence(parsed.objects);
  check('raw-usage-available', id, native.usage ? tokens !== null : null, { usageSnapshots: native.snapshots, terminal: native.terminal });
  check('raw-usage-copy-agrees', id, native.usage && responseComplete ? equal(native.usage, request.rawUsage) : null);
  const declared = request.usage;
  if (tokens) check('reported-normalized-partition-agrees', id, responseComplete ? !!declared && declared.inputTokens === tokens.input && declared.cachedReadTokens === tokens.read && declared.cacheWriteTokens === tokens.write && declared.uncachedInputTokens === tokens.ordinary && declared.outputTokens === tokens.output : null);
  const longContext = requestedModel === 'gpt-6.1-sol' && tokens && tokens.input > 272000;
  const rate = baseRate ? baseRate.map((value: number, index: number) => value * (longContext ? index === 3 ? 1.5 : 2 : 1)) : null;
  const costs = tokens && rate ? { inputUsd: (tokens.ordinary * rate[0] + tokens.read * rate[1] + tokens.write * rate[2]) / 1e6, outputUsd: tokens.output * rate[3] / 1e6 } : null;
  const previous = rows.at(-1), previousTokens = previous?.tokens;
  let exactWireHistoryPrefixPreserved: boolean | null = null;
  if (previous?._wire && wire) {
    const currentJson = JSON.stringify(wire), priorHistory = history(previous._wire), currentHistory = history(wire);
    const staticFields = (value: J) => withoutCacheMarkers(Object.fromEntries(Object.entries(value).filter(([key]) => !['contents', 'input', 'messages'].includes(key))));
    check('non-history-wire-settings-preserved', id, equal(staticFields(previous._wire), staticFields(wire)));
    if (priorHistory && currentHistory) {
      exactWireHistoryPrefixPreserved = equal(currentHistory.slice(0, priorHistory.length), priorHistory);
      check('history-prefix-preserved-excluding-cache-markers', id, equal(withoutCacheMarkers(currentHistory.slice(0, priorHistory.length)), withoutCacheMarkers(priorHistory)));
    }
    if (previous._continuation.signatures.length) check('returned-native-signatures-preserved', id, previous._continuation.signatures.every((value: string) => currentJson.includes(JSON.stringify(value).slice(1, -1))), { signatures: previous._continuation.signatures.length });
    if (previous._continuation.toolCallIds.length) check('real-tool-call-ids-preserved', id, previous._continuation.toolCallIds.every((value: string) => currentJson.includes(JSON.stringify(value))), { toolCallIds: previous._continuation.toolCallIds.length });
  }
  const previousValid = previous?.responseComplete && previous.malformedFrames === 0 && previous.httpStatus >= 200 && previous.httpStatus < 300 && previousTokens?.input > 0;
  const reuse: J | null = responseComplete && parsed.malformedFrames === 0 && request.httpStatus >= 200 && request.httpStatus < 300 && tokens && previousValid ? {
    priorInputTokens: previousTokens.input, readOverPriorInput: tokens.read / previousTokens.input,
    priorInputDeficitTokens: previousTokens.input - tokens.read,
    readModulo1024: tokens.read % 1024, readModulo2048: tokens.read % 2048,
    priorInputBelow95Percent: tokens.read < .95 * previousTokens.input,
    strict64WholePriorInputFullHit: tokens.read > 0 && tokens.read >= previousTokens.input - 64,
    priorPublicCacheFrontierTokens: provider === 'gemini' ? null : previousTokens.read + previousTokens.write,
  } : null;
  if (reuse && reuse.priorPublicCacheFrontierTokens !== null) {
    reuse.eligibleFrontierFullyReused = reuse.priorPublicCacheFrontierTokens > 0 ? tokens!.read >= reuse.priorPublicCacheFrontierTokens : null;
    reuse.eligibleFrontierShortfallTokens = Math.max(0, reuse.priorPublicCacheFrontierTokens - tokens!.read);
  }
  if (reuse && rate && tokens) {
    reuse.fullPriorInputCounterfactualUsd = (Math.min(previousTokens.input, tokens.input) * rate[1] + Math.max(0, tokens.input - previousTokens.input) * (provider === 'gemini' ? rate[0] : rate[2])) / 1e6;
    reuse.actualVsFullPriorInputCounterfactual = costs!.inputUsd / reuse.fullPriorInputCounterfactualUsd;
    if (reuse.priorPublicCacheFrontierTokens !== null) {
      const frontier = reuse.priorPublicCacheFrontierTokens;
      reuse.eligibleFrontierCounterfactualUsd = (tokens.ordinary * rate[0] + Math.min(frontier, tokens.input - tokens.ordinary) * rate[1] + Math.max(0, tokens.input - tokens.ordinary - frontier) * rate[2]) / 1e6;
      reuse.actualVsEligibleFrontierCounterfactual = costs!.inputUsd / reuse.eligibleFrontierCounterfactualUsd;
    }
  }
  const responseModels = [...new Set(parsed.objects.flatMap(e => [e.modelVersion, e.response?.model, e.message?.model, e.object === 'response' ? e.model : undefined].filter(Boolean)))];
  rows.push({ id, index: request.index, endpoint: request.endpoint, actualRequestModel: endpointModel, reportedResponseModels: responseModels,
    responseComplete, transportError: request.error ?? null, httpStatus: request.httpStatus, startedAt: request.startedAt, durationMs: request.durationMs, actualIdleGapMs: request.actualIdleGapMs,
    requestFile: request.requestFile, responseFile: request.responseFile, requestHash: request.requestHash,
    recordedTransportAttemptCount: request.transportAttemptCount ?? null,
    appliedRatesPerMillion: rate ? { ordinary: rate[0], read: rate[1], write: rate[2], output: rate[3] } : null, pricingContext: longContext ? 'long' : 'standard',
    rawUsage: native.usage, usageSnapshots: native.snapshots, terminal: native.terminal, malformedFrames: parsed.malformedFrames,
    tokens, independentCosts: costs, reuse, capturedError: request.error ?? null,
    nativeSignatureValues: continuation.signatures.length, nativeToolCallIds: continuation.toolCallIds.length,
    exactWireHistoryPrefixPreserved,
    _wire: wire, _continuation: continuation });
}

let functional: J | null = null;
const functionalFile = join(root, 'functional-qualification.json');
if (existsSync(functionalFile)) {
  const f = JSON.parse(readEvidence(functionalFile)) as J;
  const readOutput = (r: J, key: string): string | null => { try { return readEvidence(safeArtifact(r[key])); } catch { return null; } };
  const before: J = f.beforeHashes ?? {}, after: J = f.afterHashes ?? {};
  const fixtureSpecPath = join(root, 'fixture-spec.json');
  if (!existsSync(fixtureSpecPath)) throw new Error('fixture-spec.json is required for functional auditing.');
  const fixtureSpec = JSON.parse(readEvidence(fixtureSpecPath));
  const mutablePaths: string[] = Array.isArray(fixtureSpec.mutablePaths) ? fixtureSpec.mutablePaths : [];
  const allPaths = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const mutable = (path: string) => mutablePaths.some(prefix => path.startsWith(prefix + '/'));
  const immutable = allPaths.filter(p => !mutable(p));
  const changedSource = allPaths.filter(p => mutable(p) && before[p] !== after[p]);
  check('declared-mutable-paths-present', 'functional', mutablePaths.length ? true : null);
  check('actual-baseline-process-failed', 'functional', integer(f.baseline?.exitCode) ? f.baseline.exitCode !== 0 : null, f.baseline?.exitCode);
  check('actual-final-process-passed', 'functional', integer(f.final?.exitCode) ? f.final.exitCode === 0 : null, f.final?.exitCode);
  const baselineOut = f.baseline ? readOutput(f.baseline, 'stdoutFile') : null, finalOut = f.final ? readOutput(f.final, 'stdoutFile') : null;
  check('baseline-test-output-shows-failures', 'functional', baselineOut === null ? null : /(?:#|ℹ)\s+fail [1-9]\d*/.test(baselineOut));
  check('final-test-output-shows-pass-and-zero-failures', 'functional', finalOut === null ? null : /(?:#|ℹ)\s+fail 0\b/.test(finalOut) && /(?:#|ℹ)\s+pass [1-9]\d*/.test(finalOut));
  const count = (output: string, field: string) => { const m = [...output.matchAll(new RegExp(`^(?:#|ℹ)\\s+${field}\\s+(\\d+)\\b`, 'gm'))].at(-1); return m ? Number(m[1]) : null; };
  const fields = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
  check('exact-declared-baseline-counts', 'functional', baselineOut && fixtureSpec.expectedBaseline ? fields.every(field => count(baselineOut, field) === fixtureSpec.expectedBaseline[field]) : null);
  check('entire-final-suite-passed-without-skips', 'functional', finalOut && fixtureSpec.expectedBaseline ? count(finalOut, 'tests') === fixtureSpec.expectedBaseline.tests && count(finalOut, 'pass') === fixtureSpec.expectedBaseline.tests && ['fail', 'cancelled', 'skipped', 'todo'].every(field => count(finalOut, field) === 0) : null);
  check('immutable-tests-and-inputs-unchanged', 'functional', immutable.length ? immutable.every(p => before[p] === after[p]) : null, { immutableFiles: immutable.length });
  check('actual-source-edit-present', 'functional', Object.keys(before).length ? changedSource.length > 0 : null, changedSource);
  let patch: string | null = null;
  try { patch = readEvidence(safeArtifact(f.patchFile)); } catch { /* Unknown, not inferred from model text. */ }
  check('actual-source-diff-present', 'functional', patch === null ? null : /^diff --git [^\n]*\/(?:src|bin)\/[^\n]+$/m.test(patch) && /^@@/m.test(patch));
  const actualAfterMismatches: string[] = [];
  for (const [path, expected] of Object.entries(after)) {
    if (path.includes('..') || path.startsWith('/')) { actualAfterMismatches.push(path); continue; }
    try { const target = join(root, 'workspace', path); readEvidence(target); if (sourceArtifactHashes[relative(root, target)] !== expected) actualAfterMismatches.push(path); }
    catch { actualAfterMismatches.push(path); }
  }
  check('current-fixture-files-match-recorded-final-hashes', 'functional', Object.keys(after).length ? actualAfterMismatches.length === 0 : null, actualAfterMismatches);
  let finalCli: J | null = null;
  if (f.finalCli) {
    let result: J | null = null;
    const output = readOutput(f.finalCli, 'stdoutFile');
    try { result = output === null ? null : JSON.parse(output); } catch { /* Unknown JSON output. */ }
    const specFile = join(root, 'fixture-spec.json');
    const spec = existsSync(specFile) ? JSON.parse(readEvidence(specFile)) : { id: 'coding-ledger', expectedCli: { counts: { sourceRows: 4, accepted: 4, rejected: 0, conflicts: 0 } } };
    const matches = (actual: any, expected: any): boolean => expected === null || typeof expected !== 'object' ? actual === expected : actual !== null && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => matches(actual[key], value));
    check('actual-final-cli-demo-passed', 'functional', result ? f.finalCli.exitCode === 0 && matches(result, spec.expectedCli) : null);
    finalCli = { exitCode: f.finalCli.exitCode ?? null, verifiedAfterTrial: f.finalCli.verifiedAfterTrial === true, counts: result?.counts ?? null, stdoutFile: f.finalCli.stdoutFile };
  }
  functional = { baselineExitCode: f.baseline?.exitCode ?? null, finalExitCode: f.final?.exitCode ?? null, immutableFileCount: immutable.length, changedSourceFiles: changedSource, patchFile: f.patchFile ?? null, finalCli };
} else check('functional-qualification-artifact-present', 'functional', null);

const failures = checks.filter(x => x.verdict === 'FAIL'), unknowns = checks.filter(x => x.verdict === 'UNKNOWN');
const validRows = rows.filter(x => x.tokens && x.responseComplete && x.malformedFrames === 0 && x.httpStatus >= 200 && x.httpStatus < 300);
const followups = validRows.filter(x => x.reuse), frontierRows = followups.filter(x => x.reuse.eligibleFrontierFullyReused !== null && x.reuse.eligibleFrontierFullyReused !== undefined);
const followupActualInputUsd = followups.reduce((sum, x) => sum + (x.independentCosts?.inputUsd ?? 0), 0);
const theoreticalInputUsd = followups.reduce((sum, x) => sum + (x.reuse.fullPriorInputCounterfactualUsd ?? 0), 0);
const eligibleInputUsd = frontierRows.reduce((sum, x) => sum + (x.reuse.eligibleFrontierCounterfactualUsd ?? 0), 0);
const audit = { schemaVersion: 1, generatedAt: new Date().toISOString(), trialRoot: root, provider, requestedModel, reportStatus: report.status, stopReason: report.stopReason,
  derivation: 'Independent raw SSE/JSON parsing. OpenAI terminal usage only; Gemini latest usageMetadata; Anthropic start/delta counters overwrite cumulative values, never sum. No application imports.',
  auditorSourceSha256: digest(readFileSync(new URL(import.meta.url), 'utf8')),
  ratesAsOf: '2026-10-17', standardRatesPerMillion: baseRate ? { ordinary: baseRate[0], read: baseRate[1], write: baseRate[2], output: baseRate[3] } : null, appliedRatesPerRequest: true,
  totals: { capturedTransportAttempts: rows.length, validRawUsageAttempts: validRows.length, unknownUsageAttempts: rows.filter(x => !x.tokens).length,
    usageBasedInputUsd: validRows.reduce((sum, x) => sum + (x.independentCosts?.inputUsd ?? 0), 0), usageBasedOutputUsd: validRows.reduce((sum, x) => sum + (x.independentCosts?.outputUsd ?? 0), 0),
    followupDenominator: followups.length, priorInputBelow95Percent: followups.filter(x => x.reuse.priorInputBelow95Percent).length,
    eligibleFrontierDenominator: frontierRows.length, eligibleFrontierFullyReused: frontierRows.filter(x => x.reuse.eligibleFrontierFullyReused).length,
    followupActualInputUsd, fullPriorInputCounterfactualUsd: followups.length && baseRate ? theoreticalInputUsd : null,
    followupActualVsFullPriorInputCounterfactual: theoreticalInputUsd > 0 ? followupActualInputUsd / theoreticalInputUsd : null,
    eligibleFrontierCounterfactualUsd: frontierRows.length && baseRate ? eligibleInputUsd : null,
    followupActualVsEligibleFrontierCounterfactual: eligibleInputUsd > 0 ? frontierRows.reduce((sum, x) => sum + x.independentCosts.inputUsd, 0) / eligibleInputUsd : null,
    passChecks: checks.length - failures.length - unknowns.length, failChecks: failures.length, unknownChecks: unknowns.length },
  limitations: ['Each record is one captured fetch invocation; logical model-request retries may produce multiple records and must not be collapsed.', 'Missing raw usage stays unknown. Interrupted or unreported charges can exceed known usage costs.', 'Gemini has no exposed implicit-write frontier; prior-input coverage is descriptive, not documented eligibility.', 'A patch and passing tests establish this task result, not general coding quality.', 'A functional qualification is unknown until actual baseline/final command outputs and immutable test hashes are supplied.'],
  sourceArtifactHashes, functional, checks, rows: rows.map(({ _wire, _continuation, ...row }) => row) };
writeFileSync(join(root, 'coding-audit.json'), JSON.stringify(audit, null, 2) + '\n', { mode: 0o600 });
const text = [`# Independent coding audit`, '', `Model: ${requestedModel}. Captured transport attempts: ${rows.length}; valid raw usage: ${validRows.length}; unknown usage: ${audit.totals.unknownUsageAttempts}.`, '',
  `Checks: ${audit.totals.passChecks} PASS, ${failures.length} FAIL, ${unknowns.length} UNKNOWN. Model final text is never used as proof of a patch or passing tests.`, '',
  '| Attempt | HTTP | Input | Reads | Writes | Ordinary | Output | Read/prior input |', '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map(x => `| ${x.index} | ${x.httpStatus ?? 'unknown'} | ${x.tokens?.input ?? 'unknown'} | ${x.tokens?.read ?? 'unknown'} | ${x.tokens?.write ?? 'unknown'} | ${x.tokens?.ordinary ?? 'unknown'} | ${x.tokens?.output ?? 'unknown'} | ${x.reuse ? (100 * x.reuse.readOverPriorInput).toFixed(2) + '%' : '—'} |`), '',
  `Input charge estimate: $${audit.totals.usageBasedInputUsd.toFixed(8)}. Output charge estimate: $${audit.totals.usageBasedOutputUsd.toFixed(8)}.`, '',
  `Previous-input coverage below 95%: ${audit.totals.priorInputBelow95Percent}/${followups.length}. Public eligible frontier fully reused: ${audit.totals.eligibleFrontierFullyReused}/${frontierRows.length}${provider === 'gemini' ? ' (implicit-write frontier unavailable)' : ''}.`, '',
  `Follow-up input charges: $${followupActualInputUsd.toFixed(8)}; whole-prior-input counterfactual: ${theoreticalInputUsd > 0 ? '$' + theoreticalInputUsd.toFixed(8) + ' (' + (followupActualInputUsd / theoreticalInputUsd).toFixed(4) + '×)' : 'unavailable'}. This counterfactual is separate from an eligible-cache guarantee.`, '',
  '## Functional qualification', '', functional ? `Baseline exit: ${functional.baselineExitCode}; final exit: ${functional.finalExitCode}; changed source: ${functional.changedSourceFiles.join(', ') || 'none'}; immutable files checked: ${functional.immutableFileCount}.` : 'UNKNOWN: functional-qualification.json has not been supplied.', '',
  ...[...failures, ...unknowns].map(x => `- ${x.verdict} ${x.check}: ${x.id}; ${JSON.stringify(x.detail ?? '')}`), '',
  ...audit.limitations.map(x => `- ${x}`), '', 'Per-attempt raw-counter derivations and check details: [coding-audit.json](coding-audit.json).', ''].join('\n');
writeFileSync(join(root, 'coding-audit.md'), text, { mode: 0o600 });
console.log(JSON.stringify({ trialRoot: root, ...audit.totals, failures }, null, 2));
