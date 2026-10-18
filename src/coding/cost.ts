import type { Profile, TokenUsage } from '../core/types';
/** Standard public API rates. GPT-6.1 Sol prices the entire request differently above 272K input. */
export function codingRequestCost(profile: Profile, usage: TokenUsage | null): number | null {
  if (!usage || !profile.pricing || usage.uncachedInputTokens === null || usage.cachedReadTokens === null || usage.cacheWriteTokens === null) return null;
  const long = profile.model === 'gpt-6.1-sol' && usage.inputTokens > 272000;
  const p = profile.pricing;
  return ((usage.uncachedInputTokens * p.input + usage.cachedReadTokens * p.cachedRead + usage.cacheWriteTokens * p.cacheWrite) * (long ? 2 : 1) + usage.outputTokens * p.output * (long ? 1.5 : 1)) / 1e6;
}
