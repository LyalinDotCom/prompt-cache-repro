import type { Provider, TokenUsage } from '../core/types';
import { normalizeAnthropicUsage, normalizeGeminiUsage, normalizeOpenAIUsage } from '../providers/normalize';

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as ObjectValue : null;

/** Streaming counters are cumulative snapshots. Never sum SSE chunks into request usage. */
export function extractCapturedUsage(provider: Provider, bodyText: string): { rawUsage: ObjectValue | null; usage: TokenUsage | null; warnings: string[] } {
  const warnings: string[] = [], events: ObjectValue[] = [];
  const append = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(append);
    else { const item = object(v); if (item) events.push(item); }
  };
  try { append(JSON.parse(bodyText)); }
  catch {
    let malformed = 0;
    for (const frame of bodyText.replaceAll('\r\n', '\n').split(/\n\s*\n/)) {
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data || data.trim() === '[DONE]') continue;
      try { append(JSON.parse(data)); } catch { malformed++; }
    }
    if (malformed) warnings.push(`Captured response contains ${malformed} malformed SSE data frame(s); raw text remains authoritative.`);
  }
  let rawUsage: ObjectValue | null = null;
  if (provider === 'openai') {
    for (const event of events) {
      if (['response.completed', 'response.incomplete', 'response.failed'].includes(String(event.type))) {
        const usage = object(object(event.response)?.usage);
        if (usage) rawUsage = usage;
      } else if (event.object === 'response' || (typeof event.status === 'string' && Array.isArray(event.output))) {
        const usage = object(event.usage); if (usage) rawUsage = usage;
      }
    }
  } else if (provider === 'gemini') {
    for (const event of events) { const usage = object(event.usageMetadata); if (usage) rawUsage = usage; }
  } else {
    for (const event of events) {
      const incoming = event.type === 'message_start' ? object(object(event.message)?.usage)
        : event.type === 'message_delta' || event.type === 'message' ? object(event.usage) : null;
      if (!incoming) continue;
      const prior: ObjectValue = rawUsage ?? {};
      rawUsage = { ...prior, ...incoming };
      for (const field of ['cache_creation', 'output_tokens_details']) {
        const a = object(prior[field]), b = object(incoming[field]);
        if (a && b) rawUsage[field] = { ...a, ...b };
      }
    }
  }
  const normalized = provider === 'openai' ? normalizeOpenAIUsage(rawUsage)
    : provider === 'gemini' ? normalizeGeminiUsage(rawUsage) : normalizeAnthropicUsage(rawUsage);
  return { rawUsage, usage: normalized.usage, warnings: [...warnings, ...normalized.warnings] };
}
