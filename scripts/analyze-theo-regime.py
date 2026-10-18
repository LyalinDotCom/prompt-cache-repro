#!/usr/bin/env python3
"""Offline study assembly. No credentials or network; rederive usage/cost from raw HTTP JSON."""
import argparse,csv,hashlib,json,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('study',type=Path);p.add_argument('--out',type=Path,required=True);args=p.parse_args()
plan=json.loads((args.study/'plan.json').read_text());args.out.mkdir(parents=True,exist_ok=True)
rows=[];cells=[];checks=[];reports=[]
def stable(obj):return json.dumps(obj,ensure_ascii=False,separators=(',',':'))
def usage(provider,r):
    u=r.get('usageMetadata' if provider=='gemini' else 'usage') if isinstance(r,dict) else None
    if not isinstance(u,dict):return None
    try:
        if provider=='gemini':
            i=u['promptTokenCount'];c=u['cachedContentTokenCount'] if 'cachedContentTokenCount' in u else 0;w=0;n=i-c;o=u['candidatesTokenCount']+u.get('thoughtsTokenCount',0);t=u.get('thoughtsTokenCount',0)
            if u.get('toolUsePromptTokenCount',0):return None
        elif provider=='openai':
            i=u['input_tokens'];c=u['input_tokens_details']['cached_tokens'];w=u['input_tokens_details']['cache_write_tokens'];n=i-c-w;o=u['output_tokens'];t=u.get('output_tokens_details',{}).get('reasoning_tokens',0)
        else:
            n=u['input_tokens'];c=u['cache_read_input_tokens'];w=u['cache_creation_input_tokens'];i=n+c+w;o=u['output_tokens'];t=0
        if not all(isinstance(v,int) and not isinstance(v,bool) and v>=0 for v in [i,c,w,n,o,t]) or c+w>i:return None
        return dict(inputTokens=i,cachedReadTokens=c,cacheWriteTokens=w,uncachedInputTokens=n,outputTokens=o,thinkingTokens=t)
    except (KeyError,TypeError):return None

def percent(x):return 'unknown' if x is None else f'{100*x:.1f}%'
def multiplier(x):return 'unknown' if x is None else f'{x:.3f}×'
def knownsum(xs):return sum(xs) if xs and all(x is not None for x in xs) else None

def assemble(entry,path):
    report=json.loads(path.read_text());reports.append(str(path));config=report['config'];profile=config['profiles'][0];rate=profile['pricing'];last={};trial_hashes={};trial_ok={}
    for o in report['observations']:
        key=o['trialId'];prior=last.get(key);u=usage(o['provider'],o.get('rawResponse') or {});valid=o['status']=='ok' and u is not None and o.get('transportAttemptCount')==1
        refusal=o.get('stopReason')=='refusal' or any(z.get('type')=='refusal' for item in (o.get('rawResponse') or {}).get('output',[]) for z in item.get('content',[]))
        payload=o.get('wireRequestText');response=o.get('wireResponseText');wire=o.get('wireRequest');fail=[]
        if o['status']=='ok':
            if o.get('transportAttemptCount')!=1:fail.append('not exactly one HTTP attempt')
            if not payload or json.loads(payload)!=wire:fail.append('wire request missing or mismatched')
            if not response or json.loads(response)!=o['rawResponse']:fail.append('raw response text missing or mismatched')
            if u!=o['usage']:fail.append('independent usage differs')
            if payload and hashlib.sha256(stable(wire).encode()).hexdigest()!=o['requestHash']:fail.append('request hash differs')
            if o['turn'] and (o.get('actualIdleGapMs') is None or o['actualIdleGapMs']<config['gapsSeconds'][0]*1000):fail.append('idle gap below configured minimum')
        digest=hashlib.sha256(payload.encode()).hexdigest() if payload else None
        trial_hashes.setdefault(key,set()).add(digest)
        if prior and wire:
            old=prior.get('wireRequest')
            field={'gemini':'contents','openai':'input','anthropic':'messages'}[o['provider']]
            if old and wire.get(field,[])[:len(old.get(field,[]))]!=old.get(field,[]):fail.append('prior message history changed')
            if config['scenario']=='agent' and old:
                previous_raw=prior.get('rawResponse') or {};messages=wire.get(field,[]);n=len(old.get(field,[]))
                if o['provider']=='gemini':expected=[previous_raw['candidates'][0]['content']]
                elif o['provider']=='anthropic':expected=[{'role':'assistant','content':previous_raw.get('content')}]
                else:expected=previous_raw.get('output',[])
                if messages[n:n+len(expected)]!=expected:fail.append('native generated history differs')
        prior_input=prior['usage']['inputTokens'] if prior and prior.get('usage') else None
        if o['previousInputTokens']!=prior_input:fail.append('prior input link differs')
        expected=prior_input if o['turn']>0 and prior_input is not None and prior_input>=profile['cacheMinTokens'] else None
        if o.get('expectedReusableTokens')!=expected:fail.append('expected reusable input differs')
        strict_native=u['cachedReadTokens']>0 and u['cachedReadTokens']>=max(0,expected-config['toleranceTokens']) if valid and expected is not None else None
        if o.get('fullHit')!=strict_native:fail.append('strict full hit differs')
        any_native=u['cachedReadTokens']>0 if valid and o['turn']>0 else None
        if o.get('anyHit')!=any_native:fail.append('any hit differs')
        actual=(u['uncachedInputTokens']*rate['input']+u['cachedReadTokens']*rate['cachedRead']+u['cacheWriteTokens']*rate['cacheWrite'])/1e6 if valid else None
        output=u['outputTokens']*rate['output']/1e6 if valid else None
        if output is not None and (o['outputCostUsd'] is None or abs(output-o['outputCostUsd'])>1e-10):fail.append('output cost differs')
        if actual is not None and (o['actualInputCostUsd'] is None or abs(actual-o['actualInputCostUsd'])>1e-10):fail.append('input cost differs')
        ideal=None
        if valid and prior_input is not None and prior_input>=profile['cacheMinTokens']:
            reusable=min(prior_input,u['inputTokens']);fresh=rate['input'] if o['provider']=='gemini' else rate['cacheWrite']
            ideal=(reusable*rate['cachedRead']+max(0,u['inputTokens']-reusable)*fresh)/1e6
            if o['idealInputCostUsd'] is None or abs(ideal-o['idealInputCostUsd'])>1e-10:fail.append('ideal cost differs')
        eligible_tokens=eligible_full=eligible_ideal=None
        if valid and prior and prior.get('usage') and o['provider']!='gemini':
            old_u=prior['usage'];eligible_tokens=min(old_u['cachedReadTokens']+old_u['cacheWriteTokens'],u['cachedReadTokens']+u['cacheWriteTokens'])
            eligible_ideal=(u['uncachedInputTokens']*rate['input']+eligible_tokens*rate['cachedRead']+(u['cachedReadTokens']+u['cacheWriteTokens']-eligible_tokens)*rate['cacheWrite'])/1e6
            if eligible_tokens>=profile['cacheMinTokens']:eligible_full=u['cachedReadTokens']>0 and u['cachedReadTokens']>=eligible_tokens-64
            if o.get('eligibleIdealInputCostUsd') is None or abs(eligible_ideal-o['eligibleIdealInputCostUsd'])>1e-10:fail.append('boundary-aware ideal cost differs')
            if o.get('eligibleFullHit')!=eligible_full:fail.append('boundary-aware full hit differs')
        comparable=valid and not refusal and not fail
        r=u['cachedReadTokens'] if u else None
        row={'arm':entry['arm']['id'],'model':o['model'],'scenario':config['scenario'],'prefixTargetTokens':entry['arm']['prefixTokens'],'deltaTargetTokens':entry['arm']['deltaTokens'],'gapSeconds':o['gapSeconds'],'trial':o['trial'],'turn':o['turn'],'status':o['status'],'stopReason':o.get('stopReason'),'refusal':refusal,'comparable':comparable,'inputTokens':u['inputTokens'] if u else None,'cachedReadTokens':r,'priorInputTokens':prior_input,'addedInputTokens':u['inputTokens']-prior_input if u and prior_input is not None else None,'priorInputDeficit':prior_input-r if prior_input is not None and r is not None else None,'expectedReusableTokens':expected,'strict64':r>0 and r>=expected-64 if comparable and expected is not None and r is not None else None,'strict2100':r>0 and r>=expected-2100 if comparable and expected is not None and r is not None else None,'actualInputCostUsd':actual,'idealInputCostUsd':ideal,'eligibleReusableTokens':eligible_tokens,'eligibleFullHit':eligible_full if comparable else None,'eligibleIdealInputCostUsd':eligible_ideal,'outputCostUsd':output,'responseId':o.get('responseId'),'actualIdleGapMs':o.get('actualIdleGapMs'),'wireSha256':digest,'cachedCounterOmitted':o['provider']=='gemini' and 'cachedContentTokenCount' not in (o.get('rawUsage') or {}),'error':o['error'],'auditFailures':'; '.join(fail),'sourceReport':str(path.relative_to(args.study))}
        rows.append(row);checks.append({'arm':entry['arm']['id'],'trial':o['trial'],'turn':o['turn'],'failures':fail})
        if o['status']=='ok' and o.get('continuationValid') is not False:last[key]=o
    if config['scenario']=='replay':
        for key,hashes in trial_hashes.items():
            if len(hashes)!=1 or None in hashes:raise ValueError('Replay request bodies differ: '+key)
    ours=[r for r in rows if r['arm']==entry['arm']['id']];follow=[r for r in ours if r['turn']>0 and r['comparable']];strict=[r for r in follow if r['strict64'] is not None]
    expected=sum(r['expectedReusableTokens'] for r in strict);read=sum(r['cachedReadTokens'] for r in follow);total=sum(r['inputTokens'] for r in follow);actual=knownsum([r['actualInputCostUsd'] for r in follow]);ideal=knownsum([r['idealInputCostUsd'] for r in follow]);inputs=[r['inputTokens'] for r in ours if r['inputTokens'] is not None];first=[r['inputTokens'] for r in ours if r['turn']==0 and r['inputTokens'] is not None]
    eligible=[r for r in follow if r['eligibleFullHit'] is not None];eligible_ideal_total=knownsum([r['eligibleIdealInputCostUsd'] for r in follow])
    cells.append({'eligibleDenominator':len(eligible),'eligibleFullHitRate':sum(r['eligibleFullHit'] for r in eligible)/len(eligible) if eligible else None,'eligibleFollowupCostMultiplier':actual/eligible_ideal_total if actual is not None and eligible_ideal_total else None,'arm':entry['arm']['id'],'model':profile['model'],'scenario':config['scenario'],'prefixTargetTokens':entry['arm']['prefixTokens'],'deltaTargetTokens':entry['arm']['deltaTokens'],'gapSeconds':config['gapsSeconds'][0],'plannedRequests':config['turns']*config['trials'],'attempts':len(ours),'status':report['status'],'errors':sum(r['status']!='ok' for r in ours),'refusals':sum(r['refusal'] for r in ours),'comparableFollowups':len(follow),'strictDenominator':len(strict),'strict64':sum(bool(r['strict64']) for r in strict)/len(strict) if strict else None,'strict2100':sum(bool(r['strict2100']) for r in strict)/len(strict) if strict else None,'anyHit':sum(r['cachedReadTokens']>0 for r in follow)/len(follow) if follow else None,'tokenWeightedHit':read/total if total else None,'reusableCapture':min(1,sum(r['cachedReadTokens'] for r in strict)/expected) if expected else None,'followupCostMultiplier':actual/ideal if actual is not None and ideal else None,'initialInputMin':min(first) if first else None,'initialInputMax':max(first) if first else None,'inputMin':min(inputs) if inputs else None,'inputMax':max(inputs) if inputs else None,'hardMisses':sum(r['cachedReadTokens']==0 for r in follow),'observedCostUsd':sum((r['actualInputCostUsd'] or 0)+(r['outputCostUsd'] or 0) for r in ours)})

for entry in plan['configs']:
    directory=args.study/entry['arm']['id']/'results'
    matches=list(directory.glob('*/report.json'))
    if len(matches)>1:raise ValueError('Multiple reports for planned arm')
    if matches:assemble(entry,matches[0])
failures=[c for c in checks if c['failures']]
hard=[r for r in rows if r['turn']>0 and r['comparable'] and r['cachedReadTokens']==0]
summary={'analysisSourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'allocationFinished':len(plan.get('outcomes',[]))==len(plan['configs']),'sourceCommit':plan['sourceCommit'],'plannedRequests':plan['requests'],'attempts':len(rows),'completedArms':sum(c['status']=='completed' for c in cells),'measuredArms':len(cells),'plannedArms':len(plan['configs']),'auditFailures':failures,'observedCostUsd':sum(c['observedCostUsd'] for c in cells),'cells':cells,'hardMisses':hard,'note':'Refusals retained in costs and attempt accounting, excluded from comparable hit/cost ratios. Partial progress remains explicitly partial. No long-gap claim follows.'}
def diagnostic(group):
    return {'followups':len(group),'zeroReads':sum(r['cachedReadTokens']==0 for r in group),'positiveReads':sum(r['cachedReadTokens']>0 for r in group),'deficits':sorted(set(r['priorInputDeficit'] for r in group if r['priorInputDeficit'] is not None))}
valid=[r for r in rows if r['turn']>0 and r['comparable']]
flash=[r for r in valid if r['model']=='gemini-3.8-flash' and r['prefixTargetTokens']==8000 and r['deltaTargetTokens']==1500 and r['scenario'] in ['append','agent']]
summary['diagnostics']={
    'flashPrimaryGrowingPriorBelow16384':diagnostic([r for r in flash if r['priorInputTokens']<16384]),
    'flashPrimaryGrowingPriorAtLeast16384':diagnostic([r for r in flash if r['priorInputTokens']>=16384]),
    'flashFirstCrossingRequest':diagnostic([r for r in flash if r['priorInputTokens']<16384<=r['inputTokens']]),
    'flash8kReplay':diagnostic([r for r in valid if r['model']=='gemini-3.8-flash' and r['scenario']=='replay' and r['prefixTargetTokens']==8000]),
    'floor4k':{model:diagnostic([r for r in valid if r['model']==model and r['prefixTargetTokens']==4000]) for model in ['gemini-3.8-flash','gemini-4-argon']},
    'argonPositiveSmallAddedInput':diagnostic([r for r in valid if r['model']=='gemini-4-argon' and r['scenario']!='replay' and r['addedInputTokens']<2050 and r['cachedReadTokens']>0]),
    'argonLargeAddedInput':diagnostic([r for r in valid if r['model']=='gemini-4-argon' and r['scenario']!='replay' and r['addedInputTokens']>=2050]),
    'matchedPrefixCost':{},
}
for model in ['gemini-3.8-flash','gemini-4-argon']:
    comparison={}
    for prefix in [8000,32000]:
        group=[r for r in valid if r['model']==model and r['scenario']=='agent' and r['deltaTargetTokens']==600 and r['prefixTargetTokens']==prefix and r['turn']<=2]
        actual=knownsum([r['actualInputCostUsd'] for r in group]);ideal=knownsum([r['idealInputCostUsd'] for r in group])
        comparison[str(prefix)]={'followups':len(group),'inputCostMultiplier':actual/ideal if actual is not None and ideal else None}
    summary['diagnostics']['matchedPrefixCost'][model]=comparison
(args.out/'metrics.json').write_text(json.dumps(summary,indent=2)+'\n')
for name,values in [('turns.csv',rows),('cells.csv',cells),('hard-misses.csv',hard)]:
    fields=list(values[0]) if values else list(rows[0]) if rows else ['arm']
    with (args.out/name).open('w') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(values)
lines=['## Small-context sweep (Theo/AA regime)','',f"Focused screening allocation: **{len(rows)}/{plan['requests']} planned requests attempted**, {summary['completedArms']}/{len(plan['configs'])} arms completed. Estimated observed API cost: **${summary['observedCostUsd']:.4f}**, excluding the separately retained eight-call qualification. Audit failures: {len(failures)}.",'','These are synthetic direct-API cache diagnostics, not additional coding repairs. All cells below use a five-second gap. Sizes/deltas in the labels are targets; the actual input range is measured. Refusal responses remain in evidence and costs but are excluded from comparable rates.','', '| Model | Scenario | Prefix / delta target | Actual input range | Attempts / plan (errors) | Follow-ups / strict n | Input cost multiplier | Strict64 | Strict2100 | Any hit | Weighted cache share | Reusable capture | Hard misses | Refusals |','| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for c in cells:
    lines.append(f"| {c['model']} | {c['scenario']} | {c['prefixTargetTokens']} / {c['deltaTargetTokens']} | {c['inputMin']}–{c['inputMax']} | {c['attempts']} / {c['plannedRequests']} ({c['errors']}) | {c['comparableFollowups']} / {c['strictDenominator']} | {multiplier(c['followupCostMultiplier'])} | {percent(c['strict64'])} | {percent(c['strict2100'])} | {percent(c['anyHit'])} | {percent(c['tokenWeightedHit'])} | {percent(c['reusableCapture'])} | {c['hardMisses']} | {c['refusals']} |")
lines+=['','Multiplier = measured follow-up input cost / theoretical perfect-prior-input-reuse input cost, under frozen rate cards. Initial and output costs are excluded from that ratio. It is not a provider invoice or proof of eligible cache loss. Strict2100 is a separate sensitivity analysis; strict64 remains unchanged.','',f'Hard-miss follow-ups: **{len(hard)}**. Full IDs, exact inputs, trial/turn, model, hash and timing are in [hard-misses.csv](../results/small-context/hard-misses.csv).','']
(args.out/'table.md').write_text('\n'.join(lines))
print(json.dumps({k:v for k,v in summary.items() if k not in ['cells','hardMisses','auditFailures','diagnostics']}))
if failures:
    print(json.dumps(failures[:10]));raise SystemExit(1)
