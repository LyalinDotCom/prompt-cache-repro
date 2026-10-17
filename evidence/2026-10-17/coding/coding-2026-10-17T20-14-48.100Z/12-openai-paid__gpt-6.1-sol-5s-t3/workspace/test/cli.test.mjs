import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, main } from '../bin/ledger.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('CLI parses only supported and nonrepeated options', () => {
  assert.deepEqual(parseArgs(['import','feed.csv','--format','json','--vendor','a']),{command:'import',file:'feed.csv',options:{format:'json',vendorId:'a'}});
  assert.throws(()=>parseArgs(['import','feed.csv','--format','json','--format','text']),/Repeated/);
  assert.throws(()=>parseArgs(['import','feed.csv','--wat','x']),/Unknown/);
  assert.throws(()=>parseArgs(['import','feed.csv','--format','yaml']),/format/);assert.equal(parseArgs(['--help']).command,'help');
});
test('schema command is usable without loading invoice files', () => {
  const result=execFileSync(process.execPath,['bin/ledger.mjs','schema','invoice'],{cwd:root,encoding:'utf8'});
  assert.equal(JSON.parse(result).find(column=>column.name==='amount').kind,'decimal');
});
test('missing file is a curated CLI error with nonzero status', () => {
  const result=spawnSync(process.execPath,['bin/ledger.mjs','import','data/not-present.csv'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/ledger:/);assert.equal(result.stdout,'');
});
test('actual mixed-feed CLI output includes all supplier invoices and exact cents', () => {
  const result=spawnSync(process.execPath,['bin/ledger.mjs','import','data/invoices.csv','--format','json'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const parsed=JSON.parse(result.stdout);
  assert.equal(parsed.counts.accepted,4);assert.equal(parsed.counts.sourceRows,4);
  assert.equal(parsed.totals[0].totalCents,1208);assert.equal(parsed.vendors.length,3);
});
test('help output and usage errors are written to their intended streams', async () => {
  const stdout={text:'',write(value){this.text+=value;}},stderr={text:'',write(value){this.text+=value;}};
  assert.equal(await main(['--help'],{stdout,stderr}),0);assert.match(stdout.text,/Ledger:/);assert.equal(stderr.text,'');
  assert.equal(await main(['wat'],{stdout,stderr}),1);assert.match(stderr.text,/Expected import/);
});
