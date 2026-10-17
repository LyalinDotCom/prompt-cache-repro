#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { importAndReconcile, importInvoices } from '../src/pipeline.mjs';
import { hasErrors, renderReport } from '../src/reports.mjs';
import { publicSchema } from '../src/schema.mjs';

export const HELP = `Ledger: import vendor invoices and reconcile payments.

Usage:
  node bin/ledger.mjs import invoices.csv [--payments payments.csv] [options]
  node bin/ledger.mjs schema [invoice|payment]

Options:
  --format json|csv|text   Output format (default text)
  --vendor ID             Select one vendor after validation and deduplication
  --currency CODE         Select one currency; currencies are never converted
  --from YYYY-MM-DD       Inclusive issue-date lower bound
  --to YYYY-MM-DD         Inclusive issue-date upper bound
  --as-of YYYY-MM-DD      Filter future payments and calculate aging
  --delimiter CHAR        CSV delimiter (default comma)
  --help                  Print help

Exit codes: 0 successful import; 1 invalid arguments/file; 2 row diagnostics.
`;

export function parseArgs(args) {
  if (args.includes('--help') || !args.length) return { command: 'help' };
  const [command, file, ...rest] = args;
  if (command === 'schema') {
    if (rest.length || (file && !['invoice','payment'].includes(file))) throw new Error('schema expects invoice or payment');
    return { command, type: file ?? 'invoice' };
  }
  if (command !== 'import' || !file || file.startsWith('--')) throw new Error('Expected import followed by an invoice CSV path');
  const options = { format: 'text' };
  const names = { '--format':'format','--payments':'payments','--vendor':'vendorId','--currency':'currency','--from':'from','--to':'to','--as-of':'asOf','--delimiter':'delimiter' };
  const seen = new Set();
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], value = rest[i + 1];
    if (!names[flag] || value === undefined || value.startsWith('--')) throw new Error(`Unknown flag or missing value: ${flag}`);
    if (seen.has(flag)) throw new Error(`Repeated option: ${flag}`);
    seen.add(flag);
    options[names[flag]] = value;
  }
  if (!['text','json','csv'].includes(options.format)) throw new Error('format must be text, json, or csv');
  if (options.delimiter && options.delimiter.length !== 1) throw new Error('delimiter must be one character');
  return { command, file, options };
}

export async function main(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const parsed = parseArgs(args);
    if (parsed.command === 'help') { stdout.write(HELP); return 0; }
    if (parsed.command === 'schema') { stdout.write(JSON.stringify(publicSchema(parsed.type), null, 2) + '\n'); return 0; }
    const { file, options } = parsed;
    const invoiceText = await readFile(file, 'utf8');
    const opts = { ...options, source: file };
    const imported = options.payments ? importAndReconcile(invoiceText, await readFile(options.payments, 'utf8'), opts) : importInvoices(invoiceText, opts);
    stdout.write(renderReport(imported, options.format));
    return hasErrors(imported) ? 2 : 0;
  } catch (error) { stderr.write(`ledger: ${error.message}\n`); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
