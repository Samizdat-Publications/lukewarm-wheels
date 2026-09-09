// tools/fetch-rapier.mjs — one-time download of the Rapier ESM bundle used by the headless
// harness (tools/lobetest.mjs). Same version as docs/DEPENDENCIES.md / index.html.
// Usage: node tools/fetch-rapier.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const URL_ = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/rapier.es.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'vendor', 'rapier.mjs');
const res = await fetch(URL_);
if (!res.ok) throw new Error('fetch failed ' + res.status + ' ' + URL_);
await mkdir(path.join(here, 'vendor'), { recursive: true });
await writeFile(out, Buffer.from(await res.arrayBuffer()));
console.log('wrote', out);
