/** Date-only accounting uses UTC calendar arithmetic, never the local timezone. */
export function parseDate(value, field = 'date') {
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`${field} must use YYYY-MM-DD`);
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1900 || year > 2199) throw new Error(`${field} is outside the supported year range`);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`${field} is not a real calendar date`);
  return text;
}

export function dayNumber(value) { return Date.parse(`${parseDate(value)}T00:00:00.000Z`) / 86_400_000; }
export function daysBetween(from, to) { return dayNumber(to) - dayNumber(from); }
export function addDays(value, days) {
  if (!Number.isSafeInteger(days)) throw new TypeError('Day offset must be an integer');
  const date = new Date((dayNumber(value) + days) * 86_400_000);
  return date.toISOString().slice(0, 10);
}
export function monthOf(value) { return parseDate(value).slice(0, 7); }
export function inDateRange(value, from = null, to = null) {
  const date = parseDate(value);
  return (!from || date >= parseDate(from)) && (!to || date <= parseDate(to));
}
export function agingBucket(dueDate, asOf) {
  const lateDays = daysBetween(dueDate, asOf);
  if (lateDays <= 0) return 'current';
  if (lateDays <= 30) return '1-30';
  if (lateDays <= 60) return '31-60';
  if (lateDays <= 90) return '61-90';
  return '90+';
}
export function compareDates(left, right) { return parseDate(left).localeCompare(parseDate(right)); }
export function validatePeriod(from, to) {
  if (from) parseDate(from, 'from');
  if (to) parseDate(to, 'to');
  if (from && to && from > to) throw new Error('Period start must not follow its end');
  return { from: from || null, to: to || null };
}
