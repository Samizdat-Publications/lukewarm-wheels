// tools/site.mjs - builds the public site into site-dist/ and, with --deploy, publishes it to
// Cloudflare Pages (project lukewarm-wheels -> https://lukewarm-wheels.pages.dev).
//
//   node tools/site.mjs            site-dist/ = site/ (the landing page) + play/ (the sim)
//   node tools/site.mjs --deploy   ... then wrangler pages deploy
//
// The landing page lives at /, the sim at /play/ (dist/index.html from tools/build.mjs, one
// self-contained file). The media in site/media/ comes from tools/film.mjs + tools/media.mjs.
// Cloudflare Pages refuses files over 25 MiB, so the build checks every file.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site-dist');
const PROJECT = 'lukewarm-wheels';

execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs')], { stdio: 'inherit' });
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'site'), OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'play'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'dist', 'index.html'), path.join(OUT, 'play', 'index.html'));
// long cache for media (file names change when the footage does), short for the pages
fs.writeFileSync(path.join(OUT, '_headers'), [
  '/media/*', '  Cache-Control: public, max-age=604800', '',
  '/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin', '',
].join('\n'));

let total = 0, files = 0;
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, f.name);
  if (f.isDirectory()) walk(p);
  else {
    const s = fs.statSync(p).size; total += s; files++;
    if (s > 25 * 1024 * 1024) { console.error('too big for Cloudflare Pages (25 MiB):', path.relative(ROOT, p)); process.exit(1); }
  }
} };
walk(OUT);
console.log(`site-dist: ${files} files, ${(total / 1e6).toFixed(1)} MB`);

if (process.argv.includes('--deploy')) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npx, ['--yes', 'wrangler', 'pages', 'deploy', 'site-dist', '--project-name', PROJECT, '--branch', 'main', '--commit-dirty=true'],
    { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' });
}
