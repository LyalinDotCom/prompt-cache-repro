import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import {
  createAgentSession, createBashToolDefinition, createEditToolDefinition,
  createReadToolDefinition, createWriteToolDefinition, createExtensionRuntime,
  ModelRuntime, SessionManager, SettingsManager, type ResourceLoader, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import type { Profile, TokenUsage } from '../core/types';
import { redactArtifacts } from '../cli';
import { extractCapturedUsage } from './transport-usage';
import { LEDGER_FIXTURE, type CodingFixtureSpec } from './fixture';

const PI_VERSION = JSON.parse(readFileSync(new URL('../../node_modules/@earendil-works/pi-coding-agent/package.json', import.meta.url), 'utf8')).version as string;
const PI_AI_VERSION = JSON.parse(readFileSync(new URL('../../node_modules/@earendil-works/pi-ai/package.json', import.meta.url), 'utf8')).version as string;


/** Enforce cancellation even for a fetch transport whose response body ignores its signal. */
function abortableResponse(response: Response, signal: AbortSignal): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  let aborted = false;
  let onAbort = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      onAbort = () => {
        aborted = true;
        controller.error(signal.reason ?? new DOMException('Request aborted', 'AbortError'));
        void reader.cancel(signal.reason).catch(() => {});
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    },
    async pull(controller) {
      try {
        const result = await reader.read();
        if (aborted) return;
        if (result.done) { signal.removeEventListener('abort', onAbort); controller.close(); }
        else controller.enqueue(result.value);
      } catch (error) { if (!aborted) { signal.removeEventListener('abort', onAbort); controller.error(error); } }
    },
    cancel(reason) { signal.removeEventListener('abort', onAbort); void reader.cancel(reason).catch(() => {}); },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export interface CodingRequest {
  index: number; endpoint: string; startedAt: string; completedAt: string | null;
  durationMs: number | null; actualIdleGapMs: number | null; httpStatus: number | null;
  requestFile: string; responseFile: string; requestHash: string;
  rawUsage: Record<string, unknown> | null; usage: TokenUsage | null;
  warnings: string[]; error: string | null;
}
export interface CodingTrialReport {
  schemaVersion: 1; profile: Profile; cwd: string; startedAt: string;
  finishedAt: string | null; status: 'running' | 'completed' | 'stopped' | 'error';
  stopReason: string | null; settings: Record<string, unknown>; requests: CodingRequest[];
  finalText: string; warnings: string[];
}
export interface CodingTrialOptions {
  profile: Profile; apiKey: string; cwd: string; prompt: string; outDir: string;
  maxOutputTokens?: number; timeoutMs?: number;
  reasoningLevel?: 'low' | 'medium' | 'high';
  fixture?: CodingFixtureSpec;
  requestTimeoutMs?: number; gapSeconds?: number; signal?: AbortSignal;
  onRequest?: (report: CodingTrialReport, request: CodingRequest) => void | Promise<void>;
  /** Offline integration tests only; production defaults to native fetch. */
  transport?: typeof fetch;
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

/** Native Pi file operations, constrained to the disposable fixture and its source files. */
export async function createRestrictedCodingTools(cwd: string, fixture: CodingFixtureSpec = LEDGER_FIXTURE) {
  const cliCommand = `node ${fixture.cliArgs.join(' ')}`;
  const bashCommands = ['node --test', 'node --test test/*.test.mjs', 'npm test', cliCommand];
  const root = await realpath(cwd);
  async function checked(path: string, mutable = false): Promise<string> {
    const absolute = resolve(root, path);
    if (!inside(root, absolute)) throw new Error('Path is outside the coding fixture.');
    if (mutable && !fixture.mutablePaths.some(dir => inside(join(root, dir), absolute))) throw new Error(`Only ${fixture.mutablePaths.map(path => path + '/').join(', ')} files may be changed; acceptance material is immutable.`);
    let ancestor = absolute;
    while (true) {
      try {
        const actual = await realpath(ancestor);
        if (!inside(root, actual)) throw new Error('Symlinks outside the coding fixture are forbidden.');
        break;
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
        const next = dirname(ancestor);
        if (next === ancestor) throw error;
        ancestor = next;
      }
    }
    return absolute;
  }
  const fileRead = async (path: string) => readFile(await checked(path));
  const mutableWrite = async (path: string, content: string) => writeFile(await checked(path, true), content);
  const tools = [
    createReadToolDefinition(root, { operations: { readFile: fileRead, access: async path => access(await checked(path)), detectImageMimeType: async () => null } }),
    createEditToolDefinition(root, { operations: { readFile: fileRead, writeFile: mutableWrite, access: async path => access(await checked(path, true)) } }),
    createWriteToolDefinition(root, { operations: { writeFile: mutableWrite, mkdir: async path => { await mkdir(await checked(path, true), { recursive: true }); } } }),
    createBashToolDefinition(root, {
      exposeSessionEnvironment: false,
      spawnHook: context => ({ ...context, cwd: root, env: {} }),
      operations: {
        exec: async (command, _cwd, options) => {
          if (!bashCommands.includes(command.trim())) throw new Error(`Allowed commands are exactly: ${bashCommands.join(' | ')}. Use read/edit/write for file operations; shell combinations are not permitted.`);
          // Both accepted spellings execute the dependency-free fixture suite directly.
          return new Promise<{ exitCode: number }>((resolveRun, reject) => {
            const files = readdirSync(join(root, 'test')).filter(name => name.endsWith('.test.mjs')).sort().map(name => join('test', name));
            const args = command.trim() === cliCommand ? fixture.cliArgs : ['--test', ...files];
            const child = spawn(process.execPath, args, { cwd: root, env: {}, stdio: ['ignore', 'pipe', 'pipe'] });
            let bytes = 0;
            const data = (chunk: Buffer) => { if (bytes < 1_000_000) options.onData(chunk.subarray(0, 1_000_000 - bytes)); bytes += chunk.length; };
            child.stdout.on('data', data); child.stderr.on('data', data);
            const abort = () => child.kill('SIGKILL');
            options.signal?.addEventListener('abort', abort, { once: true });
            const timer = setTimeout(abort, Math.min(30, options.timeout ?? 30) * 1000);
            child.on('error', error => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); reject(error); });
            child.on('close', code => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); resolveRun({ exitCode: code ?? 137 }); });
          });
        },
      },
    }),
  ];
  const bash = tools.find(tool => tool.name === 'bash')!;
  bash.description = `Run the actual test suite or fixture CLI inside this repository. Only these exact commands are allowed: ${bashCommands.map(command => `\`${command}\``).join('; ')}. No compound commands, shell operators, network, or package installation. Use read/edit/write for inspection and source changes. npm test is an alias for the same direct Node test suite. Each process has a clean environment and a 30-second limit.`;
  bash.promptSnippet = 'Run the fixed repository test suite and fixture CLI commands';
  bash.promptGuidelines = ['Use only the exact commands listed in the bash tool description. Use read for file inspection.'];
  return tools;
}

/** A real Pi coding session; the host supplies credentials and fixture/task context. */
export async function runCodingTrial(options: CodingTrialOptions): Promise<CodingTrialReport> {
  const outDir = resolve(options.outDir), cwd = await realpath(options.cwd);
  mkdirSync(join(outDir, 'requests'), { recursive: true, mode: 0o700 });
  const scrub = <T>(value: T): T => redactArtifacts(value, [options.apiKey]);
  const maxTokens = options.maxOutputTokens ?? 32768;
  const timeoutMs = options.timeoutMs ?? 20 * 60 * 1000;
  // Pi's Google adapter rejects a custom per-request fetch. Its SDK uses the
  // native global fetch; capture that boundary only for sequential Gemini trials.
  const previousGlobalFetch = globalThis.fetch;
  const transportFetch = options.transport ?? previousGlobalFetch;
  let globalFetchPatched = false;
  const requestTimeoutMs = options.requestTimeoutMs ?? timeoutMs;
  const gapMs = (options.gapSeconds ?? 5) * 1000;
  const controller = new AbortController();
  const externalAbort = () => { report.stopReason ||= 'Caller cancellation'; controller.abort(); };
  const settings = { cacheWarming: 'off', compaction: { enabled: false }, retry: { enabled: false, provider: { maxRetries: 0, timeoutMs: requestTimeoutMs } } } as const;
  const report: CodingTrialReport = {
    schemaVersion: 1, profile: structuredClone(options.profile), cwd, startedAt: new Date().toISOString(), finishedAt: null,
    status: 'running', stopReason: null, settings: { piVersion: PI_VERSION, piAiVersion: PI_AI_VERSION, ...settings, reasoningLevel: options.reasoningLevel ?? 'high', maxTokens, gapSeconds: gapMs / 1000, timeoutMs, termination: 'natural completion or session deadline; no request-count or spending cutoff', tools: ['read', 'edit', 'write', 'bash'], bashCommand: 'node --test', mutablePaths: (options.fixture ?? LEDGER_FIXTURE).mutablePaths, runtime: 'node', auth: 'explicit paid API key; operator-declared tier' },
    requests: [], finalText: '', warnings: ['Pi streaming API arm; compare separately from earlier synthetic nonstreaming runs.', 'Tool file operations are path-restricted; test and CLI children have empty environments. This is a trusted fixture workflow, not an operating-system sandbox.'],
  };
  report.settings.fixture = options.fixture ?? LEDGER_FIXTURE;
  report.settings.allowedBashCommands = ['node --test', 'node --test test/*.test.mjs', 'npm test', `node ${(options.fixture ?? LEDGER_FIXTURE).cliArgs.join(' ')}`];
  const save = () => {
    const target = join(outDir, 'coding-report.json');
    writeFileSync(`${target}.tmp`, JSON.stringify(scrub(report), null, 2) + '\n', { mode: 0o600 });
    renameSync(`${target}.tmp`, target);
  };
  save();
  writeFileSync(join(outDir, 'settings.json'), JSON.stringify(report.settings, null, 2) + '\n', { mode: 0o600 });
  writeFileSync(join(outDir, 'initial-prompt.txt'), scrub(options.prompt), { mode: 0o600 });
  options.signal?.addEventListener('abort', externalAbort, { once: true });
  if (options.signal?.aborted) externalAbort();
  const deadline = setTimeout(() => { report.stopReason = 'Trial deadline'; controller.abort(); }, timeoutMs);
  let previousCompleted = 0;
  let inferenceHttpRequests = 0;
  let lastCapture: Promise<void> = Promise.resolve();
  const captures: Promise<void>[] = [];
  const permittedOrigin = { gemini: 'https://generativelanguage.googleapis.com', openai: 'https://api.openai.com', anthropic: 'https://api.anthropic.com' }[options.profile.provider];
  const captureFetch: typeof fetch = async (input, init) => {
    await lastCapture;
    if (controller.signal.aborted) throw new DOMException('Coding trial stopped.', 'AbortError');
    if (inferenceHttpRequests > 0) {
      report.stopReason = 'Unexpected extra HTTP request within one Pi inference; retry/continuation blocked before dispatch';
      controller.abort();
      throw new Error(report.stopReason);
    }
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== permittedOrigin) throw new Error('Pi attempted a nonapproved provider origin.');
    while (previousCompleted && performance.now() < previousCompleted + gapMs) {
      const remaining = Math.max(0, previousCompleted + gapMs - performance.now());
      if (remaining) await new Promise<void>((done, fail) => {
        const abort = () => { clearTimeout(timer); fail(new DOMException('Coding trial stopped.', 'AbortError')); };
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); done(); }, Math.ceil(remaining));
        controller.signal.addEventListener('abort', abort, { once: true });
      });
    }
    if (controller.signal.aborted) throw new DOMException('Coding trial stopped.', 'AbortError');
    let body = init?.body;
    const bodyText = typeof body === 'string' ? body : input instanceof Request ? await input.clone().text() : body == null ? '' : String(body);
    const index = report.requests.length, name = String(index).padStart(3, '0');
    const request: CodingRequest = { index, endpoint: url.origin + url.pathname, startedAt: new Date().toISOString(), completedAt: null, durationMs: null,
      actualIdleGapMs: previousCompleted ? performance.now() - previousCompleted : null, httpStatus: null,
      requestFile: `requests/${name}-request.json`, responseFile: `requests/${name}-response.sse`, requestHash: createHash('sha256').update(bodyText).digest('hex'), rawUsage: null, usage: null, warnings: [], error: null };
    writeFileSync(join(outDir, request.requestFile), scrub(bodyText), { mode: 0o600 });
    writeFileSync(join(outDir, request.responseFile), '', { mode: 0o600 });
    report.requests.push(request); save();
    inferenceHttpRequests++;
    const started = performance.now();
    const requestSignal = AbortSignal.any([controller.signal, ...(init?.signal ? [init.signal] : []), AbortSignal.timeout(requestTimeoutMs)]);
    let response: Response;
    try { response = abortableResponse(await transportFetch(input, { ...init, signal: requestSignal }), requestSignal); }
    catch (error) { request.error = scrub(error instanceof Error ? error.message : String(error)); request.completedAt = new Date().toISOString(); request.durationMs = performance.now() - started; previousCompleted = performance.now(); save(); await options.onRequest?.(report, request); throw new Error(request.error); }
    request.httpStatus = response.status;
    const clone = response.clone();
    const capture = (async () => {
      let raw = '';
      try {
        const reader = clone.body?.getReader(), decoder = new TextDecoder();
        if (reader) while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true }); raw += text;
          appendFileSync(join(outDir, request.responseFile), scrub(text));
        }
        raw += decoder.decode();
        const parsed = extractCapturedUsage(options.profile.provider, raw);
        request.rawUsage = parsed.rawUsage; request.usage = parsed.usage; request.warnings.push(...parsed.warnings);
      } catch (error) { request.error = scrub(error instanceof Error ? error.message : String(error)); }
      finally { writeFileSync(join(outDir, request.responseFile), scrub(raw), { mode: 0o600 }); previousCompleted = performance.now(); request.completedAt = new Date().toISOString(); request.durationMs = previousCompleted - started; save(); await options.onRequest?.(report, request); }
    })();
    captures.push(capture); lastCapture = capture;
    return response;
  };
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  try {
    const provider = options.profile.provider === 'gemini' ? 'google' : options.profile.provider;
    const credentials = new InMemoryCredentialStore();
    await credentials.modify(provider, async () => ({ type: 'api_key', key: options.apiKey }));
    const runtime = await ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
    const catalogModel = runtime.getModel(provider, options.profile.model);
    const model = catalogModel ? { ...catalogModel, contextWindow: catalogModel.id === 'gpt-6.1-sol' ? 1_050_000 : catalogModel.contextWindow } : undefined;
    report.settings.catalogContextWindow = catalogModel?.contextWindow;
    if (catalogModel?.id === 'gpt-6.1-sol') report.settings.contextWindowSource = 'https://developers.openai.com/api/docs/models/gpt-6.1-sol';
    if (!model || model.id !== options.profile.model) throw new Error('Requested exact model is absent from the pinned Pi catalog; no fallback permitted.');
    report.settings.model = scrub(model);
    const resourceLoader: ResourceLoader = {
      getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
      getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }),
      getThemes: () => ({ themes: [], diagnostics: [] }), getAgentsFiles: () => ({ agentsFiles: [] }),
      getSystemPrompt: () => undefined, getSystemPromptSource: () => undefined,
      getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [],
      extendResources: () => {}, reload: async () => {},
    };
    const created = await createAgentSession({ cwd, agentDir: join(outDir, 'pi-state'), model, modelRuntime: runtime,
      thinkingLevel: options.reasoningLevel ?? 'high', resourceLoader, tools: ['read', 'bash', 'edit', 'write'],
      customTools: await createRestrictedCodingTools(cwd, options.fixture) as unknown as ToolDefinition[], sessionManager: SessionManager.inMemory(cwd),
      settingsManager: SettingsManager.inMemory(settings),
    });
    session = created.session;
    if (created.modelFallbackMessage || session.model?.id !== options.profile.model) throw new Error('Pi selected a different model; no fallback permitted.');
    if (session.model?.contextWindow !== model.contextWindow) throw new Error('Pi changed the declared context capacity; no calls started.');
    session.agent.transport = 'sse';
    const originalStream = session.agent.streamFunction;
    session.agent.streamFunction = (requested, context, streamOptions) => {
      inferenceHttpRequests = 0;
      return originalStream(requested, context, {
        ...streamOptions, apiKey: options.apiKey,
        fetch: options.profile.provider === 'gemini' ? undefined : captureFetch, maxRetries: 0,
        timeoutMs: requestTimeoutMs, maxTokens, transport: 'sse',
      });
    };
    if (options.profile.provider === 'gemini') {
      report.settings.transportCapture = 'Temporary global fetch boundary, restored after this sequential Gemini trial; Pi rejects per-request Google fetch overrides.';
      globalThis.fetch = captureFetch;
      globalFetchPatched = true;
    }
    session.subscribe(event => {
      // Final messages and tool events carry actual code changes/test output; deltas are redundant with raw SSE.
      if (event.type !== 'message_update') appendFileSync(join(outDir, 'agent-events.jsonl'), JSON.stringify(scrub(event)) + '\n');
    });
    const stopSession = () => { void session?.abort(); };
    controller.signal.addEventListener('abort', stopSession, { once: true });
    writeFileSync(join(outDir, 'system-prompt.txt'), scrub(session.systemPrompt), { mode: 0o600 });
    save();
    try { if (!controller.signal.aborted) await session.prompt(options.prompt); }
    finally { controller.signal.removeEventListener('abort', stopSession); }
    await Promise.allSettled(captures);
    report.finalText = session.getLastAssistantText() ?? '';
    const last = session.messages.filter(message => message.role === 'assistant').at(-1);
    if (last && 'stopReason' in last && ['error', 'aborted', 'length'].includes(String(last.stopReason))) report.stopReason ||= `Pi assistant ${last.stopReason}`;
    report.status = controller.signal.aborted || report.stopReason ? 'stopped' : 'completed';
    writeFileSync(join(outDir, 'messages.json'), JSON.stringify(scrub(session.messages), null, 2) + '\n', { mode: 0o600 });
  } catch (error) { report.status = controller.signal.aborted ? 'stopped' : 'error'; report.stopReason ||= scrub(error instanceof Error ? error.message : String(error)); }
  finally {
    session?.dispose();
    await Promise.allSettled(captures);
    if (globalFetchPatched) globalThis.fetch = previousGlobalFetch;
    clearTimeout(deadline); options.signal?.removeEventListener('abort', externalAbort);
    report.finishedAt = new Date().toISOString();
    save();
  }
  return scrub(report);
}
