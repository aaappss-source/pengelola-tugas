#!/usr/bin/env node
// Type check JS aplikasi dengan TypeScript (mode tidak ketat, tanpa mengubah kode).
// Kode aplikasi tidak bertipe, jadi ada "derau" bawaan (Element vs HTMLElement, api() memakai arguments, dll).
// Skrip ini GAGAL hanya jika jumlah error NAIK dari baseline -> menandakan kemungkinan bug baru.
// Butuh `tsc` (TypeScript) terpasang global; jika tidak ada, dilewati.
// Jalankan: node tests/typecheck.js        Perbarui baseline (setelah dicek manual): node tests/typecheck.js --update
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE_FILE = path.join(__dirname, 'typecheck-baseline.json');
const which = spawnSync('tsc', ['--version'], { encoding: 'utf8' });
if (which.status !== 0) { console.log('tsc tidak ditemukan, type check dilewati'); process.exit(0); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-tsc-'));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.writeFileSync(path.join(dir, 'app.js'), (html.match(/<script>([\s\S]*?)<\/script>/) || [, ''])[1]);
fs.copyFileSync(path.join(ROOT, 'sw.js'), path.join(dir, 'sw.js'));
const run = (file, lib) => {
  const r = spawnSync('tsc', ['--allowJs', '--checkJs', '--noEmit', '--strict', 'false', '--target', 'es2020', '--lib', lib, file],
    { cwd: dir, encoding: 'utf8' });
  const lines = (r.stdout + r.stderr).split('\n').filter(l => /error TS\d+/.test(l));
  const codes = {};
  lines.forEach(l => { const c = l.match(/error (TS\d+)/)[1]; codes[c] = (codes[c] || 0) + 1; });
  return { count: lines.length, codes, lines };
};
const res = { 'index.html': run('app.js', 'dom,es2020'), 'sw.js': run('sw.js', 'webworker,es2020') };
const now = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.count]));
console.log(which.stdout.trim() + ' — jumlah error:', JSON.stringify(now));
Object.entries(res).forEach(([k, v]) => console.log('  ' + k + ': ' + JSON.stringify(v.codes)));

if (process.argv.includes('--update')) {
  fs.writeFileSync(BASE_FILE, JSON.stringify(now, null, 2) + '\n');
  console.log('baseline diperbarui');
  process.exit(0);
}
const base = fs.existsSync(BASE_FILE) ? JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')) : {};
let fail = false;
for (const k of Object.keys(now)) {
  if (base[k] == null) continue;
  if (now[k] > base[k]) {
    fail = true;
    console.log('  NAIK di ' + k + ': ' + base[k] + ' -> ' + now[k] + '. Error (baris = baris di dalam <script>):');
    res[k].lines.forEach(l => console.log('    ' + l));
  }
}
console.log(fail ? 'Type check: ada error baru' : 'Type check: tidak ada error baru (baseline ' + JSON.stringify(base) + ')');
process.exit(fail ? 1 : 0);
