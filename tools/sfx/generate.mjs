// tools/sfx/generate.mjs - one-shot samples from the ElevenLabs sound-generation API, then
// embeds them as base64 in src/61-audio-assets.js (the page cannot fetch anything).
//
//   node tools/sfx/generate.mjs                 generate the MISSING mp3s, then embed
//   node tools/sfx/generate.mjs --embed-only    only rebuild src/61-audio-assets.js
//   node tools/sfx/generate.mjs --only crash_2 --force    regenerate one sample
//
// Every generation costs ElevenLabs credits, so an existing tools/sfx/<name>.mp3 is never
// regenerated without --force. The key is read from process.env.ELEVENLABS_API_KEY (or a
// gitignored .env in the project root) and is never printed or written anywhere.
//
// Naming: <bank>_<n>. 60-audio.js groups samples by the part before the last underscore
// and picks a random variant per event, so adding crash_4 needs no code change.
// Set use:false to keep a source mp3 on disk but leave it out of the page. trim: [start s,
// length s] is the window 60-audio.js plays (measured from the decoded envelope in
// tools/audio.html): some generations hold a second click or a lead-in tick.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = normalize(join(HERE, '..', '..'));
const OUT_JS = join(ROOT, 'src', '61-audio-assets.js');
// 44.1 kHz / 64 kbps: the 22 kHz / 32 kbps default low-passes metal and plastic transients
// to mush. Same credit cost; the whole set still embeds in well under the 500 KB budget.
const FORMAT = 'mp3_44100_64';
const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation?output_format=' + FORMAT;

const DRY = 'Dry, close-miked, isolated foley, no music, no voices, no room echo.';
const SPECS = [
  { name: 'crash_1', dur: 1.2, inf: 0.55, text: 'Two small die-cast metal toy cars collide at speed on a plastic toy race track: a sharp bright metallic clank, then the tiny cars rattle and tumble across the hard plastic. ' + DRY },
  { name: 'crash_2', dur: 1.0, inf: 0.5, text: 'A small zinc die-cast toy car T-bones another toy car: a crisp metal-on-metal crack with a short high ping, plastic wheels clattering and skittering on a plastic track. ' + DRY },
  { name: 'crash_3', dur: 1.5, inf: 0.5, text: 'Three tiny metal toy cars pile up on an orange plastic toy track: several quick metallic clacks and knocks, cars bouncing off hard plastic and rattling to a stop. ' + DRY },
  { name: 'clatter_1', dur: 1.3, inf: 0.5, text: 'A small die-cast metal toy car tumbles and bounces along a hard plastic toy track, rattling and clattering to a stop. ' + DRY },
  { name: 'clatter_2', dur: 1.2, inf: 0.5, text: 'A tiny metal toy car falls onto a wooden floor and bounces: a few sharp knocks and a short rattle before it stops. ' + DRY },
  { name: 'switch_1', dur: 0.5, inf: 0.6, trim: [0.045, 0.12], text: 'A single click of a small plastic slide switch on a battery-powered toy, crisp and short. ' + DRY },
  { name: 'drop_1', dur: 0.5, inf: 0.55, trim: [0, 0.4], text: 'A small die-cast metal toy car is dropped a few centimeters onto a hard plastic toy track: one sharp plastic clack and a tiny bounce. ' + DRY },
  { name: 'bump_1', dur: 0.5, inf: 0.55, trim: [0.2, 0.05], text: 'Two small die-cast metal toy cars lightly tap together: a single short metallic tick. ' + DRY },
  { name: 'floor_1', dur: 0.5, inf: 0.55, trim: [0, 0.3], text: 'A small metal toy car hits a hardwood floor once: a single short knock with a tiny metallic ring. ' + DRY },
  { name: 'knock_1', dur: 0.5, inf: 0.55, trim: [0, 0.3], text: 'A die-cast toy car lands hard on a plastic toy track piece: one quick hollow plastic knock. ' + DRY },
];

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? new Set((args[onlyIdx + 1] || '').split(',')) : null;

const exists = (p) => stat(p).then(() => true, () => false);

async function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  try {
    const env = await readFile(join(ROOT, '.env'), 'utf8');
    const m = env.match(/^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  } catch { /* no .env */ }
  return null;
}

async function generate(spec, key) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: spec.text, duration_seconds: spec.dur, prompt_influence: spec.inf }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error('HTTP ' + res.status + ' ' + body);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 400) throw new Error('response too small (' + buf.length + ' bytes)');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function embed() {
  const lines = [], trims = [];
  let total = 0;
  for (const s of SPECS) {
    if (s.use === false) continue;
    const file = join(HERE, s.name + '.mp3');
    if (!(await exists(file))) continue;
    const b64 = (await readFile(file)).toString('base64');
    total += b64.length;
    lines.push('    ' + s.name + ": '" + b64 + "',");
    if (s.trim) trims.push(s.name + ': [' + s.trim.join(', ') + ']');
    console.log('  embed ' + s.name.padEnd(10) + (b64.length / 1024).toFixed(1).padStart(7) + ' KB');
  }
  const src = [
    '// 61-audio-assets.js - GENERATED by tools/sfx/generate.mjs from tools/sfx/*.mp3. Do not edit.',
    '// ElevenLabs one-shot samples (' + FORMAT + '), base64. 60-audio.js decodes them with',
    '// decodeAudioData after HW.audio.init(); the synthesized fallbacks play until then, and',
    '// always if this file is missing. Names are <bank>_<n>; audioAssetTrim = [start s, length s].',
    '(function (HW) {',
    '  HW.audioAssets = {',
    ...lines,
    '  };',
    '  HW.audioAssetTrim = { ' + trims.join(', ') + ' };',
    '})(window.HW = window.HW || {});',
    '',
  ].join('\n');
  await writeFile(OUT_JS, src);
  console.log('wrote src/61-audio-assets.js: ' + lines.length + ' samples, ' + (total / 1024).toFixed(1) + ' KB base64');
}

async function main() {
  if (!flag('--embed-only')) {
    const key = await apiKey();
    if (!key) { console.error('ELEVENLABS_API_KEY is not set; skipping generation'); }
    else {
      let made = 0, failed = 0;
      for (const s of SPECS) {
        if (only && !only.has(s.name)) continue;
        const file = join(HERE, s.name + '.mp3');
        if (!flag('--force') && (await exists(file))) { console.log('  keep  ' + s.name); continue; }
        try {
          const buf = await generate(s, key);
          await writeFile(file, buf);
          made++;
          console.log('  made  ' + s.name.padEnd(10) + (buf.length / 1024).toFixed(1).padStart(7) + ' KB');
        } catch (e) {
          failed++;
          console.error('  FAIL  ' + s.name + ': ' + e.message);
          if (/HTTP 40[13]/.test(e.message)) break;          // bad key or no credits: stop spending calls
        }
      }
      console.log('generated ' + made + ', failed ' + failed);
    }
  }
  await embed();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
