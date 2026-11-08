// Menjalankan apps-script/Code.gs di Node dengan tiruan (mock) runtime Google Apps Script.
// Dipakai oleh tests/server.test.js dan tests/e2e.test.js. Tidak butuh paket npm apa pun.
//
//   const { makeRuntime } = require('./gas-mock');
//   const S = makeRuntime();               // spreadsheet kosong, SECRET acak
//   S.apiRegister('adit', '1234', 'Adit'); // panggil fungsi Code.gs langsung
//   S.post('apiLogin', 'adit', '1234');    // atau lewat doPost (JSON bolak-balik, sama seperti aplikasi)
//   S.sheet('@adit').rows();               // isi tab sebagai array baris
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const CODE_GS = path.join(__dirname, '..', 'apps-script', 'Code.gs');

function makeRuntime(opts) {
  opts = opts || {};
  const sheets = [];
  const log = { formulaAttempts: 0 };

  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    setValues(vals) {
      if (vals.length !== this.nr || vals.some(v => v.length !== this.nc)) throw new Error('setValues: ukuran tidak cocok');
      vals.forEach((row, i) => row.forEach((v, j) => {
        let s = v == null ? '' : String(v);
        // Sheets menganggap teks berawalan = sebagai rumus. Code.gs wajib meng-escape-nya dengan apostrof.
        if (/^=/.test(s)) { log.formulaAttempts++; throw new Error('RUMUS TERTULIS KE SHEET: ' + s); }
        if (/^'/.test(s)) s = s.slice(1);       // apostrof = penanda teks, tidak ikut tersimpan (seperti Sheets)
        this.sh.set(this.r + i, this.c + j, s);
      }));
      return this;
    }
    getValues() { return this.getDisplayValues(); }
    getDisplayValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j));
        out.push(row);
      }
      return out;
    }
    clearContent() {
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, '');
      return this;
    }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
  }

  class Sheet {
    constructor(name) { this.name = name; this.cells = []; }
    set(r, c, v) { (this.cells[r - 1] = this.cells[r - 1] || [])[c - 1] = v; }
    get(r, c) { const row = this.cells[r - 1]; return row && row[c - 1] != null ? row[c - 1] : ''; }
    getName() { return this.name; }
    getLastRow() {
      for (let i = this.cells.length; i > 0; i--) if ((this.cells[i - 1] || []).some(v => v !== '' && v != null)) return i;
      return 0;
    }
    getMaxRows() { return 1000; }
    getRange(r, c, nr, nc) {
      if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('range tidak valid ' + [r, c, nr, nc]);
      return new Range(this, r, c, nr || 1, nc || 1);
    }
    setFrozenRows() {}
    setColumnWidth() {}
    // bantuan untuk tes
    rows(width) {
      const n = this.getLastRow(), w = width || Math.max(0, ...this.cells.map(r => (r || []).length));
      const o = [];
      for (let i = 1; i <= n; i++) { const row = []; for (let j = 1; j <= w; j++) row.push(this.get(i, j)); o.push(row); }
      return o;
    }
    header() { return this.rows()[0] || []; }
    objects() {          // baris data sebagai objek {judul kolom: nilai}
      const [h, ...rest] = this.rows();
      return (rest || []).map(r => Object.fromEntries((h || []).map((k, j) => [k, r[j]])));
    }
  }

  const ss = {
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: (n, idx) => {
      if (sheets.some(s => s.name === n)) throw new Error('tab sudah ada: ' + n);
      const s = new Sheet(n);
      if (idx === 0) sheets.unshift(s); else sheets.push(s);
      return s;
    },
    getSheets: () => sheets.slice(),
    getSpreadsheetTimeZone: () => 'Asia/Jakarta'
  };

  const props = Object.assign({}, opts.props || {});
  // Asia/Jakarta = UTC+7 tanpa DST
  const fmt = d => {
    const j = new Date(d.getTime() + 7 * 3600e3), p = n => String(n).padStart(2, '0');
    return j.getUTCFullYear() + '-' + p(j.getUTCMonth() + 1) + '-' + p(j.getUTCDate()) + ' ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes());
  };
  let lockFree = true;

  const ctx = {
    console,
    Date: opts.Date || Date,
    SpreadsheetApp: { openById: () => ss, getActiveSpreadsheet: () => ss },
    Utilities: {
      // GAS mengembalikan byte bertanda (-128..127)
      computeHmacSha256Signature: (msg, key) =>
        Array.from(crypto.createHmac('sha256', key).update(msg).digest()).map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate: d => fmt(d),
      parseDate: s => {
        const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
        if (!m) throw new Error('parseDate: format salah ' + s);
        return new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4] - 7, +m[5]));
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => lockFree, waitLock: () => {}, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
    HtmlService: { createHtmlOutputFromFile: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: t => ({ text: t, setMimeType() { return this; }, getContent() { return t; } })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(opts.codePath || CODE_GS, 'utf8'), ctx, { filename: 'Code.gs' });

  // helper
  ctx.__ss = ss;
  ctx.__sheets = sheets;
  ctx.__props = props;
  ctx.__log = log;
  ctx.sheet = name => ss.getSheetByName(name);
  ctx.setLockFree = v => { lockFree = !!v; };
  ctx.post = (fn, ...args) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ fn, args }) } }).getContent());
  ctx.postRaw = body => ctx.doPost({ postData: { contents: body } }).getContent();
  return ctx;
}

module.exports = { makeRuntime, CODE_GS };
