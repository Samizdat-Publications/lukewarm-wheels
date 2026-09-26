// tools/media.mjs - cuts the footage from tools/film.mjs (media/raw/*.mp4, 1600x900 at 60 fps)
// into what the landing page and the README use:
//
//   site/media/<clip>.mp4 + .jpg   1280 px H.264 clips and their posters (the landing page)
//   site/media/hero.mp4 + .jpg     the hero reel: several cuts joined with crossfades, 1600 px
//   site/media/og.jpg              1200x630 social card
//   site/media/progress/NN.jpg     the milestone frames from docs/progress, 640 px
//   docs/media/*.gif               README GIFs, 560-720 px, 12 fps, one palette per clip
//   docs/media/still-*.jpg         README stills, 1600 px
//
//   node tools/media.mjs [site|hero|gif|stills|og|progress ...]   (default: all)
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'media', 'raw'), SITE = path.join(ROOT, 'site', 'media'), DOCS = path.join(ROOT, 'docs', 'media');
for (const d of [SITE, DOCS, path.join(SITE, 'progress')]) fs.mkdirSync(d, { recursive: true });
const run = (args) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const raw = (n) => path.join(RAW, n + '.mp4');
const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(2) + ' MB';
const want = process.argv.slice(2);
const doing = (k) => !want.length || want.includes(k);

// ------------------------------------------------------------ the cuts (seconds into each raw clip)
// site clips: [name, raw clip, start, duration, poster at]
const CLIPS = [
  ['crossing', 'crossing', 0, 16, 9.5], ['crashhud', 'crashhud', 0, 11, 6], ['onboard', 'onboard', 0, 9, 2.2], ['leap', 'jumpcam', 0, 16, 2.5],
  ['race', 'race', 0, 13, 5.5], ['forces', 'forces', 0, 9, 4], ['kitchen', 'kitchenchase', 0, 12, 10.2], ['builder', 'builder', 0, 11, 9.5],
  ['lanes', 'lanes', 0, 10, 5], ['showroom', 'showroom', 0, 10, 5],
];
// hero reel: [raw clip, start, duration]
const HERO = [['crossing', 0.2, 4.6], ['onboard', 0.4, 3.4], ['crossing', 6.6, 5.2], ['jumpcam', 1, 5], ['kitchenchase', 3.4, 4.6], ['leap', 2, 4]];
// README GIFs: [name, raw clip, start, duration, width]
const GIFS = [
  ['hero', 'crossing', 6.6, 5, 720], ['crash', 'crashhud', 1, 5, 560], ['onboard', 'onboard', 0.4, 4, 560],
  ['jump', 'jumpcam', 1, 5, 560], ['kitchen', 'kitchenchase', 3, 5, 560], ['race', 'race', 0.2, 4.5, 560], ['builder', 'builder', 0.4, 7, 520],
];
// README stills: [name, raw clip, at]
const STILLS = [['crossing', 'crossing', 10.5], ['leap', 'jumpcam', 4.2], ['race', 'race', 4], ['kitchen', 'kitchenchase', 10.2], ['forces', 'forces', 4], ['showroom', 'showroom', 2.5], ['builder', 'builder', 10], ['title', 'title', 4]];

if (doing('site')) for (const [n, src, ss, t, at] of CLIPS) {
  if (!fs.existsSync(raw(src))) { console.warn('missing', src); continue; }
  const out = path.join(SITE, n + '.mp4');
  run(['-ss', String(ss), '-t', String(t), '-i', raw(src), '-an', '-vf', 'scale=1280:-2:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
    '-maxrate', '2400k', '-bufsize', '4800k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  run(['-ss', String(ss + at), '-i', raw(src), '-frames:v', '1', '-vf', 'scale=1280:-2:flags=lanczos', '-q:v', '4', path.join(SITE, n + '.jpg')]);
  console.log('site', n, mb(out));
}

if (doing('hero')) {
  const inputs = [], parts = [], fade = 0.45;
  HERO.forEach(([n, ss, t], i) => { inputs.push('-ss', String(ss), '-t', String(t), '-i', raw(n)); parts.push(`[${i}:v]scale=1600:-2:flags=lanczos,fps=30,settb=AVTB,setpts=PTS-STARTPTS[v${i}]`); });
  let last = 'v0', off = HERO[0][2] - fade;
  for (let i = 1; i < HERO.length; i++) {
    const o = i === HERO.length - 1 ? 'out' : 'x' + i;
    parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${off.toFixed(3)}[${o}]`);
    last = o; off += HERO[i][2] - fade;
  }
  const out = path.join(SITE, 'hero.mp4');
  run([...inputs, '-filter_complex', parts.join(';'), '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-maxrate', '3000k', '-bufsize', '6000k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  run(['-ss', String(HERO[0][1] + 2), '-i', raw(HERO[0][0]), '-frames:v', '1', '-vf', 'scale=1600:-2:flags=lanczos', '-q:v', '3', path.join(SITE, 'hero.jpg')]);
  console.log('hero', mb(out));
}

if (doing('gif')) for (const [n, src, ss, t, w] of GIFS) {
  if (!fs.existsSync(raw(src))) { console.warn('missing', src); continue; }
  const out = path.join(DOCS, n + '.gif');
  run(['-ss', String(ss), '-t', String(t), '-i', raw(src), '-vf',
    `fps=12,scale=${w}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`, out]);
  console.log('gif', n, mb(out));
}

if (doing('stills')) for (const [n, src, at] of STILLS) {
  if (!fs.existsSync(raw(src))) { console.warn('missing', src); continue; }
  run(['-ss', String(at), '-i', raw(src), '-frames:v', '1', '-q:v', '3', path.join(DOCS, 'still-' + n + '.jpg')]);
  console.log('still', n);
}

if (doing('og')) {
  run(['-ss', '10.5', '-i', raw('crossing'), '-frames:v', '1', '-vf', 'scale=1200:-2:flags=lanczos,crop=1200:630', '-q:v', '3', path.join(SITE, 'og.jpg')]);
  console.log('og');
}

if (doing('progress')) {
  const dir = path.join(ROOT, 'docs', 'progress');
  for (const f of fs.readdirSync(dir).filter((f) => /^\d\d-.*\.(png|jpg)$/.test(f))) {
    run(['-i', path.join(dir, f), '-vf', 'scale=640:-2:flags=lanczos', '-q:v', '4', path.join(SITE, 'progress', f.slice(0, 2) + '.jpg')]);
  }
  console.log('progress frames');
}
