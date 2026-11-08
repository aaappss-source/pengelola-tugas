/**
 * Pengelola Tugas — Google Apps Script web app
 *
 * Database = Google Spreadsheet:
 *   - tab "Pengguna"      : daftar akun (username, nama, hash PIN, statistik)
 *   - tab "@<username>"   : tugas milik masing-masing pengguna
 *
 * Deploy: Terapkan → Penerapan baru → Aplikasi web
 *   Jalankan sebagai: Saya   |   Siapa yang memiliki akses: Siapa saja
 */

// ID spreadsheet database. Kosongkan ('') jika skrip dibuat dari menu Ekstensi → Apps Script di spreadsheet itu sendiri.
const SPREADSHEET_ID = '1Z2HIUxIdc87W1txPkW41BycdQgrvqooLhJlvs6UeNmY';

const USERS_SHEET = 'Pengguna';
const USER_HEADER = ['User ID', 'Username', 'Nama tampilan', 'PIN hash', 'Salt', 'Versi sesi', 'Dibuat',
  'Terakhir masuk', 'Jumlah tugas', 'Selesai', 'Gagal login', 'Terkunci sampai', 'Nama tab'];
const U = { id: 0, username: 1, name: 2, hash: 3, salt: 4, ver: 5, created: 6, last: 7, count: 8, done: 9, fails: 10, lock: 11, tab: 12 };
const TASK_HEADER = ['ID', 'Tanggal', 'Hari', 'Jam mulai', 'Jam selesai', 'Kategori', 'Nama tugas', 'Detail',
  'Deadline (tanggal)', 'Deadline (jam)', 'Status', 'Selesai pada', 'Dibuat', 'Diubah', 'Kode kategori'];
const CATS = {
  tkuliah: 'Tugas Kuliah', tkerja: 'Tugas Kerjaan', belajar: 'Belajar', proyek: 'Proyek', ujian: 'Ujian / Kuis',
  skripsi: 'Skripsi', coding: 'Coding', rumah: 'Urusan Rumah', belanja: 'Belanja', tagihan: 'Bayar Tagihan',
  admin: 'Administrasi', lain_t: 'Lainnya', kuliah: 'Kuliah', jamkerja: 'Jam Kerja', meeting: 'Meeting',
  sosial: 'Kegiatan Sosial', pacaran: 'Pacaran', keluarga: 'Keluarga', organisasi: 'Organisasi', olahraga: 'Olahraga',
  ibadah: 'Ibadah', kesehatan: 'Kesehatan', hiburan: 'Hiburan', makan: 'Makan', perjalanan: 'Perjalanan',
  istirahat: 'Istirahat', lain_k: 'Lainnya'
};
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const TOKEN_DAYS = 180;        // berapa lama login tersimpan di perangkat
const MAX_FAILS = 5;           // salah PIN berturut-turut sebelum dikunci
const LOCK_MINUTES = 10;
const MAX_TASKS = 3000;

/* ======================= halaman ======================= */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Pengelola Tugas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ======================= API lewat internet (untuk tampilan di GitHub Pages) =======================
 * Aplikasi mengirim POST berisi teks JSON {"fn": "apiLogin", "args": [...]}; balasan berupa JSON. */
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = API_FUNCS_[req.fn];
    out = fn ? fn.apply(null, Array.isArray(req.args) ? req.args : []) : { ok: false, error: 'bad', message: 'Permintaan tidak dikenal.' };
  } catch (err) {
    out = { ok: false, error: 'server', message: 'Server error: ' + (err && err.message ? err.message : String(err)) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
const API_FUNCS_ = { apiRegister: apiRegister, apiLogin: apiLogin, apiLoad: apiLoad, apiSync: apiSync, apiProfile: apiProfile, apiChangePin: apiChangePin };

/* ======================= API (dipanggil dari aplikasi) ======================= */
function apiRegister(username, pin, name) {
  return wrap_(function () {
    username = normUser_(username);
    checkPin_(pin);
    name = cleanName_(name) || username;
    return withLock_(function () {
      const db = readUsers_();
      if (db.rows.some(function (r) { return String(r[U.username]).toLowerCase() === username; })) {
        throw err_('taken', 'Username "' + username + '" sudah dipakai. Coba yang lain.');
      }
      const id = 'u' + uuid_().slice(0, 20);
      const salt = uuid_();
      const now = stamp_(Date.now());
      const tab = uniqueTab_('@' + username);
      const row = [id, username, name, hashPin_(pin, salt), salt, '1', now, now, '0', '0', '0', '', tab];
      db.sh.getRange(db.sh.getLastRow() + 1, 1, 1, row.length).setValues([row.map(safe_)]);
      taskSheet_(tab);
      return { token: makeToken_(row), user: pub_(row), tasks: [] };
    });
  });
}

function apiLogin(username, pin) {
  return wrap_(function () {
    username = String(username || '').trim().toLowerCase().replace(/^@/, '');
    pin = String(pin || '').trim();
    return withLock_(function () {
      const db = readUsers_();
      const i = db.rows.findIndex(function (r) { return String(r[U.username]).toLowerCase() === username; });
      if (i < 0) throw err_('login', 'Username atau PIN salah.');
      const r = db.rows[i];
      const lockUntil = Number(r[U.lock]) || 0;
      if (lockUntil > Date.now()) {
        throw err_('locked', 'Terlalu banyak percobaan. Coba lagi dalam ' + Math.ceil((lockUntil - Date.now()) / 60000) + ' menit.');
      }
      if (!r[U.hash]) {
        // PIN dikosongkan pemilik aplikasi (reset) → PIN yang dimasukkan sekarang menjadi PIN baru
        checkPin_(pin);
        r[U.salt] = uuid_();
        r[U.hash] = hashPin_(pin, r[U.salt]);
        r[U.ver] = String((Number(r[U.ver]) || 1) + 1);
      } else if (hashPin_(pin, r[U.salt]) !== r[U.hash]) {
        const f = (Number(r[U.fails]) || 0) + 1;
        const locked = f >= MAX_FAILS;
        r[U.fails] = locked ? '0' : String(f);
        if (locked) r[U.lock] = String(Date.now() + LOCK_MINUTES * 60000);
        writeUser_(db.sh, i, r);
        throw err_(locked ? 'locked' : 'login', locked
          ? 'PIN salah ' + MAX_FAILS + ' kali. Akun dikunci ' + LOCK_MINUTES + ' menit.'
          : 'Username atau PIN salah.');
      }
      r[U.fails] = '0';
      r[U.lock] = '';
      r[U.last] = stamp_(Date.now());
      if (!r[U.tab]) r[U.tab] = uniqueTab_('@' + r[U.username]);
      writeUser_(db.sh, i, r);
      return { token: makeToken_(r), user: pub_(r), tasks: readTasks_(r).tasks };
    });
  });
}

function apiLoad(token) {
  return wrap_(function () {
    const a = auth_(token);
    let data = readTasks_(a.row);
    if (data.fixed) data = withLock_(function () {      // simpan ID untuk baris yang ditambah manual
      const d = readTasks_(a.row);
      if (d.fixed) writeTaskRows_(d.sh, d.rows);
      return d;
    });
    return { user: pub_(a.row), tasks: data.tasks };
  });
}

/** ops: [{op:'upsert', task:{...}} | {op:'delete', id:'...'}] */
function apiSync(token, ops) {
  return wrap_(function () {
    if (!Array.isArray(ops)) throw err_('bad', 'Format data salah.');
    return withLock_(function () {
      const a = auth_(token);
      const data = readTasks_(a.row);
      const rows = data.rows;                 // baris mentah (dipertahankan apa adanya kecuali yang diubah)
      const idx = {};
      rows.forEach(function (r, k) { if (r[0]) idx[r[0]] = k; });
      const dead = {};
      ops.slice(0, 1000).forEach(function (o) {
        if (!o) return;
        if (o.op === 'delete' && validId_(o.id)) {
          if (idx[o.id] !== undefined) dead[idx[o.id]] = true;
        } else if (o.op === 'upsert') {
          const t = cleanTask_(o.task, false);
          if (!t) return;
          const row = taskRow_(t);
          if (idx[t.id] !== undefined) { rows[idx[t.id]] = row; delete dead[idx[t.id]]; }
          else if (rows.length < MAX_TASKS) { idx[t.id] = rows.length; rows.push(row); }
        }
      });
      const keep = rows.filter(function (r, k) { return !dead[k]; });
      keep.sort(function (x, y) {
        const a1 = String(x[1]) + ' ' + (x[3] || '99:99'), b1 = String(y[1]) + ' ' + (y[3] || '99:99');
        return a1 < b1 ? -1 : a1 > b1 ? 1 : 0;
      });
      writeTaskRows_(data.sh, keep);
      const tasks = keep.map(function (r) { return parseRow_(r, data.col); }).filter(Boolean);
      // statistik di tab Pengguna
      const r = a.row;
      r[U.count] = String(tasks.length);
      r[U.done] = String(tasks.filter(function (t) { return t.done; }).length);
      writeUser_(a.sh, a.i, r);
      return { tasks: tasks };
    });
  });
}

function apiProfile(token, name) {
  return wrap_(function () {
    return withLock_(function () {
      const a = auth_(token);
      a.row[U.name] = cleanName_(name) || a.row[U.username];
      writeUser_(a.sh, a.i, a.row);
      return { user: pub_(a.row) };
    });
  });
}

function apiChangePin(token, oldPin, newPin) {
  return wrap_(function () {
    checkPin_(newPin);
    return withLock_(function () {
      const a = auth_(token);
      if (hashPin_(String(oldPin || ''), a.row[U.salt]) !== a.row[U.hash]) throw err_('pin', 'PIN lama salah.');
      a.row[U.salt] = uuid_();
      a.row[U.hash] = hashPin_(String(newPin), a.row[U.salt]);
      a.row[U.ver] = String((Number(a.row[U.ver]) || 1) + 1);   // keluar dari perangkat lain
      writeUser_(a.sh, a.i, a.row);
      return { token: makeToken_(a.row), user: pub_(a.row) };
    });
  });
}

/* ======================= akun & keamanan ======================= */
function auth_(token) {
  const p = String(token || '').split('.');
  if (p.length !== 4) throw err_('auth', 'Sesi berakhir, silakan masuk lagi.');
  const body = p[0] + '.' + p[1] + '.' + p[2];
  if (hmac_('tok|' + body).slice(0, 32) !== p[3] || Number(p[2]) < Date.now()) throw err_('auth', 'Sesi berakhir, silakan masuk lagi.');
  const db = readUsers_();
  const i = db.rows.findIndex(function (r) { return r[U.id] === p[0]; });
  if (i < 0 || String(db.rows[i][U.ver]) !== p[1]) throw err_('auth', 'Sesi berakhir, silakan masuk lagi.');
  return { sh: db.sh, i: i, row: db.rows[i] };
}
function makeToken_(row) {
  const body = row[U.id] + '.' + row[U.ver] + '.' + (Date.now() + TOKEN_DAYS * 864e5);
  return body + '.' + hmac_('tok|' + body).slice(0, 32);
}
function pub_(row) { return { id: row[U.id], username: row[U.username], name: row[U.name] || row[U.username] }; }
function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SECRET');
  if (!s) { s = uuid_() + uuid_(); p.setProperty('SECRET', s); }
  return s;
}
function hmac_(msg) {
  return Utilities.computeHmacSha256Signature(msg, secret_())
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function hashPin_(pin, salt) { return hmac_('pin|' + salt + '|' + pin); }
function uuid_() { return Utilities.getUuid().replace(/-/g, ''); }
function normUser_(u) {
  u = String(u || '').trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_.]{3,20}$/.test(u)) throw err_('username', 'Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.');
  return u;
}
function checkPin_(pin) { if (!/^\d{4,6}$/.test(String(pin || ''))) throw err_('pin', 'PIN harus 4–6 angka.'); }
function cleanName_(n) { return String(n || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); }

/* ======================= spreadsheet ======================= */
function ss_() { return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }
function usersSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(USERS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(USERS_SHEET, 0);
    sh.getRange(1, 1, sh.getMaxRows(), USER_HEADER.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, USER_HEADER.length).setValues([USER_HEADER]).setFontWeight('bold').setBackground('#FFD43B');
    sh.setFrozenRows(1);
  }
  return sh;
}
function readUsers_() {
  const sh = usersSheet_();
  const n = sh.getLastRow() - 1;
  const rows = n > 0 ? sh.getRange(2, 1, n, USER_HEADER.length).getDisplayValues() : [];
  return { sh: sh, rows: rows };
}
function writeUser_(sh, i, row) { sh.getRange(i + 2, 1, 1, USER_HEADER.length).setValues([row.map(safe_)]); }
function uniqueTab_(base) {
  const ss = ss_();
  base = String(base).replace(/[\[\]\*\?:\/\\']/g, '_').slice(0, 90);
  let t = base, k = 2;
  while (ss.getSheetByName(t)) t = base + ' ' + (k++);
  return t;
}
function taskSheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), TASK_HEADER.length).setNumberFormat('@');   // simpan semua sebagai teks
    sh.getRange(1, 1, 1, TASK_HEADER.length).setValues([TASK_HEADER]).setFontWeight('bold').setBackground('#FFD43B');
    sh.setFrozenRows(1);
    sh.setColumnWidth(7, 220);
    sh.setColumnWidth(8, 260);
  }
  return sh;
}
function readTasks_(userRow) {
  const sh = taskSheet_(userRow[U.tab] || ('@' + userRow[U.username]));
  const last = sh.getLastRow();
  const head = sh.getRange(1, 1, 1, TASK_HEADER.length).getDisplayValues()[0];
  const col = {};
  TASK_HEADER.forEach(function (h, k) {
    const j = head.map(function (x) { return String(x).trim().toLowerCase(); }).indexOf(h.toLowerCase());
    col[h] = j >= 0 ? j : k;
  });
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, TASK_HEADER.length).getDisplayValues()
    .filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); }) : [];
  // baris tanpa ID (misalnya ditambah manual di spreadsheet) diberi ID
  let fixed = false;
  rows.forEach(function (r) { if (!validId_(r[col['ID']])) { r[col['ID']] = 't' + uuid_().slice(0, 12); fixed = true; } });
  const tasks = rows.map(function (r) { return parseRow_(r, col); }).filter(Boolean);
  // susun ulang kolom sesuai urutan standar agar penulisan konsisten
  const std = rows.map(function (r) { return TASK_HEADER.map(function (h) { return r[col[h]]; }); });
  const stdCol = {}; TASK_HEADER.forEach(function (h, k) { stdCol[h] = k; });
  return { sh: sh, rows: std, col: stdCol, tasks: tasks, fixed: fixed };
}
function writeTaskRows_(sh, rows) {
  const last = sh.getLastRow();
  // semua sel ditulis sebagai teks biasa (teks berawalan = + - @ tidak boleh jadi rumus)
  if (rows.length) sh.getRange(2, 1, rows.length, TASK_HEADER.length).setValues(rows.map(function (r) { return r.map(safe_); }));
  if (last > rows.length + 1) sh.getRange(rows.length + 2, 1, last - rows.length - 1, TASK_HEADER.length).clearContent();
}

/* ======================= konversi tugas ======================= */
function validId_(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(id); }
function cleanTask_(v) {
  if (!v || typeof v !== 'object' || !validId_(v.id)) return null;
  const s = function (x, m) { return typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, m) : ''; };
  const d = function (x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : ''; };
  const tm = function (x) { return typeof x === 'string' && /^\d{2}:\d{2}$/.test(x) ? x : ''; };
  const date = d(v.date);
  if (!date) return null;
  const n = function (x) { return typeof x === 'number' && isFinite(x) ? x : null; };
  return {
    id: v.id, cat: CATS[v.cat] ? v.cat : 'lain_t', name: s(v.name, 200) || '(tanpa nama)', detail: s(v.detail, 2000), date: date,
    start: tm(v.start), end: tm(v.end), dlDate: d(v.dlDate), dlTime: d(v.dlDate) ? (tm(v.dlTime) || '23:59') : '',
    done: !!v.done, doneAt: v.done ? n(v.doneAt) : null, createdAt: n(v.createdAt) || Date.now(), updatedAt: n(v.updatedAt) || Date.now()
  };
}
function taskRow_(t) {
  const p = t.date.split('-').map(Number);
  const day = DAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
  return [t.id, t.date, day, t.start, t.end, CATS[t.cat], t.name, t.detail, t.dlDate, t.dlTime,
    t.done ? 'Selesai' : 'Belum', stamp_(t.doneAt), stamp_(t.createdAt), stamp_(t.updatedAt), t.cat];
}
function parseRow_(r, col) {
  const g = function (h) { return String(r[col[h]] == null ? '' : r[col[h]]).trim(); };
  const date = normDate_(g('Tanggal'));
  const name = unsafe_(g('Nama tugas'));
  if (!date || !name || !validId_(g('ID'))) return null;
  const code = g('Kode kategori');
  const done = /^(selesai|sudah|done|ya|true|✓)/i.test(g('Status'));
  const dl = normDate_(g('Deadline (tanggal)'));
  return {
    id: g('ID'), cat: CATS[code] ? code : catByName_(g('Kategori')), name: name.slice(0, 200), detail: unsafe_(g('Detail')).slice(0, 2000),
    date: date, start: normTime_(g('Jam mulai')), end: normTime_(g('Jam selesai')), dlDate: dl, dlTime: dl ? (normTime_(g('Deadline (jam)')) || '23:59') : '',
    done: done, doneAt: done ? (parseStamp_(g('Selesai pada')) || Date.now()) : null,
    createdAt: parseStamp_(g('Dibuat')) || 0, updatedAt: parseStamp_(g('Diubah')) || 0
  };
}
function catByName_(n) {
  n = String(n || '').toLowerCase();
  for (const k in CATS) if (CATS[k].toLowerCase() === n) return k;
  return 'lain_t';
}
function normDate_(x) {
  let m = String(x).match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return ymd_(+m[1], +m[2], +m[3]);
  m = String(x).match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);      // d/m/yyyy (format Indonesia)
  return m ? ymd_(+m[3], +m[2], +m[1]) : '';
}
function ymd_(y, mo, d) {
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
    ? y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2) : '';
}
function normTime_(x) {
  const m = String(x).match(/^(\d{1,2})[:.](\d{2})/);
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}
function stamp_(ms) { return ms ? Utilities.formatDate(new Date(ms), tz_(), 'yyyy-MM-dd HH:mm') : ''; }
function parseStamp_(x) {
  const d = normDate_(x);
  if (!d) return null;
  const t = normTime_(String(x).split(/\s+/)[1] || '') || '00:00';
  try { return Utilities.parseDate(d + ' ' + t, tz_(), 'yyyy-MM-dd HH:mm').getTime(); } catch (e) { return null; }
}
// cegah teks yang diawali = + - @ dibaca sebagai rumus oleh Sheets
function safe_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function unsafe_(v) { v = String(v == null ? '' : v); return /^'[=+\-@]/.test(v) ? v.slice(1) : v; }

/* ======================= utilitas ======================= */
function err_(code, msg) { const e = new Error(msg || code); e.code = code; return e; }
function wrap_(fn) {
  try { const r = fn(); r.ok = true; return r; }
  catch (e) { if (e && e.code) return { ok: false, error: e.code, message: e.message }; throw e; }
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw err_('busy', 'Server sedang sibuk, coba lagi sebentar.');
  try { return fn(); } finally { lock.releaseLock(); }
}
