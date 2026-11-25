# SmartGuest Complaint

Aplikasi web untuk mencatat keluhan tamu hotel. Keluhan bisa masuk lewat QR kamar (tamu mencatat sendiri tanpa login) atau dicatat petugas setelah login. Kategori dan departemen ditetapkan otomatis saat keluhan dibuat; AI opsional membantu memilih kategori, dan petugas tetap bisa mengoreksinya.

## Masalah

Keluhan tamu masuk sebagai teks bebas lewat front desk, telepon, atau WhatsApp. Petugas harus menebak departemen yang berwenang, mencatatnya di tempat berbeda-beda, dan merekapnya secara manual. Akibatnya keluhan mudah terlewat, salah diteruskan, dan sulit ditelusuri saat hendak dievaluasi. WhatsApp di sini hanyalah label kanal yang dipilih petugas, bukan integrasi pesan.

## Solusi

SmartGuest Complaint menyatukan dua jalur masuk keluhan, klasifikasi kategori, penetapan departemen, dan status penanganan dalam satu alur. Kategori beserta departemennya diisi otomatis saat keluhan dibuat memakai pemetaan tetap, dengan status awal **Baru**. Verifikasi petugas bukan langkah wajib: bila kategori dinilai kurang tepat, petugas memakai **Koreksi kategori** dan wajib menulis alasan minimal 10 karakter. Tidak ada auto-close; status hanya berpindah lewat aksi petugas dengan urutan Baru -> Diproses -> Selesai, dan setiap aksi tercatat di jejak aktivitas.

## Alur tamu (QR)

1. Petugas membuka `/qr?kamar=302`, lalu mencetak halaman QR yang tampil dan menempelkannya di kamar.
2. Tamu memindai QR dan membuka `/tamu?kamar=302` di ponsel. Halaman ini publik, tanpa login.
3. Tamu menulis keluhan lalu mengirimkannya. Form memanggil `POST /api/public/complaints` tanpa sesi.
4. Saat keluhan dibuat, sistem mengisi kategori dan departemen secara otomatis (lihat [Kategori dan departemen](#kategori-dan-departemen)) dengan status awal **Baru**.
5. Petugas melihat keluhan di dasbor. Bila kategori perlu diperbaiki, petugas memakai **Koreksi kategori** dengan alasan minimal 10 karakter; langkah ini opsional.
6. Bila Telegram dikonfigurasi, notifikasi keluhan baru dikirim ke chat departemen terkait.

Untuk scan dari HP, buka halaman QR lewat alamat LAN server, misalnya `http://192.168.1.10:3000/qr?kamar=302`, bukan `127.0.0.1`. Halaman `/qr` menyusun URL tamu dari header `Host` permintaan, jadi alamat yang tercetak mengikuti alamat yang dipakai saat halaman dibuka.

![Dasbor SmartGuest Complaint](app/public/screenshots/dashboard.png)

*Dasbor: ringkasan status, rekap kategori, dan keluhan terbaru.*

## Tampilan

README ini hanya memuat gambar dasbor. Tiga tampilan utama aplikasi:

- **Dasbor ringkasan** — jumlah keluhan per status (Baru, Diproses, Selesai), jumlah per kategori, dan daftar keluhan terbaru.
- **Tabel keluhan** — daftar keluhan dengan pencarian, filter status/kategori, serta kolom kategori, departemen, dan status.
- **Panel rekomendasi** — kategori usulan AI beserta tingkat keyakinan dan alasan, kategori terpilih beserta departemennya, serta tombol **Koreksi kategori** bila petugas perlu mengubahnya.

## Fitur

1. **Dua jalur masuk keluhan** — tamu mencatat lewat QR kamar tanpa login, atau petugas mencatat lewat aplikasi setelah login.
2. **Klasifikasi otomatis 5 kategori** — memakai LLM bila `AI_API_KEY` diisi. Tanpa key, atau bila AI timeout/gagal/keluarannya tidak valid, keluhan **tetap tersimpan** sebagai `Perlu Ditinjau` dengan alasan yang menyebut penyebabnya; tidak ada respons 503/502.
3. **Kategori dan departemen otomatis** — ditetapkan saat keluhan dibuat memakai pemetaan tetap, dengan status awal Baru.
4. **Koreksi kategori oleh petugas** — opsional, wajib alasan minimal 10 karakter; departemen mengikuti kategori baru.
5. **Notifikasi Telegram opsional** — tanpa token, notifikasi dilewati dan hanya dicatat di log.
6. **Status Baru / Diproses / Selesai** — transisi dibatasi dan hanya lewat aksi petugas.
7. **Ringkasan keluhan** — agregat jumlah per status dan kategori di dasbor.

Jejak aktivitas mencatat siapa yang memasukkan keluhan, siapa yang mengoreksi kategori, kapan, kategori dan departemen apa yang ditetapkan, serta perubahan status berikutnya.

## Kategori dan departemen

| Kategori | Departemen |
| --- | --- |
| Kebersihan Kamar | Housekeeping |
| Teknisi & Fasilitas | Engineering |
| Makanan & Minuman | F&B |
| Resepsionis | Front Office |
| Perlu Ditinjau | Duty Manager |

Pemetaan ini tetap dan dipakai otomatis saat keluhan dibuat. Bila petugas mengoreksi kategori, departemen ikut berubah mengikuti tabel ini; departemen tidak dapat dipilih terpisah agar keduanya tidak pernah bertentangan.

## Menjalankan

Prasyarat: Node.js >= 23.5.0. Modul `node:sqlite` sudah bebas flag sejak Node 23.4 (dan 22.13), tetapi `npm run seed:ai` memakai `module.registerHooks` yang tersedia sejak v23.5.0; karena itu batas bawahnya 23.5.0. Node 24/26 direkomendasikan karena Node 23 bukan LTS.

```bash
cd app
npm install
# salin app/.env.example menjadi app/.env; AI_API_KEY opsional
npm run dev
```

Buka `http://localhost:3000`, lalu login sebagai Intan Permata dengan `staff@smartguest.local` / `password`. Halaman tamu ada di `http://localhost:3000/tamu?kamar=302` dan halaman QR cetak di `http://localhost:3000/qr?kamar=302`.

`AI_API_KEY` bersifat opsional. Tanpa key, aplikasi tetap berjalan dan setiap keluhan tersimpan sebagai `Perlu Ditinjau` dengan alasan "AI belum dikonfigurasi". Lihat [Variabel Lingkungan](#variabel-lingkungan).

## Notifikasi Telegram (opsional)

Notifikasi ke petugas internal bisa dikirim lewat bot Telegram. Fitur ini
sepenuhnya opsional: tanpa `TELEGRAM_BOT_TOKEN`, notifikasi **dilewati** dan
hanya dicatat di log server (`[notifikasi] Telegram belum dikonfigurasi; dilewati.`),
tanpa membuat pencatatan keluhan gagal.

Cara mengaktifkan:

1. Buat bot lewat [@BotFather](https://t.me/BotFather), lalu salin tokennya ke
   `app/.env` sebagai `TELEGRAM_BOT_TOKEN`.
2. Tambahkan bot ke grup/chat tujuan, lalu isi `chat_id` per departemen:
   `TELEGRAM_CHAT_HOUSEKEEPING`, `TELEGRAM_CHAT_ENGINEERING`, `TELEGRAM_CHAT_FNB`,
   `TELEGRAM_CHAT_FRONT_OFFICE`, dan `TELEGRAM_CHAT_DUTY_MANAGER`.
   Bila memakai grup ber-topik, isi juga `TELEGRAM_THREAD_<DEPARTEMEN>` dengan
   `message_thread_id` topik terkait.
3. Uji koneksi setelah login (butuh cookie sesi):

   ```bash
   curl -X POST -b "smartguest_session=<token>" "http://localhost:3000/api/telegram/test?departemen=engineering"
   ```

   Tanpa token, responsnya `{"ok":true,"sent":false,"skipped":"not-configured"}`.
   Bila token dan `chat_id` terisi, pesan uji dikirim ke chat tersebut.

Catatan: pesan hanya dikirim ke **petugas internal** (departemen terkait), bukan
ke tamu. Endpoint uji tidak pernah mengembalikan token.

## Seeding data demo

Saat database masih kosong, aplikasi mengisi 15 keluhan demo. Sumber nilai
klasifikasi awal (`ai_*`) dipilih lewat `SEED_MODE`:

| Jalur | Perintah | Memanggil AI? | Kapan dipakai |
| --- | --- | --- | --- |
| Statis (default) | `npm run dev`, atau `npm run db:reset` lalu jalankan server | Tidak | Demo sehari-hari dan lingkungan tanpa `AI_API_KEY`; nilai diambil dari literal `app/src/lib/seed-data.ts` sehingga deterministik. |
| AI beku | `npm run seed:ai`, lalu set `SEED_MODE=ai` dan seed ulang database | Ya, hanya saat `seed:ai` (15 panggilan berurutan, dengan jeda) | Ingin data demo memakai hasil klasifikasi model asli, tetapi seeding tetap deterministik karena hasilnya dibekukan ke file. |

`SEED_MODE` hanya dibaca ketika database kosong; ubah nilainya di `app/.env`
lalu reset database agar berlaku. Pada jalur `ai`, `app/data/seed-ai.json` wajib
ada dan lengkap untuk 15 keluhan. Bila tidak, seeding gagal dengan pesan
"Jalankan npm run seed:ai terlebih dahulu."; tidak ada fallback diam-diam ke
jalur statis.

Pada jalur `ai`, nilai kategori/departemen **data seed** mengikuti aturan koherensi: entri seed yang tidak punya kategori tetap tanpa kategori, entri dengan `change_reason` mempertahankan keputusan petugas, dan entri tanpa `change_reason` mengikuti kategori AI beserta pemetaan departemennya. Aturan ini hanya untuk data demo; keluhan baru yang dibuat lewat aplikasi selalu mendapat kategori dan departemen otomatis.

> **Jangan commit `app/data/seed-ai.json`.** File itu berisi keluaran model AI
> dan sudah diabaikan git lewat pola `/data/` di `app/.gitignore`. Regenerasi
> dengan `npm run seed:ai` dari direktori `app/` bila diperlukan.

## Dependensi

### Kebutuhan sistem

| Kebutuhan | Versi | Keterangan |
| --- | --- | --- |
| Node.js | >= 23.5.0 | Wajib. Aplikasi memakai modul bawaan `node:sqlite`, yang sudah bebas flag sejak Node 23.4 (dan 22.13), tetapi `npm run seed:ai` memerlukan `module.registerHooks` yang tersedia sejak v23.5.0; karena itu batas bawahnya 23.5.0. Node 24/26 direkomendasikan karena Node 23 bukan LTS. |
| npm | ikut terpasang bersama Node.js | Dipakai untuk `npm install` dan menjalankan skrip di `app/`. |
| Docker | tidak perlu | Aplikasi berjalan langsung di localhost tanpa kontainer. |
| Server database (MySQL/PostgreSQL) | tidak perlu | Data disimpan di satu file SQLite lokal. |
| Layanan cloud | tidak wajib | Tidak ada layanan cloud yang wajib. Bila `AI_API_KEY` diisi, klasifikasi memanggil API LLM OpenAI-compatible; tanpa key keluhan tetap tersimpan sebagai `Perlu Ditinjau`. |

### Paket runtime dan pengembangan

Daftar diambil dari `app/package.json`; versi ditulis persis seperti di file tersebut.

| Paket | Versi | Untuk apa di proyek ini |
| --- | --- | --- |
| `next` | 16.2.6 | Framework React dan App Router, termasuk route API di `app/src/app/api`. |
| `react` | 19.2.4 | Library UI untuk komponen halaman. |
| `react-dom` | 19.2.4 | Renderer React untuk DOM browser. |
| `recharts` | ^3.8.1 | Grafik ringkasan status dan kategori di dasbor. |
| `lucide-react` | ^1.17.0 | Ikon di antarmuka. |
| `openai` | ^6.39.1 | SDK klien untuk API OpenAI-compatible; dipakai memanggil DeepSeek bila `AI_API_KEY` diisi. |
| `qrcode` | ^1.5.4 | Membuat QR kamar sebagai SVG di halaman `/qr`. |
| `@tailwindcss/postcss` | ^4 | Plugin PostCSS untuk Tailwind CSS v4 di `app/postcss.config.mjs`. |
| `tailwindcss` | ^4 | Styling utility-first untuk seluruh antarmuka. |
| `typescript` | ^5 | Tipe statis dan kompilasi TypeScript. |
| `eslint` | ^9 | Linter untuk `npm run lint`. |
| `eslint-config-next` | 16.2.6 | Aturan ESLint bawaan Next.js. |
| `@types/node` | ^26 | Definisi tipe Node.js. |
| `@types/qrcode` | ^1.5.6 | Definisi tipe untuk paket `qrcode`. |
| `@types/react` | ^19 | Definisi tipe React. |
| `@types/react-dom` | ^19 | Definisi tipe React DOM. |

### Dependensi layanan eksternal dan pengujian

| Kebutuhan | Wajib? | Keterangan |
| --- | --- | --- |
| API key DeepSeek (`AI_API_KEY`) | Opsional | Dipakai untuk klasifikasi LLM. Tanpa key, atau bila AI gagal/timeout/keluarannya tidak valid, keluhan tetap tersimpan sebagai `Perlu Ditinjau` dengan alasan yang menyebut penyebabnya. Tidak ada respons 503/502. |
| Bot Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_<DEPARTEMEN>`) | Opsional | Tanpa token, notifikasi dilewati dan hanya dicatat di log. Uji lewat `POST /api/telegram/test?departemen=engineering` setelah login. |
| Playwright | Tidak dibutuhkan | Bukan dependensi proyek dan tidak dipakai untuk menjalankan atau menguji aplikasi; tes memakai `node --test` (`app/tests/workflow.test.mjs`). |

## Variabel Lingkungan

Dibaca di sisi server dari `app/.env` atau environment proses. Semua variabel opsional; `AI_API_KEY` hanya mengaktifkan klasifikasi LLM dan `TELEGRAM_*` hanya mengaktifkan notifikasi.

| Variabel | Wajib/Opsional | Default | Keterangan |
| --- | --- | --- | --- |
| `AI_API_KEY` | Opsional | kosong | Kunci API DeepSeek. Tanpa key, klasifikasi tidak berjalan dan keluhan tetap tersimpan sebagai `Perlu Ditinjau`. |
| `AI_BASE_URL` | Opsional | `https://api.deepseek.com` | Endpoint OpenAI-compatible untuk jalur `AI_API_KEY`. |
| `AI_MODEL` | Opsional | `deepseek-chat` | Model yang dipakai untuk klasifikasi. |
| `TELEGRAM_BOT_TOKEN` | Opsional | kosong | Token bot Telegram. Tanpa token, notifikasi dilewati dan hanya dicatat di log. |
| `TELEGRAM_CHAT_<DEPARTEMEN>` | Opsional | kosong | `chat_id` tujuan per departemen: `HOUSEKEEPING`, `ENGINEERING`, `FNB`, `FRONT_OFFICE`, `DUTY_MANAGER`. Tanpa `chat_id`, notifikasi untuk departemen itu dilewati. |
| `TELEGRAM_THREAD_<DEPARTEMEN>` | Opsional | kosong | `message_thread_id` untuk grup Telegram ber-topik. |
| `NEXT_PUBLIC_BASE_URL` | Opsional | kosong | Basis URL publik aplikasi untuk halaman QR saat dipakai di jaringan/HTTPS (mis. `http://192.168.1.10:3000`). Bila kosong, `/qr` menyusun URL dari `x-forwarded-proto` (bila ada) lalu header `Host`. |
| `SEED_MODE` | Opsional | `static` | Sumber nilai `ai_*` saat database kosong: `static` (literal `seed-data.ts`, tanpa AI) atau `ai` (hasil beku `data/seed-ai.json`, wajib sudah dibuat lewat `npm run seed:ai`). |
| `SMARTGUEST_DB_PATH` | Opsional | `data/smartguest.db` relatif terhadap direktori kerja `app/` | Lokasi file SQLite. Juga dibaca `app/scripts/reset-db.js`, tetapi skrip itu tidak memuat `.env`, jadi set lewat environment saat menjalankan perintah. |
| `PORT` | Opsional | `3000` | Port server; dibaca oleh CLI Next.js (`next dev`/`next start`), bukan oleh kode aplikasi. `npm run dev:3123` menimpanya dengan `-p 3123`. |

Rujukan kode: `app/src/lib/ai.ts` (konfigurasi LLM), `app/src/lib/notifier.ts` (Telegram), dan `app/src/lib/db.ts` (lokasi database).

## Konfigurasi AI

Klasifikasi memakai satu jalur: LLM lewat `AI_API_KEY`. Bila key tidak diisi, AI timeout (7 detik), provider mengembalikan error, atau keluarannya tidak valid, keluhan tetap disimpan dengan kategori `Perlu Ditinjau` dan alasan yang menyebut penyebabnya; tidak ada respons 503/502. Untuk provider lain yang OpenAI-compatible, cukup ganti `AI_BASE_URL` dan `AI_MODEL`. Badge di header menunjukkan "AI aktif (nama model)" atau "AI tidak aktif".

## Perintah

Jalankan dari direktori `app/`.

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan di port 3000. |
| `npm run dev:3123` | Server pengembangan di port 3123. |
| `npm run test` | Tes alur kerja dengan `node --test`. |
| `npm run seed:ai` | Bekukan klasifikasi AI untuk 15 keluhan seed ke `data/seed-ai.json`. |
| `npm run db:reset` | Hapus database SQLite lokal; dibuat ulang saat server start. |
| `npm run build && npm start` | Build produksi lalu jalankan server. |

## Struktur repo

| Path | Isi |
| --- | --- |
| `app/` | Aplikasi Next.js: UI, route API, akses SQLite, dan mesin klasifikasi. |
| `docs/` | Dokumen perencanaan dan spesifikasi. Mulai dari [`docs/README.md`](docs/README.md). |

## Batasan yang diketahui

- Belum ada rate limit pada `POST /api/public/complaints`. Siapa pun yang bisa menjangkau alamat server dapat mengirim keluhan berulang; pengamanan saat ini mengandalkan jaringan lokal. Ini batasan proyek akademik, bukan jaminan untuk produksi.
- Belum ada dataset evaluasi maupun confusion matrix, sehingga belum ada angka performa klasifikasi yang diklaim.
- Halaman `/qr` membentuk URL dari header `Host`; untuk scan dari HP pastikan halaman dibuka lewat alamat LAN server, bukan `localhost`/`127.0.0.1`.
- Notifikasi Telegram bersifat best-effort: kegagalan pengiriman tidak menggagalkan pencatatan keluhan.

## Catatan

- Database SQLite lokal di `app/data/`; tidak memakai Docker.
- Proyek akademik, bukan sistem produksi.

## Lisensi dan asal kode

Kode diadaptasi dari repo publik `jaswanthneyigapula30-ux/staysage-ai-saas`, yang tidak menyertakan berkas lisensi. Karena itu repo ini tidak mengklaim lisensi apa pun (termasuk MIT) dan hanya disediakan untuk keperluan tugas akademik.
