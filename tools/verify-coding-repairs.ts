/** Re-run only model library edits in a clean fixture with untouched adapters and acceptance code. */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { loadCodingFixture, matchesExpected } from '../src/coding/fixture';
const batch = resolve(process.argv[2] ?? (() => { throw new Error('Pass a coding batch directory.'); })());
const manifest = JSON.parse(readFileSync(join(batch, 'batch.json'), 'utf8'));
const hash = (path: string | URL) => createHash('sha256').update(readFileSync(path)).digest('hex');
function files(root: string, path = root): string[] { return readdirSync(path, { withFileTypes: true }).filter(entry => entry.name !== '.DS_Store').flatMap(entry => entry.isDirectory() ? files(root, join(path, entry.name)) : [relative(root, join(path, entry.name))]).sort(); }
function count(text: string, field: string) { const match = [...text.matchAll(new RegExp(`^(?:#|ℹ)\\s+${field}\\s+(\\d+)\\b`, 'gm'))].at(-1); return match ? Number(match[1]) : null; }
for (const cell of manifest.dispatchOrder) {
  if (!/^[A-Za-z0-9._-]+$/.test(cell.trialName)) throw new Error('Unsafe trial name.');
  const root = join(batch, cell.trialName), functionalPath = join(root, 'functional-qualification.json');
  if (!cell.fixtureId?.startsWith('coding-csv-') || !existsSync(functionalPath)) continue;
  const report = JSON.parse(readFileSync(join(root, 'coding-report.json'), 'utf8'));
  if (report.status === 'running') continue;
  const f = JSON.parse(readFileSync(functionalPath, 'utf8')), { root: fixture, spec } = loadCodingFixture(cell.fixtureId);
  const originalFiles = files(fixture);
  if (originalFiles.length !== Object.keys(f.beforeHashes).length || originalFiles.some(path => hash(join(fixture, path)) !== f.beforeHashes[path])) throw new Error('Fixture no longer matches the actual run baseline.');
  const replay = join(root, 'library-only-replay-workspace');
  if (existsSync(replay)) rmSync(replay, { recursive: true });
  cpSync(fixture, replay, { recursive: true });
  const changed = [...new Set([...Object.keys(f.beforeHashes), ...Object.keys(f.afterHashes)])].filter(path => f.beforeHashes[path] !== f.afterHashes[path]);
  const changedLibrary = changed.filter(path => path.startsWith('src/upstream/') && !path.split('/').includes('..'));
  const discardedNonLibraryChanges = changed.filter(path => !changedLibrary.includes(path));
  const finalFiles = files(join(root, 'workspace'));
  const recordedFinalMatches = finalFiles.length === Object.keys(f.afterHashes).length && finalFiles.every(path => hash(join(root, 'workspace', path)) === f.afterHashes[path]);
  if (!recordedFinalMatches) {
    writeFileSync(join(root, 'library-only-verification.json'), JSON.stringify({ verified: false, fixtureId: spec.id, error: 'Workspace differs from recorded final hashes.' }, null, 2) + '\n');
    console.log(JSON.stringify({ session: cell.trialName, verified: false, error: 'Workspace differs from recorded final hashes.' })); process.exitCode = 1; continue;
  }
  const appliedHashes: Record<string, string | null> = {};
  for (const path of changedLibrary) {
    const source = join(root, 'workspace', path), destination = join(replay, path);
    if (f.afterHashes[path] === undefined) { rmSync(destination, { force: true }); appliedHashes[path] = null; }
    else { mkdirSync(resolve(destination, '..'), { recursive: true }); cpSync(source, destination); appliedHashes[path] = hash(source); }
  }
  const tests = spawnSync(process.execPath, ['--test', ...originalFiles.filter(path => path.startsWith('test/') && path.endsWith('.test.mjs'))], { cwd: replay, env: {}, encoding: 'utf8', timeout: 30000, maxBuffer: 5_000_000 });
  const cli = spawnSync(process.execPath, spec.cliArgs, { cwd: replay, env: {}, encoding: 'utf8', timeout: 30000, maxBuffer: 1_000_000 });
  writeFileSync(join(root, 'library-only-tests.stdout.txt'), tests.stdout ?? ''); writeFileSync(join(root, 'library-only-tests.stderr.txt'), tests.stderr ?? '');
  writeFileSync(join(root, 'library-only-cli.stdout.json'), cli.stdout ?? ''); writeFileSync(join(root, 'library-only-cli.stderr.txt'), cli.stderr ?? '');
  let cliJson: unknown = null; try { cliJson = JSON.parse(cli.stdout ?? ''); } catch { /* Invalid output cannot qualify. */ }
  const stdout = tests.stdout ?? '', counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(field => [field, count(stdout, field)]));
  const immutable = [...new Set([...Object.keys(f.beforeHashes), ...Object.keys(f.afterHashes)])].filter(path => !spec.mutablePaths.some(prefix => path.startsWith(prefix + '/')));
  const originalOraclesUnchanged = immutable.every(path => f.beforeHashes[path] === f.afterHashes[path]);
  const verified = recordedFinalMatches && discardedNonLibraryChanges.length === 0 && changedLibrary.length > 0 && originalOraclesUnchanged && tests.status === 0 && counts.tests === spec.expectedBaseline.tests && counts.pass === spec.expectedBaseline.tests && counts.fail === 0 && counts.cancelled === 0 && counts.skipped === 0 && counts.todo === 0 && cli.status === 0 && matchesExpected(cliJson, spec.expectedCli);
  const result = { generatedAt: new Date().toISOString(), verifierSourceSha256: hash(new URL(import.meta.url)), fixtureId: spec.id, model: report.profile.model, verified, originalOraclesUnchanged, recordedFinalMatches, discardedNonLibraryChanges, appliedLibraryFiles: appliedHashes, tests: { exitCode: tests.status, counts, stdoutFile: 'library-only-tests.stdout.txt', stderrFile: 'library-only-tests.stderr.txt' }, cli: { exitCode: cli.status, expected: spec.expectedCli, stdoutFile: 'library-only-cli.stdout.json', stderrFile: 'library-only-cli.stderr.txt' } };
  writeFileSync(join(root, 'library-only-verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ session: cell.trialName, verified, appliedLibraryFiles: changedLibrary.length, counts }));
  if (!verified) process.exitCode = 1;
}
