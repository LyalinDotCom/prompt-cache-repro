import { parseMoney } from './money.mjs';
import { addDays, parseDate } from './dates.mjs';
import { CURRENCIES, STATUSES } from './schema.mjs';

export function identifier(value, field) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 80 || /[\x00-\x1f\x7f]/.test(text)) throw new Error(`${field} must be 1-80 printable characters`);
  return text;
}
export function normalizeInvoiceId(value) {
  // Supplier invoice identifiers are case-insensitive; vendor identifiers are not.
  return identifier(value, 'invoice_id').toUpperCase();
}
export function currencyCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  if (!CURRENCIES.includes(code)) throw new Error(`Unsupported currency: ${code || '(empty)'}`);
  return code;
}
function get(row, key, fallback = '') { return row[key] === undefined || row[key] === '' ? fallback : row[key]; }

/** One invalid row is reported without dropping valid peers from the import. */
export function validateInvoice(row, sourceRow) {
  const errors = [];
  const result = { sourceRow };
  const attempt = (name, operation) => { try { result[name] = operation(); } catch (error) { errors.push({ field: name, message: error.message }); } };
  attempt('vendorId', () => identifier(row.vendor_id, 'vendor_id'));
  attempt('invoiceId', () => normalizeInvoiceId(row.invoice_id));
  attempt('issuedOn', () => parseDate(row.issued_on, 'issued_on'));
  attempt('dueOn', () => get(row, 'due_on') ? parseDate(row.due_on, 'due_on') : addDays(parseDate(row.issued_on), 30));
  attempt('currency', () => currencyCode(row.currency));
  attempt('amountCents', () => parseMoney(row.amount));
  attempt('status', () => {
    const status = String(get(row, 'status', 'open')).trim().toLowerCase();
    if (!STATUSES.includes(status)) throw new Error('status must be open, paid, or void');
    return status;
  });
  attempt('description', () => {
    const description = String(get(row, 'description')).trim();
    if (description.length > 1000 || /[\x00\x7f]/.test(description)) throw new Error('description is too long or contains control characters');
    return description;
  });
  if (result.issuedOn && result.dueOn && result.dueOn < result.issuedOn) errors.push({ field: 'dueOn', message: 'due_on precedes issued_on' });
  return errors.length ? { sourceRow, invoice: null, errors } : { sourceRow, invoice: Object.freeze(result), errors: [] };
}

export function validatePayment(row, sourceRow) {
  const errors = [];
  const result = { sourceRow };
  for (const [field, action] of [
    ['paymentId', () => identifier(row.payment_id, 'payment_id')],
    ['vendorId', () => identifier(row.vendor_id, 'vendor_id')],
    ['invoiceId', () => normalizeInvoiceId(row.invoice_id)],
    ['paidOn', () => parseDate(row.paid_on, 'paid_on')],
    ['currency', () => currencyCode(row.currency)],
    ['amountCents', () => { const cents = parseMoney(row.amount); if (cents <= 0) throw new Error('Payment amount must be positive'); return cents; }],
  ]) {
    try { result[field] = action(); } catch (error) { errors.push({ field, message: error.message }); }
  }
  return errors.length ? { sourceRow, payment: null, errors } : { sourceRow, payment: Object.freeze(result), errors: [] };
}

export function flattenValidationErrors(validations) {
  return validations.flatMap(row => row.errors.map(error => ({ sourceRow: row.sourceRow, ...error })));
}
export function describeErrors(errors) { return errors.map(error => `row ${error.sourceRow} / ${error.field}: ${error.message}`).join('\n'); }
