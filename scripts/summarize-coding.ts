/** Offline reader report. Usage/cost data comes exclusively from independent raw-evidence audits. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

type J = Record<string, any>;
const parsed = parseArgs({ allowPositionals: true, options: { out: { type:'string' }, qualifier:{type:'string',multiple:true}, final:{type:'boolean'}, help:{type:'boolean'} } });
if (parsed.values.help || parsed.positionals.length !== 1) {
  console.log('Usage: npx tsx scripts/summarize-coding.ts <batch-directory> [--qualifier <batch-directory>] [--out docs/VALIDATED_RESULTS.md] [--final]\nReads coding-audit.json and actual functional artifacts only; never sends API requests. Without --final the report is explicitly a partial snapshot.');
  process.exit(parsed.values.help ? 0 : 1);
}
const generatedAt = new Date().toISOString();
const loadedHashes=new Map<string,string>();
const readJson = (path:string): J | null => { try { const text=readFileSync(path,'utf8'); const result=JSON.parse(text); loadedHashes.set(resolve(path),createHash('sha256').update(text).digest('hex')); return result; } catch { return null; } };
const integer = (n:unknown):n is number => typeof n==='number' && Number.isSafeInteger(n) && n>=0;
const finite = (n:unknown):n is number => typeof n==='number' && Number.isFinite(n);
const sum = (values:number[]) => values.reduce((a,b)=>a+b,0);
const ratio = (a:number,b:number):number|null => b>0?a/b:null;
const avg = (values:number[]):number|null => values.length?sum(values)/values.length:null;
const pct = (n:number|null|undefined) => n==null?'unknown':`${(100*n).toFixed(2)}%`;
const usd = (n:number|null|undefined) => n==null?'unknown':`$${n.toFixed(6)}`;
const mult = (n:number|null|undefined) => n==null?'unknown':`${n.toFixed(4)}×`;
const md = (value:unknown) => String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');
const digest = (value:string) => createHash('sha256').update(value).digest('hex');
function artifact(root:string,path:unknown):string|null {
  if(typeof path!=='string'||/(^|\/)\.env(?:\.|$)/.test(path))return null;
  const target=resolve(root,path);
  return target.startsWith(root+'/')?target:null;
}
function textArtifact(root:string,path:unknown):string|null { const safe=artifact(root,path); try{return safe?readFileSync(safe,'utf8'):null;}catch{return null;} }
function counts(text:string|null):J|null {
  if(text==null)return null;
  const fields:J={};
  for(const match of text.matchAll(/^(?:#|ℹ)\s+(tests|pass|fail)\s+(\d+)\b/gm))fields[match[1]]=Number(match[2]);
  return ['tests','pass','fail'].every(key=>integer(fields[key]))?fields:null;
}
function validRow(row:J):boolean {
  const t=row.tokens;
  return row.httpStatus>=200&&row.httpStatus<300&&t&&['input','read','write','ordinary','output'].every(key=>integer(t[key]))&&t.input===t.read+t.write+t.ordinary;
}
function trial(root:string,plan:J):J {
  const report=readJson(join(root,'coding-report.json'));
  const audit=readJson(join(root,'coding-audit.json'));
  const f=readJson(join(root,'functional-qualification.json'));
  const baselineText=textArtifact(root,f?.baseline?.stdoutFile??'baseline-tests.stdout.txt');
  const finalText=textArtifact(root,f?.final?.stdoutFile??'final-tests.stdout.txt');
  const baseline=counts(baselineText), final=counts(finalText);
  const before=f?.beforeHashes??{},after=f?.afterHashes??{};
  const immutable=Object.keys(before).filter(path=>!/^(src|bin)\//.test(path));
  const immutableUnchanged=immutable.length>0&&immutable.every(path=>before[path]===after[path]);
  const changed=Object.keys(after).filter(path=>/^(src|bin)\//.test(path)&&before[path]!==after[path]);
  const demoText=f?textArtifact(root,f.finalCli?.stdoutFile):null;
  let demo:J|null=null;try{demo=demoText?JSON.parse(demoText):null;}catch{/* Unknown stays unknown. */}
  const cliQualified=f?.finalCli?.exitCode===0&&demo?.counts?.sourceRows===4&&demo?.counts?.accepted===4&&demo?.counts?.rejected===0&&demo?.counts?.conflicts===0;
  const verifiedRepair=f?.baseline?.exitCode!==0&&f?.baseline?.exitCode!=null&&baseline?.tests===44&&baseline?.pass===38&&baseline?.fail===6&&f?.final?.exitCode===0&&final?.tests===44&&final?.pass===44&&final?.fail===0&&immutableUnchanged&&changed.length>0&&cliQualified;
  const functionalQualified=report?.status==='completed'&&verifiedRepair;
  let capturedFiles=0;
  try{capturedFiles=readdirSync(join(root,'requests')).filter(name=>/^\d+-request\.json$/.test(name)).length;}catch{/* Unattempted/partial tasks have no capture directory. */}
  const rows:Array<J>=Array.isArray(audit?.rows)?audit.rows:[];
  const auditFresh=Boolean(audit&&audit.reportStatus===report?.status&&rows.length===capturedFiles&&rows.length===(report?.requests?.length??0));
  const failures=Array.isArray(audit?.checks)?audit.checks.filter((c:J)=>c.verdict==='FAIL'):[];
  const unknowns=Array.isArray(audit?.checks)?audit.checks.filter((c:J)=>c.verdict==='UNKNOWN'):[];
  const audited=Boolean(auditFresh&&failures.length===0);
  const valid=rows.filter(validRow);
  const followups=valid.filter(row=>row.reuse&&finite(row.reuse.readOverPriorInput)&&row.reuse.priorInputTokens>0);
  const eligible=followups.filter(row=>finite(row.reuse.priorPublicCacheFrontierTokens)&&row.reuse.priorPublicCacheFrontierTokens>0&&typeof row.reuse.eligibleFrontierFullyReused==='boolean');
  const strict=followups.filter(row=>row.reuse.strict64WholePriorInputFullHit===true).length;
  const material=followups.filter(row=>row.reuse.priorInputBelow95Percent===true).length;
  const inputCost=valid.length&&valid.every(row=>finite(row.independentCosts?.inputUsd))?sum(valid.map(row=>row.independentCosts.inputUsd)):null;
  const outputCost=valid.length&&valid.every(row=>finite(row.independentCosts?.outputUsd))?sum(valid.map(row=>row.independentCosts.outputUsd)):null;
  const followupActual=followups.length&&followups.every(row=>finite(row.independentCosts?.inputUsd))?sum(followups.map(row=>row.independentCosts.inputUsd)):null;
  const theoretical=followups.length&&followups.every(row=>finite(row.reuse.fullPriorInputCounterfactualUsd))?sum(followups.map(row=>row.reuse.fullPriorInputCounterfactualUsd)):null;
  const eligibleActual=eligible.length&&eligible.every(row=>finite(row.independentCosts?.inputUsd))?sum(eligible.map(row=>row.independentCosts.inputUsd)):null;
  const eligibleIdeal=eligible.length&&eligible.every(row=>finite(row.reuse.eligibleFrontierCounterfactualUsd))?sum(eligible.map(row=>row.reuse.eligibleFrontierCounterfactualUsd)):null;
  return { root,trialName:basename(root),model:audit?.requestedModel??plan.model??report?.profile?.model??'unknown',provider:audit?.provider??report?.profile?.provider??null,accountId:plan.accountId??report?.profile?.accountId??null,trialNumber:(plan.trial??0)+1,gapSeconds:plan.gap??report?.settings?.gapSeconds??null,
    present:existsSync(root),status:report?.status??'unattempted',stopReason:report?.stopReason??null,baselineCounts:baseline,finalCounts:final,baselineExitCode:f?.baseline?.exitCode??null,finalExitCode:f?.final?.exitCode??null,
    immutableFileCount:immutable.length,immutableUnchanged,changedSourceFiles:changed,cliQualified,verifiedRepair,functionalQualified,auditPresent:Boolean(audit),auditFresh,audited,primaryQualified:functionalQualified&&audited,auditFailures:failures.length,auditUnknowns:unknowns.length,
    inputTokens:sum(valid.map(row=>row.tokens.input)),readTokens:sum(valid.map(row=>row.tokens.read)),writeTokens:sum(valid.map(row=>row.tokens.write)),ordinaryTokens:sum(valid.map(row=>row.tokens.ordinary)),outputTokens:sum(valid.map(row=>row.tokens.output)),
    capturedAttempts:capturedFiles,auditedAttempts:rows.length,validUsageAttempts:valid.length,unknownUsageAttempts:rows.filter(row=>!validRow(row)).length,followups:followups.length,materialBelow95Count:material,strict64Count:strict,anyReadCount:followups.filter(row=>row.tokens.read>0).length,
    priorCapture:ratio(sum(followups.map(row=>row.tokens.read)),sum(followups.map(row=>row.reuse.priorInputTokens))),currentInputCoverage:ratio(sum(followups.map(row=>row.tokens.read)),sum(followups.map(row=>row.tokens.input))),
    minimumPriorCapture:followups.length?Math.min(...followups.map(row=>row.reuse.readOverPriorInput)):null,maximumPriorDeficit:followups.length?Math.max(...followups.map(row=>Math.max(0,row.reuse.priorInputTokens-row.tokens.read))):null,
    eligibleFollowups:eligible.length,eligibleFullyReused:eligible.filter(row=>row.reuse.eligibleFrontierFullyReused).length,inputCostUsd:inputCost,outputCostUsd:outputCost,totalKnownCostUsd:inputCost!=null&&outputCost!=null?inputCost+outputCost:null,
    followupInputCostUsd:followupActual,theoreticalFollowupIdealUsd:theoretical,theoreticalFollowupMultiplier:followupActual!=null&&theoretical!=null?ratio(followupActual,theoretical):null,
    eligibleActualInputUsd:eligibleActual,eligibleIdealInputUsd:eligibleIdeal,eligibleFollowupMultiplier:eligibleActual!=null&&eligibleIdeal!=null?ratio(eligibleActual,eligibleIdeal):null,
    actualGapMinMs:followups.length&&followups.every(row=>finite(row.actualIdleGapMs))?Math.min(...followups.map(row=>row.actualIdleGapMs)):null,
    resolvedModels:[...new Set(valid.flatMap(row=>row.reportedResponseModels??[]))],rows };
}
function loadBatch(path:string):J {
  const root=resolve(path),manifest=readJson(join(root,'batch.json'));
  if(!manifest)throw new Error(`Missing or invalid batch.json: ${root}`);
  const planned:Array<J>=Array.isArray(manifest.dispatchOrder)?manifest.dispatchOrder:[];
  const plannedCount=planned.length || (manifest.models?.length??0)*(manifest.trials??1)*(manifest.gapsSeconds?.length??1);
  const directories=readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&existsSync(join(root,d.name,'coding-report.json'))).map(d=>d.name);
  const entries=planned.map((item,index)=>({plan:item,name:`${String(index+1).padStart(2,'0')}-${item.accountId}__${item.model}-${item.gap}s-t${item.trial+1}`}));
  for(const name of directories)if(!entries.some(item=>item.name===name)){const completed=manifest.completed?.find((item:J)=>item.trialName===name); entries.push({plan:completed?{...completed,gap:completed.gapSeconds}:{},name});}
  const trials=entries.map(item=>trial(join(root,item.name),item.plan));
  const models=[...new Set([...manifest.models??[],...trials.map(t=>t.model)])].map(model=>{
    const all=trials.filter(t=>t.model===model),qualified=all.filter(t=>t.primaryQualified),followups=qualified.flatMap(t=>t.rows.filter(validRow).filter((r:J)=>r.reuse&&r.reuse.priorInputTokens>0));
    const allFollowups=all.flatMap(t=>t.rows.filter(validRow).filter((r:J)=>r.reuse&&r.reuse.priorInputTokens>0));
    const allFrontier=allFollowups.filter((r:J)=>finite(r.reuse.priorPublicCacheFrontierTokens)&&r.reuse.priorPublicCacheFrontierTokens>0);
    const frontier=followups.filter((r:J)=>finite(r.reuse.priorPublicCacheFrontierTokens)&&r.reuse.priorPublicCacheFrontierTokens>0);
    const costKnown=all.filter(t=>t.totalKnownCostUsd!=null);
    const totalKnown=costKnown.length?sum(costKnown.map(t=>t.totalKnownCostUsd)):null;
    const actual=sum(frontier.map((r:J)=>r.independentCosts.inputUsd)),ideal=sum(frontier.map((r:J)=>r.reuse.eligibleFrontierCounterfactualUsd??0));
    return {model,plannedTasks:all.length,presentTasks:all.filter(t=>t.present).length,completedTasks:all.filter(t=>t.status==='completed').length,verifiedRepairTasks:all.filter(t=>t.verifiedRepair).length,verifiedRepairWithoutCompletionTasks:all.filter(t=>t.verifiedRepair&&t.status!=='completed').length,functionalQualifiedTasks:all.filter(t=>t.functionalQualified).length,auditQualifiedTasks:qualified.length,
      tasksWithMaterialShortfall:qualified.filter(t=>t.materialBelow95Count>0).length,repeatability:qualified.length===3?(qualified.filter(t=>t.materialBelow95Count>0).length>=2?'Repeated under registered rule':'Not repeated under registered rule'):'Incomplete: fewer than three qualified tasks',
      inputTokens:sum(all.map(t=>t.inputTokens)),readTokens:sum(all.map(t=>t.readTokens)),writeTokens:sum(all.map(t=>t.writeTokens)),ordinaryTokens:sum(all.map(t=>t.ordinaryTokens)),outputTokens:sum(all.map(t=>t.outputTokens)),inputCostUsd:all.some(t=>t.inputCostUsd!=null)?sum(all.map(t=>t.inputCostUsd??0)):null,outputCostUsd:all.some(t=>t.outputCostUsd!=null)?sum(all.map(t=>t.outputCostUsd??0)):null,
      capturedAttempts:sum(all.map(t=>t.capturedAttempts)),auditedAttempts:sum(all.map(t=>t.auditedAttempts)),validUsageAttempts:sum(all.map(t=>t.validUsageAttempts)),unknownUsageAttempts:sum(all.map(t=>t.unknownUsageAttempts)),auditFailedTasks:all.filter(t=>t.auditPresent&&!t.audited).length,
      allTasksWithMaterialShortfall:all.filter(t=>t.followups>0&&t.materialBelow95Count>0).length,allValidFollowups:allFollowups.length,allMaterialBelow95Count:allFollowups.filter((r:J)=>r.reuse.priorInputBelow95Percent).length,allStrict64Count:allFollowups.filter((r:J)=>r.reuse.strict64WholePriorInputFullHit).length,allAnyReadCount:allFollowups.filter((r:J)=>r.tokens.read>0).length,allWeightedPriorCapture:ratio(sum(allFollowups.map((r:J)=>r.tokens.read)),sum(allFollowups.map((r:J)=>r.reuse.priorInputTokens))),allEligibleFollowups:allFrontier.length,allEligibleFullyReused:allFrontier.filter((r:J)=>r.reuse.eligibleFrontierFullyReused).length,allEligibleFollowupMultiplier:ratio(sum(allFrontier.map((r:J)=>r.independentCosts.inputUsd)),sum(allFrontier.map((r:J)=>r.reuse.eligibleFrontierCounterfactualUsd??0))),
      qualifiedFollowups:followups.length,materialBelow95Count:followups.filter((r:J)=>r.reuse.priorInputBelow95Percent).length,strict64Count:followups.filter((r:J)=>r.reuse.strict64WholePriorInputFullHit).length,anyReadCount:followups.filter((r:J)=>r.tokens.read>0).length,
      meanTrialPriorCapture:avg(qualified.map(t=>t.priorCapture).filter(finite)),trialPriorCaptures:qualified.map(t=>t.priorCapture),weightedPriorCapture:ratio(sum(followups.map((r:J)=>r.tokens.read)),sum(followups.map((r:J)=>r.reuse.priorInputTokens))),
      eligibleFollowups:frontier.length,eligibleFullyReused:frontier.filter((r:J)=>r.reuse.eligibleFrontierFullyReused).length,eligibleFollowupMultiplier:ratio(actual,ideal),totalKnownCostUsd:totalKnown};
  });
  return {root,manifest,trials,models,plannedTasks:plannedCount,finishedTasks:trials.filter(t=>t.status!=='running'&&t.status!=='unattempted').length,complete:plannedCount>0&&plannedCount===(manifest.completed?.length??0)&&trials.every(t=>t.status!=='running')};
}
function csv(rows:J[],keys:string[]):string {
  const field=(value:unknown)=>{if(value==null)return '';const text=typeof value==='object'?JSON.stringify(value):String(value);return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;};
  return [keys.join(','),...rows.map(row=>keys.map(key=>field(row[key])).join(','))].join('\n')+'\n';
}
function link(from:string,target:string,label:string):string { return `[${md(label)}](${relative(dirname(from),target).split('\\').join('/')})`; }
function batchMarkdown(batch:J,file:string,label:string):string[] {
  const models=batch.models as J[],trials=batch.trials as J[];
  return [`## ${label}`, '', `Source: ${link(file,join(batch.root,'batch.json'),basename(batch.root))}. Planned tasks: ${batch.plannedTasks}; finished tasks: ${batch.finishedTasks}; independent audits available: ${trials.filter(t=>t.auditPresent).length}. ${batch.complete?'All planned task artifacts are present.':'This batch is incomplete; pending tasks and missing audits are shown below.'}`, '',
    '| Model | Qualified tasks / planned | Tasks with <95% follow-up | Audited HTTP attempts / captured | Qualified follow-ups | <95% / strict64 / any read | Prior-input capture in each task | Eligible frontier reused | Boundary-aware follow-up cost |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |',
    ...models.map(m=>`| ${md(m.model)} | ${m.auditQualifiedTasks}/${m.plannedTasks} | ${m.tasksWithMaterialShortfall}/${m.auditQualifiedTasks} | ${m.auditedAttempts}/${m.capturedAttempts} | ${m.qualifiedFollowups} | ${m.materialBelow95Count} / ${m.strict64Count} / ${m.anyReadCount} | ${m.trialPriorCaptures.map(pct).join(', ')||'unknown'} | ${m.eligibleFollowups?`${m.eligibleFullyReused}/${m.eligibleFollowups}`:'unknown'} | ${mult(m.eligibleFollowupMultiplier)} |`), '',
    'The three counts in “<95% / strict64 / any read” share the qualified-follow-up denominator. Reuse fractions above 100% are retained when reported reads exceed the preceding input count; these are descriptive counters, not probabilities.', '',
    '### Secondary view: all valid raw follow-ups, including stopped tasks', '',
    '| Model | Verified repairs / attempted | Natural completions | Tasks with <95% | Valid raw follow-ups | <95% / strict64 / any read | Prior capture | Eligible reused | Boundary-aware follow-up cost |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |',
    ...models.map(m=>`| ${md(m.model)} | ${m.verifiedRepairTasks}/${m.presentTasks} | ${m.completedTasks} | ${m.allTasksWithMaterialShortfall}/${m.presentTasks} | ${m.allValidFollowups} | ${m.allMaterialBelow95Count} / ${m.allStrict64Count} / ${m.allAnyReadCount} | ${pct(m.allWeightedPriorCapture)} | ${m.allEligibleFollowups?`${m.allEligibleFullyReused}/${m.allEligibleFollowups}`:'unknown'} | ${mult(m.allEligibleFollowupMultiplier)} |`), '',
    'This secondary view retains valid independently decoded usage from every attempted task, including tasks stopped at a request/time cap. A verified repair means the actual baseline failed, all 44 final tests and the CLI passed, acceptance files stayed unchanged, and source changed. It does not require a natural agent completion. It does not replace or relax the preregistered primary qualification; stopped tasks and their raw measurements must not disappear merely because their final message is absent.', '',
    '| Model | Audited input / reads / writes / ordinary | Audited output | Known input cost | Known output cost |',
    '| --- | --- | ---: | ---: | ---: |',
    ...models.map(m=>`| ${md(m.model)} | ${m.validUsageAttempts?`${m.inputTokens} / ${m.readTokens} / ${m.writeTokens} / ${m.ordinaryTokens}`:'unknown'} | ${m.validUsageAttempts?m.outputTokens:'unknown'} | ${usd(m.inputCostUsd)} | ${usd(m.outputCostUsd)} |`), '',
    '| Task | Status / qualification | Tests before → after | Requests; known usage | <95% / follow-ups | Strict64 / any read | Prior capture; minimum | Largest prior deficit | Eligible reused | Boundary / hypothetical follow-up cost | Known task cost |',
    '| --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | --- | ---: |',
    ...trials.map(t=>`| ${t.present?link(file,join(t.root,t.auditPresent?'coding-audit.json':'coding-report.json'),`${t.model} · trial ${t.trialNumber}`):md(`${t.model} · trial ${t.trialNumber}`)} | ${md(t.status)}; ${t.primaryQualified?'qualified':t.functionalQualified?'audit pending/failed':'not qualified'}${t.verifiedRepair?' · repair verified':''} | ${t.baselineCounts?`${t.baselineCounts.pass} pass, ${t.baselineCounts.fail} fail`:'pending'} → ${t.finalCounts?`${t.finalCounts.pass} pass, ${t.finalCounts.fail} fail`:'pending'} | ${t.capturedAttempts}; ${t.validUsageAttempts} | ${t.materialBelow95Count}/${t.followups} | ${t.strict64Count} / ${t.anyReadCount} | ${pct(t.priorCapture)}; ${pct(t.minimumPriorCapture)} | ${t.maximumPriorDeficit??'unknown'} | ${t.eligibleFollowups?`${t.eligibleFullyReused}/${t.eligibleFollowups}`:'unknown'} | ${mult(t.eligibleFollowupMultiplier)} / ${mult(t.theoreticalFollowupMultiplier)} | ${usd(t.totalKnownCostUsd)} |`), '',
    'Task rows preserve unsuccessful and unaudited tasks. Model reuse counts above use only functionally qualified tasks with a current audit containing no failed checks. Costs in task rows come from independently parsed valid raw usage, including unsuccessful tasks where available. Missing usage and unreported charges remain unknown.', '',
    ...trials.filter(t=>t.stopReason||t.auditFailures||t.auditUnknowns||!t.auditFresh&&t.auditPresent).map(t=>`- ${md(t.trialName)}: ${md(t.stopReason??'no stop reason')}; audit FAIL ${t.auditFailures}, UNKNOWN ${t.auditUnknowns}; ${t.auditFresh?'audit matches captured artifacts':'audit absent or stale'}.`), ''];
}
const batch=loadBatch(parsed.positionals[0]);
const qualifiers=(parsed.values.qualifier??[]).map(loadBatch);
const integrity=readJson(join(batch.root,'cross-task-integrity.json'));
const minActualIdleGapMs=batch.trials.every((t:J)=>finite(t.actualGapMinMs))?Math.min(...batch.trials.map((t:J)=>t.actualGapMinMs)):null;
if(parsed.values.final&&(!batch.complete||batch.trials.some((t:J)=>!t.auditPresent||!t.auditFresh)))throw new Error('--final requires every planned task and a current audit for each. Wait for the batch/audits to finish.');
const final=Boolean(parsed.values.final);
const output=resolve(parsed.values.out??join(batch.root,'coding-summary.md'));
mkdirSync(dirname(output),{recursive:true});
const geminiModels=batch.models.filter((m:J)=>m.model.startsWith('gemini-'));
const comparisonModels=batch.models.filter((m:J)=>['gpt-6.1-sol','claude-opus-5-5'].includes(m.model));
const allQualified=batch.models.length===4&&batch.models.every((m:J)=>m.auditQualifiedTasks===3);
const qualitativeJudgment=!allQualified?'The preregistered natural-completion subset does not contain three qualified tasks for every model, so a full four-model primary repeated-pattern judgment remains incomplete. Per-model outcomes and the secondary all-task measurements remain visible; a completion cap does not erase valid raw cache observations.':
  geminiModels.every((m:J)=>m.tasksWithMaterialShortfall>=2)&&comparisonModels.every((m:J)=>m.tasksWithMaterialShortfall===0)?'The registered qualitative difference repeated in this coding task: both Gemini models had a material prior-input shortfall in at least two of three tasks, while neither comparison model did. This supports the criticism under these specific public-API conditions; it does not establish the original numerical hit rate or timing-cost claims.':
  geminiModels.every((m:J)=>m.tasksWithMaterialShortfall===0)&&comparisonModels.every((m:J)=>m.tasksWithMaterialShortfall===0)?'This batch did not reproduce the qualitative material-shortfall pattern: none of the four models had a below-95% follow-up in a qualified task. This is evidence for these conditions, not a refutation of the unavailable original workload.':
  'The registered task-level pattern is mixed. Read each model’s three task outcomes; these results do not establish a uniform Gemini-versus-comparison-model difference.';
const allTaskPattern=batch.models.length===4&&geminiModels.length===2&&comparisonModels.length===2&&geminiModels.every((m:J)=>m.presentTasks===3&&m.allTasksWithMaterialShortfall===3)&&comparisonModels.every((m:J)=>m.presentTasks===3&&m.allTasksWithMaterialShortfall===0);
const capturedAttempts=sum(batch.models.map((m:J)=>m.capturedAttempts));
const knownCostUsd=sum(batch.models.map((m:J)=>m.totalKnownCostUsd??0));
const narrative=[
  '# Real coding-agent cache validation — October 17, 2026', '',
  `**${final?'Completed, independently audited batch':'PARTIAL SNAPSHOT — confirmation is still in progress'}**. Generated ${generatedAt}. ${final?'The following counts describe this registered batch only.':'These are provisional artifact counts, not final claim judgments. Rerun the offline summary after all tasks and audits finish.'}`, '',
  ...(final?[allTaskPattern?'**The real coding results support the qualitative prior-input reuse gap under these tested conditions.** Both Gemini models had a follow-up reading less than 95% of the preceding input in all three tasks; GPT-6.1 Sol and Claude Opus 5.5 had none. This describes reported reuse relative to previous input, not a proven failure to reuse every provider-eligible token. Gemini’s eligible frontier is unknown.':'**The completed coding results are reported below by task and model.** The observed pattern applies to this public-API workflow; provider-eligible cache boundaries and independent task counts limit the conclusions.', '',
    `All **${batch.trials.filter((t:J)=>t.verifiedRepair).length}/${batch.plannedTasks} repairs were verified**: actual baseline 38 pass / 6 fail became 44 pass / 0 fail, acceptance material stayed unchanged, and the invoice CLI passed. There were ${capturedAttempts} captured HTTP attempts and ${usd(knownCostUsd)} in independently reconstructed known charges. ${batch.trials.filter((t:J)=>t.status==='completed').length} agents completed naturally; ${batch.trials.filter((t:J)=>t.primaryQualified).length}/${batch.plannedTasks} tasks met the unchanged primary qualification.`, '',
    '**All attempted tasks, including the capped Flash repair (secondary analysis):**', '',
    '| Model | Verified repairs | Tasks with <95% follow-up | <95% follow-ups | Strict previous-input match, 64-token tolerance | Eligible frontier fully reused |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...batch.models.map((m:J)=>`| ${md(m.model)} | ${m.verifiedRepairTasks}/${m.presentTasks} | ${m.allTasksWithMaterialShortfall}/${m.presentTasks} | ${m.allMaterialBelow95Count}/${m.allValidFollowups} | ${m.allStrict64Count}/${m.allValidFollowups} (${pct(ratio(m.allStrict64Count,m.allValidFollowups))}) | ${m.allEligibleFollowups?`${m.allEligibleFullyReused}/${m.allEligibleFollowups}`:'unknown'} |`), '',
    'The strict-match column is a whole-previous-input heuristic, not a provider-eligibility guarantee. All-task rows preserve valid usage from stopped tasks; they do not replace the preregistered natural-completion subset. The exact original 73% claim and the reported 30/120-second cost effects remain unestablished.', '', qualitativeJudgment, '']:[]),
  ...(batch.trials.some((t:J)=>t.verifiedRepair&&t.status!=='completed')?[`**Completion-cap limitation:** ${batch.trials.filter((t:J)=>t.verifiedRepair&&t.status!=='completed').map((t:J)=>`${t.model} trial ${t.trialNumber}`).join(', ')} produced verified source repairs with all 44 tests and CLI passing but stopped without a natural agent completion (${batch.trials.filter((t:J)=>t.verifiedRepair&&t.status!=='completed').map((t:J)=>t.stopReason??'recorded stop').join('; ')}). These tasks remain outside primary qualification and inside the secondary all-valid-usage view.`, '']:[]),
  ...(integrity?[`The ${link(output,join(batch.root,'cross-task-integrity.md'),'independent cross-task integrity audit')} (${link(output,join(batch.root,'cross-task-integrity.json'),'JSON evidence')}) records ${integrity.summary?.rawAuditPass??'unknown'} raw-audit checks passed, ${integrity.summary?.rawAuditFail??'unknown'} failed, ${integrity.summary?.rawAuditUnknown??'unknown'} unknown, and ${integrity.summary?.uniqueNativeResponseIds??'unknown'} unique native responses. It also checks fixed request fields, task payload equivalence, native history/signature preservation, and actual tool-result replay.`, '']:[]),
  ...(minActualIdleGapMs!=null?[`The nominal idle interval was five seconds. The smallest recorded completion-to-send gap was **${minActualIdleGapMs.toFixed(6)} ms**${minActualIdleGapMs<5000?' (less than one millisecond short of 5000 ms; actual timings are retained rather than rounded into compliance)':''}.`, '']:[]),
  'This study asks whether substantial prior code context is reused while a real coding agent repairs a repository and runs actual tests. It uses the same pinned Pi 1.3.0 agent through public paid APIs, separately for Gemini Argon 4, Gemini Flash 3.8, GPT-6.1 Sol, and Claude Opus 5.5. It is a representative shared coding-agent workflow; it does not run the native Codex, Claude Code, or AGY applications.', '',
  'Every task starts from the same 62,386-byte, dependency-free invoice-import repository with genuine CSV, decimal-money, and vendor-identity defects. Qualification requires actual source changes, baseline **38 pass / 6 fail**, final **44 pass / 0 fail**, unchanged acceptance material, and an independently executed CLI import of all four invoices. Primary qualification additionally requires natural agent completion; verified-repair outcomes are reported separately when a cap prevents completion. Model claims of success are never accepted as proof.', '',
  `The ${link(output,resolve('docs/CODING_CONFIRMATION_PROTOCOL.md'),'preregistered confirmation protocol')} specifies three fresh tasks per model, shuffled seed blocks, a five-second idle floor, low reasoning, no retries/cache warming/compaction, and request/time/spend stops. The earlier qualification tasks are listed separately and are not pooled into the three-task confirmation.`, '',
  '## What is supported', '',
  '| Question | Current scope and judgment |', '| --- | --- |',
  `| Is this actual successful coding work? | ${final?`${batch.trials.filter((t:J)=>t.verifiedRepair).length}/${batch.plannedTasks} verified repairs passed all 44 tests and CLI; ${batch.trials.filter((t:J)=>t.primaryQualified).length}/${batch.plannedTasks} also met natural-completion and audit qualification.`:'Confirmation pending; see actual per-task test and patch evidence below.'} |`,
  ...batch.models.map((m:J)=>`| Does ${md(m.model)} repeatedly show a material prior-input shortfall? | ${final?`${m.repeatability}: ${m.tasksWithMaterialShortfall}/${m.auditQualifiedTasks} qualified tasks contain a follow-up below 95%.`:'Pending completed confirmation; current task values are provisional.'} |`),
  '| Are Theo’s exact 167/228 full matches or 1.20×/1.34×/1.48× costs replicated? | Not established. The original prompts, cache-eligibility definition, cost denominator, and exact agent method are unavailable. |',
  '| Do 30/120-second gaps cause an additional effect in real coding? | Not tested by this five-second confirmation batch. Earlier generic controls are separate evidence. |',
  '| Is an internal routing, checkpoint, or eviction mechanism identified? | No. Public counters alone cannot identify an internal cause. |', '',
  ...batchMarkdown(batch,output,'Three-task confirmation'),
  '## Method and limits of the coding workload', '',
  'A roughly 63K-character snapshot of the real repository is preloaded into the initial prompt, with task instructions adding further text. This is substantial coding context, but it differs from a typical interactive agent that discovers the repository through incremental reads. The agent can read/edit source and run a small declared set of real Node test/CLI commands; it does not have an unrestricted shell. Three fresh runs per model repeat one invoice-import issue, not three different task types.', '',
  'The first request is excluded from reuse-rate denominators because it has no within-task predecessor; it is not guaranteed cold. Shared system/tool prefixes may already be cached, and later Opus initial requests reported cached reads. Those reads and their actual charges remain in the raw evidence and cost totals.', '',
  'Pi uses explicit Anthropic cache breakpoints, while Gemini and GPT use their configured implicit caching routes. Native serialization, tool choices, signatures, tokenization, and eligible boundaries differ. These are measurements of the configured public-API coding-agent paths, not an experiment that changes only the provider behind otherwise identical wire requests.', '',
  'Effective reasoning was held at low: GPT’s wire configuration_update and Anthropic’s effective system-message output_config carry low effort. Fixed top-level wrapper values may show medium/high; those wrapper defaults do not describe the effective per-message configuration. Raw requests retain both representations for inspection.', '',
  '## Reading the measurements', '',
  'Material shortfall means reported cached reads below 95% of the preceding total input. This is a descriptive threshold, not a documented eligible-cache guarantee. Strict64 means cached reads at least the entire previous input minus 64 tokens; ordinary provider overhead can fail it even when the entire public cache frontier was reused. Any read means a positive reported cached-token count. Initial requests are excluded from follow-up counts without assuming a cold cache; failed/unknown-usage attempts never become cache misses.', '',
  'For OpenAI and Anthropic, explicit read + write counters expose a public frontier. Boundary-aware costs retain current ordinary-input charges, price the reusable prior frontier at the read rate, and price the newly processed frontier at its write rate. Gemini has no equivalent exposed implicit-write frontier, so boundary-aware metrics remain unknown. Its zero separately billed write partition does not assert that no internal cache write occurred. The hypothetical all-prior-input reference assumes all prior input could be cached; it is a theoretical counterfactual rather than a proven attainable service baseline. Output costs are separate.', '',
  'Gemini accounting uses documented promptTokenCount for input and prompt-relative cache coverage. Some Flash responses also expose rawPromptTokenCount, whose semantics are absent from the current public UsageMetadata definition and public proto. That additional field is retained as raw evidence but is not silently substituted into billing or reuse denominators; no extra charge bucket or internal-cache explanation is inferred. See [Google UsageMetadata](https://ai.google.dev/api/generate-content#UsageMetadata).', '',
  'Gemini omitted cached-token counters in an otherwise valid usage object decode to zero under its public proto3/ProtoJSON contract; absent whole usage remains unknown. Each audit retains raw usage and the zero-decoding flag. See the '+link(output,resolve('docs/provider-notes.md'),'provider accounting notes')+'.', '',
  'Task capture is the sum of follow-up cached reads divided by the sum of their preceding input counts; the minimum is the lowest individual follow-up ratio. CSV also reports the equally weighted mean of task capture values. Each task is the unit of repetition. Within-task requests are correlated, task lengths and tool choices differ, and these three tasks cannot determine a provider-wide miss probability. Individual task values are shown instead of treating pooled turns as independent observations. The registered repeated-pattern rule requires at least two of three successfully completed tasks to contain a below-95% follow-up.', '',
  'Usage and cost numbers are reconstructed from captured public-API SSE/JSON by scripts/audit-coding.ts, independently of Pi’s normalized summaries. Functional outcomes are checked from actual subprocess exit codes, saved Node test output, source/acceptance-file hashes, patches, and final CLI output. Estimated charges use the audit’s dated standard rate cards, not an invoice; missing/interrupted charges can exceed known costs. Different task paths make total task costs unsuitable for a matched-workload provider-price ranking.', '',
  ...qualifiers.flatMap((q,index)=>batchMarkdown(q,output,`Development qualification ${index+1} — separate from confirmation`)),
  '## Reproduce this offline report', '',
  '```sh', `npx tsx scripts/summarize-coding.ts ${relative(resolve('.'),batch.root)}${qualifiers.map(q=>` --qualifier ${relative(resolve('.'),q.root)}`).join('')} --out ${relative(resolve('.'),output)}${final?' --final':''}`, '```', '',
  'The script writes model-summary.csv, trial-summary.csv, coding-summary.json, and coding-summary.md inside the selected batch. Without --final it explicitly labels a partial snapshot. --final requires completed planned tasks and current independent audit artifacts. It never reads credentials or starts a provider request.', '',
];
const markdown=narrative.join('\n');
writeFileSync(output,markdown);
if(output!==join(batch.root,'coding-summary.md'))writeFileSync(join(batch.root,'coding-summary.md'),markdown);
const trialKeys=['trialName','model','provider','accountId','trialNumber','gapSeconds','status','stopReason','verifiedRepair','functionalQualified','audited','primaryQualified','auditFailures','auditUnknowns','capturedAttempts','auditedAttempts','validUsageAttempts','unknownUsageAttempts','inputTokens','readTokens','writeTokens','ordinaryTokens','outputTokens','followups','materialBelow95Count','strict64Count','anyReadCount','priorCapture','currentInputCoverage','minimumPriorCapture','maximumPriorDeficit','eligibleFollowups','eligibleFullyReused','eligibleFollowupMultiplier','theoreticalFollowupMultiplier','inputCostUsd','outputCostUsd','totalKnownCostUsd','actualGapMinMs','immutableUnchanged','immutableFileCount','changedSourceFiles','baselineCounts','finalCounts','resolvedModels'];
const modelKeys=['model','plannedTasks','presentTasks','completedTasks','verifiedRepairTasks','verifiedRepairWithoutCompletionTasks','functionalQualifiedTasks','auditQualifiedTasks','tasksWithMaterialShortfall','repeatability','capturedAttempts','auditedAttempts','validUsageAttempts','unknownUsageAttempts','inputTokens','readTokens','writeTokens','ordinaryTokens','outputTokens','inputCostUsd','outputCostUsd','auditFailedTasks','allTasksWithMaterialShortfall','allValidFollowups','allMaterialBelow95Count','allStrict64Count','allAnyReadCount','allWeightedPriorCapture','allEligibleFollowups','allEligibleFullyReused','allEligibleFollowupMultiplier','qualifiedFollowups','materialBelow95Count','strict64Count','anyReadCount','meanTrialPriorCapture','trialPriorCaptures','weightedPriorCapture','eligibleFollowups','eligibleFullyReused','eligibleFollowupMultiplier','totalKnownCostUsd'];
writeFileSync(join(batch.root,'trial-summary.csv'),csv(batch.trials,trialKeys));
writeFileSync(join(batch.root,'model-summary.csv'),csv(batch.models,modelKeys));
const result={schemaVersion:1,generatedAt,final,integrity:integrity?{source:relative(resolve('.'),join(batch.root,'cross-task-integrity.json')),sha256:loadedHashes.get(resolve(batch.root,'cross-task-integrity.json')),verdict:integrity.verdict,summary:integrity.summary}:null,minActualIdleGapMs,batch:batch.root,complete:batch.complete,plannedTasks:batch.plannedTasks,finishedTasks:batch.finishedTasks,models:batch.models,trials:batch.trials.map(({rows,...t}:J)=>t),qualifierBatches:qualifiers.map(q=>({root:q.root,models:q.models,trials:q.trials.map(({rows,...t}:J)=>t)})),sourceAuditHashes:Object.fromEntries([...batch.trials,...qualifiers.flatMap(q=>q.trials)].filter((t:J)=>t.auditPresent).map((t:J)=>[relative(resolve('.'),join(t.root,'coding-audit.json')),loadedHashes.get(resolve(t.root,'coding-audit.json'))]))};
writeFileSync(join(batch.root,'coding-summary.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({report:output,final,plannedTasks:batch.plannedTasks,finishedTasks:batch.finishedTasks,auditedTasks:batch.trials.filter((t:J)=>t.audited).length,verifiedRepairs:batch.trials.filter((t:J)=>t.verifiedRepair).length,naturalCompletions:batch.trials.filter((t:J)=>t.status==='completed').length,qualifiedTasks:batch.trials.filter((t:J)=>t.primaryQualified).length},null,2));
