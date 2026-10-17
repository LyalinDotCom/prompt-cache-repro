import { describe, expect, it } from 'vitest';
import { runBenchmark, estimateRun, validateConfig } from '../src/core/runner';
import { normalizeUsage, actualInputCost } from '../src/core/metrics';
import { expandProfiles, validateAccount, validateModelSpec } from '../src/core/catalog';
import { DEFAULT_ACCOUNTS, DEFAULT_MODELS } from '../src/core/defaults';
import { makePrefix, sha256 } from '../src/core/workload';
import { toCsv, toJsonl, toMarkdown, toSummaryCsv } from '../src/core/report';
import type { BenchmarkConfig, Profile, ProviderResult, SessionFactory, TokenUsage } from '../src/core/types';

const profile: Profile = { id:'test-account::test-model', accountId:'test-account', label:'Test', provider:'openai', model:'gpt-6.1-sol', tier:'test', cacheMinTokens:512, pricing:{input:2,cachedRead:0.1,cacheWrite:2.5,output:10,source:'fixture',asOf:'2026-10-17'} };
const config = (patch: Partial<BenchmarkConfig> = {}): BenchmarkConfig => ({scenario:'append',profiles:[profile],turns:3,trials:1,gapsSeconds:[0],prefixChars:100,deltaChars:100,maxOutputTokens:16,toleranceTokens:64,timeoutMs:1000,seed:'fixture',...patch});
const usage = (turn: number, miss = false): TokenUsage => ({ inputTokens:1000 + turn*100, cachedReadTokens:turn && !miss ? 1000+(turn-1)*100 : 0, cacheWriteTokens:turn && !miss ? 100 : 1000+turn*100, uncachedInputTokens:0, outputTokens:10, thinkingTokens:0 });
const result = (u:TokenUsage|null): ProviderResult => ({transportAttemptCount:1,rawResponse:{ok:true},rawUsage:{fixture:true},usage:u,responseId:'fixture',resolvedModel:'gpt-6.1-sol',httpStatus:200,headers:{},warnings:[],continuationValid:true,stopReason:'stop'});
function factory(make: (turn:number)=>ProviderResult = turn => result(usage(turn))): SessionFactory {
  return options => ({buildRequest:turn=>({prefix:options.prefix,turn}),send:async request=>make(request.turn as number),advance:()=>{}});
}

describe('cache benchmark metrics and execution', () => {
  it('uses varied reproducible reference records', () => {
    const text = makePrefix(20000,'seed');
    expect(text).toHaveLength(20000); expect(text).toBe(makePrefix(20000,'seed')); expect(text).not.toBe(makePrefix(20000,'other'));
    expect(new Set(text.split('\n').filter(Boolean)).size).toBeGreaterThan(30);
  });
  it('perfect trace has ratio one, with warmup charged but excluded from hits', async () => {
    const report = await runBenchmark(config(),{}, {sessionFactory:factory(),runtime:'test'});
    const s=report.summaries[0];
    expect(s.measuredTurns).toBe(2); expect(s.fullHitRate).toBe(1); expect(s.inputCostMultiplier).toBeCloseTo(1); expect(s.followupCostMultiplier).toBeCloseTo(1);
    expect(new Set(report.observations.map(o=>o.prefixHash)).size).toBe(1); expect(report.observations[0].fullHit).toBeNull(); expect(report.observations[0].actualInputCostUsd).toBeCloseTo(.0025); expect(report.observations[1].reuseShortfallTokens).toBe(0);
    expect(s.outputCostUsd).toBeCloseTo(.0003);
  });
  it('separates ordinary 132-token overhead from explicit eligible cache boundaries', async () => {
    const withOverhead=(turn:number):TokenUsage=>({...usage(turn),inputTokens:1132+turn*100,uncachedInputTokens:132});
    const r=await runBenchmark(config(),{}, {sessionFactory:factory(turn=>result(withOverhead(turn)))});
    expect(r.observations[1].fullHit).toBe(false); expect(r.observations[1].reuseShortfallTokens).toBe(132);
    expect(r.observations[1].eligibleReusableTokens).toBe(1000); expect(r.observations[1].eligibleFullHit).toBe(true); expect(r.observations[1].eligibleReuseShortfallTokens).toBe(0);
    expect(r.observations[1].eligibleIdealInputCostUsd).toBeCloseTo((132*2+1000*.1+100*2.5)/1e6);
    expect(r.summaries[0].eligibleFullHitRate).toBe(1); expect(r.summaries[0].eligibleInputCostMultiplier).toBeCloseTo(1);
    expect(r.summaries[0].theoreticalInputCostMultiplier).toBeGreaterThan(1); expect(r.observations[1].transportAttemptCount).toBe(1);
    const partial=await runBenchmark(config({turns:2}),{}, {sessionFactory:factory(turn=>result(turn?{...withOverhead(turn),cachedReadTokens:500,cacheWriteTokens:600}:withOverhead(0)))});
    expect(partial.observations[1].eligibleFullHit).toBe(false); expect(partial.summaries[0].eligibleInputCostMultiplier).toBeGreaterThan(1);
  });
  it('keeps Gemini eligible frontier unknown and persists failed transport attempt count', async () => {
    const gemini={...profile,provider:'gemini' as const};
    const r=await runBenchmark(config({profiles:[gemini]}),{}, {sessionFactory:factory()});
    expect(r.observations[1].eligibleReusableTokens).toBeNull(); expect(r.summaries[0].eligibleInputCostMultiplier).toBeNull();
    const failed=await runBenchmark(config(),{}, {sessionFactory:factory(()=>{throw Object.assign(new Error('server failed'),{status:500,transportAttemptCount:1});})});
    expect(failed.observations[0].transportAttemptCount).toBe(1); expect(toCsv(failed)).toContain('transportAttemptCount');
  });
  it('a miss raises actual / ideal input cost', async () => {
    const report=await runBenchmark(config(),{}, {sessionFactory:factory(turn=>result(usage(turn,turn===1)))});
    expect(report.observations[1].reuseShortfallTokens).toBe(1000); expect(report.summaries[0].inputCostMultiplier).toBeGreaterThan(1); expect(report.summaries[0].fullHitRate).toBe(.5);
  });
  it('keeps missing counters unknown and rejects negative/inconsistent counters', () => {
    const u=normalizeUsage({...usage(1),cachedReadTokens:null,uncachedInputTokens:null});
    expect(u?.cachedReadTokens).toBeNull(); expect(actualInputCost(u,profile)).toBeNull();
    expect(normalizeUsage({...usage(1),cacheWriteTokens:-1})).toBeNull();
    expect(normalizeUsage({...usage(1),cachedReadTokens:2000})).toBeNull();
  });
  it('missing telemetry is excluded, never converted to a cache miss', async () => {
    const r=await runBenchmark(config(),{}, {sessionFactory:factory(turn=>result(turn===1?null:usage(turn)))});
    expect(r.summaries[0].measuredTurns).toBe(0); expect(r.summaries[0].fullHitRate).toBeNull(); expect(r.summaries[0].actualInputCostUsd).toBeNull();
    expect(r.observations[2].idealInputCostUsd).toBeNull();
  });
  it('stops a failed trial and excludes error attempts from denominators', async () => {
    const r=await runBenchmark(config({turns:5}),{'test-account':'test-secret'},{sessionFactory:factory(turn=>{if(turn===2) throw new Error('failed test-secret'); return result(usage(turn));})});
    expect(r.status).toBe('incomplete'); expect(r.observations).toHaveLength(3); expect(r.summaries[0].errors).toBe(1); expect(r.summaries[0].measuredTurns).toBe(1); expect(r.summaries[0].fullHitRate).toBe(1);
    expect(JSON.stringify(r)).not.toContain('test-secret');
  });
  it('twelve 20-turn trials yield 228 measured followups with isolated prefixes', async () => {
    const prefixes:string[]=[];
    const f:SessionFactory = options=>{prefixes.push(options.prefix); return factory()(options);};
    const r=await runBenchmark(config({turns:20,trials:12}),{}, {sessionFactory:f});
    expect(r.observations).toHaveLength(240); expect(r.summaries[0].measuredTurns).toBe(228); expect(new Set(prefixes).size).toBe(12);
    expect(r.observations.filter(o=>o.turn===0).every(o=>o.previousInputTokens===null&&o.expectedReusableTokens===null)).toBe(true);
    const r2=await runBenchmark(config(),{}, {sessionFactory:factory()});
    expect(r2.observations[0].prefixHash).not.toBe(r.observations[0].prefixHash);
  });
  it('records an actual completion-to-send idle gap', async () => {
    const r=await runBenchmark(config({turns:2,gapsSeconds:[.02]}),{}, {sessionFactory:factory()});
    expect(r.observations[1].actualIdleGapMs).toBeGreaterThanOrEqual(19); expect(r.observations[0].actualIdleGapMs).toBeNull();
  });
  it('cancels promptly during a gap', async () => {
    const abort=new AbortController(); const start=Date.now();
    const r=await runBenchmark(config({gapsSeconds:[10]}),{}, {sessionFactory:factory(),signal:abort.signal,onEvent:event=>{if(event.type==='waiting') setTimeout(()=>abort.abort(),10);}});
    expect(Date.now()-start).toBeLessThan(500); expect(r.status).toBe('cancelled'); expect(r.observations).toHaveLength(1);
  });
  it('cancels an in-flight request even if a test transport ignores the signal', async () => {
    const abort=new AbortController(); setTimeout(()=>abort.abort(),10); const start=Date.now();
    const f:SessionFactory=options=>({...factory()(options),send:()=>new Promise(()=>{})});
    const r=await runBenchmark(config(),{}, {sessionFactory:f,signal:abort.signal});
    expect(Date.now()-start).toBeLessThan(500); expect(r.status).toBe('cancelled'); expect(r.observations[0].status).toBe('cancelled'); expect(r.summaries[0].measuredTurns).toBe(0);
  });
  it('stops invalid continuation and excludes perturbation reuse claims', async () => {
    const r=await runBenchmark(config(),{}, {sessionFactory:factory(turn=>({...result(usage(turn)),continuationValid:false}))});
    expect(r.observations).toHaveLength(1); expect(r.status).toBe('incomplete'); expect(r.observations[0].continuationValid).toBe(false); expect(r.observations[0].stopReason).toBe('stop'); expect(r.observations[0].actualInputCostUsd).not.toBeNull();
    const perturb=await runBenchmark(config({scenario:'perturb'}),{}, {sessionFactory:factory()});
    expect(perturb.summaries[0].fullHitRate).toBeNull(); expect(perturb.summaries[0].inputCostMultiplier).toBeNull();
    expect(new Set(perturb.observations.map(o=>o.prefixHash)).size).toBe(3);
    expect(perturb.summaries[0].anyHitRate).toBe(1); expect(perturb.summaries[0].anyHitMeasuredTurns).toBe(2); expect(perturb.summaries[0].tokenHitRate).toBeGreaterThan(0);
  });
  it('reports below-minimum any/token controls independently from full-hit eligibility', async () => {
    const r=await runBenchmark(config({profiles:[{...profile,cacheMinTokens:5000}]}),{}, {sessionFactory:factory()});
    expect(r.summaries[0].measuredTurns).toBe(0); expect(r.summaries[0].fullHitRate).toBeNull();
    expect(r.summaries[0].anyHitRate).toBe(1); expect(r.summaries[0].tokenMeasuredTurns).toBe(2);
    expect(r.summaries[0].tokenHitRate).toBeCloseTo(2100/2300); expect(r.summaries[0].reusableCaptureRate).toBeNull();
  });
  it('hashes captured wire requests and exports standalone evidence', async () => {
    const r=await runBenchmark(config(),{}, {sessionFactory:factory(turn=>({...result(usage(turn)),wireRequest:{actualWire:turn}}))});
    expect(r.observations[1].requestHash).toBe(await sha256(JSON.stringify({actualWire:1})));
    expect(r.observations[1].request).toHaveProperty('prefix'); expect(r.observations[1].wireRequest).toEqual({actualWire:1});
    expect(toJsonl(r).trim().split('\n').map(line=>JSON.parse(line))).toHaveLength(5);
    expect(toSummaryCsv(r).trim().split('\n')).toHaveLength(2); expect(toCsv(r)).toContain('cachedReadTokens'); expect(toMarkdown(r)).toContain('Wilson');
  });
  it('stops the whole run above the pricing band and leaves costs unknown', async () => {
    const r=await runBenchmark(config({trials:2}),{}, {sessionFactory:factory(()=>result({...usage(0),inputTokens:100001,cacheWriteTokens:100001}))});
    expect(r.status).toBe('incomplete'); expect(r.observations).toHaveLength(1);
    expect(r.observations[0].actualInputCostUsd).toBeNull(); expect(r.observations[0].idealInputCostUsd).toBeNull(); expect(r.observations[0].outputCostUsd).toBeNull();
    expect(r.warnings.join(' ')).toContain('Stopped entire run');
  });
  it('expands independent account and model catalogs without crossing providers', async () => {
    const gemini=DEFAULT_ACCOUNTS[0];
    const accounts=[{...gemini,id:'project-a',tier:'tier-one',keyEnv:'PROJECT_A_KEY'},{...gemini,id:'project-b',tier:'tier-two',keyEnv:'PROJECT_B_KEY'}];
    const profiles=expandProfiles(accounts,DEFAULT_MODELS);
    expect(profiles).toHaveLength(4); expect(new Set(profiles.map(p=>p.id)).size).toBe(4);
    expect(profiles.every(p=>p.provider==='gemini')).toBe(true);
    expect(profiles.filter(p=>p.accountId==='project-a').every(p=>p.keyEnv==='PROJECT_A_KEY'&&p.tier==='tier-one')).toBe(true);
    expect(profiles.filter(p=>p.accountId==='project-b').every(p=>p.keyEnv==='PROJECT_B_KEY'&&p.tier==='tier-two')).toBe(true);
    const seen:{key:string;nonce:string;account?:string;model:string}[]=[];
    const session:SessionFactory=options=>{seen.push({key:options.apiKey,nonce:options.trialNonce,account:options.profile.accountId,model:options.profile.model}); return factory()(options);};
    const r=await runBenchmark(config({profiles,turns:2}),{'project-a':'shared-key-a','project-b':'shared-key-b'}, {sessionFactory:session});
    expect(r.observations).toHaveLength(8); expect(new Set(seen.map(s=>s.nonce)).size).toBe(4); expect(seen.every(s=>/^[a-f0-9]{64}$/.test(s.nonce))).toBe(true);
    expect(seen.filter(s=>s.account==='project-a').map(s=>s.key)).toEqual(['shared-key-a','shared-key-a']);
    expect(seen.filter(s=>s.account==='project-b').map(s=>s.key)).toEqual(['shared-key-b','shared-key-b']);
    expect(new Set(r.observations.filter(o=>o.turn===0).map(o=>o.prefixHash)).size).toBe(4);
    expect(r.observations.filter(o=>o.turn===0).every(o=>o.previousInputTokens===null)).toBe(true);
  });
  it('validates account/model public metadata and rejects ambiguous IDs or secret fields', () => {
    expect(()=>validateAccount({...DEFAULT_ACCOUNTS[0],apiKey:'hidden-value'})).toThrow('unsupported fields');
    expect(()=>validateAccount({...DEFAULT_ACCOUNTS[0],keyEnv:'not an env'})).toThrow('environment variable');
    expect(()=>validateAccount({...DEFAULT_ACCOUNTS[0],id:'bad::id'})).toThrow();
    expect(()=>validateAccount({...DEFAULT_ACCOUNTS[0],id:'constructor'})).toThrow();
    expect(()=>validateModelSpec({...DEFAULT_MODELS[0],keyEnv:'COUPLED_KEY'})).toThrow('unsupported fields');
    expect(()=>expandProfiles([DEFAULT_ACCOUNTS[0],DEFAULT_ACCOUNTS[0]],DEFAULT_MODELS)).toThrow('Account IDs');
    expect(()=>expandProfiles(DEFAULT_ACCOUNTS,[DEFAULT_MODELS[0],DEFAULT_MODELS[0]])).toThrow('Model IDs');
  });
  it('reports conservative cost estimates without using them as a cutoff', async () => {
    expect(estimateRun(config()).requests).toBe(3);
    const mixed=config({profiles:[{...profile,id:'unknown',pricing:null},profile]});
    expect(estimateRun(mixed).conservativeCostUsd).toBeNull(); expect(estimateRun(mixed).knownCostUsd).toBeGreaterThan(0); expect(estimateRun(mixed).hasUnknownPricing).toBe(true);
    expect((await runBenchmark(mixed,{}, {sessionFactory:factory()})).status).toBe('completed');
    expect(()=>validateConfig(config({trials:0}))).toThrow();
    expect(()=>validateConfig(config({profiles:[profile,{...profile,id:'other',provider:'gemini'}]}))).toThrow('sharing an account ID');
    expect((await runBenchmark(config(),{}, {sessionFactory:factory()})).status).toBe('completed');
  });
});
