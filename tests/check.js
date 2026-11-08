#!/usr/bin/env node
// Pemeriksaan statis ringan (pengganti lint, tanpa paket npm):
//  1. sintaks JS di index.html (<script> inline), sw.js, apps-script/Code.gs
//  2. manifest.webmanifest JSON valid + ikon yang dirujuk ada
//  3. id HTML unik, dan setiap $('#id') / getElementById('id') punya elemen (statis atau dibuat lewat string id="...")
//  4. semua data-act="..." yang dipakai di HTML/JS punya case di handle()
//  5. file di SHELL sw.js ada
// Jalankan: node tests/check.js   (keluar dengan kode 1 jika ada masalah)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const problems = [];
const ok = [];
const bad = m => problems.push(m);

// 1. sintaks
const html = read('index.html');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
scripts.forEach((src, i) => {
  try { new vm.Script(src, { filename: 'index.html#script' + (i + 1) }); ok.push('sintaks index.html script ' + (i + 1)); }
  catch (e) { bad('Sintaks index.html script ' + (i + 1) + ': ' + e.message); }
});
for (const f of ['sw.js', 'apps-script/Code.gs']) {
  try { new vm.Script(read(f), { filename: f }); ok.push('sintaks ' + f); }
  catch (e) { bad('Sintaks ' + f + ': ' + e.message); }
}

// 2. manifest
try {
  const m = JSON.parse(read('manifest.webmanifest'));
  (m.icons || []).forEach(ic => { if (!fs.existsSync(path.join(ROOT, ic.src))) bad('manifest: ikon tidak ada ' + ic.src); });
  ok.push('manifest valid (' + (m.icons || []).length + ' ikon)');
} catch (e) { bad('manifest.webmanifest: ' + e.message); }

// 3. id
const markup = html.replace(/<script[\s\S]*?<\/script>/g, '');
const staticIds = [...markup.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dup = staticIds.filter((x, i) => staticIds.indexOf(x) !== i);
if (dup.length) bad('id HTML ganda: ' + [...new Set(dup)].join(', '));
const allIds = new Set([...html.matchAll(/id=\\?"([A-Za-z][\w-]*)/g)].map(m => m[1]));
const js = scripts.join('\n');
const refs = new Set([
  ...[...js.matchAll(/\$\('#([A-Za-z][\w-]*)(?=['\s.:\[>])(?!'\s*\+)/g)].map(m => m[1]),   // id yang disusun dinamis ('#v-'+x) dilewati
  ...[...js.matchAll(/getElementById\('([A-Za-z][\w-]*)'\)/g)].map(m => m[1]),
  ...[...js.matchAll(/querySelector(?:All)?\('#([A-Za-z][\w-]*)(?=['\s.:\[>])(?!'\s*\+)/g)].map(m => m[1])
]);
const missing = [...refs].filter(id => !allIds.has(id));
if (missing.length) bad('id dirujuk di JS tapi tidak ada elemennya: ' + missing.join(', '));
else ok.push(refs.size + ' rujukan id cocok');

// 4. data-act
const acts = new Set([...html.matchAll(/data-act=\\?"([\w-]+)"/g)].map(m => m[1]));
const handled = new Set([...js.matchAll(/case '([\w-]+)':/g)].map(m => m[1]));
const unhandled = [...acts].filter(a => !handled.has(a));
if (unhandled.length) bad('data-act tanpa case di handle(): ' + unhandled.join(', '));
else ok.push(acts.size + ' data-act punya handler');

// 5. shell service worker
const shell = (read('sw.js').match(/SHELL\s*=\s*\[([^\]]*)\]/) || [, ''])[1].match(/'([^']+)'/g) || [];
shell.map(s => s.slice(1, -1)).filter(s => s !== './').forEach(s => { if (!fs.existsSync(path.join(ROOT, s))) bad('sw.js SHELL: file tidak ada ' + s); });
ok.push('SHELL sw.js: ' + shell.length + ' entri');

ok.forEach(m => console.log('  ok  ' + m));
problems.forEach(m => console.log('  GAGAL  ' + m));
console.log(problems.length ? '\n' + problems.length + ' masalah' : '\nSemua pemeriksaan lolos');
process.exit(problems.length ? 1 : 0);
