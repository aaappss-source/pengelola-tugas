/**
 * Pengelola Tugas — Google Apps Script web app
 *
 * Database = Google Spreadsheet:
 *   - tab "Pengguna"      : daftar akun (username, nama, hash PIN, statistik)
 *   - tab "@<username>"   : tugas milik masing-masing pengguna
 *   - tab "Kategori"      : kategori buatan sendiri (custom) milik setiap akun
 *   - tab "Profil"        : profil pengguna di dalam setiap akun (satu akun bisa dipakai beberapa orang)
 *
 * Deploy: Terapkan → Penerapan baru → Aplikasi web
 *   Jalankan sebagai: Saya   |   Siapa yang memiliki akses: Siapa saja
 *
 * Versi data (SCHEMA) 2 — Tahap 1: kolom Jenis, Kesulitan, Kegiatan induk, Dibuat oleh, Diselesaikan oleh,
 * tab Kategori & Profil. Data lama dimigrasi otomatis per akun saat akun itu dipakai pertama kali.
 */

// ID spreadsheet database. Kosongkan ('') jika skrip dibuat dari menu Ekstensi → Apps Script di spreadsheet itu sendiri.
const SPREADSHEET_ID = '1Z2HIUxIdc87W1txPkW41BycdQgrvqooLhJlvs6UeNmY';

const SCHEMA = 2;              // versi struktur data; dikirim ke aplikasi supaya aplikasi tahu server sudah baru
const USERS_SHEET = 'Pengguna';
const USER_HEADER = ['User ID', 'Username', 'Nama tampilan', 'PIN hash', 'Salt', 'Versi sesi', 'Dibuat',
  'Terakhir masuk', 'Jumlah tugas', 'Selesai', 'Gagal login', 'Terkunci sampai', 'Nama tab'];
const U = { id: 0, username: 1, name: 2, hash: 3, salt: 4, ver: 5, created: 6, last: 7, count: 8, done: 9, fails: 10, lock: 11, tab: 12 };
const TASK_HEADER = ['ID', 'Tanggal', 'Hari', 'Jam mulai', 'Jam selesai', 'Kategori', 'Nama tugas', 'Detail',
  'Deadline (tanggal)', 'Deadline (jam)', 'Status', 'Selesai pada', 'Dibuat', 'Diubah', 'Kode kategori',
  'Jenis', 'Kesulitan', 'Kegiatan induk', 'Dibuat oleh', 'Diselesaikan oleh'];
const TC = {}; TASK_HEADER.forEach(function (h, k) { TC[h] = k; });
const OLD_TASK_COLS = 15;      // jumlah kolom tab tugas sebelum Tahap 1
const CAT_SHEET = 'Kategori';
const CAT_HEADER = ['User ID', 'Username', 'ID kategori', 'Nama', 'Warna (hue)', 'Dibuat', 'Diubah'];
const PROF_SHEET = 'Profil';
const PROF_HEADER = ['User ID', 'Username', 'ID profil', 'Nama', 'Avatar', 'Dibuat', 'Diubah'];
const CATS = {
  tkuliah: 'Tugas Kuliah', tkerja: 'Tugas Kerjaan', belajar: 'Belajar', proyek: 'Proyek', ujian: 'Ujian / Kuis',
  skripsi: 'Skripsi', coding: 'Coding', rumah: 'Urusan Rumah', belanja: 'Belanja', tagihan: 'Bayar Tagihan',
  admin: 'Administrasi', lain_t: 'Lainnya', kuliah: 'Kuliah', jamkerja: 'Jam Kerja', meeting: 'Meeting',
  sosial: 'Kegiatan Sosial', pacaran: 'Pacaran', keluarga: 'Keluarga', organisasi: 'Organisasi', olahraga: 'Olahraga',
  ibadah: 'Ibadah', kesehatan: 'Kesehatan', hiburan: 'Hiburan', makan: 'Makan', perjalanan: 'Perjalanan',
  istirahat: 'Istirahat', lain_k: 'Lainnya'
};
const KINDS = { tugas: 'Tugas', kegiatan: 'Kegiatan' };
const DIFFS = { mudah: 'Mudah', sedang: 'Sedang', sulit: 'Sulit' };
const FIRST_PROFILE = 'p1';    // ID profil pertama yang dibuat otomatis untuk setiap akun
const MAX_PROFILES = 5;
const MAX_CATS = 50;
const CAT_NAME_MAX = 30;
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

/* ======================= API (dipanggil dari aplikasi) =======================
 * Semua jawaban yang membawa data berisi: tasks, cats (kategori custom), profiles, schema. */
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
      const acc = openAccount_(row);
      saveAccount_(acc);
      return bundle_({ token: makeToken_(row), user: pub_(row) }, acc);
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
      const acc = openAccount_(r);
      saveAccount_(acc);
      return bundle_({ token: makeToken_(r), user: pub_(r) }, acc);
    });
  });
}

function apiLoad(token) {
  return wrap_(function () {
    const a = auth_(token);
    let acc = openAccount_(a.row);
    // migrasi / ID baris manual / perbaikan rujukan perlu ditulis → ulangi di bawah kunci
    if (needsSave_(acc)) acc = withLock_(function () { const x = openAccount_(a.row); saveAccount_(x); return x; });
    return bundle_({ user: pub_(a.row) }, acc);
  });
}

/** ops: [{op:'upsert', task:{...}} | {op:'delete', id:'...'}
 *        | {op:'cat', cat:{id,name,hue}} | {op:'cat-del', id} | {op:'profile', profile:{id,name,avatar}} | {op:'profile-del', id}]
 *  Kategori & profil diproses lebih dulu, baru tugas (urutan op di antrean tidak berpengaruh). */
function apiSync(token, ops) {
  return wrap_(function () {
    if (!Array.isArray(ops)) throw err_('bad', 'Format data salah.');
    return withLock_(function () {
      const a = auth_(token);
      const acc = openAccount_(a.row);
      const rows = acc.rows;                  // baris standar (dipertahankan apa adanya kecuali yang diubah)
      const list = ops.slice(0, 1000).filter(function (o) { return o && typeof o === 'object'; });
      list.forEach(function (o) {
        if (o.op === 'profile') upsertProfile_(acc, o.profile);
        else if (o.op === 'profile-del') delProfile_(acc, o.id);
        else if (o.op === 'cat') upsertCat_(acc, o.cat);
        else if (o.op === 'cat-del') delCat_(acc, o.id);
      });
      const idx = Object.create(null);
      rows.forEach(function (r, k) { if (r[TC['ID']]) idx[r[TC['ID']]] = k; });
      const dead = Object.create(null);
      list.forEach(function (o) {
        if (o.op === 'delete' && validId_(o.id)) {
          if (idx[o.id] !== undefined) dead[idx[o.id]] = true;
        } else if (o.op === 'upsert') {
          const k = o.task && validId_(o.task.id) ? idx[o.task.id] : undefined;
          const prev = k !== undefined && !dead[k] ? parseRow_(rows[k], acc) : null;
          const t = cleanTask_(o.task, prev, acc);
          if (!t) return;
          const row = taskRow_(t, acc);
          if (k !== undefined) { rows[k] = row; delete dead[k]; }
          else if (rows.length < MAX_TASKS) { idx[t.id] = rows.length; rows.push(row); }
        }
      });
      const keep = rows.filter(function (r, k) { return !dead[k]; });
      normRows_(keep, acc);                   // kategori yang dihapus → Lainnya, induk yang hilang dikosongkan, dll
      keep.sort(function (x, y) {
        const a1 = String(x[TC['Tanggal']]) + ' ' + (x[TC['Jam mulai']] || '99:99'), b1 = String(y[TC['Tanggal']]) + ' ' + (y[TC['Jam mulai']] || '99:99');
        return a1 < b1 ? -1 : a1 > b1 ? 1 : 0;
      });
      acc.rows = keep;
      acc.dirty = true;
      saveAccount_(acc);
      // statistik di tab Pengguna (Kegiatan tidak dihitung sebagai tugas)
      const own = acc.tasks.filter(function (t) { return t.kind === 'tugas'; });
      const r = a.row;
      r[U.count] = String(own.length);
      r[U.done] = String(own.filter(function (t) { return t.done; }).length);
      writeUser_(a.sh, a.i, r);
      return bundle_({}, acc);
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

/* ======================= data satu akun (tugas + kategori + profil) =======================
 * openAccount_ membaca semuanya, menjalankan migrasi di memori, dan menandai acc.dirty kalau ada yang perlu ditulis.
 * saveAccount_ menulis yang berubah. Panggil saveAccount_ hanya di dalam withLock_. */
function openAccount_(userRow) {
  const acc = { user: userRow, cats: [], profiles: [], catMap: {}, first: FIRST_PROFILE, dirty: false, dirtyCats: false, dirtyProfiles: false };
  acc.profiles = readMeta_(PROF_SHEET, PROF_HEADER, userRow[U.id]).map(function (r) {
    return { id: String(r[2]).trim(), name: unsafe_(cleanName_(r[3])) || 'Profil', avatar: avatarOf_(r[4]), created: r[5], updated: r[6] };
  }).filter(function (p, k, all) { return validProf_(p.id) && all.findIndex(function (q) { return q.id === p.id; }) === k; });
  if (!acc.profiles.length) {
    // migrasi: setiap akun punya minimal satu profil (nama = nama tampilan akun)
    const now = stamp_(Date.now());
    acc.profiles.push({ id: FIRST_PROFILE, name: cleanName_(userRow[U.name]) || userRow[U.username] || 'Profil', avatar: '', created: now, updated: now });
    acc.dirtyProfiles = true;
  }
  acc.first = acc.profiles[0].id;
  acc.cats = readMeta_(CAT_SHEET, CAT_HEADER, userRow[U.id]).map(function (r) {
    return { id: String(r[2]).trim(), name: unsafe_(cleanName_(r[3])).slice(0, CAT_NAME_MAX), hue: hueOf_(r[4]), created: r[5], updated: r[6] };
  }).filter(function (c, k, all) { return isCustomCat_(c.id) && c.name && all.findIndex(function (q) { return q.id === c.id; }) === k; });
  indexCats_(acc);

  const sh = taskSheet_(userRow[U.tab] || ('@' + userRow[U.username]));
  const width = TASK_HEADER.length;
  // tab yang kolomnya pernah dihapus pemilik bisa kurang dari 20 kolom → tambah supaya pembacaan tidak error
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  const head = sh.getRange(1, 1, 1, width).getDisplayValues()[0].map(function (x) { return String(x).trim().toLowerCase(); });
  const col = {};
  let missing = false;
  TASK_HEADER.forEach(function (h, k) {
    const j = head.indexOf(h.toLowerCase());
    if (j < 0) missing = true;
    col[h] = j >= 0 ? j : k;
  });
  const last = sh.getLastRow();
  const raw = last > 1 ? sh.getRange(2, 1, last - 1, width).getDisplayValues()
    .filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); }) : [];
  // susun ulang kolom sesuai urutan standar agar penulisan konsisten
  const rows = raw.map(function (r) { return TASK_HEADER.map(function (h) { return r[col[h]]; }); });
  // baris tanpa ID (misalnya ditambah manual di spreadsheet) diberi ID
  let fixed = false;
  rows.forEach(function (r) { if (!validId_(r[TC['ID']])) { r[TC['ID']] = 't' + uuid_().slice(0, 12); fixed = true; } });
  const changed = normRows_(rows, acc);
  const headerOk = !missing && TASK_HEADER.every(function (h, k) { return col[h] === k; });
  acc.sh = sh;
  acc.rows = rows;
  acc.migrate = missing;
  acc.dirty = fixed || changed || !headerOk;        // baris tugas perlu ditulis ulang
  acc.tasks = rows.map(function (r) { return parseRow_(r, acc); }).filter(Boolean);
  return acc;
}
function saveAccount_(acc) {
  if (acc.dirty) {
    writeTaskRows_(acc.sh, acc.rows, acc.migrate);
    acc.tasks = acc.rows.map(function (r) { return parseRow_(r, acc); }).filter(Boolean);
  }
  const uid = acc.user[U.id], un = acc.user[U.username];
  if (acc.dirtyProfiles) writeMeta_(PROF_SHEET, PROF_HEADER, uid, acc.profiles.map(function (p) { return [uid, un, p.id, p.name, p.avatar, p.created, p.updated]; }));
  if (acc.dirtyCats) writeMeta_(CAT_SHEET, CAT_HEADER, uid, acc.cats.map(function (c) { return [uid, un, c.id, c.name, String(c.hue), c.created, c.updated]; }));
  acc.dirty = acc.dirtyProfiles = acc.dirtyCats = false;
}
function needsSave_(acc) { return acc.dirty || acc.dirtyProfiles || acc.dirtyCats; }
function bundle_(out, acc) {
  out.tasks = acc.tasks;
  out.cats = acc.cats.map(function (c) { return { id: c.id, name: c.name, hue: c.hue }; });
  out.profiles = acc.profiles.map(function (p) { return { id: p.id, name: p.name, avatar: p.avatar }; });
  out.schema = SCHEMA;
  return out;
}
function indexCats_(acc) { acc.catMap = Object.create(null); acc.cats.forEach(function (c) { acc.catMap[c.id] = c; }); }

/* ---- kategori custom ---- */
function upsertCat_(acc, c) {
  if (!c || typeof c !== 'object' || !isCustomCat_(c.id)) return;
  const base = cleanName_(c.name).slice(0, CAT_NAME_MAX);
  if (!base) return;
  const ex = validCat_(c.id, acc) ? acc.catMap[c.id] : null;
  if (!ex && acc.cats.length >= MAX_CATS) return;
  const name = uniqueCatName_(acc, base, c.id);
  const hue = hueOf_(c.hue), now = stamp_(Date.now());
  if (ex) {
    if (ex.name === name && ex.hue === hue) return;
    ex.name = name; ex.hue = hue; ex.updated = now;
  } else {
    acc.cats.push({ id: c.id, name: name, hue: hue, created: now, updated: now });
  }
  indexCats_(acc);
  acc.dirtyCats = true;
}
function delCat_(acc, id) {
  if (!validCat_(id, acc)) return;
  acc.cats = acc.cats.filter(function (c) { return c.id !== id; });
  indexCats_(acc);
  acc.dirtyCats = true;                    // tugasnya dipindah ke Lainnya oleh normRows_
}
// nama kategori custom tidak boleh sama dengan kategori bawaan maupun kategori custom lain (tidak peka huruf besar/kecil)
function uniqueCatName_(acc, base, selfId) {
  const taken = {};
  Object.keys(CATS).forEach(function (k) { taken[CATS[k].toLowerCase()] = true; });
  acc.cats.forEach(function (c) { if (c.id !== selfId) taken[c.name.toLowerCase()] = true; });
  let name = base, n = 2;
  while (taken[name.toLowerCase()]) { const suf = ' ' + (n++); name = base.slice(0, CAT_NAME_MAX - suf.length).trim() + suf; }
  return name;
}

/* ---- profil ---- */
function upsertProfile_(acc, p) {
  if (!p || typeof p !== 'object' || !validProf_(p.id)) return;
  const ex = acc.profiles.find(function (q) { return q.id === p.id; });
  if (!ex && acc.profiles.length >= MAX_PROFILES) return;
  const name = cleanName_(p.name) || (ex ? ex.name : 'Profil');
  const avatar = p.avatar === undefined && ex ? ex.avatar : avatarOf_(p.avatar);
  const now = stamp_(Date.now());
  if (ex) {
    if (ex.name === name && ex.avatar === avatar) return;
    ex.name = name; ex.avatar = avatar; ex.updated = now;
  } else {
    acc.profiles.push({ id: p.id, name: name, avatar: avatar, created: now, updated: now });
  }
  acc.dirtyProfiles = true;
}
// profil terakhir tidak bisa dihapus; tugas yang dibuat/dicentang profil yang dihapus tetap mencatat ID-nya
function delProfile_(acc, id) {
  if (acc.profiles.length <= 1 || !acc.profiles.some(function (q) { return q.id === id; })) return;
  acc.profiles = acc.profiles.filter(function (q) { return q.id !== id; });
  acc.first = acc.profiles[0].id;
  acc.dirtyProfiles = true;
}

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
function writeTaskRows_(sh, rows, migrate) {
  const width = TASK_HEADER.length;
  if (migrate) {
    // kolom baru Tahap 1: format teks + judul tebal seperti kolom lama
    sh.getRange(1, OLD_TASK_COLS + 1, sh.getMaxRows(), width - OLD_TASK_COLS).setNumberFormat('@');
    sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#FFD43B');
  }
  // judul selalu ditulis ulang sesuai urutan standar (data juga ditulis dalam urutan standar)
  sh.getRange(1, 1, 1, width).setValues([TASK_HEADER]);
  const last = sh.getLastRow();
  // semua sel ditulis sebagai teks biasa (teks berawalan = + - @ tidak boleh jadi rumus)
  if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows.map(function (r) { return r.map(safe_); }));
  if (last > rows.length + 1) sh.getRange(rows.length + 2, 1, last - rows.length - 1, width).clearContent();
}
// tab bersama (Kategori, Profil): satu baris per item, kolom pertama = User ID
function metaSheet_(name, header) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), header.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#FFD43B');
    sh.setFrozenRows(1);
  }
  return sh;
}
function readMeta_(name, header, userId) {
  const sh = ss_().getSheetByName(name);
  if (!sh) return [];
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, header.length).getDisplayValues().filter(function (r) { return r[0] === userId; }) : [];
}
function writeMeta_(name, header, userId, mine) {
  const sh = metaSheet_(name, header);
  const n = sh.getLastRow() - 1;
  const all = n > 0 ? sh.getRange(2, 1, n, header.length).getDisplayValues() : [];
  const out = all.filter(function (r) { return r[0] !== userId && r.some(function (c) { return String(c).trim() !== ''; }); }).concat(mine);
  if (out.length) sh.getRange(2, 1, out.length, header.length).setValues(out.map(function (r) { return r.map(safe_); }));
  if (n > out.length) sh.getRange(out.length + 2, 1, n - out.length, header.length).clearContent();
}

/* ======================= konversi tugas ======================= */
function validId_(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(id); }
function validProf_(id) { return typeof id === 'string' && /^p[a-z0-9]{1,20}$/.test(id); }
function isCustomCat_(id) { return typeof id === 'string' && /^c_[a-z0-9]{1,20}$/.test(id); }
function hueOf_(x) { const n = Math.round(Number(x)); return isFinite(n) && String(x).trim() !== '' ? ((n % 360) + 360) % 360 : 0; }
function avatarOf_(x) { x = String(x == null ? '' : x).trim(); return /^[a-z0-9_-]{1,20}$/.test(x) ? x : ''; }
function kindOf_(x) { return /^kegiatan$/i.test(String(x || '').trim()) ? 'kegiatan' : 'tugas'; }
function diffOf_(x) { x = String(x || '').trim().toLowerCase(); return DIFFS[x] ? x : ''; }
function isDone_(x) { return /^(selesai|sudah|done|ya|true|✓)/i.test(String(x || '').trim()); }
function isBuiltinCat_(code) { return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CATS, code); }
function validCat_(code, acc) { return isBuiltinCat_(code) || (isCustomCat_(code) && !!acc.catMap[code]); }
function catName_(code, acc) { return isBuiltinCat_(code) ? CATS[code] : validCat_(code, acc) ? acc.catMap[code].name : CATS.lain_t; }

/** v = tugas dari aplikasi, prev = tugas yang sama di sheet (atau null), acc = data akun.
 *  Field baru yang TIDAK dikirim (aplikasi versi lama) mempertahankan nilai lama, bukan dikosongkan. */
function cleanTask_(v, prev, acc) {
  if (!v || typeof v !== 'object' || !validId_(v.id)) return null;
  const s = function (x, m) { return typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, m) : ''; };
  const d = function (x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : ''; };
  const tm = function (x) { return typeof x === 'string' && /^\d{2}:\d{2}$/.test(x) ? x : ''; };
  const date = d(v.date);
  if (!date) return null;
  const n = function (x) { return typeof x === 'number' && isFinite(x) ? x : null; };
  const has = function (k) { return Object.prototype.hasOwnProperty.call(v, k); };
  const legacy = !has('kind');              // aplikasi sebelum Tahap 1 tidak pernah mengirim kind
  let cat = validCat_(v.cat, acc) ? v.cat : 'lain_t';
  // aplikasi lama tidak mengenal kategori custom dan mengirimnya sebagai lain_t → pertahankan kategori custom yang ada
  if (legacy && cat === 'lain_t' && prev && isCustomCat_(prev.cat)) cat = prev.cat;
  const t = {
    id: v.id, cat: cat, name: s(v.name, 200) || '(tanpa nama)', detail: s(v.detail, 2000), date: date,
    start: tm(v.start), end: tm(v.end), dlDate: d(v.dlDate), dlTime: d(v.dlDate) ? (tm(v.dlTime) || '23:59') : '',
    done: !!v.done, doneAt: v.done ? n(v.doneAt) : null, createdAt: n(v.createdAt) || Date.now(), updatedAt: n(v.updatedAt) || Date.now(),
    kind: has('kind') ? (v.kind === 'kegiatan' ? 'kegiatan' : 'tugas') : (prev ? prev.kind : 'tugas'),
    diff: has('diff') ? diffOf_(v.diff) : (prev ? prev.diff : ''),
    parent: has('parent') ? (validId_(v.parent) ? v.parent : '') : (prev ? prev.parent : ''),
    by: prev && prev.by ? prev.by : (validProf_(v.by) ? v.by : acc.first),          // pembuat tidak berubah
    doneBy: ''
  };
  if (t.done) t.doneBy = validProf_(v.doneBy) ? v.doneBy : (prev && prev.done && prev.doneBy ? prev.doneBy : acc.first);
  if (t.kind === 'kegiatan') { t.done = false; t.doneAt = null; t.doneBy = ''; t.parent = ''; }   // Kegiatan tidak dicentang
  if (t.parent === t.id) t.parent = '';
  return t;
}
function taskRow_(t, acc) {
  const p = t.date.split('-').map(Number);
  const day = DAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
  return [t.id, t.date, day, t.start, t.end, catName_(t.cat, acc), t.name, t.detail, t.dlDate, t.dlTime,
    t.done ? 'Selesai' : 'Belum', stamp_(t.doneAt), stamp_(t.createdAt), stamp_(t.updatedAt), t.cat,
    KINDS[t.kind], DIFFS[t.diff] || '', t.parent, t.by, t.doneBy];
}
/** Merapikan baris (urutan kolom standar) di tempat; mengembalikan true kalau ada yang berubah.
 *  Ini juga migrasi data lama: Jenis kosong → Tugas, Dibuat oleh kosong → profil pertama,
 *  tugas selesai tanpa pencentang → profil pertama. */
function normRows_(rows, acc) {
  let changed = false;
  const kegiatan = Object.create(null);
  rows.forEach(function (r) { if (kindOf_(r[TC['Jenis']]) === 'kegiatan') kegiatan[r[TC['ID']]] = true; });
  rows.forEach(function (r) {
    const set = function (h, v) { if (String(r[TC[h]] == null ? '' : r[TC[h]]) !== v) { r[TC[h]] = v; changed = true; } };
    const kind = kindOf_(r[TC['Jenis']]);
    set('Jenis', KINDS[kind]);
    const code = String(r[TC['Kode kategori']] || '').trim();
    if (isCustomCat_(code)) {
      if (validCat_(code, acc)) set('Kategori', acc.catMap[code].name);
      else { set('Kode kategori', 'lain_t'); set('Kategori', CATS.lain_t); }      // kategori custom sudah dihapus
    }
    const par = String(r[TC['Kegiatan induk']] || '').trim();
    if (par && (kind === 'kegiatan' || par === r[TC['ID']] || !kegiatan[par])) set('Kegiatan induk', '');
    if (!validProf_(String(r[TC['Dibuat oleh']] || '').trim())) set('Dibuat oleh', acc.first);
    const done = isDone_(r[TC['Status']]);
    if (kind === 'kegiatan' && done) { set('Status', 'Belum'); set('Selesai pada', ''); }
    if (!done || kind === 'kegiatan') set('Diselesaikan oleh', '');
    else if (!validProf_(String(r[TC['Diselesaikan oleh']] || '').trim())) set('Diselesaikan oleh', acc.first);
  });
  return changed;
}
function parseRow_(r, acc) {
  const g = function (h) { return String(r[TC[h]] == null ? '' : r[TC[h]]).trim(); };
  const date = normDate_(g('Tanggal'));
  const name = unsafe_(g('Nama tugas'));
  if (!date || !name || !validId_(g('ID'))) return null;
  const code = g('Kode kategori');
  const kind = kindOf_(g('Jenis'));
  const done = kind === 'tugas' && isDone_(g('Status'));
  const dl = normDate_(g('Deadline (tanggal)'));
  const par = g('Kegiatan induk'), by = g('Dibuat oleh'), doneBy = g('Diselesaikan oleh');
  return {
    id: g('ID'), cat: validCat_(code, acc) ? code : catByName_(g('Kategori'), acc), name: name.slice(0, 200), detail: unsafe_(g('Detail')).slice(0, 2000),
    date: date, start: normTime_(g('Jam mulai')), end: normTime_(g('Jam selesai')), dlDate: dl, dlTime: dl ? (normTime_(g('Deadline (jam)')) || '23:59') : '',
    done: done, doneAt: done ? (parseStamp_(g('Selesai pada')) || Date.now()) : null,
    createdAt: parseStamp_(g('Dibuat')) || 0, updatedAt: parseStamp_(g('Diubah')) || 0,
    kind: kind, diff: diffOf_(g('Kesulitan')), parent: kind === 'tugas' && validId_(par) ? par : '',
    by: validProf_(by) ? by : acc.first, doneBy: done ? (validProf_(doneBy) ? doneBy : acc.first) : ''
  };
}
function catByName_(n, acc) {
  n = String(n || '').toLowerCase();
  for (const k in CATS) if (CATS[k].toLowerCase() === n) return k;
  const c = acc.cats.find(function (x) { return x.name.toLowerCase() === n; });
  return c ? c.id : 'lain_t';
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
