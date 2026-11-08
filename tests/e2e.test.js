// Tes ujung-ke-ujung (E2E) di browser Chromium lewat Playwright.
// Aplikasi (index.html) dilayani dari folder repo; panggilan ke Apps Script dicegat dan dijawab oleh
// apps-script/Code.gs yang berjalan di mock (tests/gas-mock.js). Tidak menyentuh spreadsheet asli.
//
// Butuh Playwright + Chromium. Dicari dari node_modules lokal, lalu dari folder global (npm root -g).
// Jika tidak ada, tes dilewati (skip), bukan gagal.
// Jalankan: node --test tests/e2e.test.js     (tangkapan layar: SHOTS=1 -> tests/.shots/)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const { makeRuntime } = require('./gas-mock');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS ? path.join(__dirname, '.shots') : null;

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* lanjut */ }
  try { return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch (e) { return null; }
}
const pw = loadPlaywright();

function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

test('E2E: daftar, tambah, centang + urungkan, offline, tombol back, muat ulang, ganti akun', { skip: !pw && 'Playwright tidak terpasang', timeout: 120000 }, async () => {
  const S = makeRuntime();
  let offline = false, calls = 0;
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, timezoneId: 'Asia/Jakarta', locale: 'id-ID' });
    await ctx.clock.install({ time: new Date('2026-11-10T09:15:00+07:00') });
    await ctx.route(/script\.google\.com\/macros\//, async route => {
      calls++;
      if (offline) return route.abort('internetdisconnected');
      const body = S.doPost({ postData: { contents: route.request().postData() } }).getContent();
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body });
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/internetdisconnected|Failed to fetch|ERR_INTERNET/i.test(m.text())) errs.push('console: ' + m.text()); });
    const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
    const wait = ms => p.waitForTimeout(ms);
    const sheetNames = u => (S.sheet('@' + u) ? S.sheet('@' + u).objects().map(o => o['Nama tugas']) : []);
    const isOpen = sel => p.evaluate(s => document.querySelector(s).classList.contains('open'), sel);

    await p.goto('data:text/html,sebelumnya');      // agar tombol back bisa diuji "tidak keluar aplikasi"
    await p.goto(base);
    await wait(500);

    // 1) layar daftar muncul (belum ada akun di HP)
    assert.equal(await p.isVisible('#auth'), true, 'layar masuk/daftar tampil');
    assert.equal((await p.textContent('#a-submit')).trim(), 'Buat akun');
    await p.fill('#a-name', 'Adit'); await p.fill('#a-user', 'adit'); await p.fill('#a-pin', '1234'); await p.fill('#a-pin2', '1234');
    await p.click('#a-submit'); await wait(700);
    assert.equal(await p.isVisible('#auth'), false, 'masuk setelah daftar');
    assert.equal(await p.textContent('#hdr-av'), 'A');
    await shot('01-home-kosong');

    // 2) tambah tugas lewat + -> kategori -> form
    async function addTask(cat, name) {
      await p.click('.nav .fab'); await wait(300);
      await p.click(`[data-act="pick-cat"][data-k="${cat}"]`); await wait(350);
      await p.fill('#f-name', name);
      await p.click('#f-save'); await wait(300);
    }
    await addTask('tkuliah', 'Jurnal Ilmiah');
    await wait(1200);
    assert.deepEqual(sheetNames('adit'), ['Jurnal Ilmiah'], 'tersimpan ke sheet');
    assert.equal(await p.locator('#home-list .task').count(), 1);
    assert.match(await p.getAttribute('#sync-dot', 'class'), /\bok\b/);
    await shot('02-home-1-tugas');

    // 3) centang selesai -> toast Urungkan -> batal
    await p.click('#home-list .task .check'); await wait(250);
    assert.equal(await p.isVisible('#toast-btn'), true, 'toast punya tombol Urungkan');
    assert.equal((await p.textContent('#toast-btn')).trim(), 'Urungkan');
    await shot('03-toast-urungkan');
    await p.click('#toast-btn'); await wait(1200);
    assert.equal(await p.locator('#home-list .task.done').count(), 0, 'urungkan membatalkan centang');
    assert.equal(S.sheet('@adit').objects()[0]['Status'], 'Belum');

    // 4) offline: perubahan antre di HP, terkirim saat online
    offline = true;
    await addTask('belajar', 'Offline dulu'); await wait(1200);
    assert.match(await p.getAttribute('#sync-dot', 'class'), /\bbad\b/, 'status offline');
    assert.deepEqual(sheetNames('adit'), ['Jurnal Ilmiah'], 'belum terkirim saat offline');
    offline = false;
    await p.evaluate(() => window.dispatchEvent(new Event('online'))); await wait(1500);
    assert.deepEqual(sheetNames('adit').sort(), ['Jurnal Ilmiah', 'Offline dulu'], 'terkirim setelah online');

    // 5) tombol back HP menutup lapisan dulu, tidak keluar aplikasi
    await p.click('.nav .fab'); await wait(300);
    await p.click('[data-act="pick-cat"][data-k="tkuliah"]'); await wait(350);
    assert.equal(await isOpen('#form-wrap'), true);
    await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await wait(300);
    assert.equal(await isOpen('#form-wrap'), false, 'back #1 menutup form');
    assert.equal(await isOpen('#add-screen'), true, 'layar kategori masih terbuka');
    await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await wait(300);
    assert.equal(await isOpen('#add-screen'), false, 'back #2 menutup layar kategori');
    await p.click('#nav [data-view="grafik"]'); await wait(300);
    await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await wait(300);
    assert.equal(await p.evaluate(() => [...document.querySelectorAll('.view')].find(v => !v.classList.contains('hidden')).id), 'v-tugas', 'back dari Grafik ke Tugas');
    assert.ok(p.url().startsWith(base), 'masih di aplikasi');

    // 6) tata letak: tidak ada scroll dokumen, nav menempel di bawah
    const lay = await p.evaluate(() => ({ docScroll: document.scrollingElement.scrollHeight - innerHeight, navGap: Math.round(innerHeight - document.querySelector('.nav').getBoundingClientRect().bottom) }));
    assert.deepEqual(lay, { docScroll: 0, navGap: 0 });

    // 7) muat ulang: data tetap ada
    await p.reload(); await wait(1200);
    assert.equal(await p.locator('#home-list .task').count(), 2, 'tugas ada setelah reload');

    // 8) tiap view bisa dibuka tanpa error
    for (const v of ['kalender', 'grafik', 'saya', 'tugas']) { await p.click(`#nav [data-view="${v}"]`); await wait(250); await shot('04-view-' + v); }

    // 9) akun kedua: data terpisah, bisa berpindah akun
    await p.click('[data-act="accounts"]'); await wait(300);
    await p.click('[data-act="add-account"]'); await wait(300);
    await p.click('[data-act="auth-tab"][data-t="daftar"]');
    await p.fill('#a-name', 'Budi'); await p.fill('#a-user', 'budi'); await p.fill('#a-pin', '4321'); await p.fill('#a-pin2', '4321');
    await p.click('#a-submit'); await wait(700);
    assert.equal(await p.textContent('#hdr-av'), 'B');
    assert.equal(await p.locator('#home-list .task').count(), 0, 'akun baru kosong');
    await p.click('[data-act="accounts"]'); await wait(300);
    await p.click('#acct-body [data-act="switch-account"]:not(:first-child)'); await wait(900);
    assert.equal(await p.textContent('#hdr-av'), 'A');
    assert.equal(await p.locator('#home-list .task').count(), 2, 'kembali ke data Adit');

    assert.deepEqual(errs, [], 'tidak ada error JavaScript');
    assert.ok(calls > 0);
  } finally {
    await browser.close();
    srv.close();
  }
});
