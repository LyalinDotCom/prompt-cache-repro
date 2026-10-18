import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { resolveCodingConfig } from '../src/coding/config';
import { runCodingTrial } from '../src/coding/pi-runner';
import { seededRandom } from '../src/core/workload';
import { loadCodingFixture, matchesExpected, parseTestCounts } from '../src/coding/fixture';
import { codingRequestCost } from '../src/coding/cost';

const { values } = parseArgs({ options: { config: { type: 'string', default: 'config/coding-long.json' }, model: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
const raw = JSON.parse(readFileSync(resolve(values.config!), 'utf8'));
if (values.model) raw.models = values.model.split(',');
const config = resolveCodingConfig(raw);
config.profiles.sort((a, b) => a.model.localeCompare(b.model) || a.accountId.localeCompare(b.accountId));

function files(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).filter(entry => entry.name !== '.DS_Store').flatMap(entry => entry.isDirectory() ? files(root, join(directory, entry.name)) : [relative(root, join(directory, entry.name))]).sort();
}
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const hashes = (root: string) => Object.fromEntries(files(root).map(path => [path, hash(readFileSync(join(root, path)))]));
const fixtures = config.fixtures.map(id => {
  const { root, spec } = loadCodingFixture(id);
  const sourceFiles = files(root);
  // Provenance hash maps are retained on disk, not used as prompt padding.
  const snapshot = sourceFiles.filter(path => path !== 'UPSTREAM.json').map(path => `\n<file path="${path}">\n${readFileSync(join(root, path), 'utf8')}\n</file>\n`).join('');
  return { root, spec, sourceFiles, snapshot };
});
const dispatchOrder = Array.from({ length: config.trials }, (_, trial) => {
  const cells = config.profiles.flatMap(profile => fixtures.flatMap(fixture => config.gapsSeconds.map(gap => ({ profile, fixture, gap, trial }))));
  const random = seededRandom(`${config.seed}:trial-${trial}:order`);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return cells;
}).flat();
const plan = { protocol: config.fixtures.some(id => id.startsWith('coding-csv-')) ? 'docs/LONG_CONTEXT_PROTOCOL.md' : 'docs/METHODOLOGY.md', models: config.profiles.map(p => p.model), accounts: [...new Set(config.profiles.map(p => p.accountId))], trials: config.trials, gapsSeconds: config.gapsSeconds, seed: config.seed, shuffled: true, dispatchOrder: dispatchOrder.map(({ profile, fixture, gap, trial }, index) => ({ trialName: `${String(index + 1).padStart(2, '0')}-${profile.id.replaceAll(':', '_')}-${fixture.spec.id}-${gap}s-t${trial + 1}`, fixtureId: fixture.spec.id, model: profile.model, accountId: profile.accountId, gap, trial })), fixtures: fixtures.map(f => ({ ...f.spec, files: f.sourceFiles.length, contextCharacters: f.snapshot.length, snapshotSha256: hash(f.snapshot) })), sessionTimeoutMs: config.sessionTimeoutMs, reasoningLevel: config.reasoningLevel, maxOutputTokens: config.maxOutputTokens, termination: 'natural completion or 20-minute session deadline; no spending or request-count cutoff' };
if (values['dry-run']) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }

dotenv.config({ quiet: true });
const keys = Object.fromEntries(config.profiles.map(profile => {
  const value = profile.keyEnv ? process.env[profile.keyEnv] : undefined;
  if (!value) throw new Error(`Missing credential for ${profile.accountId}; no calls started.`);
  return [profile.accountId, value];
}));
const gitCommit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() ?? null;
const gitDirty = Boolean(spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout?.trim());
const harnessFiles = [...files(resolve('src')).map(p => join('src', p)), ...files(resolve('scripts')).map(p => join('scripts', p)), 'package.json', 'package-lock.json', 'docs/METHODOLOGY.md', plan.protocol, ...files(resolve('tools')).map(path => join('tools', path)), values.config!];
const sourceHashes = Object.fromEntries(harnessFiles.map(path => [path, hash(readFileSync(resolve(path)))]));
Object.assign(plan, { gitCommit, gitDirty, nodeVersion: process.version, fixtureHashes: Object.fromEntries(fixtures.map(f => [f.spec.id, hash(f.snapshot)])), sourceHashes });
const outputRoot = resolve('runs', `coding-${new Date().toISOString().replaceAll(':', '-')}`);
mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
for (const path of harnessFiles) { const destination = join(outputRoot, 'harness-source', path.replaceAll('..', '_')); mkdirSync(resolve(destination, '..'), { recursive: true }); cpSync(resolve(path), destination); }
const controller = new AbortController();
let knownSpendUsd = 0;
let stopReason: string | null = null;
const completed: Record<string, unknown>[] = [];
const manifest = () => writeFileSync(join(outputRoot, 'batch.json'), JSON.stringify({ ...plan, startedAt, updatedAt: new Date().toISOString(), knownSpendUsd, stopReason, completed }, null, 2) + '\n', { mode: 0o600 });
const startedAt = new Date().toISOString();
const interrupt = () => { stopReason = 'SIGINT'; controller.abort(); };
process.on('SIGINT', interrupt);
function tests(cwd: string, label: string, outDir: string, sourceFiles: string[]) {
  const testFiles = sourceFiles.filter(path => path.startsWith('test/') && path.endsWith('.test.mjs'));
  const result = spawnSync(process.execPath, ['--test', ...testFiles], { cwd, env: {}, encoding: 'utf8', timeout: 30000, maxBuffer: 5_000_000 });
  const stdoutFile = `${label}-tests.stdout.txt`, stderrFile = `${label}-tests.stderr.txt`;
  writeFileSync(join(outDir, stdoutFile), result.stdout ?? '');
  writeFileSync(join(outDir, stderrFile), result.stderr ?? '');
  return { exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, stdoutFile, stderrFile };
}
manifest();
console.log(`Coding evidence: ${outputRoot}`);
try {
  for (const { trial, gap, profile, fixture: task } of dispatchOrder) {
    if (controller.signal.aborted) break;
    const trialName = plan.dispatchOrder[completed.length].trialName;
    const outDir = join(outputRoot, trialName), cwd = join(outDir, 'workspace');
    mkdirSync(outDir, { recursive: true, mode: 0o700 });
    const { root: fixture, spec, sourceFiles, snapshot } = task;
    cpSync(fixture, cwd, { recursive: true });
    writeFileSync(join(outDir, 'fixture-spec.json'), JSON.stringify(spec, null, 2) + '\n');
    const beforeHashes = hashes(cwd);
    const baseline = tests(cwd, 'baseline', outDir, sourceFiles);
    const baselineText = readFileSync(join(outDir, baseline.stdoutFile), 'utf8');
    const baselineCounts = parseTestCounts(baselineText);
    if (baseline.exitCode === 0 || baseline.exitCode == null || !matchesExpected(baselineCounts, spec.expectedBaseline)) throw new Error('Fixture baseline differs from its declared failing tests; no calls started for this task.');
    const nonce = hash(randomUUID());
    const prompt = `Coding experiment identity: ${nonce}\n${readFileSync(join(cwd, 'TASK.md'), 'utf8')}\n\nThe following snapshot is the real initial repository. Work on files in your current directory. Run the actual tests before and after your fix; preserve tests and fixture data.\n${snapshot}`;
    console.log(`START ${profile.model} fixture=${spec.id} gap=${gap}s trial=${trial + 1}; context=${prompt.length} characters`);
    const report = await runCodingTrial({ profile, apiKey: keys[profile.accountId], cwd, prompt, outDir, fixture: spec, maxOutputTokens: config.maxOutputTokens, reasoningLevel: config.reasoningLevel, timeoutMs: config.sessionTimeoutMs, requestTimeoutMs: config.timeoutMs, gapSeconds: gap, signal: controller.signal,
      onRequest: (_report, request) => {
        const usage = request.usage;
        knownSpendUsd += codingRequestCost(profile, usage) ?? 0;
        manifest();
        console.log(JSON.stringify({ model: profile.model, input: usage?.inputTokens, read: usage?.cachedReadTokens, write: usage?.cacheWriteTokens, output: usage?.outputTokens, knownBatchUsd: +knownSpendUsd.toFixed(6) }));
      },
    });
    const final = tests(cwd, 'final', outDir, sourceFiles);
    const finalCounts = parseTestCounts(readFileSync(join(outDir, final.stdoutFile), 'utf8'));
    const finalCountsPassed = matchesExpected(finalCounts, { tests: spec.expectedBaseline.tests, pass: spec.expectedBaseline.tests, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
    const cli = spawnSync(process.execPath, spec.cliArgs, { cwd, env: {}, encoding: 'utf8', timeout: 30000, maxBuffer: 1_000_000 });
    writeFileSync(join(outDir, 'final-cli.stdout.json'), cli.stdout ?? '');
    writeFileSync(join(outDir, 'final-cli.stderr.txt'), cli.stderr ?? '');
    const afterHashes = hashes(cwd);
    const changed = [...new Set([...Object.keys(beforeHashes), ...Object.keys(afterHashes)])].filter(path => beforeHashes[path] !== afterHashes[path]);
    const immutableUnchanged = [...new Set([...Object.keys(beforeHashes), ...Object.keys(afterHashes)])].filter(path => !spec.mutablePaths.some(prefix => path.startsWith(prefix + '/'))).every(path => beforeHashes[path] === afterHashes[path]);
    const patch = spawnSync('git', ['diff', '--no-index', '--', fixture, cwd], { encoding: 'utf8', env: {}, maxBuffer: 5_000_000 });
    writeFileSync(join(outDir, 'patch.diff'), patch.stdout ?? '');
    let cliResult: unknown = null; try { cliResult = JSON.parse(cli.stdout ?? ''); } catch { /* Invalid CLI JSON fails qualification. */ }
    const cliPassed = cli.status === 0 && matchesExpected(cliResult, spec.expectedCli);
    const finalCli = { expected: spec.expectedCli, passed: cliPassed, exitCode: cli.status, stdoutFile: 'final-cli.stdout.json', stderrFile: 'final-cli.stderr.txt' };
    const functional = { fixtureId: spec.id, baseline, final, finalCli, beforeHashes, afterHashes, patchFile: 'patch.diff', changedFiles: changed, immutableUnchanged, qualified: report.status === 'completed' && final.exitCode === 0 && finalCountsPassed && cliPassed && immutableUnchanged && changed.some(path => path.startsWith('src/') || path.startsWith('bin/')) };
    writeFileSync(join(outDir, 'functional-qualification.json'), JSON.stringify(functional, null, 2) + '\n');
    const audit = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/audit-coding.ts'), outDir], { cwd: resolve('.'), env: {}, encoding: 'utf8', timeout: 30000, maxBuffer: 1_000_000 });
    writeFileSync(join(outDir, 'audit-command.stdout.txt'), audit.stdout ?? '');
    writeFileSync(join(outDir, 'audit-command.stderr.txt'), audit.stderr ?? '');
    const auditResult = existsSync(join(outDir, 'coding-audit.json')) ? JSON.parse(readFileSync(join(outDir, 'coding-audit.json'), 'utf8')) : null;
    const auditPassed = audit.status === 0 && auditResult?.checks?.length > 0 && auditResult.checks.every((check: { verdict: string }) => check.verdict === 'PASS');
    completed.push({ fixtureId: spec.id, auditPassed, trialName, model: profile.model, accountId: profile.accountId, gapSeconds: gap, trial, status: report.status, requests: report.requests.length, qualified: functional.qualified, finalTestExitCode: final.exitCode, auditExitCode: audit.status });
    manifest();
    console.log(`FINISH ${profile.model}: qualified=${functional.qualified}; requests=${report.requests.length}`);
  }
} catch (error) {
  // Expected SDK errors are already sanitized and retained by the Pi runner.
  stopReason = 'Harness stopped; inspect retained partial artifacts';
  console.error(error instanceof Error && !Object.values(keys).some(key => error.message.includes(key)) ? error.message : stopReason);
  process.exitCode = 1;
} finally {
  process.off('SIGINT', interrupt); manifest();
}
if (fixtures.some(f => f.spec.id.startsWith('coding-csv-'))) {
  const replay = spawnSync(process.execPath, ['--import', 'tsx', resolve('tools/verify-coding-repairs.ts'), outputRoot], { cwd: resolve('.'), env: {}, encoding: 'utf8', maxBuffer: 1_000_000 });
  writeFileSync(join(outputRoot, 'replay-command.stdout.txt'), replay.stdout ?? '');
  writeFileSync(join(outputRoot, 'replay-command.stderr.txt'), replay.stderr ?? '');
  for (const cell of completed.filter(cell => String(cell.fixtureId).startsWith('coding-csv-'))) {
    let verified = false;
    try { verified = JSON.parse(readFileSync(join(outputRoot, String(cell.trialName), 'library-only-verification.json'), 'utf8')).verified === true; } catch { /* Missing replay cannot qualify. */ }
    cell.libraryReplayVerified = verified;
    cell.qualified = Boolean(cell.qualified && verified);
  }
  if (replay.status !== 0) process.exitCode = 1;
  manifest();
}
const summary = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/summarize-coding.ts'), outputRoot, ...(completed.length === dispatchOrder.length ? ['--final'] : [])], { cwd: resolve('.'), env: {}, encoding: 'utf8', timeout: 30000, maxBuffer: 1_000_000 });
writeFileSync(join(outputRoot, 'summary-command.stdout.txt'), summary.stdout ?? '');
writeFileSync(join(outputRoot, 'summary-command.stderr.txt'), summary.stderr ?? '');
if (summary.status !== 0) { console.error('Offline batch summary needs attention; retained raw evidence is available.'); process.exitCode = 1; }
if (completed.length !== dispatchOrder.length || completed.some(task => !task.qualified || !task.auditPassed)) process.exitCode = stopReason === 'SIGINT' ? 130 : 1;
console.log(JSON.stringify({ outputRoot, knownSpendUsd, stopReason, completed }));
console.log(`Read the report: ${join(outputRoot, 'coding-summary.md')}`);
