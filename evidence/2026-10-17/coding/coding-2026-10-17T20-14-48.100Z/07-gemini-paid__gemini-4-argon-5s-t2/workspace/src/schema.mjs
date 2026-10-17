export const INVOICE_COLUMNS = Object.freeze([
  'vendor_id', 'invoice_id', 'issued_on', 'due_on', 'currency', 'amount', 'status', 'description',
]);
export const PAYMENT_COLUMNS = Object.freeze(['payment_id', 'vendor_id', 'invoice_id', 'paid_on', 'currency', 'amount']);
export const REQUIRED_INVOICE_COLUMNS = Object.freeze(['vendor_id', 'invoice_id', 'issued_on', 'currency', 'amount']);
export const REQUIRED_PAYMENT_COLUMNS = Object.freeze([...PAYMENT_COLUMNS]);
export const CURRENCIES = Object.freeze(['USD', 'EUR', 'GBP', 'CAD', 'AUD']);
export const STATUSES = Object.freeze(['open', 'paid', 'void']);
export const HEADER_ALIASES = Object.freeze({ vendor: 'vendor_id', supplier: 'vendor_id', invoice: 'invoice_id', invoice_date: 'issued_on', due_date: 'due_on', total: 'amount', notes: 'description' });

export function normalizeHeader(header) {
  const key = String(header).trim().toLowerCase().replace(/[ -]+/g, '_');
  return HEADER_ALIASES[key] ?? key;
}
export function inspectHeaders(headers, { type = 'invoice', rejectUnknown = true } = {}) {
  const allowed = type === 'payment' ? PAYMENT_COLUMNS : INVOICE_COLUMNS;
  const required = type === 'payment' ? REQUIRED_PAYMENT_COLUMNS : REQUIRED_INVOICE_COLUMNS;
  const normalized = headers.map(normalizeHeader);
  const errors = [];
  for (const name of required) if (!normalized.includes(name)) errors.push(`Missing required column: ${name}`);
  for (const name of new Set(normalized)) if (normalized.filter(value => value === name).length > 1) errors.push(`Columns normalize to the same name: ${name}`);
  if (rejectUnknown) for (const name of normalized) if (!allowed.includes(name)) errors.push(`Unknown column: ${name}`);
  return { normalized, errors };
}
export function projectColumns(values, headers) {
  if (values.length !== headers.length) throw new Error(`Expected ${headers.length} fields, received ${values.length}`);
  return Object.fromEntries(headers.map((name, i) => [name, values[i]]));
}
export function publicSchema(type = 'invoice') {
  const columns = type === 'payment' ? PAYMENT_COLUMNS : INVOICE_COLUMNS;
  const required = type === 'payment' ? REQUIRED_PAYMENT_COLUMNS : REQUIRED_INVOICE_COLUMNS;
  return columns.map(name => ({ name, required: required.includes(name), kind: name.endsWith('_on') ? 'date' : name === 'amount' ? 'decimal' : 'text' }));
}
