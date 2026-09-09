import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const PORT = 8765;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  // POST /__shot?name=foo.png with a data: URL body -> writes docs/screenshots/foo.png.
  // Lets a page save its own canvas from the browser tools, which cannot write files.
  if (req.method === 'POST' && url === '/__shot') {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot.png').replace(/[^\w.-]/g, '_');
    let body = '';
    for await (const chunk of req) body += chunk;
    const b64 = body.slice(body.indexOf(',') + 1);
    await mkdir(join(ROOT, 'docs', 'screenshots'), { recursive: true });
    await writeFile(join(ROOT, 'docs', 'screenshots', name), Buffer.from(b64, 'base64'));
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok ' + name);
    return;
  }
  const file = normalize(join(ROOT, url === '/' ? '/index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
