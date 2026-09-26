// tools/film.mjs - films the sim for the landing page and the README: one 60 fps MP4 per
// scene in media/raw/, plus a PNG still per scene. Adapted from VoidWing's film mode.
//
//   node tools/film.mjs [scene ...] [--headed] [--width 1600 --height 900]
//
// The page's clock is replaced by a virtual one: after warm-up, requestAnimationFrame,
// performance.now, setTimeout and setInterval only move when the script steps a frame, and
// every frame is captured (CDP JPEG) and piped into ffmpeg. So the footage plays back at a
// smooth 60 fps however slowly the frames were captured. CSS transitions are slowed to the
// capture rate. Needs the dev server (node tools/serve.mjs) or starts one itself.
import { chromium } from 'playwright';
import ffmpeg from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const W = +opt('width', 1600), H = +opt('height', 900), FPS = 60;
const OUT = path.join(ROOT, 'media', 'raw');
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[film ${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

// ------------------------------------------------------------------ scenes
// hud: keep the HUD (false hides #ui, the title screen and the photo bar).
// setup: runs in the page before filming. at: [seconds, page function or key] during filming.
const SCENES = {
  crossing: { hash: 's.crissCross', secs: 16, hud: false, warm: 2,
    setup: () => { HW.sim.lineUpAll(); HW.ui.setCam('director'); } },
  crashhud: { hash: 's.crissCross', secs: 11, hud: true, warm: 2,
    setup: () => { HW.sim.lineUpAll(); HW.ui.setCam('orbit'); __look([48, 46, 70], [2, 2, 4]); HW.cam.controls.autoRotate = true; HW.cam.controls.autoRotateSpeed = 0.5; } },
  onboard: { hash: 's.crissCross', secs: 9, hud: false, warm: 5,
    setup: () => { const c = HW.sim.cars.find((c) => c.mode === 'track') || HW.sim.cars[0]; HW.ui.follow(c, true); HW.ui.setCam('onboard'); } },
  leap: { hash: 's.loopLeap', secs: 14, hud: false, warm: 3,
    setup: () => { HW.ui.setCam('orbit'); __look([-70, 48, 120], [0, 8, -12]); HW.cam.controls.autoRotate = true; HW.cam.controls.autoRotateSpeed = 0.35;
      if (HW.ui.ln) { HW.ui.ln.auto = true; HW.ui.ln.vary = true; } } },
  jumpcam: { hash: 's.loopLeap', secs: 16, hud: false, warm: 3,
    setup: () => { HW.ui.setCam('director'); if (HW.ui.ln) { HW.ui.ln.auto = true; HW.ui.ln.vary = true; } } },
  race: { hash: 's.dragStrip', secs: 13, hud: true, warm: 3,
    setup: () => { HW.ui.setCam('orbit'); __look([178, 34, 62], [10, 10, 0]); }, at: [[0.4, 'g'], [6.4, 'g'], [7.0, 'g']] },
  forces: { hash: 's.crissCross', secs: 9, hud: true, warm: 5,
    setup: () => { HW.uiRace.toggleOverlay(true); HW.ui.setCam('orbit'); __look([34, 30, 46], [0, 4, 0]); HW.cam.controls.autoRotate = true; HW.cam.controls.autoRotateSpeed = 0.6; } },
  kitchen: { hash: 's.kitchenGP', secs: 16, hud: false, warm: 3,
    setup: () => { HW.ui.setCam('director'); } },
  kitchenchase: { hash: 's.kitchenGP', secs: 12, hud: false, warm: 1.5,
    setup: () => { const c = HW.sim.cars.find((c) => c.mode === 'track') || HW.sim.cars[0]; HW.ui.follow(c); HW.ui.setCam('chase'); } },
  builder: { hash: 's.crissCross', secs: 11, hud: true, warm: 2,
    setup: () => { HW.builderUI.open(); const B = HW.builderUI; B.model = HW.builderCodec.decode('P'); B.run = 0; B.sel = null; B.refresh(); },
    at: [...'SBSOSllSBCSl'].map((k, i) => [0.6 + i * 0.62, k]).concat([[8.2, () => { const B = HW.builderUI; B.model.runs[0].push('l'); B.model.closed[0] = true; B.refresh(); }]]) },
  lanes: { hash: 't.PSBY.SBOSuSSSSSSuM.SBCSvSSSSSSvM', secs: 10, hud: false, warm: 5,
    setup: () => { HW.ui.setCam('orbit'); HW.sim.lineUpAll(); __look([-30, 80, 150], [45, 4, 0]); HW.cam.controls.autoRotate = true; HW.cam.controls.autoRotateSpeed = 0.3; } },
  showroom: { hash: 's.crissCross', secs: 10, hud: true, warm: 2,
    setup: () => { HW.showroom.open(); }, at: [[3.4, 'ArrowRight'], [6.8, 'ArrowRight']] },
  title: { hash: '', secs: 9, hud: true, warm: 3, setup: () => {} },
};

// ------------------------------------------------------------------ the virtual clock
function virtualClock(fps) {
  const realRaf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  const realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window);
  const realSI = window.setInterval.bind(window), realCI = window.clearInterval.bind(window);
  let manual = false, now = 0, queue = [], nextId = 1, timers = new Map(), tid = 1e7;
  window.requestAnimationFrame = (cb) => { if (!manual) return realRaf(cb); const id = nextId++; queue.push({ id, cb }); return id; };
  performance.now = () => (manual ? now : realNow());
  window.setTimeout = (cb, ms = 0, ...a) => { if (!manual || typeof cb !== 'function') return realST(cb, ms, ...a); const id = tid++; timers.set(id, { due: now + (+ms || 0), cb, a }); return id; };
  window.clearTimeout = (id) => { if (!timers.delete(id)) realCT(id); };
  window.setInterval = (cb, ms = 0, ...a) => { if (!manual || typeof cb !== 'function') return realSI(cb, ms, ...a); const id = tid++; timers.set(id, { due: now + Math.max(1, +ms || 0), cb, a, every: Math.max(1, +ms || 0) }); return id; };
  window.clearInterval = (id) => { if (!timers.delete(id)) realCI(id); };
  window.__film = {
    begin() { now = realNow(); manual = true; },
    step() {
      now += 1000 / fps;
      for (;;) {
        let best = null;
        for (const [id, t] of timers) if (t.due <= now && (!best || t.due < best[1].due)) best = [id, t];
        if (!best) break;
        const [id, t] = best;
        if (t.every) t.due += t.every; else timers.delete(id);
        try { t.cb(...t.a); } catch (e) { console.error(e); }
      }
      const run = queue; queue = [];
      for (const q of run) q.cb(now);
    },
  };
}

// ------------------------------------------------------------------ server
let base = 'http://localhost:8765/', server = null;
try { await fetch(base + 'src/manifest.json'); }
catch { server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 1200)); }
// a stale server from another copy of the project would film the wrong code
const live = await (await fetch(base + 'src/manifest.json')).text();
if (live !== fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8')) { console.error('port 8765 serves a different copy of the project'); process.exit(1); }

const browser = await chromium.launch({ headless: !args.includes('--headed'),
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

const want = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
for (const name of want.length ? want : Object.keys(SCENES)) {
  const sc = SCENES[name];
  if (!sc) { console.error('no scene', name); continue; }
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(virtualClock, FPS);
  // a clean visitor: nothing earned, no records (the title screen shows 0 trophies)
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('film')) { localStorage.clear(); sessionStorage.setItem('film', '1'); } } catch (e) { /* */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror', name, e.message));
  await page.goto(base + (sc.hash ? '#' + sc.hash : ''));
  await page.waitForFunction(() => window.HW && HW.sim && document.getElementById('boot').classList.contains('gone'), null, { timeout: 60000 });
  if (!sc.hud) await page.addStyleTag({ content: '#ui, #title, #photobar, #trophy-toast { display: none !important; }' });
  await page.addStyleTag({ content: '#hint { display: none !important; }' });
  if (sc.hash) await page.evaluate(() => { if (HW.title && HW.title.isOpen) HW.title.close(); });
  await page.waitForTimeout(1500);                       // textures, shaders
  await page.evaluate(sc.setup);
  await page.waitForTimeout(sc.warm * 1000);              // real time: the scene gets going

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Animation.enable');
  await page.evaluate(() => window.__film.begin());
  const file = path.join(OUT, name + '.mp4');
  const enc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const at = (sc.at || []).slice().sort((a, b) => a[0] - b[0]);
  const n = Math.round(sc.secs * FPS), realStart = Date.now();
  let still = null;
  for (let f = 0; f < n; f++) {
    const t = f / FPS;
    while (at.length && at[0][0] <= t) {
      const [, act] = at.shift();
      if (typeof act === 'string') await page.keyboard.press(act); else await page.evaluate(act);
    }
    await page.evaluate(() => window.__film.step());
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true });
    const buf = Buffer.from(data, 'base64');
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
    if (f === Math.round(n * 0.6)) still = buf;
    if (f % 60 === 59) {
      const rate = ((f + 1) / FPS) / Math.max(0.001, (Date.now() - realStart) / 1000);
      await cdp.send('Animation.setPlaybackRate', { playbackRate: Math.min(1, rate) });
    }
  }
  enc.stdin.end();
  await new Promise((r) => enc.on('close', r));
  if (still) fs.writeFileSync(path.join(OUT, name + '.jpg'), still);
  log(name, `${n} frames in ${((Date.now() - realStart) / 1000).toFixed(0)} s ->`, path.relative(ROOT, file), (fs.statSync(file).size / 1e6).toFixed(1) + ' MB');
  await ctx.close();
}
await browser.close();
if (server) server.kill();
