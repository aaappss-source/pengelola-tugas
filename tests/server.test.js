// Unit test server (apps-script/Code.gs) memakai mock Apps Script. Jalankan: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRuntime } = require('./gas-mock');

const TASK_HEADER_V1 = ['ID', 'Tanggal', 'Hari', 'Jam mulai', 'Jam selesai', 'Kategori', 'Nama tugas', 'Detail',
  'Deadline (tanggal)', 'Deadline (jam)', 'Status', 'Selesai pada', 'Dibuat', 'Diubah', 'Kode kategori'];
const TASK_HEADER = TASK_HEADER_V1.concat(['Jenis', 'Kesulitan', 'Kegiatan induk', 'Dibuat oleh', 'Diselesaikan oleh']);

const task = (id, extra) => Object.assign({
  id, cat: 'tkuliah', name: 'Tugas ' + id, detail: '', date: '2026-11-10', start: '08:00', end: '09:00',
  dlDate: '', dlTime: '', done: false, doneAt: null, createdAt: 1762740000000, updatedAt: 1762740000000
}, extra || {});

function fresh() {
  const S = makeRuntime();
  const reg = S.post('apiRegister', 'adit', '1234', 'Adit');
  assert.equal(reg.ok, true, JSON.stringify(reg));
  return { S, token: reg.token, reg };
}

test('daftar akun: membuat baris Pengguna + tab @username dengan header standar', () => {
  const { S, reg } = fresh();
  assert.equal(reg.user.username, 'adit');
  assert.equal(reg.user.name, 'Adit');
  assert.match(reg.token, /^u[0-9a-f]{20}\.1\.\d+\.[0-9a-f]{32}$/);
  const users = S.sheet('Pengguna').objects();
  assert.equal(users.length, 1);
  assert.equal(users[0]['Username'], 'adit');
  assert.notEqual(users[0]['PIN hash'], '1234', 'PIN tidak boleh tersimpan polos');
  assert.equal(users[0]['Nama tab'], '@adit');
  assert.deepEqual(S.sheet('@adit').header(), TASK_HEADER);
});

test('daftar akun: validasi username/PIN dan username kembar', () => {
  const { S } = fresh();
  assert.equal(S.post('apiRegister', 'adit', '9999', 'X').error, 'taken');
  assert.equal(S.post('apiRegister', 'ADIT', '9999', 'X').error, 'taken', 'username tidak peka huruf besar');
  assert.equal(S.post('apiRegister', 'ab', '1234', '').error, 'username');
  assert.equal(S.post('apiRegister', 'nama spasi', '1234', '').error, 'username');
  assert.equal(S.post('apiRegister', 'budi', '12', '').error, 'pin');
  assert.equal(S.post('apiRegister', 'budi', 'abcd', '').error, 'pin');
  assert.equal(S.post('apiRegister', '@budi', '123456', '').ok, true, 'awalan @ dibuang');
});

test('masuk: PIN benar, PIN salah, dan kunci setelah 5x salah', () => {
  const { S } = fresh();
  assert.equal(S.post('apiLogin', 'adit', '1234').ok, true);
  assert.equal(S.post('apiLogin', 'tidakada', '1234').error, 'login');
  for (let i = 1; i <= 4; i++) assert.equal(S.post('apiLogin', 'adit', '0000').error, 'login', 'percobaan ' + i);
  assert.equal(S.post('apiLogin', 'adit', '0000').error, 'locked', 'percobaan ke-5 mengunci');
  assert.equal(S.post('apiLogin', 'adit', '1234').error, 'locked', 'PIN benar pun ditolak selama terkunci');
});

test('sinkron: upsert, update, delete, urut tanggal+jam, statistik Pengguna', () => {
  const { S, token } = fresh();
  let r = S.post('apiSync', token, [
    { op: 'upsert', task: task('t1', { date: '2026-11-12', start: '10:00' }) },
    { op: 'upsert', task: task('t2', { date: '2026-11-10', start: '' }) },
    { op: 'upsert', task: task('t3', { date: '2026-11-10', start: '07:30' }) }
  ]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.tasks.map(t => t.id), ['t3', 't2', 't1'], 'tanpa jam ditaruh setelah yang berjam di hari yang sama');
  r = S.post('apiSync', token, [
    { op: 'upsert', task: task('t1', { date: '2026-11-12', name: 'Ganti nama', done: true, doneAt: 1762900000000 }) },
    { op: 'delete', id: 't2' }
  ]);
  assert.deepEqual(r.tasks.map(t => [t.id, t.name, t.done]), [['t3', 'Tugas t3', false], ['t1', 'Ganti nama', true]]);
  const rows = S.sheet('@adit').objects();
  assert.equal(rows.length, 2, 'baris yang dihapus dibersihkan dari sheet');
  assert.equal(rows[1]['Status'], 'Selesai');
  assert.equal(rows[1]['Hari'], 'Kamis');
  const u = S.sheet('Pengguna').objects()[0];
  assert.equal(u['Jumlah tugas'], '2');
  assert.equal(u['Selesai'], '1');
  // muat ulang = data yang sama
  const load = S.post('apiLoad', token);
  assert.deepEqual(load.tasks, r.tasks);
});

test('keamanan: teks berawalan = + - @ tidak menjadi rumus dan kembali utuh', () => {
  const { S, token } = fresh();
  const evil = ['=IMPORTXML("http://x","//a")', '+1+1', '-2', '@SUM(A1)'];
  const r = S.post('apiSync', token, evil.map((n, i) => ({ op: 'upsert', task: task('e' + i, { name: n, detail: n }) })));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.tasks.map(t => t.name).sort(), evil.slice().sort());
  assert.equal(S.__log.formulaAttempts, 0);
  // nama tampilan juga
  assert.equal(S.post('apiProfile', token, '=HACK()').user.name, '=HACK()');
});

test('validasi tugas: field tak dikenal dibuang, kategori tak dikenal jadi lain_t, tanggal wajib', () => {
  const { S, token } = fresh();
  const r = S.post('apiSync', token, [
    { op: 'upsert', task: task('a1', { cat: 'kategori_baru', extraField: 'x', difficulty: 3 }) },
    { op: 'upsert', task: task('a2', { date: '10/11/2026' }) },          // format salah → ditolak
    { op: 'upsert', task: task('bad id!') },                             // ID tidak valid → ditolak
    { op: 'upsert', task: task('a3', { dlDate: '2026-11-11', dlTime: '' }) }
  ]);
  assert.deepEqual(r.tasks.map(t => t.id).sort(), ['a1', 'a3']);
  const a1 = r.tasks.find(t => t.id === 'a1');
  assert.equal(a1.cat, 'lain_t', 'kode kategori yang bukan bawaan/custom milik akun → lain_t');
  assert.equal('extraField' in a1, false);
  assert.equal('difficulty' in a1, false, 'hanya field yang terdaftar (diff, bukan difficulty) yang disimpan');
  assert.equal(r.tasks.find(t => t.id === 'a3').dlTime, '23:59', 'deadline tanpa jam = 23:59');
  // nama kategori bawaan seperti "toString" tidak boleh dianggap kategori valid
  const r2 = S.post('apiSync', token, [{ op: 'upsert', task: task('a4', { cat: 'toString' }) }]);
  assert.equal(r2.tasks.find(t => t.id === 'a4').cat, 'lain_t');
});

test('sesi: token palsu ditolak; ganti PIN membatalkan token lama', () => {
  const { S, token } = fresh();
  assert.equal(S.post('apiLoad', 'u1.1.9999999999999.abc').error, 'auth');
  assert.equal(S.post('apiLoad', token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')).error, 'auth');
  assert.equal(S.post('apiChangePin', token, '0000', '5678').error, 'pin', 'PIN lama salah');
  const ch = S.post('apiChangePin', token, '1234', '5678');
  assert.equal(ch.ok, true);
  assert.equal(S.post('apiLoad', token).error, 'auth', 'token lama tidak berlaku');
  assert.equal(S.post('apiLoad', ch.token).ok, true);
  assert.equal(S.post('apiLogin', 'adit', '5678').ok, true);
});

test('pemulihan dari sheet: kolom dibaca berdasarkan judul, baris manual tanpa ID diberi ID', () => {
  const { S, token } = fresh();
  S.post('apiSync', token, [{ op: 'upsert', task: task('k1') }]);
  const sh = S.sheet('@adit');
  // pemilik menambah baris manual (tanpa ID, format tanggal Indonesia, kategori pakai nama)
  const hdr = sh.header();
  const row = hdr.map(h => ({ 'Tanggal': '15/11/2026', 'Jam mulai': '9.30', 'Kategori': 'Olahraga', 'Nama tugas': 'Lari pagi', 'Status': 'Belum' }[h] || ''));
  sh.getRange(3, 1, 1, row.length).setValues([row]);
  const r = S.post('apiLoad', token);
  const lari = r.tasks.find(t => t.name === 'Lari pagi');
  assert.ok(lari, 'baris manual terbaca');
  assert.match(lari.id, /^t[0-9a-f]{12}$/);
  assert.equal(lari.date, '2026-11-15');
  assert.equal(lari.start, '09:30');
  assert.equal(lari.cat, 'olahraga');
  assert.equal(sh.objects().find(o => o['Nama tugas'] === 'Lari pagi')['ID'], lari.id, 'ID baru ditulis balik ke sheet');
});

test('dua akun: data terpisah per tab', () => {
  const { S, token } = fresh();
  const b = S.post('apiRegister', 'budi', '4321', 'Budi');
  S.post('apiSync', token, [{ op: 'upsert', task: task('x1', { name: 'punya adit' }) }]);
  S.post('apiSync', b.token, [{ op: 'upsert', task: task('y1', { name: 'punya budi' }) }]);
  assert.deepEqual(S.post('apiLoad', token).tasks.map(t => t.name), ['punya adit']);
  assert.deepEqual(S.post('apiLoad', b.token).tasks.map(t => t.name), ['punya budi']);
});

test('doPost: fungsi tidak dikenal dan body rusak dijawab JSON, bukan error', () => {
  const S = makeRuntime();
  assert.equal(S.post('hapusSemua').error, 'bad');
  assert.equal(JSON.parse(S.postRaw('bukan json')).error, 'server');
  S.setLockFree(false);
  assert.equal(S.post('apiRegister', 'adit', '1234', 'A').error, 'busy');
});
