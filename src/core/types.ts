export type Provider = 'gemini' | 'openai' | 'anthropic';
export type Scenario = 'replay' | 'append' | 'agent' | 'perturb';
export interface RateCard {
  input: number; cachedRead: number; cacheWrite: number; output: number;
  source: string; asOf: string; note?: string;
}
export interface Account {
  id: string; label: string; provider: Provider; tier: string; keyEnv?: string;
}
export interface ModelSpec {
  id: string; label: string; provider: Provider; model: string;
  pricing: RateCard | null; cacheMinTokens: number;
}
export interface Profile {
  id: string; label: string; provider: Provider; model: string; tier: string;
  accountId: string; keyEnv?: string; pricing: RateCard | null; cacheMinTokens: number;
}
export interface BenchmarkConfig {
  scenario: Scenario; profiles: Profile[]; turns: number; trials: number;
  gapsSeconds: number[]; prefixChars: number; deltaChars: number;
  maxOutputTokens: number; toleranceTokens: number; timeoutMs: number;
  seed: string;
}
export interface TokenUsage {
  inputTokens: number; cachedReadTokens: number | null;
  cacheWriteTokens: number | null; uncachedInputTokens: number | null;
  outputTokens: number; thinkingTokens: number;
}
export interface SessionOptions {
  profile: Profile; apiKey: string; scenario: Scenario; prefix: string;
  deltaChars: number; turns: number; maxOutputTokens: number; timeoutMs: number; trialNonce: string;
}
export interface ProviderResult {
  transportAttemptCount?: number;
  wireRequest?: Record<string, unknown>;
  wireRequestText?: string; wireResponseText?: string;
  rawResponse: unknown; rawUsage: Record<string, unknown> | null;
  usage: TokenUsage | null; responseId: string | null; resolvedModel: string | null;
  httpStatus: number | null; headers: Record<string, string>;
  warnings: string[]; continuationValid: boolean; stopReason: string | null;
}
export interface ProviderSession {
  buildRequest(turn: number): Record<string, unknown>;
  send(request: Record<string, unknown>, signal: AbortSignal): Promise<ProviderResult>;
  advance(result: ProviderResult, turn: number): void;
}
export type SessionFactory = (options: SessionOptions) => ProviderSession;
export interface Observation {
  transportAttemptCount?: number;
  eligibleReusableTokens?: number | null; eligibleFullHit?: boolean | null; eligibleReuseShortfallTokens?: number | null;
  eligibleIdealInputCostUsd?: number | null; theoreticalIdealInputCostUsd?: number | null;
  continuationValid?: boolean; stopReason?: string | null;
  wireRequest?: Record<string, unknown>;
  wireRequestText?: string; wireResponseText?: string;
  runId: string; cellId: string; trialId: string; profileId: string; accountId: string;
  provider: Provider; model: string; resolvedModel: string | null; tier: string;
  scenario: Scenario; trial: number; turn: number; gapSeconds: number;
  actualIdleGapMs: number | null; startedAt: string; durationMs: number;
  status: 'ok' | 'error' | 'cancelled'; error: string | null;
  httpStatus: number | null; responseId: string | null; headers: Record<string, string>;
  requestHash: string; prefixHash: string; request: Record<string, unknown>;
  rawResponse: unknown; rawUsage: Record<string, unknown> | null; usage: TokenUsage | null;
  previousInputTokens: number | null; expectedReusableTokens: number | null;
  fullHit: boolean | null; anyHit: boolean | null; reuseShortfallTokens?: number | null;
  actualInputCostUsd: number | null; idealInputCostUsd: number | null;
  outputCostUsd: number | null; warnings: string[];
}
export interface CellSummary {
  eligibleMeasuredTurns?: number; eligibleFullHits?: number; eligibleFullHitRate?: number | null; eligibleCaptureRate?: number | null;
  eligibleIdealInputCostUsd?: number | null; eligibleInputCostMultiplier?: number | null; eligibleFollowupCostMultiplier?: number | null;
  theoreticalIdealInputCostUsd?: number | null; theoreticalInputCostMultiplier?: number | null;
  cellId: string; profile: Profile; scenario: Scenario; gapSeconds: number;
  attempts: number; successes: number; errors: number; measuredTurns: number;
  anyHitMeasuredTurns?: number; tokenMeasuredTurns?: number;
  fullHits: number; fullHitRate: number | null; fullHitInterval: [number, number] | null;
  anyHitRate: number | null; tokenHitRate: number | null; reusableCaptureRate: number | null;
  actualInputCostUsd: number | null; idealInputCostUsd: number | null;
  inputCostMultiplier: number | null; followupCostMultiplier: number | null;
  outputCostUsd: number | null; totalCostUsd: number | null;
  p50DurationMs: number | null; warnings: string[];
}
export interface RunReport {
  schemaVersion: 1; runId: string; createdAt: string; finishedAt: string | null;
  status: 'running' | 'completed' | 'cancelled' | 'incomplete';
  runtime: 'browser' | 'node' | 'test'; config: BenchmarkConfig;
  observations: Observation[]; summaries: CellSummary[];
  warnings: string[]; sdkVersions: Record<string, string>;
}
export type RunnerEvent =
  | { type: 'status'; message: string; completed: number; total: number }
  | { type: 'observation'; observation: Observation; report: RunReport }
  | { type: 'waiting'; until: number; message: string }
  | { type: 'complete'; report: RunReport };
