from pathlib import Path
import shutil,json,hashlib,subprocess,sys
source=Path(sys.argv[1]).resolve()
base=Path(sys.argv[2] if len(sys.argv)>2 else 'fixtures').resolve();base.mkdir(parents=True,exist_ok=True)
commit=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
if commit != 'f12e6862a41f4324a06a26c87a3e28031d4faa7f':raise SystemExit('Unexpected upstream commit; workload source must be pinned.')
selected=[]
for f in sorted(source.rglob('*')):
 if not f.is_file() or any(p in {'.git','dist','node_modules'} for p in f.parts):continue
 r=f.relative_to(source)
 if f.suffix not in {'.js','.ts','.md'} or f.name.endswith('.d.ts') or '/samples/browser/' in str(f) or '/www/' in str(f):continue
 selected.append((r,f))
for variant in ['parse','stringify']:
 root=base/('coding-csv-'+variant);root.mkdir(exist_ok=True)
 origins={}
 for r,f in selected:
  target=root/('src/upstream' if len(r.parts)>2 and r.parts[0]=='packages' and 'lib' in r.parts else 'reference/upstream')/r
  target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,target)
  origins[str(target.relative_to(root))]={'upstreamPath':str(r),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
 shutil.copyfile(source/'LICENSE',root/'UPSTREAM_LICENSE')
 (root/'package.json').write_text(json.dumps({'name':'cachebench-csv-'+variant,'private':True,'type':'module','scripts':{'test':'node --test test/*.test.mjs'}},indent=2)+'\n')
 for name in ['src','test','bin','data']:(root/name).mkdir(exist_ok=True)
 (root/'fixture.json').write_text(json.dumps({'id':'coding-csv-'+variant,'cliArgs':['bin/check.mjs'],'expectedCli':{'ok':True,'records':4},'upstream':{'url':'https://github.com/adaltas/node-csv','commit':commit,'license':'MIT'},'contextMode':'whole-selected-public-source-preload','targetInputMin':250000},indent=2)+'\n')
 (root/'UPSTREAM.json').write_text(json.dumps({'repository':'https://github.com/adaltas/node-csv','commit':commit,'selection':'All unique .js/.ts/.md source, tests, examples and docs excluding generated dist, declaration duplicates, browser samples and www; no repeated files or random padding. lib code is executable under src/upstream; other upstream material is immutable reference.','files':origins},indent=2)+'\n')
 (root/'README.md').write_text('''# CSV pipeline regression workspace

This fixture vendors executable library source plus tests/examples/documentation from the pinned public node-csv monorepo. See UPSTREAM.json and UPSTREAM_LICENSE. `src/upstream/packages/*/lib` holds executable modules; `reference/upstream` is immutable upstream context, not the executable acceptance suite. No dependency install is required. Acceptance tests are the Node tests in `test/`.

Repair the reported regression in the library implementation rather than special-casing test inputs or changing expectations. Keep unrelated behavior intact. Only src/ and bin/ may change. Tests, data, manifests and reference material are immutable.

Commands: `node --test test/*.test.mjs` and `node bin/check.mjs`.
''')
 symptom='The CSV parser silently drops the final record when a feed ends without a trailing record delimiter. Sync and chunked streaming input are affected; quoted and trailing empty final fields must work.' if variant=='parse' else 'The CSV stringifier emits unquoted delimiter-containing fields. Round trips change the number of columns or throw; custom and multi-byte delimiters must be handled as well as commas.'
 (root/'TASK.md').write_text(f'''# Repair a CSV library regression

{symptom}

Inspect README.md, the actual library source under src/upstream and relevant regression tests. Run `node --test test/*.test.mjs` before editing, fix the library source, then run the same complete test command and `node bin/check.mjs`. Use real tools. Do not change test/data/reference/manifests or install packages. The complete selected upstream source snapshot is provided as a controlled large-context workload; use it as repository context. It is not an organic native-CLI session. Finish naturally with a brief account of the actual fix and commands/results.
''')
 (root/'src/pipeline.mjs').write_text('''import { parse } from './upstream/packages/csv-parse/lib/sync.js';
import { stringify } from './upstream/packages/csv-stringify/lib/sync.js';
export { parse, stringify };
export function roundtrip(records, options={}) { return parse(stringify(records, options), options); }
''')
 (root/'data/feed.csv').write_text('id,name,note\n1,Ada,"hello, world"\n2,Björk,"says ""yes"""\n3,Chen,"two\nlines"\n4,Dina,tail')
 (root/'bin/check.mjs').write_text('''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, roundtrip } from '../src/pipeline.mjs';
const rows = parse(readFileSync(new URL('../data/feed.csv', import.meta.url)), {columns:true});
assert.equal(rows.length,4);
assert.equal(rows.at(-1).note,'tail');
const matrix=rows.map(r=>[r.id,r.name,r.note]);
assert.deepEqual(roundtrip(matrix),matrix);
console.log(JSON.stringify({ok:true,records:rows.length}));
''')
 (root/'test/regression.test.mjs').write_text('''import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify, roundtrip } from '../src/pipeline.mjs';
import { parse as streamParse } from '../src/upstream/packages/csv-parse/lib/index.js';
import { Readable } from 'node:stream';
const cases=[
 ['plain final record','a,b',[['a','b']]],
 ['quoted final field','a,"b"',[['a','b']]],
 ['empty final field','a,',[['a','']]],
 ['empty quoted final field','a,""',[['a','']]],
 ['escaped quote at EOF','a,"b""c"',[['a','b"c']]],
 ['multiline final field','a,"b\\nc"',[['a','b\\nc']]],
 ['two records at EOF','a,b\\nc,d',[['a','b'],['c','d']]],
 ['unicode final field','α,β',[['α','β']]],
 ['newline terminated','a,b\\n',[['a','b']]],
 ['CRLF terminated','a,b\\r\\n',[['a','b']]],
 ['no phantom record','a,b\\nc,d\\n',[['a','b'],['c','d']]],
];
for(const [name,input,expected] of cases)test('sync parse: '+name,()=>assert.deepEqual(parse(input),expected));
for(const size of [1,2,7])test('streamed EOF with byte chunks '+size,async()=>{
 const input=Buffer.from('name,note\\nBjörk,"hello, world"\\nChen,"last"');
 const chunks=[];for(let n=0;n<input.length;n+=size)chunks.push(input.subarray(n,n+size));
 const records=[];for await(const row of Readable.from(chunks).pipe(streamParse({columns:true})))records.push(row);
 assert.deepEqual(records,[{name:'Björk',note:'hello, world'},{name:'Chen',note:'last'}]);
});
for(const delimiter of [',',';','||','💠']){
 for(const value of ['left'+delimiter+'right','a"b','a\\nb','a\\rb','plain','']){
  const records=[['id','value'],['1',value],['2','tail']];
  test('stringify roundtrip '+JSON.stringify({delimiter,value}),()=>assert.deepEqual(roundtrip(records,{delimiter}),records));
 }
}
test('columns map final record',()=>assert.deepEqual(parse('id,name\\n1,Ada\\n2,Bob',{columns:true}),[{id:'1',name:'Ada'},{id:'2',name:'Bob'}]));
test('empty input',()=>assert.deepEqual(parse(''),[]));
test('explicit quote escaping',()=>assert.equal(stringify([['a"b','c,d']]),'"a""b","c,d"\\n'));
''')
 # Deliberately seeded regressions, held outside the agent prompt as reproducible fixture construction.
 if variant=='parse':
  p=root/'src/upstream/packages/csv-parse/lib/api/index.js';s=p.read_text();start=s.index('      if (end === true) {');pos=s.index('const errRecord = this.__onRecord(push);',start);s=s[:pos]+s[pos:].replace('const errRecord = this.__onRecord(push);','const errRecord = undefined;',1);p.write_text(s)
 else:
  p=root/'src/upstream/packages/csv-stringify/lib/api/index.js';s=p.read_text();a='const containsdelimiter = emits_separator(value, [delimiter]);';assert s.count(a)==1;s=s.replace(a,'const containsdelimiter = false;');p.write_text(s)
 print(root)
