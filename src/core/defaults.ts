import { expandProfiles } from './catalog';
import type { Account, BenchmarkConfig, ModelSpec, RateCard } from './types';
export const SDK_VERSIONS: Record<string,string> = {'@google/genai':'2.30.0',openai:'7.36.0','@anthropic-ai/sdk':'0.135.0'};
const google: RateCard = {input:2,cachedRead:0.1,cacheWrite:2,output:10,source:'https://ai.google.dev/gemini-api/docs/pricing',asOf:'2026-10-17',note:'Argon Standard introductory rates through 2026-11-30; recheck before later runs.'};
const flash: RateCard = {input:0.75,cachedRead:0.075,cacheWrite:0.75,output:3.75,source:'https://ai.google.dev/gemini-api/docs/pricing',asOf:'2026-10-17',note:'Flash 3.8 Standard introductory rates through 2026-12-31; implicit cache only in this benchmark.'};
const openai: RateCard = {input:2,cachedRead:0.1,cacheWrite:2.5,output:10,source:'https://developers.openai.com/api/docs/pricing',asOf:'2026-10-17',note:'Standard, global processing; GPT-6.1 Sol writes at 1.25x input. Under 100K input only in this version.'};
const anthropic: RateCard = {input:4,cachedRead:0.2,cacheWrite:5,output:20,source:'https://platform.claude.com/docs/en/about-claude/pricing',asOf:'2026-10-17',note:'Opus 5.5 Standard, global processing; 5-minute automatic cache writes.'};
export const DEFAULT_ACCOUNTS: Account[] = [
  {id:'gemini-paid',label:'Gemini paid account',provider:'gemini',tier:'Paid · user declared',keyEnv:'GEMINI_API_KEY'},
  {id:'openai-paid',label:'OpenAI paid account',provider:'openai',tier:'Paid · user declared',keyEnv:'CODEX_API_KEY'},
  {id:'anthropic-paid',label:'Anthropic paid account',provider:'anthropic',tier:'Paid · user declared',keyEnv:'ANTHROPIC_API_KEY'},
];
export const DEFAULT_MODELS: ModelSpec[] = [
  {id:'gemini-4-argon',label:'Gemini Argon 4',provider:'gemini',model:'gemini-4-argon',pricing:google,cacheMinTokens:4096},
  {id:'gemini-3.8-flash',label:'Gemini Flash 3.8',provider:'gemini',model:'gemini-3.8-flash',pricing:flash,cacheMinTokens:4096},
  {id:'gpt-6.1-sol',label:'GPT-6.1 Sol',provider:'openai',model:'gpt-6.1-sol',pricing:openai,cacheMinTokens:1024},
  {id:'claude-opus-5-5',label:'Claude Opus 5.5',provider:'anthropic',model:'claude-opus-5-5',pricing:anthropic,cacheMinTokens:512},
];
export const DEFAULT_CONFIG: BenchmarkConfig = {scenario:'agent',profiles:expandProfiles(DEFAULT_ACCOUNTS,DEFAULT_MODELS),turns:6,trials:1,gapsSeconds:[5],prefixChars:48000,deltaChars:2400,maxOutputTokens:512,toleranceTokens:64,timeoutMs:90000,seed:'cachebench-v1',maxEstimatedUsd:5};
