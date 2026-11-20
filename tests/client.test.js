// Unit test pustaka data aplikasi (<script id="pt-lib"> di index.html) — migrasi cache HP, antrean, cadangan.
// Script diambil dari index.html dan dijalankan di Node (tanpa browser). Jalankan: node --test tests/client.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeRuntime } = require('./gas-mock');

function loadLib() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const src = (html.match(/<script id="pt-lib">([\s\S]*?)<\/script>/) || [])[1];
  assert.ok(src, 'script pt-lib ada di index.html');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'index.html#pt-lib' });
  return ctx.window.PT_LIB;
}
const L = loadLib();
const BUILTIN = new Set(['tkuliah', 'tkerja', 'belajar', 'jamkerja', 'lain_t', 'lain_k']);
const isBuiltin = k => typeof k === 'string' && BUILTIN.has(k);
const plain = x => JSON.parse(JSON.stringify(x));   // objek dari vm → objek biasa (untuk deepEqual)

// cache HP versi 1, persis seperti yang ditulis aplikasi sebelum Tahap 1
const V1_CACHE = {
  tasks: {
    t1: { id: 't1', cat: 'tkuliah', name: 'Jurnal', detail: '', date: '2026-11-01', start: '08:00', end: '09:00', dlDate: '2026-11-03', dlTime: '23:59', done: false, doneAt: null, createdAt: 1, updatedAt: 2 },
    // tugas yang dibuat di sesi itu masih membawa kind:'task' (sisa saveForm lama yang ikut tersimpan di cache)
    t2: { id: 't2', kind: 'task', cat: 'jamkerja', name: 'Kerja', detail: 'x', date: '2026-11-02', start: '', end: '', dlDate: '', dlTime: '', done: true, doneAt: 5, createdAt: 3, updatedAt: 5 },
    rusak: { id: 'rusak', name: 'tanpa tanggal' }
  },
  ops: [
    { op: 'upsert', task: { id: 't2', cat: 'jamkerja', name: 'Kerja', detail: 'x', date: '2026-11-02', start: '', end: '', dlDate: '', dlTime: '', done: true, doneAt: 5, createdAt: 3, updatedAt: 5 } },
    { op: 'delete', id: 't0' },
    { op: 'upsert', task: {} },
    null,
    { op: 'hapus-semua' }
  ]
};

test('migrasi cache HP v1 → v2: tugas & antrean lama tetap, field baru tidak dikarang', () => {
  const c = plain(L.migrateCache(JSON.parse(JSON.stringify(V1_CACHE)), isBuiltin));
  assert.equal(c.v, 2);
  assert.deepEqual(Object.keys(c.tasks).sort(), ['t1', 't2'], 'tugas rusak dibuang, sisanya utuh');
  assert.deepEqual(c.tasks.t1, Object.assign({}, V1_CACHE.tasks.t1), 't1 sama persis, tanpa field baru');
  assert.equal(c.tasks.t2.kind, 'tugas', "sisa kind:'task' jadi 'tugas'");
  assert.deepEqual(c.ops, V1_CACHE.ops.slice(0, 2), 'antrean yang belum terkirim tetap ada, op rusak dibuang');
  assert.deepEqual(c.cats, []);
  assert.deepEqual(c.profiles, []);
  // yang dikirim ke server dari tugas lama TIDAK membawa field baru → server mempertahankan nilainya
  assert.deepEqual(Object.keys(L.toDoc(c.tasks.t1)).sort(),
    ['cat', 'createdAt', 'date', 'detail', 'dlDate', 'dlTime', 'done', 'doneAt', 'end', 'id', 'name', 'start', 'updatedAt']);
  // migrasi idempoten
  assert.deepEqual(plain(L.migrateCache(c, isBuiltin)), c);
});

test('migrasi cache: isi rusak / kosong tidak membuat aplikasi error', () => {
  for (const bad of [null, undefined, 'teks', 42, [], { tasks: 'x', ops: 'y' }, { tasks: { a: null }, ops: [1, 'x'] }]) {
    assert.deepEqual(plain(L.migrateCache(bad, isBuiltin)), { v: 2, tasks: {}, ops: [], cats: [], profiles: [] }, JSON.stringify(bad));
  }
  const c = plain(L.migrateCache({ tasks: {}, cats: [{ id: 'c_a', name: ' Gym ', hue: 370 }, { id: 'c_a', name: 'dobel' }, { id: 'x', name: 'salah' }],
    profiles: [{ id: 'p1', name: 'Adit', avatar: 'a1' }, { id: 'P2', name: 'salah' }, { id: 'p3', name: '', avatar: 'BAD!' }] }, isBuiltin));
  assert.deepEqual(c.cats, [{ id: 'c_a', name: 'Gym', hue: 10 }]);
  assert.deepEqual(c.profiles, [{ id: 'p1', name: 'Adit', avatar: 'a1' }, { id: 'p3', name: 'Profil', avatar: '' }]);
});

test('normTask: validasi field baru', () => {
  const base = { date: '2026-11-10', name: 'A' };
  const n = v => plain(L.normTask(Object.assign({}, base, v), 'x1', isBuiltin));
  assert.equal(n({ cat: 'c_gym' }).cat, 'c_gym', 'kode kategori custom dipertahankan');
  assert.equal(n({ cat: 'toString' }).cat, 'lain_t');
  assert.equal(n({ cat: 'tidakada' }).cat, 'lain_t');
  assert.deepEqual([n({ kind: 'kegiatan' }).kind, n({ kind: 'apa' }).kind, 'kind' in n({})], ['kegiatan', 'tugas', false]);
  assert.deepEqual([n({ diff: 'sulit' }).diff, n({ diff: 'ekstrem' }).diff, 'diff' in n({})], ['sulit', '', false]);
  assert.deepEqual([n({ parent: 'k1' }).parent, n({ parent: 'x1' }).parent, n({ parent: 'bad id' }).parent], ['k1', '', '']);
  assert.deepEqual([n({ by: 'p2' }).by, 'by' in n({ by: 'Adit' })], ['p2', false]);
  assert.deepEqual([n({ done: true, doneBy: 'p2' }).doneBy, n({ done: false, doneBy: 'p2' }).doneBy], ['p2', '']);
  assert.equal(L.normTask({ name: 'tanpa tanggal' }, 'x', isBuiltin), null);
  // toDoc: field undefined tidak ikut, field berisi ikut
  const d = plain(L.toDoc(Object.assign(n({ kind: 'tugas', diff: '', by: 'p1' }), { doneBy: undefined })));
  assert.deepEqual([d.kind, d.diff, d.by, 'doneBy' in d, 'parent' in d], ['tugas', '', 'p1', false, false]);
});

test('antrean: satu op per item (tugas, kategori, profil terpisah), op terbaru di belakang', () => {
  let q = [];
  q = L.enqueue(q, { op: 'upsert', task: { id: 'c_x' } });
  q = L.enqueue(q, { op: 'cat', cat: { id: 'c_x', name: 'A' } });
  q = L.enqueue(q, { op: 'profile', profile: { id: 'p2', name: 'B' } });
  q = L.enqueue(q, { op: 'upsert', task: { id: 'c_x', name: 'versi 2' } });
  q = L.enqueue(q, { op: 'cat-del', id: 'c_x' });
  q = L.enqueue(q, { op: 'cat-del', id: 'bukan' });           // tidak valid → diabaikan
  q = L.enqueue(q, { op: 'profile-del', id: 'p2' });
  assert.deepEqual(plain(q), [{ op: 'upsert', task: { id: 'c_x', name: 'versi 2' } }, { op: 'cat-del', id: 'c_x' }, { op: 'profile-del', id: 'p2' }]);
  assert.deepEqual([L.opKey({ op: 'delete', id: 't1' }), L.opKey({ op: 'upsert' }), L.opKey(null)], ['t:t1', null, null]);
});

test('gabung data server + antrean HP; server lama (tanpa cats/profiles) tidak menghapus data HP', () => {
  const res = { schema: 2, tasks: [{ id: 'a', date: '2026-11-01', name: 'A', kind: 'tugas', by: 'p1' }, { id: 'b', date: '2026-11-01', name: 'B' }],
    cats: [{ id: 'c_1', name: 'Satu', hue: 1 }], profiles: [{ id: 'p1', name: 'Adit', avatar: '' }] };
  const ops = [{ op: 'delete', id: 'b' }, { op: 'upsert', task: { id: 'c', date: '2026-11-02', name: 'C' } },
    { op: 'cat', cat: { id: 'c_1', name: 'Satu baru', hue: 2 } }, { op: 'cat', cat: { id: 'c_2', name: 'Dua', hue: 3 } },
    { op: 'profile', profile: { id: 'p2', name: 'Rina' } }];
  const m = plain(L.mergeServer(res, ops, { cats: [], profiles: [] }, isBuiltin));
  assert.deepEqual(Object.keys(m.tasks).sort(), ['a', 'c']);
  assert.deepEqual(m.cats.map(c => c.name), ['Satu baru', 'Dua']);
  assert.deepEqual(m.profiles.map(p => p.id), ['p1', 'p2']);
  const old = plain(L.mergeServer({ tasks: [] }, [], { cats: [{ id: 'c_9', name: 'Lokal', hue: 0 }], profiles: [{ id: 'p1', name: 'X', avatar: '' }] }, isBuiltin));
  assert.deepEqual([old.cats.length, old.profiles.length], [1, 1]);
  assert.equal(L.serverIsCurrent(res), true);
  assert.equal(L.serverIsCurrent({ ok: true, tasks: [] }), false, 'server lama tidak mengirim schema');
  assert.equal(L.serverIsCurrent(null), false);
});

test('profil yang dipakai di HP: pilihan tersimpan, atau profil pertama', () => {
  const ps = [{ id: 'p1' }, { id: 'p2' }];
  assert.equal(L.pickProfile(ps, 'p2'), 'p2');
  assert.equal(L.pickProfile(ps, 'p9'), 'p1', 'profil tersimpan sudah dihapus → profil pertama');
  assert.equal(L.pickProfile(ps, null), 'p1');
  assert.equal(L.pickProfile([], 'p1'), undefined, 'belum tahu profil → server yang mengisi');
});

test('cadangan: versi 2 bolak-balik utuh, versi 1 tetap bisa dipulihkan', () => {
  const tasks = [plain(L.normTask({ date: '2026-11-01', name: 'A', cat: 'c_1', kind: 'tugas', diff: 'mudah', parent: '', by: 'p2', done: true, doneBy: 'p2', doneAt: 9 }, 'a', isBuiltin)),
    plain(L.normTask({ date: '2026-11-02', name: 'B lama' }, 'b', isBuiltin))];
  const cats = [{ id: 'c_1', name: 'Satu', hue: 5 }], profiles = [{ id: 'p1', name: 'Adit', avatar: '' }, { id: 'p2', name: 'Rina', avatar: 'a2' }];
  const txt = L.makeBackup(tasks, cats, profiles, '2026-11-08T10:00:00.000Z');
  const o = JSON.parse(txt);
  assert.equal(o.version, 2);
  const back = plain(L.parseBackup(o, isBuiltin, () => 'baru'));
  assert.deepEqual(back, { tasks, cats, profiles });
  // cadangan versi 1 (dibuat aplikasi lama)
  const v1 = { app: 'pengelola-tugas', version: 1, exportedAt: 'x', tasks: [{ id: 't1', cat: 'belajar', name: 'Lama', date: '2026-10-01', start: '08:00', end: '09:00', dlDate: '', dlTime: '', done: false, doneAt: null, createdAt: 1, updatedAt: 1 }, { name: 'tanpa id', date: '2026-10-02' }] };
  const b1 = plain(L.parseBackup(v1, isBuiltin, () => 'tbaru'));
  assert.deepEqual(b1.tasks.map(t => [t.id, t.name, 'kind' in t]), [['t1', 'Lama', false], ['tbaru', 'tanpa id', false]]);
  assert.deepEqual([b1.cats, b1.profiles], [[], []]);
  assert.equal(L.parseBackup({ bukan: 1 }, isBuiltin, () => 'x'), null);
  assert.equal(L.parseBackup(null, isBuiltin, () => 'x'), null);
});

test('alur nyata: HP dengan cache lama + antrean offline, server sudah Tahap 1 → field baru di server tidak hilang', () => {
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  // HP lain (aplikasi baru) sudah memberi kesulitan & kategori custom
  S.post('apiSync', tok, [
    { op: 'cat', cat: { id: 'c_gym', name: 'Gym', hue: 140 } },
    { op: 'upsert', task: { id: 't2', cat: 'c_gym', name: 'Kerja', detail: 'x', date: '2026-11-02', start: '', end: '', dlDate: '', dlTime: '', done: false, doneAt: null, createdAt: 3, updatedAt: 4, kind: 'tugas', diff: 'sulit', parent: '', by: 'p1' } }
  ]);
  // HP ini masih menyimpan antrean lama (op v1 untuk t2: dicentang saat offline), lalu aplikasinya diperbarui
  const c = L.migrateCache(JSON.parse(JSON.stringify(V1_CACHE)), isBuiltin);
  const res = S.post('apiSync', tok, plain(c.ops));
  assert.equal(res.ok, true);
  const t2 = res.tasks.find(t => t.id === 't2');
  assert.equal(t2.done, true, 'perubahan offline terkirim');
  assert.equal(t2.diff, 'sulit', 'kesulitan dari HP lain tidak terhapus');
  assert.equal(t2.by, 'p1');
  // field yang memang dikenal aplikasi lama (nama, kategori bawaan, jam, …) tetap "perubahan terakhir menang" seperti sebelumnya
  assert.equal(t2.cat, 'jamkerja');
});

// ---------------- Tahap 2 ----------------

test('jam & durasi: tanpa jam, durasi bawaan 1 jam, lewat tengah malam', () => {
  assert.deepEqual([L.toMin('00:00'), L.toMin('08:30'), L.toMin('23:59')], [0, 510, 1439]);
  assert.deepEqual([L.toMin(''), L.toMin('24:00'), L.toMin('8:30'), L.toMin(null), L.toMin('12:60')], [null, null, null, null, null]);
  assert.deepEqual([L.fromMin(0), L.fromMin(510), L.fromMin(1440), L.fromMin(1500), L.fromMin(-30)], ['00:00', '08:30', '00:00', '01:00', '23:30']);
  assert.equal(L.durMin('', ''), null, 'tanpa jam → tidak punya durasi');
  assert.equal(L.durMin('', '17:00'), null, 'hanya jam selesai → tetap dianggap tanpa jam mulai');
  assert.equal(L.durMin('08:00', ''), 60, 'jam selesai kosong → durasi bawaan 1 jam');
  assert.equal(L.DEF_DUR, 60);
  assert.equal(L.durMin('08:00', '09:30'), 90);
  assert.equal(L.durMin('22:00', '01:00'), 180, 'jam selesai < jam mulai = lewat tengah malam');
  assert.equal(L.durMin('08:00', '08:00'), 0);
  assert.equal(L.durMin('01:00', '23:00'), 1320, 'rentang panjang di data lama');
  assert.deepEqual([L.endAfter('08:00', 60), L.endAfter('08:15', 90), L.endAfter('23:00', 120), L.endAfter('', 60)], ['09:00', '09:45', '01:00', '']);
  assert.deepEqual([L.crossesMidnight('22:00', '01:00'), L.crossesMidnight('08:00', '09:00'), L.crossesMidnight('08:00', ''), L.crossesMidnight('', '01:00')], [true, false, false, false]);
  assert.deepEqual([0, 30, 60, 90, 120, 185, 1320].map(L.fmtDur), ['0 mnt', '30 mnt', '1 jam', '1 jam 30 mnt', '2 jam', '3 jam 5 mnt', '22 jam']);
  // bolak-balik: jam mulai + durasi → jam selesai → durasi yang sama (semua menit dalam sehari, beberapa durasi)
  for (let s = 0; s < 1440; s += 7) for (const d of [1, 30, 60, 90, 180, 600, 1439]) {
    const st = L.fromMin(s);
    assert.equal(L.durMin(st, L.endAfter(st, d)), d, st + ' + ' + d);
  }
});

test('saran nama: cocok sebagian, tidak peka huruf besar/kecil, unik, maks 5, terbaru dulu', () => {
  const T = (name, at) => ({ name, createdAt: at, updatedAt: at });
  const list = [
    T('Laporan praktikum', 10), T('laporan  Praktikum', 30), T('Kirim laporan', 20), T('Lapor ke dosen', 5),
    T('Rapat tim', 1), T('Pelaporan pajak', 40), T('Laporan A', 2), T('Laporan B', 3), T('Laporan C', 4), T('(tanpa nama)', 99), null, { name: 5 }
  ];
  // diawali "lap" dulu (terbaru dulu), lalu kata kedua diawali "lap", lalu yang hanya mengandung "lap"; maks 5
  assert.deepEqual(plain(L.suggestNames(list, 'lap', 5)), ['laporan Praktikum', 'Lapor ke dosen', 'Laporan C', 'Laporan B', 'Laporan A']);
  assert.deepEqual(plain(L.suggestNames(list, 'LAPORAN', 10)), ['laporan Praktikum', 'Laporan C', 'Laporan B', 'Laporan A', 'Kirim laporan', 'Pelaporan pajak'],
    'nama kembar (beda spasi/huruf) jadi satu, versi terbaru yang dipakai');
  assert.deepEqual(plain(L.suggestNames(list, 'laporan praktikum', 5)), [], 'nama yang persis sama dengan ketikan tidak disarankan');
  assert.deepEqual(plain(L.suggestNames(list, '  ', 5)), []);
  assert.deepEqual(plain(L.suggestNames(list, 'xyz', 5)), []);
  assert.deepEqual(plain(L.suggestNames(null, 'lap', 5)), []);
  assert.equal(L.suggestNames(list, 'a').length, 5, 'bawaan maks 5');
  assert.deepEqual(plain(L.suggestNames([T('Tugas (Kuliah)', 1)], 'kul', 5)), ['Tugas (Kuliah)'], 'awal kata setelah tanda baca');
});

test('mode coba: data contoh valid, tanggal relatif hari ini, server palsu menyimpan perubahan hanya di memori', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const APP_CATS = new Set([...html.matchAll(/\{k:'([a-z_]+)'/g)].map(m => m[1]));
  const anyCat = k => APP_CATS.has(k);
  assert.ok(!/^[a-z0-9_.]{3,20}$/.test(L.DEMO_TOKEN), 'token mode coba tidak mungkin sama dengan username');

  const seed = L.demoSeed('2026-11-10', 1762740000000);
  assert.ok(seed.tasks.length >= 8);
  assert.equal(new Set(seed.tasks.map(t => t.id)).size, seed.tasks.length, 'ID unik');
  seed.tasks.forEach(t => {
    assert.ok(APP_CATS.has(t.cat), 'kategori bawaan: ' + t.cat);
    assert.deepEqual(plain(L.normTask(t, t.id, anyCat)), plain(t), 'sudah berbentuk standar: ' + t.name);
    if (t.dlDate) assert.ok(t.dlDate >= t.date, 'deadline tidak sebelum tanggal: ' + t.name);
  });
  const dates = seed.tasks.map(t => t.date);
  ['2026-11-09', '2026-11-10', '2026-11-11'].forEach(d => assert.ok(dates.includes(d), 'ada tugas ' + d));
  assert.ok(seed.tasks.some(t => t.done) && seed.tasks.some(t => !t.done));
  assert.ok(L.demoSeed('2026-12-30', 0).tasks.some(t => t.date === '2027-01-01'), 'tanggal melewati akhir bulan/tahun');
  const now = new Date(2026, 10, 10, 9, 15).getTime();   // 10 Nov 09.15 (jam lokal)
  L.demoSeed('2026-11-10', now).tasks.filter(t => t.done).forEach(t => {
    assert.ok(t.doneAt <= now, 'dicentang tidak di masa depan: ' + t.name);
    if (t.dlDate) { const [y, m, d] = t.dlDate.split('-').map(Number), [hh, mm] = t.dlTime.split(':').map(Number);
      assert.ok(t.doneAt <= new Date(y, m - 1, d, hh, mm).getTime(), 'selesai sebelum deadline: ' + t.name); }
  });

  const call = L.demoServer(seed, anyCat);
  assert.equal(call('apiLoad', ['token-lain']).error, 'auth', 'hanya menerima token mode coba');
  const r0 = call('apiLoad', [L.DEMO_TOKEN]);
  assert.equal(r0.ok, true); assert.equal(r0.user.name, 'Tamu');
  assert.equal(L.serverIsCurrent(r0), true, 'schema terbaru → tidak ada peringatan server lama');
  assert.equal(r0.tasks.length, seed.tasks.length);
  r0.tasks[0].name = 'diubah di luar';   // jawaban = salinan, bukan data di memori
  assert.notEqual(call('apiLoad', [L.DEMO_TOKEN]).tasks[0].name, 'diubah di luar');

  const baru = Object.assign({}, seed.tasks[0], { id: 'tbaru', name: 'Tugas pengunjung', done: false, doneAt: null, doneBy: '' });
  const r1 = call('apiSync', [L.DEMO_TOKEN, [{ op: 'upsert', task: baru }, { op: 'delete', id: 'coba2' },
    { op: 'upsert', task: Object.assign({}, seed.tasks[3], { done: true, doneAt: 5, doneBy: 'p1' }) }]]);
  assert.equal(r1.ok, true);
  const byId = Object.fromEntries(call('apiLoad', [L.DEMO_TOKEN]).tasks.map(t => [t.id, t]));
  assert.equal(byId.tbaru.name, 'Tugas pengunjung');
  assert.equal(byId.coba2, undefined, 'hapus tersimpan');
  assert.equal(byId[seed.tasks[3].id].done, true, 'centang tersimpan');
  assert.equal(Object.keys(byId).length, seed.tasks.length);
  assert.equal(seed.tasks.find(t => t.id === 'coba2').name, 'Belanja bulanan', 'data contoh asli tidak ikut berubah');

  const m = L.mergeServer(r1, [], { cats: [], profiles: [] }, anyCat);   // jalur yang sama dengan applyServer di aplikasi
  assert.equal(Object.keys(m.tasks).length, seed.tasks.length);
  assert.deepEqual(plain(m.profiles), [{ id: 'p1', name: 'Tamu', avatar: '' }]);

  assert.equal(call('apiProfile', [L.DEMO_TOKEN, '  Budi  ']).user.name, 'Budi');
  const pin = call('apiChangePin', [L.DEMO_TOKEN, '1234', '5678']);
  assert.equal(pin.ok, false); assert.match(pin.message, /mode coba/);
});

// ---------------- Tahap 3 ----------------

// kategori bawaan di aplikasi (CATS di script utama) dan di server (CATS di Code.gs) harus sama persis
function appBuiltinCats() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  return [...html.matchAll(/\{k:'([a-z_]+)', n:'([^']+)'/g)].map(m => ({ k: m[1], n: m[2] }));
}

test('kategori bawaan aplikasi = kategori bawaan server (kode & nama)', () => {
  const app = appBuiltinCats();
  const server = plain(vm.runInContext('CATS', makeRuntime()));
  assert.equal(app.length, 27);
  assert.deepEqual(Object.fromEntries(app.map(c => [c.k, c.n])), server);
});

test('nama kategori custom: wajib, dirapikan, tidak boleh kembar dengan bawaan maupun custom lain', () => {
  const builtin = [...new Set(appBuiltinCats().map(c => c.n))];
  const cats = [{ id: 'c_a', name: 'Freelance', hue: 0 }, { id: 'c_b', name: 'Les Privat', hue: 18 }];
  const chk = (n, self) => plain(L.checkCatName(n, builtin, cats, self || null));
  assert.deepEqual(chk('  Jualan   online '), { name: 'Jualan online', error: '' }, 'spasi dirapikan');
  assert.match(chk('').error, /wajib/);
  assert.match(chk('   ').error, /wajib/);
  assert.match(chk('\u0007').error, /wajib/, 'karakter kontrol saja = kosong');
  assert.match(chk('lainnya').error, /kategori bawaan/, 'tidak peka huruf besar/kecil');
  assert.match(chk('UJIAN /  KUIS').error, /kategori bawaan/, 'spasi ganda dirapikan sebelum dibandingkan');
  assert.match(chk('freelance').error, /Sudah ada kategori bernama "Freelance"/);
  assert.equal(chk('freelance', 'c_a').error, '', 'mengubah huruf besar/kecil nama sendiri boleh');
  assert.match(chk('les privat', 'c_a').error, /Les Privat/, 'mengganti nama jadi nama kategori lain tidak boleh');
  assert.equal(chk('x'.repeat(40)).name.length, L.CAT_NAME_MAX, 'maks 30 huruf');
  assert.equal(chk('a'.repeat(29) + ' bcd').name, 'a'.repeat(29), 'potongan 30 huruf tidak berakhiran spasi');
  assert.equal(chk('Kerja Sambilan').error, '');
  // aturan yang sama dengan server: nama yang lolos di HP tidak diganti server
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  const ok = chk('  Kedai   Kopi ');
  const res = S.post('apiSync', tok, [{ op: 'cat', cat: { id: 'c_k', name: ok.name, hue: 52 } }]);
  assert.deepEqual(plain(res.cats), [{ id: 'c_k', name: 'Kedai Kopi', hue: 52 }]);
});

test('warna kategori baru: palet yang belum dipakai, lalu berputar', () => {
  assert.equal(L.CAT_HUES.length, 12);
  assert.ok(L.CAT_HUES.every(h => Number.isInteger(h) && h >= 0 && h < 360));
  assert.equal(L.nextCatHue([]), L.CAT_HUES[0]);
  assert.equal(L.nextCatHue([{ hue: L.CAT_HUES[0] }, { hue: 77 }]), L.CAT_HUES[1]);
  const full = L.CAT_HUES.map((h, i) => ({ id: 'c_' + i, hue: h }));
  assert.equal(L.nextCatHue(full), L.CAT_HUES[0], 'semua terpakai → berputar');
  assert.equal(L.nextCatHue(full.concat([{ hue: 5 }])), L.CAT_HUES[1]);
  assert.equal(L.nextCatHue(null), L.CAT_HUES[0]);
});

test('hapus kategori custom: tugasnya pindah ke Lainnya (tidak terhapus), hasil HP = hasil server', () => {
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  const T = (id, cat) => ({ id, cat, name: 'Tugas ' + id, detail: '', date: '2026-11-1' + id.slice(1), start: '08:00', end: '09:00', dlDate: '', dlTime: '', done: id === 't2', doneAt: id === 't2' ? 5 : null, createdAt: 1, updatedAt: 1, kind: 'tugas', diff: '', parent: '', by: 'p1', doneBy: id === 't2' ? 'p1' : '' });
  // HP: buat kategori + 3 tugas di dalamnya + 1 tugas bawaan dalam SATU antrean (server memproses op kategori lebih dulu)
  let ops = [];
  [T('t1', 'c_free'), T('t2', 'c_free'), T('t3', 'tkuliah'), T('t4', 'c_free')].forEach(t => { ops = L.enqueue(ops, { op: 'upsert', task: t }); });
  ops = L.enqueue(ops, { op: 'cat', cat: { id: 'c_free', name: 'Freelance', hue: 212 } });
  let res = S.post('apiSync', tok, ops);
  let m = L.mergeServer(res, [], { cats: [], profiles: [] }, isBuiltin);
  assert.deepEqual(Object.values(plain(m.tasks)).map(t => t.cat).sort(), ['c_free', 'c_free', 'c_free', 'tkuliah']);
  assert.equal(S.sheet('@adit').objects().find(o => o.ID === 't1')['Kategori'], 'Freelance', 'nama kategori custom tertulis di sheet');

  // HP menghapus kategori (seperti deleteCatNow di aplikasi)
  const list = Object.values(m.tasks);
  const r = L.deleteCat(list, m.cats, 'c_free', 99);
  assert.deepEqual(plain(r.cats), []);
  assert.deepEqual(plain(r.moved).sort(), ['t1', 't2', 't4']);
  assert.ok(list.filter(t => r.moved.includes(t.id)).every(t => t.cat === 'lain_t' && t.updatedAt === 99));
  assert.equal(m.tasks.t3.cat, 'tkuliah', 'tugas kategori lain tidak tersentuh');
  assert.equal(m.tasks.t2.done, true, 'status tugas tetap');
  ops = [];
  r.moved.forEach(id => { ops = L.enqueue(ops, { op: 'upsert', task: L.toDoc(m.tasks[id]) }); });
  ops = L.enqueue(ops, { op: 'cat-del', id: 'c_free' });
  res = S.post('apiSync', tok, ops);
  assert.deepEqual(plain(res.cats), []);
  assert.equal(res.tasks.length, 4, 'tidak ada tugas yang hilang');
  assert.deepEqual(res.tasks.map(t => [t.id, t.cat]).sort(), [['t1', 'lain_t'], ['t2', 'lain_t'], ['t3', 'tkuliah'], ['t4', 'lain_t']]);

  // HP lain yang masih offline menghapus kategori TANPA memindahkan tugas (mis. versi lama): server tetap memindahkan
  const S2 = makeRuntime();
  const tok2 = S2.post('apiRegister', 'budi', '1234', 'Budi').token;
  S2.post('apiSync', tok2, [{ op: 'cat', cat: { id: 'c_x', name: 'X', hue: 0 } }, { op: 'upsert', task: T('t1', 'c_x') }]);
  const res2 = S2.post('apiSync', tok2, [{ op: 'cat-del', id: 'c_x' }]);
  assert.equal(res2.tasks[0].cat, 'lain_t');

  // urungkan hapus: kategori dibuat lagi dengan ID yang sama, tugasnya kembali
  ops = [];
  ops = L.enqueue(ops, { op: 'cat', cat: { id: 'c_free', name: 'Freelance', hue: 212 } });
  ['t1', 't2', 't4'].forEach(id => { ops = L.enqueue(ops, { op: 'upsert', task: Object.assign(T(id, 'c_free'), { updatedAt: 100 }) }); });
  res = S.post('apiSync', tok, ops);
  assert.deepEqual(plain(res.cats), [{ id: 'c_free', name: 'Freelance', hue: 212 }]);
  assert.deepEqual(res.tasks.filter(t => t.cat === 'c_free').map(t => t.id).sort(), ['t1', 't2', 't4']);
});

test('hapus kategori di HP sebelum sempat terkirim: op cat diganti cat-del, tugas tidak memakai kode yang hilang', () => {
  let ops = [];
  ops = L.enqueue(ops, { op: 'cat', cat: { id: 'c_baru', name: 'Baru', hue: 0 } });
  const t = { id: 'tx', cat: 'c_baru', updatedAt: 1 };
  const r = L.deleteCat([t], [{ id: 'c_baru', name: 'Baru', hue: 0 }], 'c_baru', 2);
  ops = L.enqueue(ops, { op: 'upsert', task: Object.assign({ name: 'x', date: '2026-11-10' }, t) });
  ops = L.enqueue(ops, { op: 'cat-del', id: 'c_baru' });
  assert.deepEqual(plain(r.moved), ['tx']);
  assert.deepEqual(plain(ops).map(o => o.op), ['upsert', 'cat-del'], 'satu op per kategori');
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  const res = S.post('apiSync', tok, ops);
  assert.equal(res.ok, true);
  assert.deepEqual([res.cats.length, res.tasks[0].cat], [0, 'lain_t']);
});

test('riwayat per kategori: terbaru dulu (tanggal, jam, lalu yang dibuat terakhir)', () => {
  const t = (id, date, start, createdAt) => ({ id, date, start, createdAt });
  const list = [t('a', '2026-11-01', '08:00', 1), t('b', '2026-11-03', '07:00', 1), t('c', '2026-11-03', '19:00', 1),
    t('d', '2026-11-03', '', 1), t('e', '2026-11-02', '10:00', 1), t('f', '2026-11-02', '10:00', 5)];
  assert.deepEqual(list.slice().sort(L.byTime).map(x => x.id), ['a', 'e', 'f', 'b', 'c', 'd'], 'urutan biasa: tanpa jam di akhir harinya');
  assert.deepEqual(list.slice().sort(L.newestFirst).map(x => x.id), ['d', 'c', 'b', 'f', 'e', 'a'], 'riwayat = kebalikannya');
});

test('mode coba: kategori custom bisa dibuat, dipakai, dan dihapus (tugas pindah ke Lainnya)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const APP_CATS = new Set([...html.matchAll(/\{k:'([a-z_]+)'/g)].map(m => m[1]));
  const call = L.demoServer(L.demoSeed('2026-11-10', 1762740000000), k => APP_CATS.has(k));
  const t = Object.assign({}, call('apiLoad', [L.DEMO_TOKEN]).tasks[0], { cat: 'c_kopi' });
  let r = call('apiSync', [L.DEMO_TOKEN, [{ op: 'cat', cat: { id: 'c_kopi', name: 'Kopi', hue: 38 } }, { op: 'upsert', task: t }]]);
  assert.deepEqual(plain(r.cats), [{ id: 'c_kopi', name: 'Kopi', hue: 38 }]);
  assert.equal(r.tasks.find(x => x.id === t.id).cat, 'c_kopi');
  r = call('apiSync', [L.DEMO_TOKEN, [{ op: 'cat-del', id: 'c_kopi' }]]);
  assert.deepEqual(plain(r.cats), []);
  assert.equal(r.tasks.find(x => x.id === t.id).cat, 'lain_t', 'seperti Code.gs');
});

// ---- Tahap 4: banyak tugas sekaligus (Poin 12 + 13) ----
const D = o => Object.assign({ cat: 'tkuliah', name: 'Kuis', detail: '', diff: '', date: '2026-12-01', multi: false, dates: [],
  noTime: false, start: '08:00', end: '09:00', dlOn: false, dlDate: '', dlTime: '', dlOff: 0 }, o);
let idN = 0;
const seqId = () => 'tb' + (++idN);
const OPTS = o => Object.assign({ now: 1000, by: 'p1', newId: seqId, isCat: isBuiltin, existing: 0 }, o);

test('beberapa tanggal: pilih/batalkan, urut, tanpa kembar, ada batas', () => {
  let r = L.toggleDate([], '2026-12-05');
  r = L.toggleDate(r.dates, '2026-12-01');
  r = L.toggleDate(r.dates, '2026-12-20');
  assert.deepEqual(plain(r.dates), ['2026-12-01', '2026-12-05', '2026-12-20'], 'urut');
  r = L.toggleDate(r.dates, '2026-12-05');
  assert.deepEqual(plain(r.dates), ['2026-12-01', '2026-12-20'], 'tap lagi = batal');
  assert.deepEqual(plain(L.toggleDate(['2026-12-01'], 'bukan-tanggal').dates), ['2026-12-01']);
  const full = L.toggleDate(['2026-12-01', '2026-12-02'], '2026-12-03', 2);
  assert.deepEqual([full.full, full.dates.length], [true, 2], 'sudah penuh → ditolak');
  assert.equal(L.toggleDate(['2026-12-01', '2026-12-02'], '2026-12-02', 2).full, false, 'membatalkan saat penuh tetap boleh');
  assert.deepEqual(plain(L.draftDates(D({ multi: true, dates: ['2026-12-09', 'x', '2026-12-02', '2026-12-09'] }))), ['2026-12-02', '2026-12-09']);
  assert.deepEqual(plain(L.draftDates(D({ multi: false, dates: ['2026-12-09'] }))), ['2026-12-01'], 'tidak multi → tanggal biasa');
});

test('simpan banyak: satu form satu tanggal = sama persis dengan form lama', () => {
  idN = 0;
  const r = L.buildBatch([D({ name: '  Kuis Statistika  ', detail: ' bab 3 ', diff: 'sulit', dlOn: true, dlDate: '2026-12-02', dlTime: '10:00' })], OPTS());
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.tasks), [{ id: 'tb1', kind: 'tugas', parent: '', by: 'p1', cat: 'tkuliah', name: 'Kuis Statistika', detail: 'bab 3',
    date: '2026-12-01', start: '08:00', end: '09:00', diff: 'sulit', dlDate: '2026-12-02', dlTime: '10:00',
    done: false, doneAt: null, doneBy: '', createdAt: 1000, updatedAt: 1000 }]);
  const nt = L.buildBatch([D({ noTime: true, dlOn: true, dlDate: '', dlTime: '' })], OPTS()).tasks[0];
  assert.deepEqual([nt.start, nt.end, nt.dlDate, nt.dlTime], ['', '', '2026-12-01', '23:59'], 'tanpa jam; deadline kosong → tanggal tugas 23:59');
  const long = L.buildBatch([D({ name: 'x'.repeat(300), detail: 'y'.repeat(3000) })], OPTS()).tasks[0];
  assert.deepEqual([long.name.length, long.detail.length], [120, 2000]);
});

test('beberapa tanggal (Poin 12): satu tugas terpisah per tanggal, deadline ikut tiap tanggal', () => {
  idN = 0;
  const dates = ['2026-12-28', '2026-12-05', '2026-12-31'];
  const r = L.buildBatch([D({ name: 'Piket', detail: 'lantai 2', diff: 'mudah', multi: true, dates, start: '07:00', end: '07:30',
    dlOn: true, dlOff: 2, dlTime: '17:00', dlDate: '2026-12-01' })], OPTS());
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.tasks.map(t => [t.date, t.dlDate, t.dlTime])), [['2026-12-05', '2026-12-07', '17:00'], ['2026-12-28', '2026-12-30', '17:00'], ['2026-12-31', '2027-01-02', '17:00']],
    'urut tanggal; deadline = tanggal + 2 hari (lewat tahun juga benar); dlDate form diabaikan saat multi');
  assert.equal(new Set(r.tasks.map(t => t.id)).size, 3, 'ID berbeda = berdiri sendiri');
  assert.ok(r.tasks.every(t => t.name === 'Piket' && t.detail === 'lantai 2' && t.cat === 'tkuliah' && t.start === '07:00' && t.end === '07:30' && t.diff === 'mudah'));
  assert.deepEqual(plain(r.tasks.map(t => t.createdAt)), [1000, 1001, 1002], 'urutan dibuat naik');
  const same = L.buildBatch([D({ multi: true, dates: ['2026-12-05'], dlOn: true, dlOff: 0 })], OPTS()).tasks[0];
  assert.equal(same.dlDate, '2026-12-05', 'hari yang sama');
  assert.equal(L.buildBatch([D({ multi: true, dates: ['2026-12-05'], dlOn: true, dlOff: 99 })], OPTS()).tasks[0].dlDate, '2026-12-12', 'jarak dibatasi 7 hari');
  assert.equal(L.buildBatch([D({ multi: true, dates: ['2026-12-05'], dlOn: false, dlOff: 3 })], OPTS()).tasks[0].dlDate, '', 'deadline mati');
});

test('banyak form (Poin 13): kategori berbeda-beda; satu form belum lengkap → tidak ada yang disimpan', () => {
  idN = 0;
  const ok = L.buildBatch([D({ name: 'A', cat: 'tkuliah' }), D({ name: 'B', cat: 'tkerja', start: '09:00', end: '10:00' }),
    D({ name: 'C', cat: 'belajar', multi: true, dates: ['2026-12-02', '2026-12-03'] })], OPTS());
  assert.equal(ok.ok, true);
  assert.deepEqual(plain(ok.tasks.map(t => [t.name, t.cat, t.date])), [['A', 'tkuliah', '2026-12-01'], ['B', 'tkerja', '2026-12-01'],
    ['C', 'belajar', '2026-12-02'], ['C', 'belajar', '2026-12-03']], 'urutan = urutan form, lalu tanggal');

  const bad = L.buildBatch([D({ name: 'A' }), D({ name: '   ' }), D({ name: 'C', cat: 'ngawur' }), D({ name: 'D', multi: true, dates: [] }),
    D({ name: 'E', date: '' })], OPTS());
  assert.equal(bad.ok, false);
  assert.equal(bad.tasks, undefined, 'semua atau tidak sama sekali');
  assert.deepEqual(plain(bad.errors).map(e => [e.i, Object.keys(e).filter(k => k !== 'i').join()]), [[1, 'name'], [2, 'cat'], [3, 'dates'], [4, 'date']]);
  assert.equal(bad.msg, '4 form belum lengkap.');
  assert.equal(L.buildBatch([D({ name: '' })], OPTS()).msg, '', 'satu form: pesan di kolomnya saja');
  assert.equal(L.buildBatch([], OPTS()).ok, false);
});

test('simpan banyak: batas per simpan dan per akun dicek dulu (server diam-diam membuang kelebihan)', () => {
  const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  assert.equal(L.MAX_TASKS, Number((gs.match(/const MAX_TASKS = (\d+);/) || [])[1]), 'batas akun sama dengan Code.gs');
  assert.equal(L.MAX_OPS, Number((gs.match(/ops\.slice\(0, (\d+)\)/) || [])[1]), 'op per kirim sama dengan Code.gs');
  assert.ok(L.MAX_BATCH < L.MAX_OPS, 'satu simpan muat dalam satu kirim');
  const many = n => Array.from({ length: n }, (_, i) => L.ymdAdd('2026-01-01', i));
  assert.equal(L.buildBatch([D({ multi: true, dates: many(L.MAX_BATCH) })], OPTS()).tasks.length, L.MAX_BATCH);
  const over = L.buildBatch([D({ multi: true, dates: many(60) }), D({ multi: true, dates: many(41) })], OPTS());
  assert.deepEqual([over.ok, over.msg], [false, 'Total 101 tugas. Maksimal 100 tugas sekali simpan.']);
  const forms = L.buildBatch(Array.from({ length: L.MAX_FORMS + 1 }, () => D({})), OPTS());
  assert.equal(forms.ok, false);
  const full = L.buildBatch([D({ multi: true, dates: many(11) })], OPTS({ existing: L.MAX_TASKS - 10 }));
  assert.deepEqual([full.ok, full.tasks], [false, undefined]);
  assert.match(full.msg, /2990 tugas/);
  assert.equal(L.buildBatch([D({ multi: true, dates: many(10) })], OPTS({ existing: L.MAX_TASKS - 10 })).ok, true, 'pas di batas boleh');
  // ID kembar dari newId / ID yang sudah dipakai → dibuat ulang
  const ids = ['dup', 'dup', 'ada', 'baru'];
  const r = L.buildBatch([D({ multi: true, dates: ['2026-12-01', '2026-12-02'] })], OPTS({ newId: () => ids.shift(), taken: id => id === 'ada' }));
  assert.deepEqual(plain(r.tasks.map(t => t.id)), ['dup', 'baru']);
  assert.equal(L.buildBatch([D({})], OPTS({ newId: () => 'tetap', taken: () => true })).ok, false, 'tidak macet kalau ID selalu kembar');
});

test('simpan banyak → server (Code.gs): semua tersimpan dalam satu kirim, tiap tugas berdiri sendiri', () => {
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  idN = 0;
  const b = L.buildBatch([D({ name: 'Piket', multi: true, dates: ['2026-12-01', '2026-12-08', '2026-12-15'], dlOn: true, dlOff: 1, dlTime: '12:00' }),
    D({ name: 'Rapat', cat: 'tkerja', start: '13:00', end: '14:00' })], OPTS());
  let ops = [];
  b.tasks.forEach(t => { ops = L.enqueue(ops, { op: 'upsert', task: L.toDoc(t) }); });
  let res = S.post('apiSync', tok, ops);
  assert.equal(res.ok, true);
  assert.deepEqual(plain(res.tasks.map(t => [t.name, t.date, t.dlDate, t.dlTime, t.cat])).sort(), [
    ['Piket', '2026-12-01', '2026-12-02', '12:00', 'tkuliah'], ['Piket', '2026-12-08', '2026-12-09', '12:00', 'tkuliah'],
    ['Piket', '2026-12-15', '2026-12-16', '12:00', 'tkuliah'], ['Rapat', '2026-12-01', '', '', 'tkerja']]);
  assert.equal(S.sheet('@adit').objects().length, 4);
  // centang satu, ubah satu, hapus satu: yang lain tidak ikut berubah
  const [p1, p2, p3] = b.tasks;
  res = S.post('apiSync', tok, [
    { op: 'upsert', task: L.toDoc(Object.assign({}, p1, { done: true, doneAt: 5, doneBy: 'p1', updatedAt: 2000 })) },
    { op: 'upsert', task: L.toDoc(Object.assign({}, p2, { name: 'Piket (tukar)', updatedAt: 2000 })) },
    { op: 'delete', id: p3.id }]);
  const by = Object.fromEntries(res.tasks.map(t => [t.id, t]));
  assert.deepEqual([by[p1.id].done, by[p1.id].name], [true, 'Piket']);
  assert.deepEqual([by[p2.id].done, by[p2.id].name], [false, 'Piket (tukar)']);
  assert.equal(by[p3.id], undefined);
  assert.equal(res.tasks.length, 3);
  // batas MAX_BATCH muat dalam satu kirim (server memproses maks 1000 op per kirim)
  idN = 100;
  const big = L.buildBatch([D({ multi: true, dates: Array.from({ length: L.MAX_BATCH }, (_, i) => L.ymdAdd('2027-01-01', i)) })], OPTS());
  ops = [];
  big.tasks.forEach(t => { ops = L.enqueue(ops, { op: 'upsert', task: L.toDoc(t) }); });
  res = S.post('apiSync', tok, ops);
  assert.equal(res.tasks.length, 3 + L.MAX_BATCH);
});

test('form baru dari "+": jam berurutan dengan durasi sama', () => {
  assert.deepEqual(plain(L.nextSlot('08:00', '09:30')), { start: '09:30', end: '11:00' });
  assert.deepEqual(plain(L.nextSlot('08:00', '')), { start: '09:00', end: '10:00' }, 'jam selesai kosong = 1 jam');
  assert.deepEqual(plain(L.nextSlot('08:00', '08:00')), { start: '09:00', end: '10:00' }, 'durasi 0 → 1 jam');
  assert.deepEqual(plain(L.nextSlot('22:00', '23:00')), { start: '23:00', end: '00:00' }, 'selesai lewat tengah malam boleh');
  assert.deepEqual(plain(L.nextSlot('23:00', '00:30')), { start: '23:00', end: '00:30' }, 'mulai baru lewat tengah malam → sama persis');
  assert.deepEqual(plain(L.nextSlot('', '')), { start: '', end: '' });
  assert.deepEqual(plain(L.nextSlot('', '17:00')), { start: '', end: '17:00' });
});

// ================= Tahap 5 (Poin 15): tugas dengan deadline lebih dari 1 hari =================
// Satu data tugas dengan rentang date … dlDate (K1). Fungsi di bawah hanya menghitung tampilan; data tidak disalin.
const MT = (id, date, dlDate, extra) => Object.assign({ id, cat: 'tkuliah', name: 'Tugas ' + id, detail: '', date, start: '08:00', end: '09:00',
  dlDate: dlDate || '', dlTime: dlDate ? '23:59' : '', done: false, doneAt: null, createdAt: 1, updatedAt: 1, kind: 'tugas', diff: '', parent: '', by: 'p1', doneBy: '' }, extra || {});
const allDays = (list, from, n) => Array.from({ length: n }, (_, i) => L.ymdAdd(from, i)).map(d => [d, L.tasksOn(list, d).map(t => t.id).join()]);

test('multi-hari: tampil di setiap tanggal dari tanggal mulai sampai deadline, tidak di luar itu', () => {
  const m = MT('m', '2026-11-05', '2026-11-07');
  assert.deepEqual([L.isMulti(m), L.spanDays(m), L.spanEnd(m)], [true, 3, '2026-11-07']);
  assert.deepEqual(allDays([m], '2026-11-03', 7), [['2026-11-03', ''], ['2026-11-04', ''], ['2026-11-05', 'm'], ['2026-11-06', 'm'], ['2026-11-07', 'm'], ['2026-11-08', ''], ['2026-11-09', '']]);
  assert.deepEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map(d => L.dayOf(m, d)), [0, 1, 2, 3, 0]);
  assert.deepEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map(d => L.spanTag(m, d)), ['Hari 1/3', 'Hari 2/3', 'Hari 3/3', '3 hari']);
  assert.equal(L.spanTag(m), '3 hari', 'tanpa tanggal (pencarian/riwayat) → jumlah hari');
  // bukan multi-hari: tanpa deadline, deadline hari yang sama, deadline lebih awal dari tanggal (tetap 1 hari, tidak mundur)
  for (const t of [MT('a', '2026-11-05', ''), MT('b', '2026-11-05', '2026-11-05'), MT('c', '2026-11-05', '2026-11-02')]) {
    assert.deepEqual([L.isMulti(t), L.spanDays(t), L.spanTag(t, '2026-11-05')], [false, 1, ''], t.id);
    assert.deepEqual(allDays([t], '2026-11-01', 7).filter(x => x[1]).map(x => x[0]), ['2026-11-05'], t.id + ' hanya di tanggalnya');
  }
  // lewat bulan & tahun, rentang panjang
  const y = MT('y', '2026-12-30', '2027-01-02');
  assert.deepEqual([L.spanDays(y), L.dayOf(y, '2027-01-01')], [4, 3]);
  const lama = MT('lama', '2026-11-01', '2026-11-20');   // seperti data lama nyata: 1 Nov → 20 Nov
  assert.equal(L.spanDays(lama), 20);
  assert.equal(L.spanDays(MT('k', '2024-02-28', '2024-03-01')), 3, 'tahun kabisat');
  assert.deepEqual([L.isMulti(null), L.spanDays({}), L.onDay({ date: 'x' }, 'x'), L.spanTag({})], [false, 0, false, '']);
});

test('multi-hari: urutan dalam satu tanggal = jam, lalu yang mulainya lebih dulu', () => {
  const list = [MT('baru', '2026-11-06', '', { start: '08:00', createdAt: 1 }), MT('lanjut', '2026-11-04', '2026-11-08', { start: '08:00', createdAt: 9 }),
    MT('pagi', '2026-11-06', '', { start: '07:00' }), MT('tj', '2026-11-05', '2026-11-06', { start: '', end: '' })];
  assert.deepEqual(plain(L.tasksOn(list, '2026-11-06').map(t => t.id)), ['pagi', 'lanjut', 'baru', 'tj'], 'tanpa jam di akhir (Home menaruhnya di bagian "Tanpa jam")');
});

test('multi-hari: per bulan dihitung 1 (di setiap bulan yang dilewati), salinan tidak menambah jumlah', () => {
  const list = [MT('a', '2026-11-05', '2026-11-07'), MT('b', '2026-11-30', '2026-12-02'), MT('c', '2026-10-28', '2026-11-01'),
    MT('d', '2026-11-10', ''), MT('e', '2026-12-05', ''), MT('f', '2026-10-01', '2027-02-01')];
  const ids = mk => L.inMonth(list, mk).map(t => t.id).sort().join();
  assert.equal(ids('2026-11'), 'a,b,c,d,f');
  assert.equal(ids('2026-12'), 'b,e,f', 'b (30 Nov – 2 Des) ikut dihitung di Desember');
  assert.equal(ids('2026-10'), 'c,f');
  assert.equal(ids('2027-01'), 'f');
  assert.equal(ids('2027-03'), '');
  assert.equal(L.monthEnd('2026-02'), '2026-02-28');
  assert.equal(L.monthEnd('2024-02'), '2024-02-29');
  assert.equal(L.monthEnd('2026-12'), '2026-12-31');
  // kelompok per tanggal (Home & Kalender): muncul di setiap tanggalnya di bulan itu saja
  const g = L.byDay(list, '2026-11');
  assert.deepEqual(Object.keys(g).sort().slice(0, 8), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.deepEqual(plain(g['2026-11-01'].map(t => t.id).sort()), ['c', 'f']);
  assert.deepEqual(plain(g['2026-11-06'].map(t => t.id).sort()), ['a', 'f']);
  assert.deepEqual(plain(g['2026-11-30'].map(t => t.id).sort()), ['b', 'f']);
  assert.equal(Object.keys(g).length, 30, 'f (Okt – Feb) tampil di semua 30 hari November, tidak lebih');
  assert.deepEqual(plain(L.daysIn(list[1], '2026-12')), ['2026-12-01', '2026-12-02']);
  assert.deepEqual(plain(L.daysIn(list[5], '2027-02')), ['2027-02-01']);
});

test('multi-hari di grafik: kurva per tanggal menghitung sekali (di tanggal mulai, atau tanggal 1 kalau mulai bulan lalu)', () => {
  const list = [MT('a', '2026-11-05', '2026-11-07'), MT('b', '2026-11-30', '2026-12-02'), MT('c', '2026-10-28', '2026-11-01'),
    MT('d', '2026-11-05', ''), MT('e', '2026-11-06', '2026-11-06')];
  const nov = L.perDay(list, '2026-11');
  assert.equal(nov.length, 30);
  assert.equal(nov.reduce((s, v) => s + v, 0), L.inMonth(list, '2026-11').length, 'jumlah kurva = jumlah tugas bulan itu (tetap 1 per tugas)');
  assert.deepEqual([nov[0], nov[4], nov[5], nov[6], nov[29]], [1, 2, 1, 0, 1], 'c di tgl 1, a+d di tgl 5, e di tgl 6, tgl 7 kosong, b di tgl 30');
  const des = L.perDay(list, '2026-12');
  assert.deepEqual([des.length, des[0], des.reduce((s, v) => s + v, 0)], [31, 1, 1], 'b dihitung di 1 Des untuk grafik Desember');
  assert.deepEqual([L.countDay(list[0], '2026-11'), L.countDay(list[2], '2026-11'), L.countDay(list[1], '2026-12')], ['2026-11-05', '2026-11-01', '2026-12-01']);
});

test('multi-hari: centang/batal/edit/hapus satu data → semua tanggal ikut; di server tetap SATU baris', () => {
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  const t = MT('tm1', '2026-11-05', '2026-11-07', { dlTime: '17:00' });
  let res = S.post('apiSync', tok, [{ op: 'upsert', task: L.toDoc(t) }]);
  assert.equal(res.ok, true);
  const rows = () => S.sheet('@adit').objects();
  assert.equal(rows().length, 1, 'disimpan sebagai satu data dengan rentang tanggal, bukan salinan');
  assert.deepEqual([rows()[0]['Tanggal'], rows()[0]['Deadline (tanggal)'], rows()[0]['Deadline (jam)']], ['2026-11-05', '2026-11-07', '17:00']);
  // dari data yang dikirim balik server, setiap tanggal menampilkan objek yang sama
  const merged = plain(L.mergeServer(res, [], { cats: [], profiles: [] }, isBuiltin));
  const list = Object.values(merged.tasks);
  const days = ['2026-11-05', '2026-11-06', '2026-11-07'];
  const shown = () => days.map(d => L.tasksOn(list, d)[0]);
  assert.ok(shown().every(x => x === list[0]), 'tiga tanggal = satu objek tugas');
  // centang di "hari 2" → semuanya tercentang; batal → semuanya batal
  const onDay2 = L.tasksOn(list, '2026-11-06')[0];
  Object.assign(onDay2, { done: true, doneAt: 9, doneBy: 'p1', updatedAt: 9 });
  assert.deepEqual(shown().map(x => x.done), [true, true, true]);
  res = S.post('apiSync', tok, [{ op: 'upsert', task: L.toDoc(onDay2) }]);
  assert.deepEqual([rows().length, rows()[0]['Status']], [1, 'Selesai']);
  Object.assign(L.tasksOn(list, '2026-11-07')[0], { done: false, doneAt: null, doneBy: '', updatedAt: 10 });
  assert.deepEqual(shown().map(x => x.done), [false, false, false]);
  // edit (nama + perpanjang deadline) berlaku untuk semua tanggal
  Object.assign(list[0], { name: 'Makalah', dlDate: '2026-11-08', updatedAt: 11 });
  assert.deepEqual(['2026-11-05', '2026-11-08'].map(d => L.tasksOn(list, d)[0].name), ['Makalah', 'Makalah']);
  assert.equal(L.spanTag(list[0], '2026-11-08'), 'Hari 4/4');
  res = S.post('apiSync', tok, [{ op: 'upsert', task: L.toDoc(list[0]) }]);
  assert.deepEqual([rows().length, rows()[0]['Nama tugas'], rows()[0]['Status'], rows()[0]['Deadline (tanggal)']], [1, 'Makalah', 'Belum', '2026-11-08']);
  // hapus → hilang dari semua tanggal
  res = S.post('apiSync', tok, [{ op: 'delete', id: 'tm1' }]);
  assert.equal(rows().length, 0);
  assert.deepEqual(days.map(d => L.tasksOn(res.tasks, d).length), [0, 0, 0]);
});

test('multi-hari dari "Beberapa tanggal" (konsekuensi K1): deadline +n hari → tiap tugas tampil n+1 hari, tetap terpisah', () => {
  idN = 0;
  const r = L.buildBatch([D({ name: 'Piket', multi: true, dates: ['2026-12-07', '2026-12-09'], dlOn: true, dlOff: 2 })], OPTS());
  const [sen, rab] = r.tasks;
  assert.deepEqual([L.spanDays(sen), L.spanDays(rab)], [3, 3]);
  assert.deepEqual(plain(L.tasksOn(r.tasks, '2026-12-09').map(t => [t.id, L.spanTag(t, '2026-12-09')])), [[sen.id, 'Hari 3/3'], [rab.id, 'Hari 1/3']], 'hari Rabu ada dua (tugas berbeda)');
  sen.done = true;
  assert.equal(L.tasksOn(r.tasks, '2026-12-09').filter(t => t.done).length, 1, 'centang tugas Senin tidak ikut tugas Rabu');
  assert.equal(L.inMonth(r.tasks, '2026-12').length, 2);
  // deadline "hari yang sama" (bawaan) tetap 1 hari
  assert.equal(L.spanDays(L.buildBatch([D({ multi: true, dates: ['2026-12-07'], dlOn: true, dlOff: 0 })], OPTS()).tasks[0]), 1);
});

test('mode coba: contoh tugas multi-hari ada dan tampil di setiap harinya', () => {
  const seed = L.demoSeed('2026-11-10', Date.UTC(2026, 10, 10, 2));
  const multi = seed.tasks.filter(L.isMulti);
  assert.ok(multi.length >= 1, 'ada contoh multi-hari');
  const m = multi.find(t => t.name === 'Desain halaman toko online');
  assert.deepEqual([m.date, m.dlDate, L.spanDays(m)], ['2026-11-12', '2026-11-14', 3]);
  assert.deepEqual(['2026-11-12', '2026-11-13', '2026-11-14'].map(d => L.tasksOn(seed.tasks, d).some(t => t === m)), [true, true, true]);
});
