#!/usr/bin/env python3
"""Negative controls against actual retained evidence; never changes the original study."""
import copy,hashlib,json,subprocess,sys,tempfile
from pathlib import Path
study=Path(sys.argv[1]).resolve();plan=json.loads((study/'plan.json').read_text());analyzer=Path(__file__).with_name('analyze-theo-regime.py').resolve()
def run_case(armid,mutate,expected=None):
    entry=next(e for e in plan['configs'] if e['arm']['id']==armid)
    source=next((study/armid/'results').glob('*/report.json'));report=json.loads(source.read_text())
    with tempfile.TemporaryDirectory(prefix='theo-audit-test-') as scratch:
        root=Path(scratch);target=root/'study';target.mkdir();single={**plan,'configs':[entry]};(target/'plan.json').write_text(json.dumps(single))
        mutate(report)
        saved=target/armid/'results'/report['runId'];saved.mkdir(parents=True);(saved/'report.json').write_text(json.dumps(report))
        result=subprocess.run([sys.executable,str(analyzer),str(target),'--out',str(root/'analysis')],capture_output=True,text=True)
        if expected:
            assert result.returncode!=0,(armid,'tamper accepted')
            assert expected in result.stdout+result.stderr,(armid,'wrong rejection',result.stdout,result.stderr)
        else:assert result.returncode==0,(armid,result.stdout,result.stderr)

def rewrite(o):
    o['wireRequestText']=json.dumps(o['wireRequest'],ensure_ascii=False,separators=(',',':'))
    o['requestHash']=hashlib.sha256(o['wireRequestText'].encode()).hexdigest()

def tamper_usage(report):report['observations'][1]['usage']['cachedReadTokens']+=1
def tamper_strict(report):report['observations'][1]['fullHit']=False

def tamper_signature(report):
    o=report['observations'][1];parts=o['wireRequest']['contents'][-2]['parts'];part=next(p for p in parts if 'thoughtSignature' in p);part['thoughtSignature']='tampered-signature';rewrite(o)

def tamper_replay(report):
    o=report['observations'][1];o['wireRequest']['input'][0]['content']+=' altered prefix';rewrite(o)

agent='gemini-4-argon-agent-large-delta';replay='gpt-6.1-sol-replay-8k'
run_case(agent,lambda r:None)
run_case(agent,tamper_usage,'independent usage differs')
run_case(agent,tamper_strict,'strict full hit differs')
run_case(agent,tamper_signature,'native generated history differs')
run_case(replay,lambda r:None)
run_case(replay,tamper_replay,'Replay request bodies differ')
print('PASS: original evidence accepted; altered usage, strict-hit classification, signature and replay body rejected.')
