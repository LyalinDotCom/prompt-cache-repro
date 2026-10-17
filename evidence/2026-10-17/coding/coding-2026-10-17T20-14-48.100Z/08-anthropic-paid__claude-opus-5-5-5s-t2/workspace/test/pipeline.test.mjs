import test from 'node:test';
import assert from 'node:assert/strict';
import { importInvoices, importPayments, importAndReconcile } from '../src/pipeline.mjs';
import { reportJson, reportText, invoiceCsv, diagnosticsCsv, hasErrors } from '../src/reports.mjs';
import { parseCsv } from '../src/csv.mjs';
import { reconcilePayments, paymentSummary } from '../src/payments.mjs';
import { agingSummary, outstandingByVendor } from '../src/ledger.mjs';

const header='vendor_id,invoice_id,issued_on,due_on,currency,amount,status,description';
const csv=(rows,newline=true)=>header+'\n'+rows.join('\n')+(newline?'\n':'');
const simple=(vendor='acme',id='I-1',amount='10.00')=>`${vendor},${id},2026-01-01,2026-01-31,USD,${amount},open,Office supplies`;
const payments='payment_id,vendor_id,invoice_id,paid_on,currency,amount\n';

test('imports a valid invoice and builds stable public reports', () => {
  const result=importInvoices(csv([simple()]),{source:'feed.csv'});
  assert.equal(result.counts.accepted,1);assert.equal(result.totals[0].totalCents,1000);
  assert.equal(result.vendors[0].vendorId,'acme');assert.equal(result.months[0].month,'2026-01');
  const json=JSON.parse(reportJson(result));
  assert.equal(json.schema_version,1);assert.equal(json.invoices[0].amount,'10.00');
  assert.match(reportText(result),/accepted 1/);
  assert.equal(parseCsv(invoiceCsv(result.invoices))[1][0],'acme');
  assert.equal(hasErrors(result),false);
});
test('mixed supplier feed retains the EOF row, rounds cents, and scopes identities', () => {
  const result=importInvoices(csv([simple('vendor-a','INV-100','1.005'),simple('vendor-b','INV-100','10.075'),simple('vendor-a','CREDIT-1','-1.005'),simple('vendor-c','LAST','2.00')],false));
  assert.deepEqual(result.counts,{sourceRows:4,accepted:4,selected:4,rejected:0,duplicates:0,conflicts:0});
  assert.deepEqual(result.invoices.map(invoice=>invoice.amountCents),[101,1008,-101,200]);
  assert.equal(result.totals[0].totalCents,1208);assert.equal(result.vendors.length,3);
});
test('identical repeated rows do not double-count, but conflicting revisions are diagnosed', () => {
  const result=importInvoices(csv([simple(),simple(),simple('acme','I-1','20.00')]));
  assert.equal(result.counts.accepted,1);assert.equal(result.counts.duplicates,1);assert.equal(result.counts.conflicts,1);
  assert.equal(result.totals[0].totalCents,1000);assert.equal(hasErrors(result),true);
  assert.match(diagnosticsCsv(result.diagnostics),/conflict/);
});
test('all row validation errors survive while valid rows still import', () => {
  const result=importInvoices(csv([simple(),simple('bad','I-2','oops'),'broken,row']));
  assert.equal(result.counts.sourceRows,3);assert.equal(result.counts.accepted,1);assert.equal(result.counts.rejected,2);
  assert.ok(result.diagnostics.some(error=>error.field==='amountCents'));assert.ok(result.diagnostics.some(error=>error.kind==='shape'));
});
test('header failures stop import rather than inventing an empty ledger', () => {
  assert.throws(()=>importInvoices(''),/Empty invoice/);
  assert.throws(()=>importInvoices('vendor_id,amount\na,1.00\n'),/Missing required column/);
  assert.throws(()=>importInvoices(header+',surprise\n'),/Unknown column/);
});
test('alias columns and a semicolon feed use the same financial pipeline', () => {
  const result=importInvoices('supplier;invoice;invoice_date;currency;total\nacme;i-1;2026-01-01;usd;3.45\n',{delimiter:';'});
  assert.equal(result.invoices[0].invoiceId,'I-1');assert.equal(result.invoices[0].amountCents,345);
});
test('report selection runs after duplicate detection and does not conceal conflicts', () => {
  const result=importInvoices(csv([simple('a'),simple('b','B-1'),simple('a','I-1','11.00')]),{vendorId:'b'});
  assert.equal(result.counts.accepted,2);assert.equal(result.counts.selected,1);assert.equal(result.counts.conflicts,1);assert.equal(result.invoices[0].vendorId,'b');
});
test('partial payments and overpayments remain exact and visible', () => {
  const invoices=importInvoices(csv([simple('a','A','10.00'),simple('a','B','2.00')])).invoices;
  const paymentResult=importPayments(payments+'p1,a,A,2026-01-02,USD,4.00\np2,a,A,2026-01-03,USD,1.00\np3,a,B,2026-01-04,USD,3.00\n');
  const reconciled=reconcilePayments(invoices,paymentResult.payments);
  assert.equal(reconciled.applied.length,3);assert.deepEqual(reconciled.entries.map(entry=>entry.outstandingCents),[500,-100]);
  assert.equal(paymentSummary(reconciled)[0].outstandingCents,400);assert.equal(paymentSummary(reconciled)[0].overpaymentCents,100);
  assert.equal(outstandingByVendor(reconciled.entries)[0].outstandingCents,400);
});
test('same invoice number in different suppliers receives only its own payments', () => {
  const result=importAndReconcile(csv([simple('a','SHARED','10.00'),simple('b','SHARED','20.00')]),payments+'pa,a,SHARED,2026-01-02,USD,3.00\npb,b,SHARED,2026-01-02,USD,7.00\n',{asOf:'2026-02-01'});
  assert.equal(result.counts.conflicts,0);assert.equal(result.reconciliation.appliedCount,2);
  assert.deepEqual(result.reconciliation.outstandingByVendor,[{vendorId:'a',currency:'USD',outstandingCents:700},{vendorId:'b',currency:'USD',outstandingCents:1300}]);
});
test('unmatched, mismatched, and future payments are not silently allocated', () => {
  const paymentText=payments+'p1,a,missing,2026-01-02,USD,1.00\np2,a,I-1,2026-01-02,EUR,1.00\np3,a,I-1,2026-03-01,USD,1.00\n';
  const result=importAndReconcile(csv([simple('a','I-1')]),paymentText,{asOf:'2026-02-01'});
  assert.equal(result.reconciliation.appliedCount,0);assert.equal(result.reconciliation.unappliedCount,3);
  assert.deepEqual(result.reconciliation.unapplied.map(payment=>payment.reason),['unknown-invoice','currency-mismatch','after-as-of']);assert.equal(hasErrors(result),true);
});
test('paid and void invoice statuses cannot accidentally receive fresh payments', () => {
  const imported=importInvoices(csv([simple('a','PAID').replace(',open,',',paid,'),simple('a','VOID').replace(',open,',',void,')]));
  const importedPayments=importPayments(payments+'p1,a,PAID,2026-01-02,USD,1.00\np2,a,VOID,2026-01-02,USD,1.00\n');
  const result=reconcilePayments(imported.invoices,importedPayments.payments);
  assert.deepEqual(result.unapplied.map(item=>item.reason),['already-paid-status','void-invoice']);
  assert.equal(result.entries[0].outstandingCents,0);assert.equal(result.entries[1].outstandingCents,0);
});
test('aging excludes credits and paid balances and honors the requested as-of date', () => {
  const invoices=importInvoices(csv([simple('a','OPEN'),simple('a','CREDIT','-2.00'),simple('a','PAID').replace(',open,',',paid,')])).invoices;
  assert.deepEqual(agingSummary(reconcilePayments(invoices,[]).entries,'2026-03-01'),[{currency:'USD',bucket:'1-30',count:1,outstandingCents:1000}]);
});
