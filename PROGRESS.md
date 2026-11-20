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
| 4 | Poin 12 → 13 (banyak tugas sekaligus) | ✅ selesai (20 Nov 2026), hanya `index.html` (tanpa deploy server) | `Tahap 4: …` |
| 5 | Poin 15 (multi-hari) | ✅ selesai (20 Nov 2026), hanya `index.html` (tanpa deploy server) | `Tahap 5: …` |
| 6 | Poin 14 (drag di kalender) | ✅ selesai (20 Nov 2026), hanya `index.html` (tanpa deploy server) | `Tahap 6: …` |
| 7 | Poin 16 (Time Blocking) | ✅ selesai (20 Nov 2026), hanya `index.html` (tanpa deploy server) | `Tahap 7: …` |
| 8 | Poin 17 (Tugas vs Kegiatan) | ✅ selesai (20 Nov 2026), hanya `index.html` (tanpa deploy server) | `Tahap 8: …` |
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
| **Form buat/edit tugas** | Layar kategori `#add-screen` (519): toggle `#add-seg` **Tugas \| Kegiatan** + `#cat-grid`. Form `#form-wrap` → `#task-form` (540). **Sejak Tahap 2:** `#f-name` (label "Nama", + daftar saran `#f-sug`), `#f-detail` ("Detail"), `#f-diff` (kesulitan, `data-act="pick-diff"`), switch `#f-notime` ("Tanpa jam") yang menyembunyikan `#f-time-box` (jam + tombol durasi `#f-dur` `data-act="pick-dur"` + teks `#f-dur-txt`). Sebelumnya: `#f-name` (label "Nama tugas"), `#f-detail` ("Detail tugas"), `#f-quick` (Hari ini/Besok/Lusa), `#f-date` ("Tanggal dikerjakan"), `#f-start`/`#f-end` ("Jam pengerjaan"), switch `#f-dl-on` + `#f-dl-date`/`#f-dl-time` ("Deadline"), `#f-save` | `.cat-grid` `.cat-btn` `.fld` `.inp` `.quick` `.two` `.switch-row` `.btn-primary` | `openAdd(opts)` 1295, `renderCatGrid` 1316, `openForm` 1322, `saveForm` 1331, `setFormDate` + listener form 1554–1567, case `pick-cat`/`add-group`/`quick-date` di `handle`. **Sejak Tahap 4:** form dibungkus `#f-ed` (form yang sedang dibuka, kelas `.many` + kepala `#f-ed-head` "Tugas n dari m" + × saat >1 form), ringkasan form lain `#f-pre`/`#f-post` (`.f-card`, `data-act="item-open"`/`"item-del"`), tombol `#f-more` (`item-add`) + `#f-more-max`, pesan `#f-batch-err`; tanggal: switch `#f-multi` ("Beberapa tanggal", `#f-multi-row`) menukar `#f-one` (quick + `#f-date`) dengan kalender `#f-mcal` (`#f-mcal-grid` `.md` `mcal-day`, `mcal-nav`, `mcal-clear`, `#f-mcal-n`), error `#f-date-err`; deadline multi = `<select id="f-dl-off">` (jarak hari) + `#f-dl-hint`. JS: `snapItem`/`putItem`/`syncCur`, `renderItems`, `syncSaveLbl`, `addItem`/`openItem`/`delItem`, `syncMulti`/`renderMcal`/`setMulti`, `saveForm` (batch) + `saveEdit`, `goToDate`, `flashRows`, `closeAddAsk`/`addNeedsAsk`. **Sejak Tahap 3:** `renderCatGrid` = kategori bawaan sesuai tab + bagian **"Kategori saya"** (`.cat-sec`, link "Kelola" `data-act="cats-manage"`, tile custom `.cat-btn.cu`, tile "Baru" `data-act="cat-new" data-from="add"`); `pickCat(k)` (dulu isi case `pick-cat`) |
| **Item tugas** | dibuat JS | **Sejak Tahap 2:** `.task` min-height 52px (padding 7px), `.task .cat-ic` 36px, `.task-name` 15px maks 2 baris, `.task-meta` 12.5px **1 baris + "…"** (`nowrap`/`ellipsis`), label `.diff.mudah/.sedang/.sulit`, `.m-dl` (warna deadline), `.check` 28px + `::before` area tap 50px. Bagian `.ntbox` + `.subhead` "Tanpa jam" | `taskRow(t)` — dipakai di Home, Kalender, Pencarian. Baris info: `[kesulitan] jam · deadline pendek (dlShort) · kategori` (kategori terakhir supaya yang terpotong duluan). **`dayRows(list)`** (Home + Kalender): tugas tanpa jam (`start===''`) di bagian "Tanpa jam" di atas, lalu tugas berjam. Tap baris → `openDetail`; tap `.check` → `toggleDone`. **Sejak Tahap 5:** `taskRow(t, day)` / `dayRows(list, day)`: tugas multi-hari diberi tanda `.span-tag` paling depan di baris info ("Hari 2/3" di Home/Kalender, "3 hari" tanpa `day` = Pencarian), `title` = rentang lengkap. Satu tugas bisa tampil di beberapa baris dengan `data-id` sama (`toggleDone`/`flashRows` memakai `querySelectorAll`) |
| **Pop-up "Urungkan"** | `#toast` > `#toast-msg` + `#toast-btn` + **`#toast-x`** (Tahap 2) | `.toast` `bottom: tinggi nav + 34px` (di atas FAB), `.toast-x` 40px | `toast(msg, [label, cb])` (4,5 dtk kalau ada aksi + tombol ×; 2,4 dtk tanpa aksi), **`undoToast(msg, urungkan)`** = komponen pakai ulang (dipakai `toggleDone`, `delTask`, simpan banyak, hapus kategori, dan **`moveTask` Tahap 6**), `hideToast()`. Aksi sudah dijalankan sebelum pop-up muncul: Urungkan membalik, × hanya menutup. Pop-up baru menimpa yang lama. `showLayer` menyembunyikan toast |
| **Kalender** | `#v-kalender` (467): `#cgrid` (grid bulan), `#cal-day-head`, `#cal-day-list`, tombol `.add-here` | `.cgrid` `.cday` 224 | `renderCalendar` 1051, case `cal-prev`/`cal-next`/`cal-day`/`add-on-date`. **Sejak Tahap 5:** sel tanggal = `L.byDay(all(), bulan)` (tugas multi-hari dihitung di setiap tanggalnya), daftar tanggal = `onDate()` = `L.tasksOn`. **Sejak Tahap 6 (Mode Edit, drag):** `renderCalendar` = `renderCalGrid()` (grid + label bulan, dipakai juga saat pindah bulan sambil menarik) + kepala tanggal dengan tombol `.cal-edit` (`data-act="cal-edit"`, "Mode Edit"/"Selesai") + `#cal-legend` (keterangan warna, atau petunjuk `.cal-hint` saat Mode Edit) + daftar (TIDAK dibuat ulang selama tugas ditarik: `drag.stale`). `#v-kalender.editing` = Mode Edit (centang diganti pegangan ⋮⋮ lewat CSS `.task::before`). JS: `state.calEdit`, `setCalEdit`, `pressStart`/`pressMove`/`pressEnd` (touch event di `#cal-day-list`, touchmove **non-pasif**; mouse/pen lewat pointer event di `window`), `dragBegin` (bayangan `.drag-ghost` di `body`), `dragHit` (`elementFromPoint` → sel `#cgrid .cday[data-d]` atau tombol ‹ ›), `dragFlip` (ganti bulan), `dragPaint` (`.drop`/`.drop-span`, label bayangan), `dragAuto` (gulir sendiri di tepi), `dragStop`/`dragCancel`/`dragDrop`, **`moveTask(id, dari, ke)`** (simpan + `undoToast`), `flashCell`, `noClickUntil` (klik sesudah drag diabaikan 300 ms). Konstanta `DRAG_HOLD` 380 ms, `DRAG_SLOP` 10 px, `MONTH_HOLD` 650 ms, `EDGE` 56 px |
| **Time Blocking (Tahap 7)** | Di `#v-tugas`: tombol ikon **`#home-view`** di kepala halaman (`.hv-btn`, `data-act="home-view"`, `data-v` = tampilan TUJUAN, ikonnya juga ikon tujuan), lalu `#tb` > `#tb-bar` (strip 7 hari, menempel di `top: var(--hdr)`) + `#tb-body` (`#tb-nt` "Tanpa jam" + `#tb-grid` garis waktu). Saat Time Blocking, `#home-chips`/`#home-list` kosong + disembunyikan (dan sebaliknya) | `.tb-bar` `.tb-week` `.tb-nav` `.tb-day(.sel/.today)` `.tb-sum` `.tb-st` `.tb-up` `.tb-grid` `.tb-hr(.half)` `.tb-area` `.tb-b(.xs/.done/.cont/.prev/.flash)` `.tb-n` `.tb-m` `.tb-od` `.check.tb-chk` `.tb-now`; media ≤400px (ikon kepala 40px, judul 19px) dan ≤380px (strip lebih lebar) | `state.homeView` (`'list'`/`'tb'`, dari `localStorage pt.homeView`) + `state.tbDay`; `syncHomeView`, `setHomeView` (simpan pilihan kecuali mode coba, pesan "Tampilan: …" kalau tidak ada pop-up Urungkan), `setTbDay` (ikut mengganti `homeMonth`), `tbScroll` (gulir awal), `renderTB` (dipanggil `renderHome`), `tbBlock`, `homeScroll` (gulir awal menu Tugas untuk kedua tampilan; `scrollToDate` tidak berbuat apa-apa saat Time Blocking), `tbOn()`. Konstanta `TB_PX` 1 (1 menit = 1 px), `TB_TOP` 10, `TB_MIN` 20 (tinggi tampil minimal, menit), `TB_CHK` 45 (centang di blok ≥ 45 menit). case `home-view`, `tb-day`, `tb-step` (`data-n` ±1), `tb-top`. Klik blok → `openDetail` (listener klik: `.task[data-id],.tb-b[data-id]`); `flashRows` juga menyorot `.tb-b`. FAB + saat Time Blocking = tanggal `tbDay`; `goToDate('tugas')` juga mengisi `tbDay` |
| **Tugas vs Kegiatan (Tahap 8)** | Layar +: `#add-seg` = pemilih JENIS (`data-act="set-kind"` `data-k`, dulu `add-group`). Form: `#f-kind` (Tugas \| Kegiatan di atas form, `set-kind`) + `#f-kind-hint`; `#f-date-lbl`/`#f-time-lbl` (label ikut jenis); `#f-par-fld` > `#f-par` (chip `data-act="pick-par"` `data-id`) + `#f-par-hint` ("Masuk ke kegiatan"); `#f-time-err` (jam wajib kegiatan); isian khusus tugas diberi kelas `.only-t` (kesulitan, switch Tanpa jam, deadline) dan disembunyikan lewat `#task-form.is-keg`. Detail: `#detail-top` (judul ikut jenis). Dialog: `#cf-alt` (pilihan ketiga, `.dialog.three` tersusun ke bawah) | `.kind-seg` `.kind-hint` `.par-pick` `.hint.warn` · daftar: `.keg` (kartu, `--h` = warna kategori, `.fold`) > `.keg-h` (baris kegiatan, `data-id`) + `.keg-kids` (tugas di dalamnya) · `.keg-tag` `.keg-pr` `.keg-fold` · kalender `.cday .kd` + `.cal-legend i.kd-l` · detail `.d-status.is-keg` `.d-prog` `.d-kids` · TB `.tb-k` (latar) `.tb-kl` (label) `.tb-fg` (lapisan tugas, `pointer-events:none`) | Script utama: `isKeg`/`onlyT` (= `L.isKeg`/`L.tasksOnly`), `kegOf(t)` (induk yang berlaku), `state.fold` (Set, `localStorage pt.fold`, `saveFold`), `kegTime`, **`kegBlock(e, day)`** (kartu kegiatan + tugasnya), `dayRows(list, day, dropEmpty)` (memakai `L.nest`), `tbBg` (blok latar), `renderKegDetail`, `timeRow`, **`delKeg(id, mode)`** (+ urungkan), `moveTask` memakai `L.moveItem`, `KIND_N`, `setKind`/`syncKind`, **`renderPar(note)`**, `parentOk`, `countLbl`, `confirmBox(…, alt)`. case `set-kind`, `pick-par`, `keg-fold`, `keg-add`, `open-keg`, `confirm-alt`. Konstanta `TB_RAIL` 12 px, `TB_KL` 20 mnt, `DRAG_ROW` |
| **Menu Grafik** | `#v-grafik` (486): filter `#st-filter`, tab bulan `#mtabs` (geser horizontal), `#stats-body` | `.donut-*` `.tiles` `.card` `.hbars` `.chart-box` `.clist`/`.crow` | `renderStats` 1084 (donut % kategori, ubin, tanggal tersibuk, kurva per tanggal `drawCurve` 1176, daftar "Per kategori" — **sejak Tahap 3** `<button class="crow" data-act="cat-hist" data-k>` → riwayat), `donutSvg` 1141, `bindDonut`. Pengelompokan per kategori memakai `catKey()`. **Sejak Tahap 5:** `statList`/`inMonth` = tugas yang rentangnya menyentuh bulan itu; kurva/"Tanggal paling banyak"/"Hari aktif" memakai `L.perDay` (sekali per tugas); catatan di bawah judul kurva kalau ada tugas multi-hari |
| **Menu "Saya"** | `#v-saya` (503) > `#me-body` | `.me-card` `.menu` `.tiles` | `renderMe` 1226: kartu profil (`.av.big` = huruf awal), ubin statistik, **menu Kategori → "Kategori saya" (Tahap 3)**, menu Akun (ganti akun, ubah nama, ubah PIN, keluar), menu Data (muat ulang, cadangan, pulihkan, hapus selesai, hapus semua), Tips |
| **Kategori custom (Tahap 3)** | Daftar `#cats-wrap` > `#cats-body` (lapisan `cats`, z 75). Editor = panel `#import-wrap` (`openPanel`, z 80): `#kc-ic`, `#kc-name`, `#kc-err`, `#kc-hues` | `.cat-l` (huruf awal), `.cat-sec`, `.cat-btn.cu/.new`, `.hues/.hue`, `.kc-*` | `customCat`, `catOf`, `catKey`, `catGlyph`, `catIc`, `openCatEditor`, `syncCatEditor`, `saveCat`, `deleteCatAsk`/`deleteCatNow` (+ urungkan), `refreshCats`, `renderCatsList`; case `cat-new`, `cat-edit`, `cats-manage`, `close-cats`, `kc-hue`, `kc-save`, `kc-del` |
| **Riwayat per kategori (Tahap 3)** | Layar `#cathist-screen` (lapisan `cathist`, z 56): `#ch-title`, `#ch-list` | `.ch-head` `.ch-title` `.hrow` `.h-st(.done/.over)` | `openCatHist(k)`, `renderCatHist` (dipanggil juga dari `render()`), case `cat-hist`, `close-cathist`, `ch-open` (→ `openDetail`) |
| **Bottom navigation** | `nav.nav#nav` (509): Tugas · Kalender · **FAB +** (`.fab`, `data-act="add"`) · Grafik · Saya | `.nav` 119 (fixed, min-height 70px, 5 kolom), `.fab` 124 (64px, `top:-24px`) | `VIEWS=['tugas','kalender','grafik','saya']` + `goView(v)` 1444, `render()` 1456 |
| **Logo** | Header Home **tidak punya logo**: kiri tombol avatar `#hdr-av` (`data-act="accounts"`), tengah `<h1>Pengelola Tugas` + titik status `#sync-dot`. Logo hanya di layar masuk `.auth-logo` (609: kotak kuning + centang SVG). Ikon aplikasi = PNG di `icons/` (kotak kuning `#FFD43B`) | `.auth-logo` 360, `.logo` 50 (CSS sisa, tidak dipakai), `.av` 353 | – |

### Arsitektur JS (di dalam satu IIFE)

- Helper (642): `$`, `esc`, tanggal (`today`, `mkey`, `parseYmd`, `addDays`, `fmt*`), ikon `P` + `ic()` (668).
- **Kategori** `CATS` (709–738), `CAT`, `BUILTIN_NAMES`, **sejak Tahap 3:** `customCat(k)` (kategori custom dalam bentuk `{k,n,h,custom:true}`), `catOf(k)` (bawaan → custom → "Lainnya"), `catKey(k)` (kunci pengelompokan grafik/riwayat; kode custom yang hilang = `lain_t`), `catGlyph`/`catIc` (custom = huruf awal `.cat-l`), `newCatId()` (`c_` + base36).
- **Pustaka data `PT_LIB`** (script `pt-lib`, sejak Tahap 1): `normTask`, `toDoc`, `normCat`, `normProfile`, `opKey`/`enqueue` (antrean), `mergeServer`, `migrateCache`, `makeBackup`/`parseBackup`, `serverIsCurrent`, `pickProfile`. **Sejak Tahap 2:** jam & durasi `DEF_DUR` (60), `toMin`, `fromMin`, `durMin(start,end)` (null = tanpa jam; jam selesai kosong = 60; end < start = lewat tengah malam), `endAfter(start,menit)`, `crossesMidnight`, `fmtDur`; saran nama `suggestNames(list, q, limit)`. **Sejak Tahap 3:** `CAT_HUES` (palet 12 warna), `checkCatName(nama, namaBawaan, cats, selfId)` (aturan sama dengan `uniqueCatName_` server), `nextCatHue(cats)`, `deleteCat(tugas, cats, id, now)` (tugas → `lain_t`), `byTime` (dipakai script utama) + `newestFirst`; `demoServer` memindahkan tugas berkategori custom yang hilang ke `lain_t` seperti `Code.gs`. **Sejak Tahap 4:** `MAX_FORMS` (10), `MAX_BATCH` (100), `MAX_TASKS` (3000 = Code.gs), `MAX_OPS` (1000 = Code.gs), `DL_OFF_MAX` (7), `draftDates`, `toggleDate`, `dlOffOf`, `draftFields`, `draftErrors`, **`buildBatch`** (satu fungsi simpan Poin 12 + 13, semua atau tidak sama sekali), `nextSlot` (jam berurutan), `ymdAdd` diekspor. **Sejak Tahap 5 (multi-hari):** `spanEnd`, `isMulti`, `spanDays`, `onDay`, `dayOf`, `spanTag` ("Hari 2/3"/"3 hari"), `byClock` (urutan dalam satu tanggal), `tasksOn(list, tgl)`, `monthEnd`, `inMonth(list, bulan)` (rentang bersinggungan), `daysIn`, `byDay(list, bulan)` (kelompok per tanggal), `countDay`/`perDay` (kurva: sekali per tugas). **Sejak Tahap 6:** `shiftDates(t, dari, ke)` → `{date, dlDate, days}` (tanggal mulai + deadline bergeser selisih hari yang sama, jam tidak disentuh; `null` kalau tanggal sama/tidak valid). Script utama: `inMonth(mk)`/`onDate(d)` memanggil fungsi ini; `fmtRange(a,b)` ("9–11 Nov 2026"), `spanTitle`, `dateRow` (detail). **Sejak Tahap 7 (Time Blocking):** `DAY_MIN` (1440), `tbItems(list, tgl)` → `{untimed, blocks:[{t,start,end,cont,prev}]}` (memakai `tasksOn`/`toMin`/`durMin`; lewat tengah malam dipotong di 24:00 + lanjutan `prev` di hari berikutnya), `tbLayout(blocks, minLen)` → `+{col, cols, span, vEnd}` (berdampingan, melebar ke kolom kosong), `weekDays(tgl)` (Senin–Minggu), `tbScrollMin(blocks, menitSekarang|null)`. **Sejak Tahap 8 (Kegiatan):** `isKeg`, `tasksOnly` (semua hitungan), `parentOf(t, byId)` (induk berlaku = ada + kegiatan + bukan diri sendiri, sama dengan Code.gs), `kidsOf`, `kegProgress` → `{done,total}`, `kegOn(list, tgl)` (pilihan "Masuk ke kegiatan"), **`nest(list, dropEmpty)`** → `[{t, kids}]` (tugas di bawah kegiatannya), `outsideKeg` (K6), `shiftKids`, **`moveItem(byId, id, dari, ke)`** (kegiatan + tugasnya ikut; tugas yang pindah sendiri keluar dari kegiatan), **`kegDelete(list, id, 'all'|'release', now)`**, `serverRules(docs)` (aturan Jenis/induk Code.gs untuk mode coba), `tbItems` sekarang juga mengembalikan **`bg`** (kegiatan berjam = blok latar, tidak ikut `blocks`), `tbLabelAt(bg, blokTugas, menit)`; `draftFields` + `kind`/`parent`, `draftErrors` + `time` (kegiatan wajib berjam), `buildBatch` + `opts.parentOk`. Logika data baru taruh di sini + beri tes di `tests/client.test.js`.
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

- **Tanpa jam** = `start === ''`, **durasi** = `end − start` (default 1 jam), **multi-hari** = `dlDate > date` → tanpa field baru (keputusan Tahap 0). Sejak Tahap 5 tugas multi-hari **tampil** di setiap tanggal `date`…`dlDate`, tapi tetap satu baris di sheet / satu objek di HP (tidak ada salinan). Deadline sama dengan atau lebih awal dari `date` = 1 hari.
- **Aturan "field tidak dikirim = pertahankan"** (kompatibilitas): kalau `kind`/`diff`/`parent` tidak ada di data yang dikirim aplikasi, server memakai nilai yang sudah ada di sheet. Aplikasi sebelum Tahap 1 tidak pernah mengirim `kind` (= penanda "aplikasi lama"); kalau ia mengirim `cat:'lain_t'` untuk tugas yang berkategori custom, kategori custom dipertahankan. Di HP, `PT_LIB.normTask` hanya mengisi field baru kalau ada di sumber (data cache lama → `undefined` → tidak ikut terkirim).
- Kode kategori: bawaan (27 kode) **atau** custom `c_[a-z0-9]{1,20}`. Klien mempertahankan kode custom walau belum kenal (tampil "Lainnya" lewat `catOf` sampai Tahap 3); server mengganti kode custom yang tidak ada di akun itu jadi `lain_t`.
- ID profil: `p[a-z0-9]{1,20}`; profil pertama tiap akun = **`p1`** (dibuat otomatis oleh migrasi).

- Tugas baru dari `saveForm` (sejak Tahap 1): `kind:'tugas', diff:'', parent:'', by:curProfile(), doneBy:''`. Sejak Tahap 4 dibuat oleh `PT_LIB.buildBatch` (bentuk sama; `createdAt` naik 1 ms per tugas supaya urutan form terjaga). `toggleDone` mengisi `doneBy` = profil aktif saat dicentang, `''` saat dibatalkan. (Dulu `kind:'task'` hanya tersimpan di cache HP; `normTask` mengubahnya jadi `'tugas'`.)
- Sejak Tahap 2 form mengisi `diff` (kosong kalau tidak dipilih) dan menyimpan `start:''`/`end:''` kalau "Tanpa jam" aktif. Edit tugas lama berjam mulai tanpa jam selesai → form mengisi jam selesai = mulai + 1 jam (baru tersimpan kalau user menekan Simpan). Ganti jam mulai → jam selesai ikut bergeser dengan durasi tetap.
- Default form: jam = jam berikutnya s/d +1 jam (hari ini) atau 08:00–09:00; deadline **ON** untuk kategori kelompok Tugas, **OFF** untuk kelompok Kegiatan (case `pick-cat`), tanggal deadline ikut tanggal tugas sampai diubah manual.
- **Sejak Tahap 8 (Kegiatan):** `kind` dipilih di form (Tugas | Kegiatan); kegiatan disimpan dengan jam (wajib), `diff:''`, tanpa deadline, `parent:''`, dan tidak pernah `done` (sama dengan aturan server). `parent` tugas = ID kegiatan yang tampil di tanggal tugas itu (`L.kegOn`); di HP induk hanya dianggap berlaku lewat `L.parentOf` (ada + kegiatan + bukan diri sendiri), jadi data yang belum dirapikan server tetap tampil benar. Deadline bawaan ikut jenis (Tugas = ON), tidak lagi ikut kelompok kategori.

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
5a. ~~Dari Tahap 2~~ → **Tahap 7: masuk area "Tanpa jam" di Time Blocking** (tetap "s/d 17:00"). Catatan asli: tugas lama yang hanya punya jam selesai (`start:''`, `end:'17:00'`) tampil di bagian "Tanpa jam" dengan teks "s/d 17:00" (definisi tanpa jam = `start===''`), tapi di form tetap dianggap berjam supaya jam selesainya tidak hilang. Data nyata tidak punya kasus ini. Tahap 7 perlu memutuskan tempatnya di Time Blocking (saran: area "Tanpa jam").
6. ~~Tahap 3 – Poin 10~~ → **beres di Tahap 3** (tanpa ubah server).
6a. ~~Dari Tahap 3, untuk Tahap 8~~ → **beres di Tahap 8** (`catKey`: `lain_k` → `lain_t`, satu baris "Lainnya" di Grafik, riwayat, dan "Paling sering"). Catatan asli: di Grafik "Per kategori" masih bisa muncul **dua baris "Lainnya"** (`lain_t` dan `lain_k`, perilaku lama sejak sebelum Tahap 0). Saat pengelompokan kategori dihapus di Tahap 8, pertimbangkan menggabungkan keduanya di `catKey()` (cukup satu baris; kode di sheet tidak perlu diubah).
6b. Riwayat per kategori mengikuti **bulan DAN filter** Semua/Selesai/Belum yang sedang dipilih di Grafik, supaya jumlahnya sama dengan angka di baris "Per kategori".
6c. **Dari Tahap 4:** tugas dari "Beberapa tanggal" adalah tugas **terpisah** (ID sendiri, tanpa penanda kelompok), beda dengan Poin 15 (Tahap 5: satu tugas dengan rentang `date`…`dlDate`). Dengan deadline "1–7 hari setelahnya" tiap tugas punya `dlDate > date`, jadi **setelah Tahap 5 tugas seperti itu ikut tampil multi-hari**. Ini konsekuensi K1 (multi-hari = `dlDate > date`); pilihan bawaan tetap "Hari yang sama". Tahap 5 perlu menyebutkan ini ke user.
6c'. ~~Konsekuensi 6c~~ → **dijelaskan ke user di Tahap 5, dipilih "biarkan + keterangan"**: keterangan `#f-dl-hint` saat "Beberapa tanggal" + jarak deadline > 0 menyebut "Tiap tugas tampil n hari".
6d. **Dari Tahap 4:** `flush()` dulu mengirim seluruh antrean sekaligus padahal `Code.gs` hanya memproses 1000 op per kirim (`ops.slice(0, 1000)`); kelebihannya dianggap terkirim dan **hilang**. Sekarang dikirim maks `L.MAX_OPS` per kirim, sisanya di kiriman berikutnya (diuji E2E 1205 op).
6e. **Dari Tahap 5 (bug lama, sudah diperbaiki):** Urungkan setelah centang dulu tidak berpengaruh kalau sinkron sudah selesai (±0,5–2 dtk), karena `applyServer` mengganti objek tugas dan fungsi urungkan mengubah objek lama. Sekarang urungkan memakai `tasks[id]` saat tombol ditekan (diuji E2E: tunggu sinkron selesai, baru Urungkan). Tes E2E lama menekan Urungkan dalam 200–300 ms, jadi tidak ketahuan.
6f. ~~Untuk Tahap 6 (K2)~~ → **beres di Tahap 6** (`L.shiftDates`): tarik dari baris "Hari 2/3" ke tanggal X → selisih X − tanggal baris itu, `date` + `dlDate` bergeser sama. Deadline tugas 1 hari juga ikut (jawaban user).
6g. ~~Untuk Tahap 7 (K3)~~ → **beres di Tahap 7** (`L.tbItems` memakai `L.tasksOn`).
7. ~~Tahap 7 – Poin 16~~ → **beres**: pemilih hari = strip 7 hari + ‹ › (bulan di kepala halaman ikut hari yang tampil); lewat tengah malam = dipotong di 24:00 + lanjutan di pagi hari berikutnya.
7a. ~~Dari Tahap 7, untuk Tahap 8~~ → **beres di Tahap 8** (`tbItems().bg` + `.tb-k` di belakang `.tb-fg`). Catatan asli: di Time Blocking Kegiatan harus jadi **blok latar** dan tugas di dalamnya di atasnya. `tbItems` sekarang memperlakukan semua tugas sama (termasuk tugas lama berkategori kelompok Kegiatan, mis. "Jam Kerja 08:00–17:00" yang memakan satu kolom penuh). Saran: pisahkan `kind==='kegiatan'` dari `tbLayout` (digambar selebar area di belakang, z-index lebih rendah) dan susun hanya tugas di atasnya. Area "Tanpa jam" + jumlah di strip/ringkasan memakai `onDate` → ikut aturan hitung Kegiatan di Tahap 8.
7b. **Dari Tahap 7, untuk Tahap 10 (geser pindah menu):** Time Blocking tidak punya elemen yang digeser ke samping (strip 7 hari memakai tap + ‹ ›, garis waktu hanya bergulir vertikal), jadi gestur geser boleh aktif di sana. Kalau nanti ingin "geser = ganti hari" di Time Blocking, itu bentrok dengan geser pindah menu → putuskan salah satu. Strip `.tb-bar` menempel (`position:sticky`, `top: var(--hdr)`): kalau animasi geser memakai `transform`/`overflow` pada `#v-tugas`, uji ulang bahwa strip tetap menempel di bawah kepala halaman.
8. ~~Tahap 8 – Poin 17 bentrok dengan yang sudah ada~~ → **beres di Tahap 8**: toggle layar "+" jadi pemilih jenis (Q2).
8a. **Dari Tahap 8, untuk Tahap 9 (profil):** kegiatan juga punya `by` (pembuat) tapi tidak punya pencentang. Bagian Grafik "profil paling banyak membuat tugas" sebaiknya menghitung tugas saja (`L.tasksOnly`), sama dengan semua angka lain sejak Tahap 8. Kartu kegiatan (`kegBlock`) juga perlu tempat untuk avatar pembuat kalau baris tugas diberi.
8b. **Dari Tahap 8, untuk Tahap 10 (geser pindah menu):** drag kalender sekarang juga mulai dari kartu kegiatan (`DRAG_ROW` = `.task[data-id],.keg-h[data-id]`), aturan 6h tetap berlaku. Tombol ⌄ buka-tutup dan latar kegiatan Time Blocking tidak memakai geser samping.
8c. **Batas yang diketahui (Tahap 8):** kegiatan yang dibuat di form yang SAMA belum bisa dipilih sebagai "Masuk ke kegiatan" (harus disimpan dulu, atau lewat "+ Tambah tugas di kegiatan ini" di detail kegiatan). Edit tetap tanpa Urungkan (seperti sebelumnya), termasuk saat tugas di dalam kegiatan ikut pindah karena tanggal kegiatannya diganti.
9. **Tahap 9 – Poin 6:** avatar karakter harus gambar SVG buatan sendiri (bukan karakter berhak cipta). Tempat avatar: `#hdr-av`, `.me-card`, baris akun `accRow`, layar masuk (akun tersimpan).
6h. **Dari Tahap 6, untuk Tahap 10 (geser pindah menu):** gestur geser jangan dimulai kalau `drag` aktif atau `state.calEdit` (Mode Edit kalender) menyala. Drag memakai touch event di `#cal-day-list` (touchmove non-pasif, `preventDefault` hanya setelah tekan lama) dan pointer event untuk mouse. Elemen yang disentuh tidak boleh dibuang dari DOM selama drag (browser berhenti mengirim gerakan ke elemen yang sudah dibuang) → itu sebabnya daftar tanggal tidak dirender ulang selama menarik.
10. **Tahap 10 – Poin 11:** elemen yang bisa digeser ke samping dan harus dikecualikan dari gestur: `#home-chips`, `#mtabs`, kurva `#curve` (tooltip sentuh), donut, drag kalender (Mode Edit, lihat 6h) & nanti Time Blocking. **Poin 7:** naikkan nama cache di `sw.js` saat ikon diganti.
11. Teks yang ditujukan ke pengguna memakai bahasa Indonesia santai, font Roboto, warna aksen `#FFD43B`, tema gelap.

---

## 5. Test, lint, type check

**Sebelum Tahap 0: tidak ada test, lint, maupun type check di repo** (pengujian sebelumnya ad-hoc di luar repo). Di Tahap 0 ditambahkan alat uji di `tests/` **tanpa mengubah kode aplikasi** dan tanpa dependensi npm:

| Perintah | Isi | Hasil Tahap 0 |
|---|---|---|
| `npm run check` (`node tests/check.js`) | Pengganti lint: sintaks JS di `index.html`/`sw.js`/`Code.gs`, manifest + ikon ada, id HTML unik, setiap `$('#id')` punya elemen, setiap `data-act` punya `case` di `handle()`, file SHELL `sw.js` ada | lolos (90 rujukan id, 47 data-act; Tahap 2: 98 id, 50 data-act) |
| `npm run typecheck` (`node tests/typecheck.js`) | `tsc --checkJs` mode tidak ketat atas script `pt-lib` + script utama. Kode tidak bertipe jadi ada derau bawaan (Element vs HTMLElement, `api()` pakai `arguments`); gagal hanya jika jumlah error **naik** dari `tests/typecheck-baseline.json`. Lewati otomatis kalau `tsc` tidak ada | baseline index.html 28, sw.js 7 (Tahap 1: tetap 28, `pt-lib` 0 error; Tahap 6: 27, karena `e.target` di listener klik diberi tipe `Element`; **Tahap 7: 26**, `row.dataset.id` → `getAttribute`; **Tahap 8: 25**, case `add-group` lama dihapus) |
| `npm test` | `tests/server.test.js` (10 tes dasar `Code.gs` lewat mock Apps Script `tests/gas-mock.js`) + **`tests/server-data.test.js`** (Tahap 1: migrasi dari data server lama `tests/fixtures/Code-v1.gs`, idempoten, kompatibilitas aplikasi lama, field baru, kategori custom, profil, urutan kolom, baris manual, tab kurang kolom) + **`tests/client.test.js`** (Tahap 1: `PT_LIB` diambil dari `index.html` dan dijalankan di Node: migrasi cache v1→v2, normTask, antrean, gabung data server, cadangan v1/v2, alur cache lama → server baru) | 27/27 lolos |
| `npm run test:e2e` (`node --test tests/e2e.test.js`) | Chromium (Playwright) membuka `index.html` dari repo; panggilan ke Apps Script dicegat dan dijawab `Code.gs` di mock (spreadsheet asli tidak tersentuh); font Google dibalas CSS kosong (sandbox tanpa internet). 3 skenario: (1) daftar → tambah → centang + Urungkan → offline/online → back HP → tata letak → reload → semua menu → ganti akun (+ cek kolom baru & cache v2); (2) **HP dengan cache v1 + antrean offline, data dari server lama → server baru** (migrasi penuh); (3) **aplikasi baru + server lama** (tetap simpan, titik merah). `SHOTS=1` menyimpan tangkapan layar ke `tests/.shots/` | 3/3 lolos (±25 dtk) |
| `npm run verify` | semua di atas | lolos (30 tes, Tahap 1; 33 tes, Tahap 2; 35 tes, mode coba; 43 tes, Tahap 3; 52 tes, Tahap 4; 60 tes, Tahap 5; 64 tes, Tahap 6; **71 tes, Tahap 7**: + 6 tes `client.test.js` + 1 E2E; check 135 id / 72 data-act; typecheck index.html 26; **80 tes, Tahap 8**: + 8 tes `client.test.js` + 1 E2E; check 144 id / 77 data-act; typecheck index.html 25) |

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
- **Tahap 4 (jawaban user 20 Nov 2026, semua sesuai rekomendasi):** banyak form = **satu terbuka, lainnya ringkas** (1 baris, tap untuk membuka); deadline saat "Beberapa tanggal" = **ikut tiap tanggal** (jarak hari yang sama s/d +7 hari + jam); form baru dari "+" = **salinan form terakhir dengan jam berurutan** (mulai = jam selesai sebelumnya, durasi sama; Nama/Detail/Kesulitan kosong). K4 = default (setiap form punya "Beberapa tanggal" sendiri).
- **Diputuskan sendiri di Tahap 4 (bisa dikoreksi user):** edit tugas = tetap satu tugas (tanpa "Beberapa tanggal" dan tanpa "+"); simpan >1 tugas → pop-up **Urungkan** (menghapus semua tugas dari simpan itu), simpan 1 tugas tetap seperti dulu; batas **10 form** dan **100 tugas** sekali simpan, **100 tanggal** per form, cek batas **3000 tugas per akun** sebelum simpan (server diam-diam membuang kelebihannya); × di setiap form saat ada >1 form (termasuk form pertama), form yang berisi bisa diurungkan; Batal / back HP saat ada >1 form → konfirmasi "Buang n tugas?"; tanggal lampau boleh dipilih; tanggal kosong di form satu tanggal sekarang ditandai "Tanggal belum diisi." (dulu diam-diam jadi hari ini); "Beberapa tanggal" dimatikan → kembali ke tanggal pilihan pertama.
- **Tahap 5 (jawaban user 20 Nov 2026, semua sesuai rekomendasi):** tugas yang melewati pergantian bulan **dihitung 1 di setiap bulan yang dilewati** (progres Home, chip, Grafik, riwayat kategori, pemilih bulan); kurva per tanggal & "Tanggal paling banyak tugas" menghitung **sekali, di tanggal mulai** (tanggal 1 kalau mulai bulan lalu); tugas dari "Beberapa tanggal" + jarak deadline 1–7 hari **dibiarkan jadi multi-hari + keterangan di form**.
- **Diputuskan sendiri di Tahap 5 (bisa dikoreksi user):** tanda = **"Hari 2/3"** di depan baris info (deadline "DL 11 Nov"/"Sisa …" tetap ada), di pencarian "3 hari", di riwayat kategori "9–11 Nov 2026 (3 hari)"; detail menampilkan rentang + "hari ini hari ke-2" + keterangan; jumlah per tanggal (sel Kalender, "0/2 selesai" di kepala tanggal Home, "Hari ini: n tugas") ikut tugas yang **tampil** di tanggal itu; "Hari aktif" di Grafik mengikuti kurva (sekali per tugas); urutan dalam satu tanggal = jam, lalu yang mulainya lebih dulu; form tidak berubah (tanggal = mulai, deadline = akhir) + keterangan "Tampil n hari (…) sebagai satu tugas" saat deadline lebih lambat; edit/hapus/centang dari tanggal mana pun = tugas yang sama; deadline lebih awal dari tanggal = tetap 1 hari (tidak mundur); tidak ada batas panjang rentang (tampilan per bulan hanya mengulang ≤31 hari).
- **Tahap 6 (jawaban user 20 Nov 2026):** deadline tugas 1 hari **ikut bergeser** (jam deadline tetap), sama dengan aturan K2 untuk multi-hari; pindah bulan dengan **menahan tugas di atas ‹ ›**; setelah dilepas daftar **pindah ke tanggal tujuan** dengan tugas tadi disorot (bukan opsi rekomendasi "tetap di tanggal asal").
- **Diputuskan sendiri di Tahap 6 (bisa dikoreksi user):** tombol "Mode Edit" di kanan kepala daftar tanggal (aktif = tombol kuning "Selesai"), petunjuk menggantikan keterangan warna selama Mode Edit; di Mode Edit tombol centang di daftar kalender diganti pegangan ⋮⋮ (centang tetap bisa lewat detail), tap biasa tetap membuka detail; tekan lama 0,38 dtk, gerak > 10 px sebelum itu = gulir biasa; bayangan kecil di atas jari dengan label tanggal baru ("→ Kam, 12 Nov", multi-hari "→ 14–16 Nov 2026", "Tanggal asal", "Tahan untuk ke Des 2026"); seluruh rentang baru tugas multi-hari ikut ditandai; tahan di ‹ › 0,65 dtk = ganti bulan (terus ditahan = ganti lagi), batal = kembali ke bulan semula; halaman bergulir sendiri saat jari dekat tepi atas/bawah; lepas di luar tanggal atau di tanggal asal = batal tanpa pop-up; Urungkan = tanggal + deadline lama dan tanggal asal dipilih lagi; tombol back HP saat menarik = batal, back berikutnya = keluar Mode Edit, back lagi = menu Tugas; pindah menu/Esc juga mematikan Mode Edit; Mode Edit tidak diingat setelah aplikasi ditutup; tugas selesai juga bisa dipindah (tetap selesai); mouse juga bisa (laptop).
- **Tahap 7 (jawaban user 20 Nov 2026, semua opsi rekomendasi):** pemilih hari = **strip 7 hari (Senin–Minggu) + ‹ ›** (‹ › pindah satu hari, tap tanggal untuk lompat, titik = ada tugas); tugas **lewat tengah malam** dipotong di 24:00 dengan tanda "22:00 s/d 02:00 besok" dan **lanjutannya tampil di pagi hari berikutnya** ("Lanjutan, s/d 02:00", tugas yang sama); **tombol centang di blok ≥ 45 menit**, blok pendek tap → detail. Pertanyaan susulan (muncul saat implementasi): tombol pilihan tampilan sebagai baris "To Do List | Time Blocking" di bawah banner membuat posisi paling atas menu Tugas hanya memuat 7 tugas (Poin 4: 8) → user memilih **ikon di kepala halaman** (menempel, tidak memakan baris).
- **Diputuskan sendiri di Tahap 7 (bisa dikoreksi user):** ikon tombol = tampilan tujuan (☰ saat Time Blocking, ▦ saat To Do List) + pesan "Tampilan: …" (tidak menimpa pop-up Urungkan yang masih tampil); pilihan disimpan per HP (`localStorage pt.homeView`, bukan per akun; mode coba tidak menyimpan); hari yang tampil tidak diingat (dibuka lagi = hari ini); garis waktu penuh 00:00–24:00, 1 jam = 60 px, garis putus-putus tiap :30; gulir awal = 1 jam sebelum sekarang (hari ini) / 30 mnt sebelum blok pertama (hari lain) / 07:00 (kosong) / ke "Tanpa jam" kalau hari itu hanya berisi tugas tanpa jam; tombol "↑ n tanpa jam" di strip; garis merah "sekarang" + jamnya (hanya hari ini); filter Semua/Belum/Selesai disembunyikan di Time Blocking (semua tugas tampil, yang selesai dicoret & redup); jumlah di strip = tugas yang tampil di hari itu (lanjutan dari kemarin tidak dihitung); tinggi tampil minimal 20 mnt (blok 0–19 mnt tetap terbaca dan ikut dihitung bertabrakan); blok < 34 px = satu baris (nama + jam); tombol centang disembunyikan kalau blok lebih sempit dari ±104 px (≥ 3 tugas bertabrakan di layar 360 px) — tetap bisa lewat detail; blok yang punya kolom kosong di kanannya selama jamnya melebar; tanda lewat deadline = titik merah; tanda multi-hari "Hari 2/3"; warna blok = warna kategori; FAB + di Time Blocking memakai hari yang tampil; bulan di kepala halaman (dan banner) ikut bulan hari yang tampil, pemilih bulan → hari ini (bulan ini) atau tanggal 1; tidak ada "tap jam kosong untuk menambah tugas" (bisa ditambah nanti).
- **Tahap 8 (jawaban user 20 Nov 2026, semua opsi rekomendasi):** kegiatan dipindah (drag kalender atau ganti tanggal lewat Edit) → **tugas di dalamnya ikut pindah** selisih hari yang sama, tetap di dalam kegiatan; form Kegiatan = **rencana + "Beberapa tanggal"** (Nama, Detail, Kategori, Tanggal, Jam mulai–selesai wajib; tanpa kesulitan, tanpa jam, deadline); pilihan Tugas | Kegiatan **juga muncul saat Edit** (tugas lama bisa dijadikan kegiatan dan sebaliknya).
- **Diputuskan sendiri di Tahap 8 (bisa dikoreksi user):** pilihan jenis ada di layar + (di atas grid kategori) DAN di atas form, nilainya sama (jenis form yang sedang dibuka); grid kategori tidak disaring lagi: kategori yang cocok dengan jenisnya dulu, lalu "Kategori lain", satu "Lainnya" (`lain_t`; tugas `lain_k` lama tampil terpilih sebagai "Lainnya"), lalu "Kategori saya"; deadline bawaan ikut jenis (Tugas = ON, semua kategori); kegiatan tanpa jam ditolak ("Isi jam mulai kegiatan."); keterangan singkat apa itu kegiatan di form kegiatan; "Masuk ke kegiatan" = chip "Tidak ada" + kegiatan di tanggal form (urut jam, termasuk kegiatan multi-hari dari sheet), hanya tampil kalau ada kegiatan di tanggal itu, disembunyikan saat "Beberapa tanggal" (pilihan disimpan, tidak dipakai), dilepas kalau tanggal diganti ke tanggal tanpa kegiatan itu; K6 = keterangan kuning "Jam tugas ini di luar jam kegiatan (…). Tetap boleh disimpan." (tugas tanpa jam tanpa peringatan; juga di detail tugas); tugas di dalam kegiatan tampil di bawah kegiatannya walau jamnya di luar jam kegiatan atau tanpa jam; banyak form: jenis per form (boleh campur), form baru menyalin jenis + kegiatan form terakhir, label "Kegiatan 2 dari 3", tombol "Simpan 3 tugas & 2 kegiatan", pop-up "Kegiatan ditambahkan ke …"; daftar: kartu kegiatan (garis kiri warna kategori, tanda "Kegiatan", jam, progres "1/3 selesai" — hijau kalau semua selesai —, kategori) di jam mulainya, tugasnya di dalam kartu, tombol ⌄ buka-tutup (bawaan terbuka, yang ditutup diingat per HP di `localStorage pt.fold`, tidak di mode coba); filter Belum/Selesai: kegiatan hanya tampil kalau berisi tugas yang cocok (progres tetap dari semua tugasnya); SEMUA angka "tugas" (kepala halaman, banner, chip, kepala tanggal, "Hari ini", strip & ringkasan Time Blocking, sel & kepala Kalender, pemilih bulan, menu Saya, Grafik, riwayat) = tugas saja, kegiatan disebut terpisah ("· 2 kegiatan"; kepala tanggal yang hanya berisi kegiatan: "1 kegiatan"); kalender: garis biru kecil di bawah sel = ada kegiatan + keterangan "kegiatan" (hanya kalau bulan itu punya kegiatan); Time Blocking: kegiatan = blok latar selebar area (sesama kegiatan yang bertabrakan berdampingan), tugas di lapisan atas digeser 12 px dari kiri (hanya di hari yang punya kegiatan), label kegiatan di celah pertama ≥ 20 menit yang tidak tertutup tugas, tap latar = detail kegiatan, titik di strip juga untuk hari yang hanya berisi kegiatan; detail kegiatan: tanda "Kegiatan" + progres + daftar tugas di dalamnya (bisa dicentang/dibuka) + tombol utama "+ Tambah tugas di kegiatan ini" (layar + jenis Tugas, kegiatan sudah terpilih, jam mulai = jam kegiatan), tanpa "Tandai selesai"; detail tugas di dalam kegiatan: baris "Masuk ke kegiatan" (tap → detail kegiatan); hapus kegiatan berisi tugas → dialog 3 pilihan ("Keluarkan tugas, hapus kegiatan saja" / "Hapus kegiatan + n tugas" / Batal), tanpa tugas → konfirmasi biasa, keduanya + pop-up Urungkan yang mengembalikan semuanya; drag kalender: kegiatan bisa ditarik (bayangan "→ Kam, 12 Nov (+3 tugas)"), tugas di dalam kegiatan yang ditarik sendiri ke tanggal lain keluar dari kegiatan (pop-up "…, keluar dari kegiatan"), Urungkan mengembalikan tanggal + kegiatannya; Edit ubah jenis → keterangan kuning tentang akibatnya (status selesai/deadline/kesulitan dihapus; tugas di dalamnya dikeluarkan); pencarian: kegiatan tampil sebagai kartu tanpa daftar tugas; mode coba: contoh kegiatan "Jam kerja 08:00–16:00" hari ini berisi "Kirim laporan pembelian" (12 contoh tugas tetap 12); tugas lama tetap Tugas (Q2), termasuk "Jam Kerja 08:00–17:00" di akun teman — bisa diubah sendiri lewat Edit.
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

### Tahap 4 — Membuat banyak tugas sekaligus (20 Nov 2026)

Urutan: Poin 12 → 13. **Hanya `index.html` (dan tes) yang berubah; `Code.gs` tidak berubah (tidak perlu deploy server).** Tidak ada field data baru: setiap tugas dari "Beberapa tanggal" / form tambahan adalah tugas biasa.

Pertanyaan di awal tahap (dijawab user, semua opsi rekomendasi): tampilan banyak form, deadline saat beberapa tanggal, isi form baru. Lihat §6.

File diubah:
- `index.html`
  - `pt-lib` — satu fungsi simpan bersama **`buildBatch(drafts, opts)`**: memeriksa semua form dulu (nama, kategori, tanggal), batas 10 form / 100 tugas / 3000 tugas per akun, lalu membuat semua tugas; kalau satu gagal tidak ada yang dibuat. Pendukung: `draftDates`, `toggleDate`, `draftFields`, `draftErrors`, `dlOffOf`, `nextSlot`.
  - **Poin 12** — switch "Beberapa tanggal" di kolom Tanggal, kalender bulan (Min–Sab, tap pilih/batal, hari ini bercincin kuning, tanggal lampau redup, pindah bulan), teks "n tanggal dipilih (x di bulan lain)", Kosongkan. Deadline: pilihan jarak (Hari yang sama … 7 hari setelahnya) + jam. Tombol Simpan menyebut jumlahnya ("Simpan 4 tugas"). Setiap tanggal = tugas terpisah (ID sendiri).
  - **Poin 13** — tombol "Tambah tugas lain" (+) di bawah form. Form yang sedang diisi terbuka penuh (bingkai kuning, "Tugas n dari m", ×), form lain jadi kartu ringkas (ikon kategori, nama, "Tugas n · tanggal · jam", ×), tap untuk membuka. Kategori per form lewat "Ganti" (layar kategori menulis "Pilih kategori untuk Tugas n"). Simpan: form yang belum lengkap ditandai merah, form pertama yang salah dibuka + kolomnya ditandai, tidak ada yang tersimpan.
  - Simpan = semua tugas masuk antrean + satu kali tulis cache HP → terkirim dalam **satu `apiSync`** (server memproses semuanya dalam satu kunci dan satu kali tulis sheet).
  - Perbaikan bug lama (lihat §4 6d): `flush()` mengirim maks 1000 op per kirim.
- `tests/client.test.js` — + 7 tes: pilih tanggal, bentuk tugas = form lama, beberapa tanggal (deadline per tanggal, lewat tahun), banyak form + semua-atau-tidak, batas (konstanta sama dengan `Code.gs`), simpan → `Code.gs` (satu kirim, tiap tugas berdiri sendiri: centang/ubah/hapus satu), jam berurutan.
- `tests/e2e.test.js` — skenario E2E Tahap 4 (beberapa tanggal: pilih/batal/bulan lain/deadline/sheet, centang-hapus-edit satu tidak ikut yang lain, edit tanpa opsi banyak, urungkan, tanpa tanggal ditolak, matikan lagi; banyak form: ringkasan, jam berurutan, ganti kategori per form, beberapa tanggal di form tambahan, satu/dua form belum lengkap → tidak tersimpan, × + urungkan, maks 10 form, back HP & Batal bertanya, 360px tanpa geser samping, ukuran tap kalender) + E2E antrean >1000 op. Selektor `.opt-switch` di tes Tahap 2 diperjelas (`:has(#f-notime)`) karena sekarang ada dua switch.

Hasil: `npm run verify` lolos (check 128 id/67 data-act, typecheck 28 = baseline, **52 tes**). Dicek lewat tangkapan layar 390×844 dan 360×740.

Belum bisa diuji dari sesi: tampilan & keyboard di HP asli, kalender dan pilihan jarak deadline (`<select>`) dengan tampilan bawaan Android/iOS.

### Tahap 5 — Tugas dengan deadline lebih dari 1 hari (20 Nov 2026)

Poin 15. **Hanya `index.html` (dan tes) yang berubah; `Code.gs` tidak berubah (tidak perlu deploy server).** Tidak ada field data baru: rentang = `date` … `dlDate` (K1, Q1 Tahap 0).

Pertanyaan di awal tahap (dijawab user, semua opsi rekomendasi): hitungan saat lewat bulan, kurva per tanggal, efek "Beberapa tanggal". Lihat §6.

File diubah:
- `index.html`
  - `pt-lib` — fungsi rentang multi-hari (lihat §1): tampil di tanggal mana, hari ke berapa, kelompok per tanggal, tugas per bulan (bersinggungan), hitungan kurva sekali per tugas.
  - Home: daftar per tanggal memakai `L.byDay` (tugas multi-hari muncul di setiap tanggalnya di bulan itu), angka progres/chip = tugas unik. Kalender: jumlah per sel + daftar tanggal. Grafik: total/donut/ubin/per kategori = tugas unik per bulan; kurva + tabel + "Tanggal paling banyak" + "Hari aktif" = sekali per tugas, + catatan di bawah judul kurva. Riwayat kategori: tanggal ditulis sebagai rentang. Pencarian: satu baris per tugas + tanda "n hari". Pemilih bulan: jumlah per bulan ikut aturan bulan yang dilewati.
  - Item: tanda `.span-tag` "Hari 2/3" (kuning, paling depan). Detail: baris "Tanggal (multi-hari)" = rentang, jumlah hari, posisi hari ini, keterangan.
  - Form: `#f-dl-hint` sekarang dinamis — satu tanggal + deadline lebih lambat → "Tampil n hari (…) sebagai satu tugas…"; "Beberapa tanggal" + jarak > 0 → "Tiap tugas tampil n hari…". Diperbarui saat tanggal, tombol Hari ini/Besok/Lusa, deadline, atau jarak deadline berubah.
  - Centang dari baris mana pun → semua baris tugas itu ikut (animasi di semua baris). Edit/hapus berlaku untuk semua tanggal (memang satu data).
  - **Perbaikan bug lama** (§4 6e): Urungkan setelah centang tidak berpengaruh kalau sinkron sudah selesai.
- `tests/client.test.js` — + 7 tes: tampil di tanggal yang benar (termasuk lewat bulan/tahun, kabisat, deadline lebih awal/sama), urutan dalam satu tanggal, hitungan per bulan (bulan yang dilewati) + kelompok per tanggal, kurva sekali per tugas (jumlah kurva = jumlah tugas), centang/batal/edit/hapus tersinkron + tetap **satu baris** di `Code.gs`, efek "Beberapa tanggal", contoh mode coba.
- `tests/e2e.test.js` — skenario E2E Tahap 5 (Home: tanda per tanggal, angka 5 tugas dari 8 baris, "Hari ini"; centang di hari 2 → semua, server satu baris, Urungkan **setelah sinkron**, batal dari hari lain, filter Selesai; Kalender: jumlah per sel + bulan berikutnya; Grafik: total, tabel kurva, riwayat rentang, Desember; detail; edit nama + perpanjang deadline; hapus + urungkan; buat dari form + keterangan + tombol Besok; keterangan "Beberapa tanggal"; pencarian; pemilih bulan; muat ulang; 360px). Tes Tahap 4 & mode coba disesuaikan: tugas dengan deadline +1 hari / contoh multi-hari sekarang tampil di beberapa baris, jadi yang dihitung ID unik.

Hasil: `npm run verify` lolos (check 128 id/67 data-act, typecheck 28 = baseline, **60 tes**). Dicek lewat tangkapan layar 390×844 dan 360×740.

Dampak ke data nyata: 2 tugas lama yang deadline-nya lebih lambat (1→3 Nov, 1→20 Nov) sekarang tampil multi-hari (tugas 1→20 Nov muncul di 20 tanggal November). Sudah disetujui di Tahap 0.

Belum bisa diuji dari sesi: tampilan di HP asli, akun nyata dengan tugas 20 hari.

### Tahap 6 — Mode Edit dengan drag di kalender (20 Nov 2026)

Poin 14. **Hanya `index.html` (dan tes) yang berubah; `Code.gs` tidak berubah (tidak perlu deploy server).** Tidak ada field data baru: yang berubah hanya `date` dan `dlDate`.

Pertanyaan di awal tahap (dijawab user): deadline tugas 1 hari ikut geser, pindah bulan dengan menahan di ‹ ›, setelah dilepas pindah ke tanggal tujuan. Lihat §6.

File diubah:
- `index.html`
  - `pt-lib` — `shiftDates(t, dari, ke)` (lihat §1).
  - Kalender: tombol **Mode Edit** / **Selesai** di kepala daftar tanggal, petunjuk di bawah kalender, pegangan ⋮⋮ menggantikan centang. Tekan lama tugas → bayangan mengikuti jari, sel tujuan di-highlight (multi-hari: seluruh rentang barunya), label tanggal baru di bayangan, tahan di ‹ › untuk ganti bulan, halaman bergulir sendiri di tepi. Lepas → `moveTask`: tanggal + deadline bergeser dengan selisih hari yang sama, jam tetap, masuk antrean sinkron biasa (jalan offline), pop-up Urungkan (komponen Tahap 2, memakai `tasks[id]` saat ditekan), daftar pindah ke tanggal tujuan + tugas disorot + sel berkedip.
  - Touch: `touchstart` pasif + `touchmove`/`touchend` non-pasif di `#cal-day-list` — sebelum tekan lama tercapai gulir biasa tetap jalan (gerak > 10 px atau halaman mulai bergulir = batal), sesudahnya gulir dicegah. Mouse/pen: pointer event. Klik yang menyusul akhir drag diabaikan (tidak membuka detail). `contextmenu` (tekan lama HP) dicegah di daftar selama Mode Edit; CSS `user-select:none` + `-webkit-touch-callout:none`.
  - Selama menarik, render (sinkron selesai, render berkala tiap menit) hanya membuat ulang grid (highlight dipasang lagi), daftar ditunda sampai tugas dilepas — kalau elemen yang disentuh dibuang, browser berhenti mengirim gerakan jari (diuji: tanpa penundaan ini tes gagal).
  - Back HP / Esc / pindah menu / layar lain terbuka / aplikasi ke latar belakang / jari kedua → drag batal. Back saat Mode Edit (tanpa drag) → keluar Mode Edit dulu.
- `tests/client.test.js` — + 3 tes: tanggal pindah + jam tetap + deadline 1 hari ikut + field lain tidak disentuh; multi-hari (selisih dari baris "Hari n", lewat bulan/tahun/29 Feb, mundur, sama/tidak valid = null); `Code.gs`: tetap satu baris, kolom Tanggal/Hari/Deadline ikut, jam tetap, tugas selesai tetap selesai, urungkan kembali.
- `tests/e2e.test.js` — skenario E2E Tahap 6 dengan **sentuhan asli Chromium** (CDP `Input.dispatchTouchEvent`): tanpa Mode Edit tidak bisa drag; tombol + petunjuk + pegangan; tap = detail; 10→12 Nov (highlight, label, halaman tidak ikut bergulir, sel tujuan dipilih, tugas disorot, pop-up, server: Tanggal/Hari/jam/deadline); Urungkan setelah sinkron; multi-hari "Hari 2/3" → 14–16 Nov (rentang ditandai, + render berkala saat jari masih menarik); tugas selesai tanpa jam; lepas di tanggal asal / di luar = batal; geser cepat = gulir biasa; daftar panjang → gulir sendiri ke atas lalu lepas; tahan › → Desember + Urungkan; tahan ‹ lalu batal → kembali November; mouse; offline → antrean → online; back HP (batal drag → keluar Mode Edit → Tugas); pindah menu & tombol Selesai; Home; muat ulang; 360px.
- `tests/typecheck-baseline.json` — 28 → 27.

Hasil: `npm run verify` lolos (check 130 id/68 data-act, typecheck 27 = baseline baru, **64 tes**). Dicek lewat tangkapan layar 390×844 dan 360×740. Diuji juga dengan sengaja merusak kode (mutasi): tanpa `preventDefault` di touchmove → tes "halaman tidak ikut bergulir" gagal; daftar dirender ulang saat drag → tes gagal.

Belum bisa diuji dari sesi: HP asli (rasa tekan lama di Android/iOS, getar, menu tekan lama bawaan iOS Safari), stylus/pen, aksesibilitas (pembaca layar/keyboard tidak punya alternatif drag; ganti tanggal tetap bisa lewat Edit).

### Tahap 7 — Tampilan Time Blocking (20 Nov 2026)

Poin 16. **Hanya `index.html` (dan tes) yang berubah; `Code.gs` tidak berubah (tidak perlu deploy server).** Tidak ada field data baru: jam mulai/selesai (`start`/`end`, durasi bawaan 1 jam) dan rentang multi-hari sudah ada.

Pertanyaan di awal tahap (dijawab user, semua opsi rekomendasi): pemilih hari, lewat tengah malam, centang dari blok. Pertanyaan susulan: letak tombol pilihan tampilan (lihat §6).

File diubah:
- `index.html`
  - `pt-lib` — `DAY_MIN`, `tbItems`, `tbLayout`, `weekDays`, `tbScrollMin` (lihat §1). Susunan blok = fungsi murni yang diuji di Node.
  - Menu Tugas: tombol ikon pilihan tampilan di kepala halaman (diingat di HP), tampilan Time Blocking: strip 7 hari + ‹ › yang menempel di bawah kepala halaman + ringkasan hari ("Hari ini, 10 Nov · 10 tugas, 2 selesai", "↑ n tanpa jam"), area "Tanpa jam" (baris tugas biasa, bisa dicentang), garis waktu 00:00–24:00 dengan blok berwarna kategori di jam mulainya setinggi durasinya, yang bertabrakan berdampingan, garis "sekarang", tanda multi-hari / lewat deadline / lanjut besok / lanjutan dari kemarin, tombol centang di blok ≥ 45 menit, tap blok = detail.
  - Navigasi: FAB + memakai hari yang tampil, simpan/edit kembali ke hari tugas itu + blok disorot, pemilih bulan, pindah menu, muat ulang (tetap Time Blocking, hari ini, di sekitar jam sekarang), ganti akun (hari kembali ke hari ini).
  - Kepala halaman ≤ 400 px: ikon 40 px dan judul 19 px supaya 4 tombol + judul muat (≤ 374 px tetap 18 px seperti dulu).
- `tests/client.test.js` — + 6 tes: isi satu hari (tanpa jam, durasi bawaan, durasi 0, hanya jam selesai), multi-hari di jam yang sama (K3), lewat tengah malam (potong + lanjutan, tepat 00:00, 23 jam 59 mnt, multi-hari, ganti tahun), susunan blok (bersambung, dua/tiga bertabrakan, rantai, kelompok baru, tugas panjang, melebar, tinggi minimal, urutan stabil, masukan tidak diubah/rusak), 300 susunan acak (blok yang beririsan tidak pernah berbagi kolom), strip Senin–Minggu + gulir awal.
- `tests/e2e.test.js` — skenario E2E Tahap 7: bawaan To Do List + tombol di kepala halaman; ganti → Time Blocking (daftar & filter hilang, disimpan di HP, pesan); strip (hari ini, titik, Sen–Min); Tanpa jam (termasuk "s/d 17:00") di atas garis waktu; 25 garis jam; posisi + tinggi 8 blok; Hari 2/3; lewat tengah malam + lanjutan kemarin; selesai; lewat deadline; blok pendek satu baris; centang hanya ≥ 45 mnt; tidak ada blok yang bertumpuk; lebar penuh & melebar; garis sekarang + gulir awal ±08:15; "↑ tanpa jam"; strip tetap menempel; centang dari blok + Urungkan **setelah sinkron**; tap blok = detail + back HP; multi-hari dicentang di 10 Nov ikut tercentang di 11 Nov (server satu baris); ‹ › lewat minggu, hari kosong, tanpa garis sekarang; pemilih bulan (Desember) + ‹ kembali ke November; FAB + di 12 Nov → blok baru di 14:00 disorot + tersimpan; muat ulang tetap Time Blocking di sekitar jam sekarang; pindah menu; 360 px (tanpa geser samping, judul tidak tertabrak, strip ≥ 40 px); pop-up Urungkan tidak ditimpa pesan ganti tampilan; kembali ke To Do List (diingat); mode coba tidak menulis localStorage.
- `tests/typecheck-baseline.json` — 27 → 26 (`row.dataset.id` di listener klik diganti `getAttribute('data-id')`).

Hasil: `npm run verify` lolos (check 135 id/72 data-act, typecheck index.html 26 (baseline 27 → 26), **71 tes**). Dicek lewat tangkapan layar 390×844, 375×667, dan 360×740. Diuji juga dengan sengaja merusak `tbLayout` (mutasi): blok selalu melebar → tes susunan + tes acak gagal; kelompok ditutup terlambat → tes susunan gagal.

Belum bisa diuji dari sesi: HP asli (rasa gulir garis waktu, strip yang menempel di Safari iOS, ukuran teks blok di layar kecil), akun nyata dengan tugas "Jam Kerja 01:00–23:00" (sudah ditiru di tes: satu kolom penuh, tugas lain di sampingnya).

### Tahap 8 — Tugas vs Kegiatan (20 Nov 2026)

Poin 17. **Hanya `index.html` (dan tes) yang berubah; `Code.gs` tidak berubah (tidak perlu deploy server).** Tidak ada field data baru: `kind` dan `parent` (kolom Jenis + Kegiatan induk) sudah disiapkan di Tahap 1, dan aturan server (kegiatan tidak bisa dicentang, induk yang hilang dilepas) sudah ada di `cleanTask_`/`normRows_`.

Pertanyaan di awal tahap (dijawab user, semua opsi rekomendasi): kegiatan dipindah → tugasnya ikut; form Kegiatan = rencana + "Beberapa tanggal"; jenis bisa diubah saat Edit. Lihat §6.

File diubah:
- `index.html`
  - `pt-lib` — bagian baru "Tugas vs Kegiatan" (lihat §1): hitungan tanpa kegiatan, induk yang berlaku, susunan tugas di bawah kegiatannya (`nest`), K6, pindah kegiatan + tugasnya, hapus kegiatan (ikut/dikeluarkan), `serverRules` untuk mode coba; `tbItems().bg` + `tbLabelAt`; `draftFields`/`draftErrors`/`buildBatch` mengenal `kind` + `parent`; contoh kegiatan di `demoSeed`.
  - Form: pilihan Tugas | Kegiatan di layar + (dulu tab kelompok kategori) dan di atas form; grid kategori tanpa saringan kelompok; form kegiatan menyembunyikan isian khusus tugas; "Masuk ke kegiatan" + peringatan K6; Edit bisa mengubah jenis (+ keterangan akibatnya); simpan memeriksa lagi kegiatan induk (`parentOk`).
  - Tampilan: kartu kegiatan + tugasnya (buka-tutup) di To Do List, Kalender, pencarian; Time Blocking: kegiatan = blok latar, tugas di atasnya, label di celah pertama; detail kegiatan; semua angka tanpa kegiatan; Grafik tanpa kegiatan + satu "Lainnya".
  - Aksi: hapus kegiatan dengan dialog 3 pilihan (`confirmBox` + pilihan ketiga) + Urungkan; drag kalender untuk kegiatan (tugasnya ikut) dan untuk tugas di dalam kegiatan (keluar dari kegiatan); ganti tanggal kegiatan lewat Edit → tugasnya ikut; kegiatan tidak bisa dicentang (`toggleDone` menolak).
  - Perbaikan kecil: keterangan kalender boleh turun baris dan sedikit lebih rapat di layar ≤ 380 px (dengan item "kegiatan" tetap satu baris di 360 px).
- `tests/client.test.js` — + 8 tes: hitungan & induk, susunan di daftar + filter, K6, pindah kegiatan/tugas, alur lengkap ke `Code.gs` (simpan, centang kegiatan ditolak, pindah, hapus keluarkan/ikut + urungkan, server melepas induk sendiri), simpan dari form (jam wajib, beberapa tanggal, induk dilepas, campuran), Time Blocking latar + label, mode coba = `Code.gs` (serverRules).
- `tests/e2e.test.js` — skenario E2E Tahap 8 (data awal: kartu kegiatan tanpa centang + tugasnya + angka; buat kegiatan dari + termasuk jam wajib; masuk ke kegiatan: chip, autocomplete, K6, beberapa tanggal, ganti tanggal; detail kegiatan → tambah tugas + banyak form; progres setelah centang; buka-tutup + muat ulang; filter Belum/Selesai; Time Blocking: posisi latar/tugas, geser 12 px, label di celah, tap latar; Kalender: jumlah, garis kegiatan, keterangan; drag kegiatan (+3 tugas) & drag tugas di dalamnya, keduanya dengan Urungkan setelah sinkron; Grafik tanpa kegiatan + satu "Lainnya" + riwayatnya; Edit ubah jenis tugas lama selesai → kegiatan; keterangan kegiatan → tugas; ganti tanggal kegiatan lewat Edit; hapus kegiatan: konfirmasi biasa / 3 pilihan, keluarkan + urungkan, hapus semua + urungkan; 360 px; mode coba). Tes Tahap 3 memakai pemilih jenis baru (`data-k`).
- `tests/typecheck-baseline.json` — 26 → 25.

Hasil: `npm run verify` lolos (check 144 id/77 data-act, typecheck index.html 25, **80 tes**). Dicek lewat tangkapan layar 390×844 dan 360×740. Diuji juga dengan sengaja merusak kode (mutasi): kegiatan dipindah tanpa tugasnya → 2 tes gagal; label TB selalu di awal → tes label gagal; `nest` tidak menaruh tugas di bawah kegiatannya → tes daftar gagal.

Cek ulang fitur Tahap 2 & 4 di mode Tugas (rencana): saran nama, "Beberapa tanggal", dan banyak form diuji lagi di E2E Tahap 8; E2E Tahap 2 & 4 lama tetap lolos tanpa diubah.

Belum bisa diuji dari sesi: HP asli (rasa tekan lama kartu kegiatan, tampilan chip "Masuk ke kegiatan" dengan nama panjang, warna latar kegiatan di layar HP), akun nyata (tugas lama "Jam Kerja" tetap Tugas sampai diubah sendiri lewat Edit).
