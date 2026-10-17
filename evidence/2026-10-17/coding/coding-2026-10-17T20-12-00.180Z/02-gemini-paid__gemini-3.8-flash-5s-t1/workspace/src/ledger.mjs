import { addCents, sumMoneyBy } from './money.mjs';
import { agingBucket, inDateRange, monthOf, parseDate, validatePeriod } from './dates.mjs';
import { groupByVendor } from './dedupe.mjs';

/** Reporting filters do not mutate the imported source ledger. */
export function selectInvoices(invoices, { vendorId = null, currency = null, from = null, to = null, includeVoid = false } = {}) {
  validatePeriod(from, to);
  return invoices.filter(invoice =>
    (!vendorId || invoice.vendorId === vendorId) &&
    (!currency || invoice.currency === currency) &&
    (includeVoid || invoice.status !== 'void') &&
    inDateRange(invoice.issuedOn, from, to));
}

export function summarizeInvoices(invoices) {
  const currencies = new Map();
  for (const invoice of invoices) {
    const total = currencies.get(invoice.currency) ?? {
      currency: invoice.currency, invoiceCount: 0, totalCents: 0, openCents: 0,
      paidCents: 0, creditCents: 0, voidCount: 0,
    };
    total.invoiceCount++;
    if (invoice.status === 'void') { total.voidCount++; currencies.set(invoice.currency, total); continue; }
    total.totalCents = addCents(total.totalCents, invoice.amountCents);
    if (invoice.amountCents < 0) total.creditCents = addCents(total.creditCents, invoice.amountCents);
    if (invoice.status === 'paid') total.paidCents = addCents(total.paidCents, invoice.amountCents);
    else total.openCents = addCents(total.openCents, invoice.amountCents);
    currencies.set(invoice.currency, total);
  }
  return [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function vendorSummary(invoices) {
  return [...groupByVendor(invoices)].sort(([a], [b]) => a.localeCompare(b)).map(([vendorId, group]) => ({
    vendorId, invoiceCount: group.length, currencies: summarizeInvoices(group),
    earliestIssue: group.reduce((min, invoice) => invoice.issuedOn < min ? invoice.issuedOn : min, group[0].issuedOn),
    latestIssue: group.reduce((max, invoice) => invoice.issuedOn > max ? invoice.issuedOn : max, group[0].issuedOn),
  }));
}

export function monthlySummary(invoices) {
  const groups = new Map();
  for (const invoice of invoices) {
    const month = monthOf(invoice.issuedOn);
    const group = groups.get(month) ?? [];
    group.push(invoice);
    groups.set(month, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([month, group]) => ({ month, currencies: summarizeInvoices(group) }));
}

export function agingSummary(entries, asOf) {
  parseDate(asOf, 'asOf');
  const totals = new Map();
  for (const entry of entries) {
    if (entry.outstandingCents <= 0 || entry.invoice.status === 'void') continue;
    const bucket = agingBucket(entry.invoice.dueOn, asOf);
    const key = JSON.stringify([entry.invoice.currency, bucket]);
    const group = totals.get(key) ?? { currency: entry.invoice.currency, bucket, count: 0, outstandingCents: 0 };
    group.count++;
    group.outstandingCents = addCents(group.outstandingCents, entry.outstandingCents);
    totals.set(key, group);
  }
  const bucketOrder = ['current', '1-30', '31-60', '61-90', '90+'];
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency) || bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket));
}

export function outstandingByVendor(entries) {
  return sumMoneyBy(entries, entry => JSON.stringify([entry.invoice.vendorId, entry.invoice.currency]), entry => entry.outstandingCents)
    .map(({ key, cents }) => { const [vendorId, currency] = JSON.parse(key); return { vendorId, currency, outstandingCents: cents }; });
}
