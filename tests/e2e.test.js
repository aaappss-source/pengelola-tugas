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
const V1 = path.join(__dirname, 'fixtures', 'Code-v1.gs');
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

/** Browser + konteks HP (390×844, WIB, jam dibekukan 10 Nov 2026) dengan server Code.gs di mock S. */
async function open(S, opts) {
  opts = opts || {};
  const st = { offline: false, calls: 0 };
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, timezoneId: 'Asia/Jakarta', locale: 'id-ID' });
  await ctx.clock.install({ time: new Date('2026-11-10T09:15:00+07:00') });
  // font Google tidak diambil dari internet (sandbox/CI sering tanpa akses) → balas CSS kosong
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route(/script\.google\.com\/macros\//, async route => {
    st.calls++;
    if (st.offline) return route.abort('internetdisconnected');
    const body = S.doPost({ postData: { contents: route.request().postData() } }).getContent();
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body });
  });
  if (opts.localStorage) {
    // isi localStorage sekali sebelum aplikasi dibuka (meniru HP yang sudah memakai versi lama)
    await ctx.addInitScript(ls => {
      if (location.protocol.startsWith('http') && !localStorage.getItem('__seeded')) {
        Object.entries(ls).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        localStorage.setItem('__seeded', '1');
      }
    }, opts.localStorage);
  }
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/internetdisconnected|Failed to fetch|ERR_INTERNET/i.test(m.text())) errs.push('console: ' + m.text()); });
  const close = async () => { await browser.close(); srv.close(); };
  return { p, base, st, errs, close, wait: ms => p.waitForTimeout(ms) };
}

test('E2E: daftar, tambah, centang + urungkan, offline, tombol back, muat ulang, ganti akun', { skip: !pw && 'Playwright tidak terpasang', timeout: 120000 }, async () => {
  const S = makeRuntime();
  const { p, base, st, errs, close, wait } = await open(S);
  try {
    const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
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
    const row1 = S.sheet('@adit').objects()[0];
    assert.deepEqual([row1['Jenis'], row1['Kesulitan'], row1['Dibuat oleh'], row1['Diselesaikan oleh']], ['Tugas', '', 'p1', ''], 'tugas baru: jenis & pembuat (Tahap 1)');
    const cache = await p.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('pt.cache.')); return JSON.parse(localStorage.getItem(k)); });
    assert.equal(cache.v, 2, 'cache HP versi 2');
    assert.deepEqual(cache.profiles, [{ id: 'p1', name: 'Adit', avatar: '' }]);
    assert.deepEqual(cache.cats, []);
    assert.equal(await p.locator('#home-list .task').count(), 1);
    assert.match(await p.getAttribute('#sync-dot', 'class'), /\bok\b/);
    await shot('02-home-1-tugas');

    // 3) centang selesai -> toast Urungkan -> batal
    await p.click('#home-list .task .check'); await wait(250);
    assert.equal(await p.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('pt.cache.')); const c = JSON.parse(localStorage.getItem(k)); return c.ops[c.ops.length - 1].task.doneBy; }), 'p1', 'pencentang dicatat');
    assert.equal(await p.isVisible('#toast-btn'), true, 'toast punya tombol Urungkan');
    assert.equal((await p.textContent('#toast-btn')).trim(), 'Urungkan');
    await shot('03-toast-urungkan');
    await p.click('#toast-btn'); await wait(1200);
    assert.equal(await p.locator('#home-list .task.done').count(), 0, 'urungkan membatalkan centang');
    assert.equal(S.sheet('@adit').objects()[0]['Status'], 'Belum');
    assert.equal(S.sheet('@adit').objects()[0]['Diselesaikan oleh'], '', 'urungkan mengosongkan pencentang');

    // 4) offline: perubahan antre di HP, terkirim saat online
    st.offline = true;
    await addTask('belajar', 'Offline dulu'); await wait(1200);
    assert.match(await p.getAttribute('#sync-dot', 'class'), /\bbad\b/, 'status offline');
    assert.deepEqual(sheetNames('adit'), ['Jurnal Ilmiah'], 'belum terkirim saat offline');
    st.offline = false;
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
    assert.ok(st.calls > 0);
  } finally {
    await close();
  }
});

test('E2E migrasi: HP dengan cache versi lama + antrean offline, server data lama → semua termigrasi', { skip: !pw && 'Playwright tidak terpasang', timeout: 120000 }, async () => {
  // data dibuat server versi lama, lalu server diganti Code.gs baru (seperti deploy Tahap 1)
  const old = makeRuntime({ codePath: V1 });
  const reg = old.post('apiRegister', 'adit', '1234', 'Adit');
  const T = (id, name, extra) => Object.assign({ id, cat: 'tkuliah', name, detail: '', date: '2026-11-10', start: '08:00', end: '09:00', dlDate: '', dlTime: '', done: false, doneAt: null, createdAt: 1762740000000, updatedAt: 1762740000000 }, extra || {});
  old.post('apiSync', reg.token, [{ op: 'upsert', task: T('t1', 'Dari server') }, { op: 'upsert', task: T('t2', 'Sudah selesai', { done: true, doneAt: 1762740000000 }) }]);
  const S = makeRuntime({ shareWith: old });
  // cache HP versi 1: tugas offline 'Offline lama' belum terkirim
  const off = T('toff', 'Offline lama', { start: '10:00', end: '11:00' });
  const { p, base, errs, close, wait } = await open(S, { localStorage: {
    'pt.accounts': [{ id: reg.user.id, username: 'adit', name: 'Adit', token: reg.token }],
    'pt.current': reg.user.id,
    ['pt.cache.' + reg.user.id]: { tasks: { t1: T('t1', 'Dari server'), toff: Object.assign({ kind: 'task' }, off) }, ops: [{ op: 'upsert', task: off }] }
  } });
  try {
    await p.goto(base); await wait(1500);
    assert.equal(await p.isVisible('#auth'), false, 'langsung masuk dengan akun tersimpan');
    assert.deepEqual((await p.locator('#home-list .task-name').allTextContents()).map(x => x.trim()).sort(), ['Dari server', 'Offline lama', 'Sudah selesai']);
    assert.match(await p.getAttribute('#sync-dot', 'class'), /\bok\b/);
    const rows = Object.fromEntries(S.sheet('@adit').objects().map(o => [o['ID'], o]));
    assert.deepEqual(Object.keys(rows).sort(), ['t1', 't2', 'toff'], 'antrean offline dari cache lama terkirim');
    assert.deepEqual(['t1', 't2', 'toff'].map(id => [rows[id]['Jenis'], rows[id]['Dibuat oleh'], rows[id]['Diselesaikan oleh']]),
      [['Tugas', 'p1', ''], ['Tugas', 'p1', 'p1'], ['Tugas', 'p1', '']]);
    assert.deepEqual(S.sheet('@adit').header().slice(-5), ['Jenis', 'Kesulitan', 'Kegiatan induk', 'Dibuat oleh', 'Diselesaikan oleh']);
    const cache = await p.evaluate(id => JSON.parse(localStorage.getItem('pt.cache.' + id)), reg.user.id);
    assert.equal(cache.v, 2);
    assert.deepEqual(cache.ops, []);
    assert.deepEqual(cache.profiles, [{ id: 'p1', name: 'Adit', avatar: '' }]);
    assert.equal(cache.tasks.toff.kind, 'tugas');
    assert.equal(cache.tasks.t2.doneBy, 'p1');
    // centang tugas lama → pencentang tercatat
    await p.click('#home-list .task:has-text("Dari server") .check'); await wait(1500);
    assert.deepEqual(['Status', 'Diselesaikan oleh'].map(h => S.sheet('@adit').objects().find(o => o.ID === 't1')[h]), ['Selesai', 'p1']);
    assert.deepEqual(errs, [], 'tidak ada error JavaScript');
  } finally {
    await close();
  }
});

test('E2E aplikasi baru + server lama (Code.gs belum di-deploy): tetap jalan dan memberi peringatan', { skip: !pw && 'Playwright tidak terpasang', timeout: 120000 }, async () => {
  const S = makeRuntime({ codePath: V1 });
  const { p, base, errs, close, wait } = await open(S);
  try {
    await p.goto(base); await wait(500);
    await p.fill('#a-name', 'Adit'); await p.fill('#a-user', 'adit'); await p.fill('#a-pin', '1234'); await p.fill('#a-pin2', '1234');
    await p.click('#a-submit'); await wait(700);
    await p.click('.nav .fab'); await wait(300);
    await p.click('[data-act="pick-cat"][data-k="tkuliah"]'); await wait(350);
    await p.fill('#f-name', 'Tetap tersimpan');
    await p.click('#f-save'); await wait(1500);
    assert.deepEqual(S.sheet('@adit').objects().map(o => o['Nama tugas']), ['Tetap tersimpan'], 'server lama tetap menyimpan tugas');
    assert.match(await p.getAttribute('#sync-dot', 'class'), /\bbad\b/, 'titik status merah');
    assert.match(await p.getAttribute('#sync-dot', 'title'), /Server belum diperbarui/);
    await p.click('#nav [data-view="saya"]'); await wait(300);
    assert.match(await p.textContent('#me-body'), /Server belum diperbarui/);
    assert.deepEqual(errs, [], 'tidak ada error JavaScript');
  } finally {
    await close();
  }
});
