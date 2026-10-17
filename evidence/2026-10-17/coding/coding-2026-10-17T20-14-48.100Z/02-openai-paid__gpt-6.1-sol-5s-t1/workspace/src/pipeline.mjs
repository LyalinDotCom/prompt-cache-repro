import { parseCsv } from './csv.mjs';
import { inspectHeaders, projectColumns } from './schema.mjs';
import { validateInvoice, validatePayment, flattenValidationErrors } from './validation.mjs';
import { deduplicateInvoices, deduplicatePayments } from './dedupe.mjs';
import { monthlySummary, selectInvoices, summarizeInvoices, vendorSummary, agingSummary, outstandingByVendor } from './ledger.mjs';
import { paymentSummary, reconcilePayments } from './payments.mjs';

/** Parse and validate complete files before applying accounting or report filters. */
function readRows(text, type, options) {
  const records = parseCsv(text, { delimiter: options.delimiter ?? ',', maxRecords: options.maxRecords ?? 100_000 });
  if (!records.length) throw new Error(`Empty ${type} CSV`);
  const { normalized, errors } = inspectHeaders(records[0], { type, rejectUnknown: options.rejectUnknown ?? true });
  if (errors.length) throw new Error(errors.join('; '));
  const good = [];
  const diagnostics = [];
  let sourceRows = 0;
  records.slice(1).forEach((values, index) => {
    if (values.every(value => value.trim() === '')) return;
    sourceRows++;
    const sourceRow = index + 2;
    try {
      const raw = projectColumns(values, normalized);
      const validation = type === 'invoice' ? validateInvoice(raw, sourceRow) : validatePayment(raw, sourceRow);
      const value = type === 'invoice' ? validation.invoice : validation.payment;
      if (value) good.push(value);
      else diagnostics.push(...flattenValidationErrors([validation]).map(error => ({ kind: 'validation', ...error })));
    } catch (error) { diagnostics.push({ kind: 'shape', sourceRow, message: error.message }); }
  });
  return { good, diagnostics, sourceRows };
}

export function importInvoices(text, options = {}) {
  const parsed = readRows(text, 'invoice', options);
  const deduped = deduplicateInvoices(parsed.good);
  const diagnostics = [...parsed.diagnostics, ...deduped.conflicts.map(conflict => ({ ...conflict, kind: 'conflict' }))];
  const invoices = selectInvoices(deduped.accepted, { ...options, includeVoid: options.includeVoid ?? true });
  const rejectedRows = new Set(parsed.diagnostics.map(error => error.sourceRow));
  return {
    source: options.source ?? '(memory)', invoices,
    counts: { sourceRows: parsed.sourceRows, accepted: deduped.accepted.length, selected: invoices.length,
      rejected: rejectedRows.size, duplicates: deduped.duplicates.length, conflicts: deduped.conflicts.length },
    totals: summarizeInvoices(invoices), vendors: vendorSummary(invoices), months: monthlySummary(invoices),
    diagnostics, duplicates: deduped.duplicates, reconciliation: null,
  };
}

export function importPayments(text, options = {}) {
  const parsed = readRows(text, 'payment', options);
  const deduped = deduplicatePayments(parsed.good);
  return { payments: deduped.accepted, duplicates: deduped.duplicates,
    diagnostics: [...parsed.diagnostics, ...deduped.conflicts.map(conflict => ({ ...conflict, kind: 'payment-conflict' }))],
    sourceRows: parsed.sourceRows };
}

export function importAndReconcile(invoiceText, paymentText, options = {}) {
  const imported = importInvoices(invoiceText, options);
  const paymentImport = importPayments(paymentText, options);
  const reconciliation = reconcilePayments(imported.invoices, paymentImport.payments, { asOf: options.asOf ?? null });
  imported.diagnostics.push(...paymentImport.diagnostics,
    ...reconciliation.unapplied.map(item => ({ kind: 'unapplied-payment', sourceRow: item.payment.sourceRow, message: `Payment ${item.payment.paymentId}: ${item.reason}` })));
  imported.reconciliation = {
    appliedCount: reconciliation.applied.length, unappliedCount: reconciliation.unapplied.length,
    totals: paymentSummary(reconciliation), outstandingByVendor: outstandingByVendor(reconciliation.entries),
    aging: options.asOf ? agingSummary(reconciliation.entries, options.asOf) : null,
    unapplied: reconciliation.unapplied.map(item => ({ paymentId: item.payment.paymentId, vendorId: item.payment.vendorId, reason: item.reason })),
  };
  return imported;
}
