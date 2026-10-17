import type { Account, ModelSpec, Profile, Provider, RateCard } from './types';

const providers = new Set<Provider>(['gemini','openai','anthropic']);
function object(value: unknown, name: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as Record<string,unknown>;
}
function fields(value: Record<string,unknown>, allowed: string[], name: string): void {
  if (Object.keys(value).some(key=>!allowed.includes(key))) throw new Error(`${name} contains unsupported fields. Store credentials separately and use keyEnv references.`);
}
function text(value: unknown, name: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`${name} must be a nonempty single-line string of at most ${max} characters.`);
  return value;
}
function id(value: unknown, name: string): string {
  const result = text(value,name,80);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result) || Object.hasOwn(Object.prototype,result)) throw new Error(`${name} must use letters, digits, dots, underscores, or hyphens.`);
  return result;
}
function provider(value: unknown): Provider {
  if (!providers.has(value as Provider)) throw new Error('Provider must be gemini, openai, or anthropic.');
  return value as Provider;
}
function number(value: unknown, name: string, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) throw new Error(`${name} must be a nonnegative ${integer?'integer':'number'} at most ${max}.`);
  return value;
}

/** Public metadata only: no credential value is accepted or retained. */
export function validateAccount(value: unknown): Account {
  const account = object(value,'Account');
  fields(account,['id','label','provider','tier','keyEnv'],'Account');
  const keyEnv = account.keyEnv === undefined ? undefined : text(account.keyEnv,'Account keyEnv',120);
  if (keyEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyEnv)) throw new Error('Account keyEnv must be an environment variable name.');
  return {id:id(account.id,'Account id'),label:text(account.label,'Account label'),provider:provider(account.provider),tier:text(account.tier,'Account tier'),...(keyEnv===undefined?{}:{keyEnv})};
}

export function validateModelSpec(value: unknown): ModelSpec {
  const model = object(value,'Model');
  fields(model,['id','label','provider','model','pricing','cacheMinTokens'],'Model');
  let pricing: RateCard | null = null;
  if (model.pricing !== null) {
    const rates=object(model.pricing,'Model pricing');
    fields(rates,['input','cachedRead','cacheWrite','output','source','asOf','note'],'Model pricing');
    pricing={ input:number(rates.input,'Input rate',1e6),cachedRead:number(rates.cachedRead,'Cached-read rate',1e6),cacheWrite:number(rates.cacheWrite,'Cache-write rate',1e6),output:number(rates.output,'Output rate',1e6),source:text(rates.source,'Rate source',1000),asOf:text(rates.asOf,'Rate date'),...(rates.note===undefined?{}:{note:text(rates.note,'Rate note',2000)}) };
  }
  return {id:id(model.id,'Model id'),label:text(model.label,'Model label'),provider:provider(model.provider),model:text(model.model,'Model name'),pricing,cacheMinTokens:number(model.cacheMinTokens,'Cache minimum',1e7,true)};
}

/** Every compatible account × model pair is a separate experimental cell. */
export function expandProfiles(accounts: Account[], models: ModelSpec[]): Profile[] {
  if (!Array.isArray(accounts) || !Array.isArray(models)) throw new Error('Accounts and models must be arrays.');
  const checkedAccounts=accounts.map(validateAccount), checkedModels=models.map(validateModelSpec);
  if (new Set(checkedAccounts.map(a=>a.id)).size !== checkedAccounts.length) throw new Error('Account IDs must be unique.');
  if (new Set(checkedModels.map(m=>m.id)).size !== checkedModels.length) throw new Error('Model IDs must be unique.');
  return checkedAccounts.flatMap(account=>checkedModels.filter(model=>model.provider===account.provider).map(model=>({
    id:`${account.id}::${model.id}`,accountId:account.id,label:`${model.label} · ${account.label}`,
    provider:model.provider,model:model.model,tier:account.tier,...(account.keyEnv===undefined?{}:{keyEnv:account.keyEnv}),
    pricing:model.pricing ? {...model.pricing} : null,cacheMinTokens:model.cacheMinTokens,
  })));
}
