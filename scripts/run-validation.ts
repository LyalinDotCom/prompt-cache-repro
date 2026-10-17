/** Fixed outside-in validation protocol. Credentials are read locally and never logged. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import dotenv from 'dotenv';
import { resolveConfig, persistReport, redactArtifacts } from '../src/cli';
import { estimateRun, runBenchmark } from '../src/core/runner';
import type { RunReport, Scenario } from '../src/core/types';

const allModels = ['gemini-4-argon', 'gemini-3.8-flash', 'gpt-6.1-sol', 'claude-opus-5-5'];
const geminiModels = allModels.slice(0, 2);
const blocks = [1, 2, 3];
const base = { turns: 2, trials: 1, prefixChars: 48000, deltaChars: 2400, maxOutputTokens: 512, toleranceTokens: 64, timeoutMs: 90000, maxEstimatedUsd: 5 };
const stages = [
  ...(['replay', 'append', 'perturb'] as Scenario[]).map(scenario => ({ id: `control-${scenario}`, config: resolveConfig({ ...base, scenario, models: allModels, gapsSeconds: [5], seed: `validation-v2-control-${scenario}` }) })),
  ...blocks.map(block => ({ id: `agent-5s-block-${block}`, config: resolveConfig({ ...base, scenario: 'agent', models: allModels, turns: 4, gapsSeconds: [5], seed: `validation-v2-block-${block}` }) })),
  ...blocks.flatMap(block => [30, 120].map(gap => ({ id: `agent-${gap}s-block-${block}`, config: resolveConfig({ ...base, scenario: 'agent', models: geminiModels, gapsSeconds: [gap], seed: `validation-v2-block-${block}` }) }))),
];
const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  console.log(JSON.stringify({ plannedRequests: stages.reduce((sum, stage) => sum + estimateRun(stage.config).requests, 0), stages: stages.map(stage => ({ id: stage.id, ...estimateRun(stage.config) })) }, null, 2));
} else {
  dotenv.config({ quiet: true });
  const secrets: Record<string, string> = {};
  for (const profile of stages[0].config.profiles) {
    const key = profile.keyEnv ? process.env[profile.keyEnv] : undefined;
    if (!key) throw new Error(`Missing credential for ${profile.accountId}; no requests started.`);
    secrets[profile.accountId] = key;
  }
  const startedAt = new Date().toISOString();
  const outputRoot = resolve('runs', `validation-v2-${startedAt.replaceAll(':', '-')}`);
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const controller = new AbortController();
  const timer = setTimeout(() => { stopReason = '30-minute shared deadline'; controller.abort(); }, 30 * 60 * 1000);
  let stopReason: string | null = null;
  let knownSpendUsd = 0;
  const completed: { stageId: string; runId: string; status: string; attempts: number; knownSpendUsd: number }[] = [];
  const manifest = () => {
    const body = redactArtifacts({ protocol: 'docs/VALIDATION_PROTOCOL.md', revision: 'validation-v2', startedAt, updatedAt: new Date().toISOString(), plannedRequests: 96, maxKnownObservedSpendUsd: 5, deadlineMinutes: 30, knownSpendUsd, stopReason, stages, completed }, Object.values(secrets));
    const target = join(outputRoot, 'batch.json');
    writeFileSync(`${target}.tmp`, JSON.stringify(body, null, 2) + '\n', { mode: 0o600 });
    renameSync(`${target}.tmp`, target);
  };
  const interrupt = () => { stopReason = 'SIGINT'; controller.abort(); };
  process.on('SIGINT', interrupt);
  manifest();
  console.log(`Validation output: ${outputRoot}`);
  try {
    for (const stage of stages) {
      if (controller.signal.aborted) break;
      console.log(`START ${stage.id} (${estimateRun(stage.config).requests} planned requests)`);
      let latest: RunReport | undefined;
      const precedingSpend = knownSpendUsd;
      await runBenchmark(stage.config, secrets, {
        signal: controller.signal, runtime: 'node',
        onEvent: event => {
          if (event.type !== 'observation' && event.type !== 'complete') return;
          latest = event.report;
          persistReport(latest, outputRoot, Object.values(secrets));
          knownSpendUsd = precedingSpend + latest.observations.reduce((sum, o) => sum + (o.actualInputCostUsd ?? 0) + (o.outputCostUsd ?? 0), 0);
          manifest();
          if (event.type === 'observation') {
            const o = event.observation;
            console.log(JSON.stringify({ stage: stage.id, model: o.model, turn: o.turn, status: o.status, continuation: o.continuationValid, stop: o.stopReason, input: o.usage?.inputTokens, read: o.usage?.cachedReadTokens, write: o.usage?.cacheWriteTokens, ordinary: o.usage?.uncachedInputTokens, attempts: o.transportAttemptCount, gapMs: o.actualIdleGapMs == null ? null : Math.round(o.actualIdleGapMs), knownBatchUsd: +knownSpendUsd.toFixed(6) }));
          }
          if (knownSpendUsd >= 5) { stopReason = '$5 known observed-spend soft stop'; controller.abort(); }
        },
      });
      if (latest) {
        completed.push({ stageId: stage.id, runId: latest.runId, status: latest.status, attempts: latest.observations.length, knownSpendUsd: knownSpendUsd - precedingSpend });
        manifest();
      }
    }
  } catch {
    stopReason = 'Unexpected harness error; completed observations retained';
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', interrupt);
    manifest();
  }
  console.log(JSON.stringify({ completedStages: completed.length, attempts: completed.reduce((sum, stage) => sum + stage.attempts, 0), knownSpendUsd, stopReason, outputRoot }));
}
