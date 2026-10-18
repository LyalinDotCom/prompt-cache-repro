"""Rebuild this study's descriptive tables from extracted, independently audited batches.
Usage: python3 analysis.py CONFIRMATION_DIR RECOVERY_DIR OUTPUT_DIR
No network, SDKs, credentials, or application normalizers are used.
"""
import collections, csv, hashlib, json, pathlib, re, sys

def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def counts(p):
    text=p.read_text(); result={}
    for k in ['tests','pass','fail','cancelled','skipped','todo']:
        matches=list(re.finditer(r'^(?:#|ℹ)\s+'+k+r'\s+(\d+)\b',text,re.M))
        result[k]=int(matches[-1].group(1)) if matches else None
    return result
def need(v, message):
    if not v: raise ValueError(message)

tables=[]; sessions=[]; groups=collections.defaultdict(list); experiment_commits=set()
for cohort,arg in zip(['confirmation','transport-recovery'],sys.argv[1:3]):
    root=pathlib.Path(arg).resolve(); batch=read(root/'batch.json')
    need(len(batch['completed'])==len(batch['dispatchOrder']), 'Incomplete allocation')
    need(not batch['gitDirty'], 'Unfrozen experiment source')
    experiment_commits.add(batch['gitCommit'])
    names=[c['trialName'] for c in batch['dispatchOrder']]
    need(len(set(names))==len(names),'Duplicate session identity')
    for cell in batch['dispatchOrder']:
        p=root/cell['trialName']; report=read(p/'coding-report.json'); audit=read(p/'coding-audit.json'); spec=read(p/'fixture-spec.json')
        need(report['profile']['model']==cell['model'] and report['profile']['accountId']==cell['accountId'] and spec['id']==cell['fixtureId'], 'Identity mismatch')
        need(report['status']!='running' and audit['reportStatus']==report['status'], 'Stale audit status')
        for rel,expected in audit['sourceArtifactHashes'].items():
            q=(p/rel).resolve();need(q.is_relative_to(p), 'Unsafe audit path');need(sha(q)==expected,'Stale artifact: '+str(q))
        need(audit['auditorSourceSha256']==sha(root/'harness-source/scripts/audit-coding.ts'),'Auditor source differs from frozen source')
        need(len(audit['rows'])==len(report['requests'])==len(list((p/'requests').glob('*-request.json'))),'Unmatched HTTP attempts')
        integrity=[x for x in audit['checks'] if x['verdict']=='FAIL' and x['id']!='functional']
        need(not integrity,'Integrity check failed: '+str(integrity))
        fully_audited=all(x['verdict']=='PASS' for x in audit['checks'])
        f=read(p/'functional-qualification.json')
        need(counts(p/f['baseline']['stdoutFile'])==spec['expectedBaseline'],'Unexpected baseline counts')
        repaired=False; matches_upstream=None
        if report['status']=='completed':
            need(fully_audited,'Completed session did not pass audit')
            proof=read(p/'library-only-verification.json')
            need(proof['verified'] and proof['originalOraclesUnchanged'],'Library-only replay failed')
            need(proof['verifierSourceSha256']==sha(root/'harness-source/tools/verify-coding-repairs.ts'),'Replay verifier source differs')
            expected_counts={'tests':41,'pass':41,'fail':0,'cancelled':0,'skipped':0,'todo':0}
            need(counts(p/'final-tests.stdout.txt')==expected_counts and counts(p/proof['tests']['stdoutFile'])==expected_counts,'Incomplete acceptance suite')
            need(read(p/proof['cli']['stdoutFile'])=={'ok':True,'records':4}, 'Replay CLI failure')
            changed={k for k in set(f['beforeHashes'])|set(f['afterHashes']) if f['beforeHashes'].get(k)!=f['afterHashes'].get(k)}
            need(set(f['changedFiles'])==changed,'Recorded changed set differs from actual before/after hashes')
            applied=proof['appliedLibraryFiles'];need(applied and set(applied)==changed and all(k.startswith('src/upstream/') for k in applied),'Repair contains changes outside library or replay dropped edits')
            need(all(v==f['afterHashes'].get(k) for k,v in applied.items()),'Replay patch differs from recorded final state')
            for rel,expected in f['beforeHashes'].items():
                need(sha(p/'library-only-replay-workspace'/rel)==applied.get(rel,expected),'Replay altered original acceptance material: '+rel)
            for rel,expected in applied.items(): need(sha(p/'workspace'/rel)==expected,'Replay patch mismatch')
            upstream=read(p/'workspace/UPSTREAM.json')['files']
            matches_upstream=all(upstream.get(k,{}).get('sha256')==v for k,v in applied.items())
            repaired=True
        session={'cohort':cohort,'name':cell['trialName'],'account':cell['accountId'],'model':cell['model'],'task':cell['fixtureId'],'status':report['status'],'stopReason':report['stopReason'],'attempts':len(report['requests']),'fullyAudited':fully_audited,'repairVerified':repaired,'matchesPinnedUpstream':matches_upstream,'reportedResponseModels':sorted({m for r in audit['rows'] for m in r['reportedResponseModels']})}
        sessions.append(session);valid={}
        for row in audit['rows']:
            i=row['index']; q=report['requests'][i]; tokens=row['tokens']; complete=row['responseComplete'] and row['httpStatus'] is not None and 200<=row['httpStatus']<300 and row['terminal'] and row['malformedFrames']==0 and not q['error'] and tokens is not None
            wire=read(p/row['requestFile'])
            if cell['model'].startswith('gemini'):
                need(wire['generationConfig']['maxOutputTokens']==32768 and wire['generationConfig']['thinkingConfig']['thinkingLevel']=='HIGH','Gemini wire settings differ')
            elif cell['model'].startswith('claude'):
                need(wire['max_tokens']==32768 and wire['output_config']['effort']=='high','Opus wire settings differ')
            else:
                need(wire['max_output_tokens']==32768 and any(x.get('type')=='configuration_update' and x.get('reasoning',{}).get('effort')=='high' for x in wire['input']),'GPT wire settings differ')
            if i>0: need(row['actualIdleGapMs']>=30000,'Idle gap below registered floor')
            if complete:
                need(all(isinstance(tokens[k],int) and tokens[k]>=0 for k in ['input','read','write','ordinary','output']),'Invalid usage')
                need(tokens['input']==tokens['read']+tokens['write']+tokens['ordinary'],'Invalid input partition')
                need(tokens['input']>=250000,'Off-target context')
                valid[i]=row
            prior=valid.get(i-1) if complete else None
            prior_input=prior['tokens']['input'] if prior else None
            need(not prior or row['reuse']['priorInputTokens']==prior_input,'Prior input mismatch')
            item={'cohort':cohort,'session':cell['trialName'],'account':cell['accountId'],'model':cell['model'],'task':cell['fixtureId'],'index':i,'validUsage':bool(complete),'input':tokens['input'] if complete else None,'cachedRead':tokens['read'] if complete else None,'priorInput':prior_input,'priorInputDeficit':prior_input-tokens['read'] if prior else None,'actualIdleGapMs':row['actualIdleGapMs'],'httpStatus':row['httpStatus'],'terminal':row['terminal'],'error':q['error']}
            tables.append(item);groups[(cell['accountId'],cell['model'])].append(item)
        sr=[r for r in tables if r['cohort']==cohort and r['session']==cell['trialName']]
        sv=[r for r in sr if r['validUsage']]; sf=[r for r in sv if r['priorInput'] is not None]
        session.update({'inputMin':min((r['input'] for r in sv),default=None),'inputMax':max((r['input'] for r in sv),default=None),'targetFollowups':len(sf),'weightedReadOverPriorInput':sum(r['cachedRead'] for r in sf)/sum(r['priorInput'] for r in sf) if sf else None})
need(len(experiment_commits)==1,'Cohorts used different experiment commits')
need(len(sessions)==9 and sum(s['repairVerified'] for s in sessions)==8,'Expected eight verified task/model pairs and one retained transport failure')
completed=[(s['account'],s['model'],s['task']) for s in sessions if s['repairVerified']]
need(len(set(completed))==8,'Missing or duplicate completed task/model pair')
models=[]
for (account,model),rows in sorted(groups.items()):
    valid=[r for r in rows if r['validUsage']]; followups=[r for r in valid if r['priorInput'] is not None]; deficits=[r['priorInputDeficit'] for r in followups]; cells=[s for s in sessions if s['account']==account and s['model']==model]
    models.append({'account':account,'model':model,'attemptedSessions':len(cells),'verifiedRepairs':sum(s['repairVerified'] for s in cells),'httpAttempts':len(rows),'validResponses':len(valid),'inputMin':min(r['input'] for r in valid),'inputMax':max(r['input'] for r in valid),'targetFollowups':len(followups),'sumCachedReads':sum(r['cachedRead'] for r in followups),'sumPriorInput':sum(r['priorInput'] for r in followups),'sumFollowupCurrentInput':sum(r['input'] for r in followups),'weightedReadOverCurrentInput':sum(r['cachedRead'] for r in followups)/sum(r['input'] for r in followups),'minReadOverCurrentInput':min(r['cachedRead']/r['input'] for r in followups),'weightedReadOverPriorInput':sum(r['cachedRead'] for r in followups)/sum(r['priorInput'] for r in followups),'priorInputDeficitMin':min(deficits),'priorInputDeficitMax':max(deficits),'priorInputDeficits':deficits,'strict64Followups':sum(d<=64 for d in deficits),'below95PercentFollowups':sum(r['cachedRead']<.95*r['priorInput'] for r in followups),'minActualIdleGapMs':min(r['actualIdleGapMs'] for r in followups),'maxActualIdleGapMs':max(r['actualIdleGapMs'] for r in followups)})
out=pathlib.Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
result={'experimentCommit':next(iter(experiment_commits)),'analysisSourceSha256':sha(pathlib.Path(__file__)),'attemptedSessions':len(sessions),'verifiedRepairs':sum(s['repairVerified'] for s in sessions),'httpAttempts':len(tables),'validResponses':sum(r['validUsage'] for r in tables),'models':models,'sessions':sessions}
(out/'metrics.json').write_text(json.dumps(result,indent=2)+'\n')
with (out/'turns.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(tables[0]));w.writeheader();w.writerows(tables)
print(json.dumps(result,indent=2))
