# SmartGuest Complaint

Aplikasi web pencatatan keluhan tamu hotel: keluhan diklasifikasikan ke lima kategori, diverifikasi petugas, lalu diteruskan ke departemen terkait.
AI hanya memberi rekomendasi; keputusan akhir tetap di petugas, dan data disimpan di SQLite lokal.

## Menjalankan

Jalankan dari direktori `app/`:

```bash
npm install
# salin .env.example menjadi .env, lalu isi AI_API_KEY (wajib)
npm run dev
```

Buka `http://localhost:3000`, login dengan `staff@smartguest.local` / `password`.

`AI_API_KEY` wajib diisi. Tanpa key, aplikasi tetap terbuka tetapi pencatatan keluhan gagal dengan HTTP 503.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run test` | Tes alur kerja dengan `node --test`. |
| `npm run db:reset` | Hapus database lokal; dibuat ulang saat server start. |
| `npm run build` / `npm start` | Build produksi lalu jalankan server. |
| `npm run dev:3123` | Server pengembangan di port 3123. |

## Catatan

- Node.js >= 23.4.0 wajib karena memakai modul bawaan `node:sqlite`, yang tersedia tanpa flag sejak v23.4.0 (dan v22.13.0); versi ini dipilih sebagai batas aman. Node 24/26 direkomendasikan karena Node 23 bukan LTS.
- Database SQLite berada di `data/` dan dibuat otomatis saat pertama kali dipakai.
- Klasifikasi hanya memakai LLM lewat `AI_API_KEY`; tanpa key pencatatan keluhan ditolak (503).

Dokumen lengkap (arsitektur, API, dan variabel lingkungan) ada di README root.
