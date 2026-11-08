// Unit test Tahap 1 (fondasi data + migrasi) untuk apps-script/Code.gs.
// Data lama dibuat oleh server versi sebelum Tahap 1 (tests/fixtures/Code-v1.gs) di spreadsheet tiruan,
// lalu server baru dijalankan di atas spreadsheet yang sama. Jalankan: node --test tests/server-data.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeRuntime } = require('./gas-mock');

const V1 = path.join(__dirname, 'fixtures', 'Code-v1.gs');
const HEADER_V1 = ['ID', 'Tanggal', 'Hari', 'Jam mulai', 'Jam selesai', 'Kategori', 'Nama tugas', 'Detail',
  'Deadline (tanggal)', 'Deadline (jam)', 'Status', 'Selesai pada', 'Dibuat', 'Diubah', 'Kode kategori'];
const NEW_COLS = ['Jenis', 'Kesulitan', 'Kegiatan induk', 'Dibuat oleh', 'Diselesaikan oleh'];
const HEADER = HEADER_V1.concat(NEW_COLS);

// tugas seperti yang dikirim aplikasi LAMA (tanpa field baru)
const oldTask = (id, extra) => Object.assign({
  id, cat: 'tkuliah', name: 'Tugas ' + id, detail: '', date: '2026-11-10', start: '08:00', end: '09:00',
  dlDate: '', dlTime: '', done: false, doneAt: null, createdAt: 1762740000000, updatedAt: 1762740000000
}, extra || {});
// tugas seperti yang dikirim aplikasi BARU (semua field)
const newTask = (id, extra) => Object.assign(oldTask(id), { kind: 'tugas', diff: '', parent: '', by: 'p1', doneBy: '' }, extra || {});

/** Spreadsheet berisi data dari server lama: adit (3 tugas, 1 selesai, 1 deadline multi-hari) + budi (1 tugas). */
function oldWorld() {
  const old = makeRuntime({ codePath: V1 });
  const a = old.post('apiRegister', 'adit', '1234', 'Adit');
  const b = old.post('apiRegister', 'budi', '4321', 'Budi');
  old.post('apiSync', a.token, [
    { op: 'upsert', task: oldTask('t1', { date: '2026-11-01', dlDate: '2026-11-03', dlTime: '23:59' }) },
    { op: 'upsert', task: oldTask('t2', { cat: 'jamkerja', name: '=Kerja', start: '08:00', end: '17:00', done: true, doneAt: 1762900000000 }) },
    { op: 'upsert', task: oldTask('t3', { start: '', end: '' }) }
  ]);
  old.post('apiSync', b.token, [{ op: 'upsert', task: oldTask('b1', { name: 'punya budi' }) }]);
  assert.deepEqual(old.sheet('@adit').header(), HEADER_V1, 'fixture: header lama 15 kolom');
  return { old, tokA: a.token, tokB: b.token };
}
const snapshotV1 = sh => sh.rows(HEADER_V1.length).slice(1).map(r => r.join('|')).sort();

test('migrasi: data dari server lama dibaca server baru, kolom baru terisi, data lama tidak berubah', () => {
  const { old, tokA, tokB } = oldWorld();
  const before = snapshotV1(old.sheet('@adit'));
  const S = makeRuntime({ shareWith: old });

  const r = S.post('apiLoad', tokA);                         // token lama tetap berlaku
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.schema, 2);
  assert.deepEqual(r.profiles, [{ id: 'p1', name: 'Adit', avatar: '' }], 'profil pertama dibuat dari nama akun');
  assert.deepEqual(r.cats, []);
  const byId = Object.fromEntries(r.tasks.map(t => [t.id, t]));
  assert.deepEqual(Object.keys(byId).sort(), ['t1', 't2', 't3']);
  for (const t of r.tasks) {
    assert.equal(t.kind, 'tugas', t.id + ': semua tugas lama = tugas (termasuk kategori Jam Kerja)');
    assert.equal(t.diff, '');
    assert.equal(t.parent, '');
    assert.equal(t.by, 'p1', t.id + ': pembuat = profil pertama');
  }
  assert.equal(byId.t2.done, true);
  assert.equal(byId.t2.doneBy, 'p1', 'tugas selesai: pencentang = profil pertama');
  assert.equal(byId.t1.doneBy, '');
  assert.equal(byId.t1.date, '2026-11-01');
  assert.equal(byId.t1.dlDate, '2026-11-03', 'deadline lama tetap (dipakai multi-hari di Tahap 5)');
  assert.equal(byId.t3.start, '', 'tugas tanpa jam tetap tanpa jam');
  assert.equal(byId.t2.name, '=Kerja');

  const sh = S.sheet('@adit');
  assert.deepEqual(sh.header(), HEADER, 'judul kolom baru ditambahkan');
  assert.deepEqual(snapshotV1(sh), before, '15 kolom lama tidak berubah sama sekali');
  assert.deepEqual(sh.objects().map(o => [o['ID'], o['Jenis'], o['Kesulitan'], o['Kegiatan induk'], o['Dibuat oleh'], o['Diselesaikan oleh']]).sort(),
    [['t1', 'Tugas', '', '', 'p1', ''], ['t2', 'Tugas', '', '', 'p1', 'p1'], ['t3', 'Tugas', '', '', 'p1', '']]);
  assert.deepEqual(S.sheet('Profil').header(), ['User ID', 'Username', 'ID profil', 'Nama', 'Avatar', 'Dibuat', 'Diubah']);
  assert.deepEqual(S.sheet('Profil').objects().map(o => [o['Username'], o['ID profil'], o['Nama']]), [['adit', 'p1', 'Adit']]);
  assert.equal(S.sheet('Kategori'), null, 'tab Kategori baru dibuat saat ada kategori custom pertama');

  // akun lain belum disentuh sampai dipakai
  assert.deepEqual(S.sheet('@budi').header(), HEADER_V1);
  const rb = S.post('apiLogin', 'budi', '4321');
  assert.equal(rb.ok, true);
  assert.deepEqual(rb.profiles, [{ id: 'p1', name: 'Budi', avatar: '' }]);
  assert.deepEqual(rb.tasks.map(t => [t.name, t.by, t.kind]), [['punya budi', 'p1', 'tugas']]);
  assert.deepEqual(S.sheet('@budi').header(), HEADER);
  assert.equal(S.sheet('Profil').objects().length, 2);
  assert.equal(S.post('apiLoad', tokB).ok, true);
  assert.equal(S.__log.formulaAttempts, 0);
});

test('migrasi: idempoten — muat ulang tidak menulis apa pun dan hasilnya sama', () => {
  const { old, tokA } = oldWorld();
  const S = makeRuntime({ shareWith: old });
  const first = S.post('apiLoad', tokA);
  const sheetAfter = S.sheet('@adit').rows();
  const profAfter = S.sheet('Profil').rows();
  const w = S.__log.writes;
  const second = S.post('apiLoad', tokA);
  assert.equal(S.__log.writes, w, 'muat kedua tidak menulis ke spreadsheet');
  assert.deepEqual(second.tasks, first.tasks);
  assert.deepEqual(S.sheet('@adit').rows(), sheetAfter);
  assert.deepEqual(S.sheet('Profil').rows(), profAfter);
  // sinkron tanpa perubahan juga tidak menambah profil
  S.post('apiSync', tokA, []);
  assert.equal(S.sheet('Profil').objects().length, 1);
});

test('kompatibilitas: aplikasi lama (tanpa field baru) tidak menghapus field baru', () => {
  const { old, tokA } = oldWorld();
  const S = makeRuntime({ shareWith: old });
  S.post('apiSync', tokA, [
    { op: 'profile', profile: { id: 'p2', name: 'Rina', avatar: 'a3' } },
    { op: 'cat', cat: { id: 'c_gym', name: 'Gym', hue: 140 } },
    { op: 'upsert', task: newTask('k1', { kind: 'kegiatan', name: 'Jam kerja', start: '08:00', end: '17:00' }) },
    { op: 'upsert', task: newTask('n1', { date: '2026-11-01', dlDate: '2026-11-03', diff: 'sulit', parent: 'k1', by: 'p2', cat: 'c_gym' }) }
  ]);
  // aplikasi lama mengedit nama & mencentang n1; ia tidak tahu kind/diff/parent/by dan mengirim kategori custom sebagai lain_t
  const r = S.post('apiSync', tokA, [{ op: 'upsert', task: oldTask('n1', { date: '2026-11-01', dlDate: '2026-11-03', name: 'Diedit HP lama', cat: 'lain_t', done: true, doneAt: 1762990000000 }) }]);
  const n1 = r.tasks.find(t => t.id === 'n1');
  assert.equal(n1.name, 'Diedit HP lama');
  assert.equal(n1.diff, 'sulit', 'kesulitan dipertahankan');
  assert.equal(n1.parent, 'k1', 'kegiatan induk dipertahankan');
  assert.equal(n1.by, 'p2', 'pembuat dipertahankan');
  assert.equal(n1.kind, 'tugas');
  assert.equal(n1.cat, 'c_gym', 'kategori custom dipertahankan walau HP lama mengirim lain_t');
  assert.equal(n1.done, true);
  assert.equal(n1.doneBy, 'p1', 'HP lama tidak tahu profil → pencentang = profil pertama');
  assert.equal(r.tasks.find(t => t.id === 'k1').kind, 'kegiatan');
  // aplikasi lama menambah tugas baru → default
  const r2 = S.post('apiSync', tokA, [{ op: 'upsert', task: oldTask('t9') }]);
  const t9 = r2.tasks.find(t => t.id === 't9');
  assert.deepEqual([t9.kind, t9.diff, t9.parent, t9.by, t9.doneBy], ['tugas', '', '', 'p1', '']);
  // aplikasi baru yang memilih lain_t secara sadar (mengirim kind) → benar-benar lain_t
  const r3 = S.post('apiSync', tokA, [{ op: 'upsert', task: newTask('n1', { date: '2026-11-01', cat: 'lain_t', parent: '' }) }]);
  assert.equal(r3.tasks.find(t => t.id === 'n1').cat, 'lain_t');
  assert.equal(r3.tasks.find(t => t.id === 'n1').parent, '', 'aplikasi baru boleh mengosongkan kegiatan induk');
});

test('tugas: kesulitan, jenis, kegiatan induk, pembuat & pencentang', () => {
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  S.post('apiSync', tok, [{ op: 'profile', profile: { id: 'p2', name: 'Rina' } }]);
  let r = S.post('apiSync', tok, [
    { op: 'upsert', task: newTask('k1', { kind: 'kegiatan', done: true, doneAt: 1, parent: 'x', by: 'p2' }) },
    { op: 'upsert', task: newTask('a', { diff: 'sedang', parent: 'k1', by: 'p2' }) },
    { op: 'upsert', task: newTask('b', { diff: 'ekstrem', parent: 'a' }) },            // induk bukan kegiatan
    { op: 'upsert', task: newTask('c', { parent: 'tidakada' }) },                      // induk tidak ada
    { op: 'upsert', task: newTask('d', { parent: 'd' }) },                             // induk diri sendiri
    { op: 'upsert', task: newTask('e', { done: true, doneAt: 1762900000000, doneBy: 'p2' }) },
    { op: 'upsert', task: newTask('f', { kind: 'aneh' }) }
  ]);
  const t = Object.fromEntries(r.tasks.map(x => [x.id, x]));
  assert.deepEqual([t.k1.kind, t.k1.done, t.k1.parent, t.k1.doneBy], ['kegiatan', false, '', ''], 'kegiatan tidak bisa dicentang & tidak punya induk');
  assert.deepEqual([t.a.diff, t.a.parent, t.a.by], ['sedang', 'k1', 'p2']);
  assert.deepEqual([t.b.diff, t.b.parent], ['', '']);
  assert.equal(t.c.parent, '');
  assert.equal(t.d.parent, '');
  assert.deepEqual([t.e.done, t.e.doneBy], [true, 'p2']);
  assert.equal(t.f.kind, 'tugas');
  const row = S.sheet('@adit').objects().find(o => o.ID === 'a');
  assert.deepEqual([row['Jenis'], row['Kesulitan'], row['Kegiatan induk'], row['Dibuat oleh']], ['Tugas', 'Sedang', 'k1', 'p2']);
  // statistik Pengguna hanya menghitung Tugas (k1 Kegiatan tidak dihitung)
  assert.equal(S.sheet('Pengguna').objects()[0]['Jumlah tugas'], '6');
  assert.equal(S.sheet('Pengguna').objects()[0]['Selesai'], '1');
  // pembuat tidak berubah saat diedit profil lain; batal centang mengosongkan pencentang
  r = S.post('apiSync', tok, [
    { op: 'upsert', task: newTask('a', { diff: 'sedang', parent: 'k1', by: 'p1', name: 'diedit p1' }) },
    { op: 'upsert', task: newTask('e', { done: false, doneBy: 'p2' }) }
  ]);
  assert.equal(r.tasks.find(x => x.id === 'a').by, 'p2');
  assert.equal(r.tasks.find(x => x.id === 'e').doneBy, '');
  // kegiatan dihapus → induk tugasnya dikosongkan (tugasnya tidak ikut terhapus)
  r = S.post('apiSync', tok, [{ op: 'delete', id: 'k1' }]);
  assert.equal(r.tasks.find(x => x.id === 'a').parent, '');
  assert.equal(r.tasks.length, 6);
});

test('kategori custom: tambah, nama unik, ganti nama, hapus → Lainnya, terpisah per akun', () => {
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  let r = S.post('apiSync', tok, [
    { op: 'cat', cat: { id: 'c_gym', name: '  Gym  ', hue: 140 } },
    { op: 'cat', cat: { id: 'c_b1', name: 'belajar', hue: 400 } },                 // bentrok dengan kategori bawaan
    { op: 'cat', cat: { id: 'c_b2', name: 'GYM', hue: -20 } },                     // bentrok dengan custom lain
    { op: 'cat', cat: { id: 'c_x', name: '   ' } },                                // nama kosong → ditolak
    { op: 'cat', cat: { id: 'bukan-custom', name: 'X' } },                         // ID salah → ditolak
    { op: 'upsert', task: newTask('t1', { cat: 'c_gym' }) },
    { op: 'upsert', task: newTask('t2', { cat: 'c_b1' }) }
  ]);
  assert.deepEqual(r.cats, [{ id: 'c_gym', name: 'Gym', hue: 140 }, { id: 'c_b1', name: 'belajar 2', hue: 40 }, { id: 'c_b2', name: 'GYM 2', hue: 340 }]);
  assert.equal(r.tasks.find(t => t.id === 't1').cat, 'c_gym');
  assert.deepEqual(S.sheet('Kategori').objects().map(o => [o['Username'], o['ID kategori'], o['Nama'], o['Warna (hue)']]),
    [['adit', 'c_gym', 'Gym', '140'], ['adit', 'c_b1', 'belajar 2', '40'], ['adit', 'c_b2', 'GYM 2', '340']]);
  assert.equal(S.sheet('@adit').objects().find(o => o.ID === 't1')['Kategori'], 'Gym');
  // ganti nama → kolom Kategori di tab tugas ikut berubah
  r = S.post('apiSync', tok, [{ op: 'cat', cat: { id: 'c_gym', name: 'Fitness', hue: 150 } }]);
  assert.equal(S.sheet('@adit').objects().find(o => o.ID === 't1')['Kategori'], 'Fitness');
  // hapus → tugasnya pindah ke Lainnya, tidak ikut terhapus
  r = S.post('apiSync', tok, [{ op: 'cat-del', id: 'c_gym' }]);
  assert.deepEqual(r.cats.map(c => c.id), ['c_b1', 'c_b2']);
  assert.equal(r.tasks.find(t => t.id === 't1').cat, 'lain_t');
  assert.deepEqual(['Kategori', 'Kode kategori'].map(h => S.sheet('@adit').objects().find(o => o.ID === 't1')[h]), ['Lainnya', 'lain_t']);
  // akun lain tidak bisa melihat atau memakai kategori adit
  const b = S.post('apiRegister', 'budi', '4321', 'Budi');
  assert.deepEqual(b.cats, []);
  const rb = S.post('apiSync', b.token, [{ op: 'upsert', task: newTask('x', { cat: 'c_b1' }) }]);
  assert.equal(rb.tasks[0].cat, 'lain_t');
  S.post('apiSync', b.token, [{ op: 'cat', cat: { id: 'c_b1', name: 'Punya Budi', hue: 10 } }]);
  assert.deepEqual(S.post('apiLoad', tok).cats.map(c => c.name), ['belajar 2', 'GYM 2'], 'ID kategori sama di akun lain tidak bentrok');
  assert.deepEqual(S.post('apiLoad', b.token).cats.map(c => c.name), ['Punya Budi']);
  // batas 50 kategori
  const many = Array.from({ length: 60 }, (_, i) => ({ op: 'cat', cat: { id: 'c_n' + i, name: 'Kat ' + i, hue: i } }));
  assert.equal(S.post('apiSync', tok, many).cats.length, 50);
});

test('profil: profil pertama otomatis, maks 5, profil terakhir tidak bisa dihapus, riwayat tetap', () => {
  const S = makeRuntime();
  const reg = S.post('apiRegister', 'adit', '1234', 'Adit');
  assert.deepEqual(reg.profiles, [{ id: 'p1', name: 'Adit', avatar: '' }]);
  assert.deepEqual(reg.cats, []);
  assert.equal(reg.schema, 2);
  const tok = reg.token;
  let r = S.post('apiSync', tok, ['p2', 'p3', 'p4', 'p5', 'p6'].map(id => ({ op: 'profile', profile: { id, name: 'Orang ' + id, avatar: 'a' + id.slice(1) } })));
  assert.deepEqual(r.profiles.map(p => p.id), ['p1', 'p2', 'p3', 'p4', 'p5'], 'maksimal 5 profil');
  r = S.post('apiSync', tok, [
    { op: 'profile', profile: { id: 'p2', name: '  Rina  ', avatar: 'BAD AVATAR!' } },
    { op: 'profile', profile: { id: 'X1', name: 'id salah' } },
    { op: 'upsert', task: newTask('t1', { by: 'p3', done: true, doneAt: 1762900000000, doneBy: 'p4' }) }
  ]);
  assert.deepEqual(r.profiles[1], { id: 'p2', name: 'Rina', avatar: '' });
  // hapus profil p3 & p4: tugasnya tetap mencatat ID lama (aplikasi menampilkan "Profil terhapus")
  r = S.post('apiSync', tok, [{ op: 'profile-del', id: 'p3' }, { op: 'profile-del', id: 'p4' }]);
  assert.deepEqual(r.profiles.map(p => p.id), ['p1', 'p2', 'p5']);
  assert.deepEqual([r.tasks[0].by, r.tasks[0].doneBy], ['p3', 'p4']);
  // tidak bisa menghapus semua profil
  r = S.post('apiSync', tok, ['p1', 'p2', 'p5'].map(id => ({ op: 'profile-del', id })));
  assert.equal(r.profiles.length, 1);
  assert.equal(r.profiles[0].id, 'p5');
  // tugas baru tanpa pembuat → profil pertama yang tersisa
  r = S.post('apiSync', tok, [{ op: 'upsert', task: oldTask('t2') }]);
  assert.equal(r.tasks.find(t => t.id === 't2').by, 'p5');
});

test('urutan kolom diubah pemilik: data tetap dibaca benar dan judul dikembalikan ke urutan standar', () => {
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  S.post('apiSync', tok, [{ op: 'upsert', task: newTask('t1', { name: 'Satu', detail: 'det' }) }]);
  const sh = S.sheet('@adit');
  // pemilik menukar kolom "Nama tugas" (G) dan "Detail" (H)
  const rows = sh.rows(HEADER.length);
  rows.forEach(r => { const g = r[6]; r[6] = r[7]; r[7] = g; });
  sh.getRange(1, 1, rows.length, HEADER.length).setValues(rows);
  assert.equal(S.post('apiLoad', tok).tasks[0].name, 'Satu', 'dibaca berdasarkan judul');
  assert.deepEqual(sh.header(), HEADER, 'judul ditulis ulang ke urutan standar');
  S.post('apiSync', tok, [{ op: 'upsert', task: newTask('t2', { name: 'Dua', date: '2026-11-11' }) }]);
  const r = S.post('apiLoad', tok);
  assert.deepEqual(r.tasks.map(t => [t.name, t.detail]), [['Satu', 'det'], ['Dua', '']], 'tidak ada data yang tertukar');
});

test('baris manual pemilik di tab baru: kolom baru kosong diisi default', () => {
  const S = makeRuntime();
  const tok = S.post('apiRegister', 'adit', '1234', 'Adit').token;
  S.post('apiSync', tok, [{ op: 'cat', cat: { id: 'c_gym', name: 'Gym', hue: 1 } }]);
  const sh = S.sheet('@adit');
  const row = HEADER.map(h => ({ 'Tanggal': '15/11/2026', 'Kategori': 'gym', 'Nama tugas': 'Angkat beban', 'Status': 'selesai', 'Jenis': 'kegiatan' }[h] || ''));
  const row2 = HEADER.map(h => ({ 'Tanggal': '16/11/2026', 'Nama tugas': 'Manual 2', 'Status': 'Selesai' }[h] || ''));
  sh.getRange(2, 1, 2, HEADER.length).setValues([row, row2]);
  const r = S.post('apiLoad', tok);
  const a = r.tasks.find(t => t.name === 'Angkat beban'), b = r.tasks.find(t => t.name === 'Manual 2');
  assert.equal(a.cat, 'c_gym', 'kategori custom dikenali dari namanya');
  assert.deepEqual([a.kind, a.done, a.by], ['kegiatan', false, 'p1'], 'kegiatan yang diketik "selesai" tetap tidak dicentang');
  assert.deepEqual([b.kind, b.done, b.by, b.doneBy], ['tugas', true, 'p1', 'p1']);
  assert.deepEqual(sh.objects().map(o => [o['Jenis'], o['Status'], o['Dibuat oleh'], o['Diselesaikan oleh']]),
    [['Kegiatan', 'Belum', 'p1', ''], ['Tugas', 'Selesai', 'p1', 'p1']]);
});

test('tab tugas yang kolomnya tinggal 15 (dihapus pemilik): kolom ditambah, tidak error', () => {
  const { old, tokA } = oldWorld();
  old.sheet('@adit').maxCols = 15;
  const S = makeRuntime({ shareWith: old });
  const r = S.post('apiLoad', tokA);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.tasks.length, 3);
  assert.equal(S.sheet('@adit').getMaxColumns(), 20);
  assert.deepEqual(S.sheet('@adit').header(), HEADER);
});
