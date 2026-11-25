# SmartGuest Complaint

Aplikasi web pencatatan keluhan tamu hotel dengan dua jalur masuk: tamu memindai QR kamar (tanpa login) atau petugas mencatat setelah login. Kategori dan departemen ditetapkan otomatis saat keluhan dibuat; AI opsional membantu memilih kategori dan petugas boleh mengoreksinya. Data disimpan di SQLite lokal.

## Alur singkat

1. Petugas membuka `/qr?kamar=302` dan mencetak halaman QR.
2. Tamu memindai QR, membuka `/tamu?kamar=302`, lalu mengirim keluhan lewat `POST /api/public/complaints` tanpa login.
3. Petugas juga bisa mencatat keluhan lewat aplikasi setelah login (`POST /api/complaints`).
4. Kategori dan departemen diisi otomatis memakai pemetaan tetap; status awal **Baru**.
5. Petugas boleh memakai **Koreksi kategori** (wajib alasan minimal 10 karakter); langkah ini opsional.
6. Tanpa `AI_API_KEY`, atau bila AI timeout/gagal/keluarannya tidak valid, keluhan tetap tersimpan sebagai `Perlu Ditinjau` dengan alasan yang menyebut penyebabnya. Notifikasi Telegram opsional: tanpa token, notifikasi dilewati dan hanya dicatat di log.

Untuk scan dari HP, buka halaman QR lewat alamat LAN server (mis. `http://192.168.1.10:3000/qr?kamar=302`), bukan `127.0.0.1`.

## Menjalankan

Jalankan dari direktori `app/`:

```bash
npm install
# salin .env.example menjadi .env; AI_API_KEY opsional
npm run dev
```

Buka `http://localhost:3000`, login sebagai Intan Permata dengan `staff@smartguest.local` / `password`.

`AI_API_KEY` opsional. Tanpa key, aplikasi tetap berjalan dan keluhan tersimpan sebagai `Perlu Ditinjau`; tidak ada respons 503/502.

Notifikasi Telegram bersifat opsional: tanpa `TELEGRAM_BOT_TOKEN` notifikasi dilewati dan hanya dicatat di log. Isi token beserta `TELEGRAM_CHAT_<DEPARTEMEN>` di `.env` bila ingin mengirim pesan ke petugas internal, lalu uji lewat `POST /api/telegram/test?departemen=engineering`. Rincian ada di [README root](../README.md#notifikasi-telegram-opsional).

## Seeding data demo

Saat database kosong, `getDb()` mengisi 15 keluhan demo. Sumber nilai `ai_*`
dipilih lewat `SEED_MODE`:

| Jalur | Perintah | Memanggil AI? | Kapan dipakai |
| --- | --- | --- | --- |
| Statis (default) | `npm run dev` (atau `npm run db:reset` lalu jalankan server) | Tidak | Demo sehari-hari dan lingkungan tanpa `AI_API_KEY`; nilai deterministik dari literal di `src/lib/seed-data.ts`. |
| AI beku | `npm run seed:ai`, lalu set `SEED_MODE=ai` dan seed ulang | Ya, hanya saat `seed:ai` (15 panggilan berurutan) | Ingin data demo memakai hasil klasifikasi model asli, tetapi tetap deterministik karena hasilnya dibekukan ke file. |

`SEED_MODE` hanya dibaca ketika database masih kosong; ubah nilainya lalu reset
database agar berlaku. Pada jalur `ai`, `data/seed-ai.json` wajib ada dan lengkap
untuk 15 keluhan. Bila tidak, seeding gagal dengan pesan
"Jalankan npm run seed:ai terlebih dahulu."; tidak ada fallback diam-diam ke
jalur statis.

> **Jangan commit `data/seed-ai.json`.** File itu berisi keluaran model AI dan
> sudah diabaikan git lewat pola `/data/` di `.gitignore`. Regenerasi dengan
> `npm run seed:ai` bila diperlukan.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan di port 3000. |
| `npm run dev:3123` | Server pengembangan di port 3123. |
| `npm run test` | Tes alur kerja dengan `node --test`. |
| `npm run seed:ai` | Bekukan klasifikasi AI untuk 15 keluhan seed ke `data/seed-ai.json`. |
| `npm run db:reset` | Hapus database lokal; dibuat ulang saat server start. |
| `npm run build` / `npm start` | Build produksi lalu jalankan server. |

## Catatan

- Node.js >= 23.5.0 wajib karena `node:sqlite` sudah bebas flag sejak Node 23.4, tetapi `npm run seed:ai` memakai `module.registerHooks` yang tersedia sejak v23.5.0; karena itu batas bawahnya 23.5.0. Node 24/26 direkomendasikan karena Node 23 bukan LTS.
- Database SQLite berada di `data/` dan dibuat otomatis saat pertama kali dipakai.
- Klasifikasi memakai LLM lewat `AI_API_KEY`. Tanpa key, atau bila AI timeout/gagal/keluarannya tidak valid, keluhan tetap tersimpan sebagai `Perlu Ditinjau`; tidak ada respons 503/502.
- `NEXT_PUBLIC_BASE_URL` opsional sebagai basis URL publik untuk QR di jaringan/HTTPS. Bila kosong, halaman `/qr` menyusun URL dari `x-forwarded-proto` (bila ada) lalu header `Host` permintaan.
- Belum ada rate limit pada endpoint publik `POST /api/public/complaints`; pengamanan mengandalkan jaringan lokal.
- Belum ada dataset evaluasi maupun confusion matrix.

Dokumen lengkap (arsitektur, API, dan variabel lingkungan) ada di README root.
