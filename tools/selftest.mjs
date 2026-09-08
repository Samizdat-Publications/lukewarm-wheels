// tools/selftest.mjs — the self-test runs IN THE BROWSER (it needs WebGL-free but
// wasm-backed Rapier plus the real Three.js importmap), so this script does not run it.
// It just checks the dev server and prints the URL to open (PLAN T17).
//
//   node tools/serve.mjs        # in one terminal
//   node tools/selftest.mjs     # prints the URL
//
// Results land on `window.__selftest = {passed, failed, warned, results, text}` once
// `window.__selftest.done` is true, so an automation driver can poll that.

const URL_ = 'http://localhost:8765/tools/selftest.html';

let up = false;
try {
  const res = await fetch('http://localhost:8765/tools/selftest.html', { method: 'GET' });
  up = res.ok;
} catch { up = false; }

console.log('Criss Cross Crash self-test (SPEC section 7)');
console.log('  open: ' + URL_);
console.log(up ? '  dev server: up' : '  dev server: NOT RUNNING — start it with `node tools/serve.mjs`');
console.log('  read results from window.__selftest (poll window.__selftest?.done)');
if (!up) process.exit(1);
