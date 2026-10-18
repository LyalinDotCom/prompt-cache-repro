import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CodingFixtureSpec {
  id: string;
  cliArgs: string[];
  mutablePaths: string[];
  expectedBaseline: { tests: number; pass: number; fail: number; cancelled: number; skipped: number; todo: number };
  expectedCli: Record<string, unknown>;
  contextMode: string;
  targetInputMin?: number;
  upstream?: { url: string; commit: string; license: string };
}
export const LEDGER_FIXTURE: CodingFixtureSpec = {
  id: 'coding-ledger',
  mutablePaths: ['src', 'bin'],
  expectedBaseline: { tests: 44, pass: 38, fail: 6, cancelled: 0, skipped: 0, todo: 0 },
  cliArgs: ['bin/ledger.mjs', 'import', 'data/invoices.csv', '--payments', 'data/payments.csv', '--as-of', '2026-03-01', '--format', 'json'],
  expectedCli: { counts: { sourceRows: 4, accepted: 4, rejected: 0, conflicts: 0 } },
  contextMode: 'whole-source-preload',
};
export function loadCodingFixture(id: string): { root: string; spec: CodingFixtureSpec } {
  if (!/^coding-[a-z0-9-]+$/.test(id)) throw new Error('Invalid coding fixture ID.');
  const root = resolve('fixtures', id);
  const spec = id === 'coding-ledger' ? structuredClone(LEDGER_FIXTURE) : JSON.parse(readFileSync(resolve(root, 'fixture.json'), 'utf8')) as CodingFixtureSpec;
  if (!spec || spec.id !== id || !Array.isArray(spec.cliArgs) || !spec.cliArgs.length || !spec.cliArgs[0].startsWith('bin/') || spec.cliArgs.some(arg => typeof arg !== 'string' || !/^[A-Za-z0-9_./:=+-]+$/.test(arg) || arg.includes('..'))) throw new Error('Invalid fixture command specification.');
  if (!Array.isArray(spec.mutablePaths) || !spec.mutablePaths.length || spec.mutablePaths.some(path => !/^src(?:\/[A-Za-z0-9_-]+)*$|^bin$/.test(path))) throw new Error('Invalid fixture mutable paths.');
  if (!spec.expectedBaseline || Object.values(spec.expectedBaseline).some(value => !Number.isInteger(value) || value < 0)) throw new Error('Fixture must declare exact expected baseline counts.');
  if (!spec.expectedCli || typeof spec.expectedCli !== 'object' || Array.isArray(spec.expectedCli)) throw new Error('Fixture must declare its expected CLI result.');
  return { root, spec };
}
export function matchesExpected(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, i) => matchesExpected(actual[i], value));
  return actual !== null && typeof actual === 'object' && !Array.isArray(actual) && Object.entries(expected).every(([key, value]) => matchesExpected((actual as Record<string, unknown>)[key], value));
}
export function parseTestCounts(output: string): Record<string, number> {
  return Object.fromEntries([...output.matchAll(/^(?:#|ℹ)\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)\b/gm)].map(match => [match[1], Number(match[2])]));
}
