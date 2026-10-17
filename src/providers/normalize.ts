import type { TokenUsage } from '../core/types';

export interface NormalizedUsage { usage: TokenUsage | null; warnings: string[] }
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function counter(raw: Record<string, unknown>, key: string, warnings: string[]): number | null {
  const value = count(raw[key]);
  if (value === null) warnings.push(`Missing or invalid usage counter: ${key}.`);
  return value;
}

/** Responses API input_tokens includes reads AND writes. Neither is an additive fee. */
export function normalizeOpenAIUsage(value: unknown): NormalizedUsage {
  const raw = record(value), warnings: string[] = [];
  if (!raw) return { usage: null, warnings: ['OpenAI response did not contain usage.'] };
  const input = counter(raw, 'input_tokens', warnings), output = counter(raw, 'output_tokens', warnings);
  const detail = record(raw.input_tokens_details) ?? {};
  let read = counter(detail, 'cached_tokens', warnings);
  let write = counter(detail, 'cache_write_tokens', warnings);
  const outputDetail = record(raw.output_tokens_details);
  const thinking = outputDetail?.reasoning_tokens === undefined ? 0 : counter(outputDetail, 'reasoning_tokens', warnings);
  if (input === null || output === null || thinking === null || thinking > output) {
    if (thinking !== null && output !== null && thinking > output) warnings.push('Reasoning tokens exceed total output tokens.');
    return { usage: null, warnings };
  }
  if ((read !== null && read > input) || (write !== null && write > input) ||
      (read !== null && write !== null && read + write > input)) {
    warnings.push('OpenAI cache counters exceed inclusive input_tokens; cache accounting is unknown.');
    read = null; write = null;
  }
  return { usage: { inputTokens: input, cachedReadTokens: read, cacheWriteTokens: write,
    uncachedInputTokens: read !== null && write !== null ? input - read - write : null,
    outputTokens: output, thinkingTokens: thinking }, warnings };
}

/** generateContent promptTokenCount includes cached tokens; candidate output excludes thoughts. */
export function normalizeGeminiUsage(value: unknown): NormalizedUsage {
  const raw = record(value), warnings: string[] = [];
  if (!raw) return { usage: null, warnings: ['Gemini response did not contain usageMetadata.'] };
  const input = counter(raw, 'promptTokenCount', warnings);
  const candidates = counter(raw, 'candidatesTokenCount', warnings);
  const thinking = raw.thoughtsTokenCount === undefined ? 0 : counter(raw, 'thoughtsTokenCount', warnings);
  let read: number | null;
  if (!Object.hasOwn(raw, 'cachedContentTokenCount') && input !== null) {
    // Public v1beta proto: cached_content_token_count is a plain int32 with no explicit presence.
    // ProtoJSON omits default-valued non-presence fields. Decode that omission as zero,
    // while absence of the entire usage object is NEVER a zero hit.
    read = 0;
    warnings.push('Gemini omitted cachedContentTokenCount; decoded as zero under the proto3 non-presence int32 / ProtoJSON default-zero contract. Raw usage is preserved.');
  } else read = counter(raw, 'cachedContentTokenCount', warnings);
  if (input === null || candidates === null || thinking === null) return { usage: null, warnings };
  if (read !== null && read > input) {
    warnings.push('Gemini cachedContentTokenCount exceeds inclusive promptTokenCount; cache accounting is unknown.');
    read = null;
  }
  const tool = raw.toolUsePromptTokenCount === undefined ? 0 : counter(raw, 'toolUsePromptTokenCount', warnings);
  if (tool === null || tool > 0) {
    warnings.push('Unexpected server tool-use prompt tokens; no built-in tools are configured. Usage requires manual review.');
    return { usage: null, warnings };
  }
  if (!Number.isSafeInteger(candidates + thinking)) return { usage: null, warnings: [...warnings, 'Gemini output token sum exceeds safe integer range.'] };
  return { usage: { inputTokens: input, cachedReadTokens: read, cacheWriteTokens: 0,
    uncachedInputTokens: read === null ? null : input - read,
    outputTokens: candidates + thinking, thinkingTokens: thinking }, warnings };
}

/** Messages API input_tokens EXCLUDES both reads and writes. */
export function normalizeAnthropicUsage(value: unknown): NormalizedUsage {
  const raw = record(value), warnings: string[] = [];
  if (!raw) return { usage: null, warnings: ['Anthropic response did not contain usage.'] };
  const uncached = counter(raw, 'input_tokens', warnings);
  const read = counter(raw, 'cache_read_input_tokens', warnings);
  const write = counter(raw, 'cache_creation_input_tokens', warnings);
  const output = counter(raw, 'output_tokens', warnings);
  if (uncached === null || read === null || write === null || output === null) {
    warnings.push('Anthropic total input cannot be reconstructed without all three exclusive input counters.');
    return { usage: null, warnings };
  }
  const creation = record(raw.cache_creation);
  if (creation && typeof creation.ephemeral_1h_input_tokens === 'number' && creation.ephemeral_1h_input_tokens > 0) {
    warnings.push('Unexpected 1-hour cache writes; default 5-minute cache-write pricing is not applicable.');
    return { usage: null, warnings };
  }
  if (!Number.isSafeInteger(uncached + read + write)) return { usage: null, warnings: [...warnings, 'Anthropic input token sum exceeds safe integer range.'] };
  return { usage: { inputTokens: uncached + read + write, cachedReadTokens: read,
    cacheWriteTokens: write, uncachedInputTokens: uncached, outputTokens: output,
    // Messages usage does not expose a separate numeric thinking-token counter.
    thinkingTokens: 0 }, warnings };
}
