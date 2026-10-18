import { resolveConfig } from '../cli';

/** Coding sessions finish naturally. Generic control turn/budget settings do not apply. */
export function resolveCodingConfig(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Coding config must be an object.');
  const raw = input as Record<string, unknown>;
  const allowed = new Set(['accounts', 'models', 'trials', 'gapsSeconds', 'maxOutputTokens', 'timeoutMs', 'seed', 'sessionTimeoutMs', 'reasoningLevel', 'fixtures']);
  if (Object.keys(raw).some(key => !allowed.has(key))) throw new Error('Unsupported coding setting. Coding sessions have no turns or spending cutoff; use sessionTimeoutMs. Historical configs remain evidence, not current run configs.');
  const { sessionTimeoutMs = 20 * 60 * 1000, reasoningLevel = 'high', fixtures = ['coding-ledger'], ...shared } = raw;
  if (!Array.isArray(fixtures) || !fixtures.length || new Set(fixtures).size !== fixtures.length || fixtures.some(id => typeof id !== 'string' || !/^coding-[a-z0-9-]+$/.test(id))) throw new Error('fixtures must contain unique coding fixture IDs.');
  if (!['low', 'medium', 'high'].includes(String(reasoningLevel))) throw new Error('reasoningLevel must be low, medium, or high.');
  if (typeof sessionTimeoutMs !== 'number' || !Number.isInteger(sessionTimeoutMs) || sessionTimeoutMs < 1 || sessionTimeoutMs > 20 * 60 * 1000) throw new Error('sessionTimeoutMs must be an integer between 1 and 1200000 (20 minutes).');
  const { profiles, trials, gapsSeconds, maxOutputTokens, timeoutMs, seed } = resolveConfig({ ...shared, scenario: 'agent', maxOutputTokens: shared.maxOutputTokens ?? 32768, timeoutMs: shared.timeoutMs ?? sessionTimeoutMs });
  return { fixtures: fixtures as string[], profiles, trials, gapsSeconds, maxOutputTokens, timeoutMs, seed, sessionTimeoutMs, reasoningLevel: reasoningLevel as 'low' | 'medium' | 'high' };
}
