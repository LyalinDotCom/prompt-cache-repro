import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
for (const variant of ['parse', 'stringify']) {
  const original = resolve('fixtures', `coding-csv-${variant}`), cwd = mkdtempSync(join(tmpdir(), `csv-oracle-${variant}-`));
  try {
    cpSync(original, cwd, { recursive: true });
    const run = args => spawnSync(process.execPath, args, { cwd, env: {}, encoding: 'utf8', timeout: 30000 });
    const baseline = run(['--test', 'test/regression.test.mjs']);
    if (baseline.status === 0) throw new Error('Seeded regression did not fail baseline.');
    const target = `src/upstream/packages/csv-${variant}/lib/api/index.js`, path = join(cwd, target);
    const seeded = readFileSync(path, 'utf8');
    const from = variant === 'parse' ? 'const errRecord = undefined;' : 'const containsdelimiter = false;';
    const to = variant === 'parse' ? 'const errRecord = this.__onRecord(push);' : 'const containsdelimiter = emits_separator(value, [delimiter]);';
    if (seeded.split(from).length !== 2) throw new Error('Unexpected seeded source.');
    const restored = seeded.replace(from, to), expected = JSON.parse(readFileSync(join(cwd, 'UPSTREAM.json'), 'utf8')).files[target].sha256;
    if (createHash('sha256').update(restored).digest('hex') !== expected) throw new Error('Restored source differs from pinned upstream.');
    writeFileSync(path, restored);
    const gold = run(['--test', 'test/regression.test.mjs']), cli = run(['bin/check.mjs']);
    if (gold.status !== 0 || cli.status !== 0) throw new Error('Pinned upstream failed acceptance checks.');
    console.log(JSON.stringify({ fixture: `coding-csv-${variant}`, baselineFailed: true, restoredSourceMatchesPinnedUpstream: true, goldTestsPassed: true, goldCli: JSON.parse(cli.stdout) }));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
