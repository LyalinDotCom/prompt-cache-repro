import { test } from 'node:test';
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
 ['multiline final field','a,"b\nc"',[['a','b\nc']]],
 ['two records at EOF','a,b\nc,d',[['a','b'],['c','d']]],
 ['unicode final field','α,β',[['α','β']]],
 ['newline terminated','a,b\n',[['a','b']]],
 ['CRLF terminated','a,b\r\n',[['a','b']]],
 ['no phantom record','a,b\nc,d\n',[['a','b'],['c','d']]],
];
for(const [name,input,expected] of cases)test('sync parse: '+name,()=>assert.deepEqual(parse(input),expected));
for(const size of [1,2,7])test('streamed EOF with byte chunks '+size,async()=>{
 const input=Buffer.from('name,note\nBjörk,"hello, world"\nChen,"last"');
 const chunks=[];for(let n=0;n<input.length;n+=size)chunks.push(input.subarray(n,n+size));
 const records=[];for await(const row of Readable.from(chunks).pipe(streamParse({columns:true})))records.push(row);
 assert.deepEqual(records,[{name:'Björk',note:'hello, world'},{name:'Chen',note:'last'}]);
});
for(const delimiter of [',',';','||','💠']){
 for(const value of ['left'+delimiter+'right','a"b','a\nb','a\rb','plain','']){
  const records=[['id','value'],['1',value],['2','tail']];
  test('stringify roundtrip '+JSON.stringify({delimiter,value}),()=>assert.deepEqual(roundtrip(records,{delimiter}),records));
 }
}
test('columns map final record',()=>assert.deepEqual(parse('id,name\n1,Ada\n2,Bob',{columns:true}),[{id:'1',name:'Ada'},{id:'2',name:'Bob'}]));
test('empty input',()=>assert.deepEqual(parse(''),[]));
test('explicit quote escaping',()=>assert.equal(stringify([['a"b','c,d']]),'"a""b","c,d"\n'));
