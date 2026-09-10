// tools/build.mjs — single-file build (PLAN T14).
//
// Reads index.html and replaces everything between the `<!-- HW:SCRIPTS ... -->` and
// `<!-- /HW:SCRIPTS -->` markers with the contents of every file listed in
// src/manifest.json, in order, each wrapped in its own <script> tag. Nothing else is
// inlined: the importmap and the `<script type="module">` loader are copied verbatim,
// because their imports are CDN URLs that the Artifact CSP allows
// (https://cdn.jsdelivr.net/npm/ — see docs/DEPENDENCIES.md).
//
//   node tools/build.mjs            -> dist/index.html  and  dist/artifact.html
//
// dist/artifact.html is the same page with the <!doctype>/<html>/<head>/<body> wrapper
// stripped, because the Artifact host supplies its own skeleton and wraps whatever it is
// given. Everything else -- <title>, <style>, the importmap, the module loader, all the
// inlined scripts -- is kept in order.
//
// Exits 1 if a manifest file is missing, if the markers are absent, or if the result
// still references a local script (`src="src/`).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const IN_HTML = join(ROOT, 'index.html');
const MANIFEST = join(ROOT, 'src', 'manifest.json');
const OUT_HTML = join(ROOT, 'dist', 'index.html');
const OUT_ART = join(ROOT, 'dist', 'artifact.html');

const START_RE = /<!--\s*HW:SCRIPTS\b[\s\S]*?-->/;
const END_MARK = '<!-- /HW:SCRIPTS -->';

function fail(msg) {
  console.error('build: ERROR ' + msg);
  process.exit(1);
}

// A literal `</script` anywhere in a source file (string, regex or comment) would end the
// inline <script> element early. `<\/script` is identical to the JS parser and inert to HTML.
const escapeScriptEnd = (src) => src.replace(/<\/script/gi, '<\\/script');

const kb = (n) => (n / 1024).toFixed(1) + ' KB';

async function main() {
  let html;
  try { html = await readFile(IN_HTML, 'utf8'); }
  catch { return fail('cannot read ' + IN_HTML); }

  let manifest;
  try { manifest = JSON.parse(await readFile(MANIFEST, 'utf8')); }
  catch (e) { return fail('cannot read/parse ' + MANIFEST + ': ' + e.message); }

  const list = manifest.scripts;
  if (!Array.isArray(list) || list.length === 0) return fail('src/manifest.json has no "scripts" array');

  const startMatch = html.match(START_RE);
  if (!startMatch) return fail('index.html has no `<!-- HW:SCRIPTS ... -->` marker');
  const startEnd = startMatch.index + startMatch[0].length;
  const endStart = html.indexOf(END_MARK, startEnd);
  if (endStart < 0) return fail('index.html has no `' + END_MARK + '` marker');

  const chunks = [];
  let raw = 0;
  for (const rel of list) {
    const file = join(ROOT, rel);
    let src;
    try { src = await readFile(file, 'utf8'); }
    catch { return fail('manifest lists a missing file: ' + rel); }
    raw += Buffer.byteLength(src, 'utf8');
    console.log('  + ' + rel.padEnd(28) + kb(Buffer.byteLength(src, 'utf8')).padStart(9));
    chunks.push('<script data-hw-file="' + rel + '">\n' + escapeScriptEnd(src).replace(/\s*$/, '') + '\n</script>');
  }

  const banner = '\n<!-- inlined by tools/build.mjs from src/manifest.json — do not edit dist/ by hand -->\n';
  const out = html.slice(0, startEnd) + banner + chunks.join('\n') + '\n' + html.slice(endStart);

  // a real attribute, not `data-src=` / `data-hw-file=`
  if (/(?<![-\w])src\s*=\s*["']src\//.test(out)) return fail('output still references a local script (src="src/…")');
  if (out.includes(END_MARK) === false) return fail('output lost the closing marker');

  await mkdir(dirname(OUT_HTML), { recursive: true });
  await writeFile(OUT_HTML, out, 'utf8');

  // ---- artifact variant: same content, no document wrapper -------------------------
  // The importmap has to come before the first module script; it stays where it is, which is
  // still before the loader. Browsers accept an import map outside <head>.
  let art = out
    .replace(/^\s*<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*$/i, '')
    .replace(/<head[^>]*>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body[^>]*>\s*/i, '')
    .replace(/<\/body>\s*/i, '')
    .replace(/<meta\s+charset[^>]*>\s*/i, '')
    .replace(/<meta\s+name="viewport"[^>]*>\s*/i, '');
  if (/<(!doctype|html|head|body)/i.test(art)) return fail('artifact variant still has a document wrapper');
  if (!/<script type="importmap">/.test(art)) return fail('artifact variant lost the importmap');
  await writeFile(OUT_ART, art, 'utf8');

  const bytes = Buffer.byteLength(out, 'utf8');
  console.log('build: ' + list.length + ' scripts (' + kb(raw) + ' of JS) -> dist/index.html  ' + bytes + ' bytes (' + kb(bytes) + ')');
  console.log('build: -> dist/artifact.html  ' + kb(Buffer.byteLength(art, 'utf8')) + ' (no document wrapper)');
  console.log('build: externals are CDN-only (importmap + module loader left untouched); CSP-safe.');
}

main();
