import { expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/defaults';
import { resolveCodingConfig } from '../src/coding/config';
import { loadCodingFixture, matchesExpected, parseTestCounts } from '../src/coding/fixture';
import { codingRequestCost } from '../src/coding/cost';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

it('defaults the coding command to the registered long-context workload without making API calls', () => {
  const plan = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', resolve('scripts/run-coding.ts'), '--dry-run'], { encoding: 'utf8', env: { PATH: process.env.PATH } }));
  expect(plan.fixtures.map((f: any) => [f.id, f.targetInputMin])).toEqual([['coding-csv-parse', 250000], ['coding-csv-stringify', 250000]]);
  expect(plan.dispatchOrder).toHaveLength(8);
  expect(new Set(plan.dispatchOrder.map((c: any) => c.trialName)).size).toBe(8);
  expect(plan.shuffled).toBe(true);
  expect(plan.gapsSeconds).toEqual([30]);
});

it('selects pinned executable CSV tasks and checks their declared CLI result', () => {
  const { spec } = loadCodingFixture('coding-csv-parse');
  expect(spec.upstream?.commit).toBe('f12e6862a41f4324a06a26c87a3e28031d4faa7f');
  expect(spec.cliArgs).toEqual(['bin/check.mjs']);
  expect(matchesExpected({ ok: true, records: 4 }, spec.expectedCli)).toBe(true);
  expect(matchesExpected({ ok: true, records: 3 }, spec.expectedCli)).toBe(false);
  expect(() => loadCodingFixture('../.env')).toThrow();
  expect(() => resolveCodingConfig({ fixtures: ['coding-csv-parse', 'coding-csv-parse'] })).toThrow();
});
it('applies GPT-6.1 Sol long-context rates to the full request only above 272K input', () => {
  const profile = DEFAULT_CONFIG.profiles.find(p => p.model === 'gpt-6.1-sol')!;
  const usage = { inputTokens: 272000, uncachedInputTokens: 2000, cachedReadTokens: 250000, cacheWriteTokens: 20000, outputTokens: 1000, thinkingTokens: 0 };
  expect(codingRequestCost(profile, usage)).toBeCloseTo((2000 * 2 + 250000 * .1 + 20000 * 2.5 + 1000 * 10) / 1e6);
  expect(codingRequestCost(profile, { ...usage, inputTokens: 272001, uncachedInputTokens: 2001 })).toBeCloseTo(((2001 * 2 + 250000 * .1 + 20000 * 2.5) * 2 + 1000 * 10 * 1.5) / 1e6);
});

it('reads exact real Node test summaries before allowing a registered baseline', () => {
  const output = 'ℹ tests 41\nℹ pass 29\nℹ fail 12\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n';
  const { spec } = loadCodingFixture('coding-csv-parse');
  expect(matchesExpected(parseTestCounts(output), spec.expectedBaseline)).toBe(true);
  expect(matchesExpected(parseTestCounts(output.replace('fail 12', 'fail 1')), spec.expectedBaseline)).toBe(false);
});
