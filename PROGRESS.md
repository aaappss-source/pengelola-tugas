# PROGRESS — Update Pengelola Tugas per tahap

Rencana lengkap ada di dokumen proyek Claude **"prompt-update-aplikasi-per-tahap.txt"** (Poin 1–18, Tahap 0–10, keputusan K1–K6).
File ini wajib dibaca di awal setiap sesi dan diperbarui di akhir setiap tahap.

## Status

| Tahap | Isi | Status | Commit |
|---|---|---|---|
| 0 | Pemetaan, alat uji, PROGRESS.md | ✅ selesai (8 Nov 2026) | `Tahap 0: …` |
| 1 | Fondasi data + migrasi | ⏳ menunggu jawaban Q1–Q3 di bawah + konfirmasi user | – |
| 2 | Poin 4 → 5 → 1 → 2 → 3 → 9 → durasi | belum | – |
| 3 | Poin 10 → 8 (kategori) | belum | – |
| 4 | Poin 12 → 13 (banyak tugas sekaligus) | belum | – |
| 5 | Poin 15 (multi-hari) | belum | – |
| 6 | Poin 14 (drag di kalender) | belum | – |
| 7 | Poin 16 (Time Blocking) | belum | – |
| 8 | Poin 17 (Tugas vs Kegiatan) | belum | – |
| 9 | Poin 6 → 18 (avatar, profil) | belum | – |
| 10 | Poin 11 → 7 (geser, logo) | belum | – |

---

## 0. Cara kerja untuk sesi baru (baca dulu)

1. **Repo**: `github.com/aaappss-source/pengelola-tugas` (dulu `adhityaputra1055-source/…`, URL lama masih redirect).
   Branch `main` = yang tayang di GitHub Pages: **https://aaappss-source.github.io/pengelola-tugas/**. Push ke `main` = langsung live ke semua pengguna (±1–2 menit).
2. **Tidak ada build.** Aplikasi = satu file `index.html` (HTML + CSS + JS vanilla). Edit langsung file itu. Jangan menambah framework/bundler.
3. **Server** = Google Apps Script, salinan kodenya di `apps-script/Code.gs`. Mengubah file ini di repo **tidak** mengubah server. User harus menempelkan kode baru di editor Apps Script lalu *Terapkan → Kelola penerapan → Edit → Versi: Versi baru → Terapkan* (URL `/exec` tetap sama). Claude tidak bisa men-deploy server sendiri (sandbox tidak bisa menjangkau script.google.com).
   - Urutan aman: **deploy server dulu** (harus kompatibel dengan aplikasi lama), cek, **baru push `index.html`**.
   - Karena setiap ubahan server butuh tindakan manual user, usahakan semua ubahan `Code.gs` terkumpul di Tahap 1 (lihat §6).
4. **Database** = Google Spreadsheet (ID ada di `Code.gs` baris `SPREADSHEET_ID`). Sudah dipakai teman-teman user (8 akun, 46 tugas per 8 Nov 2026), jadi data lama harus aman.
5. Sebelum mengubah apa pun: `npm run verify` (lihat §5) harus lolos. Setelah selesai: jalankan lagi, perbarui file ini, satu commit `Tahap X: …`, laporkan ke user, **berhenti dan tunggu konfirmasi**.

---

## 1. Peta struktur kode

Nomor baris = posisi di commit Tahap 0 (akan bergeser). Cari pakai nama fungsi/ID, jangan hanya nomor baris.

### File

| File | Isi |
|---|---|
| `index.html` (1589 baris) | `<style>` baris 18–440 · markup 442–636 · satu `<script>` IIFE 638–1587 |
| `apps-script/Code.gs` (381 baris) | server API + akses spreadsheet |
| `sw.js` | service worker, cache `pt-v2`. Halaman: network-first. File lain (ikon, manifest): cache-first → **naikkan nama cache kalau mengganti ikon/logo** |
| `manifest.webmanifest` | nama "Pengelola Tugas"/"Tugas", warna `#232323`/`#1b1b1b`, 3 ikon |
| `icons/` | `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png` (PNG saja, tidak ada sumber SVG) |
| `tests/` | alat uji (dibuat di Tahap 0), lihat §5 |

### Bagian yang disebut di rencana

| Bagian | Markup (`index.html`) | CSS | JS |
|---|---|---|---|
| **Form buat/edit tugas** | Layar kategori `#add-screen` (519): toggle `#add-seg` **Tugas \| Kegiatan** + `#cat-grid`. Form `#form-wrap` → `#task-form` (540): `#f-name` (label "Nama tugas"), `#f-detail` ("Detail tugas"), `#f-quick` (Hari ini/Besok/Lusa), `#f-date` ("Tanggal dikerjakan"), `#f-start`/`#f-end` ("Jam pengerjaan"), switch `#f-dl-on` + `#f-dl-date`/`#f-dl-time` ("Deadline"), `#f-save` | `.cat-grid` `.cat-btn` `.fld` `.inp` `.quick` `.two` `.switch-row` `.btn-primary` | `openAdd(opts)` 1295, `renderCatGrid` 1316, `openForm` 1322, `saveForm` 1331, `setFormDate` + listener form 1554–1567, case `pick-cat`/`add-group`/`quick-date` di `handle` |
| **Item tugas** | dibuat JS | `.task` 81 (padding 13px 16px, gap 14px), `.task-name` 90 (17.5px), `.task-meta` 91 (13px), `.task-dl` 94 (12.5px), `.check` 101 (34px), `.cat-ic` | `taskRow(t)` 989 — dipakai di Home, Kalender, Pencarian. Tap baris → `openDetail`; tap `.check` → `toggleDone` |
| **Pop-up "Urungkan"** | `#toast` > `#toast-msg` + `#toast-btn` (636) | `.toast` 397 (`bottom:88px`) | `toast(msg, [label, cb])` 1403 (4,5 dtk kalau ada aksi, 2,4 dtk tanpa aksi; panggilan baru menimpa yang lama; `showLayer` menyembunyikan toast). Dipakai `toggleDone` 1281 dan `delTask` 1288. **Belum ada tombol ×** |
| **Kalender** | `#v-kalender` (467): `#cgrid` (grid bulan), `#cal-day-head`, `#cal-day-list`, tombol `.add-here` | `.cgrid` `.cday` 224 | `renderCalendar` 1051, case `cal-prev`/`cal-next`/`cal-day`/`add-on-date` |
| **Menu Grafik** | `#v-grafik` (486): filter `#st-filter`, tab bulan `#mtabs` (geser horizontal), `#stats-body` | `.donut-*` `.tiles` `.card` `.hbars` `.chart-box` `.clist`/`.crow` | `renderStats` 1084 (donut % kategori, ubin, tanggal tersibuk, kurva per tanggal `drawCurve` 1176, daftar "Per kategori" `.crow` — **belum bisa di-tap**), `donutSvg` 1141, `bindDonut` |
| **Menu "Saya"** | `#v-saya` (503) > `#me-body` | `.me-card` `.menu` `.tiles` | `renderMe` 1226: kartu profil (`.av.big` = huruf awal), ubin statistik, menu Akun (ganti akun, ubah nama, ubah PIN, keluar), menu Data (muat ulang, cadangan, pulihkan, hapus selesai, hapus semua), Tips |
| **Bottom navigation** | `nav.nav#nav` (509): Tugas · Kalender · **FAB +** (`.fab`, `data-act="add"`) · Grafik · Saya | `.nav` 119 (fixed, min-height 70px, 5 kolom), `.fab` 124 (64px, `top:-24px`) | `VIEWS=['tugas','kalender','grafik','saya']` + `goView(v)` 1444, `render()` 1456 |
| **Logo** | Header Home **tidak punya logo**: kiri tombol avatar `#hdr-av` (`data-act="accounts"`), tengah `<h1>Pengelola Tugas` + titik status `#sync-dot`. Logo hanya di layar masuk `.auth-logo` (609: kotak kuning + centang SVG). Ikon aplikasi = PNG di `icons/` (kotak kuning `#FFD43B`) | `.auth-logo` 360, `.logo` 50 (CSS sisa, tidak dipakai), `.av` 353 | – |

### Arsitektur JS (di dalam satu IIFE)

- Helper (642): `$`, `esc`, tanggal (`today`, `mkey`, `parseYmd`, `addDays`, `fmt*`), ikon `P` + `ic()` (668).
- **Kategori** `CATS` (709–738), `CAT`, `catOf(k)`, `catIc(c)`.
- **Data store** (742–855): `API_URL`, `tasks`, `ops`, `accounts`, `me`, `normTask` 751, `toDoc` 761, `lsGet/lsSet`, `api()` 773, `queueOp` 784, `persist` 790, `flush` 793, `applyServer` 814, `load` 820, status sinkron `STATUS`/`renderSync`.
- **Akun** (856–900) dan **layar masuk/daftar** (902–950).
- `state` 951 (view aktif, bulan per tampilan, filter, form).
- Render: `renderHome` 1000, `renderCalendar` 1051, `renderStats` 1084, `renderMe` 1226, `renderSearch` 1254, `renderDetail` 1265.
- **Lapisan** (layar/sheet) `LAYER_EL` + `showLayer/hideLayer` 1358; **tombol back HP** lewat satu entri "penjaga" di `history` (`syncHist`, `onBack` 1380–1399). Setiap layar/sheet baru **wajib** didaftarkan di `LAYER_EL` supaya tombol back HP menutupnya.
- Semua klik lewat satu listener → `handle(act, el, e)` 1476 (switch `data-act`). Tombol baru: beri `data-act="..."` lalu tambah `case`.
- Scroll halaman ada di `#sc` (konstanta `SC`), bukan `window`.
- Boot 1574: daftar service worker, `beforeinstallprompt`, `initAccounts()`.

### Server (`Code.gs`)

`doPost` 44 → `API_FUNCS_` 55: `apiRegister` 58, `apiLogin` 80, `apiLoad` 119, `apiSync(token, ops)` 133, `apiProfile` 172, `apiChangePin` 183.
Keamanan: token HMAC `userId.versi.kedaluwarsa.tanda` (`auth_` 199, `makeToken_` 209), PIN di-hash HMAC + salt (`hashPin_` 224, SECRET di Script Properties), kunci 10 menit setelah 5x salah, `LockService` di setiap tulis (`withLock_` 377), `safe_` 368 mencegah teks berawalan `= + - @` jadi rumus.
`doGet` 36 masih menyajikan UI lama (HtmlService `Index`) dari proyek Apps Script; tidak dipakai lagi.

---

## 2. Struktur data saat ini

### Tugas (objek JS, sama di klien dan API)

```js
{ id: 't…',            // string ^[A-Za-z0-9_-]{1,60}$ (dibuat klien: newId())
  cat: 'tkuliah',      // kode kategori bawaan; kode tak dikenal -> 'lain_t' (di klien DAN server)
  name: '…',           // form maks 120, server maks 200
  detail: '…',         // maks 2000
  date: 'YYYY-MM-DD',  // "Tanggal dikerjakan" (wajib)
  start: 'HH:MM'|'',   // jam mulai; '' = tanpa jam (sudah bisa: kosongkan kolom jam)
  end: 'HH:MM'|'',     // jam selesai; end < start dianggap lewat tengah malam (renderDetail)
  dlDate: 'YYYY-MM-DD'|'', dlTime: 'HH:MM'|'',   // deadline; dlDate tanpa jam -> '23:59'
  done: bool, doneAt: ms|null, createdAt: ms, updatedAt: ms }
```

- `saveForm` menambah `kind:'task'` ke tugas baru, tapi `normTask`/`toDoc` membuangnya → **tidak pernah tersimpan** (sisa kode lama).
- Default form: jam = jam berikutnya s/d +1 jam (hari ini) atau 08:00–09:00; deadline **ON** untuk kategori kelompok Tugas, **OFF** untuk kelompok Kegiatan (case `pick-cat`), tanggal deadline ikut tanggal tugas sampai diubah manual.

### Kategori

Hardcode di **dua tempat** yang harus selalu sama:
- Klien `CATS` (index.html 709): `{k, n, g:'tugas'|'kegiatan', h:hue, i:ikon}` — 27 kategori: 12 kelompok Tugas (`tkuliah, tkerja, belajar, proyek, ujian, skripsi, coding, rumah, belanja, tagihan, admin, lain_t`), 15 kelompok Kegiatan (`kuliah, jamkerja, meeting, sosial, pacaran, keluarga, organisasi, olahraga, ibadah, kesehatan, hiburan, makan, perjalanan, istirahat, lain_k`). Ada **dua "Lainnya"** (`lain_t`, `lain_k`).
- Server `CATS` (Code.gs 21): peta `kode → nama`.
- Warna kategori = hue (`--h`) yang dipakai CSS `.cat-ic`. Grafik memakai 5 slot warna tetap (`SLOT`), bukan warna kategori.

### Akun / user

- Satu akun = satu orang (username + PIN). **Belum ada profil.** Avatar = huruf awal nama di kotak kuning (`.av`).
- Server, tab **`Pengguna`** (baris 1 = judul): `User ID | Username | Nama tampilan | PIN hash | Salt | Versi sesi | Dibuat | Terakhir masuk | Jumlah tugas | Selesai | Gagal login | Terkunci sampai | Nama tab`.
- Klien (localStorage di tiap HP): `pt.accounts` = `[{id, username, name, token}]` (semua akun yang pernah masuk di HP itu), `pt.current` = id akun aktif.

### Penyimpanan tugas

- Server: satu tab **`@username`** per akun. Kolom: `ID | Tanggal | Hari | Jam mulai | Jam selesai | Kategori | Nama tugas | Detail | Deadline (tanggal) | Deadline (jam) | Status | Selesai pada | Dibuat | Diubah | Kode kategori`. Semua sel format teks.
  - `readTasks_` membaca kolom **berdasarkan judul** (urutan kolom boleh diubah pemilik), mengisi ID untuk baris yang ditambah manual, dan memahami format tanggal Indonesia `d/m/yyyy`.
  - `apiSync` menulis ulang seluruh tab (urut tanggal + jam) dan memperbarui statistik di `Pengguna`.
  - `writeTaskRows_` **tidak pernah menulis ulang baris judul** → kolom baru butuh migrasi judul.
  - Hanya `TASK_HEADER.length` kolom yang dibaca/ditulis.
- Klien: `pt.cache.<userId>` = `{tasks: {id: task}, ops: [...]}`. `ops` = antrean offline `{op:'upsert', task}` / `{op:'delete', id}`; dikirim `flush()` dengan backoff sampai 60 dtk; satu op per id (yang terbaru).
- Cadangan teks (menu Saya): JSON `{app:'pengelola-tugas', version:1, exportedAt, tasks:[…]}`.

### Data nyata (dibaca 8 Nov 2026, hanya hitungan)

8 akun, 46 tugas (29 + 14 + 1 + 1 + 1, tiga akun kosong). Semua tugas punya jam mulai. Hanya **2 tugas** yang deadline-nya lebih lambat dari tanggalnya (1 Nov→3 Nov, 1 Nov→20 Nov); sisanya deadline = tanggal atau tanpa deadline. Akun terbesar memakai kategori kelompok Kegiatan (Jam Kerja, Kuliah, Meeting) untuk 8 dari 29 tugas (akun ini sudah mencentang 25 dari 29 tugasnya, jadi mengubah tugas lama jadi Kegiatan akan mengubah statistiknya). Ada rentang jam panjang (mis. 01:00–23:00, 10:00–23:00).

---

## 3. Padanan "Firebase security rules"

Tidak memakai Firebase. Padanannya ada di `Code.gs`: whitelist field di `cleanTask_` 304, `taskRow_` 318, `parseRow_` 324, `TASK_HEADER` 19, dan validasi kategori `CATS`. **Field yang tidak ada di sana dibuang diam-diam oleh server** (sudah dibuktikan di `tests/server.test.js`), jadi setiap field baru wajib ditambahkan di empat tempat itu + `normTask`/`toDoc` di klien.

---

## 4. Temuan yang memengaruhi tahap berikutnya

1. **Tahap 1 – kompatibilitas aplikasi lama.** `apiSync` mengganti satu baris penuh. HP yang masih membuka versi lama (PWA belum di-reload) akan mengirim tugas tanpa field baru → field baru terhapus. Rancangan Tahap 1 sebaiknya: server **mempertahankan nilai lama untuk field yang tidak dikirim**, dan klien mengirim versi aplikasi supaya server bisa meminta reload.
2. **Tahap 1 – migrasi ada di 3 tempat**: baris sheet (server, termasuk judul kolom baru), cache + antrean `ops` di localStorage tiap HP (klien), dan file cadangan JSON versi 1 (impor).
3. **Tahap 1 – "penanda tanpa jam" dan "durasi" sudah tersedia**: `start === ''` sudah berarti tanpa jam, dan `end` (jam selesai) sudah ada dengan default +1 jam. Usul: tidak perlu field baru; durasi dihitung dari `start`/`end`.
4. **Tahap 2 – Poin 4:** tinggi item sekarang 72 px (tanpa deadline) dan 91 px (dengan deadline; lebih tinggi lagi kalau baris deadline terlipat, mis. "Selesai tepat waktu" di layar 390 px). Di HP 390×844 daftar mulai di y≈306 px, jadi hanya 5–6 item terlihat. Item tidak menampilkan teks detail; "detail" di Poin 4 ditafsirkan sebagai baris info (jam · kategori · deadline) yang digabung jadi 1 baris.
5. **Tahap 2 – Poin 5:** `.toast` `bottom:88px` sedikit menimpa bagian atas FAB (puncak FAB 93 px dari bawah layar). Aksi sudah dijalankan seketika dan "Urungkan" membalikkannya, jadi tombol × cukup menyembunyikan toast.
6. **Tahap 3 – Poin 10:** server sekarang memaksa kode kategori tak dikenal jadi `lain_t` → kategori custom wajib disiapkan di server pada Tahap 1.
7. **Tahap 7 – Poin 16:** Home menampilkan daftar **per bulan**, sedangkan Time Blocking per **hari** → perlu pemilih hari. Tugas yang lewat tengah malam (end < start) perlu aturan tampilan.
8. **Tahap 8 – Poin 17 bentrok dengan yang sudah ada:** layar "+" sudah punya toggle **Tugas | Kegiatan**, tapi itu hanya memfilter kelompok kategori dan mengatur default deadline. Lihat Q2.
9. **Tahap 9 – Poin 6:** avatar karakter harus gambar SVG buatan sendiri (bukan karakter berhak cipta). Tempat avatar: `#hdr-av`, `.me-card`, baris akun `accRow`, layar masuk (akun tersimpan).
10. **Tahap 10 – Poin 11:** elemen yang bisa digeser ke samping dan harus dikecualikan dari gestur: `#home-chips`, `#mtabs`, kurva `#curve` (tooltip sentuh), donut, nanti drag kalender & Time Blocking. **Poin 7:** naikkan nama cache di `sw.js` saat ikon diganti.
11. Teks yang ditujukan ke pengguna memakai bahasa Indonesia santai, font Roboto, warna aksen `#FFD43B`, tema gelap.

---

## 5. Test, lint, type check

**Sebelum Tahap 0: tidak ada test, lint, maupun type check di repo** (pengujian sebelumnya ad-hoc di luar repo). Di Tahap 0 ditambahkan alat uji di `tests/` **tanpa mengubah kode aplikasi** dan tanpa dependensi npm:

| Perintah | Isi | Hasil Tahap 0 |
|---|---|---|
| `npm run check` (`node tests/check.js`) | Pengganti lint: sintaks JS di `index.html`/`sw.js`/`Code.gs`, manifest + ikon ada, id HTML unik, setiap `$('#id')` punya elemen, setiap `data-act` punya `case` di `handle()`, file SHELL `sw.js` ada | lolos (90 rujukan id, 47 data-act) |
| `npm run typecheck` (`node tests/typecheck.js`) | `tsc --checkJs` mode tidak ketat. Kode tidak bertipe jadi ada derau bawaan (Element vs HTMLElement, `api()` pakai `arguments`); gagal hanya jika jumlah error **naik** dari `tests/typecheck-baseline.json`. Lewati otomatis kalau `tsc` tidak ada | baseline index.html 28, sw.js 7 |
| `npm test` (`node --test tests/server.test.js`) | 10 unit test `Code.gs` lewat mock Apps Script (`tests/gas-mock.js`): daftar/masuk/kunci, sinkron, anti-rumus, field & kategori tak dikenal dibuang, token & ganti PIN, pemulihan dari sheet, dua akun terpisah, doPost | 10/10 lolos |
| `npm run test:e2e` (`node --test tests/e2e.test.js`) | Chromium (Playwright) membuka `index.html` dari repo; panggilan ke Apps Script dicegat dan dijawab `Code.gs` di mock (spreadsheet asli tidak tersentuh). Alur: daftar → tambah tugas → centang + Urungkan → offline lalu online → tombol back HP → tata letak → reload → semua menu → akun kedua + ganti akun → tidak ada error JS. `SHOTS=1` menyimpan tangkapan layar ke `tests/.shots/` | lolos (±17 dtk) |
| `npm run verify` | semua di atas | lolos |

Kebutuhan: Node ≥ 18. E2E butuh Playwright + Chromium; dicari di `node_modules` lalu folder global (`npm root -g`), kalau tidak ada tes E2E di-skip. Di sandbox Claude registry npm biasanya terblokir, jadi pakai Playwright global yang sudah ada; jangan `npm install`.

Untuk tahap berikutnya: logika rawan (migrasi, rentang multi-hari, susunan blok Time Blocking) sebaiknya dibuat sebagai fungsi murni di `index.html` lalu diuji. Fungsi di dalam IIFE tidak bisa di-`require`; cara yang disarankan: tes mengambil `<script>` dari `index.html` dan menjalankannya di Playwright/`vm`, atau taruh fungsi murni di objek global kecil (mis. `window.PT_LIB`) yang bisa dipanggil dari tes.

---

## 6. Keputusan K1–K6 dan pertanyaan terbuka

Default dari dokumen dipakai kecuali disebut lain. Pertanyaan ini perlu dijawab **sebelum Tahap 1** karena menentukan rancangan data.

- **Q1 / K1 (Poin 15):** Data sudah punya `date` (Tanggal dikerjakan) dan `dlDate` (Deadline). Usul: **tidak menambah field "Tanggal mulai"**; `date` = tanggal mulai, `dlDate` = akhir rentang. Akibatnya 2 tugas lama yang deadline-nya lebih lambat akan tampil multi-hari setelah Tahap 5 (dokumen default: tugas lama tetap 1 hari). → *menunggu jawaban*
- **Q2 (Poin 17 + toggle lama):** Usul: toggle **Tugas | Kegiatan** di layar "+" dijadikan pemilih jenis (field baru `kind`), kategori tidak lagi dikelompokkan, dan **semua tugas lama tetap Tugas** (bisa dicentang & dihitung di grafik). Alternatif: tugas lama berkategori kelompok Kegiatan otomatis jadi Kegiatan (tidak bisa dicentang, keluar dari grafik). → *menunggu jawaban*
- **Q3 (Poin 10 + migrasi kategori, K5):** Usul: 27 kategori bawaan disalin jadi kategori milik akun (bisa diubah/dihapus, kode lama dipakai sebagai ID sehingga tugas lama tidak perlu ditulis ulang), dua "Lainnya" digabung jadi satu yang tidak bisa dihapus, akun baru mendapat set bawaan yang sama. → *menunggu jawaban*
- **K2, K3, K4, K5 (milik akun), K6:** pakai default dokumen.
- **Diputuskan Tahap 0 (bisa dikoreksi user):**
  - Tanpa jam = `start === ''` (tanpa field baru); durasi = `end` − `start` (tanpa field baru), default 1 jam.
  - Semua ubahan `Code.gs` dikumpulkan di Tahap 1 (field baru, kategori per akun, profil per akun, pembuat/pencentang) supaya user cukup deploy server sekali.
  - Sebelum deploy Tahap 1, buat salinan spreadsheet sebagai cadangan.
  - Tahap selesai = commit + push ke `main` (langsung live), karena user perlu mencobanya di HP. Batalkan dengan `git revert`.

---

## 7. Log per tahap

### Tahap 0 — Pemetaan (8 Nov 2026)

- **Kode aplikasi tidak diubah** (`index.html`, `sw.js`, `manifest.webmanifest`, `apps-script/Code.gs` identik dengan commit `d2e4add`).
- File baru: `PROGRESS.md`, `package.json` (hanya skrip, tanpa dependensi), `.gitignore`, `tests/gas-mock.js`, `tests/server.test.js`, `tests/e2e.test.js`, `tests/check.js`, `tests/typecheck.js`, `tests/typecheck-baseline.json`.
- Belum beres: jawaban Q1–Q3; konfirmasi user untuk mulai Tahap 1.
