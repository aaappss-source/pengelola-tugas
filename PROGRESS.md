# PROGRESS — Update Pengelola Tugas per tahap

Rencana lengkap ada di dokumen proyek Claude **"prompt-update-aplikasi-per-tahap.txt"** (Poin 1–18, Tahap 0–10, keputusan K1–K6).
File ini wajib dibaca di awal setiap sesi dan diperbarui di akhir setiap tahap.

## Status

| Tahap | Isi | Status | Commit |
|---|---|---|---|
| 0 | Pemetaan, alat uji, PROGRESS.md | ✅ selesai (8 Nov 2026) | `Tahap 0: …` |
| 1 | Fondasi data + migrasi | ✅ selesai (8 Nov 2026), `Code.gs` di-deploy user 8 Nov 17.24 WIB, lalu `index.html` live | `Tahap 1: …` |
| 2 | Poin 4 → 5 → 1 → 2 → 3 → 9 → durasi | ✅ selesai (8 Nov 2026), hanya `index.html` (tanpa deploy server) | `Tahap 2: …` |
| 3 | Poin 10 → 8 (kategori) | ✅ selesai (13 Nov 2026), hanya `index.html` (tanpa deploy server) | `Tahap 3: …` |
| 4 | Poin 12 → 13 (banyak tugas sekaligus) | belum | – |
| 5 | Poin 15 (multi-hari) | belum | – |
| 6 | Poin 14 (drag di kalender) | belum | – |
| 7 | Poin 16 (Time Blocking) | belum | – |
| 8 | Poin 17 (Tugas vs Kegiatan) | belum | – |
| 9 | Poin 6 → 18 (avatar, profil) | belum | – |
| 10 | Poin 11 → 7 (geser, logo) | belum | – |

Di luar tahap: **Mode coba** (12 Nov 2026, hanya `index.html`, tanpa deploy server) — lihat §7 "Mode coba".

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

Nomor baris = posisi di commit Tahap 0 (sudah bergeser ±130 baris sejak Tahap 1 karena `<script id="pt-lib">`, dan ±200 lagi sejak Tahap 2). Cari pakai nama fungsi/ID, jangan hanya nomor baris. Kolom "sejak Tahap 2" di bawah menjelaskan bagian yang berubah.

### File

| File | Isi |
|---|---|
| `index.html` (±1720 baris) | `<style>` · markup · **`<script id="pt-lib">`** (sejak Tahap 1: fungsi data murni tanpa DOM → `window.PT_LIB`, diuji di Node) · `<script>` IIFE utama (memakai `const L=window.PT_LIB`) |
| `apps-script/Code.gs` (±615 baris) | server API + akses spreadsheet (versi data `SCHEMA = 2` sejak Tahap 1) |
| `sw.js` | service worker, cache `pt-v2`. Halaman: network-first. File lain (ikon, manifest): cache-first → **naikkan nama cache kalau mengganti ikon/logo** |
| `manifest.webmanifest` | nama "Pengelola Tugas"/"Tugas", warna `#232323`/`#1b1b1b`, 3 ikon |
| `icons/` | `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png` (PNG saja, tidak ada sumber SVG) |
| `tests/` | alat uji (dibuat di Tahap 0), lihat §5 |

### Bagian yang disebut di rencana

| Bagian | Markup (`index.html`) | CSS | JS |
|---|---|---|---|
| **Form buat/edit tugas** | Layar kategori `#add-screen` (519): toggle `#add-seg` **Tugas \| Kegiatan** + `#cat-grid`. Form `#form-wrap` → `#task-form` (540). **Sejak Tahap 2:** `#f-name` (label "Nama", + daftar saran `#f-sug`), `#f-detail` ("Detail"), `#f-diff` (kesulitan, `data-act="pick-diff"`), switch `#f-notime` ("Tanpa jam") yang menyembunyikan `#f-time-box` (jam + tombol durasi `#f-dur` `data-act="pick-dur"` + teks `#f-dur-txt`). Sebelumnya: `#f-name` (label "Nama tugas"), `#f-detail` ("Detail tugas"), `#f-quick` (Hari ini/Besok/Lusa), `#f-date` ("Tanggal dikerjakan"), `#f-start`/`#f-end` ("Jam pengerjaan"), switch `#f-dl-on` + `#f-dl-date`/`#f-dl-time` ("Deadline"), `#f-save` | `.cat-grid` `.cat-btn` `.fld` `.inp` `.quick` `.two` `.switch-row` `.btn-primary` | `openAdd(opts)` 1295, `renderCatGrid` 1316, `openForm` 1322, `saveForm` 1331, `setFormDate` + listener form 1554–1567, case `pick-cat`/`add-group`/`quick-date` di `handle`. **Sejak Tahap 3:** `renderCatGrid` = kategori bawaan sesuai tab + bagian **"Kategori saya"** (`.cat-sec`, link "Kelola" `data-act="cats-manage"`, tile custom `.cat-btn.cu`, tile "Baru" `data-act="cat-new" data-from="add"`); `pickCat(k)` (dulu isi case `pick-cat`) |
| **Item tugas** | dibuat JS | **Sejak Tahap 2:** `.task` min-height 52px (padding 7px), `.task .cat-ic` 36px, `.task-name` 15px maks 2 baris, `.task-meta` 12.5px **1 baris + "…"** (`nowrap`/`ellipsis`), label `.diff.mudah/.sedang/.sulit`, `.m-dl` (warna deadline), `.check` 28px + `::before` area tap 50px. Bagian `.ntbox` + `.subhead` "Tanpa jam" | `taskRow(t)` — dipakai di Home, Kalender, Pencarian. Baris info: `[kesulitan] jam · deadline pendek (dlShort) · kategori` (kategori terakhir supaya yang terpotong duluan). **`dayRows(list)`** (Home + Kalender): tugas tanpa jam (`start===''`) di bagian "Tanpa jam" di atas, lalu tugas berjam. Tap baris → `openDetail`; tap `.check` → `toggleDone` |
| **Pop-up "Urungkan"** | `#toast` > `#toast-msg` + `#toast-btn` + **`#toast-x`** (Tahap 2) | `.toast` `bottom: tinggi nav + 34px` (di atas FAB), `.toast-x` 40px | `toast(msg, [label, cb])` (4,5 dtk kalau ada aksi + tombol ×; 2,4 dtk tanpa aksi), **`undoToast(msg, urungkan)`** = komponen pakai ulang (dipakai `toggleDone`, `delTask`; dipakai lagi Tahap 6), `hideToast()`. Aksi sudah dijalankan sebelum pop-up muncul: Urungkan membalik, × hanya menutup. Pop-up baru menimpa yang lama. `showLayer` menyembunyikan toast |
| **Kalender** | `#v-kalender` (467): `#cgrid` (grid bulan), `#cal-day-head`, `#cal-day-list`, tombol `.add-here` | `.cgrid` `.cday` 224 | `renderCalendar` 1051, case `cal-prev`/`cal-next`/`cal-day`/`add-on-date` |
| **Menu Grafik** | `#v-grafik` (486): filter `#st-filter`, tab bulan `#mtabs` (geser horizontal), `#stats-body` | `.donut-*` `.tiles` `.card` `.hbars` `.chart-box` `.clist`/`.crow` | `renderStats` 1084 (donut % kategori, ubin, tanggal tersibuk, kurva per tanggal `drawCurve` 1176, daftar "Per kategori" — **sejak Tahap 3** `<button class="crow" data-act="cat-hist" data-k>` → riwayat), `donutSvg` 1141, `bindDonut`. Pengelompokan per kategori memakai `catKey()` |
| **Menu "Saya"** | `#v-saya` (503) > `#me-body` | `.me-card` `.menu` `.tiles` | `renderMe` 1226: kartu profil (`.av.big` = huruf awal), ubin statistik, **menu Kategori → "Kategori saya" (Tahap 3)**, menu Akun (ganti akun, ubah nama, ubah PIN, keluar), menu Data (muat ulang, cadangan, pulihkan, hapus selesai, hapus semua), Tips |
| **Kategori custom (Tahap 3)** | Daftar `#cats-wrap` > `#cats-body` (lapisan `cats`, z 75). Editor = panel `#import-wrap` (`openPanel`, z 80): `#kc-ic`, `#kc-name`, `#kc-err`, `#kc-hues` | `.cat-l` (huruf awal), `.cat-sec`, `.cat-btn.cu/.new`, `.hues/.hue`, `.kc-*` | `customCat`, `catOf`, `catKey`, `catGlyph`, `catIc`, `openCatEditor`, `syncCatEditor`, `saveCat`, `deleteCatAsk`/`deleteCatNow` (+ urungkan), `refreshCats`, `renderCatsList`; case `cat-new`, `cat-edit`, `cats-manage`, `close-cats`, `kc-hue`, `kc-save`, `kc-del` |
| **Riwayat per kategori (Tahap 3)** | Layar `#cathist-screen` (lapisan `cathist`, z 56): `#ch-title`, `#ch-list` | `.ch-head` `.ch-title` `.hrow` `.h-st(.done/.over)` | `openCatHist(k)`, `renderCatHist` (dipanggil juga dari `render()`), case `cat-hist`, `close-cathist`, `ch-open` (→ `openDetail`) |
| **Bottom navigation** | `nav.nav#nav` (509): Tugas · Kalender · **FAB +** (`.fab`, `data-act="add"`) · Grafik · Saya | `.nav` 119 (fixed, min-height 70px, 5 kolom), `.fab` 124 (64px, `top:-24px`) | `VIEWS=['tugas','kalender','grafik','saya']` + `goView(v)` 1444, `render()` 1456 |
| **Logo** | Header Home **tidak punya logo**: kiri tombol avatar `#hdr-av` (`data-act="accounts"`), tengah `<h1>Pengelola Tugas` + titik status `#sync-dot`. Logo hanya di layar masuk `.auth-logo` (609: kotak kuning + centang SVG). Ikon aplikasi = PNG di `icons/` (kotak kuning `#FFD43B`) | `.auth-logo` 360, `.logo` 50 (CSS sisa, tidak dipakai), `.av` 353 | – |

### Arsitektur JS (di dalam satu IIFE)

- Helper (642): `$`, `esc`, tanggal (`today`, `mkey`, `parseYmd`, `addDays`, `fmt*`), ikon `P` + `ic()` (668).
- **Kategori** `CATS` (709–738), `CAT`, `BUILTIN_NAMES`, **sejak Tahap 3:** `customCat(k)` (kategori custom dalam bentuk `{k,n,h,custom:true}`), `catOf(k)` (bawaan → custom → "Lainnya"), `catKey(k)` (kunci pengelompokan grafik/riwayat; kode custom yang hilang = `lain_t`), `catGlyph`/`catIc` (custom = huruf awal `.cat-l`), `newCatId()` (`c_` + base36).
- **Pustaka data `PT_LIB`** (script `pt-lib`, sejak Tahap 1): `normTask`, `toDoc`, `normCat`, `normProfile`, `opKey`/`enqueue` (antrean), `mergeServer`, `migrateCache`, `makeBackup`/`parseBackup`, `serverIsCurrent`, `pickProfile`. **Sejak Tahap 2:** jam & durasi `DEF_DUR` (60), `toMin`, `fromMin`, `durMin(start,end)` (null = tanpa jam; jam selesai kosong = 60; end < start = lewat tengah malam), `endAfter(start,menit)`, `crossesMidnight`, `fmtDur`; saran nama `suggestNames(list, q, limit)`. **Sejak Tahap 3:** `CAT_HUES` (palet 12 warna), `checkCatName(nama, namaBawaan, cats, selfId)` (aturan sama dengan `uniqueCatName_` server), `nextCatHue(cats)`, `deleteCat(tugas, cats, id, now)` (tugas → `lain_t`), `byTime` (dipakai script utama) + `newestFirst`; `demoServer` memindahkan tugas berkategori custom yang hilang ke `lain_t` seperti `Code.gs`. **Tahap 7 (Time Blocking) sebaiknya memakai `durMin`/`toMin` yang sama.** Logika data baru taruh di sini + beri tes di `tests/client.test.js`.
- **Data store**: `API_URL`, `tasks`, `ops`, **`cats`** (kategori custom), **`profiles`**, `accounts`, `me`, `isBuiltinCat`, `lsGet/lsSet`, `saveLocal`/`loadLocalFor` (cache v2), **`curProfile()`**, `api()`, `queueOp` (tugas), **`queueMeta(op)`** (kategori/profil), `persist`, `flush`, `applyServer(res)`, `load`, status sinkron `STATUS`/**`syncState()`**/`renderSync` (titik merah "Server belum diperbarui" kalau server belum Tahap 1).
- **Akun** (856–900) dan **layar masuk/daftar** (902–950).
- `state` 951 (view aktif, bulan per tampilan, filter, form).
- Render: `renderHome` 1000, `renderCalendar` 1051, `renderStats` 1084, `renderMe` 1226, `renderSearch` 1254, `renderDetail` 1265.
- **Lapisan** (layar/sheet) `LAYER_EL` + `showLayer/hideLayer` 1358 (Tahap 3: + `cats`, `cathist`; urutan z: add-screen **58** (dulu 50) > riwayat 56 > cari 55, sheet 70, `#cats-wrap` 75, detail/bulan/panel 80, konfirmasi 95, toast 100); **tombol back HP** lewat satu entri "penjaga" di `history` (`syncHist`, `onBack` 1380–1399). Setiap layar/sheet baru **wajib** didaftarkan di `LAYER_EL` supaya tombol back HP menutupnya.
- Semua klik lewat satu listener → `handle(act, el, e)` 1476 (switch `data-act`). Tombol baru: beri `data-act="..."` lalu tambah `case`.
- Scroll halaman ada di `#sc` (konstanta `SC`), bukan `window`.
- Boot 1574: daftar service worker, `beforeinstallprompt`, `initAccounts()`.

### Server (`Code.gs`)

`doPost` → `API_FUNCS_`: `apiRegister`, `apiLogin`, `apiLoad`, `apiSync(token, ops)`, `apiProfile`, `apiChangePin`.
Sejak Tahap 1 semua akses data satu akun lewat `openAccount_(userRow)` (baca tugas + kategori + profil, jalankan migrasi di memori, tandai `dirty`) lalu `saveAccount_(acc)` (tulis yang berubah, hanya di dalam `withLock_`). Jawaban berisi `bundle_`: `tasks`, `cats`, `profiles`, `schema: 2`.
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
  done: bool, doneAt: ms|null, createdAt: ms, updatedAt: ms,
  // --- sejak Tahap 1 ---
  kind: 'tugas'|'kegiatan',   // Kegiatan tidak bisa dicentang (server memaksa done=false) & tidak dihitung di statistik
  diff: ''|'mudah'|'sedang'|'sulit',   // tingkat kesulitan (opsional)
  parent: ''|'<id kegiatan>', // Kegiatan induk; server mengosongkan kalau induknya tidak ada / bukan kegiatan / diri sendiri
  by: 'p…',                   // profil pembuat; TIDAK berubah setelah dibuat (server mempertahankan nilai lama)
  doneBy: ''|'p…' }           // profil pencentang; '' kalau belum selesai
```

- **Tanpa jam** = `start === ''`, **durasi** = `end − start` (default 1 jam), **multi-hari** = `dlDate > date` → tanpa field baru (keputusan Tahap 0).
- **Aturan "field tidak dikirim = pertahankan"** (kompatibilitas): kalau `kind`/`diff`/`parent` tidak ada di data yang dikirim aplikasi, server memakai nilai yang sudah ada di sheet. Aplikasi sebelum Tahap 1 tidak pernah mengirim `kind` (= penanda "aplikasi lama"); kalau ia mengirim `cat:'lain_t'` untuk tugas yang berkategori custom, kategori custom dipertahankan. Di HP, `PT_LIB.normTask` hanya mengisi field baru kalau ada di sumber (data cache lama → `undefined` → tidak ikut terkirim).
- Kode kategori: bawaan (27 kode) **atau** custom `c_[a-z0-9]{1,20}`. Klien mempertahankan kode custom walau belum kenal (tampil "Lainnya" lewat `catOf` sampai Tahap 3); server mengganti kode custom yang tidak ada di akun itu jadi `lain_t`.
- ID profil: `p[a-z0-9]{1,20}`; profil pertama tiap akun = **`p1`** (dibuat otomatis oleh migrasi).

- Tugas baru dari `saveForm` (sejak Tahap 1): `kind:'tugas', diff:'', parent:'', by:curProfile(), doneBy:''`. `toggleDone` mengisi `doneBy` = profil aktif saat dicentang, `''` saat dibatalkan. (Dulu `kind:'task'` hanya tersimpan di cache HP; `normTask` mengubahnya jadi `'tugas'`.)
- Sejak Tahap 2 form mengisi `diff` (kosong kalau tidak dipilih) dan menyimpan `start:''`/`end:''` kalau "Tanpa jam" aktif. Edit tugas lama berjam mulai tanpa jam selesai → form mengisi jam selesai = mulai + 1 jam (baru tersimpan kalau user menekan Simpan). Ganti jam mulai → jam selesai ikut bergeser dengan durasi tetap.
- Default form: jam = jam berikutnya s/d +1 jam (hari ini) atau 08:00–09:00; deadline **ON** untuk kategori kelompok Tugas, **OFF** untuk kelompok Kegiatan (case `pick-cat`), tanggal deadline ikut tanggal tugas sampai diubah manual.

### Kategori

Hardcode di **dua tempat** yang harus selalu sama:
- Klien `CATS` (index.html 709): `{k, n, g:'tugas'|'kegiatan', h:hue, i:ikon}` — 27 kategori (kode + nama dicek sama dengan server oleh `tests/client.test.js` sejak Tahap 3): 12 kelompok Tugas (`tkuliah, tkerja, belajar, proyek, ujian, skripsi, coding, rumah, belanja, tagihan, admin, lain_t`), 15 kelompok Kegiatan (`kuliah, jamkerja, meeting, sosial, pacaran, keluarga, organisasi, olahraga, ibadah, kesehatan, hiburan, makan, perjalanan, istirahat, lain_k`). Ada **dua "Lainnya"** (`lain_t`, `lain_k`).
- Server `CATS` (Code.gs 21): peta `kode → nama`.
- Warna kategori = hue (`--h`) yang dipakai CSS `.cat-ic`. Grafik memakai 5 slot warna tetap (`SLOT`), bukan warna kategori.
- **Kategori custom (sejak Tahap 3, UI):** `cats` = `[{id:'c_…', name, hue}]` per akun. Ikon = huruf awal nama (huruf/emoji pertama) di lingkaran warna `hue`. Tampil di kedua tab layar "+" (bagian "Kategori saya"), dikelola dari menu Saya → Kategori saya atau "Kelola"/"Baru" di layar +. Saat dibuat dari tombol "Baru" di layar +, kategori langsung dipilih untuk tugas itu. Deadline bawaan untuk kategori custom mengikuti tab yang aktif (Tugas = ON, Kegiatan = OFF).

### Akun / user

- Satu akun = satu orang (username + PIN). **Belum ada profil.** Avatar = huruf awal nama di kotak kuning (`.av`).
- Server, tab **`Pengguna`** (baris 1 = judul, **tidak berubah** di Tahap 1): `User ID | Username | Nama tampilan | PIN hash | Salt | Versi sesi | Dibuat | Terakhir masuk | Jumlah tugas | Selesai | Gagal login | Terkunci sampai | Nama tab`.
- Klien (localStorage di tiap HP): `pt.accounts` = `[{id, username, name, token}]` (semua akun yang pernah masuk di HP itu), `pt.current` = id akun aktif.

### Penyimpanan tugas

- Server: satu tab **`@username`** per akun. Kolom: `ID | Tanggal | Hari | Jam mulai | Jam selesai | Kategori | Nama tugas | Detail | Deadline (tanggal) | Deadline (jam) | Status | Selesai pada | Dibuat | Diubah | Kode kategori` + sejak Tahap 1 **`Jenis | Kesulitan | Kegiatan induk | Dibuat oleh | Diselesaikan oleh`** (kolom P–T; isi: `Tugas`/`Kegiatan`, `Mudah`/`Sedang`/`Sulit`/kosong, ID kegiatan, ID profil, ID profil). Semua sel format teks. Kolom "Kategori" untuk kategori custom = nama terbarunya (diperbarui saat kategori diganti nama).
- **Tab `Kategori`** (sejak Tahap 1, dibuat saat kategori custom pertama): `User ID | Username | ID kategori | Nama | Warna (hue) | Dibuat | Diubah`. Warna = angka hue 0–359 (keputusan 1a: palet seragam dengan kategori bawaan). Maks 50 per akun, nama maks 30 huruf; nama kembar (dengan bawaan atau custom lain, tidak peka huruf besar/kecil) diberi akhiran " 2", " 3"… oleh server. Hapus → tugasnya jadi `lain_t`.
- **Tab `Profil`** (sejak Tahap 1): `User ID | Username | ID profil | Nama | Avatar | Dibuat | Diubah`. Maks **5** profil per akun (keputusan 3b). Profil terakhir tidak bisa dihapus. Hapus profil → tugas tetap mencatat ID lamanya (keputusan 2a; aplikasi menampilkan "Profil terhapus" di Tahap 9). Avatar = kode `[a-z0-9_-]` (diisi Tahap 9), kosong = huruf awal.
- Op sinkron (`apiSync`): `upsert`/`delete` (tugas) + **`cat`, `cat-del`, `profile`, `profile-del`**. Server memproses op kategori & profil lebih dulu, baru tugas; urutan di antrean tidak berpengaruh.
  - `readTasks_` membaca kolom **berdasarkan judul** (urutan kolom boleh diubah pemilik), mengisi ID untuk baris yang ditambah manual, dan memahami format tanggal Indonesia `d/m/yyyy`.
  - `apiSync` menulis ulang seluruh tab (urut tanggal + jam) dan memperbarui statistik di `Pengguna`.
  - Sejak Tahap 1 `writeTaskRows_` **menulis ulang baris judul** dalam urutan standar setiap kali menulis (memperbaiki bug: kalau pemilik menukar urutan kolom, data dulu ditulis dalam urutan standar di bawah judul yang tertukar → data bergeser).
  - Hanya `TASK_HEADER.length` (20) kolom yang dibaca/ditulis; tab yang kolomnya kurang dari 20 ditambah kolom.
- Klien: `pt.cache.<userId>` = **versi 2** `{v:2, tasks: {id: task}, ops: [...], cats: [...], profiles: [...]}` (versi 1 tanpa `v`/`cats`/`profiles` dimigrasi `PT_LIB.migrateCache` saat dibuka; antrean lama tetap terkirim). `ops` = antrean offline semua jenis op; dikirim `flush()` dengan backoff sampai 60 dtk; satu op per item (`opKey`: `t:`/`c:`/`p:` + id). Profil yang dipakai di HP: `pt.prof.<userId>` (default profil pertama).
- Cadangan teks (menu Saya): JSON **versi 2** `{app:'pengelola-tugas', version:2, exportedAt, tasks:[…], cats:[…], profiles:[…]}`. Impor menerima versi 1, versi 2, atau array tugas; kategori & profil yang belum ada ikut dipulihkan.

### Data nyata (dibaca 8 Nov 2026, hanya hitungan)

8 akun, 46 tugas (29 + 14 + 1 + 1 + 1, tiga akun kosong). Semua tugas punya jam mulai. Hanya **2 tugas** yang deadline-nya lebih lambat dari tanggalnya (1 Nov→3 Nov, 1 Nov→20 Nov); sisanya deadline = tanggal atau tanpa deadline. Akun terbesar memakai kategori kelompok Kegiatan (Jam Kerja, Kuliah, Meeting) untuk 8 dari 29 tugas (akun ini sudah mencentang 25 dari 29 tugasnya, jadi mengubah tugas lama jadi Kegiatan akan mengubah statistiknya). Ada rentang jam panjang (mis. 01:00–23:00, 10:00–23:00).

---

## 3. Padanan "Firebase security rules"

Tidak memakai Firebase. Padanannya ada di `Code.gs`: whitelist field di `cleanTask_`, `taskRow_`, `parseRow_`, `normRows_`, `TASK_HEADER`, validasi kategori (`CATS` + `validCat_`), dan `upsertCat_`/`upsertProfile_`. **Field yang tidak ada di sana dibuang diam-diam oleh server**, jadi setiap field baru wajib ditambahkan di tempat-tempat itu + `PT_LIB.normTask`/`toDoc` (konstanta `EXTRA`) di klien. Tahap 1 sudah menyiapkan semua field yang direncanakan; tahap berikutnya seharusnya tidak perlu mengubah `Code.gs` lagi.

---

## 4. Temuan yang memengaruhi tahap berikutnya

1. ~~Tahap 1 – kompatibilitas aplikasi lama~~ → **beres di Tahap 1**: server mempertahankan field yang tidak dikirim (lihat §2). Arah sebaliknya (aplikasi baru, server lama) ditangani dengan `schema`: aplikasi menampilkan titik merah "Server belum diperbarui" tapi tetap menyimpan.
2. ~~Tahap 1 – migrasi di 3 tempat~~ → **beres**: sheet (`openAccount_`/`normRows_`, otomatis per akun), cache HP (`migrateCache`), cadangan (`parseBackup`).
3. Tanpa jam & durasi memakai field yang ada (dipakai Tahap 2 dan 7).
4. ~~Tahap 2 – Poin 4~~ → **beres di Tahap 2**: item 52 px (nama 1 baris) / ±71 px (nama 2 baris), 8 item terlihat penuh di 390×844 pada posisi awal. "Detail" di Poin 4 = baris info (jam · deadline · kategori) jadi 1 baris; teks detail tugas tetap hanya di layar detail.
5. ~~Tahap 2 – Poin 5~~ → **beres**: toast dipindah di atas FAB + tombol ×.
5a. **Dari Tahap 2, untuk tahap berikutnya:** tugas lama yang hanya punya jam selesai (`start:''`, `end:'17:00'`) tampil di bagian "Tanpa jam" dengan teks "s/d 17:00" (definisi tanpa jam = `start===''`), tapi di form tetap dianggap berjam supaya jam selesainya tidak hilang. Data nyata tidak punya kasus ini. Tahap 7 perlu memutuskan tempatnya di Time Blocking (saran: area "Tanpa jam").
6. ~~Tahap 3 – Poin 10~~ → **beres di Tahap 3** (tanpa ubah server).
6a. **Dari Tahap 3, untuk Tahap 8:** di Grafik "Per kategori" masih bisa muncul **dua baris "Lainnya"** (`lain_t` dan `lain_k`, perilaku lama sejak sebelum Tahap 0). Saat pengelompokan kategori dihapus di Tahap 8, pertimbangkan menggabungkan keduanya di `catKey()` (cukup satu baris; kode di sheet tidak perlu diubah).
6b. Riwayat per kategori mengikuti **bulan DAN filter** Semua/Selesai/Belum yang sedang dipilih di Grafik, supaya jumlahnya sama dengan angka di baris "Per kategori".
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
| `npm run check` (`node tests/check.js`) | Pengganti lint: sintaks JS di `index.html`/`sw.js`/`Code.gs`, manifest + ikon ada, id HTML unik, setiap `$('#id')` punya elemen, setiap `data-act` punya `case` di `handle()`, file SHELL `sw.js` ada | lolos (90 rujukan id, 47 data-act; Tahap 2: 98 id, 50 data-act) |
| `npm run typecheck` (`node tests/typecheck.js`) | `tsc --checkJs` mode tidak ketat atas script `pt-lib` + script utama. Kode tidak bertipe jadi ada derau bawaan (Element vs HTMLElement, `api()` pakai `arguments`); gagal hanya jika jumlah error **naik** dari `tests/typecheck-baseline.json`. Lewati otomatis kalau `tsc` tidak ada | baseline index.html 28, sw.js 7 (Tahap 1: tetap 28, `pt-lib` 0 error) |
| `npm test` | `tests/server.test.js` (10 tes dasar `Code.gs` lewat mock Apps Script `tests/gas-mock.js`) + **`tests/server-data.test.js`** (Tahap 1: migrasi dari data server lama `tests/fixtures/Code-v1.gs`, idempoten, kompatibilitas aplikasi lama, field baru, kategori custom, profil, urutan kolom, baris manual, tab kurang kolom) + **`tests/client.test.js`** (Tahap 1: `PT_LIB` diambil dari `index.html` dan dijalankan di Node: migrasi cache v1→v2, normTask, antrean, gabung data server, cadangan v1/v2, alur cache lama → server baru) | 27/27 lolos |
| `npm run test:e2e` (`node --test tests/e2e.test.js`) | Chromium (Playwright) membuka `index.html` dari repo; panggilan ke Apps Script dicegat dan dijawab `Code.gs` di mock (spreadsheet asli tidak tersentuh); font Google dibalas CSS kosong (sandbox tanpa internet). 3 skenario: (1) daftar → tambah → centang + Urungkan → offline/online → back HP → tata letak → reload → semua menu → ganti akun (+ cek kolom baru & cache v2); (2) **HP dengan cache v1 + antrean offline, data dari server lama → server baru** (migrasi penuh); (3) **aplikasi baru + server lama** (tetap simpan, titik merah). `SHOTS=1` menyimpan tangkapan layar ke `tests/.shots/` | 3/3 lolos (±25 dtk) |
| `npm run verify` | semua di atas | lolos (30 tes, Tahap 1; 33 tes, Tahap 2; 35 tes, mode coba; **43 tes, Tahap 3**: + 7 tes `client.test.js` + 1 E2E Tahap 3; check 109 id / 61 data-act) |

Kebutuhan: Node ≥ 18. E2E butuh Playwright + Chromium; dicari di `node_modules` lalu folder global (`npm root -g`), kalau tidak ada tes E2E di-skip. Di sandbox Claude registry npm biasanya terblokir, jadi pakai Playwright global yang sudah ada; jangan `npm install`.

Untuk tahap berikutnya: logika rawan (rentang multi-hari, susunan blok Time Blocking, dll) taruh sebagai fungsi murni di script **`pt-lib`** (`window.PT_LIB`, tanpa DOM) lalu tambah tes di `tests/client.test.js` (script diambil dari `index.html` dan dijalankan dengan `vm`).

---

## 6. Keputusan K1–K6 dan keputusan tambahan

Jawaban user 8 Nov 2026: **Q1 = a, Q2 = a, Q3 = b**. K2, K3, K4, K5 (kategori milik akun), dan K6 memakai default dokumen.

- **Q1 / K1 (Poin 15): pakai field yang ada.** Tidak ada field "Tanggal mulai" baru. `date` = tanggal mulai, `dlDate` = akhir rentang. Tugas multi-hari = `dlDate > date`. Tugas tanpa deadline = 1 hari. 2 tugas lama yang deadline-nya lebih lambat ikut tampil multi-hari setelah Tahap 5 (disetujui user). Migrasi Tahap 1 "tanggal mulai = deadline = tanggal tugas" **tidak dipakai**. K2: drag menggeser `date` dan `dlDate` dengan selisih hari yang sama.
- **Q2 (Poin 17): toggle lama jadi pemilih jenis.** Field baru `kind: 'tugas' | 'kegiatan'`; **semua tugas lama = `'tugas'`** (tetap bisa dicentang dan dihitung di grafik). Di Tahap 8, toggle **Tugas | Kegiatan** di layar "+" berubah fungsi jadi pemilih jenis, dan kategori tidak lagi difilter per kelompok (`g`). Default deadline ON/OFF ikut jenis (Tugas ON, Kegiatan OFF), tidak lagi ikut kelompok kategori. Sampai Tahap 8, toggle tetap bekerja seperti sekarang.
- **Q3 (Poin 10): kategori bawaan tetap permanen, kategori custom hanya tambahan.**
  - 27 kategori bawaan tetap hardcode, sama untuk semua akun, tidak bisa diubah nama atau dihapus. Tidak ada migrasi kategori (poin Tahap 1 "kategori lama dipindah ke kategori milik akun" **tidak dipakai**).
  - Kategori custom milik akun (K5: dipakai bersama semua profil), berisi nama + warna, disimpan di server. Bisa ditambah, diubah, dihapus. Saat dihapus, tugasnya pindah ke "Lainnya" (`lain_t`).
  - Nama kategori custom tidak boleh sama dengan kategori custom lain **maupun nama kategori bawaan** di akun itu (tidak peka huruf besar/kecil).
- **Turunan Q2 + Q3 (default diambil Tahap 0, bisa dikoreksi user):** karena pengelompokan kategori hilang di Tahap 8, dua kategori bawaan bernama "Lainnya" (`lain_t`, `lain_k`) akan muncul dobel. Default: pemilih kategori hanya menampilkan satu "Lainnya" (`lain_t`); tugas lama berkode `lain_k` tetap valid dan tampil sebagai "Lainnya". Kode tidak diubah di sheet.
- **Tahap 1 (jawaban user 8 Nov 2026: 1a, 2a, 3b):** warna kategori custom = palet hue (angka 0–359, seragam dengan kategori bawaan); profil yang dihapus → tugasnya tetap mencatat ID profil lama (tampil "Profil terhapus"); maks **5** profil per akun.
- **Tahap 3 (jawaban user 13 Nov 2026, semua sesuai rekomendasi):** ikon kategori custom = **huruf awal + warna** (tanpa field ikon, tanpa deploy server); kategori custom tampil di **kedua tab** layar "+" (bagian "Kategori saya" setelah kategori bawaan); dikelola dari **layar + (Baru/Kelola) dan menu Saya → Kategori saya**.
- **Diputuskan sendiri di Tahap 3 (bisa dikoreksi user):** hapus kategori pakai konfirmasi + pop-up Urungkan (kategori dibuat lagi dengan ID yang sama, tugasnya dikembalikan); warna bawaan kategori baru = warna palet pertama yang belum dipakai; riwayat per kategori ikut filter status grafik (lihat §4 6b); status di riwayat: Selesai / Belum / **Terlambat** (belum selesai dan lewat deadline); tap item riwayat membuka detail tugas.
- **Diputuskan Tahap 0 (bisa dikoreksi user):**
  - Tanpa jam = `start === ''` (tanpa field baru); durasi = `end` − `start` (tanpa field baru), default 1 jam.
  - Semua ubahan `Code.gs` dikumpulkan di Tahap 1 (field baru: `kind`, kegiatan induk, kesulitan, pembuat/pencentang; kategori custom per akun; profil per akun) supaya user cukup deploy server sekali.
  - Sebelum deploy Tahap 1, buat salinan spreadsheet sebagai cadangan.
  - Tahap selesai = commit + push ke `main` (langsung live), karena user perlu mencobanya di HP. Batalkan dengan `git revert`.

---

## 7. Log per tahap

### Tahap 0 — Pemetaan (8 Nov 2026)

- **Kode aplikasi tidak diubah** (`index.html`, `sw.js`, `manifest.webmanifest`, `apps-script/Code.gs` identik dengan commit `d2e4add`).
- File baru: `PROGRESS.md`, `package.json` (hanya skrip, tanpa dependensi), `.gitignore`, `tests/gas-mock.js`, `tests/server.test.js`, `tests/e2e.test.js`, `tests/check.js`, `tests/typecheck.js`, `tests/typecheck-baseline.json`.
- Q1–Q3 dijawab user (1a, 2a, 3b), dicatat di §6.
- Belum beres: konfirmasi user untuk mulai Tahap 1 (di sesi baru, sesuai aturan satu tahap per sesi). → dikerjakan di bawah.

### Tahap 1 — Fondasi data + migrasi (8 Nov 2026)

Rancangan ditunjukkan dulu ke user dan disetujui (+ jawaban 1a, 2a, 3b, lihat §6). **Tampilan aplikasi tidak berubah.**

File diubah:
- `apps-script/Code.gs` — `SCHEMA = 2`; 5 kolom baru di tab tugas; tab baru `Kategori` & `Profil`; `openAccount_`/`saveAccount_`/`bundle_`; migrasi otomatis per akun (`normRows_`: Jenis=Tugas, Dibuat oleh=profil pertama, Diselesaikan oleh=profil pertama untuk yang selesai, profil `p1` dibuat dari nama akun); op `cat`/`cat-del`/`profile`/`profile-del`; `cleanTask_` mempertahankan field yang tidak dikirim aplikasi lama; Kegiatan tidak bisa dicentang; induk divalidasi; statistik `Pengguna` hanya menghitung jenis Tugas; judul kolom selalu ditulis ulang dalam urutan standar (perbaikan bug urutan kolom); tab yang kurang kolom ditambah kolom; peta ID memakai `Object.create(null)` (ID seperti `toString` tidak lagi dianggap ada).
- `index.html` — script baru `pt-lib` (`window.PT_LIB`); store memakai `PT_LIB` (cache v2, `cats`, `profiles`, `curProfile`, `queueMeta`, `applyServer(res)`); tugas baru menyimpan `kind/diff/parent/by`; centang menyimpan `doneBy`; cadangan versi 2; titik status merah kalau server belum Tahap 1 (`syncState`); `catOf` aman untuk kode aneh.
- Tes: `tests/server-data.test.js` (baru), `tests/client.test.js` (baru), `tests/fixtures/Code-v1.gs` (salinan server sebelum Tahap 1, untuk uji migrasi), `tests/gas-mock.js` (spreadsheet bersama antar-runtime, penghitung tulis, `getMaxColumns`), `tests/server.test.js` (header 20 kolom), `tests/e2e.test.js` (font dicegat — sebelumnya gagal di sandbox karena `ERR_TUNNEL_CONNECTION_FAILED` ke Google Fonts; + 2 skenario migrasi/kompatibilitas), `tests/typecheck.js` (ikut memeriksa `pt-lib`), `package.json` (tes baru).
- Diuji juga sekali (tidak disimpan sebagai tes): **`index.html` versi Tahap 0 + `Code.gs` baru** → alur E2E lama lolos, kolom baru terisi default, profil `p1` dibuat.

Hasil: `npm run verify` lolos (check, typecheck 28 = baseline, 30 tes).

**Langkah user (wajib, sekali):**
1. Buat salinan spreadsheet (File → Buat salinan) sebagai cadangan.
2. Tempel `apps-script/Code.gs` baru di editor Apps Script → Simpan → *Terapkan → Kelola penerapan → ✏️ Edit → Versi: Versi baru → Terapkan*.
3. Setelah itu `index.html` boleh live. Urutan sebaliknya juga aman (aplikasi baru + server lama tetap menyimpan, hanya titik status merah).

Migrasi data di spreadsheet terjadi per akun saat akun itu pertama kali dibuka/sinkron setelah deploy (bukan sekaligus). Akun yang belum pernah dibuka tetap berformat lama dan itu aman.

Status deploy: user melaporkan `Code.gs` sudah di-deploy (8 Nov 2026 17.24 WIB). Saat dicek lewat konektor Sheets tab `Profil` belum ada (belum ada akun yang membuka aplikasi setelah deploy), jadi bukti deploy berhasil = titik status hijau di aplikasi baru + tab `Profil` muncul setelah aplikasi dibuka. Kalau titik merah "Server belum diperbarui", deploy belum memakai versi baru (cek: *Kelola penerapan → Edit → Versi baru*, bukan *Penerapan baru*).

**Deploy terverifikasi (8 Nov 2026 17.34 WIB, lewat konektor Sheets):** tab `Profil` sudah ada (baris `adit / p1 / Adit`), tab `@adit` 20 kolom, semua Jenis = Tugas, Dibuat oleh = p1, Diselesaikan oleh = p1 hanya untuk yang selesai. User sudah mengetes di HP (titik hijau, tambah/centang/urungkan/hapus, cadangan v2, mode pesawat). 7 akun lain termigrasi otomatis saat dibuka. Branch `tahap-1` di GitHub sudah tidak dipakai (aman dihapus).

### Tahap 2 — Item tugas, pop-up, form dasar (8 Nov 2026)

Urutan: Poin 4 → 5 → 1 → 2 → 3 → 9 → isian durasi. **Hanya `index.html` yang berubah; `Code.gs` tidak berubah (tidak perlu deploy server).** Tidak ada field data baru: `diff` dan "tanpa jam" (`start===''`) sudah disiapkan di Tahap 1.

Tidak ada pertanyaan baru di awal tahap: semua poin sudah jelas dari dokumen + keputusan Tahap 0/1.

File diubah:
- `index.html`
  - **Poin 4** — CSS `.task`/`.task-name`/`.task-meta`/`.check` diringkas (lihat §1). Baris deadline yang dulu terpisah digabung ke baris info lewat `dlShort()` (mendesak: "Sisa 14 jam"/"Terlambat …"; masih lama: "DL 13 Nov"; selesai: "Tepat waktu"/"Selesai terlambat"). Teks deadline lengkap tetap di detail. Media query layar kecil ikut disesuaikan.
  - **Poin 5** — tombol `#toast-x`, `undoToast()`, `hideToast()`; posisi toast di atas FAB (`bottom` dihitung dari tinggi nav + safe-area).
  - **Poin 1** — label "Nama", "Detail", pesan error "Nama wajib diisi."
  - **Poin 2** — pemilih `#f-diff` (tap pilihan yang sama = kosongkan), label kecil di item dan di detail.
  - **Poin 3** — switch "Tanpa jam" (`#f-notime`), `dayRows()` untuk bagian "Tanpa jam" di Home & Kalender, detail menulis "Tanpa jam".
  - **Poin 9** — `#f-sug` + `renderSug()`/`hideSug()`. Daftar **ikut alur form** (mendorong kolom di bawahnya), jadi tidak pernah menutupi kolom lain. Tertutup saat kolom Nama blur (ditunda sampai jari diangkat supaya tap ke kolom lain tidak meleset karena layout bergeser), Esc, saran dipilih, form ditutup, keyboard HP ditutup (`visualViewport` membesar > 80px). Sumber saran = semua tugas akun aktif (kecuali yang sedang diedit).
  - **Isian durasi** — tombol 30 mnt / 1 jam / 1½ jam / 2 jam / 3 jam + teks "Durasi …" (+ "selesai besoknya" kalau lewat tengah malam). Detail tugas memakai `L.durMin`/`L.fmtDur`.
  - `.two` memakai `minmax(0,1fr)`: di layar 360px kolom jam kanan dulu keluar layar, sekarang muat.
  - `pt-lib`: fungsi jam/durasi + `suggestNames` (lihat §1).
- `tests/client.test.js` — tes jam & durasi (termasuk bolak-balik semua menit × beberapa durasi) dan saran nama.
- `tests/e2e.test.js` — skenario E2E Tahap 2 (tinggi item 44–56px, 8–12 item terlihat, font, 1 baris, area tap centang; toast × tidak membatalkan aksi, toast di atas FAB/nav, pop-up diganti, urungkan hapus; label; saran maks 5 + tidak menutupi kolom + Esc + pindah kolom + tap Kesulitan saat saran terbuka; durasi; tanpa jam di Home/Kalender/detail/edit; tugas lama tanpa jam selesai).

Hasil: `npm run verify` lolos (check 98 id/50 data-act, typecheck 28 = baseline, 33 tes). Dicek juga lewat tangkapan layar di 390×844 dan 360×740.

Belum bisa diuji dari sesi: tampilan di HP asli (keyboard Android/iOS, format jam 24 jam, notch/safe-area), gestur tutup keyboard.

### Mode coba — tanpa daftar, untuk portofolio (12 Nov 2026, di luar rencana tahap)

Permintaan user: aplikasi dipajang di portofolio (`aaappss-source.github.io/Adhitya-Arya-Putra`) dan bisa langsung dicoba pengunjung tanpa membuat akun di spreadsheet. **Hanya `index.html` yang berubah; `Code.gs` tidak berubah (tidak perlu deploy server).**

- Cara masuk: alamat **`…/pengelola-tugas/?coba`** (link di portofolio) atau tombol **"Coba dulu tanpa daftar"** (`#auth-try`, `data-act="demo"`) di layar masuk. Tombol disembunyikan kalau sudah ada akun aktif.
- `pt-lib`: `DEMO_TOKEN` (`'mode-coba'`, ada `-` jadi tidak bisa sama dengan username), `demoSeed(hariIni, now)` = 12 contoh tugas dengan tanggal relatif hari ini (kemarin–minggu depan, ada yang selesai, ada yang lewat deadline, ada yang tanpa jam), `demoServer(seed)` = "server" di memori yang menjawab `apiLoad`/`apiSync`/`apiProfile` dengan bentuk yang sama seperti `Code.gs` (memakai `mergeServer`/`toDoc` yang sama); fungsi lain (mis. ubah PIN) dijawab "tidak tersedia di mode coba".
- Script utama: akun mode coba = `{id:'coba', token: DEMO_TOKEN, demo:true}`. `api()` mengalihkan panggilan bertoken `DEMO_TOKEN` ke `demoServer` (tidak pernah `fetch`). `saveAccounts`/`saveLocal`/`loadLocalFor` **tidak menulis/membaca localStorage** untuk akun mode coba, dan `pt.current` tidak diubah → akun asli di HP yang sama tetap seperti semula. Data contoh hilang saat muat ulang (muat ulang dengan `?coba` = data contoh baru).
- Status sinkron di mode coba: titik hijau "Mode coba: berisi contoh tugas dan tidak disimpan ke server". Pop-up awal punya tombol **Daftar**.
- Keluar mode coba (`sign-out`, tanpa konfirmasi) atau pindah ke akun asli → `?coba` dibuang dari alamat (`dropDemoParam`; dibuang ulang setelah `history.back()` penjaga sheet) supaya muat ulang kembali ke aplikasi biasa.
- Tes: `client.test.js` + 1 tes (data contoh valid & kategori bawaan, deadline/centang masuk akal, server palsu: token, salinan, upsert/hapus/centang, profil, ubah PIN ditolak); `e2e.test.js` + skenario "mode coba" (`?coba` saat HP punya akun asli → 12 tugas, **0 panggilan Apps Script**, spreadsheet kosong, localStorage akun asli tidak berubah & tanpa kunci `coba`, ubah PIN ditolak, keluar → akun asli + `?coba` hilang + muat ulang tetap akun asli, tombol di layar masuk).

Hasil: `npm run verify` lolos (typecheck 28 = baseline, **35 tes**). Tangkapan layar mode coba (390×844) dipakai untuk kartu di portofolio.

### Tahap 3 — Kategori (13 Nov 2026)

Urutan: Poin 10 → 8. **Hanya `index.html` (dan tes) yang berubah; `Code.gs` tidak berubah (tidak perlu deploy server).** Tidak ada field data baru: kategori custom (`cats`, op `cat`/`cat-del`) sudah disiapkan server di Tahap 1.

Pertanyaan di awal tahap (dijawab user, semua opsi rekomendasi): ikon = huruf awal + warna, tampil di kedua tab, kelola dari layar + dan menu Saya. Lihat §6.

File diubah:
- `index.html`
  - **Poin 10** — `pt-lib`: `CAT_HUES`, `checkCatName`, `nextCatHue`, `deleteCat`, `byTime`/`newestFirst`; `demoServer` meniru server untuk kategori yang dihapus. Script utama: `customCat`/`catOf`/`catKey`/`catGlyph` (kategori custom dikenali di semua tempat: item tugas, detail, cari, form, grafik, menu Saya), grid layar + dengan bagian "Kategori saya" + tombol Baru/Kelola, editor kategori (nama maks 30, pratinjau, 12 warna, cek nama kembar dengan bawaan/custom lain, tidak peka huruf besar/kecil), daftar "Kategori saya" (`#cats-wrap`, jumlah tugas per kategori, "x dari 50"), menu Saya → Kategori saya, hapus kategori → konfirmasi (sebut jumlah tugas yang pindah) → tugas ke "Lainnya" + pop-up Urungkan. Semua lewat antrean `queueMeta`/`queueOp` (jalan offline).
  - **Poin 8** — baris "Per kategori" di Grafik jadi tombol (+ chevron, teks petunjuk), layar `#cathist-screen`: judul kategori + bulan + ringkasan, daftar tugas terbaru dulu (nama maks 2 baris, tanggal + jam, status Selesai/Belum/Terlambat), tap item → detail (centang/edit dari sana langsung memperbarui riwayat), tombol kembali + tombol back HP.
  - `#add-screen` z-index 50 → 58. Memperbaiki juga bug lama: Edit dari layar **Cari** → layar + terbuka di belakang layar Cari (terlihat saat form diciutkan).
- `tests/client.test.js` — + 7 tes: kategori bawaan aplikasi = server, aturan nama, warna bawaan, hapus kategori (HP vs `Code.gs`, urungkan, hapus sebelum terkirim), urutan riwayat, kategori custom di mode coba.
- `tests/e2e.test.js` — skenario E2E Tahap 3: tambah dari menu Saya (validasi kosong/bawaan/kembar, warna, back HP), tampil di kedua tab, "Baru" dari layar + langsung dipakai, ikon huruf di item, ubah nama + warna (sheet ikut nama baru), hapus + urungkan + hapus (tugas pindah ke Lainnya, tidak terhapus), Grafik: baris bisa di-tap, riwayat urut terbaru + status + tanggal, detail di atas riwayat, centang memperbarui riwayat, Edit membuka layar + di depan, filter Belum, bulan lain, kategori custom di grafik, muat ulang.

Hasil: `npm run verify` lolos (check 109 id/61 data-act, typecheck 28 = baseline, **43 tes**). Dicek lewat tangkapan layar 390×844 dan 360×740 (nama kategori 30 huruf, emoji di awal nama, nama tugas panjang).

Belum bisa diuji dari sesi: tampilan & keyboard di HP asli, sinkron dua HP sekaligus untuk akun yang sama (sudah diuji lewat server tiruan, bukan HP sungguhan).
