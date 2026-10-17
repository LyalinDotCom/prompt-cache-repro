/**
 * Import identity is local to a supplier. The same invoice number can appear in
 * unrelated suppliers' books. Case normalization occurs before this layer.
 *
 * A repeated identical row is harmless and collapses into its first occurrence.
 * A repeated identity with different financial fields is a conflict: retain the
 * first row and issue a diagnostic rather than silently choosing a winner.
 */
export function invoiceKey(invoice) {
  return JSON.stringify([invoice.vendorId, invoice.invoiceId]);
}
export function paymentKey(payment) { return JSON.stringify([payment.vendorId, payment.paymentId]); }
export function invoiceFingerprint(invoice) {
  return JSON.stringify([invoice.vendorId, invoice.invoiceId, invoice.issuedOn, invoice.dueOn, invoice.currency, invoice.amountCents, invoice.status]);
}
export function paymentFingerprint(payment) {
  return JSON.stringify([payment.vendorId, payment.paymentId, payment.invoiceId, payment.paidOn, payment.currency, payment.amountCents]);
}

export function deduplicate(items, { key, fingerprint, kind }) {
  const first = new Map();
  const accepted = [];
  const duplicates = [];
  const conflicts = [];
  for (const item of items) {
    const identity = key(item);
    const existing = first.get(identity);
    if (!existing) {
      first.set(identity, item);
      accepted.push(item);
      continue;
    }
    const diagnostic = { kind, identity, sourceRow: item.sourceRow, firstSourceRow: existing.sourceRow };
    if (fingerprint(existing) === fingerprint(item)) duplicates.push(diagnostic);
    else conflicts.push({ ...diagnostic, message: `Conflicting ${kind} identity; first occurrence retained` });
  }
  return { accepted, duplicates, conflicts };
}
export function deduplicateInvoices(invoices) {
  return deduplicate(invoices, { key: invoiceKey, fingerprint: invoiceFingerprint, kind: 'invoice' });
}
export function deduplicatePayments(payments) {
  return deduplicate(payments, { key: paymentKey, fingerprint: paymentFingerprint, kind: 'payment' });
}
export function indexInvoices(invoices) {
  const index = new Map();
  for (const invoice of invoices) {
    const key = invoiceKey(invoice);
    if (index.has(key)) throw new Error('Cannot index unresolved duplicate invoices');
    index.set(key, invoice);
  }
  return index;
}
export function groupByVendor(items) {
  const groups = new Map();
  for (const item of items) {
    const group = groups.get(item.vendorId) ?? [];
    group.push(item);
    groups.set(item.vendorId, group);
  }
  return groups;
}
