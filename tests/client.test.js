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
