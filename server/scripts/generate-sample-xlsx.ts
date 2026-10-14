import { mkdir, writeFile } from 'node:fs/promises';
import { buildSampleWorkbook } from './sampleWorkbook.js';

const target = new URL('../samples/synthetic-bank-transactions.xlsx', import.meta.url);
await mkdir(new URL('.', target), { recursive: true });
await writeFile(target, await buildSampleWorkbook());
console.log(`Synthetic sample written to ${target.pathname}`);
