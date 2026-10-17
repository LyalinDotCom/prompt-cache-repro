import { describe, expect, it } from 'vitest';
import { extractCapturedUsage } from '../src/coding/transport-usage';
const sse = (...events: unknown[]) => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n';

describe('captured per-request streaming usage', () => {
  it('uses the final OpenAI response counter snapshot once', () => {
    const usage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 700, cache_write_tokens: 200 }, output_tokens: 90, output_tokens_details: { reasoning_tokens: 50 } };
    const result = extractCapturedUsage('openai', sse({ type: 'response.created', response: { usage: null } }, { type: 'response.output_text.delta', delta: 'hello' }, { type: 'response.completed', response: { usage } }));
    expect(result.rawUsage).toEqual(usage);
    expect(result.usage).toMatchObject({ inputTokens: 1000, cachedReadTokens: 700, cacheWriteTokens: 200, uncachedInputTokens: 100, outputTokens: 90 });
  });
  it('retains incomplete OpenAI response usage and refuses unfinished-only events', () => {
    const usage = { input_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 90 }, output_tokens: 20 };
    expect(extractCapturedUsage('openai', sse({ type: 'response.incomplete', response: { usage } })).usage?.outputTokens).toBe(20);
    expect(extractCapturedUsage('openai', sse({ type: 'response.in_progress', response: { usage } })).usage).toBeNull();
  });
  it('merges Anthropic start and delta counters by replacement, not addition', () => {
    const result = extractCapturedUsage('anthropic', sse(
      { type: 'message_start', message: { usage: { input_tokens: 4, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200, output_tokens: 1 } } },
      { type: 'message_delta', usage: { output_tokens: 30 } },
      { type: 'message_delta', usage: { output_tokens: 40 } },
    ));
    expect(result.usage).toMatchObject({ inputTokens: 1204, cachedReadTokens: 1000, cacheWriteTokens: 200, uncachedInputTokens: 4, outputTokens: 40 });
  });
  it('uses the latest Gemini usage metadata from SSE or JSON arrays', () => {
    const events = [{ usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 5 } }, { usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 800, candidatesTokenCount: 10, thoughtsTokenCount: 20 } }];
    for (const body of [sse(...events), JSON.stringify(events)]) expect(extractCapturedUsage('gemini', body).usage).toMatchObject({ inputTokens: 1000, cachedReadTokens: 800, outputTokens: 30 });
  });
  it('preserves missing usage as unknown and reports malformed SSE', () => {
    const result = extractCapturedUsage('gemini', 'event: error\ndata: {broken}\n\n');
    expect(result.rawUsage).toBeNull();
    expect(result.usage).toBeNull();
    expect(result.warnings.join(' ')).toContain('malformed SSE');
  });
});
