import { addCents, subtractCents } from './money.mjs';
import { indexInvoices, invoiceKey } from './dedupe.mjs';

/**
 * Payments are never implicitly converted between currencies. Every allocation
 * names the invoice and supplier explicitly. Unknown invoices and overpayments
 * stay visible in the reconciliation result for a human to investigate.
 */
export function reconcilePayments(invoices, payments, { asOf = null } = {}) {
  const index = indexInvoices(invoices);
  const balances = new Map(invoices.map(invoice => [invoiceKey(invoice), {
    invoice,
    originalCents: invoice.status === 'void' ? 0 : invoice.amountCents,
    paidCents: invoice.status === 'paid' ? invoice.amountCents : 0,
    paymentIds: [],
  }]));
  const applied = [];
  const unapplied = [];
  for (const payment of [...payments].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.sourceRow - b.sourceRow)) {
    const key = invoiceKey(payment);
    const invoice = index.get(key);
    let reason = null;
    if (asOf && payment.paidOn > asOf) reason = 'after-as-of';
    else if (!invoice) reason = 'unknown-invoice';
    else if (invoice.currency !== payment.currency) reason = 'currency-mismatch';
    else if (invoice.status === 'void') reason = 'void-invoice';
    else if (invoice.status === 'paid') reason = 'already-paid-status';
    else if (invoice.amountCents <= 0) reason = 'credit-invoice';
    if (reason) { unapplied.push({ payment, reason }); continue; }
    const balance = balances.get(key);
    balance.paidCents = addCents(balance.paidCents, payment.amountCents);
    balance.paymentIds.push(payment.paymentId);
    applied.push({ paymentId: payment.paymentId, vendorId: payment.vendorId, invoiceId: payment.invoiceId, amountCents: payment.amountCents });
  }
  const entries = [...balances.values()].map(balance => ({
    ...balance,
    outstandingCents: subtractCents(balance.originalCents, balance.paidCents),
    overpaymentCents: Math.max(0, balance.paidCents - Math.max(0, balance.originalCents)),
  }));
  return { entries, applied, unapplied };
}

export function paymentSummary(reconciliation) {
  const totals = new Map();
  for (const entry of reconciliation.entries) {
    const currency = entry.invoice.currency;
    const value = totals.get(currency) ?? { currency, invoicedCents: 0, paidCents: 0, outstandingCents: 0, overpaymentCents: 0 };
    value.invoicedCents = addCents(value.invoicedCents, entry.originalCents);
    value.paidCents = addCents(value.paidCents, entry.paidCents);
    value.outstandingCents = addCents(value.outstandingCents, entry.outstandingCents);
    value.overpaymentCents = addCents(value.overpaymentCents, entry.overpaymentCents);
    totals.set(currency, value);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
