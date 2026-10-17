/** Money stays in integer minor units once it enters the ledger. */
export class MoneyError extends Error {
  constructor(message) { super(message); this.name = 'MoneyError'; }
}

/**
 * Parse signed decimal major units into cents. Vendor feeds may contain up to
 * four fractional digits. The business rule is round half away from zero at
 * the cent boundary (1.005 => 101; -1.005 => -101), not bankers' rounding.
 * Group separators and scientific notation are deliberately unsupported.
 */
export function parseMoney(value) {
  const text = String(value).trim();
  if (!/^[+-]?\d+(?:\.\d{1,4})?$/.test(text)) throw new MoneyError('Expected a decimal amount with at most four fractional digits');
  const [, sign, whole, frac = ''] = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  // Exact decimal arithmetic in ten-thousandths, then round half away from zero.
  const units = BigInt(whole) * 10000n + BigInt(frac.padEnd(4, '0'));
  const magnitude = (units + 50n) / 100n;
  if (magnitude > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyError('Amount exceeds safe integer range');
  const cents = (sign === '-' ? -1 : 1) * Number(magnitude);
  if (!Number.isSafeInteger(cents)) throw new MoneyError('Amount exceeds safe integer range');
  return Object.is(cents, -0) ? 0 : cents;
}

export function assertCents(value) {
  if (!Number.isSafeInteger(value)) throw new MoneyError('Money must be integer cents');
  return value;
}

export function addCents(...values) {
  return values.reduce((sum, value) => {
    assertCents(value);
    const next = sum + value;
    if (!Number.isSafeInteger(next)) throw new MoneyError('Money total exceeds safe integer range');
    return next;
  }, 0);
}

export function subtractCents(left, right) { return addCents(left, -assertCents(right)); }

export function formatMoney(cents, { currency = 'USD', withCurrency = false } = {}) {
  assertCents(cents);
  const sign = cents < 0 ? '-' : '';
  const magnitude = Math.abs(cents);
  const decimal = `${sign}${Math.floor(magnitude / 100)}.${String(magnitude % 100).padStart(2, '0')}`;
  return withCurrency ? `${currency} ${decimal}` : decimal;
}

/** Largest-remainder allocation preserves the exact total and stable tie order. */
export function allocateCents(cents, weights) {
  assertCents(cents);
  if (!Array.isArray(weights) || !weights.length || weights.some(w => !Number.isSafeInteger(w) || w < 0)) {
    throw new MoneyError('Allocation weights must be nonnegative integers');
  }
  const weightTotal = weights.reduce((sum, weight) => sum + BigInt(weight), 0n);
  if (weightTotal === 0n) throw new MoneyError('Allocation needs a positive total weight');
  const magnitude = BigInt(Math.abs(cents));
  const parts = weights.map((weight, index) => ({ index, base: magnitude * BigInt(weight) / weightTotal, remainder: magnitude * BigInt(weight) % weightTotal }));
  let left = magnitude - parts.reduce((sum, part) => sum + part.base, 0n);
  const order = [...parts].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const part of order) { if (left === 0n) break; part.base++; left--; }
  const sign = cents < 0 ? -1 : 1;
  return parts.map(part => sign * Number(part.base));
}

/** Integer basis points avoid floating-point percentage drift. */
export function applyBasisPoints(cents, basisPoints) {
  assertCents(cents);
  if (!Number.isSafeInteger(basisPoints)) throw new MoneyError('Basis points must be integers');
  const product = BigInt(cents) * BigInt(basisPoints);
  const sign = product < 0n ? -1n : 1n;
  const magnitude = product < 0n ? -product : product;
  const rounded = sign * ((magnitude + 5000n) / 10000n);
  const result = Number(rounded);
  return assertCents(result);
}

export function sumMoneyBy(items, selectKey, selectCents) {
  const totals = new Map();
  for (const item of items) {
    const key = selectKey(item);
    totals.set(key, addCents(totals.get(key) ?? 0, selectCents(item)));
  }
  return [...totals].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([key, cents]) => ({ key, cents }));
}
