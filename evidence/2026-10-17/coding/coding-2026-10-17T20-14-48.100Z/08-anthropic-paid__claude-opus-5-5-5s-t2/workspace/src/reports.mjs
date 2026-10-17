import { formatMoney } from './money.mjs';
import { stringifyCsv } from './csv.mjs';

/** Public reports expose normalized values and their source row for audit. */
export function publicInvoice(invoice) {
  return { vendor_id: invoice.vendorId, invoice_id: invoice.invoiceId, issued_on: invoice.issuedOn,
    due_on: invoice.dueOn, currency: invoice.currency, amount: formatMoney(invoice.amountCents),
    status: invoice.status, description: invoice.description, source_row: invoice.sourceRow };
}
export function invoiceCsv(invoices) {
  const columns = ['vendor_id','invoice_id','issued_on','due_on','currency','amount','status','description','source_row'];
  return stringifyCsv([columns, ...invoices.map(invoice => { const row = publicInvoice(invoice); return columns.map(column => row[column]); })]);
}
export function reportJson(result, { pretty = true } = {}) {
  return JSON.stringify({ schema_version: 1, source: result.source, counts: result.counts,
    totals: result.totals, vendors: result.vendors, months: result.months, diagnostics: result.diagnostics,
    invoices: result.invoices.map(publicInvoice), reconciliation: result.reconciliation,
  }, null, pretty ? 2 : undefined) + '\n';
}
function pad(value, width, right = false) {
  const text = String(value);
  return right ? text.padStart(width) : text.padEnd(width);
}
export function reportText(result) {
  const lines = [`Ledger import: ${result.source}`, `Read ${result.counts.sourceRows} rows; accepted ${result.counts.accepted}; rejected ${result.counts.rejected}; duplicate ${result.counts.duplicates}; conflict ${result.counts.conflicts}.`, ''];
  lines.push(`${pad('Currency', 10)}${pad('Invoices', 10, true)}${pad('Total', 16, true)}${pad('Open', 16, true)}${pad('Paid', 16, true)}`);
  for (const total of result.totals) lines.push(`${pad(total.currency, 10)}${pad(total.invoiceCount, 10, true)}${pad(formatMoney(total.totalCents), 16, true)}${pad(formatMoney(total.openCents), 16, true)}${pad(formatMoney(total.paidCents), 16, true)}`);
  if (result.diagnostics.length) {
    lines.push('', 'Diagnostics:');
    for (const diagnostic of result.diagnostics) lines.push(`- row ${diagnostic.sourceRow ?? '?'}: ${diagnostic.message}`);
  }
  if (result.reconciliation) {
    lines.push('', `Payments: ${result.reconciliation.appliedCount} applied, ${result.reconciliation.unappliedCount} unapplied.`);
    for (const total of result.reconciliation.totals) lines.push(`${total.currency}: outstanding ${formatMoney(total.outstandingCents)}, overpayment ${formatMoney(total.overpaymentCents)}`);
  }
  return lines.join('\n') + '\n';
}
export function diagnosticsCsv(diagnostics) {
  return stringifyCsv([['kind','source_row','field','message'], ...diagnostics.map(item => [item.kind, item.sourceRow, item.field ?? '', item.message])]);
}
export function hasErrors(result) { return result.counts.rejected > 0 || result.counts.conflicts > 0 || Boolean(result.reconciliation?.unappliedCount); }
export function renderReport(result, format = 'text') {
  if (format === 'json') return reportJson(result);
  if (format === 'csv') return invoiceCsv(result.invoices);
  if (format === 'text') return reportText(result);
  throw new Error('Report format must be json, csv, or text');
}
