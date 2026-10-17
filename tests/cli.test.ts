import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, persistReport, redactArtifacts, resolveConfig } from '../src/cli';
import { runBenchmark } from '../src/core/runner';
import type { Observation, RunReport } from '../src/core/types';

vi.mock('../src/core/runner', () => ({
  runBenchmark: vi.fn(),
  estimateRun: vi.fn(() => ({ requests: 3, minDurationSeconds: 0, conservativeCostUsd: 0.01 })),
}));

const temporary: string[] = [];
const directory = () => { const result = mkdtempSync(join(tmpdir(), 'cachebench-cli-')); temporary.push(result); return result; };

function inputFixture() {
  return {
    accounts: [{ id: 'test-account', label: 'Test account', provider: 'gemini', tier: 'test', keyEnv: 'CACHEBENCH_TEST_KEY' }],
    models: ['gemini-4-argon'], scenario: 'replay', turns: 2, trials: 1, gapsSeconds: [0],
  };
}

function fixture(): RunReport {
  const config = resolveConfig(inputFixture());
  const observation: Observation = {
    runId: 'fixture-run', cellId: 'cell', trialId: 'trial', profileId: 'test-account::gemini-4-argon', accountId: 'test-account',
    provider: 'gemini', model: config.profiles[0].model, resolvedModel: null, tier: 'paid',
    scenario: 'replay', trial: 1, turn: 1, gapSeconds: 0, actualIdleGapMs: null,
    startedAt: '2026-10-17T12:00:00.000Z', durationMs: 1, status: 'error', error: 'fake-secret-123 leaked',
    httpStatus: 429, responseId: null, headers: {}, requestHash: 'hash', prefixHash: 'prefix', request: {},
    rawResponse: { error: 'fake-secret-123', authorization: 'Bearer fake-secret-123' }, rawUsage: null, usage: null,
    previousInputTokens: null, expectedReusableTokens: null, fullHit: null, anyHit: null,
    actualInputCostUsd: null, idealInputCostUsd: null, outputCostUsd: null, warnings: [],
  };
  return { schemaVersion: 1, runId: 'fixture-run', createdAt: observation.startedAt, finishedAt: null,
    status: 'running', runtime: 'test', config, observations: [observation], summaries: [], warnings: [], sdkVersions: {} };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(runBenchmark).mockReset();
  for (const path of temporary.splice(0)) rmSync(path, { force: true, recursive: true });
  delete process.env.CACHEBENCH_TEST_KEY;
});

describe('CLI public configuration', () => {
  it('defaults to global accounts expanded across all compatible models', () => {
    const config = resolveConfig();
    expect(config.profiles).toHaveLength(4);
    const gemini = config.profiles.filter(profile => profile.provider === 'gemini');
    expect(gemini.map(profile => profile.model)).toEqual(['gemini-4-argon', 'gemini-3.8-flash']);
    expect(new Set(gemini.map(profile => profile.keyEnv))).toEqual(new Set(['GEMINI_API_KEY']));
    expect(gemini.every(profile => profile.accountId === 'gemini-paid')).toBe(true);
  });

  it('expands two Gemini accounts across two models into four cells', () => {
    const second = { id: 'second-gemini', label: 'Second project', provider: 'gemini', tier: 'tier2', keyEnv: 'SECOND_GEMINI_KEY' };
    const input = { accounts: ['gemini-paid', second], models: ['gemini-4-argon', 'gemini-3.8-flash'] };
    const config = resolveConfig(input);
    expect(config.profiles).toHaveLength(4);
    expect(config.profiles.filter(profile => profile.keyEnv === 'SECOND_GEMINI_KEY')).toHaveLength(2);
    expect(new Set(config.profiles.map(profile => profile.id)).size).toBe(4);
    const filtered = resolveConfig(input, { accountIds: ['second-gemini'], modelIds: ['gemini-3.8-flash'] });
    expect(filtered.profiles.map(profile => profile.id)).toEqual(['second-gemini::gemini-3.8-flash']);
  });

  it('rejects credentials in model metadata and incompatible providers', () => {
    expect(() => resolveConfig({ models: [{ id: 'bad', apiKey: 'fake-secret-123' }] })).toThrow(/unsupported fields/);
    expect(() => resolveConfig({ accounts: ['openai-paid'], models: ['gemini-4-argon'] })).toThrow(/matching provider/);
  });

  it('resolves public account IDs and explicit tier key references', () => {
    const tier = { id: 'gemini-other-project', label: 'Other Gemini project', provider: 'gemini', tier: 'tier-2', keyEnv: 'MY_GEMINI_TIER2_KEY' };
    const config = resolveConfig({ accounts: ['gemini-paid', tier], models: ['gemini-3.8-flash'], gapsSeconds: [0, 30] }, { accountIds: ['gemini-other-project'] });
    expect(config.profiles).toHaveLength(1);
    expect(config.profiles[0].accountId).toBe('gemini-other-project');
    expect(config.profiles[0].keyEnv).toBe('MY_GEMINI_TIER2_KEY');
    expect(config.gapsSeconds).toEqual([0, 30]);
  });

  it.each([
    { apiKey: 'fake-secret-123' }, { baseURL: 'https://example.com' }, { turns: 0 },
    { gapsSeconds: [-1] }, { gapsSeconds: [0, 0] }, { accounts: [] }, { scenario: 'unknown' }, { maxEstimatedUsd: 0 },
  ])('rejects invalid or unsafe input without echoing its value', input => {
    expect(() => resolveConfig(input)).toThrow();
    try { resolveConfig(input); } catch (error) { expect(String(error)).not.toContain('fake-secret-123'); }
  });

  it('rejects literal account keys, missing environment references, and unknown account IDs', () => {
    const account = inputFixture().accounts[0];
    expect(() => resolveConfig({ accounts: [{ ...account, apiKey: 'secret' }] })).toThrow(/unsupported fields/);
    expect(() => resolveConfig({ accounts: ['not-an-account'] })).toThrow(/unknown accounts/);
    expect(() => resolveConfig({ accounts: [{ ...account, keyEnv: undefined }] })).toThrow(/requires a keyEnv/);
  });

  it('redacts nested credential fields and known values', () => {
    expect(redactArtifacts({ apiKey: 'a', nested: ['error fake-secret-123', { authorization: 'b' }] }, ['fake-secret-123']))
      .toEqual({ apiKey: '[REDACTED]', nested: ['error [REDACTED]', { authorization: '[REDACTED]' }] });
  });
});

describe('CLI persisted results', () => {
  it('saves partial reports and artifacts without key values', () => {
    const report = fixture();
    const path = persistReport(report, directory(), ['fake-secret-123']);
    const saved = readFileSync(join(path, 'report.json'), 'utf8');
    expect(JSON.parse(saved).observations).toHaveLength(1);
    for (const name of ['report.json', 'turns.jsonl', 'summary.md', 'summary.csv']) {
      expect(readFileSync(join(path, name), 'utf8')).not.toContain('fake-secret-123');
    }
    expect(report.observations[0].error).toContain('fake-secret-123');
    expect(() => persistReport({ ...report, runId: '../outside' }, path)).toThrow(/Invalid run ID/);
  });

  it('keeps the last observation snapshot if the runner fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = directory();
    const envPath = join(path, 'keys.env');
    writeFileSync(envPath, 'CACHEBENCH_TEST_KEY=fake-secret-123\n');
    const report = fixture();
    const configPath = join(path, 'config.json');
    writeFileSync(configPath, JSON.stringify(inputFixture()));
    vi.mocked(runBenchmark).mockImplementation(async (_config, _keys, options) => {
      await options?.onEvent?.({ type: 'observation', observation: report.observations[0], report });
      throw new Error('SDK raw error contains fake-secret-123');
    });
    expect(await main(['run', '--env', envPath, '--config', configPath, '--out', path])).toBe(1);
    expect(readFileSync(join(path, 'fixture-run', 'report.json'), 'utf8')).not.toContain('fake-secret-123');
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('fake-secret-123');
  });

  it('dry-runs with missing keys and makes no provider call', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const path = directory();
    const envPath = join(path, 'empty.env');
    writeFileSync(envPath, '');
    expect(await main(['run', '--env', envPath, '--account', 'gemini-paid', '--model', 'gemini-4-argon', '--dry-run'])).toBe(0);
    expect(runBenchmark).not.toHaveBeenCalled();
    expect(JSON.parse(log.mock.calls[0][0]).dryRun).toBe(true);
  });

  it('accepts account and model filters without requesting a separate key per model', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const path = directory();
    const envPath = join(path, 'empty.env');
    writeFileSync(envPath, '');
    expect(await main(['run', '--env', envPath, '--account', 'gemini-paid', '--model', 'gemini-3.8-flash', '--dry-run'])).toBe(0);
    const plan = JSON.parse(log.mock.calls[0][0]);
    expect(plan.config.profiles).toHaveLength(1);
    expect(plan.config.profiles[0].keyEnv).toBe('GEMINI_API_KEY');
    expect(plan.config.profiles[0].accountId).toBe('gemini-paid');
    expect(runBenchmark).not.toHaveBeenCalled();
  });

  it('passes one global account key for multiple model cells', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const path = directory();
    const envPath = join(path, 'keys.env');
    writeFileSync(envPath, 'CACHEBENCH_TEST_KEY=fake-secret-123\n');
    const input = { accounts: [{ id: 'global-gemini-account', label: 'Test account', provider: 'gemini', tier: 'test', keyEnv: 'CACHEBENCH_TEST_KEY' }], models: ['gemini-4-argon', 'gemini-3.8-flash'] };
    const configPath = join(path, 'config.json');
    writeFileSync(configPath, JSON.stringify(input));
    vi.mocked(runBenchmark).mockImplementation(async (config, keys) => {
      expect(config.profiles).toHaveLength(2);
      expect(keys).toEqual({ 'global-gemini-account': 'fake-secret-123' });
      return { ...fixture(), config, status: 'incomplete' };
    });
    expect(await main(['run', '--config', configPath, '--env', envPath, '--out', path])).toBe(1);
    expect(runBenchmark).toHaveBeenCalledOnce();
  });

  it('stops before requests when the selected key is missing', async () => {
    const path = directory();
    const envPath = join(path, 'empty.env');
    writeFileSync(envPath, '');
    const config = inputFixture();
    const configPath = join(path, 'config.json');
    writeFileSync(configPath, JSON.stringify(config));
    await expect(main(['run', '--config', configPath, '--env', envPath])).rejects.toThrow(/Missing API key.*CACHEBENCH_TEST_KEY.*No provider requests/);
    expect(runBenchmark).not.toHaveBeenCalled();
  });

  it('cancels on SIGINT and saves the partial cancelled report', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const path = directory();
    const envPath = join(path, 'keys.env');
    writeFileSync(envPath, 'CACHEBENCH_TEST_KEY=fake-secret-123\n');
    const report = fixture();
    const configPath = join(path, 'config.json');
    writeFileSync(configPath, JSON.stringify(inputFixture()));
    vi.mocked(runBenchmark).mockImplementation(async (_config, _keys, options) => {
      await options?.onEvent?.({ type: 'observation', observation: report.observations[0], report });
      process.emit('SIGINT');
      expect(options?.signal?.aborted).toBe(true);
      report.status = 'cancelled';
      return report;
    });
    expect(await main(['run', '--config', configPath, '--env', envPath, '--out', path])).toBe(130);
    const saved = JSON.parse(readFileSync(join(path, 'fixture-run', 'report.json'), 'utf8'));
    expect(saved.status).toBe('cancelled');
    expect(saved.observations).toHaveLength(1);
  });

  it('returns nonzero for an incomplete trajectory with successful API usage', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const path = directory();
    const envPath = join(path, 'keys.env');
    writeFileSync(envPath, 'CACHEBENCH_TEST_KEY=fake-secret-123\n');
    const report = fixture();
    report.status = 'incomplete';
    report.observations[0].status = 'ok';
    report.observations[0].error = null;
    const configPath = join(path, 'config.json');
    writeFileSync(configPath, JSON.stringify(inputFixture()));
    vi.mocked(runBenchmark).mockResolvedValue(report);
    expect(await main(['run', '--config', configPath, '--env', envPath, '--out', path])).toBe(1);
    expect(JSON.parse(readFileSync(join(path, 'fixture-run', 'report.json'), 'utf8')).status).toBe('incomplete');
  });

  it('formats saved reports without running a benchmark', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const file = join(directory(), 'report.json');
    writeFileSync(file, JSON.stringify(fixture()));
    expect(await main(['report', file])).toBe(0);
    expect(runBenchmark).not.toHaveBeenCalled();
  });
});
