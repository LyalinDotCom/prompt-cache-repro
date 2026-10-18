import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRestrictedCodingTools, runCodingTrial } from '../src/coding/pi-runner';
import { DEFAULT_CONFIG } from '../src/core/defaults';
import { resolveCodingConfig } from '../src/coding/config';
import { LEDGER_FIXTURE } from '../src/coding/fixture';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

const paths: string[] = [];
function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'pi-coding-offline-')); paths.push(path);
  mkdirSync(join(path, 'src')); mkdirSync(join(path, 'test'));
  writeFileSync(join(path, 'src', 'value.mjs'), 'export const value = 1;\n');
  writeFileSync(join(path, 'test', 'value.test.mjs'), "import { test } from 'node:test'; import assert from 'node:assert/strict'; test('keyless',()=>assert.equal(process.env.CACHEBENCH_FAKE_TEST_KEY, undefined));\n");
  return path;
}
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); delete process.env.CACHEBENCH_FAKE_TEST_KEY; });

describe('representative Pi coding arm offline', () => {
  it('uses a 20-minute session deadline and rejects obsolete coding cutoffs', () => {
    const config = resolveCodingConfig({});
    expect(config.sessionTimeoutMs).toBe(1_200_000);
    expect(config.timeoutMs).toBe(1_200_000);
    expect(config).not.toHaveProperty('turns');
    expect(config).not.toHaveProperty('maxEstimatedUsd');
    expect(() => resolveCodingConfig({ turns: 12 })).toThrow(/no turns or spending cutoff/);
    expect(() => resolveCodingConfig({ maxEstimatedUsd: 5 })).toThrow(/no turns or spending cutoff/);
  });

  it('stops an unfinished request at the session deadline and retains partial evidence', async () => {
    const cwd = fixture(), outDir = fixture();
    const profile = DEFAULT_CONFIG.profiles.find(profile => profile.provider === 'openai')!;
    const transport: typeof fetch = async (_input, init) => new Promise<Response>((_done, fail) => {
      const abort = () => fail(new DOMException('Deadline observed', 'AbortError'));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener('abort', abort, { once: true });
    });
    const report = await runCodingTrial({ profile, apiKey: 'fake-key', cwd, outDir, prompt: 'Complete the task.', gapSeconds: 0, timeoutMs: 100, transport });
    expect(report.status).toBe('stopped');
    expect(report.stopReason).toBe('Trial deadline');
    expect(report.requests).toHaveLength(1);
    expect(report.requests[0].error).toBeTruthy();
    expect(JSON.parse(readFileSync(join(outDir, 'coding-report.json'), 'utf8')).status).toBe('stopped');
  });

  it('ends a stalled SSE body at the session deadline even if the transport ignores abort', async () => {
    const cwd = fixture(), outDir = fixture();
    const profile = DEFAULT_CONFIG.profiles.find(profile => profile.provider === 'openai')!;
    const transport: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({ start() {} }), { headers: { 'content-type': 'text/event-stream' } });
    const report = await runCodingTrial({ profile, apiKey: 'fake-key', cwd, outDir, prompt: 'Complete the task.', gapSeconds: 0, timeoutMs: 100, transport });
    expect(report.status).toBe('stopped');
    expect(report.stopReason).toBe('Trial deadline');
    expect(report.requests).toHaveLength(1);
    expect(report.requests[0].httpStatus).toBe(200);
    expect(report.requests[0].usage).toBeNull();
  });

  it('retains earlier audited cache usage when cancellation aborts an inference before HTTP dispatch', async () => {
    const cwd = fixture(), root = fixture(), outDir = join(root, 'paid');
    const profile = DEFAULT_CONFIG.profiles.find(profile => profile.provider === 'openai')!;
    const controller = new AbortController(); let calls = 0;
    const transport: typeof fetch = async () => {
      calls++;
      const item = { type: 'function_call', id: `fc_${calls}`, call_id: `call_${calls}`, name: 'read', arguments: JSON.stringify({ path: 'src/value.mjs' }), status: 'completed' };
      const events = [
        { type: 'response.created', response: { id: `resp_${calls}`, status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: `resp_${calls}`, model: profile.model, status: 'completed', output: [item], usage: { input_tokens: 1000 + calls, input_tokens_details: { cached_tokens: 900, cache_write_tokens: 100 }, output_tokens: 2, total_tokens: 1002 + calls } } },
      ];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    };
    const report = await runCodingTrial({ profile, apiKey: 'fake-key', cwd, outDir, prompt: 'Read src/value.mjs repeatedly.', gapSeconds: .05, timeoutMs: 5000, signal: controller.signal, transport,
      onRequest: () => { if (calls === 2) setTimeout(() => controller.abort(), 20); },
    });
    const messagesPath = join(outDir, 'messages.json'), messages = JSON.parse(readFileSync(messagesPath, 'utf8'));
    expect(report.requests).toHaveLength(2);
    expect(messages.filter((m: any) => m.role === 'assistant')).toHaveLength(3);
    const cell = { trialName: 'paid', model: profile.model, accountId: profile.accountId };
    writeFileSync(join(outDir, 'fixture-spec.json'), JSON.stringify(LEDGER_FIXTURE));
    writeFileSync(join(root, 'batch.json'), JSON.stringify({ dispatchOrder: [cell], completed: [cell] }));
    const analyze = () => {
      execFileSync(process.execPath, ['--import', 'tsx', resolve('scripts/audit-coding.ts'), outDir], { env: {}, stdio: 'pipe' });
      execFileSync(process.execPath, ['--import', 'tsx', resolve('scripts/summarize-coding.ts'), root], { env: {}, stdio: 'pipe' });
      return { audit: JSON.parse(readFileSync(join(outDir, 'coding-audit.json'), 'utf8')), summary: JSON.parse(readFileSync(join(root, 'coding-summary.json'), 'utf8')) };
    };
    const actual = analyze();
    expect(actual.audit.checks.find((c: any) => c.check === 'assistant-turns-match-captured-requests').verdict).toBe('UNKNOWN');
    expect(actual.summary.models[0].followups).toBe(1);
    // An unexplained extra successful assistant turn remains a capture-integrity failure.
    messages.filter((m: any) => m.role === 'assistant').at(-1).stopReason = 'stop';
    writeFileSync(messagesPath, JSON.stringify(messages));
    const unexplained = analyze();
    expect(unexplained.audit.checks.find((c: any) => c.check === 'assistant-turns-match-captured-requests').verdict).toBe('FAIL');
    expect(unexplained.summary.models[0].followups).toBe(0);
  });

  it('allows a natural coding loop beyond the former 12-request cutoff', async () => {
    const cwd = fixture(), outDir = fixture();
    const profile = DEFAULT_CONFIG.profiles.find(profile => profile.provider === 'openai')!;
    let calls = 0;
    const transport: typeof fetch = async () => {
      calls++;
      const item = calls < 14
        ? { type: 'function_call', id: `fc_${calls}`, call_id: `call_${calls}`, name: 'read', arguments: JSON.stringify({ path: 'src/value.mjs' }), status: 'completed' }
        : { type: 'message', id: 'msg_done', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Done.', annotations: [] }] };
      const events = [
        { type: 'response.created', response: { id: `resp_${calls}`, status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item: item.type === 'function_call' ? { ...item, arguments: '' } : { ...item, content: [] } },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: `resp_${calls}`, model: profile.model, status: 'completed', output: [item], usage: { input_tokens: 1000 + calls, input_tokens_details: { cached_tokens: 900, cache_write_tokens: 100 }, output_tokens: 2, total_tokens: 1002 + calls } } },
      ];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    };
    const report = await runCodingTrial({ profile, apiKey: 'fake-key', cwd, outDir, prompt: 'Complete the task.', gapSeconds: 0, timeoutMs: 10_000, transport });
    expect(report.status, report.stopReason ?? '').toBe('completed');
    expect(calls).toBe(14);
    expect(report.requests).toHaveLength(14);
    expect(report.settings).not.toHaveProperty('maxRequests');
  });
  it('uses native file edits while blocking paths outside src/bin and strips test environment', async () => {
    const cwd = fixture(), outside = fixture();
    symlinkSync(outside, join(cwd, 'src', 'outside'));
    const tools = await createRestrictedCodingTools(cwd) as unknown as ToolDefinition<any>[];
    const tool = (name: string) => { const definition = tools.find(entry => entry.name === name)!; return { execute: (id: string, args: unknown) => definition.execute(id, args, undefined, undefined, undefined as never) }; };
    await tool('edit').execute('edit-1', { path: 'src/value.mjs', edits: [{ oldText: 'value = 1', newText: 'value = 2' }] });
    expect(readFileSync(join(cwd, 'src', 'value.mjs'), 'utf8')).toContain('value = 2');
    await expect(tool('write').execute('bad', { path: 'test/value.test.mjs', content: '' })).rejects.toThrow(/Only src/);
    await expect(tool('read').execute('bad', { path: outside + '/src/value.mjs' })).rejects.toThrow(/outside/);
    await expect(tool('write').execute('bad', { path: 'src/outside/stolen.txt', content: '' })).rejects.toThrow(/Symlinks/);
    process.env.CACHEBENCH_FAKE_TEST_KEY = 'fake-private-value';
    const result = await tool('bash').execute('tests', { command: 'node --test test/*.test.mjs' });
    expect(result.structuredContent).toMatchObject({ exit_code: 0 });
    await expect(tool('bash').execute('bad', { command: 'env' })).rejects.toThrow(/Allowed commands/);
  });

  it('captures real SDK JSON and raw SSE without a network request or environment credential', async () => {
    const cwd = fixture(), outDir = fixture();
    const profile = DEFAULT_CONFIG.profiles.find(profile => profile.provider === 'openai')!;
    let calls = 0;
    const transport: typeof fetch = async (_input, init) => {
      calls++;
      expect(String(init?.body)).toContain(profile.model);
      const item = { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Done.', annotations: [] }] };
      const usage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 997 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 1002 };
      const events = [
        { type: 'response.created', response: { id: 'resp_fixture', status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
        { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
        { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Done.' },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: 'resp_fixture', model: profile.model, status: 'completed', output: [item], usage } },
      ];
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
    };
    const report = await runCodingTrial({ profile, apiKey: 'fake-test-key', cwd, outDir, prompt: 'Say done.', gapSeconds: 0, timeoutMs: 10_000, transport });
    expect(calls).toBe(1);
    expect(report.status).toBe('completed');
    expect(report.requests[0].usage?.inputTokens).toBe(1000);
    expect(report.requests[0].usage?.cacheWriteTokens).toBe(997);
    expect(readFileSync(join(outDir, report.requests[0].responseFile), 'utf8')).toContain('response.completed');
    expect(readFileSync(join(outDir, 'coding-report.json'), 'utf8')).not.toContain('fake-test-key');
  });

  it('captures Gemini through its native global fetch boundary and restores it', async () => {
    const cwd = fixture(), outDir = fixture(), originalFetch = globalThis.fetch;
    const profile = DEFAULT_CONFIG.profiles.find(profile => profile.model === 'gemini-4-argon')!;
    let calls = 0;
    const transport: typeof fetch = async (_input, init) => {
      calls++;
      expect(String(init?.body)).toContain('contents');
      const chunk = { candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'Done.' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 2, cachedContentTokenCount: 0, totalTokenCount: 1002 }, modelVersion: profile.model, responseId: 'gemini_fixture' };
      return new Response(`data: ${JSON.stringify(chunk)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    };
    const report = await runCodingTrial({ profile, apiKey: 'fake-google-key', cwd, outDir, prompt: 'Say done.', gapSeconds: 0, timeoutMs: 10_000, transport });
    expect(report.status, report.stopReason ?? '').toBe('completed');
    expect(calls).toBe(1);
    expect(report.requests[0].usage?.inputTokens).toBe(1000);
    expect(report.requests[0].endpoint).toContain(':streamGenerateContent');
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
