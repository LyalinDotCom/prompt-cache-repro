/** Offline fresh-study report. No credentials, API calls, or automated provider verdicts. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

type J = Record<string, any>;
const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, final: { type: 'boolean' }, help: { type: 'boolean' } } });
if (values.help || positionals.length !== 1) {
  console.log('Usage: npx tsx scripts/summarize-coding.ts <batch-directory> [--out <report.md>] [--final]\nOffline descriptive report; no provider verdict is generated.');
  process.exit(values.help ? 0 : 1);
}
const root = resolve(positionals[0]);
const json = (path: string): J | null => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const text = (path: string): string => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const count = (output: string, field: string): number | null => { const m = [...output.matchAll(new RegExp(`^(?:#|ℹ)\\s+${field}\\s+(\\d+)\\b`, 'gm'))].at(-1); return m ? Number(m[1]) : null; };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const ratio = (a: number, b: number) => b > 0 ? a / b : null;
const pct = (v: number | null) => v === null ? 'unknown' : `${(100 * v).toFixed(2)}%`;
const usd = (v: number | null) => v === null ? 'unknown' : `$${v.toFixed(6)}`;
const md = (v: unknown) => String(v ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const manifest = json(join(root, 'batch.json'));
if (!manifest || !Array.isArray(manifest.dispatchOrder)) throw new Error('A batch manifest with its declared dispatch order is required.');
const declared = manifest.dispatchOrder.map((cell: J) => cell.trialName);
if (declared.some((name: unknown) => typeof name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(name as string)) || new Set(declared).size !== declared.length) throw new Error('Manifest must declare unique, safe trial names.');
const directories = declared.map((name: string) => join(root, name)).filter((directory: string) => existsSync(join(directory, 'coding-report.json')));
const undeclared = readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && existsSync(join(root, e.name, 'coding-report.json')) && !declared.includes(e.name)).map(e => e.name);
if (undeclared.length) throw new Error('Undeclared session artifacts found; they cannot be silently included in this study.');
const trials: J[] = directories.map(directory => {
  const report = json(join(directory, 'coding-report.json'))!;
  const audit = json(join(directory, 'coding-audit.json'));
  const f = json(join(directory, 'functional-qualification.json'));
  const baseline = text(join(directory, 'baseline-tests.stdout.txt')), finalTests = text(join(directory, 'final-tests.stdout.txt'));
  const checks = Array.isArray(audit?.checks) ? audit.checks : [];
  const failures = checks.filter((c: J) => c.verdict === 'FAIL').length;
  const unknowns = checks.filter((c: J) => c.verdict === 'UNKNOWN').length;
  const integrityFailures = checks.filter((c: J) => c.verdict === 'FAIL' && c.id !== 'functional').length;
  const captured = readdirSync(join(directory, 'requests')).filter(p => /^\d+-request\.json$/.test(p)).length;
  const rows: J[] = Array.isArray(audit?.rows) ? audit.rows : [];
  const hashesCurrent = Boolean(audit?.sourceArtifactHashes && Object.entries(audit.sourceArtifactHashes).length > 0 && Object.entries(audit.sourceArtifactHashes).every(([path, expected]) => { const target = resolve(directory, path); return target.startsWith(directory + '/') && existsSync(target) && createHash('sha256').update(readFileSync(target)).digest('hex') === expected; }));
  const current = Boolean(hashesCurrent && audit && audit.reportStatus === report.status && rows.length === captured && captured === report.requests.length);
  const audited = current && checks.length > 0 && failures === 0 && unknowns === 0;
  const validRows = current && integrityFailures === 0 ? rows.filter(r => r.httpStatus >= 200 && r.httpStatus < 300 && r.terminal && r.malformedFrames === 0 && !report.requests[r.index]?.error && r.tokens && ['input', 'read', 'write', 'ordinary', 'output'].every(k => Number.isSafeInteger(r.tokens[k]) && r.tokens[k] >= 0) && r.tokens.input === r.tokens.read + r.tokens.write + r.tokens.ordinary) : [];
  const validIndices = new Set(validRows.map(r => r.index));
  const followups = validRows.filter(r => validIndices.has(r.index - 1) && r.reuse && finite(r.reuse.priorInputTokens) && r.reuse.priorInputTokens > 0);
  const before = f?.beforeHashes ?? {}, after = f?.afterHashes ?? {};
  const spec = json(join(directory, 'fixture-spec.json'));
  if (!spec) throw new Error('fixture-spec.json is required for every coding session.');
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const mutable = (path: string) => spec.mutablePaths.some((prefix: string) => path.startsWith(prefix + '/'));
  const immutable = paths.filter(p => !mutable(p));
  const immutableUnchanged = immutable.length > 0 && immutable.every(p => before[p] === after[p]);
  const changed = paths.filter(p => before[p] !== after[p]);
  const sourceChanged = changed.some(mutable);
  const demo = json(join(directory, 'final-cli.stdout.json'));
  const matches = (actual: any, expected: any): boolean => expected === null || typeof expected !== 'object' ? actual === expected : actual !== null && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => matches(actual[key], value));
  const proof = json(join(directory, 'library-only-verification.json'));
  const applied = proof?.appliedLibraryFiles ?? {};
  const replaySource = manifest.sourceHashes?.['tools/verify-coding-repairs.ts'];
  const replayBound = Boolean(proof?.verified && proof.originalOraclesUnchanged && proof.verifierSourceSha256 === replaySource && changed.length > 0 && Object.keys(applied).length === changed.length && changed.every(path => Object.hasOwn(applied, path) && applied[path] === (after[path] ?? null)));
  const replayOutput = text(join(directory, 'library-only-tests.stdout.txt'));
  const finalCountsPass = count(finalTests, 'tests') === count(baseline, 'tests') && count(finalTests, 'pass') === count(baseline, 'tests') && ['fail', 'cancelled', 'skipped', 'todo'].every(field => count(finalTests, field) === 0);
  const libraryReplayVerified = spec.id.startsWith('coding-csv-') ? replayBound && count(replayOutput, 'pass') === count(baseline, 'tests') && count(replayOutput, 'tests') === count(baseline, 'tests') && ['fail', 'cancelled', 'skipped', 'todo'].every(field => count(replayOutput, field) === 0) && matches(json(join(directory, 'library-only-cli.stdout.json')), spec.expectedCli) : null;
  const functionalChecks = checks.filter((c: J) => c.id === 'functional');
  const functionalPassed = current && integrityFailures === 0 && functionalChecks.length > 0 && functionalChecks.every((c: J) => c.verdict === 'PASS');
  const repairVerified = functionalPassed && f?.baseline?.exitCode !== 0 && f?.baseline?.exitCode != null && (count(baseline, 'fail') ?? 0) > 0 && f?.final?.exitCode === 0 && finalCountsPass && immutableUnchanged && sourceChanged && f?.finalCli?.exitCode === 0 && matches(demo, spec.expectedCli) && (libraryReplayVerified ?? true);
  const inputCosts = validRows.map(r => r.independentCosts?.inputUsd);
  const outputCosts = validRows.map(r => r.independentCosts?.outputUsd);
  const declaredCell = manifest.dispatchOrder.find((cell: J) => cell.trialName === basename(directory));
  if (declaredCell.model !== report.profile.model || declaredCell.accountId !== report.profile.accountId || (declaredCell.fixtureId && declaredCell.fixtureId !== spec.id)) throw new Error('Session identity differs from declared experiment cell.');
  const finishReasons = Object.fromEntries([...new Set(rows.map(r => r.terminal ?? 'unknown'))].map(reason => [reason, rows.filter(r => (r.terminal ?? 'unknown') === reason).length]));
  const targetRows = spec.targetInputMin ? followups.filter(r => r.tokens.input >= spec.targetInputMin && r.reuse.priorInputTokens >= spec.targetInputMin) : [];
  return { targetReadTokens: sum(targetRows.map(r => r.tokens.read)), targetPriorInputTokens: sum(targetRows.map(r => r.reuse.priorInputTokens)), fixtureId: spec.id, targetInputMin: spec.targetInputMin ?? null, targetFollowups: spec.targetInputMin ? followups.filter(r => r.tokens.input >= spec.targetInputMin && r.reuse.priorInputTokens >= spec.targetInputMin).length : null, finishReasons, name: basename(directory), model: report.profile.model, accountId: report.profile.accountId, status: report.status, stopReason: report.stopReason, captured, audited, auditCurrent: current, integrityFailures, auditFailures: failures, auditUnknowns: unknowns, repairVerified, libraryReplayVerified, replayArtifactSha256: proof ? createHash('sha256').update(readFileSync(join(directory, 'library-only-verification.json'))).digest('hex') : null, naturalCompletion: report.status === 'completed', finalTestsPassed: count(finalTests, 'pass'), finalTestsFailed: count(finalTests, 'fail'), inputMin: validRows.length ? Math.min(...validRows.map(r => r.tokens.input)) : null, inputMax: validRows.length ? Math.max(...validRows.map(r => r.tokens.input)) : null, followups: followups.length, cachedReadTokens: sum(followups.map(r => r.tokens.read)), priorInputTokens: sum(followups.map(r => r.reuse.priorInputTokens)), maxPriorDeficit: followups.length ? Math.max(...followups.map(r => r.reuse.priorInputTokens - r.tokens.read)) : null, inputEstimateUsd: inputCosts.length && inputCosts.every(finite) ? sum(inputCosts) : null, outputEstimateUsd: outputCosts.length && outputCosts.every(finite) ? sum(outputCosts) : null, rows: validRows };
});
const planned = manifest.dispatchOrder.length;
const complete = trials.length === planned && manifest.completed?.length === planned && trials.every(t => t.status !== 'running');
if (values.final && (!complete || trials.some(t => !json(join(root, t.name, 'coding-audit.json'))))) throw new Error('--final requires every declared session and its independent audit; failed/unknown checks remain visible.');
const output = resolve(values.out ?? join(root, 'coding-summary.md'));
const link = (directory: string, label: string) => `[${md(label)}](${relative(dirname(output), directory).split('\\').join('/')}/coding-report.json)`;
const modelCells = [...new Set(manifest.dispatchOrder.map((c: J) => JSON.stringify([c.accountId, c.model])))];
const models = modelCells.map((key: string) => {
  const [accountId, model] = JSON.parse(key);
  const cells = trials.filter(t => t.model === model && t.accountId === accountId), followups = sum(cells.map(t => t.followups));
  return { accountId, model, planned: manifest.dispatchOrder.filter((c: J) => c.model === model && c.accountId === accountId).length, present: cells.length, verifiedRepairs: cells.filter(t => t.repairVerified).length, naturalCompletions: cells.filter(t => t.naturalCompletion).length, audited: cells.filter(t => t.audited).length, followups, targetFollowups: sum(cells.map(t => t.targetFollowups ?? 0)), targetWeightedPriorCapture: ratio(sum(cells.map(t => t.targetReadTokens)), sum(cells.map(t => t.targetPriorInputTokens))), weightedPriorCapture: ratio(sum(cells.map(t => t.cachedReadTokens)), sum(cells.map(t => t.priorInputTokens))), minInput: cells.some(t => t.inputMin !== null) ? Math.min(...cells.filter(t => t.inputMin !== null).map(t => t.inputMin)) : null, maxInput: cells.some(t => t.inputMax !== null) ? Math.max(...cells.filter(t => t.inputMax !== null).map(t => t.inputMax)) : null };
});
const lines = ['# Coding cache study', '', `**${values.final ? 'Completed descriptive report' : 'Provisional report'}**. ${trials.length}/${planned} declared sessions have artifacts. No provider-defect verdict is generated.`, '',
  'Cached reads and preceding input are different public counters. Their ratio does not establish how much input was eligible for caching. Explicit and implicit caching routes differ. Follow-ups within one session are correlated. Costs below are estimates from dated rate cards, not invoices.', '',
  '| Account / model | Sessions present / planned | Verified repairs | Natural completions | Audited sessions | Actual input range | Valid follow-ups | Reads / prior input | ≥250K follow-ups / capture |', '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |',
  ...models.map(m => `| ${md(m.accountId)} / ${md(m.model)} | ${m.present}/${m.planned} | ${m.verifiedRepairs} | ${m.naturalCompletions} | ${m.audited} | ${m.minInput ?? 'unknown'}–${m.maxInput ?? 'unknown'} | ${m.followups} | ${pct(m.weightedPriorCapture)} | ${m.targetFollowups} / ${pct(m.targetWeightedPriorCapture)} |`), '',
  'These input ranges measure occupancy, not advertised context capacity. An experiment is not a 250K-token study unless its actual input counters reach the registered target band. Source preload and organically accumulated history must be interpreted separately.', '',
  '| Session | Status / stop | Repair / clean replay | Requests | Audit FAIL / UNKNOWN | Actual input / ≥250K follow-ups | Reads / prior input | Final tests pass / fail | Largest prior deficit | Input / output estimate |', '| --- | --- | --- | ---: | --- | --- | ---: | --- | ---: | --- |',
  ...trials.map(t => `| ${link(join(root, t.name), `${t.model} · ${t.accountId} · ${t.fixtureId} · ${t.name}`)} | ${md(t.status)} ${md(t.stopReason ?? '')} | ${t.repairVerified} / ${t.libraryReplayVerified ?? 'n/a'} | ${t.captured} | ${t.auditFailures} / ${t.auditUnknowns}${t.audited ? '' : ' (telemetry incomplete)'} | ${t.inputMin ?? 'unknown'}–${t.inputMax ?? 'unknown'} / ${t.targetFollowups ?? 'n/a'} | ${pct(ratio(t.cachedReadTokens, t.priorInputTokens))} | ${t.finalTestsPassed ?? 'unknown'} / ${t.finalTestsFailed ?? 'unknown'} | ${t.maxPriorDeficit ?? 'unknown'} | ${usd(t.inputEstimateUsd)} / ${usd(t.outputEstimateUsd)} |`), '',
  'All attempted sessions remain visible. Cache aggregates above use current independent audits without failed integrity checks, including valid usage from unsuccessful repairs. Valid completed requests remain visible when an interrupted final request has unknown telemetry; that final request is excluded. Natural completion and fully passing session audits are reported separately. Failed or missing usage never becomes a cache miss. Functional repair and natural completion are separate outcomes. No confidence interval or provider-wide probability is inferred.', '',
  'Repair qualification requires passing functional checks, current evidence without integrity failures, exact complete test counts, unchanged declared acceptance material, the expected CLI result, and a bound clean library replay for CSV tasks. Natural completion and complete transport telemetry are separate outcomes. A trailing aborted inference may leave unknown telemetry while preserving an independently verified repair.', '',
];
const csv = (rows: J[], keys: string[]) => [keys.join(','), ...rows.map(row => keys.map(key => { const v = row[key] == null ? '' : typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key]); return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v; }).join(','))].join('\n') + '\n';
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, lines.join('\n'));
if (output !== join(root, 'coding-summary.md')) writeFileSync(join(root, 'coding-summary.md'), lines.join('\n'));
writeFileSync(join(root, 'trial-summary.csv'), csv(trials, ['name', 'fixtureId', 'targetInputMin', 'targetFollowups', 'model', 'accountId', 'status', 'stopReason', 'repairVerified', 'libraryReplayVerified', 'replayArtifactSha256', 'naturalCompletion', 'captured', 'audited', 'auditFailures', 'auditUnknowns', 'inputMin', 'inputMax', 'followups', 'maxPriorDeficit', 'inputEstimateUsd', 'outputEstimateUsd', 'finishReasons']));
writeFileSync(join(root, 'model-summary.csv'), csv(models, ['accountId', 'model', 'present', 'planned', 'verifiedRepairs', 'naturalCompletions', 'audited', 'minInput', 'maxInput', 'followups', 'weightedPriorCapture', 'targetFollowups', 'targetWeightedPriorCapture']));
writeFileSync(join(root, 'coding-summary.json'), JSON.stringify({ analysisSourceSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'), generatedAt: new Date().toISOString(), final: Boolean(values.final), complete, planned, source: { gitCommit: manifest.gitCommit, gitDirty: manifest.gitDirty, nodeVersion: manifest.nodeVersion, fixtureHashes: manifest.fixtureHashes ?? manifest.fixtureSha256, sourceHashes: manifest.sourceHashes }, sourceManifestSha256: createHash('sha256').update(readFileSync(join(root, 'batch.json'))).digest('hex'), models, trials: trials.map(({ rows, ...trial }) => trial) }, null, 2) + '\n');
console.log(JSON.stringify({ report: output, complete, sessions: trials.length, planned, verifiedRepairs: trials.filter(t => t.repairVerified).length }));
