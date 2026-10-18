import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LEDGER_FIXTURE } from '../src/coding/fixture';

const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
function study() {
  const root = mkdtempSync(join(tmpdir(), 'cachebench-report-')); roots.push(root);
  const dispatchOrder = ['paid', 'free'].map(accountId => ({ trialName: accountId, model: 'gemini-4-argon', accountId }));
  writeFileSync(join(root, 'batch.json'), JSON.stringify({ dispatchOrder, completed: dispatchOrder }));
  for (const [i, cell] of dispatchOrder.entries()) {
    const path = join(root, cell.trialName); mkdirSync(join(path, 'requests'), { recursive: true });
    writeFileSync(join(path, 'fixture-spec.json'), JSON.stringify(LEDGER_FIXTURE));
    const report = JSON.stringify({ profile: cell, status: 'stopped', stopReason: 'Trial deadline', requests: [{}, {}, { error: 'Trial deadline' }] });
    writeFileSync(join(path, 'coding-report.json'), report);
    for (let n = 0; n < 3; n++) writeFileSync(join(path, 'requests', `${n}-request.json`), '{}');
    writeFileSync(join(path, 'coding-audit.json'), JSON.stringify({ reportStatus: 'stopped', sourceArtifactHashes: { 'coding-report.json': digest(report) }, checks: [{ verdict: 'PASS' }, { verdict: 'UNKNOWN', id: 'request-2' }], rows: [
      ...[0, 1].map(index => ({ index, httpStatus: 200, terminal: 'STOP', malformedFrames: 0, tokens: { input: 250000, read: (i + 1) * 100000, write: 0, ordinary: 250000 - (i + 1) * 100000, output: 10 }, reuse: index ? { priorInputTokens: 250000 } : null })),
      { index: 2, httpStatus: 200, terminal: null, tokens: null },
    ] }));
  }
  return root;
}
function summarize(root: string) { execFileSync(process.execPath, ['--import', 'tsx', resolve('scripts/summarize-coding.ts'), root], { stdio: 'pipe' }); return JSON.parse(readFileSync(join(root, 'coding-summary.json'), 'utf8')); }
it('keeps account cells separate and retains valid telemetry before a deadline-truncated final request', () => {
  const result = summarize(study());
  expect(result.models).toHaveLength(2);
  expect(result.models.map((cell: any) => [cell.accountId, cell.weightedPriorCapture, cell.followups])).toEqual([['paid', .4, 1], ['free', .8, 1]]);
  expect(result.models.every((cell: any) => cell.audited === 0 && cell.minInput === 250000)).toBe(true);
});
it('rejects undeclared sessions and stops stale audits from contributing telemetry', () => {
  const root = study();
  writeFileSync(join(root, 'paid', 'coding-report.json'), readFileSync(join(root, 'paid', 'coding-report.json'), 'utf8') + '\n');
  expect(summarize(root).models[0].followups).toBe(0);
  mkdirSync(join(root, 'stray')); writeFileSync(join(root, 'stray', 'coding-report.json'), '{}');
  expect(() => summarize(root)).toThrow();
});

it('retains valid cache observations when a repair fails functional acceptance', () => {
  const root = study(), path = join(root, 'paid', 'coding-audit.json');
  const audit = JSON.parse(readFileSync(path, 'utf8'));
  audit.checks.push({ id: 'functional', verdict: 'FAIL', check: 'actual-final-process-passed' });
  writeFileSync(path, JSON.stringify(audit));
  const result = summarize(root);
  expect(result.models[0].followups).toBe(1);
  expect(result.models[0].verifiedRepairs).toBe(0);
  expect(result.trials[0].auditFailures).toBe(1);
});
