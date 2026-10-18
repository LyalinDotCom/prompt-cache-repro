/** Small, preregistered direct-adapter study. Uses the ordinary bench CLI for every arm. */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { resolveConfig } from '../src/cli';
import { estimateRun } from '../src/core/runner';
import { seededRandom } from '../src/core/workload';
import type { RunReport, Scenario } from '../src/core/types';

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, calibration: { type: 'string' }, out: { type: 'string' } }, strict: true });
if (!values.calibration) throw new Error('--calibration must point to the completed qualification report.json.');
const calibration = JSON.parse(readFileSync(resolve(values.calibration), 'utf8')) as RunReport;
if (calibration.status !== 'completed' || calibration.observations.length !== 8 || calibration.observations.some(o => o.status !== 'ok' || o.transportAttemptCount !== 1 || !o.usage)) throw new Error('Qualification must contain eight complete, single-attempt, measured responses.');
const base = JSON.parse(readFileSync('config/theo-regime.json', 'utf8')) as Record<string, unknown>;
const geminiStart = calibration.observations.filter(o => o.provider === 'gemini' && o.turn === 0);
if (geminiStart.length !== 2) throw new Error('Qualification must include both Gemini models.');
const charsPerToken = calibration.config.prefixChars / (geminiStart.reduce((s, o) => s + o.usage!.inputTokens, 0) / 2);
const chars = (tokens: number) => Math.round(tokens * charsPerToken);
interface Arm { id: string; model: string; account: string; scenario: Scenario; prefixTokens: number; deltaTokens: number; turns: number; trials: number; }
const arms: Arm[] = [];
for (const model of ['gemini-3.8-flash', 'gemini-4-argon', 'gpt-6.1-sol', 'claude-opus-5-5']) {
  const account = model.startsWith('gemini') ? 'gemini-paid' : model.startsWith('gpt') ? 'openai-paid' : 'anthropic-paid';
  const add = (id: string, scenario: Scenario, prefixTokens: number, deltaTokens: number, turns: number, trials = 1) => arms.push({ id: `${model}-${id}`, model, account, scenario, prefixTokens, deltaTokens, turns, trials });
  if (model.startsWith('gemini')) {
    add('floor-4k', 'replay', 4000, 0, 3);
    add('replay-8k', 'replay', 8000, 0, 8, 2);
    add('append-cross-16k', 'append', 8000, 1500, 8, 2);
    add('agent-cross-16k', 'agent', 8000, 1500, 8);
    add('agent-small-delta', 'agent', 8000, 600, 5);
    add('agent-large-delta', 'agent', 8000, 3000, 5);
    add('agent-32k', 'agent', 32000, 600, 3);
  } else {
    add('replay-8k', 'replay', 8000, 0, 3);
    add('agent-cross-16k', 'agent', 8000, 1500, 8);
  }
}
const random = seededRandom('theo-regime-focused-order-2026-10-18');
for (let i = arms.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [arms[i], arms[j]] = [arms[j], arms[i]]; }
const configs = arms.map(arm => ({ arm, config: { ...base, models: [arm.model], accounts: [arm.account], scenario: arm.scenario, prefixChars: chars(arm.prefixTokens), deltaChars: chars(arm.deltaTokens), turns: arm.turns, trials: arm.trials, seed: `theo-regime-focused-2026-10-18-${arm.id}` } }));
const estimates = configs.map(({ arm, config }) => ({ arm: arm.id, ...estimateRun(resolveConfig(config)) }));
let tokenBasedUncachedEstimateUsd = 0;
for (const { arm, config } of configs) {
  const profile = resolveConfig(config).profiles[0], rate = profile.pricing!;
  const initial = calibration.observations.find(o => o.model === arm.model && o.turn === 0)!.usage!.inputTokens;
  const scale = initial / calibration.config.prefixChars;
  for (let turn = 0; turn < arm.turns; turn++) {
    const tokens = config.prefixChars * scale + 1000 + (arm.scenario === 'replay' ? 0 : turn * (config.deltaChars * scale + 328));
    tokenBasedUncachedEstimateUsd += arm.trials * (tokens * Math.max(rate.input, rate.cacheWrite) + 128 * rate.output) / 1e6;
  }
}
const plan = { createdAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), calibrationRunId: calibration.runId, charsPerToken,
  requests: estimates.reduce((s, e) => s + e.requests, 0), aggregateMinimumIdleSeconds: estimates.reduce((s, e) => s + e.minDurationSeconds, 0),
  conservativeCharacterBasedEstimateUsd: estimates.reduce((s, e) => s + (e.conservativeCostUsd ?? 0), 0), tokenBasedUncachedEstimateUsd,
  note: 'Fixed focused allocation, not the 46,080-call proposal. Estimated tokens and costs are not guarantees; report actual usage. Independent account queues run concurrently, one trajectory at a time per key. No resampling, retries or warming. Replay has no delta arm. HTTP JSON, not streaming SSE. Only short-gap effects are tested.',
  configs, outcomes: [] as { arm: string; exitCode: number | null; reportFiles: string[] }[] };
if (values['dry-run']) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
const output = resolve(values.out ?? `runs/theo-regime-${new Date().toISOString().replaceAll(':', '-')}`);
if (existsSync(join(output, 'plan.json'))) throw new Error('Output directory already contains a study; never overwrite or silently resume.');
mkdirSync(output, { recursive: true, mode: 0o700 });
const save = () => writeFileSync(join(output, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', { mode: 0o600 });
save();
console.log(JSON.stringify({ output, requests: plan.requests, tokenBasedUncachedEstimateUsd, aggregateMinimumIdleSeconds: plan.aggregateMinimumIdleSeconds }));
const controllers = new Set<ReturnType<typeof spawn>>();
let cancelled = false;
process.on('SIGINT', () => { cancelled = true; for (const child of controllers) child.kill('SIGINT'); });
await Promise.all([...new Set(arms.map(a => a.account))].map(async account => {
  for (const { arm, config } of configs.filter(c => c.arm.account === account)) {
    if (cancelled) break;
    const directory = join(output, arm.id); mkdirSync(directory, { recursive: true, mode: 0o700 });
    const configPath = join(directory, 'config.json'); writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    console.log(`Starting ${arm.id}`);
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'run', '--config', configPath, '--out', join(directory, 'results')], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    controllers.add(child);
    child.stdout.on('data', data => appendFileSync(join(directory, 'stdout.log'), data, { mode: 0o600 }));
    child.stderr.on('data', data => appendFileSync(join(directory, 'stderr.log'), data, { mode: 0o600 }));
    const exitCode = await new Promise<number | null>((done, reject) => { child.on('exit', done); child.on('error', reject); });
    controllers.delete(child);
    const results = join(directory, 'results');
    const reportFiles = existsSync(results) ? readdirSync(results).map(id => join(results, id, 'report.json')).filter(existsSync) : [];
    plan.outcomes.push({ arm: arm.id, exitCode, reportFiles }); save();
    console.log(`Finished ${arm.id}: exit ${exitCode}`);
  }
}));
console.log(`Study saved: ${output}`);
process.exitCode = cancelled ? 130 : plan.outcomes.every(o => o.exitCode === 0) && plan.outcomes.length === arms.length ? 0 : 1;
