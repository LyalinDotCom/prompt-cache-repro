import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, stringifyCsv, quoteCsvField, csvObjects, CsvError } from '../src/csv.mjs';

test('reads comma-delimited records and preserves empty fields', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,3\n'), [['a','b','c'],['1','','3']]);
});
test('accepts all common unquoted record separators', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r3,4\n'), [['a','b'],['1','2'],['3','4']]);
});
test('preserves commas, escaped quotes, and newlines inside quoted values', () => {
  const text='id,note\n1,"one, two"\n2,"say ""hello"""\n3,"line one\nline two"\n';
  assert.deepEqual(parseCsv(text), [['id','note'],['1','one, two'],['2','say "hello"'],['3','line one\nline two']]);
});
test('accepts a UTF-8 BOM and custom delimiter', () => {
  assert.deepEqual(parseCsv('\uFEFFname;amount\nAda;12.00\n',{delimiter:';'}), [['name','amount'],['Ada','12.00']]);
});
test('CSV EOF is a valid record boundary, including a trailing empty field', () => {
  assert.deepEqual(parseCsv('id,amount,note\n42,12.00,'), [['id','amount','note'],['42','12.00','']]);
  assert.deepEqual(parseCsv('name\n"last quoted value"'), [['name'],['last quoted value']]);
  assert.deepEqual(parseCsv('single'), [['single']]);
  assert.deepEqual(parseCsv('""'), [['']]);
});
test('an existing final newline does not create a phantom record', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a','b'],['1','2']]);
  assert.deepEqual(parseCsv(''), []);
});
test('malformed quoting fails with a useful source position', () => {
  assert.throws(()=>parseCsv('a\n"unterminated'), CsvError);
  assert.throws(()=>parseCsv('a\nx"y\n'), /Quote inside an unquoted field/);
  assert.throws(()=>parseCsv('a\n"x"q\n'), /Unexpected character after closing quote/);
});
test('record limits and delimiter validation are enforced', () => {
  assert.throws(()=>parseCsv('a\nb\n',{maxRecords:1}), /record limit/);
  assert.throws(()=>parseCsv('x',{delimiter:'||'}), /Delimiter/);
  assert.throws(()=>parseCsv('x',{maxRecords:0}), /record limit/);
});
test('writer round trips arbitrary accounting descriptions', () => {
  const records=[['id','description'],['1','Office, east'],['2','Includes "rush" fee'],['3','first\nsecond'],['4','']];
  assert.deepEqual(parseCsv(stringifyCsv(records)),records);
  assert.equal(quoteCsvField(null),'');
  assert.equal(stringifyCsv([]),'');
  assert.match(stringifyCsv([['x']],{newline:'\r\n'}), /\r\n$/);
});
test('object projection reports ragged rows without truncating values', () => {
  const result=csvObjects([[' id ','amount'],['1','2.00'],['2'],['3','4.00','extra']]);
  assert.deepEqual(result.headers,['id','amount']);
  assert.deepEqual(result.rows[0].value,{id:'1',amount:'2.00'});
  assert.equal(result.rows[1].sourceRow,3);
  assert.match(result.rows[2].error,/received 3/);
  assert.throws(()=>csvObjects([['x','x']]),/Duplicate/);
});
