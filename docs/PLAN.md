# SmartGuest Complaint — Rencana Implementasi

> Dokumen ini mencerminkan implementasi per **27 November 2026**, bukan rencana
> scope lama. Isi yang tidak ada di kode dan `app/schema.sql` tidak diklaim ada.
> Hasil evaluasi klasifikasi ditulis ke `eval/results/summary.md`; dokumen ini
> tidak memuat angka hasil.

- Konteks: tugas Transformasi Digital, MSI Undip 2026; aplikasi akademik lokal,
  bukan sistem produksi.
- Prinsip: **AI mengusulkan kategori, petugas tetap dapat mengoreksi.**

## 1. Ringkasan

SmartGuest mencatat keluhan tamu hotel dari dua jalur: tamu memindai QR kamar
dan mengirim sendiri, atau petugas mencatat setelah login. Saat keluhan dibuat,
sistem meminta klasifikasi AI untuk memilih satu dari lima kategori, lalu
menetapkan departemen secara otomatis. Petugas dapat mengoreksi kategori bila
perlu, memproses, dan menyelesaikan keluhan; dasbor menampilkan rekap status
dan kategori.

Tidak ada mesin klasifikasi berbasis aturan dan tidak ada jalur klasifikasi
alternatif. Bila AI tidak dikonfigurasi atau gagal, keluhan tetap tersimpan
sebagai `perlu_ditinjau` dan diteruskan ke Duty Manager untuk ditangani manual.

## 2. Arsitektur

| Bagian | Implementasi |
| --- | --- |
| Framework | Next.js 16.2.6 App Router, React 19.2.4, TypeScript, Tailwind CSS 4 |
| Database | SQLite lokal lewat `node:sqlite` (`DatabaseSync`), tanpa ORM |
| Berkas database | `app/data/smartguest.db`, dapat diganti `SMARTGUEST_DB_PATH` |
| Skema | `app/schema.sql`, dijalankan otomatis saat koneksi pertama (`CREATE TABLE IF NOT EXISTS`) |
| Autentikasi | Tabel `users` + `sessions`, password scrypt, cookie `smartguest_session` httpOnly (7 hari) |
| AI | SDK `openai` ke endpoint OpenAI-compatible; default DeepSeek `deepseek-chat` |
| Notifikasi | Bot Telegram opsional, best-effort setelah respons |
| UI | Shell bersama di `(app)` untuk `/dasbor`, `/catat`, `/keluhan`, `/qr`; `/login` dan `/tamu` di luar shell |

Halaman dan route nyata:

| Route | Akses | Isi |
| --- | --- | --- |
| `/` | Publik | Redirect ke `/dasbor` |
| `/login` | Publik | Form login petugas dan tombol akun demo |
| `/dasbor` | Sesi petugas | Ringkasan status, rekap kategori, keluhan terbaru |
| `/catat` | Sesi petugas | Form catat keluhan dan panel rekomendasi AI |
| `/keluhan` | Sesi petugas | Tabel keluhan, pencarian, filter status/kategori, detail |
| `/qr` | Sesi petugas | Cetak QR kamar (default 101, 102, 103; maksimum 60 kamar) |
| `/tamu` | Publik | Form keluhan tamu dari QR, tanpa login |

Route API: `POST/GET /api/auth`, `GET /api/ai-status`, `GET/POST /api/complaints`,
`GET/PATCH /api/complaints/[id]`, `POST /api/public/complaints`,
`GET /api/health`, dan `POST /api/telegram/test`.
`proxy.ts` hanya memeriksa keberadaan cookie; validasi sesi sebenarnya dilakukan
route API lewat tabel `sessions`.

## 3. Model data aktual

Skema aktual hanya memiliki lima tabel berikut; tidak ada tabel tambahan untuk
percobaan klasifikasi atau pencatatan biaya AI.

```text
users(id, email, password_hash, full_name, created_at)
sessions(token, user_id, expires_at, created_at)
complaints(id, guest_name, room_number, channel, raw_text, ai_category,
           ai_confidence, ai_reason, category, department, status, verified_by,
           verified_at, change_reason, created_by, created_at, updated_at,
           resolved_at)
complaint_analysis(id, complaint_id, ai_response_raw, created_at)
activity_logs(id, complaint_id, actor, action, detail, created_at)
```

Catatan penting:

- `channel`: `front_desk`, `qr`, `phone`, `whatsapp`, `email`, `other`.
  WhatsApp hanyalah label kanal, bukan integrasi pesan.
- `ai_category` dan `category`: `kebersihan`, `teknisi`, `fnb`, `resepsionis`,
  `perlu_ditinjau`. `department`: `housekeeping`, `engineering`, `fnb`,
  `front_office`, `duty_manager`. `status`: `baru`, `diproses`, `selesai`.
- `created_by` berisi id petugas, atau sentinel `guest` untuk jalur QR; karena
  itu kolom ini sengaja bukan foreign key. `verified_by` berisi nama petugas.
- `complaint_analysis.ai_response_raw` menyimpan JSON hasil klasifikasi.
  `activity_logs.action` yang dipakai: `keluhan_dicatat`, `verifikasi_ubah`,
  `status_diubah`.
- Index tersedia untuk `sessions.user_id`, `complaints.created_at`,
  `complaints.status`, `complaints.category`, dan `activity_logs.complaint_id`.

## 4. Alur

### 4.1 Jalur tamu (QR)

1. Petugas membuka `/qr?kamar=302` dan mencetak halaman QR.
2. Tamu memindai QR, membuka `/tamu?kamar=302`, menulis keluhan, lalu mengirim.
   Form memanggil `POST /api/public/complaints` tanpa sesi. Validasi: teks wajib
   1-2000 karakter setelah trim; nomor kamar maksimal 10 karakter dengan pola
   huruf/angka/tanda hubung; nama tamu maksimal 80 karakter.
3. Sistem mencoba klasifikasi AI dari teks keluhan; nama tamu dan nomor kamar
   tidak dikirim ke model. Keluhan disimpan dengan `channel = qr`, `created_by =
   guest`, status `baru`, kategori dan departemen otomatis, plus
   `complaint_analysis` dan log.
4. Respons `201` hanya berisi `{ id, status }` agar tamu mendapat nomor referensi.
   Bila Telegram dikonfigurasi, notifikasi dikirim setelah respons.

### 4.2 Jalur petugas

1. Petugas login lewat `/login`; cookie sesi dipakai untuk semua route internal.
2. Petugas membuka `/catat`, mengisi teks, nama/kamar opsional, dan memilih kanal.
   `POST /api/complaints` mewajibkan sesi, memvalidasi dengan aturan yang sama,
   lalu menjalankan klasifikasi dan penyimpanan seperti jalur tamu.
3. `created_by` berisi id petugas dan `actor` log berisi nama petugas. Petugas
   melihat daftar di `/keluhan`, membuka detail, dan memakai panel rekomendasi AI.

### 4.3 Klasifikasi dan kegagalan AI

- AI bersifat opsional sebagai dependensi eksternal. Tanpa `AI_API_KEY`,
  klasifikasi tidak dipanggil dan keluhan disimpan sebagai `perlu_ditinjau`
  dengan `ai_confidence = 0` serta alasan "AI belum dikonfigurasi."
- Error provider, timeout, atau output tidak valid juga menghasilkan
  `perlu_ditinjau` dengan alasan yang menyebut penyebabnya.
- Timeout 7 detik, tanpa retry otomatis, suhu 0, maksimal 200 token. Output wajib
  JSON valid dengan kategori enum; confidence dijepit ke 0-1.
- Klasifikasi berjalan di dalam permintaan (sebelum insert), bukan job asinkron;
  respons dapat menunggu hingga sekitar 7 detik. Tidak ada jalur klasifikasi
  alternatif, hybrid, atau klasifikasi ulang otomatis.

### 4.4 Koreksi kategori

- Koreksi bersifat opsional. Awalnya kategori dan departemen sudah terisi.
- `PATCH /api/complaints/[id]` dengan `action = "change"` wajib alasan minimal
  10 karakter setelah trim. Kategori harus salah satu dari lima enum;
  departemen selalu diturunkan dari kategori, dan nilai berbeda ditolak.
- Keluhan berstatus `selesai` tidak dapat dikoreksi.
- Koreksi menyimpan `verified_by`, `verified_at`, `change_reason`, log
  `verifikasi_ubah`, dan menaikkan status `baru` menjadi `diproses`.

### 4.5 Status

- Transisi yang diizinkan hanya `baru -> diproses -> selesai`; tidak ada
  rollback, lompatan `baru -> selesai`, atau status yang sama.
- `PATCH` dengan `action = "status"` menulis log `status_diubah`; status
  `selesai` mengisi `resolved_at`. Tidak ada auto-close; semua perubahan status
  adalah aksi petugas.

## 5. Fitur

Enam fitur deck:

1. Input keluhan tervalidasi (petugas dan tamu).
2. Klasifikasi otomatis lima kategori.
3. Koreksi/verifikasi kategori oleh petugas (opsional, beralasan).
4. Penentuan departemen otomatis dari kategori.
5. Status penanganan `baru`, `diproses`, `selesai`.
6. Ringkasan dashboard (total, per status, per kategori, keluhan terbaru).

Fitur pendukung: QR kamar, notifikasi Telegram opsional, serta pencarian/filter di
`/keluhan` (teks, status, kategori).

| Kategori | Label UI | Departemen |
| --- | --- | --- |
| `kebersihan` | Kebersihan Kamar | `housekeeping` |
| `teknisi` | Teknisi & Fasilitas | `engineering` |
| `fnb` | Makanan & Minuman | `fnb` |
| `resepsionis` | Resepsionis | `front_office` |
| `perlu_ditinjau` | Perlu Ditinjau | `duty_manager` |

Pemetaan ini tetap dan dipakai otomatis; petugas tidak memilih departemen
secara terpisah agar kategori dan departemen tidak bertentangan.

## 6. Keputusan teknis

| Keputusan | Alasan |
| --- | --- |
| Next.js App Router + TypeScript | Satu bahasa untuk UI dan route server; struktur route sesuai pembagian halaman |
| SQLite `node:sqlite` | Tanpa server database, tanpa Docker, cukup satu berkas; cocok untuk demo akademik dan pengembangan lokal |
| AI lewat endpoint OpenAI-compatible | Mudah diganti penyedia (default DeepSeek) tanpa mengubah kode domain |
| AI opsional, kegagalan menjadi `perlu_ditinjau` | Tidak ada laporan tamu yang hilang saat key kosong, kuota habis, atau provider bermasalah |
| Tanpa jalur klasifikasi alternatif | Satu jalur klasifikasi lebih sederhana diuji dan dilaporkan; tidak ada klaim performa jalur yang tidak dipakai |
| Autentikasi lokal + sesi database | Tidak perlu penyedia auth eksternal; cookie hanya berisi token acak, password disimpan sebagai hash scrypt |
| Tanpa rate limit | Batasan proyek akademik dan pemakaian lokal/LAN; risiko penyalahgunaan dicatat, bukan dianggap selesai |
| Notifikasi Telegram best-effort | Integrasi opsional tidak boleh menggagalkan pencatatan keluhan |

## 7. Batasan yang diketahui dan yang belum dikerjakan

Batasan saat ini:

- Tidak ada rate limit pada endpoint publik maupun login; tidak ada throttle
  percobaan login.
- Tidak ada job retensi/scrub PII, penghapusan otomatis, atau pengarsipan.
  Nama dan nomor kamar tersimpan apa adanya di SQLite sampai data dihapus.
- Tidak ada peran/otorisasi berlapis: semua petugas yang login dapat melihat dan
  mengubah semua keluhan. Departemen hanyalah penanda tujuan, bukan hak akses.
- Tidak ada optimistic concurrency atau idempotency; dua petugas dapat saling
  menimpa perubahan dan submit ganda dapat membuat dua baris.
- Tidak ada pencatatan biaya/token AI dan tidak ada budget cap.
- Klasifikasi berjalan sinkron di permintaan; tidak ada antrean, retry, atau
  endpoint klasifikasi ulang.
- Notifikasi Telegram tidak dijamin terkirim dan tidak di-retry.
- Halaman `/qr` menyusun URL dari `Host`; scan dari ponsel memerlukan alamat
  LAN server, bukan `localhost`.
- Belum ada konfigurasi deployment produksi (Docker/VPS/Caddy) di repo.
- Belum dikerjakan: hasil evaluasi ditulis ke `eval/results/summary.md` (metode di
  `docs/EVALUATION.md`) dan uji black-box di `docs/BLACKBOX.md`. Integrasi
  WhatsApp/PMS, retensi PII, export CSV, rate limit, dan CSRF belum ada.

## 8. Menjalankan dan memverifikasi

Dari direktori `app/`:

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan di port 3000 (atau `npm run dev:3123`) |
| `npm run build` lalu `npm start` | Build produksi lalu jalankan server |
| `npm run test` | Tes aturan alur kerja dengan `node --test` |
| `npm run db:reset` | Menghapus database lokal; dibuat ulang saat server start |
| `npm run seed:ai` | Membekukan hasil klasifikasi 15 keluhan seed ke `data/seed-ai.json` |
| `npm run eval` | Menjalankan evaluasi klasifikasi 100 item (butuh `AI_API_KEY`) |

Saat database kosong, aplikasi mengisi 15 keluhan demo dan tiga akun petugas.
`SEED_MODE=static` (default) memakai nilai literatur `seed-data.ts`; `SEED_MODE=ai`
memakai hasil beku `data/seed-ai.json` dan gagal bila berkas tidak lengkap. Akun
demo utama: `staff@smartguest.local` / `password`.
