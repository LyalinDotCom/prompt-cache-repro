import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { resolveConfig } from '../src/cli';
import { runCodingTrial } from '../src/coding/pi-runner';
import { seededRandom } from '../src/core/workload';

const { values } = parseArgs({ options: { config: { type: 'string', default: 'config/coding.json' }, model: { type: 'string' }, shuffle: { type: 'boolean' }, 'dry-run': { type: 'boolean' } } });
const raw = JSON.parse(readFileSync(resolve(values.config!), 'utf8'));
const config = resolveConfig(raw, values.model ? { modelIds: values.model.split(',') } : {});
const modelOrder = ['gemini-4-argon', 'gpt-6.1-sol', 'gemini-3.8-flash', 'claude-opus-5-5'];
config.profiles.sort((a, b) => modelOrder.indexOf(a.model) - modelOrder.indexOf(b.model));
const fixture = resolve('fixtures/coding-ledger');
function files(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(root, join(directory, entry.name)) : [relative(root, join(directory, entry.name))]).sort();
}
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const sourceFiles = files(fixture);
const hashes = (root: string) => Object.fromEntries(files(root).map(path => [path, hash(readFileSync(join(root, path)))]));
const snapshot = sourceFiles.map(path => `\n<file path="${path}">\n${readFileSync(join(fixture, path), 'utf8')}\n</file>\n`).join('');
if (snapshot.length > 160000) throw new Error('Fixture exceeds the registered context limit.');
const dispatchOrder = Array.from({ length: config.trials }, (_, trial) => {
  const cells = config.profiles.flatMap(profile => config.gapsSeconds.map(gap => ({ profile, gap, trial })));
  const random = seededRandom(`${config.seed}:trial-${trial}:order`);
  if (values.shuffle) for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return cells;
}).flat();
const plan = { protocol: values.shuffle ? 'docs/CODING_CONFIRMATION_PROTOCOL.md' : 'docs/CODING_VALIDATION_PROTOCOL.md', models: config.profiles.map(p => p.model), accounts: [...new Set(config.profiles.map(p => p.accountId))], trials: config.trials, gapsSeconds: config.gapsSeconds, seed: config.seed, shuffled: Boolean(values.shuffle), dispatchOrder: dispatchOrder.map(({ profile, gap, trial }) => ({ model: profile.model, accountId: profile.accountId, gap, trial })), sourceFiles: sourceFiles.length, contextCharacters: snapshot.length, maxRequestsPerTask: config.turns, maxOutputTokens: config.maxOutputTokens, maxObservedUsd: config.maxEstimatedUsd };
if (values['dry-run']) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }

dotenv.config({ quiet: true });
const keys = Object.fromEntries(config.profiles.map(profile => {
  const value = profile.keyEnv ? process.env[profile.keyEnv] : undefined;
  if (!value) throw new Error(`Missing credential for ${profile.accountId}; no calls started.`);
  return [profile.accountId, value];
}));
const outputRoot = resolve('runs', `coding-${new Date().toISOString().replaceAll(':', '-')}`);
mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
const controller = new AbortController();
let knownSpendUsd = 0;
let stopReason: string | null = null;
const completed: Record<string, unknown>[] = [];
const manifest = () => writeFileSync(join(outputRoot, 'batch.json'), JSON.stringify({ ...plan, startedAt, updatedAt: new Date().toISOString(), knownSpendUsd, stopReason, completed }, null, 2) + '\n', { mode: 0o600 });
const startedAt = new Date().toISOString();
const timer = setTimeout(() => { stopReason = '30-minute deadline'; controller.abort(); }, 30 * 60 * 1000);
const interrupt = () => { stopReason = 'SIGINT'; controller.abort(); };
process.on('SIGINT', interrupt);
function tests(cwd: string, label: string, outDir: string) {
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
  for (const { trial, gap, profile } of dispatchOrder) {
    if (controller.signal.aborted) break;
    const trialName = `${String(completed.length + 1).padStart(2, '0')}-${profile.id.replaceAll(':', '_')}-${gap}s-t${trial + 1}`;
    const outDir = join(outputRoot, trialName), cwd = join(outDir, 'workspace');
    mkdirSync(outDir, { recursive: true, mode: 0o700 });
    cpSync(fixture, cwd, { recursive: true });
    const beforeHashes = hashes(cwd);
    const baseline = tests(cwd, 'baseline', outDir);
    if (baseline.exitCode === 0 || baseline.exitCode == null) throw new Error('Fixture baseline did not demonstrate the expected failing tests.');
    const nonce = hash(randomUUID());
    const prompt = `Coding experiment identity: ${nonce}\n${readFileSync(join(cwd, 'TASK.md'), 'utf8')}\n\nThe following snapshot is the real initial repository. Work on files in your current directory. Run the actual tests before and after your fix; preserve tests and fixture data.\n${snapshot}`;
    console.log(`START ${profile.model} gap=${gap}s trial=${trial + 1}; context=${prompt.length} characters`);
    const report = await runCodingTrial({ profile, apiKey: keys[profile.accountId], cwd, prompt, outDir, maxRequests: config.turns, maxOutputTokens: config.maxOutputTokens, timeoutMs: 480000, requestTimeoutMs: config.timeoutMs, gapSeconds: gap, signal: controller.signal,
      onRequest: (_report, request) => {
        const usage = request.usage, p = profile.pricing;
        if (usage && p && usage.uncachedInputTokens != null && usage.cachedReadTokens != null && usage.cacheWriteTokens != null) knownSpendUsd += (usage.uncachedInputTokens * p.input + usage.cachedReadTokens * p.cachedRead + usage.cacheWriteTokens * p.cacheWrite + usage.outputTokens * p.output) / 1e6;
        manifest();
        console.log(JSON.stringify({ model: profile.model, input: usage?.inputTokens, read: usage?.cachedReadTokens, write: usage?.cacheWriteTokens, output: usage?.outputTokens, knownBatchUsd: +knownSpendUsd.toFixed(6) }));
        if (knownSpendUsd >= config.maxEstimatedUsd) { stopReason = 'Known observed-spend soft stop'; controller.abort(); }
      },
    });
    const final = tests(cwd, 'final', outDir);
    const cli = spawnSync(process.execPath, ['bin/ledger.mjs', 'import', 'data/invoices.csv', '--payments', 'data/payments.csv', '--as-of', '2026-03-01', '--format', 'json'], { cwd, env: {}, encoding: 'utf8', timeout: 30000, maxBuffer: 1_000_000 });
    writeFileSync(join(outDir, 'final-cli.stdout.json'), cli.stdout ?? '');
    writeFileSync(join(outDir, 'final-cli.stderr.txt'), cli.stderr ?? '');
    const afterHashes = hashes(cwd);
    const changed = [...new Set([...Object.keys(beforeHashes), ...Object.keys(afterHashes)])].filter(path => beforeHashes[path] !== afterHashes[path]);
    const immutableUnchanged = Object.keys(beforeHashes).filter(path => !path.startsWith('src/') && !path.startsWith('bin/')).every(path => beforeHashes[path] === afterHashes[path]);
    const patch = spawnSync('git', ['diff', '--no-index', '--', fixture, cwd], { encoding: 'utf8', env: {}, maxBuffer: 5_000_000 });
    writeFileSync(join(outDir, 'patch.diff'), patch.stdout ?? '');
    const finalCli = { exitCode: cli.status, stdoutFile: 'final-cli.stdout.json', stderrFile: 'final-cli.stderr.txt' };
    const functional = { baseline, final, finalCli, beforeHashes, afterHashes, patchFile: 'patch.diff', changedFiles: changed, immutableUnchanged, qualified: report.status === 'completed' && final.exitCode === 0 && cli.status === 0 && immutableUnchanged && changed.some(path => path.startsWith('src/') || path.startsWith('bin/')) };
    writeFileSync(join(outDir, 'functional-qualification.json'), JSON.stringify(functional, null, 2) + '\n');
    const audit = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/audit-coding.ts'), outDir], { cwd: resolve('.'), env: {}, encoding: 'utf8', timeout: 30000, maxBuffer: 1_000_000 });
    writeFileSync(join(outDir, 'audit-command.stdout.txt'), audit.stdout ?? '');
    writeFileSync(join(outDir, 'audit-command.stderr.txt'), audit.stderr ?? '');
    completed.push({ trialName, model: profile.model, accountId: profile.accountId, gapSeconds: gap, trial, status: report.status, requests: report.requests.length, qualified: functional.qualified, finalTestExitCode: final.exitCode, auditExitCode: audit.status });
    manifest();
    console.log(`FINISH ${profile.model}: qualified=${functional.qualified}; requests=${report.requests.length}`);
  }
} catch (error) {
  // Expected SDK errors are already sanitized and retained by the Pi runner.
  stopReason = 'Harness stopped; inspect retained partial artifacts';
  console.error(error instanceof Error && !Object.values(keys).some(key => error.message.includes(key)) ? error.message : stopReason);
  process.exitCode = 1;
} finally {
  clearTimeout(timer); process.off('SIGINT', interrupt); manifest();
}
console.log(JSON.stringify({ outputRoot, knownSpendUsd, stopReason, completed }));
