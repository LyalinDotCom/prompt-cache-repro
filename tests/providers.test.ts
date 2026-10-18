import { describe, expect, it, vi } from 'vitest';
import { createProviderSession, normalizeAnthropicUsage, normalizeGeminiUsage, normalizeOpenAIUsage } from '../src/providers';
import type { Provider, Scenario, SessionOptions } from '../src/core/types';

const fixtures = {
  openai: {
    id: 'resp_fixture', model: 'gpt-6.1-sol', status: 'completed',
    output: [
      { id: 'rs_fixture', type: 'reasoning', encrypted_content: 'opaque-encrypted-fixture', summary: [] },
      { id: 'fc_fixture', type: 'function_call', call_id: 'call_fixture', name: 'read_fixture', arguments: '{}', status: 'completed' },
    ],
    usage: { input_tokens: 2000, input_tokens_details: { cached_tokens: 1500, cache_write_tokens: 400 }, output_tokens: 30, output_tokens_details: { reasoning_tokens: 20 } },
  },
  gemini: {
    responseId: 'gemini_fixture', modelVersion: 'gemini-4-argon',
    candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [
      { text: 'Private thought fixture', thought: true, thoughtSignature: 'dGhvdWdodC1maXh0dXJl' },
      { functionCall: { id: 'call_fixture', name: 'read_fixture', args: {} }, thoughtSignature: 'Y2FsbC1maXh0dXJl' },
    ] } }],
    usageMetadata: { promptTokenCount: 2000, cachedContentTokenCount: 1500, candidatesTokenCount: 10, thoughtsTokenCount: 20 },
  },
  anthropic: {
    id: 'msg_fixture', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'tool_use', stop_sequence: null,
    content: [
      { type: 'thinking', thinking: 'Private thought fixture', signature: 'opaque-signed-thinking-fixture' },
      { type: 'redacted_thinking', data: 'opaque-redacted-fixture' },
      { type: 'tool_use', id: 'tool_fixture', name: 'read_fixture', input: {} },
    ],
    usage: { input_tokens: 100, cache_read_input_tokens: 1500, cache_creation_input_tokens: 400, output_tokens: 30 },
  },
};

function options(provider: Provider, scenario: Scenario = 'agent'): SessionOptions {
  return { profile: { id: provider, accountId: 'fixture-account', provider, model: { gemini: 'gemini-4-argon', openai: 'gpt-6.1-sol', anthropic: 'claude-sonnet-5-5' }[provider], tier: 'Paid · user declared', label: provider, pricing: null, cacheMinTokens: 1024 },
    apiKey: 'offline-credential-never-export', scenario, prefix: 'TRIAL-NONCE\nStable reference fixture', deltaChars: 180,
    turns: 4, maxOutputTokens: 512, timeoutMs: 1000, trialNonce: 'trial-nonce' };
}
function transport(provider: Provider, response: unknown = fixtures[provider], status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(response), {
    status, headers: { 'content-type': 'application/json', 'x-request-id': 'request_fixture', 'x-goog-request-id': 'google_request_fixture', 'cf-ray': 'ray_fixture', 'set-cookie': 'secret-cookie', 'authorization': 'should-never-be-exported' },
  }));
}
const signal = () => new AbortController().signal;

describe('usage normalization against provider-native fixtures', () => {
  it('subtracts both inclusive OpenAI reads and newly priced writes', () => {
    expect(normalizeOpenAIUsage(fixtures.openai.usage).usage).toEqual({ inputTokens: 2000, cachedReadTokens: 1500, cacheWriteTokens: 400, uncachedInputTokens: 100, outputTokens: 30, thinkingTokens: 20 });
  });
  it('subtracts inclusive Gemini reads and adds billable thoughts exactly once', () => {
    expect(normalizeGeminiUsage(fixtures.gemini.usageMetadata).usage).toEqual({ inputTokens: 2000, cachedReadTokens: 1500, cacheWriteTokens: 0, uncachedInputTokens: 500, outputTokens: 30, thinkingTokens: 20 });
  });
  it('adds exclusive Anthropic read, write, and uncached counters', () => {
    expect(normalizeAnthropicUsage(fixtures.anthropic.usage).usage).toEqual({ inputTokens: 2000, cachedReadTokens: 1500, cacheWriteTokens: 400, uncachedInputTokens: 100, outputTokens: 30, thinkingTokens: 0 });
  });
  it('never turns entirely missing usage into a zero cache hit', () => {
    for (const normalize of [normalizeOpenAIUsage, normalizeGeminiUsage, normalizeAnthropicUsage]) {
      expect(normalize(undefined).usage).toBeNull();
      expect(normalize({}).usage).toBeNull();
      expect(normalize(undefined).warnings.length).toBeGreaterThan(0);
    }
  });
  it('retains ambiguous missing OpenAI details and writes instead of silently underpricing', () => {
    const missing = normalizeOpenAIUsage({ input_tokens: 2000, output_tokens: 30 });
    expect(missing.usage).toMatchObject({ cachedReadTokens: null, cacheWriteTokens: null, uncachedInputTokens: null });
    const noWrite = normalizeOpenAIUsage({ input_tokens: 2000, output_tokens: 30, input_tokens_details: { cached_tokens: 1500 } });
    expect(noWrite.usage).toMatchObject({ cachedReadTokens: 1500, cacheWriteTokens: null, uncachedInputTokens: null });
  });
  it('decodes the Gemini omitted non-presence scalar using the protocol default-zero contract', () => {
    const missing = normalizeGeminiUsage({ promptTokenCount: 2000, candidatesTokenCount: 10 });
    expect(missing.usage).toMatchObject({ cachedReadTokens: 0, uncachedInputTokens: 2000 });
    expect(missing.warnings.join(' ')).toContain('default-zero contract');
    expect(missing.warnings.join(' ')).not.toContain('assumption');
    expect(normalizeGeminiUsage({ promptTokenCount: 2000, candidatesTokenCount: 10, cachedContentTokenCount: null }).usage?.cachedReadTokens).toBeNull();
  });
  it('does not reconstruct an Anthropic total from an incomplete exclusive breakdown', () => {
    expect(normalizeAnthropicUsage({ input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 1500 }).usage).toBeNull();
  });
  it('rejects malformed and impossible counters', () => {
    for (const invalid of [-1, 0.5, NaN, Infinity, '1500']) {
      expect(normalizeOpenAIUsage({ ...fixtures.openai.usage, input_tokens_details: { cached_tokens: invalid, cache_write_tokens: 0 } }).usage?.cachedReadTokens).toBeNull();
      expect(normalizeGeminiUsage({ ...fixtures.gemini.usageMetadata, cachedContentTokenCount: invalid }).usage?.cachedReadTokens).toBeNull();
      expect(normalizeAnthropicUsage({ ...fixtures.anthropic.usage, cache_read_input_tokens: invalid }).usage).toBeNull();
    }
    expect(normalizeOpenAIUsage({ ...fixtures.openai.usage, input_tokens_details: { cached_tokens: 1900, cache_write_tokens: 400 } }).usage?.uncachedInputTokens).toBeNull();
    expect(normalizeGeminiUsage({ ...fixtures.gemini.usageMetadata, cachedContentTokenCount: 2100 }).usage?.cachedReadTokens).toBeNull();
  });
});

describe.each<Provider>(['openai', 'gemini', 'anthropic'])('%s official SDK session', provider => {
  it('builds identical replay payloads despite generations and turn numbers', async () => {
    const fetcher = transport(provider), session = createProviderSession(options(provider, 'replay'), fetcher);
    const first = session.buildRequest(0);
    const result = await session.send(first, signal());
    session.advance(result, 0);
    expect(session.buildRequest(5)).toEqual(first);
    expect(result.httpStatus).toBe(200);
    expect(result.transportAttemptCount).toBe(1);
    expect(result.headers).toEqual({ 'content-type': 'application/json', 'x-request-id': 'request_fixture', 'x-goog-request-id': 'google_request_fixture', 'cf-ray': 'ray_fixture' });
    expect(result.wireRequest).toBeDefined();
    expect(JSON.parse(result.wireRequestText!)).toEqual(result.wireRequest);
    expect(result.wireResponseText).toBe(JSON.stringify(fixtures[provider]));
    const repeated = await session.send(session.buildRequest(1), signal());
    expect(repeated.wireRequestText).toBe(result.wireRequestText);
    expect(JSON.stringify(result)).not.toContain(options(provider).apiKey);
    expect(JSON.stringify(result)).not.toContain('secret-cookie');
  });
  it('appends deterministic text using stable message boundaries', () => {
    const session = createProviderSession(options(provider, 'append'), transport(provider));
    const request0 = session.buildRequest(0), request2 = session.buildRequest(2);
    const field = provider === 'gemini' ? 'contents' : provider === 'openai' ? 'input' : 'messages';
    expect((request2[field] as unknown[]).slice(0, 1)).toEqual(request0[field]);
    expect((request2[field] as unknown[])).toHaveLength(5);
    expect(session.buildRequest(2)).toEqual(request2);
  });
  it('changes only the first perturbation line', () => {
    const session = createProviderSession(options(provider, 'perturb'), transport(provider));
    const field = provider === 'gemini' ? 'contents' : provider === 'openai' ? 'input' : 'messages';
    const a = JSON.stringify(session.buildRequest(0)[field]), b = JSON.stringify(session.buildRequest(1)[field]);
    expect(a.replace('PERTURB-000000', 'PERTURB-000001')).toBe(b);
  });
  it('preserves complete native agent output including signed/encrypted thinking', async () => {
    const session = createProviderSession(options(provider), transport(provider));
    const first = session.buildRequest(0);
    const serialized = JSON.stringify(first);
    expect(serialized).toContain('This is a read-only benchmark of fictional reference records. Retrieve 4 fixture chunks using read_fixture. Make exactly one tool call per response with {}. After receiving 4 tool results, give a one-sentence summary.');
    expect(serialized).not.toContain('on every subsequent response');
    const result = await session.send(first, signal());
    expect(result.continuationValid).toBe(true);
    session.advance(result, 0);
    const next = session.buildRequest(1);
    if (provider === 'openai') {
      const input = next.input as unknown[];
      expect(input.slice(1, 3)).toEqual(fixtures.openai.output);
      expect(input[3]).toMatchObject({ type: 'function_call_output', call_id: 'call_fixture' });
      expect(next).toMatchObject({ store: false, include: ['reasoning.encrypted_content'], reasoning: { effort: 'low', context: 'all_turns' } });
    } else if (provider === 'anthropic') {
      expect((next.messages as unknown[])[1]).toEqual({ role: 'assistant', content: fixtures.anthropic.content });
      expect(next).toMatchObject({ thinking: { type: 'between_tools' }, tool_choice: { type: 'auto' } });
    } else {
      expect((next.contents as unknown[])[1]).toEqual(fixtures.gemini.candidates[0].content);
      expect(next).toMatchObject({ config: { automaticContinuation: false, automaticFunctionCalling: { disable: true } } });
    }
    const sentNext = await session.send(next, signal());
    const wire = sentNext.wireRequest!;
    if (provider === 'openai') expect((wire.input as unknown[]).slice(1, 3)).toEqual(fixtures.openai.output);
    else if (provider === 'anthropic') expect((wire.messages as unknown[])[1]).toEqual({ role: 'assistant', content: fixtures.anthropic.content });
    else {
      expect((wire.contents as unknown[])[1]).toEqual(fixtures.gemini.candidates[0].content);
      expect(wire).toHaveProperty('generationConfig');
      expect(wire).not.toHaveProperty('config');
    }
  });
  it('stops when no real tool call was returned', async () => {
    const noTool = provider === 'openai' ? { ...fixtures.openai, output: [] }
      : provider === 'anthropic' ? { ...fixtures.anthropic, stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] }
        : { ...fixtures.gemini, candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'OK' }] } }] };
    const session = createProviderSession(options(provider), transport(provider, noTool));
    const first = session.buildRequest(0), result = await session.send(first, signal());
    expect(result.continuationValid).toBe(false);
    session.advance(result, 0);
    expect(session.buildRequest(1)).toEqual(first);
  });
  it('stops rather than inventing continuation after truncation', async () => {
    const truncated = provider === 'openai' ? { ...fixtures.openai, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }
      : provider === 'anthropic' ? { ...fixtures.anthropic, stop_reason: 'max_tokens' }
        : { ...fixtures.gemini, candidates: [{ ...fixtures.gemini.candidates[0], finishReason: 'CONTINUATION', continuationToken: 'opaque-continuation-fixture' }] };
    const fetcher = transport(provider, truncated), session = createProviderSession(options(provider), fetcher);
    const result = await session.send(session.buildRequest(0), signal());
    expect(result.continuationValid).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/incomplete|truncated/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains input telemetry and warns when replay output is truncated', async () => {
    const truncated = provider === 'openai' ? { ...fixtures.openai, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }
      : provider === 'anthropic' ? { ...fixtures.anthropic, stop_reason: 'max_tokens' }
        : { ...fixtures.gemini, candidates: [{ ...fixtures.gemini.candidates[0], finishReason: 'MAX_TOKENS' }] };
    const session = createProviderSession(options(provider, 'replay'), transport(provider, truncated));
    const result = await session.send(session.buildRequest(0), signal());
    expect(result.continuationValid).toBe(true);
    expect(result.usage?.inputTokens).toBe(2000);
    expect(result.warnings.join(' ')).toMatch(/incomplete|truncated/);
  });
  it('rejects malformed arguments for the empty-object fixture tool', async () => {
    const badArgs = provider === 'openai' ? { ...fixtures.openai, output: [{ ...fixtures.openai.output[1], arguments: '{broken' }] }
      : provider === 'anthropic' ? { ...fixtures.anthropic, content: [{ type: 'tool_use', id: 'bad', name: 'read_fixture', input: { unexpected: true } }] }
        : { ...fixtures.gemini, candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ functionCall: { name: 'read_fixture', args: { unexpected: true } } }] } }] };
    const session = createProviderSession(options(provider), transport(provider, badArgs));
    expect((await session.send(session.buildRequest(0), signal())).continuationValid).toBe(false);
  });
  it('never retries HTTP failures and exports only sanitized error metadata', async () => {
    const fetcher = transport(provider, { error: { type: 'server_error', message: `Do not expose ${options(provider).apiKey}` } }, 500);
    const session = createProviderSession(options(provider), fetcher);
    try {
      await session.send(session.buildRequest(0), signal());
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toMatchObject({ status: 500, name: 'ProviderError', transportAttemptCount: 1 });
      expect(String(error)).not.toContain(options(provider).apiKey);
      expect(JSON.stringify(error)).not.toContain(options(provider).apiKey);
      expect(JSON.stringify(error)).not.toContain('should-never-be-exported');
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('honors caller cancellation without another attempt', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const session = createProviderSession(options(provider), fetcher), controller = new AbortController();
    const result = session.send(session.buildRequest(0), controller.signal);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('aborts a timed-out HTTP request without retrying', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Promise((_resolve, reject) => {
      const rejectAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (init?.signal?.aborted) rejectAbort();
      else init?.signal?.addEventListener('abort', rejectAbort, { once: true });
    }));
    const session = createProviderSession({ ...options(provider), timeoutMs: 15 }, fetcher);
    await expect(session.send(session.buildRequest(0), signal())).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it('excludes multi-hop SDK observations from normalized cache/cost metrics', async () => {
  let calls = 0;
  const fetcher = vi.fn<typeof fetch>(async () => {
    calls++;
    return new Response(JSON.stringify(calls === 1
      ? { ...fixtures.gemini, candidates: [{ ...fixtures.gemini.candidates[0], finishReason: 'CONTINUATION', continuationToken: 'opaque-test-continuation' }] }
      : fixtures.gemini), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const session = createProviderSession(options('gemini'), fetcher);
  const request = session.buildRequest(0);
  // Deliberately override the safe default to exercise the defensive request-count check.
  (request.config as Record<string, unknown>).automaticContinuation = true;
  const result = await session.send(request, signal());
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.transportAttemptCount).toBe(2);
  expect(result.usage).toBeNull();
  expect(result.rawUsage).not.toBeNull();
  expect(result.continuationValid).toBe(false);
  expect(result.warnings.join(' ')).toContain('excluded from cache/cost metrics');
});

it('uses Opus 5.5 adaptive thinking and low effort while preserving full native history', async () => {
  const opts = options('anthropic');
  opts.profile.model = 'claude-opus-5-5';
  const fixture = { ...fixtures.anthropic, model: 'claude-opus-5-5' };
  const session = createProviderSession(opts, transport('anthropic', fixture));
  const request = session.buildRequest(0);
  expect(request).toMatchObject({ model: 'claude-opus-5-5', thinking: { type: 'adaptive' }, output_config: { effort: 'low' }, tool_choice: { type: 'auto' } });
  const result = await session.send(request, signal());
  expect(result.wireRequest).toMatchObject({ thinking: { type: 'adaptive' }, output_config: { effort: 'low' } });
  expect(result.continuationValid).toBe(true);
  session.advance(result, 0);
  expect((session.buildRequest(1).messages as unknown[])[1]).toEqual({ role: 'assistant', content: fixture.content });
});

it('redacts provider-masked credential fragments from error messages and raw error JSON', async () => {
  const fixture = { error: { type: 'invalid_api_key', message: 'Incorrect API key provided: cacheben***************-key. You can find your API key at the dashboard.' } };
  const session = createProviderSession(options('openai'), transport('openai', fixture, 401));
  try {
    await session.send(session.buildRequest(0), signal());
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error).toMatchObject({ status: 401, name: 'ProviderError' });
    expect(String(error)).toContain('Incorrect API key provided: [REDACTED]');
    expect(JSON.stringify(error)).not.toContain('cacheben');
    expect(JSON.stringify(error)).not.toContain('********');
    expect(String(error)).toContain('You can find your API key at the dashboard.');
  }
});

 it('declares the planned tool count instead of stopping an eight-turn trajectory after four chunks', () => {
  const session = createProviderSession({ ...options('gemini'), turns: 8 }, transport('gemini'));
  expect(JSON.stringify(session.buildRequest(0))).toContain('Retrieve 8 fixture chunks');
  expect(JSON.stringify(session.buildRequest(0))).not.toContain('Retrieve 4 fixture chunks');
});
