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
