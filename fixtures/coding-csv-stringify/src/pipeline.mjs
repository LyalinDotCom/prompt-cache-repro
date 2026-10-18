import { parse } from './upstream/packages/csv-parse/lib/sync.js';
import { stringify } from './upstream/packages/csv-stringify/lib/sync.js';
export { parse, stringify };
export function roundtrip(records, options={}) { return parse(stringify(records, options), options); }
