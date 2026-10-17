/**
 * A small RFC-4180-style reader. A record is an array of strings; callers choose
 * how to interpret headers and values. The scanner is intentionally separate
 * from accounting so imported evidence can be retained without normalization.
 *
 * Rules: commas separate fields outside quotes, doubled quotes represent one
 * quote inside a quoted field, and CRLF/LF/CR terminate unquoted records. Quoted
 * newlines are preserved. A UTF-8 BOM is accepted at the start of a document.
 */
export class CsvError extends Error {
  constructor(message, line, column) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = 'CsvError';
    this.line = line;
    this.column = column;
  }
}

export function parseCsv(input, { delimiter = ',', maxRecords = 100_000 } = {}) {
  if (typeof input !== 'string') throw new TypeError('CSV input must be text');
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || /["\r\n]/.test(delimiter)) {
    throw new TypeError('Delimiter must be one non-quote, non-newline character');
  }
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new RangeError('Invalid record limit');
  const text = input.replace(/^\uFEFF/, '');
  const records = [];
  let record = [];
  let field = '';
  let state = 'start';
  let line = 1;
  let column = 0;
  let recordStarted = false;
  const fail = message => { throw new CsvError(message, line, column); };
  const endField = () => { record.push(field); field = ''; state = 'start'; };
  const endRecord = () => {
    endField();
    if (records.length >= maxRecords) fail('CSV exceeds record limit');
    records.push(record);
    record = [];
    recordStarted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    column++;
    if (state === 'quoted') {
      if (ch === '"') state = 'closed';
      else { field += ch; if (ch === '\n') { line++; column = 0; } }
      continue;
    }
    if (state === 'closed' && ch === '"') {
      field += '"';
      state = 'quoted';
      continue;
    }
    if (ch === delimiter) {
      recordStarted = true;
      endField();
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      column = 0;
      continue;
    }
    if (state === 'closed') fail('Unexpected character after closing quote');
    if (ch === '"') {
      if (state !== 'start') fail('Quote inside an unquoted field');
      state = 'quoted';
      recordStarted = true;
      continue;
    }
    field += ch;
    state = 'plain';
    recordStarted = true;
  }
  if (state === 'quoted') fail('Unterminated quoted field');
  // Commit an unterminated final record, but not a phantom after a newline.
  if (recordStarted) endRecord();
  return records;
}

export function quoteCsvField(value, delimiter = ',') {
  const text = value == null ? '' : String(value);
  return text.includes(delimiter) || /["\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"` : text;
}

export function stringifyCsv(records, { delimiter = ',', newline = '\n' } = {}) {
  if (!Array.isArray(records) || records.some(record => !Array.isArray(record))) {
    throw new TypeError('CSV records must be arrays');
  }
  if (newline !== '\n' && newline !== '\r\n') throw new TypeError('Unsupported newline');
  return records.map(record => record.map(value => quoteCsvField(value, delimiter)).join(delimiter)).join(newline) + (records.length ? newline : '');
}

/** Preserve source positions instead of silently truncating ragged rows. */
export function csvObjects(records) {
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].map(value => value.trim());
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV header');
  if (headers.some(header => !header)) throw new Error('Empty CSV header');
  const rows = records.slice(1).filter(record => record.some(value => value !== '')).map((values, index) => {
    if (values.length !== headers.length) {
      return { sourceRow: index + 2, values, value: null, error: `Expected ${headers.length} fields, received ${values.length}` };
    }
    return { sourceRow: index + 2, values, value: Object.fromEntries(headers.map((header, i) => [header, values[i]])), error: null };
  });
  return { headers, rows };
}
