import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, agingBucket, daysBetween, parseDate, validatePeriod } from '../src/dates.mjs';
import { inspectHeaders, publicSchema } from '../src/schema.mjs';
import { validateInvoice, validatePayment } from '../src/validation.mjs';
import { deduplicateInvoices, deduplicatePayments, invoiceKey } from '../src/dedupe.mjs';
import { selectInvoices, summarizeInvoices, monthlySummary } from '../src/ledger.mjs';

const row={vendor_id:'acme',invoice_id:' inv-1 ',issued_on:'2026-01-01',currency:'usd',amount:'10.00'};
const invoice=(patch={})=>({...validateInvoice(row,2).invoice,...patch});
test('date-only arithmetic handles leap years and timezone boundaries', () => {
  assert.equal(addDays('2024-02-28',1),'2024-02-29');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
  assert.equal(daysBetween('2026-03-08','2026-03-09'),1);
  for(const text of ['2025-02-29','2026-13-01','2026-04-31','01/01/2026'])assert.throws(()=>parseDate(text));
  assert.throws(()=>validatePeriod('2026-02-01','2026-01-01'),/must not follow/);
});
test('aging buckets use due date, with the due day still current', () => {
  assert.equal(agingBucket('2026-01-01','2026-01-01'),'current');
  assert.equal(agingBucket('2026-01-01','2026-01-31'),'1-30');
  assert.equal(agingBucket('2026-01-01','2026-02-01'),'31-60');
  assert.equal(agingBucket('2026-01-01','2026-05-01'),'90+');
});
test('header aliases normalize once and ambiguous columns are rejected', () => {
  assert.deepEqual(inspectHeaders(['Supplier','Invoice','Invoice Date','Currency','Total']).errors,[]);
  assert.match(inspectHeaders(['vendor','vendor_id']).errors.join(' '),/same name/);
  assert.match(inspectHeaders(['nonsense']).errors.join(' '),/Unknown column/);
  assert.equal(publicSchema().find(c=>c.name==='due_on').required,false);
});
test('invoice validation supplies explicit defaults and collects independent errors', () => {
  const good=validateInvoice(row,2);
  assert.equal(good.invoice.invoiceId,'INV-1');
  assert.equal(good.invoice.dueOn,'2026-01-31');
  assert.equal(good.invoice.currency,'USD');
  assert.equal(good.invoice.status,'open');
  assert.ok(Object.isFrozen(good.invoice));
  const bad=validateInvoice({...row,vendor_id:'',currency:'XYZ',amount:'oops',due_on:'2025-01-01'},8);
  assert.equal(bad.invoice,null);assert.equal(bad.sourceRow,8);assert.equal(bad.errors.length,4);
});
test('payments require positive amounts and valid external identities', () => {
  const base={payment_id:'p1',vendor_id:'acme',invoice_id:'inv-1',paid_on:'2026-01-02',currency:'USD',amount:'1.00'};
  assert.equal(validatePayment(base,2).payment.amountCents,100);
  assert.equal(validatePayment({...base,amount:'0'},2).payment,null);
  assert.equal(validatePayment({...base,payment_id:'\u0000'},2).payment,null);
});
test('invoice identity includes vendor and keeps the same invoice number in two suppliers', () => {
  const a=invoice({vendorId:'vendor-a',invoiceId:'INV-100',sourceRow:2});
  const b=invoice({vendorId:'vendor-b',invoiceId:'INV-100',amountCents:2000,sourceRow:3});
  const result=deduplicateInvoices([a,b]);
  assert.equal(result.accepted.length,2);assert.equal(result.conflicts.length,0);
  assert.notEqual(invoiceKey(a),invoiceKey(b));
  assert.notEqual(invoiceKey({...a,vendorId:'a:b',invoiceId:'c'}),invoiceKey({...a,vendorId:'a',invoiceId:'b:c'}));
});
test('same-vendor duplicate rows collapse and conflicting values remain auditable', () => {
  const first=invoice(), repeated=invoice({sourceRow:3}), changed=invoice({amountCents:2000,sourceRow:4});
  const result=deduplicateInvoices([first,repeated,changed]);
  assert.deepEqual(result.accepted,[first]);assert.equal(result.duplicates.length,1);
  assert.equal(result.conflicts[0].firstSourceRow,2);assert.equal(result.conflicts[0].sourceRow,4);
});
test('payment IDs are likewise scoped to vendor, with exact duplicates collapsed', () => {
  const a={vendorId:'a',paymentId:'p1',invoiceId:'i1',paidOn:'2026-01-01',currency:'USD',amountCents:1,sourceRow:2};
  const b={...a,vendorId:'b',sourceRow:3};
  const result=deduplicatePayments([a,b,{...a,sourceRow:4}]);
  assert.equal(result.accepted.length,2);assert.equal(result.duplicates.length,1);
});
test('filtering does not change source order or mutate immutable imported rows', () => {
  const list=[invoice(),invoice({vendorId:'b',currency:'EUR',issuedOn:'2026-02-01'}),invoice({status:'void'})];
  assert.equal(selectInvoices(list,{vendorId:'acme'}).length,1);
  assert.equal(selectInvoices(list,{from:'2026-02-01'}).length,1);
  assert.equal(list.length,3);
});
test('summary splits currencies and excludes void financial totals', () => {
  const list=[invoice(),invoice({amountCents:-50}),invoice({currency:'EUR',amountCents:200}),invoice({status:'void'}),invoice({status:'paid',amountCents:300})];
  const usd=summarizeInvoices(list).find(total=>total.currency==='USD');
  assert.deepEqual(usd,{currency:'USD',invoiceCount:4,totalCents:1250,openCents:950,paidCents:300,creditCents:-50,voidCount:1});
  assert.deepEqual(monthlySummary(list).map(item=>item.month),['2026-01']);
});
