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

test('E2E Tahap 2: item ringkas, pop-up ×, label, kesulitan, tanpa jam, saran nama, durasi', { skip: !pw && 'Playwright tidak terpasang', timeout: 180000 }, async () => {
  const S = makeRuntime();
  const reg = S.post('apiRegister', 'adit', '1234', 'Adit');
  const T = (id, name, extra) => Object.assign({ id, cat: 'tkuliah', name, detail: '', date: '2026-11-10', start: '08:00', end: '09:00', dlDate: '', dlTime: '', done: false, doneAt: null, createdAt: 1762740000000, updatedAt: 1762740000000, kind: 'tugas', diff: '', parent: '', by: 'p1' }, extra || {});
  const names = ['Laporan 1', 'Laporan 2', 'Laporan 3', 'Laporan 4', 'Laporan 5', 'Laporan 6', 'Rapat tim', 'Kirim laporan', 'Belajar', 'Olahraga', 'Baca jurnal', 'Cuci motor'];
  S.post('apiSync', reg.token, names.map((n, i) => ({ op: 'upsert', task: T('t' + i, n, { start: String(7 + i).padStart(2, '0') + ':00', end: String(8 + i).padStart(2, '0') + ':00', createdAt: 1762740000000 + i * 3600000, updatedAt: 1762740000000 + i * 3600000 }) }))
    .concat([{ op: 'upsert', task: T('tlama', 'Tanpa jam selesai', { date: '2026-11-12', start: '08:00', end: '' }) }]));
  const { p, base, errs, close, wait } = await open(S, { localStorage: {
    'pt.accounts': [{ id: reg.user.id, username: 'adit', name: 'Adit', token: reg.token }], 'pt.current': reg.user.id } });
  const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  const row = id => S.sheet('@adit').objects().find(o => o.ID === id);
  const rowByName = n => S.sheet('@adit').objects().find(o => o['Nama tugas'] === n);
  const rect = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; }, sel);
  const sugState = () => p.evaluate(() => ({ open: !document.getElementById('f-sug').classList.contains('hidden'), items: [...document.querySelectorAll('#f-sug .sug-i')].map(b => b.textContent.trim()), focus: document.activeElement && document.activeElement.id }));
  async function openForm(cat) {
    await p.tap('.nav .fab'); await wait(300);
    await p.tap(`[data-act="pick-cat"][data-k="${cat || 'tkuliah'}"]`); await wait(450);
  }
  try {
    await p.goto(base); await wait(1500);

    // ---- Poin 4: item ringkas ----
    const m = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#home-list .task')];
      const top = document.getElementById('home-top').getBoundingClientRect().bottom, navTop = document.querySelector('.nav').getBoundingClientRect().top;
      const cs = el => getComputedStyle(el);
      const r0 = rows[0], ck = r0.querySelector('.check').getBoundingClientRect();
      const hit = document.elementFromPoint(ck.left + ck.width / 2 + 18, ck.top + ck.height / 2);
      return {
        n: rows.length,
        heights: rows.map(r => Math.round(r.getBoundingClientRect().height)),
        visible: rows.filter(r => { const b = r.getBoundingClientRect(); return b.top >= top - 1 && b.bottom <= navTop + 1; }).length,
        nameFont: parseFloat(cs(r0.querySelector('.task-name')).fontSize),
        metaFont: parseFloat(cs(r0.querySelector('.task-meta')).fontSize),
        metaOneLine: rows.every(r => { const mm = r.querySelector('.task-meta'); return cs(mm).whiteSpace === 'nowrap' && cs(mm).textOverflow === 'ellipsis' && mm.getBoundingClientRect().height < 20; }),
        checkHit: !!hit && !!hit.closest('.check')
      };
    });
    assert.equal(m.n, 13, '12 tugas 10 Nov + 1 tugas 12 Nov');
    assert.ok(m.heights.every(h => h >= 44 && h <= 56), 'tinggi item 44–56px: ' + m.heights.join(','));
    assert.ok(m.visible >= 8 && m.visible <= 12, 'jumlah item yang terlihat penuh di layar 390×844: ' + m.visible);
    assert.ok(m.nameFont >= 14 && m.metaFont >= 12, 'font nama ≥14, detail ≥12');
    assert.equal(m.metaOneLine, true, 'baris info 1 baris + "…"');
    assert.equal(m.checkHit, true, 'area tap tombol centang lebih lebar dari lingkarannya (≥44px)');
    await shot('t2-01-item-ringkas');

    // ---- Poin 5: pop-up Urungkan + tombol × ----
    await p.tap('#home-list .task[data-id="t6"] .check'); await wait(300);
    assert.equal(await p.isVisible('#toast-btn'), true);
    assert.equal(await p.isVisible('#toast-x'), true, 'tombol × tampil');
    const tr = await rect('#toast'), fab = await rect('.nav .fab'), nav = await rect('.nav');
    assert.ok(tr.bottom <= fab.top - 6 && tr.bottom <= nav.top, 'pop-up tidak menutupi tombol + / navigasi: ' + JSON.stringify({ toast: tr.bottom, fab: fab.top, nav: nav.top }));
    await shot('t2-02-toast');
    await p.tap('#toast-x'); await wait(260);
    assert.equal(await p.evaluate(() => document.getElementById('toast').classList.contains('on')), false, '× langsung menutup pop-up');
    await wait(1200);
    assert.equal(row('t6')['Status'], 'Selesai', '× tidak membatalkan centang');
    // aksi baru saat pop-up masih tampil → pop-up diganti; Urungkan hanya membatalkan aksi terakhir
    await p.tap('#home-list .task[data-id="t7"] .check'); await wait(200);
    await p.tap('#home-list .task[data-id="t8"] .check'); await wait(200);
    assert.match(await p.textContent('#toast-msg'), /Belajar/, 'pop-up lama diganti yang baru');
    await p.tap('#toast-btn'); await wait(1500);
    assert.deepEqual([row('t7')['Status'], row('t8')['Status']], ['Selesai', 'Belum']);
    // hapus + Urungkan memakai komponen yang sama
    await p.tap('#home-list .task[data-id="t9"] .task-name'); await wait(350);
    await p.tap('[data-act="detail-delete"]'); await wait(300);
    await p.tap('#cf-yes'); await wait(300);
    assert.equal((await p.textContent('#toast-msg')).trim(), 'Tugas dihapus');
    assert.equal(await p.isVisible('#toast-x'), true);
    await p.tap('#toast-btn'); await wait(1500);
    assert.ok(row('t9'), 'Urungkan hapus mengembalikan tugas');

    // ---- Poin 1 + Poin 9: label & saran nama ----
    await openForm();
    assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('#task-form .fld > span')].slice(0, 2).map(s => s.textContent.trim())), ['Nama', 'Detail']);
    await p.focus('#f-name'); await p.keyboard.type('lap'); await wait(150);
    let sg = await sugState();
    assert.equal(sg.open, true, 'saran muncul saat mengetik');
    assert.equal(sg.items.length, 5, 'maks 5 saran');
    assert.ok(sg.items.every(x => /lap/i.test(x)), 'semua saran cocok: ' + sg.items.join(' | '));
    assert.equal(sg.items[0], 'Laporan 6', 'yang terbaru dulu');
    const sr = await rect('#f-sug'), nr = await rect('#f-name'), dr = await rect('#f-detail');
    assert.ok(sr.top >= nr.bottom && sr.bottom <= dr.top, 'daftar saran tidak menutupi kolom Nama/Detail');
    await shot('t2-03-saran');
    await p.tap('#f-sug .sug-i:nth-child(2)'); await wait(300);
    assert.equal(await p.inputValue('#f-name'), 'Laporan 5', 'tap saran mengisi nama');
    assert.equal((await sugState()).open, false);
    await p.keyboard.type(' x'); await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); await wait(100);
    await p.fill('#f-name', ''); await p.focus('#f-name'); await p.keyboard.type('rap'); await wait(150);
    assert.deepEqual((await sugState()).items, ['Rapat tim']);
    await p.keyboard.press('Escape'); await wait(150);
    assert.equal((await sugState()).open, false, 'Esc menutup saran');
    assert.equal(await p.evaluate(() => document.getElementById('form-wrap').classList.contains('open')), true, 'Esc tidak menutup form');
    await p.keyboard.type('a'); await wait(150);
    assert.equal((await sugState()).open, true);
    await p.tap('#f-detail'); await wait(400);
    sg = await sugState();
    assert.deepEqual([sg.open, sg.focus], [false, 'f-detail'], 'pindah kolom menutup saran, fokus pindah ke Detail');
    await p.evaluate(() => { const v = window.visualViewport; if (v) v.dispatchEvent(new Event('resize')); });

    // ---- Poin 2: kesulitan (tap saat saran terbuka tetap kena tombolnya) ----
    await p.fill('#f-name', ''); await p.focus('#f-name'); await p.keyboard.type('Lap'); await wait(150);
    assert.equal((await sugState()).open, true);
    await p.tap('[data-act="pick-diff"][data-v="sulit"]'); await wait(400);
    assert.equal((await sugState()).open, false);
    assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('#f-diff .on')].map(b => b.dataset.v)), ['sulit'], 'tap Sulit saat saran terbuka tetap memilih Sulit');
    await p.tap('[data-act="pick-diff"][data-v="mudah"]'); await p.tap('[data-act="pick-diff"][data-v="mudah"]');
    assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('#f-diff .on')].length), 0, 'tap lagi = kosongkan (opsional)');
    await p.tap('[data-act="pick-diff"][data-v="sulit"]');

    // ---- isian durasi ----
    assert.deepEqual([await p.inputValue('#f-start'), await p.inputValue('#f-end')], ['10:00', '11:00'], 'bawaan 1 jam');
    assert.equal((await p.textContent('#f-dur-txt')).trim(), 'Durasi 1 jam');
    assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('#f-dur .on')].map(b => b.dataset.m)), ['60']);
    await p.tap('[data-act="pick-dur"][data-m="120"]');
    assert.equal(await p.inputValue('#f-end'), '12:00');
    await p.fill('#f-start', '13:30'); await wait(100);
    assert.equal(await p.inputValue('#f-end'), '15:30', 'ganti jam mulai: durasi tetap 2 jam');
    await p.fill('#f-start', '23:00'); await wait(100);
    assert.equal(await p.inputValue('#f-end'), '01:00');
    assert.match(await p.textContent('#f-dur-txt'), /Durasi 2 jam · selesai besoknya/);
    await p.fill('#f-end', '23:45'); await wait(100);
    assert.equal((await p.textContent('#f-dur-txt')).trim(), 'Durasi 45 mnt');
    await p.fill('#f-name', 'Laporan baru');
    await shot('t2-04-form');
    await p.tap('#f-save'); await wait(1500);
    let r = rowByName('Laporan baru');
    assert.deepEqual([r['Kesulitan'], r['Jam mulai'], r['Jam selesai']], ['Sulit', '23:00', '23:45']);
    assert.equal(await p.textContent(`#home-list .task[data-id="${r.ID}"] .diff.sulit`), 'Sulit', 'label kesulitan di item');

    // ---- Poin 3: tanpa jam ----
    await openForm('belajar');
    await p.fill('#f-name', 'Baca bab 3');
    assert.equal(await p.isVisible('#f-time-box'), true);
    await p.tap('.opt-switch'); await wait(150);
    assert.equal(await p.isVisible('#f-time-box'), false, 'kolom jam & durasi disembunyikan');
    assert.equal(await p.isVisible('#f-notime-txt'), true);
    await p.tap('#f-save'); await wait(1500);
    r = rowByName('Baca bab 3');
    assert.deepEqual([r['Jam mulai'], r['Jam selesai'], r['Kesulitan']], ['', '', ''], 'tersimpan tanpa jam, kesulitan kosong');
    const grp = await p.evaluate(id => {
      const el = document.querySelector('#home-list .task[data-id="' + id + '"]'), box = el.closest('.ntbox');
      return { inBox: !!box, head: box && box.querySelector('.subhead').textContent.trim(), firstInDay: !!box && box.previousElementSibling.classList.contains('dhead'),
        meta: el.querySelector('.task-meta').textContent.trim() };
    }, r.ID);
    assert.deepEqual(grp, { inBox: true, head: 'Tanpa jam', firstInDay: true, meta: 'Sisa 14 jam·Belajar' }, 'tampil di bagian "Tanpa jam" di atas tugas berjam');
    await shot('t2-05-tanpa-jam');
    await p.tap(`#home-list .task[data-id="${r.ID}"] .task-name`); await wait(350);
    assert.match(await p.textContent('#detail'), /Jam pengerjaanTanpa jam/);
    await p.tap('[data-act="detail-edit"]'); await wait(600);
    assert.equal(await p.isChecked('#f-notime'), true, 'edit: Tanpa jam tetap aktif');
    await p.tap('.opt-switch'); await wait(100);
    await p.tap('#f-save'); await wait(1500);
    assert.equal(rowByName('Baca bab 3')['Jam mulai'], '08:00', 'Tanpa jam dimatikan → jam tersimpan lagi');
    // kalender: bagian Tanpa jam juga ada
    await openForm('belajar');
    await p.fill('#f-name', 'Tanpa jam kalender'); await p.tap('.opt-switch'); await p.tap('#f-save'); await wait(800);
    await p.click('#nav [data-view="kalender"]'); await wait(300);
    assert.equal(await p.locator('#cal-day-list .ntbox .task').count(), 1);

    // ---- edit tugas lama berjam mulai tanpa jam selesai → durasi bawaan 1 jam ----
    await p.click('#nav [data-view="tugas"]'); await wait(300);
    await p.tap('#home-list .task[data-id="tlama"] .task-name'); await wait(350);
    await p.tap('[data-act="detail-edit"]'); await wait(600);
    assert.deepEqual([await p.inputValue('#f-start'), await p.inputValue('#f-end'), (await p.textContent('#f-dur-txt')).trim()], ['08:00', '09:00', 'Durasi 1 jam']);
    assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('#f-diff .on')].length), 0);
    await p.tap('#form-wrap .sheet-top [data-act="form-collapse"]'); await wait(200);
    await p.tap('[data-act="add-cancel"]'); await wait(300);
    assert.equal(row('tlama')['Jam selesai'], '', 'tanpa disimpan, data lama tidak berubah');

    assert.deepEqual(errs, [], 'tidak ada error JavaScript');
  } finally {
    await close();
  }
});

test('E2E mode coba: tanpa daftar, data contoh, tidak menyentuh server maupun akun asli di HP', { skip: !pw && 'Playwright tidak terpasang', timeout: 120000 }, async () => {
  const S = makeRuntime();
  const reg = S.post('apiRegister', 'adit', '1234', 'Adit');
  const realLs = { 'pt.accounts': [{ id: reg.user.id, username: 'adit', name: 'Adit', token: reg.token }], 'pt.current': reg.user.id };
  const { p, base, st, errs, close, wait } = await open(S, { localStorage: realLs });
  const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  const ls = () => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
  const authOpen = () => p.evaluate(() => document.getElementById('auth').classList.contains('open'));
  const sheetRows = () => (S.sheet('@adit') ? S.sheet('@adit').objects().length : 0);
  try {
    // 1. alamat ?coba langsung membuka mode coba, walau HP ini punya akun asli
    await p.goto(base + '?coba'); await wait(1200);
    assert.equal(await authOpen(), false, 'tanpa layar masuk');
    assert.equal(await p.locator('#home-list .task').count(), 12, '12 contoh tugas (7–17 Nov)');
    assert.equal(await p.getAttribute('#sync-dot', 'title'), 'Mode coba: berisi contoh tugas dan tidak disimpan ke server');
    assert.equal((await p.textContent('#hdr-av')).trim(), 'T');
    assert.equal(await p.isVisible('#toast-btn'), true, 'pop-up mode coba punya tombol Daftar');
    await shot('coba-01-beranda');

    // 2. centang + tambah tugas berjalan normal, tanpa satu pun panggilan ke Apps Script
    await p.tap('#home-list .task[data-id="coba6"] .check'); await wait(1200);
    assert.equal(await p.evaluate(() => document.querySelector('#home-list .task[data-id="coba6"]').classList.contains('done')), true);
    await p.tap('.nav .fab'); await wait(300);
    await p.tap('[data-act="pick-cat"][data-k="tkuliah"]'); await wait(450);
    await p.fill('#f-name', 'Tugas dari pengunjung'); await p.tap('#f-save'); await wait(1200);
    assert.equal(await p.locator('#home-list .task-name', { hasText: 'Tugas dari pengunjung' }).count(), 1);
    assert.equal(st.calls, 0, 'mode coba tidak pernah memanggil Apps Script');
    assert.equal(sheetRows(), 0, 'spreadsheet tidak tersentuh');

    // 3. localStorage akun asli tidak berubah dan tidak ada data mode coba yang tersimpan
    const after = await ls();
    assert.equal(after['pt.accounts'], JSON.stringify(realLs['pt.accounts']));
    assert.equal(after['pt.current'], JSON.stringify(reg.user.id));
    assert.deepEqual(Object.keys(after).filter(k => /coba/.test(k)), [], 'tidak ada kunci mode coba di localStorage');

    // 4. fitur akun yang butuh server ditolak dengan pesan jelas
    await p.click('#nav [data-view="saya"]'); await wait(300);
    await p.tap('#me-body [data-act="change-pin"]'); await wait(400);
    await p.fill('#pin-old', '1234'); await p.fill('#pin-new', '5678'); await p.fill('#pin-new2', '5678');
    await p.tap('[data-act="pin-save"]'); await wait(400);
    assert.match(await p.textContent('#pin-err'), /mode coba/);
    await p.keyboard.press('Escape'); await wait(300);
    await p.click('#nav [data-view="tugas"]'); await wait(300);

    // 5. keluar dari mode coba → kembali ke akun asli, ?coba hilang dari alamat
    await p.tap('#hdr-av'); await wait(400);
    await p.tap('#acct-body [data-act="sign-out"]'); await wait(1500);
    assert.equal(new URL(p.url()).search, '', '?coba dibuang');
    assert.equal((await p.textContent('#hdr-av')).trim(), 'A', 'akun asli aktif lagi');
    assert.ok(st.calls > 0, 'akun asli memuat dari server seperti biasa');
    assert.equal(await p.locator('#home-list .task').count(), 0, 'data contoh tidak bocor ke akun asli');
    await p.reload(); await wait(1200);
    assert.equal((await p.textContent('#hdr-av')).trim(), 'A', 'muat ulang tetap di akun asli');

    // 6. pengunjung tanpa akun: tombol "Coba dulu tanpa daftar" di layar masuk
    await p.tap('#hdr-av'); await wait(400);
    await p.tap('#acct-body [data-act="sign-out"]'); await wait(400);
    await p.tap('#cf-yes'); await wait(800);
    assert.equal(await authOpen(), true);
    assert.equal(await p.isVisible('#auth-try'), true);
    await shot('coba-02-layar-masuk');
    const calls = st.calls;
    await p.tap('#auth-try'); await wait(1200);
    assert.equal(await authOpen(), false);
    assert.equal(await p.locator('#home-list .task').count(), 12);
    assert.equal(st.calls, calls, 'tetap tanpa panggilan server');

    assert.deepEqual(errs, [], 'tidak ada error JavaScript');
  } finally {
    await close();
  }
});

test('E2E Tahap 3: kategori custom (tambah, pakai, ubah, hapus + urungkan) dan riwayat per kategori di Grafik', { skip: !pw && 'Playwright tidak terpasang', timeout: 180000 }, async () => {
  const S = makeRuntime();
  const reg = S.post('apiRegister', 'adit', '1234', 'Adit');
  const T = (id, cat, date, start, extra) => Object.assign({ id, cat, name: 'Tugas ' + id, detail: '', date, start, end: start ? String(+start.slice(0, 2) + 1).padStart(2, '0') + ':00' : '', dlDate: '', dlTime: '', done: false, doneAt: null, doneBy: '', createdAt: 1762740000000, updatedAt: 1762740000000, kind: 'tugas', diff: '', parent: '', by: 'p1' }, extra || {});
  const D = { done: true, doneAt: 1762740000000, doneBy: 'p1' };
  S.post('apiSync', reg.token, [
    T('t1', 'tkuliah', '2026-11-03', '08:00', D),
    T('t2', 'tkuliah', '2026-11-05', '10:00', { dlDate: '2026-11-06', dlTime: '23:59' }),   // lewat deadline (sekarang 10 Nov)
    T('t3', 'tkuliah', '2026-11-12', '09:00'),
    T('t4', 'tkuliah', '2026-11-12', ''),                                                    // tanpa jam
    T('t5', 'tkerja', '2026-11-10', '13:00', D),
    T('t6', 'tkuliah', '2026-10-28', '08:00', D)                                             // bulan lalu → tidak ikut
  ].map(t => ({ op: 'upsert', task: t })));
  const { p, base, errs, close, wait } = await open(S, { localStorage: {
    'pt.accounts': [{ id: reg.user.id, username: 'adit', name: 'Adit', token: reg.token }], 'pt.current': reg.user.id } });
  const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  const isOpen = sel => p.evaluate(s => document.querySelector(s).classList.contains('open'), sel);
  const serverCats = () => (S.sheet('Kategori') ? S.sheet('Kategori').objects().map(o => [o['Nama'], o['Warna (hue)']]) : []);
  const rowByName = n => S.sheet('@adit').objects().find(o => o['Nama tugas'] === n);
  const txt = async sel => ((await p.locator(sel).first().textContent()) || '').trim();   // selektor Playwright (:has-text, :text-is)
  const catTiles = () => p.evaluate(() => [...document.querySelectorAll('#cat-grid .cat-btn.cu > span')].map(s => s.textContent));
  const back = async () => { await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await wait(350); };
  try {
    await p.goto(base); await wait(1500);

    // ---- Poin 10: tambah dari menu Saya → Kategori saya ----
    await p.click('#nav [data-view="saya"]'); await wait(300);
    await p.tap('#me-body [data-act="cats-manage"]'); await wait(400);
    assert.equal(await isOpen('#cats-wrap'), true);
    assert.match(await txt('#cats-body'), /Belum ada kategori buatanmu/);
    await p.tap('#cats-body [data-act="cat-new"]'); await wait(400);
    assert.equal(await isOpen('#import-wrap'), true, 'editor kategori terbuka di atas daftar');
    assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'kc-name', 'kolom nama langsung fokus');
    assert.equal(await p.locator('#kc-hues .hue.on').count(), 1, 'satu warna terpilih (bawaan)');
    await p.tap('[data-act="kc-save"]'); await wait(200);
    assert.match(await txt('#kc-err'), /wajib/);
    await p.fill('#kc-name', '  lainnya '); await p.tap('[data-act="kc-save"]'); await wait(200);
    assert.match(await txt('#kc-err'), /kategori bawaan/, 'nama kategori bawaan ditolak');
    await p.fill('#kc-name', 'Freelance'); await wait(100);
    assert.equal(await p.isVisible('#kc-err'), false, 'pesan error hilang saat mengetik');
    assert.equal(await txt('#kc-ic'), 'F', 'pratinjau huruf awal');
    await p.tap('#kc-hues [data-h="212"]'); await wait(100);
    assert.equal(await p.getAttribute('#kc-hues [data-h="212"]', 'aria-pressed'), 'true');
    await shot('t3-01-editor-kategori');
    await p.tap('[data-act="kc-save"]'); await wait(1500);
    assert.equal(await isOpen('#import-wrap'), false);
    assert.match(await txt('#cats-body'), /Freelance\s*0 tugas/);
    assert.deepEqual(serverCats(), [['Freelance', '212']], 'tersimpan di tab Kategori');
    // nama kembar dengan kategori custom lain ditolak (tidak peka huruf besar/kecil)
    await p.tap('#cats-body [data-act="cat-new"]'); await wait(400);
    await p.fill('#kc-name', 'FREELANCE'); await p.press('#kc-name', 'Enter'); await wait(200);
    assert.match(await txt('#kc-err'), /Sudah ada kategori bernama "Freelance"/);
    await back();
    assert.equal(await isOpen('#import-wrap'), false, 'back HP menutup editor');
    assert.equal(await isOpen('#cats-wrap'), true, 'daftar masih terbuka');
    await back();
    assert.equal(await isOpen('#cats-wrap'), false, 'back HP menutup daftar');
    assert.match(await txt('#me-body'), /1 kategori buatanmu/);

    // ---- layar +: kategori custom tampil di kedua tab; "Baru" langsung dipakai untuk tugas ----
    await p.click('#nav [data-view="tugas"]'); await wait(300);
    await p.tap('.nav .fab'); await wait(400);
    assert.deepEqual(await catTiles(), ['Freelance']);
    await p.tap('#add-seg [data-g="kegiatan"]'); await wait(150);
    assert.deepEqual(await catTiles(), ['Freelance'], 'tampil juga di tab Kegiatan');
    await p.tap('#add-seg [data-g="tugas"]'); await wait(150);
    await shot('t3-02-layar-plus');
    await p.tap('#cat-grid [data-act="cat-new"]'); await wait(400);
    await p.fill('#kc-name', 'Les Privat'); await p.tap('[data-act="kc-save"]'); await wait(600);
    assert.equal(await isOpen('#form-wrap'), true, 'form langsung terbuka dengan kategori baru');
    assert.equal(await txt('#f-cat-name'), 'Les Privat');
    assert.equal(await txt('#f-cat-ic'), 'L');
    await p.fill('#f-name', 'Les matematika Rina'); await p.tap('#f-save'); await wait(1500);
    const lesRow = '#home-list .task:has(.task-name:text-is("Les matematika Rina"))';
    assert.equal(await txt(lesRow + ' .cat-ic .cat-l'), 'L', 'ikon huruf awal di item tugas');
    assert.match(await txt(lesRow + ' .task-meta'), /Les Privat/);
    assert.equal(rowByName('Les matematika Rina')['Kategori'], 'Les Privat', 'server menyimpan nama kategori custom');
    assert.match(rowByName('Les matematika Rina')['Kode kategori'], /^c_[a-z0-9]+$/);
    // pakai kategori yang sudah ada
    await p.tap('.nav .fab'); await wait(400);
    await p.tap('#cat-grid .cat-btn.cu:has-text("Freelance")'); await wait(450);
    await p.fill('#f-name', 'Desain logo kedai'); await p.tap('#f-save'); await wait(1500);
    assert.equal(rowByName('Desain logo kedai')['Kategori'], 'Freelance');
    await shot('t3-04-beranda');

    // ---- ubah nama + warna (dari "Kelola" di layar +) ----
    await p.tap('.nav .fab'); await wait(400);
    await p.tap('#cat-grid [data-act="cats-manage"]'); await wait(400);
    assert.equal(await isOpen('#cats-wrap'), true, 'Kelola membuka daftar di atas layar +');
    await p.tap('#cats-body .acc-row:has-text("Freelance")'); await wait(400);
    assert.equal(await p.inputValue('#kc-name'), 'Freelance');
    assert.match(await txt('#import-body'), /1 tugas memakai kategori ini/);
    await p.fill('#kc-name', 'Freelance Desain'); await p.tap('#kc-hues [data-h="140"]'); await p.tap('[data-act="kc-save"]'); await wait(300);
    assert.deepEqual(await catTiles(), ['Freelance Desain', 'Les Privat'], 'grid layar + ikut berubah');
    await back(); await back();
    assert.equal(await isOpen('#add-screen'), false);
    await wait(1200);
    assert.match(await txt('#home-list .task:has(.task-name:text-is("Desain logo kedai")) .task-meta'), /Freelance Desain/, 'item tugas ikut nama baru');
    assert.equal(rowByName('Desain logo kedai')['Kategori'], 'Freelance Desain', 'kolom Kategori di sheet ikut nama baru');
    assert.deepEqual(serverCats(), [['Freelance Desain', '140'], ['Les Privat', '0']], 'warna bawaan Les Privat = warna palet pertama yang belum dipakai');

    // ---- hapus: tugas pindah ke "Lainnya", bisa diurungkan ----
    await p.click('#nav [data-view="saya"]'); await wait(300);
    await p.tap('#me-body [data-act="cats-manage"]'); await wait(400);
    await shot('t3-05-kategori-saya');
    await p.tap('#cats-body .acc-row:has-text("Les Privat")'); await wait(400);
    await p.tap('[data-act="kc-del"]'); await wait(300);
    assert.equal(await isOpen('#confirm-wrap'), true);
    await shot('t3-06-konfirmasi-hapus');
    assert.match(await txt('#cf-msg'), /1 tugas di dalamnya pindah ke kategori "Lainnya"/);
    await p.tap('#cf-yes'); await wait(300);
    assert.equal(await isOpen('#import-wrap'), false);
    assert.doesNotMatch(await txt('#cats-body'), /Les Privat/);
    assert.equal(await p.isVisible('#toast-btn'), true, 'pop-up Urungkan');
    await p.tap('#toast-btn'); await wait(1500);
    assert.match(await txt('#cats-body'), /Les Privat\s*1 tugas/, 'urungkan: kategori dan tugasnya kembali');
    assert.equal(rowByName('Les matematika Rina')['Kategori'], 'Les Privat');
    await p.tap('#cats-body .acc-row:has-text("Les Privat")'); await wait(400);
    await p.tap('[data-act="kc-del"]'); await wait(300); await p.tap('#cf-yes'); await wait(300);
    await p.tap('#toast-x'); await wait(1500);
    assert.deepEqual(serverCats(), [['Freelance Desain', '140']], 'kategori terhapus di server');
    const moved = rowByName('Les matematika Rina');
    assert.ok(moved, 'tugasnya TIDAK ikut terhapus');
    assert.deepEqual([moved['Kode kategori'], moved['Kategori']], ['lain_t', 'Lainnya']);
    await back();
    await p.click('#nav [data-view="tugas"]'); await wait(300);
    assert.match(await txt('#home-list .task:has(.task-name:text-is("Les matematika Rina")) .task-meta'), /Lainnya/);

    // ---- Poin 8: riwayat per kategori di Grafik ----
    await p.click('#nav [data-view="grafik"]'); await wait(500);
    const crows = await p.evaluate(() => [...document.querySelectorAll('#stats-body .crow')].map(b => ({ tag: b.tagName, k: b.dataset.k, n: b.querySelector('.l1 b').textContent, h: b.getBoundingClientRect().height })));
    assert.ok(crows.length >= 3 && crows.every(c => c.tag === 'BUTTON' && c.h >= 44), 'setiap baris Per kategori bisa di-tap: ' + JSON.stringify(crows));
    assert.equal(crows.find(c => c.k === 'tkuliah').n, '4 tugas', 't6 (Oktober) tidak ikut');
    if (SHOTS) { await p.evaluate(() => document.querySelector('#stats-body .sec-title').scrollIntoView()); await wait(200); await shot('t3-07-grafik-per-kategori'); }
    await p.tap('#stats-body .crow[data-k="tkuliah"]'); await wait(450);
    assert.equal(await isOpen('#cathist-screen'), true);
    const hist = () => p.evaluate(() => [...document.querySelectorAll('#ch-list .hrow')].map(r => ({ id: r.dataset.id, name: r.querySelector('b').textContent, when: r.querySelector('small').textContent, st: r.querySelector('.h-st').textContent })));
    let h = await hist();
    assert.deepEqual(h.map(r => r.id), ['t4', 't3', 't2', 't1'], 'terbaru dulu');
    assert.deepEqual(h.map(r => r.st), ['Belum', 'Belum', 'Terlambat', 'Selesai'], 'status tiap item');
    assert.deepEqual([h[0].name, h[1].when, h[3].when], ['Tugas t4', 'Kam, 12 Nov 2026 · 09:00', 'Sel, 3 Nov 2026 · 08:00'], 'nama + tanggal');
    assert.match(await txt('#ch-title'), /Tugas Kuliah\s*November 2026 · 4 tugas · 1 selesai/);
    await shot('t3-03-riwayat-kategori');
    // tap item → detail (di atas riwayat); centang dari detail → riwayat ikut berubah
    await p.tap('#ch-list .hrow[data-id="t3"]'); await wait(400);
    assert.equal(await isOpen('#detail-wrap'), true);
    await p.tap('[data-act="detail-toggle"]'); await wait(300);
    await back();
    assert.equal(await isOpen('#detail-wrap'), false);
    assert.equal(await isOpen('#cathist-screen'), true, 'back pertama hanya menutup detail');
    h = await hist();
    assert.equal(h.find(r => r.id === 't3').st, 'Selesai');
    // Edit dari riwayat → layar + tampil DI DEPAN riwayat
    await p.tap('#ch-list .hrow[data-id="t4"]'); await wait(400);
    await p.tap('[data-act="detail-edit"]'); await wait(700);
    assert.equal(await isOpen('#form-wrap'), true);
    await p.tap('#form-wrap .sheet-top [data-act="form-collapse"]'); await wait(400);
    assert.equal(await p.evaluate(() => !!document.elementFromPoint(195, 420).closest('#add-screen')), true, 'layar + di atas riwayat');
    await p.tap('[data-act="add-cancel"]'); await wait(400);
    assert.equal(await isOpen('#cathist-screen'), true);
    // tombol kembali
    await p.tap('[data-act="close-cathist"]'); await wait(350);
    assert.equal(await isOpen('#cathist-screen'), false);
    // periode & filter mengikuti grafik
    await p.tap('#st-filter [data-f="belum"]'); await wait(300);
    assert.equal(await p.evaluate(() => document.querySelector('#stats-body .crow[data-k="tkuliah"] .l1 b').textContent), '2 tugas');
    await p.tap('#stats-body .crow[data-k="tkuliah"]'); await wait(400);
    h = await hist();
    assert.deepEqual(h.map(r => r.id), ['t4', 't2'], 'filter Belum: hanya yang belum selesai');
    assert.match(await txt('#ch-title'), /2 belum selesai/);
    await back();
    assert.equal(await isOpen('#cathist-screen'), false, 'back HP menutup riwayat');
    await p.tap('#st-filter [data-f="semua"]'); await wait(200);
    await p.tap('#mtabs [data-m="2026-10"]'); await wait(300);
    await p.tap('#stats-body .crow[data-k="tkuliah"]'); await wait(400);
    h = await hist();
    assert.deepEqual(h.map(r => r.id), ['t6'], 'periode Oktober');
    await back();
    // kategori custom muncul di Grafik dan riwayatnya bisa dibuka
    await p.tap('#mtabs [data-m="2026-11"]'); await wait(300);
    const fk = await p.evaluate(() => { const b = [...document.querySelectorAll('#stats-body .crow')].find(x => /Freelance Desain/.test(x.textContent)); return b && b.dataset.k; });
    assert.match(fk || '', /^c_/, 'kategori custom tampil di Per kategori');
    await p.tap('#stats-body .crow[data-k="' + fk + '"]'); await wait(400);
    assert.deepEqual((await hist()).map(r => r.name), ['Desain logo kedai']);
    assert.equal(await txt('#ch-title .cat-ic'), 'F');

    // tetap tersimpan setelah muat ulang
    await p.reload(); await wait(1500);
    await p.click('#nav [data-view="saya"]'); await wait(300);
    assert.match(await txt('#me-body'), /1 kategori buatanmu/);

    assert.deepEqual(errs, [], 'tidak ada error JavaScript');
  } finally {
    await close();
  }
});
