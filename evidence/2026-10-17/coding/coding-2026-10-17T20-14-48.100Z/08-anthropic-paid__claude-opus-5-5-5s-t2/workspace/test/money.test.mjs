import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney, addCents, subtractCents, allocateCents, applyBasisPoints, sumMoneyBy } from '../src/money.mjs';

test('ordinary decimal amounts normalize to integer cents', () => {
  for(const [text,cents] of [['0',0],['12',1200],['12.3',1230],['+12.34',1234],['-12.34',-1234],[' 003.40 ',340]]) assert.equal(parseMoney(text),cents,text);
  assert.equal(formatMoney(0),'0.00');
  assert.equal(formatMoney(-1234),'-12.34');
  assert.equal(formatMoney(7,{currency:'GBP',withCurrency:true}),'GBP 0.07');
});
test('rounding at a half cent is decimal and symmetric for credits', () => {
  const cases=[['1.005',101],['-1.005',-101],['10.075',1008],['-10.075',-1008],['0.0049',0],['-0.0050',-1],['2.675',268],['2.6749',267],['99.9999',10000]];
  for(const [text,cents] of cases) assert.equal(parseMoney(text),cents,`wrong rounding for ${text}`);
});
test('unsafe and ambiguous money formats are rejected', () => {
  for(const value of ['1e3','1,000.00','NaN','Infinity','1.00001','','.5','12.','--1','9007199254740992']) assert.throws(()=>parseMoney(value),undefined,String(value));
  assert.throws(()=>formatMoney(1.5),/integer cents/);
  assert.throws(()=>addCents(Number.MAX_SAFE_INTEGER,1),/safe integer/);
});
test('totals and subtraction preserve sign and exact cents', () => {
  assert.equal(addCents(101,-1,900),1000);
  assert.equal(subtractCents(1000,1001),-1);
  assert.equal(addCents(),0);
});
test('allocation preserves total, sign, and deterministic tie order', () => {
  assert.deepEqual(allocateCents(10,[1,1,1]),[4,3,3]);
  assert.deepEqual(allocateCents(-10,[1,1,1]),[-4,-3,-3]);
  assert.deepEqual(allocateCents(101,[0,3,1]),[0,76,25]);
  assert.throws(()=>allocateCents(10,[0,0]),/positive/);
  assert.throws(()=>allocateCents(10,[-1,2]),/nonnegative/);
});
test('basis-point calculation rounds halves away from zero', () => {
  assert.equal(applyBasisPoints(100,1250),13);
  assert.equal(applyBasisPoints(-100,1250),-13);
  assert.equal(applyBasisPoints(100,0),0);
  assert.throws(()=>applyBasisPoints(100,1.5),/integers/);
});
test('grouped monetary sums do not merge keys or lose minor units', () => {
  const result=sumMoneyBy([{k:'USD',v:100},{k:'EUR',v:2},{k:'USD',v:-1}],x=>x.k,x=>x.v);
  assert.deepEqual(result,[{key:'EUR',cents:2},{key:'USD',cents:99}]);
});
