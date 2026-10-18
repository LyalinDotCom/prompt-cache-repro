import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, roundtrip } from '../src/pipeline.mjs';
const rows = parse(readFileSync(new URL('../data/feed.csv', import.meta.url)), {columns:true});
assert.equal(rows.length,4);
assert.equal(rows.at(-1).note,'tail');
const matrix=rows.map(r=>[r.id,r.name,r.note]);
assert.deepEqual(roundtrip(matrix),matrix);
console.log(JSON.stringify({ok:true,records:rows.length}));
