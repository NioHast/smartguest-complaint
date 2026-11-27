# SmartGuest Complaint — Hasil Uji Black-Box

Dokumen ini berisi hasil eksekusi nyata (bukan template) pada satu build produksi.

## Identitas eksekusi

| Item | Nilai |
| --- | --- |
| Tanggal eksekusi | 27 November 2026 |
| Commit | `4520514` — refactor(ui): jadikan tab sebagai route nyata dengan shell bersama |
| Build | Produksi, `npm run build` berhasil (Next.js 16.2.6, 12 halaman statis) |
| Server uji | `next start -p 3147` (setara `npm start -- -p 3147`) |
| Database | Sementara lewat `SMARTGUEST_DB_PATH` di folder temp; seed otomatis 15 keluhan (5 baru, 5 diproses, 5 selesai) |
| Node / npm | v26.13.0 / 11.20.0 |
| OS | Windows 11 10.0.22631 (win32 x64) |
| Browser | Microsoft Edge headless (CDP) untuk halaman yang dirender klien: `/dasbor`, `/qr`, `/tamu` |
| AI | API asli lewat `AI_BASE_URL` + `AI_MODEL` di `app/.env`; key tidak dicetak di dokumen/log |
| Hasil | **30 skenario, 30 PASS, 0 FAIL** |

Catatan: pohon kerja saat pengujian memiliki perubahan tak terkait dari lane lain (penambahan skrip `eval` di `app/package.json`); perubahan itu tidak menyentuh kode aplikasi `src/**` yang diuji.

## Ringkasan

| Kelompok | Skenario | PASS | FAIL |
| --- | ---: | ---: | ---: |
| Autentikasi | 4 | 4 | 0 |
| Input keluhan (petugas) | 4 | 4 | 0 |
| Input tamu (publik) | 5 | 5 | 0 |
| Klasifikasi AI | 3 | 3 | 0 |
| Alur status | 3 | 3 | 0 |
| Koreksi kategori | 3 | 3 | 0 |
| QR | 4 | 4 | 0 |
| Notifikasi | 2 | 2 | 0 |
| Dashboard | 2 | 2 | 0 |
| **Total** | **30** | **30** | **0** |

Data awal sebelum skenario yang menulis: 15 keluhan seed (status 5 baru, 5 diproses, 5 selesai; kategori final 4 teknisi, 3 fnb, 3 resepsionis, 3 perlu ditinjau, 2 kebersihan). Setelah 9 skenario yang membuat keluhan: 24 keluhan. Angka dashboard pada BB-28 dihitung pada kondisi akhir ini.

## Detail per kelompok

### Autentikasi

| ID | Tujuan | Prasyarat | Langkah | Hasil yang diharapkan | Hasil aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-01 | Login petugas dengan kredensial benar | Database seed (akun staff@smartguest.local / password). | POST /api/auth {"email":"staff@smartguest.local","password":"password"}. | HTTP 200, session.user.email = staff@smartguest.local, Set-Cookie smartguest_session HttpOnly. | HTTP 200; email=staff@smartguest.local; cookie=ada, HttpOnly; nama=Intan Permata | **PASS** | — |
| BB-02 | Login dengan password salah | Akun seed ada. | POST /api/auth dengan password salah. | HTTP 401 dan pesan generik; tidak ada cookie sesi. | HTTP 401; error="Email atau kata sandi salah. Gunakan akun demo (mis. staff@smartguest.local / password)."; set-cookie=0 | **PASS** | — |
| BB-03 | Akses halaman aplikasi & API tanpa sesi | Tidak mengirim cookie sesi. | GET /dasbor; GET /api/complaints. | Halaman dialihkan ke /login (307); API 401 tanpa data. | GET /dasbor → HTTP 307, Location=/login; GET /api/complaints → HTTP 401 {"error":"Sesi berakhir. Silakan masuk kembali."} | **PASS** | — |
| BB-04 | Halaman tamu dapat diakses tanpa sesi | Tanpa cookie sesi (server); browser memakai cookie sesi petugas untuk memeriksa render form. | GET /tamu; muat /tamu di browser headless. | HTTP 200 (tidak dialihkan ke /login); form "Sampaikan Keluhan Anda" tampil. | HTTP 200; browser: form tampil=true, textarea=1 | **PASS** | — |

### Input keluhan (petugas)

| ID | Tujuan | Prasyarat | Langkah | Hasil yang diharapkan | Hasil aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-05 | Input keluhan valid lewat jalur petugas | Sesi petugas aktif. | POST /api/complaints channel front_desk, teks valid, kamar 221. | HTTP 201; keluhan tersimpan status baru; teks & kanal sesuai. | HTTP 201; id=a3bbcd68; status=baru; kanal=front_desk; kategori=teknisi | **PASS** | — |
| BB-06 | Input keluhan dengan teks kosong/spasi | Sesi petugas aktif. | POST /api/complaints raw_text=" ". | HTTP 400 "Teks keluhan wajib diisi."; tidak tersimpan. | HTTP 400; error="Teks keluhan wajib diisi." | **PASS** | — |
| BB-07 | Input keluhan 2500 karakter | Sesi petugas aktif. | POST /api/complaints raw_text 2500 karakter. | HTTP 400, pesan batas 2000 karakter; tidak tersimpan/terpotong diam-diam. | HTTP 400; error="Teks keluhan maksimal 2000 karakter." | **PASS** | — |
| BB-08 | Input keluhan dengan kanal tidak valid | Sesi petugas aktif. | POST /api/complaints channel="pager". | HTTP 400 "Kanal tidak valid"; tidak tersimpan. | HTTP 400; error="Kanal tidak valid. Gunakan front_desk, qr, phone, whatsapp, email, atau other." | **PASS** | — |

### Input tamu (publik)

| ID | Tujuan | Prasyarat | Langkah | Hasil yang diharapkan | Hasil aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-09 | Tamu mengirim keluhan tanpa sesi (valid) | Tidak mengirim cookie sesi. | POST /api/public/complaints teks valid, kamar 102, nama Sari. | HTTP 201; respons {id, status:baru}; tidak butuh sesi. | HTTP 201; id=5e8339e5; status=baru | **PASS** | — |
| BB-10 | Tamu mengirim teks keluhan kosong | Tanpa sesi. | POST /api/public/complaints raw_text="". | HTTP 400 "Teks keluhan wajib diisi.". | HTTP 400; error="Teks keluhan wajib diisi." | **PASS** | — |
| BB-11 | Nomor kamar mengandung spasi | Tanpa sesi. | POST /api/public/complaints room_number="10 1". | HTTP 400; nomor kamar hanya huruf/angka/tanda hubung. | HTTP 400; error="Nomor kamar hanya boleh berisi huruf, angka, dan tanda hubung." | **PASS** | — |
| BB-12 | Nama tamu lebih dari 80 karakter | Tanpa sesi. | POST /api/public/complaints guest_name 81 karakter. | HTTP 400; nama tamu maksimal 80 karakter. | HTTP 400; error="Nama tamu maksimal 80 karakter." | **PASS** | — |
| BB-13 | Entitas berbahaya &lt;script&gt; disimpan sebagai teks | Tanpa sesi. | POST /api/public/complaints raw_text="&lt;script&gt;window.__xss=1&lt;/script&gt;&lt;b&gt;tes&lt;/b&gt;". | HTTP 201; teks tersimpan apa adanya (escaping dilakukan saat render, bukan saat simpan). | HTTP 201; id=26513206; tersimpan identik=true; created_by=guest; channel=qr | **PASS** | Eksekusi/escaping di UI diperiksa pada BB-29 lewat browser. |

### Klasifikasi AI

| ID | Tujuan | Prasyarat | Langkah | Hasil yang diharapkan | Hasil aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-14 | Teks keluhan AC panas diklasifikasi teknisi | Sesi petugas aktif; AI_API_KEY terisi di app/.env. | POST /api/complaints teks "AC ... mati total ... kamar sangat panas". | Kategori teknisi, departemen engineering, tersimpan. | HTTP 201; ai_category=teknisi; category=teknisi; department=engineering; confidence=0.98; alasan="Keluhan tentang AC mati total termasuk kategori teknisi." | **PASS** | — |
| BB-15 | Teks keluhan handuk/sprei kotor diklasifikasi kebersihan | Sesi petugas aktif; AI_API_KEY terisi. | POST /api/complaints teks "Handuk ... kotor dan sprei ... bernoda". | Kategori kebersihan, departemen housekeeping, tersimpan. | HTTP 201; ai_category=kebersihan; category=kebersihan; department=housekeeping; confidence=0.98; alasan="Keluhan tentang handuk kotor dan sprei bernoda termasuk masalah kebersihan kamar." | **PASS** | — |
| BB-30 | AI tanpa key: keluhan tetap tersimpan sebagai Perlu Ditinjau → Duty Manager | Server dijalankan ulang dengan environment proses AI_API_KEY= (kosong); database sementara baru. | GET /api/ai-status; POST /api/public/complaints; GET /api/complaints/{id}. | ai-status configured=false; POST tetap HTTP 201; ai_category=perlu_ditinjau; category=perlu_ditinjau; department=duty_manager; alasan menyebut AI belum dikonfigurasi. | login=200; ai-status={"configured":false,"model":"deepseek-chat"}; POST=201; ai_category=perlu_ditinjau; category=perlu_ditinjau; department=duty_manager; alasan="AI belum dikonfigurasi." | **PASS** | Simulasi tanpa key diverifikasi lewat endpoint status agar bukan asumsi. |

### Alur status

| ID | Tujuan | Prasyarat | Langkah | Hasil yang diharapkan | Hasil aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-16 | Transisi baru → diproses → selesai | Keluhan baru hasil input tamu. | PATCH /api/complaints/{id} action=status diproses; lalu selesai. | Kedua PATCH HTTP 200; status akhir selesai; resolved_at terisi. | PATCH diproses → HTTP 200/diproses; PATCH selesai → HTTP 200/selesai; resolved_at=terisi | **PASS** | — |
| BB-17 | Transisi baru → selesai ditolak | Keluhan berstatus baru. | PATCH action=status status=selesai langsung dari baru. | HTTP 400; status tetap baru. | HTTP 400; error="Transisi status dari Baru ke Selesai tidak diizinkan."; status setelah=baru | **PASS** | — |
| BB-18 | Mengubah status ke status yang sama ditolak | Keluhan berstatus baru. | PATCH action=status status=baru. | HTTP 400 "Status keluhan sudah Baru."; tidak ada perubahan. | HTTP 400; error="Status keluhan sudah Baru." | **PASS** | — |

### Koreksi kategori

| ID | Tujuan | Prasyarat | Langkah | Hasil yang diharapkan | Hasil aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-19 | Alasan koreksi kurang dari 10 karakter ditolak | Keluhan baru (kategori awal dari AI). | PATCH action=change kategori kebersihan, reason="salah" (5 karakter). | HTTP 400 "minimal 10 karakter"; kategori tidak berubah. | HTTP 400; error="Alasan perubahan wajib diisi minimal 10 karakter."; kategori sebelum=teknisi; sesudah=teknisi | **PASS** | — |
| BB-20 | Koreksi kategori dengan alasan valid tersimpan | Keluhan baru dari BB-19. | PATCH action=change kategori fnb, alasan 53 karakter. | HTTP 200; category=fnb; change_reason tersimpan; log verifikasi_ubah tercatat. | HTTP 200; category=fnb; change_reason="Hasil AI tidak tepat; ini masalah makanan dan minuman."; status=diproses | **PASS** | — |
| BB-21 | Departemen mengikuti kategori hasil koreksi | Koreksi BB-20 tersimpan. | GET /api/complaints/{id} lalu periksa department. | department=fnb (pemetaan fnb → fnb), konsisten dengan category=fnb. | HTTP 200; category=fnb; department=fnb | **PASS** | — |

### QR

| ID | Tujuan | Prasyarat | Langkah | Hasil yang diharapkan | Hasil aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-22 | Halaman /qr tanpa parameter memakai 3 kamar default | Sesi petugas aktif; halaman dimuat di browser. | Buka /qr. | 3 kartu QR; teks "3 kamar"; URL tamu kamar 101/102/103. | Kartu=3; header="3 kamar"; rooms=["101","102","103"] | **PASS** | — |
| BB-23 | Halaman /qr dengan tiga kamar pilihan | Sesi petugas aktif; halaman dimuat di browser. | Buka /qr?kamar=101,102,305. | 3 kartu; "3 kamar"; hanya 101/102/305. | Kartu=3; header="3 kamar"; rooms=["101","102","305"] | **PASS** | — |
| BB-24 | Entri kamar tidak valid dibuang | Sesi petugas aktif; halaman dimuat di browser. | Buka /qr?kamar=101,%20abc%20def,102,@@@, | Hanya 101 dan 102 valid; entri " abc def", "@@@" dan kosong dibuang; 2 kartu. | Kartu=2; header="2 kamar"; rooms=["101","102"] | **PASS** | — |
| BB-25 | Daftar lebih dari 60 kamar dipotong | Sesi petugas aktif; halaman dimuat di browser. | Buka /qr?kamar=201,...,261 (61 kamar). | 60 kartu; "60 kamar"; pesan "Menampilkan 60 kamar pertama"; kamar ke-61 (261) tidak dirender. | Kartu=60; header="60 kamar"; room pertama=201; room terakhir=260; 261 ada=false; pesan potong=true | **PASS** | — |

### Notifikasi

| ID | Tujuan | Prasyarat | Langkah | Hasil yang diharapkan | Hasil aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-26 | Tes Telegram tanpa token dikembalikan skipped | Sesi petugas aktif; TELEGRAM_BOT_TOKEN kosong. | POST /api/telegram/test. | HTTP 200 {ok:true,sent:false,skipped:"not-configured"}. | HTTP 200; body={"ok":true,"sent":false,"skipped":"not-configured"} | **PASS** | — |
| BB-27 | Tes Telegram tanpa sesi ditolak | Tanpa cookie sesi. | POST /api/telegram/test. | HTTP 401 "Sesi berakhir..."; tidak mengirim pesan. | HTTP 401; error="Sesi berakhir. Silakan masuk kembali." | **PASS** | — |

### Dashboard

| ID | Tujuan | Prasyarat | Langkah | Hasil yang diharapkan | Hasil aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BB-28 | Angka kartu ringkasan sesuai data API | Sesi petugas aktif; dashboard dimuat di browser headless. | Bandingkan kartu Total/Baru/Diproses/Selesai/Kategori Perlu Ditinjau dengan GET /api/complaints. | Kelima angka identik dengan hitungan data saat itu. | Browser: Total=24, Baru=12, Diproses=6, Selesai=6, Perlu Ditinjau=5; API: {"Total":24,"Baru":12,"Diproses":6,"Selesai":6,"Kategori Perlu Ditinjau":5} | **PASS** | — |
| BB-29 | Badge "Tamu"/kanal "QR Kamar" dan escaping teks berbahaya | Keluhan tamu terbaru (BB-13) ada di daftar 5 terbaru. | Muat /dasbor di browser headless; periksa baris terbaru, textContent, window.__xss. | Baris terbaru memuat badge "Tamu" dan kanal "QR Kamar"; teks &lt;script&gt; tampil sebagai teks; skrip tidak dieksekusi. | Baris terbaru="777 QR Kamar ¦ TAMU ¦ &lt;script&gt;window.__xss=1&lt;/script&gt;&lt;b&gt;tes&lt;/b&gt; Perlu Ditinjau · Duty Manager ¦ BARU"; teks &lt;script&gt; tampil=true; window.__xss=null; script match=0 | **PASS** | Badge memakai CSS uppercase sehingga innerText tampil TAMU; teks asli badge adalah Tamu. |

## Keterbatasan pengujian

- **API AI asli, bukan mock.** Klasifikasi memakai provider DeepSeek melalui `app/.env`. Hasil kategori dapat berubah bila model, prompt, atau penyedia berubah; ketergantungan jaringan juga nyata. Key tidak pernah dicetak.
- **Database seed.** Pengujian memakai database sementara yang di-seed otomatis (15 keluhan demo, `SEED_MODE=static`), bukan data produksi. Angka absolut dashboard karena itu spesifik untuk seed ini.
- **Tanpa rate limit.** Aplikasi saat ini tidak memiliki limiter pada login, pembuatan keluhan, maupun klasifikasi; perilaku 429/Retry-After tidak diuji.
- **Tanpa uji beban.** Tidak ada pengujian konkurensi, throughput, atau latensi di bawah beban; waktu klasifikasi AI hanya teramati secara fungsional.
- **Tidak diuji di perangkat mobile fisik.** Tampilan QR, form tamu, dan dashboard hanya diperiksa di Edge headless desktop (viewport 1400x1200). Pemindaian QR dengan kamera dan hasil cetak tidak diuji.
- **Kegagalan provider AI tidak disimulasikan** (HTTP 5xx, timeout, output tidak valid). Yang diuji hanya jalur tanpa key (BB-30) dan jalur sukses dengan key asli.
- **Browser terbatas pada Edge/Chromium.** Firefox, Safari, dan browser mobile tidak diuji.
- **Halaman aplikasi bergantung pada JavaScript.** HTML awal `/dasbor` dan `/qr` hanya memuat status "Memeriksa sesi petugas..." karena shell `(app)` adalah komponen klien; kartu QR dan angka dashboard baru muncul setelah hidrasi. Pengujian konten karena itu memakai browser headless, dan halaman QR tidak dapat dicetak dengan JavaScript dimatikan.
- **Sesi dan keamanan.** Uji autentikasi bersifat fungsional (cookie HttpOnly, redirect, 401); tidak ada uji CSRF, fixation, atau audit keamanan menyeluruh.
