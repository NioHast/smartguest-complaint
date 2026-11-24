# SmartGuest Complaint

Aplikasi web untuk mencatat keluhan tamu hotel, mengklasifikasikannya dengan bantuan AI, lalu meneruskannya ke departemen yang tepat. AI hanya memberi rekomendasi; keputusan akhir tetap di tangan petugas front office.

## Masalah

Keluhan tamu masuk sebagai teks bebas lewat front desk, telepon, atau WhatsApp. Petugas harus menebak departemen yang berwenang, mencatatnya di tempat berbeda-beda, dan merekapnya secara manual. Akibatnya keluhan mudah terlewat, salah diteruskan, dan sulit ditelusuri saat hendak dievaluasi. WhatsApp di sini hanyalah label kanal yang dipilih petugas, bukan integrasi pesan.

## Solusi

SmartGuest Complaint menyatukan pencatatan keluhan, rekomendasi kategori, verifikasi petugas, penetapan departemen, dan status penanganan dalam satu alur. Prinsipnya: **AI merekomendasikan, petugas memutuskan.** Tidak ada auto-close maupun auto-assign. Status hanya berpindah lewat aksi petugas dengan urutan Baru -> Diproses -> Selesai, dan setiap aksi tercatat di jejak aktivitas.

![Dasbor SmartGuest Complaint](app/public/screenshots/dashboard.png)

*Dasbor: ringkasan status, rekap kategori, dan keluhan terbaru.*

## Tampilan

README ini hanya memuat gambar dasbor. Tiga tampilan utama aplikasi:

- **Dasbor ringkasan** — jumlah keluhan per status (Baru, Diproses, Selesai), jumlah per kategori, dan daftar keluhan terbaru.
- **Tabel keluhan** — daftar keluhan dengan pencarian, filter status/kategori, serta kolom kategori, departemen, dan status.
- **Panel rekomendasi** — kategori usulan AI beserta tingkat keyakinan dan alasan, yang dapat disetujui atau diubah petugas saat verifikasi.

## Fitur

1. **Catat keluhan** — teks bebas, nama tamu, nomor kamar, dan kanal masuk.
2. **Klasifikasi otomatis 5 kategori** — memakai AI bila dikonfigurasi, atau aturan kata kunci sebagai cadangan.
3. **Verifikasi petugas** — petugas menyetujui atau mengubah kategori, disertai alasan perubahan bila ada.
4. **Penentuan departemen** — ditetapkan otomatis dari kategori saat verifikasi.
5. **Status Baru / Diproses / Selesai** — transisi dibatasi dan hanya lewat aksi petugas.
6. **Ringkasan keluhan** — agregat jumlah per status dan kategori di dasbor.

Jejak aktivitas mencatat siapa yang memverifikasi, kapan, kategori dan departemen apa yang ditetapkan, serta perubahan status berikutnya.

## Kategori dan departemen

| Kategori | Departemen |
| --- | --- |
| Kebersihan Kamar | Housekeeping |
| Teknisi & Fasilitas | Engineering |
| Makanan & Minuman | F&B |
| Resepsionis | Front Office |
| Perlu Ditinjau | Duty Manager |

Pemetaan ini tetap dan dipakai otomatis saat petugas memverifikasi keluhan.

## Menjalankan

Prasyarat: Node.js >= 22.5 (memakai `node:sqlite` bawaan).

```bash
cd app
npm install
# salin app/.env.example menjadi app/.env, lalu isi bila memakai AI
npm run dev
```

Buka `http://localhost:3000`, lalu login dengan `staff@smartguest.local` / `password`.

Konfigurasi LLM di `app/.env` (hanya dibaca di server):

| Variabel | Keterangan |
| --- | --- |
| `AI_API_KEY` | Kunci API. Kosongkan untuk mode aturan kata kunci. |
| `AI_BASE_URL` | Endpoint OpenAI-compatible, default `https://api.deepseek.com`. |
| `AI_MODEL` | Model yang dipakai, default `deepseek-chat`. |

## Mode tanpa API key

Jika `AI_API_KEY` kosong, klasifikasi memakai aturan kata kunci deterministik dan aplikasi tetap berjalan. Badge di header menunjukkan mode aktif: "AI aktif (nama model)" atau "Aturan kata kunci (AI tidak aktif)".

## Perintah

Jalankan dari direktori `app/`.

| Perintah | Fungsi |
| --- | --- |
| `npm run test` | Tes alur kerja dengan `node --test`. |
| `node scripts/test-ai-heuristics.js` | Verifikasi heuristik klasifikasi aturan kata kunci. |
| `npm run db:reset` | Hapus database SQLite lokal; dibuat ulang saat server start. |
| `npm run build && npm start` | Build produksi lalu jalankan server. |

## Struktur repo

| Path | Isi |
| --- | --- |
| `app/` | Aplikasi Next.js: UI, route API, akses SQLite, dan mesin klasifikasi. |
| `docs/` | Dokumen perencanaan dan spesifikasi. Mulai dari [`docs/README.md`](docs/README.md). |

## Catatan

- Database SQLite lokal di `app/data/`; tidak memakai Docker.
- Proyek akademik, bukan sistem produksi.
- Dataset evaluasi belum disertakan di repo, sehingga belum ada angka performa klasifikasi yang diklaim.

## Lisensi dan asal kode

Kode diadaptasi dari repo publik `jaswanthneyigapula30-ux/staysage-ai-saas`, yang tidak menyertakan berkas lisensi. Karena itu repo ini tidak mengklaim lisensi apa pun (termasuk MIT) dan hanya disediakan untuk keperluan tugas akademik.
