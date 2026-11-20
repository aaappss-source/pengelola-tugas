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
    await p.tap('.opt-switch:has(#f-notime)'); await wait(150);
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
    await p.tap('.opt-switch:has(#f-notime)'); await wait(100);
    await p.tap('#f-save'); await wait(1500);
    assert.equal(rowByName('Baca bab 3')['Jam mulai'], '08:00', 'Tanpa jam dimatikan → jam tersimpan lagi');
    // kalender: bagian Tanpa jam juga ada
    await openForm('belajar');
    await p.fill('#f-name', 'Tanpa jam kalender'); await p.tap('.opt-switch:has(#f-notime)'); await p.tap('#f-save'); await wait(800);
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
    assert.equal(await p.evaluate(() => new Set([...document.querySelectorAll('#home-list .task')].map(x => x.dataset.id)).size), 12, '12 contoh tugas (7–17 Nov)');
    assert.equal(await p.locator('#home-list .task').count(), 15, 'Tahap 5: 2 contoh multi-hari (3 hari + 2 hari) tampil di setiap harinya');
    assert.equal((await p.textContent('#h-total')).trim(), '12', 'tetap dihitung 12');
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
    assert.equal(await p.locator('#home-list .task').count(), 15);
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

test('E2E Tahap 4: beberapa tanggal (Poin 12) dan banyak form tugas (Poin 13), simpan sekaligus', { skip: !pw && 'Playwright tidak terpasang', timeout: 240000 }, async () => {
  const S = makeRuntime();
  const reg = S.post('apiRegister', 'adit', '1234', 'Adit');
  const { p, base, st, errs, close, wait } = await open(S, { localStorage: {
    'pt.accounts': [{ id: reg.user.id, username: 'adit', name: 'Adit', token: reg.token }], 'pt.current': reg.user.id } });
  const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  const isOpen = sel => p.evaluate(s => document.querySelector(s).classList.contains('open'), sel);
  const rows = () => (S.sheet('@adit') ? S.sheet('@adit').objects() : []);
  const named = n => rows().filter(o => o['Nama tugas'] === n).sort((a, b) => (a['Tanggal'] < b['Tanggal'] ? -1 : 1));
  const txt = async sel => ((await p.locator(sel).first().textContent()) || '').trim();
  const vis = sel => p.isVisible(sel);
  const back = async () => { await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await wait(350); };
  const openForm = async cat => { await p.tap('.nav .fab'); await wait(350); await p.tap(`[data-act="pick-cat"][data-k="${cat}"]`); await wait(450); };
  const day = d => p.tap(`#f-mcal-grid [data-d="${d}"]`);
  const cards = () => p.evaluate(() => [...document.querySelectorAll('#f-pre .f-card, #f-post .f-card')].map(c => ({
    name: c.querySelector('b').textContent, meta: c.querySelector('small').textContent, bad: c.classList.contains('bad'), pre: !!c.closest('#f-pre') })));
  try {
    await p.goto(base); await wait(1500);

    // ================= Poin 12: satu tugas untuk beberapa tanggal =================
    await openForm('tkuliah');
    assert.equal(await vis('#f-multi-row'), true, 'opsi "Beberapa tanggal" ada di form buat tugas');
    assert.deepEqual([await vis('#f-mcal'), await vis('#f-one'), await vis('#f-more'), await vis('#f-ed-head')], [false, true, true, false]);
    assert.equal(await txt('#f-save'), 'Simpan');
    await p.fill('#f-name', 'Piket kelas');
    await p.tap('.opt-switch:has(#f-multi)'); await wait(150);
    assert.deepEqual([await vis('#f-mcal'), await vis('#f-one')], [true, false], 'kalender multi-pilih menggantikan kolom tanggal');
    assert.equal(await txt('#f-mcal-m'), 'November 2026');
    assert.equal(await txt('#f-mcal-n'), '1 tanggal dipilih', 'tanggal form (hari ini) langsung terpilih');
    assert.equal(await p.getAttribute('#f-mcal-grid [data-d="2026-11-10"]', 'aria-pressed'), 'true');
    await day('2026-11-12'); await day('2026-11-17'); await wait(100);
    assert.equal(await txt('#f-mcal-n'), '3 tanggal dipilih');
    assert.equal(await txt('#f-save'), 'Simpan 3 tugas');
    await day('2026-11-17'); await wait(80);
    assert.equal(await txt('#f-mcal-n'), '2 tanggal dipilih', 'tap lagi = batal');
    assert.equal(await p.getAttribute('#f-mcal-grid [data-d="2026-11-17"]', 'aria-pressed'), 'false');
    await day('2026-11-17');
    await p.tap('[data-act="mcal-nav"][data-d="1"]'); await wait(80);
    assert.equal(await txt('#f-mcal-m'), 'Desember 2026');
    await day('2026-12-01'); await wait(80);
    assert.equal(await txt('#f-mcal-n'), '4 tanggal dipilih (3 di bulan lain)');
    await p.tap('[data-act="mcal-nav"][data-d="-1"]'); await wait(80);
    // tugas lain di form: jam & deadline (deadline ikut tiap tanggal: jarak hari + jam)
    await p.fill('#f-start', '07:00'); await p.fill('#f-end', '07:30');
    assert.equal(await p.isChecked('#f-dl-on'), true, 'deadline bawaan ON untuk kelompok Tugas');
    assert.deepEqual([await vis('#f-dl-date'), await vis('#f-dl-off'), await vis('#f-dl-hint')], [false, true, true]);
    assert.equal(await p.inputValue('#f-dl-off'), '0', 'bawaan: hari yang sama');
    await p.selectOption('#f-dl-off', '1'); await p.fill('#f-dl-time', '12:00');
    await p.tap('[data-act="pick-diff"][data-v="mudah"]');
    await p.locator('#f-mcal').scrollIntoViewIfNeeded();
    await shot('t4-01-beberapa-tanggal');
    await p.tap('#f-save'); await wait(1500);
    assert.equal(await isOpen('#add-screen'), false);
    assert.equal(await txt('#toast-msg'), '4 tugas ditambahkan');
    assert.equal(await vis('#toast-btn'), true, 'banyak tugas → bisa diurungkan');
    const piket = named('Piket kelas');
    assert.deepEqual(piket.map(o => [o['Tanggal'], o['Jam mulai'], o['Jam selesai'], o['Deadline (tanggal)'], o['Deadline (jam)'], o['Kode kategori'], o['Kesulitan']]), [
      ['2026-11-10', '07:00', '07:30', '2026-11-11', '12:00', 'tkuliah', 'Mudah'], ['2026-11-12', '07:00', '07:30', '2026-11-13', '12:00', 'tkuliah', 'Mudah'],
      ['2026-11-17', '07:00', '07:30', '2026-11-18', '12:00', 'tkuliah', 'Mudah'], ['2026-12-01', '07:00', '07:30', '2026-12-02', '12:00', 'tkuliah', 'Mudah']],
      'satu tugas terpisah per tanggal, isi sama, deadline per tanggal');
    assert.equal(new Set(piket.map(o => o.ID)).size, 4);
    // deadline +1 hari → sejak Tahap 5 tiap tugas tampil 2 hari (tanggalnya + deadline-nya), tetap tugas terpisah
    assert.equal(await p.evaluate(() => new Set([...document.querySelectorAll('#home-list .task')].map(x => x.dataset.id)).size), 3, '3 tugas di November tampil di daftar');
    assert.equal(await p.locator('#home-list .task').count(), 6, 'Tahap 5: tiap tugas tampil di tanggalnya dan tanggal deadline-nya');
    await shot('t4-02-home-setelah-simpan');

    // setiap tugas berdiri sendiri: centang satu, hapus satu, edit satu
    const [k10, k12, k17, k01] = piket.map(o => o.ID);
    await p.tap(`#home-list .task[data-id="${k12}"] .check`); await wait(1500);
    assert.deepEqual(named('Piket kelas').map(o => o['Status']), ['Belum', 'Selesai', 'Belum', 'Belum'], 'centang satu tidak ikut yang lain');
    await p.tap(`#home-list .task[data-id="${k17}"]`); await wait(400);
    await p.tap('[data-act="detail-delete"]'); await wait(300); await p.tap('[data-act="confirm-yes"]'); await wait(1500);
    assert.deepEqual(named('Piket kelas').map(o => o.ID), [k10, k12, k01], 'hapus satu tidak ikut yang lain');
    await p.tap(`#home-list .task[data-id="${k10}"]`); await wait(400);
    await p.tap('[data-act="detail-edit"]'); await wait(700);
    assert.equal(await isOpen('#form-wrap'), true);
    assert.deepEqual([await vis('#f-multi-row'), await vis('#f-more'), await txt('#f-save')], [false, false, 'Simpan perubahan'], 'edit = satu tugas saja');
    await p.fill('#f-name', 'Piket kelas (ganti hari)'); await p.tap('#f-save'); await wait(1500);
    assert.deepEqual(rows().filter(o => o['Nama tugas'].startsWith('Piket')).map(o => o['Nama tugas']).sort(), ['Piket kelas', 'Piket kelas', 'Piket kelas (ganti hari)'], 'edit satu tidak ikut yang lain');

    // urungkan simpan banyak → semua tugas yang baru dibuat hilang lagi
    await openForm('belajar');
    await p.fill('#f-name', 'Coba urungkan');
    await p.tap('.opt-switch:has(#f-multi)'); await day('2026-11-20'); await wait(80);
    assert.equal(await txt('#f-save'), 'Simpan 2 tugas');
    await p.tap('#f-save'); await wait(1300);
    assert.equal(named('Coba urungkan').length, 2);
    await p.tap('#toast-btn'); await wait(1500);
    assert.equal(named('Coba urungkan').length, 0, 'urungkan menghapus semua tugas dari simpan itu');

    // "Beberapa tanggal" tanpa tanggal → ditandai, tidak disimpan
    const before = rows().length;
    await openForm('belajar');
    await p.fill('#f-name', 'Tanpa tanggal');
    await p.tap('.opt-switch:has(#f-multi)'); await p.tap('[data-act="mcal-clear"]'); await wait(80);
    assert.equal(await txt('#f-mcal-n'), 'Belum ada tanggal dipilih');
    await p.tap('#f-save'); await wait(600);
    assert.equal(await isOpen('#form-wrap'), true, 'form tetap terbuka');
    assert.equal(await txt('#f-date-err'), 'Pilih minimal 1 tanggal.');
    await day('2026-11-11'); await wait(80);
    assert.equal(await vis('#f-date-err'), false, 'pesan hilang setelah memilih');
    // matikan lagi → kembali ke satu tanggal (tanggal pilihan pertama)
    await p.tap('.opt-switch:has(#f-multi)'); await wait(80);
    assert.deepEqual([await vis('#f-one'), await p.inputValue('#f-date'), await txt('#f-save')], [true, '2026-11-11', 'Simpan']);
    await p.tap('#f-save'); await wait(1500);
    assert.equal(rows().length, before + 1);
    assert.equal(named('Tanpa tanggal')[0]['Tanggal'], '2026-11-11');

    // ================= Poin 13: banyak form tugas =================
    await openForm('tkerja');
    await p.fill('#f-name', 'Kirim laporan');
    await p.fill('#f-start', '09:00'); await p.fill('#f-end', '10:00');
    await p.tap('#f-more'); await wait(350);
    assert.deepEqual(await cards(), [{ name: 'Kirim laporan', meta: 'Tugas 1 · Hari ini · 09:00–10:00', bad: false, pre: true }], 'form 1 jadi ringkas di atas');
    assert.equal(await txt('#f-ed-n'), 'Tugas 2 dari 2');
    assert.equal(await p.inputValue('#f-name'), '', 'nama kosong');
    assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'f-name', 'kolom nama langsung fokus');
    assert.deepEqual([await p.inputValue('#f-start'), await p.inputValue('#f-end'), await txt('#f-cat-name'), await p.inputValue('#f-date')], ['10:00', '11:00', 'Tugas Kerjaan', '2026-11-10'],
      'salinan form sebelumnya, jam berurutan');
    assert.equal(await txt('#f-save'), 'Simpan 2 tugas');
    // ganti kategori form 2 saja
    await p.tap('.form-cat [data-act="form-collapse"]'); await wait(400);
    assert.equal(await txt('#add-hint'), 'Pilih kategori untuk Tugas 2');
    await p.tap('[data-act="pick-cat"][data-k="belanja"]'); await wait(450);
    assert.equal(await txt('#f-cat-name'), 'Belanja');
    assert.equal(await txt('#f-ed-n'), 'Tugas 2 dari 2');
    // form 3: beberapa tanggal di dalam form tambahan (K4)
    await p.tap('#f-more'); await wait(350);
    assert.equal(await txt('#f-cat-name'), 'Belanja', 'kategori ikut form sebelumnya');
    assert.deepEqual([await p.inputValue('#f-start'), await p.inputValue('#f-end')], ['11:00', '12:00']);
    await p.fill('#f-name', 'Bayar listrik');
    await p.tap('.opt-switch:has(#f-multi)'); await day('2026-11-15'); await wait(80);
    assert.equal(await txt('#f-save'), 'Simpan 4 tugas', '1 + 1 + 2 tanggal');
    // simpan saat form 2 belum bernama → tidak ada yang tersimpan, form 2 dibuka & ditandai
    const n0 = rows().length;
    await p.tap('#f-save'); await wait(700);
    assert.equal(rows().length, n0, 'satu form belum lengkap → tidak ada yang disimpan');
    assert.equal(await isOpen('#form-wrap'), true);
    assert.equal(await txt('#f-ed-n'), 'Tugas 2 dari 3', 'form yang belum lengkap dibuka');
    assert.equal(await txt('#f-name-err'), 'Nama wajib diisi.');
    assert.equal(await vis('#f-batch-err'), false, 'satu form: pesan di kolomnya saja');
    assert.deepEqual((await cards()).map(c => [c.name, c.bad]), [['Kirim laporan', false], ['Bayar listrik', false]]);
    // dua form belum lengkap → keduanya ditandai merah + pesan di atas Simpan
    await p.tap('#f-pre [data-act="item-open"]'); await wait(300);
    assert.equal(await txt('#f-ed-n'), 'Tugas 1 dari 3');
    assert.equal(await p.inputValue('#f-name'), 'Kirim laporan', 'isi form 1 tetap');
    await p.fill('#f-name', '');
    await p.tap('#f-save'); await wait(700);
    assert.equal(rows().length, n0);
    assert.equal(await txt('#f-ed-n'), 'Tugas 1 dari 3');
    assert.deepEqual((await cards()).map(c => [c.name, c.bad, c.meta]), [['Belum ada nama', true, 'Tugas 2 · Nama wajib diisi.'], ['Bayar listrik', false, 'Tugas 3 · 2 tanggal · 10 Nov – 15 Nov · 11:00–12:00']]);
    assert.match(await txt('#f-batch-err'), /2 form belum lengkap/);
    await shot('t4-03-form-belum-lengkap');
    await p.fill('#f-name', 'Kirim laporan');
    await p.tap('#f-post [data-act="item-open"][data-i="1"]'); await wait(300);
    assert.equal(await txt('#f-ed-n'), 'Tugas 2 dari 3');
    assert.equal(await txt('#f-name-err'), 'Nama wajib diisi.', 'tanda tetap saat dibuka');
    await p.fill('#f-name', 'Beli galon'); await wait(80);
    assert.equal(await vis('#f-name-err'), false);
    // form 4 lalu hapus (×) + urungkan, lalu hapus lagi dari ringkasannya
    await p.tap('#f-more'); await wait(300);
    await p.fill('#f-name', 'Hapus aku');
    await p.tap('#f-ed-head [data-act="item-del"]'); await wait(250);
    assert.equal(await txt('#f-ed-n'), 'Tugas 3 dari 3', 'form yang terbuka dihapus → form sebelumnya terbuka');
    assert.match(await txt('#toast-msg'), /Form "Hapus aku" dihapus/);
    await p.tap('#toast-btn'); await wait(250);
    assert.deepEqual((await cards()).map(c => c.name), ['Kirim laporan', 'Beli galon', 'Hapus aku'], 'urungkan mengembalikan form');
    assert.equal(await txt('#f-ed-n'), 'Tugas 3 dari 4');
    await p.tap('#f-post [data-act="item-del"][data-i="3"]'); await wait(250);
    assert.deepEqual((await cards()).map(c => c.name), ['Kirim laporan', 'Beli galon']);
    assert.equal(await txt('#f-ed-n'), 'Tugas 3 dari 3');
    await p.locator('#f-ed').scrollIntoViewIfNeeded();
    await shot('t4-04-banyak-form');
    await p.evaluate(() => { document.querySelector('#form-wrap .sheet').scrollTop = 0; }); await wait(100);
    await shot('t4-05-ringkasan-atas');
    await p.setViewportSize({ width: 360, height: 740 }); await wait(150);
    await p.evaluate(() => { const s = document.querySelector('#form-wrap .sheet'); s.scrollTop = s.scrollHeight; }); await wait(100);
    await shot('t4-06-bawah-360');
    assert.equal(await p.evaluate(() => { const s = document.querySelector('#form-wrap .sheet'); return s.scrollWidth <= s.clientWidth; }), true, 'tidak ada geser ke samping di layar 360px');
    await p.tap('#f-pre [data-act="item-open"][data-i="0"]'); await wait(300);
    await p.tap('.opt-switch:has(#f-multi)'); await wait(100);
    await p.locator('#f-mcal').scrollIntoViewIfNeeded(); await shot('t4-07-kalender-360');
    const cell = await p.locator('#f-mcal-grid .md').first().boundingBox();
    assert.ok(cell.height >= 44 && cell.width >= 40, 'tanggal di kalender mudah dipencet (' + cell.width + '×' + cell.height + ')');
    await p.tap('.opt-switch:has(#f-multi)'); await wait(100);
    await p.setViewportSize({ width: 390, height: 844 }); await wait(150);
    await p.tap('#f-save'); await wait(1500);
    assert.equal(await isOpen('#add-screen'), false);
    assert.equal(await txt('#toast-msg'), '4 tugas ditambahkan');
    assert.deepEqual(rows().length, n0 + 4);
    const pick = o => [o['Nama tugas'], o['Kode kategori'], o['Tanggal'], o['Jam mulai'], o['Jam selesai']];
    assert.deepEqual([...named('Kirim laporan'), ...named('Beli galon'), ...named('Bayar listrik')].map(pick), [
      ['Kirim laporan', 'tkerja', '2026-11-10', '09:00', '10:00'], ['Beli galon', 'belanja', '2026-11-10', '10:00', '11:00'],
      ['Bayar listrik', 'belanja', '2026-11-10', '11:00', '12:00'], ['Bayar listrik', 'belanja', '2026-11-15', '11:00', '12:00']], 'kategori per form');
    assert.equal(st.calls > 0, true);

    // batal saat ada beberapa form → tanya dulu (Batal maupun tombol back HP); maks 10 form
    await openForm('tkuliah');
    for (let i = 0; i < 9; i++) { await p.tap('#f-more'); await wait(120); }
    assert.equal(await txt('#f-ed-n'), 'Tugas 10 dari 10');
    assert.deepEqual([await vis('#f-more'), await txt('#f-more-max')], [false, 'Maksimal 10 form sekali simpan.']);
    await back();
    assert.deepEqual([await isOpen('#form-wrap'), await isOpen('#add-screen')], [false, true], 'back #1: kembali ke pilihan kategori, form tetap ada');
    await back();
    assert.equal(await isOpen('#confirm-wrap'), true, 'back #2: tanya dulu');
    assert.match(await txt('#cf-title'), /Buang 10 tugas/);
    await p.tap('#confirm-wrap .btn-sec[data-act="confirm-no"]'); await wait(300);
    assert.equal(await isOpen('#add-screen'), true, 'tidak jadi → isian tetap');
    await p.tap('[data-act="pick-cat"][data-k="tkuliah"]'); await wait(400);
    assert.equal(await txt('#f-ed-n'), 'Tugas 10 dari 10');
    await p.tap('.form-cat [data-act="form-collapse"]'); await wait(300);
    await p.tap('[data-act="add-cancel"]'); await wait(300);
    assert.equal(await isOpen('#confirm-wrap'), true, 'tombol Batal juga bertanya');
    await p.tap('[data-act="confirm-yes"]'); await wait(400);
    assert.equal(await isOpen('#add-screen'), false);
    assert.equal(rows().length, n0 + 4, 'tidak ada yang tersimpan');
    // satu form saja → Batal langsung menutup seperti dulu
    await openForm('tkuliah');
    await p.tap('.form-cat [data-act="form-collapse"]'); await wait(300);
    await p.tap('[data-act="add-cancel"]'); await wait(300);
    assert.deepEqual([await isOpen('#confirm-wrap'), await isOpen('#add-screen')], [false, false]);

    // muat ulang: semuanya tetap
    await p.reload(); await wait(1500);
    // (tugas multi-hari tampil di beberapa tanggal, jadi yang dihitung ID unik)
    assert.equal(await p.evaluate(() => new Set([...document.querySelectorAll('#home-list .task')].map(x => x.dataset.id)).size), rows().filter(o => o['Tanggal'].startsWith('2026-11')).length);
    assert.deepEqual(errs, [], 'tidak ada error JavaScript');
  } finally { await close(); }
});

test('E2E antrean offline lebih dari 1000 perubahan: terkirim bertahap, tidak ada yang hilang', { skip: !pw && 'Playwright tidak terpasang', timeout: 120000 }, async () => {
  // Code.gs hanya memproses 1000 op per kirim; sebelum Tahap 4 aplikasi menganggap semuanya terkirim → kelebihannya hilang
  const S = makeRuntime();
  const reg = S.post('apiRegister', 'adit', '1234', 'Adit');
  const N = 1205;
  const tasks = {}, ops = [];
  for (let i = 0; i < N; i++) {
    const t = { id: 'q' + i, cat: 'tkuliah', name: 'Antre ' + i, detail: '', date: '2026-10-' + String(1 + (i % 28)).padStart(2, '0'), start: '', end: '',
      dlDate: '', dlTime: '', done: false, doneAt: null, createdAt: 1762740000000 + i, updatedAt: 1762740000000 + i, kind: 'tugas', diff: '', parent: '', by: 'p1', doneBy: '' };
    tasks[t.id] = t; ops.push({ op: 'upsert', task: t });
  }
  const { p, base, st, errs, close, wait } = await open(S, { localStorage: {
    'pt.accounts': [{ id: reg.user.id, username: 'adit', name: 'Adit', token: reg.token }], 'pt.current': reg.user.id,
    ['pt.cache.' + reg.user.id]: { v: 2, tasks, ops, cats: [], profiles: [{ id: 'p1', name: 'Adit', avatar: '' }] } } });
  try {
    await p.goto(base);
    for (let i = 0; i < 40 && S.sheet('@adit').objects().length < N; i++) await wait(500);
    assert.equal(S.sheet('@adit').objects().length, N, 'semua perubahan sampai di server');
    await wait(800);
    const left = await p.evaluate(id => JSON.parse(localStorage.getItem('pt.cache.' + id)).ops.length, reg.user.id);
    assert.equal(left, 0, 'antrean kosong');
    assert.ok(st.calls >= 3, 'dikirim bertahap (' + st.calls + ' panggilan)');
    assert.match(await p.getAttribute('#sync-dot', 'class'), /\bok\b/);
    assert.deepEqual(errs, []);
  } finally { await close(); }
});

test('E2E Tahap 5: tugas multi-hari (Poin 15) tampil di setiap tanggal, tetap satu tugas', { skip: !pw && 'Playwright tidak terpasang', timeout: 240000 }, async () => {
  const S = makeRuntime();
  const reg = S.post('apiRegister', 'adit', '1234', 'Adit');
  const T = (id, name, date, start, dlDate, extra) => Object.assign({ id, cat: 'tkuliah', name, detail: '', date, start, end: start ? String(+start.slice(0, 2) + 2).padStart(2, '0') + ':00' : '',
    dlDate: dlDate || '', dlTime: dlDate ? '17:00' : '', done: false, doneAt: null, doneBy: '', createdAt: 1762740000000, updatedAt: 1762740000000, kind: 'tugas', diff: '', parent: '', by: 'p1' }, extra || {});
  S.post('apiSync', reg.token, [
    T('m1', 'Makalah DE', '2026-11-09', '13:00', '2026-11-11'),        // 3 hari, hari ini (10 Nov) hari ke-2
    T('x1', 'Lintas bulan', '2026-11-29', '', '2026-12-02'),            // 29 Nov – 2 Des, tanpa jam
    T('o1', 'Dari Oktober', '2026-10-30', '08:00', '2026-11-01'),       // mulai bulan lalu
    T('s1', 'Biasa', '2026-11-10', '10:00', '2026-11-10'),              // deadline hari yang sama = 1 hari
    T('e1', 'Deadline lebih awal', '2026-11-20', '09:00', '2026-11-18') // deadline sebelum tanggal = tetap 1 hari
  ].map(t => ({ op: 'upsert', task: t })));
  const { p, base, errs, close, wait } = await open(S, { localStorage: {
    'pt.accounts': [{ id: reg.user.id, username: 'adit', name: 'Adit', token: reg.token }], 'pt.current': reg.user.id } });
  const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  const isOpen = sel => p.evaluate(s => document.querySelector(s).classList.contains('open'), sel);
  const rows = () => S.sheet('@adit').objects();
  const row = id => rows().find(o => o.ID === id);
  const txt = async sel => ((await p.locator(sel).first().textContent()) || '').trim();
  const vis = sel => p.isVisible(sel);
  // baris tugas di daftar: [tanggal grup, tanda multi-hari, selesai?] urut tampilan
  const listed = (box, id) => p.evaluate(([b, id]) => [...document.querySelectorAll(b + ' .task[data-id="' + id + '"]')].map(el => {
    let h = el.previousElementSibling || el.parentElement.previousElementSibling;
    while (h && !h.classList.contains('dhead')) h = h.previousElementSibling || (h.parentElement && h.parentElement.classList.contains('ntbox') ? h.parentElement.previousElementSibling : null);
    const tag = el.querySelector('.span-tag');
    return [h ? h.id.slice(2) : '', tag ? tag.textContent : '', el.classList.contains('done')];
  }), [box, id]);
  try {
    await p.goto(base); await wait(1500);

    // ---- Home: tampil di setiap tanggal rentangnya, dengan tanda "Hari n/m" ----
    assert.deepEqual(await listed('#home-list', 'm1'), [['2026-11-09', 'Hari 1/3', false], ['2026-11-10', 'Hari 2/3', false], ['2026-11-11', 'Hari 3/3', false]]);
    assert.deepEqual(await listed('#home-list', 'x1'), [['2026-11-29', 'Hari 1/4', false], ['2026-11-30', 'Hari 2/4', false]], 'November saja; sisanya di Desember');
    assert.deepEqual(await listed('#home-list', 'o1'), [['2026-11-01', 'Hari 3/3', false]], 'tugas dari bulan lalu tampil di sisa harinya');
    assert.deepEqual(await listed('#home-list', 's1'), [['2026-11-10', '', false]], 'deadline hari yang sama = tugas biasa, tanpa tanda');
    assert.deepEqual(await listed('#home-list', 'e1'), [['2026-11-20', '', false]], 'deadline lebih awal dari tanggal = tetap 1 hari');
    // hitungan: salinan tidak menambah jumlah
    assert.deepEqual([await txt('#h-total'), await txt('#h-done'), await txt('#h-left')], ['5', '0', '5'], 'November: 5 tugas (bukan 12 baris)');
    assert.equal(await p.locator('#home-list .task').count(), 8);
    assert.match(await txt('#home-chips [data-f="semua"] .n'), /^5$/);
    assert.match(await txt('#banner .banner-today'), /Hari ini: 2 tugas/, 'tugas multi-hari yang sedang berjalan ikut "Hari ini"');
    assert.match(await p.getAttribute('#home-list .task[data-id="m1"] .span-tag', 'title'), /Tugas 3 hari: 9–11 Nov 2026/);
    await shot('t5-01-home');

    // ---- centang di salah satu tanggal → semuanya ikut; urungkan → semuanya batal ----
    await p.locator('#home-list .task[data-id="m1"] .check').nth(1).tap(); await wait(1500);
    assert.deepEqual((await listed('#home-list', 'm1')).map(r => r[2]), [true, true, true], 'semua salinan tercentang');
    assert.deepEqual([rows().length, row('m1')['Status']], [5, 'Selesai'], 'di server tetap satu baris');
    assert.deepEqual([await txt('#h-done'), await txt('#h-left')], ['1', '4'], 'dihitung 1');
    await p.tap('#toast-btn'); await wait(1500);
    assert.deepEqual((await listed('#home-list', 'm1')).map(r => r[2]), [false, false, false], 'urungkan → semua batal');
    assert.equal(row('m1')['Status'], 'Belum');
    // centang dari tanggal lain lalu batalkan lewat centang lagi
    await p.locator('#home-list .task[data-id="m1"] .check').nth(2).tap(); await wait(400);
    await p.locator('#home-list .task[data-id="m1"] .check').nth(0).tap(); await wait(1500);
    assert.deepEqual((await listed('#home-list', 'm1')).map(r => r[2]), [false, false, false], 'batal centang dari hari 1 = batal di semua hari');
    assert.equal(row('m1')['Status'], 'Belum');
    // filter "Selesai": tugas multi-hari yang selesai tampil di semua harinya
    await p.locator('#home-list .task[data-id="x1"] .check').first().tap(); await wait(400);
    await p.tap('[data-act="home-filter"][data-f="selesai"]'); await wait(200);
    assert.deepEqual(await listed('#home-list', 'x1'), [['2026-11-29', 'Hari 1/4', true], ['2026-11-30', 'Hari 2/4', true]]);
    assert.match(await txt('#home-chips [data-f="selesai"] .n'), /^1$/);
    await p.tap('[data-act="home-filter"][data-f="semua"]'); await wait(200);

    // ---- Kalender: jumlah per tanggal ikut tugas yang sedang berjalan; daftar tanggal pakai tanda ----
    await p.click('#nav [data-view="kalender"]'); await wait(300);
    const cell = d => p.evaluate(d => { const c = document.querySelector('#cgrid [data-d="' + d + '"] .c1'); return c ? c.textContent : ''; }, d);
    assert.deepEqual([await cell('2026-11-08'), await cell('2026-11-09'), await cell('2026-11-10'), await cell('2026-11-11'), await cell('2026-11-12')],
      ['', '1 tugas', '2 tugas', '1 tugas', '']);
    assert.deepEqual([await cell('2026-11-01'), await cell('2026-11-30')], ['1 tugas', '1 tugas']);
    await p.tap('#cgrid [data-d="2026-11-11"]'); await wait(200);
    assert.equal(await txt('#cal-day-list .task[data-id="m1"] .span-tag'), 'Hari 3/3');
    await p.tap('[data-act="cal-next"]'); await wait(200);
    assert.deepEqual([await cell('2026-12-01'), await cell('2026-12-02'), await cell('2026-12-03')], ['1 tugas', '1 tugas', '']);
    await p.tap('#cgrid [data-d="2026-12-02"]'); await wait(200);
    assert.equal(await txt('#cal-day-list .task[data-id="x1"] .span-tag'), 'Hari 4/4');
    assert.equal(await p.locator('#cal-day-list .task[data-id="x1"].done').count(), 1, 'selesai juga di bulan berikutnya');
    await shot('t5-02-kalender');

    // ---- Grafik: dihitung 1; kurva sekali di tanggal mulai (tanggal 1 kalau mulai bulan lalu) ----
    await p.click('#nav [data-view="grafik"]'); await wait(400);
    assert.equal(await txt('#donut-c b'), '5');
    assert.equal(await txt('#stats-body .tiles .tile b'), '5', 'ubin Total');
    assert.match(await txt('#stats-body .card:has(#curve) .sub'), /Tugas multi-hari dihitung sekali, di tanggal mulainya/);
    const table = () => p.evaluate(() => [...document.querySelectorAll('#stats-body details.tbl tbody tr')].map(r => [...r.cells].map(c => c.textContent)));
    assert.deepEqual(await table(), [['1 Nov', '1', '0'], ['9 Nov', '1', '0'], ['10 Nov', '1', '0'], ['20 Nov', '1', '0'], ['29 Nov', '1', '1']], 'jumlah kurva = 5 tugas');
    assert.match(await txt('#stats-body .crow[data-k="tkuliah"]'), /5 tugas/);
    await p.tap('#stats-body .crow[data-k="tkuliah"]'); await wait(400);
    assert.equal(await isOpen('#cathist-screen'), true);
    const hist = await p.evaluate(() => [...document.querySelectorAll('#ch-list .hrow')].map(r => r.querySelector('small').textContent));
    assert.deepEqual(hist, ['29 Nov – 2 Des 2026 (4 hari)', 'Jum, 20 Nov 2026 · 09:00', 'Sel, 10 Nov 2026 · 10:00', '9–11 Nov 2026 (3 hari) · 13:00', '30 Okt – 1 Nov 2026 (3 hari) · 08:00']);
    await p.tap('[data-act="close-cathist"]'); await wait(300);
    await p.tap('#mtabs [data-m="2026-12"]'); await wait(300);
    assert.equal(await txt('#donut-c b'), '1', 'Desember: tugas 29 Nov – 2 Des ikut dihitung (1)');
    assert.deepEqual(await table(), [['1 Des', '1', '1']], 'dihitung di 1 Des untuk kurva Desember');
    assert.match(await txt('#stats-body .card:has(#curve) .sub'), /di tanggal mulainya \(tanggal 1 kalau mulai bulan lalu\)/);
    await shot('t5-03-grafik');

    // ---- detail, edit (berlaku untuk semua tanggal), hapus + urungkan ----
    await p.click('#nav [data-view="tugas"]'); await wait(300);
    await p.locator('#home-list .task[data-id="m1"]').nth(2).tap(); await wait(400);
    assert.equal(await isOpen('#detail-wrap'), true);
    assert.equal(await txt('#detail .d-span b'), '9–11 Nov 2026');
    assert.match(await txt('#detail .d-span'), /3 hari · hari ini hari ke-2/);
    await shot('t5-04-detail');
    await p.tap('[data-act="detail-edit"]'); await wait(700);
    assert.equal(await isOpen('#form-wrap'), true);
    assert.equal(await txt('#f-dl-hint'), 'Tampil 3 hari (9–11 Nov 2026) sebagai satu tugas. Centang, edit, dan hapus berlaku untuk semua harinya.');
    await p.fill('#f-name', 'Makalah DE final');
    await p.fill('#f-dl-date', '2026-11-12'); await p.dispatchEvent('#f-dl-date', 'change'); await wait(80);
    assert.match(await txt('#f-dl-hint'), /^Tampil 4 hari \(9–12 Nov 2026\)/);
    await p.tap('#f-save'); await wait(1500);
    assert.deepEqual(await listed('#home-list', 'm1'), [['2026-11-09', 'Hari 1/4', false], ['2026-11-10', 'Hari 2/4', false], ['2026-11-11', 'Hari 3/4', false], ['2026-11-12', 'Hari 4/4', false]]);
    assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('#home-list .task[data-id="m1"] .task-name')].map(x => x.textContent)), Array(4).fill('Makalah DE final'));
    assert.deepEqual([rows().length, row('m1')['Nama tugas'], row('m1')['Tanggal'], row('m1')['Deadline (tanggal)']], [5, 'Makalah DE final', '2026-11-09', '2026-11-12']);
    await p.locator('#home-list .task[data-id="m1"]').nth(3).tap(); await wait(400);
    await p.tap('[data-act="detail-delete"]'); await wait(300); await p.tap('[data-act="confirm-yes"]'); await wait(1500);
    assert.equal(await p.locator('#home-list .task[data-id="m1"]').count(), 0, 'hapus → hilang dari semua tanggal');
    assert.equal(row('m1'), undefined);
    await p.tap('#toast-btn'); await wait(1500);
    assert.equal(await p.locator('#home-list .task[data-id="m1"]').count(), 4, 'urungkan → kembali di semua tanggal');
    assert.equal(row('m1')['Nama tugas'], 'Makalah DE final');

    // ---- buat tugas multi-hari dari form: cukup deadline lebih lambat dari tanggalnya ----
    await p.tap('.nav .fab'); await wait(350); await p.tap('[data-act="pick-cat"][data-k="belajar"]'); await wait(450);
    await p.fill('#f-name', 'Laporan praktikum');
    assert.equal(await p.isChecked('#f-dl-on'), true);
    assert.equal(await vis('#f-dl-hint'), false, 'deadline hari yang sama → tanpa keterangan');
    await p.fill('#f-dl-date', '2026-11-13'); await p.dispatchEvent('#f-dl-date', 'change'); await wait(80);
    assert.equal(await txt('#f-dl-hint'), 'Tampil 4 hari (10–13 Nov 2026) sebagai satu tugas. Centang, edit, dan hapus berlaku untuk semua harinya.');
    await p.locator('#f-dl-hint').scrollIntoViewIfNeeded(); await shot('t5-05-form');
    await p.tap('[data-act="quick-date"][data-d="1"]'); await wait(80);   // "Besok": deadline yang sudah diubah tetap
    assert.match(await txt('#f-dl-hint'), /^Tampil 3 hari \(11–13 Nov 2026\)/);
    await p.tap('[data-act="quick-date"][data-d="0"]'); await wait(80);
    await p.tap('#f-save'); await wait(1500);
    const lap = rows().filter(o => o['Nama tugas'] === 'Laporan praktikum');
    assert.deepEqual(lap.map(o => [o['Tanggal'], o['Deadline (tanggal)']]), [['2026-11-10', '2026-11-13']], 'satu baris dengan rentang');
    const lapId = lap[0].ID;
    assert.deepEqual((await listed('#home-list', lapId)).map(r => r[0] + ' ' + r[1]), ['2026-11-10 Hari 1/4', '2026-11-11 Hari 2/4', '2026-11-12 Hari 3/4', '2026-11-13 Hari 4/4']);
    assert.equal(await txt('#h-total'), '6');
    // "Beberapa tanggal" + jarak deadline → keterangan bahwa tiap tugas tampil beberapa hari
    await p.tap('.nav .fab'); await wait(350); await p.tap('[data-act="pick-cat"][data-k="belajar"]'); await wait(450);
    await p.tap('.opt-switch:has(#f-multi)'); await wait(100);
    assert.equal(await txt('#f-dl-hint'), 'Deadline tiap tugas dihitung dari tanggalnya masing-masing.');
    await p.selectOption('#f-dl-off', '2'); await wait(80);
    assert.equal(await txt('#f-dl-hint'), 'Deadline tiap tugas dihitung dari tanggalnya masing-masing. Tiap tugas tampil 3 hari, dari tanggalnya sampai deadline-nya.');
    await p.tap('.opt-switch:has(#f-multi)'); await wait(100);
    assert.match(await txt('#f-dl-hint'), /^Tampil 3 hari \(10–12 Nov 2026\)/, 'kembali ke satu tanggal: deadline = tanggal + jarak tadi');
    await p.tap('.form-cat [data-act="form-collapse"]'); await wait(300);
    await p.tap('[data-act="add-cancel"]'); await wait(300);

    // ---- pencarian: tugas multi-hari muncul sekali, dengan jumlah harinya ----
    await p.tap('[data-act="search"]'); await wait(300);
    await p.fill('#search-q', 'laporan'); await wait(150);
    assert.equal(await p.locator('#search-list .task').count(), 1);
    assert.equal(await txt('#search-list .span-tag'), '4 hari');
    await p.tap('[data-act="close-search"]'); await wait(300);

    // ---- pemilih bulan: Desember ikut menghitung tugas 29 Nov – 2 Des ----
    await p.tap('[data-act="month-picker"]'); await wait(300);
    assert.deepEqual([await txt('#month-body [data-m="2026-11"] small'), await txt('#month-body [data-m="2026-12"] small'), await txt('#month-body [data-m="2026-10"] small')], ['6 tugas', '1 tugas', '1 tugas']);
    await p.tap('#month-body [data-m="2026-12"]'); await wait(400);
    assert.deepEqual(await listed('#home-list', 'x1'), [['2026-12-01', 'Hari 3/4', true], ['2026-12-02', 'Hari 4/4', true]]);
    assert.equal(await txt('#h-total'), '1');

    // ---- muat ulang: tetap; layar 360px tanpa geser samping ----
    await p.reload(); await wait(1500);
    assert.equal(await p.locator('#home-list .task[data-id="m1"]').count(), 4);
    await p.setViewportSize({ width: 360, height: 740 }); await wait(300);
    assert.equal(await p.evaluate(() => document.getElementById('sc').scrollWidth <= innerWidth), true);
    const tagFits = await p.evaluate(() => [...document.querySelectorAll('#home-list .task[data-id="m1"] .task-meta')].every(m => m.querySelector('.span-tag').getBoundingClientRect().right <= m.getBoundingClientRect().right + 0.5));
    assert.equal(tagFits, true, 'tanda "Hari n/m" tidak terpotong (ditaruh paling depan)');
    await p.evaluate(() => document.getElementById('g-2026-11-09').scrollIntoView()); await wait(200);
    await shot('t5-06-home-360');
    assert.deepEqual(errs, [], 'tidak ada error JavaScript');
  } finally { await close(); }
});

test('E2E Tahap 6: Mode Edit kalender, tekan lama + tarik tugas ke tanggal lain (Poin 14)', { skip: !pw && 'Playwright tidak terpasang', timeout: 240000 }, async () => {
  const S = makeRuntime();
  const reg = S.post('apiRegister', 'adit', '1234', 'Adit');
  const T = (id, name, date, start, dlDate, extra) => Object.assign({ id, cat: 'tkuliah', name, detail: '', date, start, end: start ? String(+start.slice(0, 2) + 1).padStart(2, '0') + start.slice(2) : '',
    dlDate: dlDate || '', dlTime: dlDate ? '17:00' : '', done: false, doneAt: null, doneBy: '', createdAt: 1762740000000, updatedAt: 1762740000000, kind: 'tugas', diff: '', parent: '', by: 'p1' }, extra || {});
  const fill = Array.from({ length: 10 }, (_, i) => T('f' + (i + 1), 'Isi ' + (i + 1), '2026-11-20', String(8 + i).padStart(2, '0') + ':00'));
  S.post('apiSync', reg.token, [
    T('a', 'Rapat', '2026-11-10', '09:00', '2026-11-10', { cat: 'tkerja', dlTime: '12:00' }),   // deadline hari yang sama
    T('m1', 'Makalah DE', '2026-11-09', '13:00', '2026-11-11'),                                   // 9–11 Nov, hari ini hari ke-2
    T('n', 'Belanja', '2026-11-10', '', '', { cat: 'belanja', done: true, doneAt: 1762740000000, doneBy: 'p1' }),
    T('z', 'Akhir bulan', '2026-11-30', '08:00', '')
  ].concat(fill).map(t => ({ op: 'upsert', task: t })));
  const { p, base, st, errs, close, wait } = await open(S, { localStorage: {
    'pt.accounts': [{ id: reg.user.id, username: 'adit', name: 'Adit', token: reg.token }], 'pt.current': reg.user.id } });
  const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  const row = id => S.sheet('@adit').objects().find(o => o.ID === id);
  const cols = (id, ks) => ks.map(k => row(id)[k]);
  const txt = async sel => ((await p.locator(sel).first().textContent()) || '').trim();
  const cdp = await p.context().newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const center = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  const rowPt = id => p.evaluate(id => { const r = document.querySelector('#cal-day-list .task[data-id="' + id + '"]').getBoundingClientRect(); return { x: r.x + 120, y: r.y + r.height / 2 }; }, id);
  const scTop = () => p.evaluate(() => document.getElementById('sc').scrollTop);
  const dragging = () => p.evaluate(() => document.documentElement.classList.contains('dragging'));
  const ghostTo = () => p.evaluate(() => { const g = document.querySelector('.drag-ghost .dg-to'); return g ? g.textContent : null; });
  const dropCells = () => p.evaluate(() => [...document.querySelectorAll('#cgrid .cday.drop,#cgrid .cday.drop-span')].map(c => c.dataset.d + (c.classList.contains('drop') ? '*' : '')));
  const moveTo = async (a, b, n) => { n = n || 10; for (let i = 1; i <= n; i++) { await touch('touchMove', a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n); await wait(25); } };
  // tekan lama baris tugas `id` lalu tarik ke elemen `toSel`; mid() dijalankan sebelum jari diangkat
  async function tdrag(id, toSel, mid) {
    const a = await rowPt(id), b = await center(toSel);
    await touch('touchStart', a.x, a.y); await wait(520);
    await moveTo(a, b); await wait(120);
    if (mid) await mid();
    await touch('touchEnd'); await wait(450);
  }
  const head = () => txt('#cal-day-head b');
  try {
    await p.goto(base); await wait(1500);
    await p.click('#nav [data-view="kalender"]'); await wait(300);

    // ---- tombol Mode Edit; di luar Mode Edit tekan lama + tarik tidak memindahkan apa pun ----
    assert.equal(await txt('#cal-day-head .cal-edit'), 'Mode Edit');
    assert.equal(await p.getAttribute('#cal-day-head .cal-edit', 'aria-pressed'), 'false');
    assert.equal(await p.isVisible('#cal-day-list .task[data-id="a"] .check'), true);
    await tdrag('a', '#cgrid [data-d="2026-11-12"]', async () => { assert.equal(await dragging(), false); });
    assert.equal(await p.locator('.drag-ghost').count(), 0);
    assert.equal(cols('a', ['Tanggal'])[0], '2026-11-10', 'tanpa Mode Edit: tidak pindah');
    assert.equal(await p.evaluate(() => document.getElementById('detail-wrap').classList.contains('open')), false);

    // ---- masuk Mode Edit ----
    await p.tap('[data-act="cal-edit"]'); await wait(200);
    assert.equal(await p.evaluate(() => document.getElementById('v-kalender').classList.contains('editing')), true);
    assert.deepEqual([await txt('#cal-day-head .cal-edit'), await p.getAttribute('#cal-day-head .cal-edit', 'aria-pressed')], ['Selesai', 'true']);
    assert.match(await txt('#cal-legend'), /Tekan lama tugas di bawah, lalu tarik ke tanggal tujuan\. Tahan di ‹ › untuk pindah bulan\./);
    assert.equal(await p.isVisible('#cal-day-list .task[data-id="a"] .check'), false, 'centang diganti pegangan');
    await shot('t6-01-mode-edit');
    // tap biasa tetap membuka detail
    await p.locator('#cal-day-list .task[data-id="a"]').tap(); await wait(400);
    assert.equal(await p.evaluate(() => document.getElementById('detail-wrap').classList.contains('open')), true);
    await p.tap('.back-btn[data-act="close-detail"]'); await wait(350);

    // ---- tugas 1 hari: 10 Nov → 12 Nov; jam tetap, deadline ikut, highlight sel tujuan ----
    const y0 = await scTop();
    await tdrag('a', '#cgrid [data-d="2026-11-12"]', async () => {
      assert.equal(await dragging(), true);
      assert.deepEqual(await dropCells(), ['2026-11-12*'], 'sel tujuan di-highlight');
      assert.equal(await ghostTo(), '→ Kam, 12 Nov');
      assert.equal(await txt('.drag-ghost b'), 'Rapat');
      assert.equal(await p.locator('#cal-day-list .task[data-id="a"].drag-src').count(), 1);
      assert.equal(await scTop(), y0, 'halaman tidak ikut bergulir saat menarik');
      await shot('t6-02-menarik');
    });
    assert.equal(await p.locator('.drag-ghost').count(), 0);
    assert.equal(await dragging(), false);
    assert.equal(await head(), 'Kamis, 12 November 2026', 'daftar pindah ke tanggal tujuan');
    assert.equal(await p.locator('#cgrid [data-d="2026-11-12"].sel').count(), 1);
    assert.equal(await p.locator('#cal-day-list .task[data-id="a"].flash').count(), 1, 'tugas yang dipindah disorot');
    assert.equal(await txt('#toast-msg'), '"Rapat" dipindah ke Kam, 12 Nov');
    assert.equal(await txt('#toast-btn'), 'Urungkan');
    assert.equal(await p.evaluate(() => document.getElementById('detail-wrap').classList.contains('open')), false, 'lepas jari tidak membuka detail');
    await shot('t6-03-dilepas');
    await wait(1500);   // tunggu sinkron selesai dulu (objek tugas diganti data server, pelajaran Tahap 5)
    assert.deepEqual(cols('a', ['Tanggal', 'Hari', 'Jam mulai', 'Jam selesai', 'Deadline (tanggal)', 'Deadline (jam)']), ['2026-11-12', 'Kamis', '09:00', '10:00', '2026-11-12', '12:00']);
    assert.equal(S.sheet('@adit').objects().length, 14);
    await p.tap('#toast-btn'); await wait(1500);
    assert.equal(await head(), 'Selasa, 10 November 2026', 'urungkan → kembali ke tanggal asal');
    assert.equal(await p.locator('#cal-day-list .task[data-id="a"]').count(), 1);
    assert.deepEqual(cols('a', ['Tanggal', 'Deadline (tanggal)', 'Jam mulai']), ['2026-11-10', '2026-11-10', '09:00']);

    // ---- multi-hari (K2): baris "Hari 2/3" ditarik ke 15 Nov → +5 hari, seluruh rentang ikut ----
    assert.equal(await txt('#cal-day-list .task[data-id="m1"] .span-tag'), 'Hari 2/3');
    await tdrag('m1', '#cgrid [data-d="2026-11-15"]', async () => {
      assert.deepEqual(await dropCells(), ['2026-11-14', '2026-11-15*', '2026-11-16'], 'rentang baru ikut ditandai');
      assert.equal(await ghostTo(), '→ 14–16 Nov 2026');
      await shot('t6-04-multi-hari');
      // tampilan diperbarui (render berkala tiap menit / sinkron selesai) saat jari masih menarik: drag tetap jalan
      await p.context().clock.runFor(61000); await wait(100);
      assert.deepEqual(await dropCells(), ['2026-11-14', '2026-11-15*', '2026-11-16']);
      assert.equal(await p.locator('#cal-day-list .task[data-id="m1"].drag-src').count(), 1, 'daftar tidak dibuat ulang selama menarik');
    });
    assert.equal(await txt('#toast-msg'), '"Makalah DE" dipindah ke 14–16 Nov 2026');
    assert.equal(await head(), 'Minggu, 15 November 2026');
    assert.equal(await txt('#cal-day-list .task[data-id="m1"] .span-tag'), 'Hari 2/3');
    await wait(1500);
    assert.deepEqual(cols('m1', ['Tanggal', 'Deadline (tanggal)', 'Jam mulai', 'Deadline (jam)']), ['2026-11-14', '2026-11-16', '13:00', '17:00']);
    assert.equal(S.sheet('@adit').objects().length, 14, 'tetap satu baris');
    const cnt = d => p.evaluate(d => { const c = document.querySelector('#cgrid [data-d="' + d + '"] .c1'); return c ? c.textContent : ''; }, d);
    assert.deepEqual([await cnt('2026-11-09'), await cnt('2026-11-11'), await cnt('2026-11-14'), await cnt('2026-11-16')], ['', '', '1 tugas', '1 tugas']);

    // ---- tugas selesai tanpa jam: tetap selesai; dilepas di tanggal asal / di luar tanggal = batal ----
    await p.tap('#cgrid [data-d="2026-11-10"]'); await wait(200);
    await tdrag('n', '#cgrid [data-d="2026-11-09"]');
    await wait(1500);
    assert.deepEqual(cols('n', ['Tanggal', 'Status', 'Deadline (tanggal)', 'Jam mulai']), ['2026-11-09', 'Selesai', '', '']);
    assert.equal(await p.locator('#cal-day-list .task[data-id="n"].done').count(), 1);
    await p.tap('#toast-x'); await wait(300);
    await tdrag('n', '#cgrid [data-d="2026-11-09"]', async () => {
      assert.equal(await ghostTo(), 'Tanggal asal');
      assert.deepEqual(await dropCells(), []);
    });
    await tdrag('n', '#cal-legend', async () => { assert.equal(await ghostTo(), 'Lepas di tanggal tujuan'); });
    assert.equal(await p.evaluate(() => document.getElementById('toast').classList.contains('on')), false, 'batal: tidak ada pop-up');
    assert.equal(cols('n', ['Tanggal'])[0], '2026-11-09');
    assert.deepEqual([await head(), await p.locator('#cal-day-list .task.drag-src,#cal-day-list .task.pressing').count()], ['Senin, 9 November 2026', 0]);

    // ---- geser cepat tanpa tekan lama = gulir biasa, bukan drag ----
    await p.tap('#cgrid [data-d="2026-11-20"]'); await wait(200);
    await p.evaluate(() => document.getElementById('sc').scrollTo(0, 250)); await wait(150);
    const s0 = await scTop(), f5 = await rowPt('f5');
    await touch('touchStart', f5.x, f5.y); let wasDrag = false;
    for (let i = 1; i <= 8; i++) { await touch('touchMove', f5.x, f5.y - i * 18); await wait(16); wasDrag = wasDrag || await dragging(); }
    await touch('touchEnd'); await wait(500);
    assert.equal(wasDrag, false, 'tidak jadi drag');
    assert.notEqual(await scTop(), s0, 'halaman bergulir seperti biasa');
    assert.equal(cols('f5', ['Tanggal'])[0], '2026-11-20');

    // ---- daftar panjang: tarik ke tepi atas → halaman bergulir sendiri sampai kalender terlihat ----
    await p.evaluate(() => { const s = document.getElementById('sc'); s.scrollTo(0, s.scrollHeight); }); await wait(200);
    const s1 = await scTop(), f10 = await rowPt('f10');
    assert.ok(s1 > 200, 'kalender sebagian tertutup (scrollTop ' + s1 + ')');
    await touch('touchStart', f10.x, f10.y); await wait(520);
    assert.equal(await dragging(), true);
    await moveTo(f10, { x: f10.x, y: f10.y - 80 }, 4); await wait(150);
    assert.equal(await scTop(), s1, 'di tengah layar: halaman diam (gulir bawaan dicegah)');
    const topY = await p.evaluate(() => document.querySelector('#v-kalender .cal-head').getBoundingClientRect().bottom + 14);
    await moveTo({ x: f10.x, y: f10.y - 80 }, { x: 200, y: topY }, 6); await wait(1600);
    assert.equal(await scTop(), 0, 'bergulir sendiri ke atas');
    const c18 = await center('#cgrid [data-d="2026-11-18"]');
    await moveTo({ x: 200, y: topY }, c18, 5); await wait(120);
    assert.deepEqual(await dropCells(), ['2026-11-18*']);
    await touch('touchEnd'); await wait(450);
    assert.equal(await head(), 'Rabu, 18 November 2026');
    await wait(1200);
    assert.deepEqual(cols('f10', ['Tanggal', 'Jam mulai']), ['2026-11-18', '17:00']);

    // ---- pindah bulan: tahan di › lalu lepas di tanggal bulan berikutnya ----
    await p.tap('#cgrid [data-d="2026-11-30"]'); await wait(200);
    let z = await rowPt('z');
    const nx = await center('#v-kalender [data-act="cal-next"]');
    await touch('touchStart', z.x, z.y); await wait(520);
    await moveTo(z, nx); await wait(250);
    assert.equal(await ghostTo(), 'Tahan untuk ke Des 2026');
    assert.equal(await p.locator('#v-kalender [data-act="cal-next"].drop').count(), 1);
    await shot('t6-05-tahan-panah');
    await wait(650);
    assert.equal(await txt('#cal-label'), 'Des 2026', 'pindah bulan sambil menarik');
    const d2 = await center('#cgrid [data-d="2026-12-02"]');
    await moveTo(nx, d2, 4); await wait(120);
    assert.equal(await ghostTo(), '→ Rab, 2 Des');
    await touch('touchEnd'); await wait(450);
    assert.deepEqual([await txt('#cal-label'), await head()], ['Des 2026', 'Rabu, 2 Desember 2026']);
    await wait(1200);
    assert.equal(cols('z', ['Tanggal'])[0], '2026-12-02');
    await p.tap('#toast-btn'); await wait(1500);
    assert.deepEqual([await txt('#cal-label'), await head(), cols('z', ['Tanggal'])[0]], ['Nov 2026', 'Senin, 30 November 2026', '2026-11-30']);
    // pindah bulan lalu batal → kembali ke bulan semula
    z = await rowPt('z');
    const pv = await center('#v-kalender [data-act="cal-prev"]');
    await touch('touchStart', z.x, z.y); await wait(520);
    await moveTo(z, pv); await wait(950);
    assert.equal(await txt('#cal-label'), 'Okt 2026');
    await moveTo(pv, { x: 195, y: 500 }, 4); await touch('touchEnd'); await wait(400);
    assert.deepEqual([await txt('#cal-label'), await head(), cols('z', ['Tanggal'])[0]], ['Nov 2026', 'Senin, 30 November 2026', '2026-11-30']);
    assert.equal(await p.locator('#cal-day-list .task[data-id="z"]').count(), 1);

    // ---- mouse (laptop): tekan lama + tarik juga bisa ----
    await p.tap('#cgrid [data-d="2026-11-10"]'); await wait(200);
    const ma = await rowPt('a'), m11 = await center('#cgrid [data-d="2026-11-11"]');
    await p.mouse.move(ma.x, ma.y); await p.mouse.down(); await wait(520);
    await p.mouse.move(m11.x, m11.y, { steps: 8 }); await wait(100);
    assert.deepEqual(await dropCells(), ['2026-11-11*']);
    await p.mouse.up(); await wait(450);
    assert.equal(await head(), 'Rabu, 11 November 2026');
    assert.equal(await p.evaluate(() => document.getElementById('detail-wrap').classList.contains('open')), false);
    await wait(1200);
    assert.equal(cols('a', ['Tanggal'])[0], '2026-11-11');

    // ---- offline: tersimpan di antrean, terkirim saat online lagi ----
    st.offline = true;
    await tdrag('a', '#cgrid [data-d="2026-11-13"]'); await wait(800);
    assert.equal(await head(), 'Jumat, 13 November 2026');
    assert.equal(cols('a', ['Tanggal'])[0], '2026-11-11', 'server belum tahu');
    const queued = await p.evaluate(id => (JSON.parse(localStorage.getItem('pt.cache.' + id)).ops || []).filter(o => o.op === 'upsert' && o.task.id === 'a').map(o => o.task.date), reg.user.id);
    assert.deepEqual(queued, ['2026-11-13']);
    st.offline = false;
    await p.evaluate(() => window.dispatchEvent(new Event('online'))); await wait(1800);
    assert.equal(cols('a', ['Tanggal'])[0], '2026-11-13');

    // ---- tombol back HP: batal drag → keluar Mode Edit → ke menu Tugas ----
    const back = async () => { await p.goBack({ waitUntil: 'commit' }).catch(() => {}); await wait(350); };
    const editing = () => p.evaluate(() => document.getElementById('v-kalender').classList.contains('editing'));
    const a2 = await rowPt('a');
    await touch('touchStart', a2.x, a2.y); await wait(520);
    await moveTo(a2, { x: a2.x, y: a2.y - 200 }, 4);
    assert.equal(await dragging(), true);
    await back();
    assert.deepEqual([await dragging(), await p.locator('.drag-ghost').count(), await editing()], [false, 0, true], 'back = batal menarik');
    await touch('touchEnd'); await wait(300);
    assert.equal(cols('a', ['Tanggal'])[0], '2026-11-13');
    await back();
    assert.equal(await editing(), false, 'back berikutnya = keluar Mode Edit');
    assert.equal(await p.isHidden('#v-kalender'), false, 'masih di Kalender');
    assert.equal(await txt('#cal-day-head .cal-edit'), 'Mode Edit');
    await back();
    assert.equal(await p.isHidden('#v-kalender'), true, 'back lagi = ke menu Tugas');
    // pindah menu juga mengakhiri Mode Edit; tombol Selesai juga
    await p.click('#nav [data-view="kalender"]'); await wait(250);
    await p.tap('[data-act="cal-edit"]'); await wait(150);
    await p.click('#nav [data-view="grafik"]'); await wait(250);
    await p.click('#nav [data-view="kalender"]'); await wait(250);
    assert.equal(await editing(), false);
    await p.tap('[data-act="cal-edit"]'); await wait(150);
    await p.tap('[data-act="cal-edit"]'); await wait(150);
    assert.equal(await editing(), false, 'tombol Selesai');

    // ---- Home ikut tanggal baru; muat ulang tetap; layar 360px muat ----
    await p.click('#nav [data-view="tugas"]'); await wait(300);
    assert.equal(await p.evaluate(() => { const r = document.querySelector('#home-list .task[data-id="a"]'); let h = r.previousElementSibling; while (h && !h.classList.contains('dhead')) h = h.previousElementSibling; return h && h.id; }), 'g-2026-11-13');
    await p.reload(); await wait(1500);
    await p.click('#nav [data-view="kalender"]'); await wait(300);
    assert.deepEqual([await cnt('2026-11-13'), await cnt('2026-11-15')], ['1 tugas', '1 tugas']);
    await p.setViewportSize({ width: 360, height: 740 }); await wait(300);
    await p.tap('[data-act="cal-edit"]'); await wait(200);
    assert.equal(await p.evaluate(() => document.getElementById('sc').scrollWidth <= innerWidth), true, 'tanpa geser samping');
    assert.equal(await p.evaluate(() => document.querySelector('#cal-day-head .cal-edit').getBoundingClientRect().right <= innerWidth - 8), true);
    await p.tap('#cgrid [data-d="2026-11-15"]'); await wait(200);
    await p.evaluate(() => document.getElementById('sc').scrollTo(0, 260)); await wait(200);
    await shot('t6-06-360');
    assert.deepEqual(errs, [], 'tidak ada error JavaScript');
  } finally { await close(); }
});
