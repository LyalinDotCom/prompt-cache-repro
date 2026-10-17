#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { DEFAULT_ACCOUNTS, DEFAULT_MODELS, DEFAULT_CONFIG, SDK_VERSIONS } from './core/defaults';
import { expandProfiles, validateAccount, validateModelSpec } from './core/catalog';
import { estimateRun, runBenchmark } from './core/runner';
import { toMarkdown, toSummaryCsv, toJsonl } from './core/report';
import type { BenchmarkConfig, RunReport, Scenario } from './core/types';

const CONFIG_FIELDS = new Set([
  'scenario', 'accounts', 'models', 'turns', 'trials', 'gapsSeconds', 'prefixChars', 'deltaChars',
  'maxOutputTokens', 'toleranceTokens', 'timeoutMs', 'seed', 'maxEstimatedUsd',
]);
const SCENARIOS = new Set<Scenario>(['replay', 'append', 'agent', 'perturb']);

function object(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${description} must be an object.`);
  return value as Record<string, unknown>;
}
function allowFields(value: Record<string, unknown>, allowed: Set<string>, description: string): void {
  if (Object.keys(value).some(key => !allowed.has(key))) {
    throw new Error(`${description} contains unsupported fields. Use keyEnv names for credentials; endpoint overrides and literal API keys are forbidden.`);
  }
}
function numeric(value: unknown, label: string, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  }
  return value;
}
function textField(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\r\n\x00-\x1f]/.test(value)) {
    throw new Error(`${label} must be a nonempty single-line string of at most ${max} characters.`);
  }
  return value;
}

/** Public input has one schema: global accounts and independent model metadata. */
export function resolveConfig(input: unknown = {}, filters: { accountIds?: string[]; modelIds?: string[] } = {}): BenchmarkConfig {
  const raw = object(input, 'Config');
  allowFields(raw, CONFIG_FIELDS, 'Config');
  const candidate = { ...DEFAULT_CONFIG, ...raw };
  function resolveCatalog<T extends { id: string }>(requested: unknown, defaults: T[], validate: (item: unknown) => T, name: string, filter?: string[]): T[] {
    if (!Array.isArray(requested) || !requested.length) throw new Error(`Config ${name} must be a nonempty array.`);
    const items = requested.map(item => {
      if (typeof item !== 'string') return validate(item);
      const known = defaults.find(entry => entry.id === item);
      if (!known) throw new Error(`Config references an unknown ${name} ID.`);
      return validate(known);
    });
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error(`Config ${name} IDs must be unique.`);
    if (!filter) return items;
    if (!filter.length || new Set(filter).size !== filter.length) throw new Error(`Selected ${name} IDs must be nonempty and unique.`);
    return filter.map(id => {
      const known = items.find(item => item.id === id);
      if (!known) throw new Error(`Selected ${name} ID is not present in this config.`);
      return known;
    });
  }
  const accounts = resolveCatalog(raw.accounts ?? DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS, validateAccount, 'accounts', filters.accountIds);
  const models = resolveCatalog(raw.models ?? DEFAULT_MODELS, DEFAULT_MODELS, validateModelSpec, 'models', filters.modelIds);
  if (accounts.some(account => !account.keyEnv)) throw new Error('Every CLI account requires a keyEnv environment variable name.');
  const profiles = expandProfiles(accounts, models);
  if (!profiles.length) throw new Error('No selected accounts and models have a matching provider.');
  if (!SCENARIOS.has(candidate.scenario as Scenario)) throw new Error('Scenario must be replay, append, agent, or perturb.');
  if (!Array.isArray(candidate.gapsSeconds) || !candidate.gapsSeconds.length) throw new Error('gapsSeconds must be a nonempty array.');
  const gapsSeconds = candidate.gapsSeconds.map(gap => numeric(gap, 'Idle gap', 0, 86_400, false));
  if (new Set(gapsSeconds).size !== gapsSeconds.length) throw new Error('Idle gaps must be unique.');
  const maxEstimatedUsd = numeric(candidate.maxEstimatedUsd, 'Budget', 0, 1_000_000, false);
  if (maxEstimatedUsd <= 0) throw new Error('Budget must be positive.');
  return {
    scenario: candidate.scenario as Scenario, profiles,
    turns: numeric(candidate.turns, 'Turns', 2, 1000), trials: numeric(candidate.trials, 'Trials', 1, 1000),
    gapsSeconds, prefixChars: numeric(candidate.prefixChars, 'Prefix characters', 1, 99_000),
    deltaChars: numeric(candidate.deltaChars, 'Delta characters', 0, 50_000),
    maxOutputTokens: numeric(candidate.maxOutputTokens, 'Maximum output tokens', 1, 32_000),
    toleranceTokens: numeric(candidate.toleranceTokens, 'Token tolerance', 0, 100_000),
    timeoutMs: numeric(candidate.timeoutMs, 'Timeout milliseconds', 1, 3_600_000),
    seed: textField(candidate.seed, 'Seed'),
    maxEstimatedUsd,
  };
}

/** Defense in depth: redact known key values and credential-shaped fields from saved artifacts. */
export function redactArtifacts<T>(value: T, secrets: string[] = []): T {
  const keys = secrets.filter(Boolean).sort((a, b) => b.length - a.length);
  const visit = (item: unknown): unknown => {
    if (typeof item === 'string') return keys.reduce((out, key) => out.split(key).join('[REDACTED]'), item);
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([name, entry]) => [name,
      /^(api[-_]?key|authorization|x-api-key|x-goog-api-key|access[-_]?token)$/i.test(name) ? '[REDACTED]' : visit(entry),
    ]));
    return item;
  };
  return visit(value) as T;
}

/** Synchronous snapshots keep all completed observations durable before the next API request. */
export function persistReport(report: RunReport, outputRoot: string, secrets: string[] = []): string {
  if (!/^[A-Za-z0-9._-]+$/.test(report.runId) || report.runId === '.' || report.runId === '..') throw new Error('Invalid run ID.');
  const safe = redactArtifacts(report, secrets);
  const directory = join(resolve(outputRoot), safe.runId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const files: Record<string, string> = {
    'report.json': JSON.stringify(safe, null, 2) + '\n', 'turns.jsonl': toJsonl(safe),
    'summary.md': toMarkdown(safe), 'summary.csv': toSummaryCsv(safe),
  };
  for (const [name, contents] of Object.entries(files)) {
    const target = join(directory, name);
    writeFileSync(`${target}.tmp`, contents, { mode: 0o600 });
    renameSync(`${target}.tmp`, target);
  }
  return directory;
}

export const HELP = `Usage:
  npm run bench -- profiles [--config config/two-gemini-accounts.json] [--env .env]
  npm run bench -- run [--config config/smoke.json] [options]
  npm run bench -- report runs/<id>/report.json

Options:
  --account id[,id]    Filter global provider accounts (repeatable)
  --model id[,id]      Filter model catalog IDs (repeatable)
  --scenario name      replay | append | agent | perturb
  --turns N --trials N --gaps 0,5,30 --prefix-chars N --delta-chars N
  --budget USD         Estimated spend guard; provider billing remains authoritative
  --out directory      Output parent directory (default: runs)
  --env path           dotenv path relative to cwd (default: .env; shell values win)
  --dry-run            Validate and print plan; no provider request
  --help

Config accounts own keyEnv references; models own pricing. Matching provider pairs
expand into cells. No literal keys or endpoints belong in config files.
Exit codes: 0 all observations succeeded (or dry run/report); 1 configuration or
runtime failure, incomplete trajectory, no successes, or any failed observation;
2 budget stopped; 130 SIGINT.
`;

export function readJsonFile(file: string): unknown {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new Error('Unable to read JSON file. Check its path and JSON syntax.'); }
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: {
      help: { type: 'boolean', short: 'h' }, config: { type: 'string' }, env: { type: 'string' },
      scenario: { type: 'string' },
      account: { type: 'string', multiple: true }, model: { type: 'string', multiple: true },
      turns: { type: 'string' }, trials: { type: 'string' }, gaps: { type: 'string' },
      'prefix-chars': { type: 'string' }, 'delta-chars': { type: 'string' }, budget: { type: 'string' },
      out: { type: 'string' }, 'dry-run': { type: 'boolean' },
    } });
  } catch { throw new Error('Invalid command line. Run with --help for supported flags.'); }
  const values = parsed.values;
  if (values.help) { console.log(HELP); return 0; }
  const command = parsed.positionals[0] ?? 'run';
  if (command === 'report') {
    if (parsed.positionals.length !== 2) throw new Error('The report command requires one saved report.json path.');
    const saved = object(readJsonFile(resolve(parsed.positionals[1])), 'Saved report');
    if (saved.schemaVersion !== 1 || !Array.isArray(saved.observations) || !Array.isArray(saved.summaries)) throw new Error('Unsupported saved report format.');
    console.log(toMarkdown(redactArtifacts(saved as unknown as RunReport)));
    return 0;
  }
  if (!['run', 'profiles'].includes(command) || parsed.positionals.length > 1) throw new Error('Command must be run, profiles, or report.');
  const raw = values.config ? object(readJsonFile(resolve(String(values.config))), 'Config') : {};
  const override: Record<string, unknown> = { ...raw };
  for (const [flag, field] of [['turns', 'turns'], ['trials', 'trials'], ['prefix-chars', 'prefixChars'], ['delta-chars', 'deltaChars'], ['budget', 'maxEstimatedUsd']]) {
    if (values[flag] !== undefined) override[field] = Number(values[flag]);
  }
  if (values.scenario !== undefined) override.scenario = values.scenario;
  if (values.gaps !== undefined) {
    const gapParts = String(values.gaps).split(',');
    if (gapParts.some(part => !part.trim())) throw new Error('Idle gaps must be comma-separated numbers.');
    override.gapsSeconds = gapParts.map(Number);
  }
  const selectedList = (flag: string) => values[flag] ? (values[flag] as string[]).flatMap(ids => ids.split(',')).map(id => id.trim()) : undefined;
  const config = resolveConfig(override, { accountIds: selectedList('account'), modelIds: selectedList('model') });
  const envFile = resolve(String(values.env ?? '.env'));
  if (existsSync(envFile)) {
    const loaded = dotenv.config({ path: envFile, quiet: true, override: false });
    if (loaded.error) throw new Error('Unable to load environment file.');
  } else if (values.env) throw new Error('The selected environment file does not exist.');
  const available = config.profiles.map(profile => ({
    id: profile.id, accountId: profile.accountId, provider: profile.provider, model: profile.model, tier: profile.tier,
    keyEnv: profile.keyEnv, available: Boolean(profile.keyEnv && process.env[profile.keyEnv]?.trim()),
  }));
  if (command === 'profiles') { console.log(JSON.stringify(available, null, 2)); return 0; }
  if (values['dry-run']) {
    const estimate = estimateRun(config);
    console.log(JSON.stringify({ dryRun: true, config, profiles: available, estimate,
      budgetUsd: config.maxEstimatedUsd, note: 'Character counts are not token counts. No API requests or charges; token costs are estimates until usage is returned.' }, null, 2));
    return 0;
  }
  const estimate = estimateRun(config);
  if (estimate.conservativeCostUsd != null && estimate.conservativeCostUsd > config.maxEstimatedUsd) {
    throw new Error(`Conservative estimated cost $${estimate.conservativeCostUsd.toFixed(3)} exceeds the $${config.maxEstimatedUsd.toFixed(3)} budget. Reduce the workload or set --budget. No provider requests were sent.`);
  }
  if (available.some(profile => !profile.available)) {
    const missing = [...new Set(available.filter(profile => !profile.available).map(profile => profile.keyEnv))].join(', ');
    throw new Error(`Missing API key environment variable(s): ${missing}. No provider requests were sent.`);
  }
  const keys = Object.fromEntries(config.profiles.map(profile => [profile.accountId, process.env[profile.keyEnv!]!]));
  const secrets = [...new Set(Object.values(keys))];
  const controller = new AbortController();
  let interrupted = false;
  let latest: RunReport | undefined;
  let directory: string | undefined;
  const outputRoot = resolve(String(values.out ?? 'runs'));
  const onInterrupt = () => { interrupted = true; controller.abort(); };
  process.on('SIGINT', onInterrupt);
  try {
    latest = await runBenchmark(config, keys, {
      runtime: 'node', signal: controller.signal,
      onEvent(event) {
        if (event.type === 'observation' || event.type === 'complete') {
          latest = { ...event.report, sdkVersions: SDK_VERSIONS };
          directory = persistReport(latest, outputRoot, secrets);
        }
        if (event.type === 'status') console.error(redactArtifacts(event.message, secrets));
      },
    });
    latest.sdkVersions = SDK_VERSIONS;
    directory = persistReport(latest, outputRoot, secrets);
  } catch {
    if (latest) directory = persistReport(latest, outputRoot, secrets);
    console.error('Benchmark stopped unexpectedly. Completed observations have been saved when available.');
    return interrupted ? 130 : 1;
  } finally { process.off('SIGINT', onInterrupt); }
  console.log(toMarkdown(redactArtifacts(latest, secrets)));
  console.log(`Saved results: ${directory}`);
  if (interrupted || latest.status === 'cancelled') return 130;
  if (latest.status === 'budget-stopped') return 2;
  if (latest.status === 'incomplete') return 1;
  return latest.observations.length > 0 && latest.observations.every(observation => observation.status === 'ok') ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    // All expected messages are curated; raw SDK errors are never printed here.
    console.error(error instanceof Error ? error.message : 'Command failed.');
    process.exitCode = 1;
  });
}
