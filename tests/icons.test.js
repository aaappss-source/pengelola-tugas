// Tes aset logo, ikon, dan splash (Tahap 10, Poin 7). Tanpa browser: hanya membaca file dan ukuran PNG.
// Jalankan: node --test tests/icons.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SPLASH, logoSvg } = require('../icons/buat-ikon');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
/** {w, h, type} dari kepala PNG (IHDR); type 2 = RGB (tanpa transparan), 6 = RGBA, 3 = palet */
function png(f) {
  const b = fs.readFileSync(path.join(ROOT, f));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', f + ' adalah PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] };
}

test('manifest: ikon any + maskable 192/512 ada dan ukurannya benar', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const got = m.icons.map(i => i.purpose + ':' + i.sizes);
  for (const need of ['any:192x192', 'any:512x512', 'maskable:192x192', 'maskable:512x512']) assert.ok(got.includes(need), need);
  m.icons.filter(i => i.type === 'image/png').forEach(i => {
    const p = png(i.src), [w, h] = i.sizes.split('x').map(Number);
    assert.deepEqual([p.w, p.h], [w, h], i.src);
    assert.equal(p.type, i.purpose === 'any' ? 6 : 2, i.src + (i.purpose === 'any' ? ' bersudut bulat di atas transparan' : ' kotak penuh tanpa transparan'));
  });
  assert.equal(m.background_color, '#1b1b1b', 'warna splash Android = latar aplikasi');
});

test('apple-touch-icon 180×180 tanpa transparan, favicon SVG + PNG, logo di layar masuk = icons/logo.svg', () => {
  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon.png">/);
  assert.deepEqual(png('icons/apple-touch-icon.png'), { w: 180, h: 180, type: 2 }, 'iOS memberi latar hitam pada bagian transparan');
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="icons\/logo.svg">/);
  assert.deepEqual(png('icons/favicon-32.png'), { w: 32, h: 32, type: 6 });
  const svg = fs.readFileSync(path.join(ROOT, 'icons/logo.svg'), 'utf8').trim();
  assert.equal(svg, logoSvg('round'), 'logo.svg dibuat dari icons/buat-ikon.js');
  const inline = (html.match(/<div class="auth-logo">([\s\S]*?)<\/div>/) || [])[1];
  assert.equal(inline, svg.replace('viewBox="0 0 512 512">', 'viewBox="0 0 512 512" aria-hidden="true">'), 'logo di layar masuk sama dengan logo.svg');
  assert.ok(svg.includes('#FFD43B') && /rx="116"/.test(svg), 'ciri lama tetap: kuning #FFD43B, sudut bulat');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /const CACHE = 'pt-v3';/, 'nama cache naik supaya ikon lama tidak dipakai lagi');
});

test('splash iOS: satu gambar untuk setiap ukuran iPhone/iPad, ukurannya cocok dengan media query', () => {
  const links = [...html.matchAll(/<link rel="apple-touch-startup-image" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: portrait\)" href="([^"]+)">/g)]
    .map(m => ({ w: +m[1], h: +m[2], d: +m[3], href: m[4] }));
  assert.equal(links.length, SPLASH.length, 'jumlah tag = daftar di buat-ikon.js');
  assert.equal((html.match(/apple-touch-startup-image/g) || []).length, SPLASH.length, 'tidak ada tag dengan format lain');
  SPLASH.forEach(([w, h, d], i) => assert.deepEqual([links[i].w, links[i].h, links[i].d], [w, h, d]));
  const seen = new Set();
  links.forEach(l => {
    const p = png(l.href);
    assert.deepEqual([p.w, p.h], [l.w * l.d, l.h * l.d], l.href);
    const key = l.w + 'x' + l.h + '@' + l.d;
    assert.ok(!seen.has(key), 'ukuran kembar ' + key); seen.add(key);
  });
  const files = fs.readdirSync(path.join(ROOT, 'icons/splash')).filter(f => f.endsWith('.png'));
  assert.equal(files.length, SPLASH.length, 'tidak ada file splash yang tidak dipakai');
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/, 'iOS hanya memakai splash untuk aplikasi layar penuh');
});
