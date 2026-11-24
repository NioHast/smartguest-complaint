# SmartGuest Complaint — Rencana Produk dan Eksekusi

> Catatan implementasi: jalur klasifikasi aturan kata kunci dihapus; aplikasi hanya memakai LLM, dan tanpa API key pencatatan keluhan gagal (503).

- Versi dokumen: 1.2
- Tanggal: 4 November 2026
- Status: perencanaan; belum ada implementasi
- Konteks: tugas Transformasi Digital, MSI Undip 2026
- Prinsip yang tidak boleh dilanggar: **AI merekomendasikan, manusia memutuskan.**

Riwayat revisi ringkas:

- 1.0: draft awal.
- 1.1: O1-O10 dikunci dan dipindah ke tabel keputusan terkunci; kontrak classifier per percobaan (B1); mode rules-only saat AI tidak dikonfigurasi (B2); alur klasifikasi asinkron (B3); spesifikasi rules dipindah ke `docs/RULES.md` (B4); retensi menjadi scrub PII (B5); perbandingan tiga arah yang adil (B6); URL publik wajib (B7); image migrator dan seed demo (B8); komposisi dataset dan validator near-duplicate (B9); matriks black-box dipindah ke `docs/BLACKBOX.md` (B10); perbaikan S1-S21.
- 1.2: perbaikan round 2 review — marker scrub `resolution_note` `[REDACTED]` (BB-1); komposisi 50 item ambigu 15 + 35 (BB-2); tabel kegagalan hybrid (BB-3); `final` non-nullable + output sintetis degradasi (BB-4); `rawResponse`/`promptHash` pada attempt; trigger audit tidak diklaim DB-level; periode retensi PII eksplisit (`closed_at` + 180 hari untuk keluhan terbuka); tabel `ai_usage` + budget cap; `run_id` vs `request_id`; source uppercase; channel di dashboard/export; job pemulihan + index; missed escalation; sumber harga; `archived_at`; BB-37.

## Daftar isi

1. Ringkasan & tujuan
2. Keputusan terkunci
3. Arsitektur (termasuk 3.6 Kanal masuk keluhan)
4. Kontrak domain (termasuk 4.7 Konvensi casing enum)
5. Kontrak classifier
6. Fase eksekusi
7. Metodologi evaluasi (ringkas)
8. Matriks verifikasi black-box
9. Keamanan & privasi (termasuk 9.4 Retensi dan scrub PII)
10. Deployment & operasional
11. Risk register
12. Rencana demo 5 menit
13. Out of scope
14. Pemetaan ke deck M1-M5
15. Referensi

---

## 1. Ringkasan & tujuan

SmartGuest Complaint adalah aplikasi web untuk Front Office hotel. Petugas mencatat keluhan tamu sebagai teks bebas Bahasa Indonesia, sistem merekomendasikan satu dari lima kategori tetap, petugas memverifikasi atau mengubah kategori, menetapkan departemen, lalu memantau status sampai selesai. Semua keputusan dan perubahan status tercatat dalam jejak audit.

Masalah yang diselesaikan: keluhan tersebar di catatan manual dan chat, sulit diklasifikasikan konsisten, rawan salah diteruskan, dan sulit direkap. Solusi: satu alur catat -> klasifikasi AI -> verifikasi petugas -> tindak lanjut/monitoring, dengan rekap dashboard.

### 1.1 Tujuan

| ID | Tujuan | Ukuran keberhasilan |
| --- | --- | --- |
| T1 | Mencatat keluhan dengan input tervalidasi | Semua jalur input invalid ditolak dengan pesan yang jelas (BB-09 s.d. BB-12) |
| T2 | Memberi rekomendasi kategori yang terukur | Evaluasi 200 item sintetis dengan confusion matrix; hasil nyata dilaporkan, bukan dikarang |
| T3 | Menjaga keputusan di tangan manusia | Tidak ada perubahan kategori/departemen/status tanpa aksi petugas dan event audit |
| T4 | Menjaga aplikasi tetap berguna saat AI gagal | Rantai LLM → rules (kategori, atau `PERLU_DITINJAU` bila rules abstain) → `PERLU_DITINJAU` hanya bila rules abstain; keluhan tetap tersimpan saat internet/kuota gagal |
| T5 | Menyediakan rekap yang dapat ditelusuri | Dashboard dan export CSV konsisten dengan data; setiap keluhan punya timeline event |

### 1.2 Indikator keberhasilan (dari deck, dipertahankan)

1. Aplikasi berfungsi pada skenario black-box terdokumentasi, termasuk kondisi gagal dan data invalid.
2. Klasifikasi terukur: prediksi dibandingkan label referensi, ditampilkan dalam confusion matrix.
3. Proses tertata: keluhan, kategori akhir, departemen, dan status dapat ditelusuri.

### 1.3 Definition of Done per milestone

**Milestone A — demo akademik siap presentasi**

- [ ] `docker compose --profile demo up --build` dari volume kosong menyalakan app + database, menjalankan migrasi, seed demo idempoten, dan healthcheck hijau.
- [ ] Login satu peran Front Office berfungsi; tidak ada halaman registrasi publik.
- [ ] Enam fitur inti berfungsi: input keluhan, klasifikasi AI, verifikasi petugas, penentuan departemen, status penanganan, ringkasan dashboard.
- [ ] Rantai LLM → rules (kategori, atau `PERLU_DITINJAU` bila rules abstain) → `PERLU_DITINJAU` hanya bila rules abstain terbukti pada minimal satu skenario gagal yang terdokumentasi, termasuk mode rules-only saat AI tidak dikonfigurasi.
- [ ] Dataset 200 item dan laporan evaluasi tiga arah (rules, LLM, hybrid) tersimpan di repo; semua angka nyata, bukan target.
- [ ] Seluruh 37 skenario black-box (BB-01..BB-37) di `docs/BLACKBOX.md` dijalankan; tidak ada blocker atau temuan keamanan kritis yang belum ditutup.
- [ ] Setiap keluhan memiliki event `COMPLAINT_CREATED`; setiap perubahan kategori, departemen, dan status memiliki event terkait.
- [ ] Satu URL demo publik aktif (Fase 6a). Demo lokal **bukan** pemenuhan DoD; hanya boleh dipakai sebagai deviasi darurat yang dicatat sebagai change request terhadap keputusan D11/O5.
- [ ] Demo 5 menit di bagian 12 dijalankan dua kali di bawah 6 menit, dengan video cadangan untuk segmen LLM.
- [ ] Deck M1-M5 diperbarui sesuai bagian 14; tidak ada klaim auto-assign atau data nyata.

**Milestone B — pilot 1 hotel**

- [ ] Ada kesepakatan tertulis dengan satu hotel pilot, termasuk masa pilot dan penanggung jawab data.
- [ ] UAT dengan minimal 3 petugas Front Office; temuan blocker ditutup.
- [ ] 30 keluhan nyata dianotasi dan dievaluasi sebagai uji eksternal; keterbatasan dilaporkan.
- [ ] Backup dan restore diuji; RPO target <= 24 jam, RTO target <= 4 jam.
- [ ] Kebijakan retensi dan **scrub/anonymize** PII disetujui hotel; job retensi berjalan dan audit tetap utuh setelah scrub.
- [ ] Monitoring uptime, log terstruktur, dan runbook insiden tersedia.
- [ ] Load test target: 50 pengguna bersamaan, p95 respons halaman < 3 detik pada data pilot.
- [ ] Tidak ada temuan keamanan severity tinggi yang belum ditutup.

---

## 2. Keputusan terkunci

Semua keputusan produk dan teknis untuk Milestone A sudah dikunci di bagian ini. Tidak ada keputusan produk yang menunggu jawaban. Perubahan hanya boleh lewat change request tertulis yang memperbarui tabel ini dan mencatat alasannya.

### 2.1 Keputusan teknis terkunci

| ID | Keputusan | Konsekuensi |
| --- | --- | --- |
| D1 | Stack: Next.js App Router + TypeScript + Tailwind CSS | Satu bahasa untuk UI dan server; server actions/route handler dipakai untuk mutasi |
| D2 | Database PostgreSQL | Enum, constraint, transaksi, dan audit trigger tersedia |
| D3 | Docker Compose (app + db) untuk lokal | Satu perintah untuk demo; environment konsisten |
| D4 | ORM Prisma | Skema dan migrasi terpusat; query type-safe |
| D5 | Auth.js (NextAuth v5) credentials + `bcryptjs` cost 12 | Pure JS agar image Docker slim tidak butuh toolchain native; satu peran Front Office; JWT session; tanpa signup publik |
| D6 | AI lewat abstraksi OpenAI-compatible, **opsional** | `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` opsional; `aiConfigured=false` bila salah satu kosong; boot tidak gagal dan mode rules-only aktif |
| D7 | Fallback rules/kata kunci deterministik wajib | Rantai LLM → rules (kategori, atau `PERLU_DITINJAU` bila rules abstain) → `PERLU_DITINJAU` hanya bila rules abstain; aplikasi tetap memberi hasil saat provider gagal atau tidak dikonfigurasi |
| D8 | Dataset evaluasi sintetis buatan sendiri, 200 item berlabel | Belum ada data nyata; hasil evaluasi harus jujur menyebut batas ini |
| D9 | Login hanya peran Front Office | Dashboard rekap dapat diakses peran ini; peran lain di luar scope |
| D10 | Kesiapan bertahap: Milestone A lalu Milestone B | Urutan berdasarkan dependensi dan nilai, tanpa deadline keras |
| D11 | Deployment: VPS Docker + Caddy + satu URL publik | URL publik wajib untuk Milestone A; Vercel + Postgres terkelola hanya alternatif yang butuh change request |
| D12 | AI tidak boleh auto-close/auto-assign | Semua perubahan status, kategori final, dan departemen butuh konfirmasi petugas |
| D13 | Kategori dan departemen memakai enum tetap | Tidak ada UI untuk menambah kategori pada Milestone A |
| D14 | Evaluasi memakai satu prompt dan model yang dipin | Prompt dan model dicatat per baris klasifikasi; perubahan prompt = versi baru |

### 2.2 Keputusan produk terkunci (O1-O10)

| ID | Keputusan terkunci | Konsekuensi implementasi |
| --- | --- | --- |
| O1 | Identitas hotel demo: **"SmartGuest Demo Hotel"** | Netral; tanpa logo atau merek hotel mana pun |
| O2 | Nama tamu dan nomor kamar **opsional**, dan **tidak dikirim ke LLM** | Form boleh kosong; redaksi dan prompt tidak memuat kedua field |
| O3 | Dashboard boleh menampilkan nama/kamar untuk petugas yang login; **export default tidak memuatnya** | Kontrol tampilan per halaman; export default hanya kolom non-PII |
| O4 | Retensi: keluhan 12 bulan (flag `archived_at`), **PII 90 hari sejak `closed_at`**; untuk keluhan yang belum `SELESAI`, `guest_name` dan `room_number` di-scrub **180 hari sejak `created_at`**; log 30 hari | Implementasi berupa **anonymize/scrub**, bukan delete baris. Definisi operasional lengkap di §9.4; keluhan terbuka > 180 hari dilaporkan terpisah |
| O5 | URL publik: **VPS Docker + Caddy** | TLS otomatis; satu instance; rate limit in-memory valid |
| O6 | Provider AI: **Gemini Flash free tier** untuk demo; biaya dilaporkan memakai **list price**; wajib ada **budget cap** | `AI_*` tetap opsional; budget cap dicek sebelum panggilan dan dicatat |
| O7 | Annotator kedua: dosen/rekan meninjau **40 item (20%) secara buta** | Kappa dan adjudikasi dicatat di `docs/EVALUATION.md` |
| O8 | **Satu keluhan = satu kategori + satu departemen** | Tidak ada multi-departemen; skema dan UI mengikuti |
| O9 | Field prioritas/urgensi **tidak ada di Milestone A** | Di luar skema; permintaan baru = change request |
| O10 | Data seed demo dipisah dengan flag `isDemo` + banner di UI | Tidak dihitung sebagai data operasional |

### 2.3 Keputusan deployment yang tidak boleh dilonggarkan

| ID | Keputusan terkunci | Konsekuensi |
| --- | --- | --- |
| D11-O5 | **URL publik wajib untuk Milestone A** | Demo lokal hanya cadangan darurat dan harus dicatat sebagai **deviasi eksplisit** (change request terhadap D11/O5), bukan pemenuhan DoD |
| D11-O5a | Tidak ada endpoint publik tanpa autentikasi di Milestone A, **kecuali** `/login` dan `/api/health` | `/login` hanya form kredensial; `/api/health` hanya `{ status, db, aiConfigured, version }` tanpa data keluhan/PII; tamu tidak punya akun dan tidak submit langsung; lihat §3.6 |

Catatan: setiap penyimpangan dari tabel di atas wajib berupa change request tertulis yang memperbarui dokumen ini sebelum implementasi.

---

## 3. Arsitektur

### 3.1 Gambaran

```text
Browser (petugas Front Office)
        |
        v
Next.js App Router
  - Server Components: baca data, dashboard
  - Server Actions: create/verify/assign/transition
  - Route Handlers: health, classify, export CSV
        |
        v
Service layer (lib/services)
  - validasi, otorisasi, state machine, transaksi, audit
        |
        +--> Prisma --> PostgreSQL
        |
        +--> Classifier chain (lib/ai), dipanggil asinkron lewat
               POST /api/complaints/[id]/classify
               LLM (OpenAI-compatible) -> validasi output -> rules -> Perlu Ditinjau
               aiConfigured=false -> langsung rules-only
               Setiap percobaan dicatat ke classifications dengan request_id
```

### 3.2 Lapisan dan tanggung jawab

| Lapisan | Lokasi usulan | Tanggung jawab | Larangan |
| --- | --- | --- | --- |
| UI | `app/`, `components/` | Render, form, state klien minimal, pesan error | Tidak memanggil provider AI langsung; tidak menyimpan secret |
| Aksi HTTP | `app/**/actions.ts`, `app/api/**/route.ts` | Parsing input, cek sesi, rate limit, panggil service | Tidak berisi aturan bisnis mendalam |
| Service | `lib/services/` | Transaksi, state machine, audit, otorisasi | Tidak tahu detail UI |
| Domain | `lib/domain/` | Enum, label, mapping, validator status | Tidak mengakses database |
| Data | `lib/db/`, `prisma/` | Prisma client, repository, migrasi | Tidak memanggil AI |
| AI | `lib/ai/` | Client provider, prompt, redaksi, rules, rantai fallback | Tidak menulis status/departemen |
| Eval | `eval/` | Dataset, harness, metrik, laporan | Tidak dipakai runtime produksi |
| Test | `tests/` | Unit, integrasi, E2E | Tidak memakai data tamu nyata |

### 3.3 Struktur folder usulan

```text
smartguest/
  app/
    (auth)/login/page.tsx
    (app)/layout.tsx
    (app)/complaints/page.tsx
    (app)/complaints/new/page.tsx
    (app)/complaints/[id]/page.tsx
    (app)/dashboard/page.tsx
    api/health/route.ts
    api/complaints/route.ts
    api/complaints/[id]/classify/route.ts
    api/export/complaints/route.ts
    api/test/seam/transition/route.ts  # hanya aktif bila ENABLE_TEST_SEAMS=true
    api/test/seam/injection/route.ts   # hanya aktif bila ENABLE_TEST_SEAMS=true
  components/
    complaints/
    dashboard/
    ui/
  lib/
    ai/
      client.ts
      classifier.ts
      chain.ts
      rules.ts
      redact.ts
      validate-output.ts
      prompts/classify.v1.ts
    db/
      client.ts
      repositories/
    domain/
      taxonomy.ts
      status.ts
      validation.ts
      enums.ts
    services/
      complaint-service.ts
      classification-service.ts
      dashboard-service.ts
      audit-service.ts
      retention-service.ts
    auth/
      config.ts
      password.ts
    rate-limit.ts
    log.ts
    env.ts
  middleware.ts
  prisma/
    schema.prisma
    migrations/
    seed.ts
  eval/
    dataset/smartguest-v1.jsonl
    harness/
    reports/
  tests/
    unit/
    integration/
    e2e/
  public/
  docker-compose.yml
  Dockerfile              # target app
  Dockerfile.migrator     # target migrator: Prisma CLI + schema + seed
  .env.example
  .env.production.example
  .nvmrc
```

### 3.4 Server actions vs route handlers

| Kebutuhan | Mekanisme | Alasan |
| --- | --- | --- |
| Create complaint | `POST /api/complaints` | Cepat dan transaksional; wajib `clientRequestId`; **tidak** memanggil provider AI; UI memanggil classify setelah respons |
| Verifikasi, assign department, transition status | Server Action | Terikat form, CSRF ditangani framework, redirect/revalidate mudah |
| Klasifikasi keluhan | `POST /api/complaints/[id]/classify` | Asinkron; perlu timeout, rate limit, dan uji HTTP terpisah; dipanggil dari UI setelah create |
| Export CSV | `GET /api/export/complaints` | Respons streaming file, filter via query |
| Healthcheck | `GET /api/health` | Untuk Docker dan uptime monitor |
| Login/logout | Auth.js route | Bawaan library |

Aturan: route handler dan server action wajib memanggil service, bukan Prisma langsung, kecuali query baca sederhana yang tidak mengubah data. Semua mutasi berjalan dalam transaksi dan menulis `complaint_events`.

### 3.5 Alur utama

1. **Catat (cepat, transaksional):** petugas mengisi teks (dan opsional nama/kamar) serta `clientRequestId`. Service memvalidasi, membuat `complaints` status `BARU` dengan `classificationStatus=PENDING`, menulis event `COMPLAINT_CREATED`/`CLASSIFICATION_REQUESTED`, lalu **langsung kembali**. Tidak ada panggilan HTTP ke provider di dalam transaksi.
2. **Klasifikasi (asinkron dari UI):** setelah create sukses, UI memanggil `POST /api/complaints/[id]/classify`. Route memeriksa sesi, rate limit, dan status; service menandai `RUNNING` dalam transaksi singkat, memanggil LLM (timeout 8 detik) dan/atau rules **di luar transaksi**, lalu menyimpan seluruh percobaan dengan `request_id` dan satu baris `isFinal=true` dalam transaksi baru. Status akhir jalur normal adalah `DONE`; `FAILED` hanya di-set oleh job pemulihan untuk proses yang mati di tengah jalan (tanpa baris final, dengan `classification_error`). Bila LLM gagal, rules dipakai; bila rules di bawah ambang, `Perlu Ditinjau`.
3. **Verifikasi:** petugas melihat rekomendasi, menerima atau mengubah kategori. Alasan wajib bila mengubah. Service menyimpan kategori final, `recommendationSource`, `appliedClassificationId`, dan event `CATEGORY_CONFIRMED`/`CATEGORY_CHANGED`.
4. **Departemen:** petugas menetapkan departemen. Mapping kategori -> departemen hanya saran; nilai akhir tetap pilihan petugas. Event `DEPARTMENT_ASSIGNED`.
5. **Status:** `BARU -> DIPROSES -> SELESAI` dengan syarat di bagian 4.3. Event `STATUS_CHANGED` setiap transisi.
6. **Rekap:** dashboard membaca agregat dari tabel; export CSV memakai filter yang sama.

Batas transaksi (B3):

| Langkah | Transaksi | Catatan |
| --- | --- | --- |
| Create keluhan | Satu transaksi | Insert `complaints` + event; commit sebelum respons |
| Mulai klasifikasi | Satu transaksi singkat | `PENDING/FAILED -> RUNNING`, `classificationStartedAt`, `classification_error=NULL` (retry dari `FAILED`) |
| Panggilan LLM/rules | **Tanpa transaksi DB** | Timeout dan retry di level HTTP client |
| Simpan hasil | Satu transaksi | Insert semua `classifications` + `classificationStatus` + event |
| Terapkan kategori | Satu transaksi | Update `complaints.appliedClassificationId` + `category` + event |

Konsekuensi: bila proses mati di tengah klasifikasi, baris tetap `RUNNING` dan **tidak ada** baris `isFinal`. Job pemulihan (bukan UI) mengubah baris `RUNNING` yang `classificationStartedAt`-nya lebih dari 2 menit menjadi `classificationStatus=FAILED` dan mengisi `classification_error`; status `FAILED` hanya dipakai untuk kasus pemulihan ini. UI menampilkan tombol "Coba klasifikasi lagi" untuk request yang `FAILED`; retry eksplisit oleh petugas membuat `requestId` baru, berbeda dari retry internal HTTP yang memakai `requestId` yang sama (lihat §4.4 `requestId`).

### 3.6 Kanal masuk keluhan

Satu-satunya jalur masuk keluhan adalah **petugas Front Office yang memasukkan deskripsi keluhan tamu** ke aplikasi. Tamu **tidak punya akun** dan **tidak submit langsung**. Keluhan diterima petugas lewat interaksi fisik (front desk, telepon, WhatsApp hotel), lalu petugas mengetiknya.

| Aspek | Ketentuan |
| --- | --- |
| Aktor input | Petugas Front Office yang login |
| Akun tamu | Tidak ada; tidak ada registrasi |
| Endpoint publik tanpa auth | Hanya `/login` dan `/api/health`; keduanya tidak memuat data keluhan/PII. Endpoint lain wajib sesi |
| Enum `channel` | `FRONT_DESK`, `PHONE`, `WHATSAPP`, `EMAIL`, `OTHER`; **metadata asal keluhan**, bukan integrasi |
| Default `channel` | `FRONT_DESK` |
| Konsekuensi | Input manual oleh FO adalah satu-satunya jalur; semua mutasi butuh sesi |

`channel` dicatat saat create dan tidak dapat diubah setelahnya. Nilai ini dipakai untuk rekap asal keluhan, bukan untuk memicu integrasi apa pun.

---

## 4. Kontrak domain

### 4.1 Kategori dan departemen

| Kategori (enum) | Label UI | Departemen default (enum) | Label departemen |
| --- | --- | --- | --- |
| `KEBERSIHAN_KAMAR` | Kebersihan Kamar | `HOUSEKEEPING` | Housekeeping |
| `TEKNISI_FASILITAS` | Teknisi & Fasilitas | `ENGINEERING` | Engineering |
| `MAKANAN_MINUMAN` | Makanan & Minuman | `FNB` | Food & Beverage |
| `RESEPSIONIS` | Resepsionis | `FRONT_OFFICE` | Front Office |
| `PERLU_DITINJAU` | Perlu Ditinjau | `DUTY_MANAGER` | Duty Manager |

Aturan:

- Lima kategori bersifat tetap. Tidak ada kategori kustom pada Milestone A.
- Mapping di atas adalah **saran default**. Petugas boleh memilih departemen lain; perubahan wajib tercatat.
- `PERLU_DITINJAU` adalah kategori sah, bukan error. Dipakai saat teks ambigu, bukan keluhan, atau classifier tidak yakin.
- Label UI disimpan di `lib/domain/taxonomy.ts` sebagai satu sumber; enum Prisma memakai nilai uppercase.
- Tabel lookup `categories`/`departments` tidak dibuat pada Milestone A karena daftar tetap dan tidak dapat diedit dari UI. Bila suatu saat label perlu diedit tanpa deploy, baru tambahkan tabel lookup.

### 4.2 Status

| Status | Arti | Syarat masuk |
| --- | --- | --- |
| `BARU` | Keluhan tercatat, belum ditangani | Default saat create |
| `DIPROSES` | Sudah diverifikasi dan ditugaskan | Kategori final, departemen, `verifiedAt`, dan **`verifiedById`** terisi |
| `SELESAI` | Penanganan selesai | `resolutionNote` 10-1000 karakter setelah trim dan `closedAt` terisi |

### 4.3 State machine

| Dari | Ke | Valid? | Syarat dan efek |
| --- | --- | --- | --- |
| `BARU` | `DIPROSES` | Ya | Kategori final + departemen + `verifiedById` + `verifiedAt`; tulis event |
| `DIPROSES` | `SELESAI` | Ya | `resolutionNote` 10-1000 karakter setelah trim; set `closedAt`, tulis event |
| `BARU` | `SELESAI` | Tidak | Tolak 409; harus melalui `DIPROSES` |
| `DIPROSES` | `BARU` | Tidak | Tidak ada rollback status; koreksi lewat catatan |
| `SELESAI` | `DIPROSES` | Tidak | Reopen di luar scope Milestone A |
| `SELESAI` | `BARU` | Tidak | Sama seperti di atas |
| Status sama | Status sama | Tidak | Tolak 409; UI menonaktifkan tombol |

Aturan tambahan:

- Perubahan kategori final hanya boleh sebelum `SELESAI`, wajib alasan >= 10 karakter, dan menulis event `CATEGORY_CHANGED` berisi kategori lama/baru serta alasan.
- Perubahan departemen saat `DIPROSES` wajib alasan >= 10 karakter; saat `BARU` alasan opsional tetapi tetap dicatat.
- Status `SELESAI` bersifat final pada Milestone A. Koreksi setelah selesai hanya dapat dilakukan lewat perubahan data manual oleh admin database, di luar UI, dan harus didokumentasikan sebagai insiden.
- Semua transisi memakai optimistic check pada `updatedAt` (dikirim klien) **dan** status saat ini untuk mencegah double submit dan stale update. Bila status sudah berubah, kembalikan 409 dengan pesan "Status sudah berubah, muat ulang". Bila `updatedAt` tidak cocok, kembalikan 409 "Data sudah diubah pengguna lain".
- Transisi ke status yang sama ditolak 409; UI menonaktifkan tombol.
- **Klasifikasi ulang setelah verifikasi:** memanggil classify lagi hanya menambah attempts untuk `requestId` baru dan tidak mengubah `complaints.category`. Kategori final baru berubah bila petugas menekan terima/ubah; saat itu `appliedClassificationId` dipindah ke baris final yang benar-benar di-apply dan event `CATEGORY_CONFIRMED`/`CATEGORY_CHANGED` ditulis. Baris final lama tetap tersimpan sebagai riwayat (tidak dihapus, `isFinal` tidak diubah).
- Bila kategori final diubah manual (bukan dari hasil AI), buat `requestId` baru, tulis baris `classifications` `source=MANUAL`, `isFinal=true`, `attemptNo = max(attempt_no)+1` untuk keluhan itu, `latencyMs = 0`, lalu set `appliedClassificationId` ke baris itu.

### 4.4 Skema tabel

#### `users`

| Kolom | Tipe | Aturan |
| --- | --- | --- |
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `email` | `varchar(255)` | Unik, disimpan lowercase |
| `passwordHash` | `text` | `bcryptjs` cost 12 (pure JS, tanpa toolchain native); tidak pernah keluar dari server |
| `name` | `varchar(100)` | Nama petugas |
| `role` | enum `Role` | Hanya `FRONT_OFFICE` pada Milestone A |
| `isActive` | `boolean` | Default true; user nonaktif tidak bisa login |
| `createdAt`, `updatedAt` | `timestamptz` | Audit dasar |

Index: unique `email`. Tidak ada tabel akun/session Auth.js karena memakai strategi JWT; user tetap di tabel sendiri.

#### `complaints`

| Kolom | Tipe | Aturan |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `code` | `varchar(20)` | Unik, format `SG-YYMMDD-XXXX` (XXXX base32 `A-Z2-7`); regex `^SG-[0-9]{6}-[A-Z2-7]{4}$` |
| `channel` | enum `Channel` | `FRONT_DESK`, `PHONE`, `WHATSAPP`, `EMAIL`, `OTHER`; default `FRONT_DESK`; metadata, bukan integrasi |
| `rawText` | `varchar(2000)` | Wajib, 5-2000 karakter setelah trim |
| `guestName` | `varchar(100)` | Nullable; tidak dikirim ke LLM; dapat di-scrub |
| `roomNumber` | `varchar(10)` | Nullable; tidak dikirim ke LLM; dapat di-scrub |
| `classificationStatus` | enum `ClassificationStatus` | `PENDING`, `RUNNING`, `DONE`, `FAILED`; default `PENDING` |
| `classificationStartedAt` | `timestamptz` | Nullable; untuk deteksi job `RUNNING` yang macet |
| `classificationFinishedAt` | `timestamptz` | Nullable |
| `classificationError` | `varchar(500)` | Nullable; diisi job pemulihan saat `classification_status=FAILED`; wajib saat `FAILED`, disanitasi tanpa secret/PII |
| `appliedClassificationId` | `uuid` | FK `classifications.id`, nullable; baris yang **benar-benar di-apply** |
| `category` | enum `Category` | Nullable sampai verifikasi; ini kategori final |
| `recommendationSource` | enum `RecommendationSource` | `RECOMMENDATION_ACCEPTED`, `RECOMMENDATION_EDITED`, `MANUAL`; nullable sebelum verifikasi |
| `department` | enum `Department` | Nullable sampai ditetapkan |
| `status` | enum `Status` | Default `BARU` |
| `createdById` | `uuid` | FK `users.id`, wajib |
| `verifiedById` | `uuid` | FK `users.id`, nullable; **wajib saat `DIPROSES`/`SELESAI`** |
| `verifiedAt` | `timestamptz` | Nullable; wajib saat `DIPROSES`/`SELESAI` |
| `closedAt` | `timestamptz` | Nullable |
| `archivedAt` | `timestamptz` | Nullable; **hanya** di-set oleh retention job setelah 12 bulan. Baris tidak dihapus; baris terarsip disembunyikan dari daftar default dan tidak masuk export default kecuali diminta eksplisit |
| `resolutionNote` | `varchar(1000)` | Nullable; wajib 10-1000 karakter saat `SELESAI` |
| `clientRequestId` | `uuid` | **Wajib** dari form/API; unik per pembuat; 400 bila kosong/invalid |
| `isDemo` | `boolean` | Default false; data seed diberi true |
| `createdAt`, `updatedAt` | `timestamptz` | Default now |

Index dan constraint:

- Unique `code`.
- Unique composite `(createdById, clientRequestId)` untuk mencegah double submit. Replay dengan key sama dan payload sama mengembalikan baris yang sama (200); payload berbeda dengan key sama ditolak 409. Field pembanding minimal: `rawText`, `guestName`, `roomNumber`, `channel`.
- Index `(status, createdAt desc)`, `(category, createdAt desc)`, `(department, status)`, `(createdAt desc)`, `(classificationStatus, classificationStartedAt)`, `(channel, createdAt desc)`, `(archivedAt, createdAt desc)`.
- Check: `char_length(btrim(raw_text)) between 5 and 2000`.
- Check: `code ~ '^SG-[0-9]{6}-[A-Z2-7]{4}$'`.
- Check: `resolution_note IS NULL OR char_length(btrim(resolution_note)) between 10 and 1000`.
- Check: `status <> 'SELESAI' OR (resolution_note IS NOT NULL AND closed_at IS NOT NULL)`.
- Check: `status = 'BARU' OR (category IS NOT NULL AND department IS NOT NULL AND verified_at IS NOT NULL AND verified_by_id IS NOT NULL)`.
- Check: `classification_status <> 'FAILED' OR classification_error IS NOT NULL`.
- FK `applied_classification_id` bersifat **deferrable** dan ditambahkan setelah tabel `classifications` dibuat (siklus `complaints` <-> `classifications`).

#### `complaint_events` (append-only)

| Kolom | Tipe | Aturan |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `complaintId` | `uuid` | FK `complaints.id`, `ON DELETE RESTRICT` |
| `eventType` | enum `ComplaintEventType` | Lihat daftar di bawah |
| `actorType` | enum `ActorType` | `USER` atau `SYSTEM` |
| `actorId` | `uuid` | FK `users.id`, nullable untuk aksi sistem |
| `fromStatus`, `toStatus` | enum `Status` | Nullable; hanya untuk event status |
| `metadata` | `jsonb` | Default `{}`; alasan perubahan, kategori lama/baru, source klasifikasi |
| `createdAt` | `timestamptz` | Default now |

`ComplaintEventType`: `COMPLAINT_CREATED`, `CLASSIFICATION_REQUESTED`, `CLASSIFICATION_APPLIED`, `CLASSIFICATION_FAILED`, `CATEGORY_CONFIRMED`, `CATEGORY_CHANGED`, `DEPARTMENT_ASSIGNED`, `STATUS_CHANGED`, `NOTE_ADDED`, `PII_SCRUBBED`.

Check constraint:

- `actor_type = 'SYSTEM'` -> `actor_id IS NULL`.
- `actor_type = 'USER'` -> `actor_id IS NOT NULL`.

Index: `(complaintId, createdAt asc, id asc)` untuk timeline dengan tie-breaker; `(eventType, createdAt desc)` untuk audit.

Append-only ditegakkan di dua lapis: service tidak menyediakan update/delete, dan trigger PostgreSQL menolak `UPDATE`/`DELETE` pada tabel ini. Koreksi audit dilakukan dengan menambah event baru, bukan mengubah event lama. Pengecualian **hanya** untuk scrub PII (B5): trigger mengizinkan `UPDATE` pada kolom `metadata` untuk mengganti nilai sensitif menjadi `[REDACTED]`, dengan syarat baris event tidak dihapus dan event `PII_SCRUBBED` baru ditambahkan. Tidak ada `DELETE` sama sekali.

Batas klaim yang jujur: trigger PostgreSQL **tidak mengenal pemanggil**. Yang dapat ditegakkan database adalah "hanya kolom `metadata` yang boleh di-UPDATE". Jadi rumusannya: **trigger hanya mengizinkan UPDATE kolom `metadata`, dan satu-satunya kode aplikasi yang melakukan UPDATE tersebut adalah `RetentionService`**. Ini adalah invariant kode + review, bukan enforcement tingkat database atas identitas pemanggil.

Catatan penting: scrub tidak boleh menghapus baris `complaint_events`. Dengan demikian timeline tetap utuh setelah PII hilang.

Catatan: event `CLASSIFICATION_*` ditulis bila klasifikasi dipicu dari alur keluhan. Setiap percobaan teknis tetap tercatat di `classifications`; event dipakai untuk timeline yang dibaca petugas. Pemicu eksplisit: `CLASSIFICATION_APPLIED` ditulis saat petugas menerima atau mengganti kategori — yaitu saat `applied_classification_id` diset (bersamaan dengan `CATEGORY_CONFIRMED`/`CATEGORY_CHANGED`); `NOTE_ADDED` ditulis saat petugas menambah catatan internal pada keluhan.

#### `classifications` (jejak setiap percobaan)

| Kolom | Tipe | Aturan |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `requestId` | `uuid` | Wajib; satu ID per permintaan klasifikasi; semua percobaan (LLM gagal, retry internal HTTP, rules) memakai ID yang sama. Dua jenis retry dibedakan: **(a) retry internal HTTP** dalam satu request memakai `requestId` yang sama; **(b) tombol "Coba klasifikasi lagi" oleh petugas** membuat `requestId` baru. |
| `complaintId` | `uuid` | FK `complaints.id` |
| `attemptNo` | `int` | 1..n per keluhan; unique `(complaintId, attemptNo)`; tidak direset saat klasifikasi ulang |
| `source` | enum `ClassificationSource` | `LLM`, `RULES`, `MANUAL` |
| `model` | `varchar(100)` | Nullable untuk rules/manual; isi model + versi |
| `promptVersion` | `varchar(50)` | Nullable; mis. `classify.v1` |
| `promptHash` | `varchar(64)` | Nullable; SHA-256 isi prompt |
| `category` | enum `Category` | Nullable bila percobaan gagal |
| `confidence` | `numeric(4,3)` | Nullable; check 0-1 |
| `reason` | `varchar(300)` | Nullable; ringkas Bahasa Indonesia; dapat di-scrub |
| `latencyMs` | `int` | Wajib; durasi percobaan |
| `rawResponse` | `text` | Nullable; respons provider dipotong 8 KB; dapat di-scrub |
| `errorCode` | `varchar(50)` | Nullable; `TIMEOUT`, `AUTH`, `RATE_LIMIT`, `INVALID_OUTPUT`, `NETWORK`, `PROVIDER_ERROR`, `BUDGET_EXCEEDED` |
| `errorMessage` | `varchar(500)` | Nullable; sudah disanitasi, tanpa secret/PII; dapat di-scrub |
| `injectionSuspected` | `boolean` | Default false; diisi heuristik prompt injection (B10) |
| `isDegraded` (`is_degraded`) | `boolean` | **NOT NULL DEFAULT false**; `true` hanya pada baris final yang merupakan output sintetis degradasi (rules error tak terduga). Dipetakan dari `ClassifierResult.degraded` dan tetap terbaca setelah reload UI |
| `isFinal` | `boolean` | Default false; **tepat satu per `requestId` untuk request `DONE`** (partial unique); request `FAILED` tidak memiliki baris final |
| `isScrubbed` | `boolean` | Default false; penanda baris sudah di-scrub |
| `createdAt` | `timestamptz` | Default now |

Index dan constraint:

- Unique `(complaintId, attemptNo)`.
- **Partial unique `(requestId) WHERE isFinal = true`**: satu keputusan final per request, bukan per keluhan.
- Index `(complaintId, createdAt desc)`, `(requestId)`, `(source, createdAt desc)`.

Aturan `isFinal` dan apply (menggantikan invariant "tepat satu isFinal per keluhan"):

1. Satu permintaan klasifikasi = satu `requestId`. Baris percobaan gagal, retry internal HTTP, dan rules fallback semuanya memakai `requestId` yang sama; hanya baris keputusan akhir request itu yang `isFinal=true`. Retry eksplisit oleh petugas ("Coba klasifikasi lagi") membuat `requestId` baru (lihat §4.4 `requestId`).
2. **Kategori final yang berlaku adalah baris yang ditunjuk `complaints.appliedClassificationId`**, bukan sekadar baris `isFinal` terakhir. `isFinal` berarti "keputusan request ini", bukan "kategori yang sedang dipakai".
3. Klasifikasi ulang membuat `requestId` baru dan baris `isFinal` baru; `appliedClassificationId` hanya berpindah setelah petugas menerapkan hasilnya. Baris final lama tetap ada sebagai riwayat.
4. Bila petugas mengubah kategori secara manual tanpa memanggil AI, buat `requestId` baru, tulis baris `source=MANUAL`, `isFinal=true`, `category` = kategori pilihan petugas, `attemptNo = max(attempt_no)+1` untuk keluhan itu, `latencyMs=0`, `model/promptVersion/promptHash/rawResponse=null`, lalu set `appliedClassificationId` ke baris tersebut.

Append-only dan scrub (S21 + B5):

- Trigger menolak `DELETE` pada `classifications` tanpa kecuali.
- Trigger `UPDATE` hanya mengizinkan perubahan pada `reason`, `raw_response`, `error_message`, dan `is_scrubbed`; kolom keputusan (`request_id`, `complaint_id`, `attempt_no`, `source`, `category`, `confidence`, `latency_ms`, `is_degraded`, `is_final`, `created_at`) bersifat immutable. Upaya mengubah kolom keputusan ditolak database.
- Klaim yang jujur: tabel ini **append-only untuk kolom keputusan**, bukan append-only mutlak, karena kolom teks bebas perlu di-scrub sesuai B5.

#### `ai_usage` (akumulasi biaya AI)

Dipakai untuk menegakkan budget cap O6. Satu baris = satu panggilan LLM yang berhasil (atau panggilan yang mengembalikan usage), bukan satu item evaluasi.

| Kolom | Tipe | Aturan |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `usageDate` | `date` | Tanggal kalender `Asia/Jakarta`; dipakai untuk agregasi harian |
| `provider` | `varchar(50)` | Nama provider, mis. `google` |
| `model` | `varchar(100)` | ID model persis yang dipanggil |
| `inputTokens` | `int` | Nullable; token input dari respons provider, `null` bila provider tidak mengembalikan usage |
| `outputTokens` | `int` | Nullable; token output dari respons provider, `null` bila tidak tersedia |
| `estimatedCostUsd` | `numeric(12,6)` | Estimasi biaya list price; `0` bila free tier |
| `createdAt` | `timestamptz` | Default now |

Index: `(usageDate, provider, model)`.

Aturan budget cap:

1. Sebelum setiap panggilan LLM, jumlahkan `estimated_cost_usd` pada `ai_usage` untuk `usageDate` hari ini (zona `Asia/Jakarta`).
2. Bila akumulasi **sudah >= `AI_BUDGET_USD`**, jangan memanggil network. Langsung jalankan rules fallback dan catat baris `classifications` dengan `source=RULES`, `errorCode=BUDGET_EXCEEDED`, `isFinal=true` (atau `PERLU_DITINJAU` bila rules abstain). Tidak ada baris `ai_usage` baru karena tidak ada panggilan.
3. Setelah panggilan LLM selesai, tulis satu baris `ai_usage` berisi token dan estimasi biaya. Bila respons tidak memuat usage, token diisi `null` dan biaya `0`, serta dicatat di log.
4. Akumulasi dihitung dari tabel, bukan dari variabel in-memory, agar tetap benar setelah restart. Untuk satu instance, pengecekan + insert cukup; bila multi-instance, pengecekan dan insert dibungkus transaksi singkat.

### 4.5 Invariant data

1. Keluhan tidak boleh berstatus `DIPROSES`/`SELESAI` tanpa kategori final, departemen, `verifiedAt`, dan `verifiedById`.
2. Keluhan `SELESAI` wajib punya `resolutionNote` 10-1000 karakter setelah trim dan `closedAt`.
3. Setiap keluhan punya minimal satu event `COMPLAINT_CREATED`.
4. Setiap perubahan kategori, departemen, atau status punya event dengan aktor yang valid (`USER` -> `actorId` terisi; `SYSTEM` -> `actorId` NULL).
5. `complaints.category` harus sama dengan `category` pada baris `classifications` yang ditunjuk `appliedClassificationId`; baris itu harus milik keluhan yang sama dan `isFinal=true`.
6. `appliedClassificationId` boleh NULL hanya selama `status=BARU` dan belum ada kategori final.
7. Tepat satu baris `is_final=true` per `request_id` untuk setiap request berstatus `DONE`. Request `FAILED` (hasil recovery) **tidak memiliki** baris final dan wajib menyimpan `error_message` pada kolom `complaints.classification_error` (ditegakkan partial unique index untuk sisi `DONE` dan check `classification_status <> 'FAILED' OR classification_error IS NOT NULL`). Job pemulihan men-set `FAILED` **hanya jika** tidak ada baris `is_final=true` untuk `request_id` tersebut.
8. `classificationStatus` hanya boleh bertransisi `PENDING -> RUNNING -> DONE`; `RUNNING -> FAILED` hanya oleh job pemulihan setelah `classificationStartedAt` lebih dari 2 menit. `FAILED -> RUNNING` hanya untuk retry eksplisit oleh petugas dengan `requestId` baru (bukan retry internal HTTP; lihat §4.4 `requestId`), dan transisi ini membersihkan `classification_error`. `DONE` tidak boleh kembali ke `RUNNING` tanpa klasifikasi ulang (`requestId` baru).
9. `classifications` tidak boleh dihapus; kolom keputusan immutable; hanya kolom teks bebas yang boleh di-scrub (B5). Audit tetap utuh setelah scrub.
10. Data dengan `isDemo=true` tidak boleh dihitung sebagai data operasional pada laporan pilot tanpa label terpisah.

### 4.6 Query telusur (acuan implementasi)

```sql
-- timeline satu keluhan (tie-breaker id agar urutan deterministik)
SELECT event_type, actor_type, actor_id, from_status, to_status, metadata, created_at
FROM complaint_events
WHERE complaint_id = $1
ORDER BY created_at ASC, id ASC;

-- rekomendasi yang benar-benar di-apply (bukan sekadar is_final terakhir)
SELECT c.source, c.category, c.confidence, c.reason, c.model, c.prompt_version, c.created_at
FROM complaints co
JOIN classifications c ON c.id = co.applied_classification_id
WHERE co.id = $1;

-- seluruh percobaan untuk satu request
SELECT request_id, attempt_no, source, category, confidence, error_code, is_final, created_at
FROM classifications
WHERE complaint_id = $1
ORDER BY attempt_no ASC;
```

### 4.7 Konvensi casing enum dan field (S3)

Aturan umum: **nilai enum tidak diubah casing-nya** dari database sampai JSON. Prisma memakai SCREAMING_SNAKE_CASE; TypeScript memakai literal union yang sama; JSON API memakai nilai yang sama. Nama kolom database `snake_case`, field TypeScript/JSON `camelCase`, dipetakan eksplisit oleh repository/DTO.

| Konsep | Kolom database | Prisma (field: enum) | TypeScript | JSON |
| --- | --- | --- | --- | --- |
| Kategori final | `category` | `category: Category` | `Category` (`KEBERSIHAN_KAMAR`, ...) | `category: "KEBERSIHAN_KAMAR"` |
| Sumber rekomendasi | `recommendation_source` | `recommendationSource: RecommendationSource` | `RecommendationSource` (`RECOMMENDATION_ACCEPTED`, `RECOMMENDATION_EDITED`, `MANUAL`) | `recommendationSource: "RECOMMENDATION_ACCEPTED"` |
| Sumber klasifikasi | `source` | `source: ClassificationSource` | `ClassifierSource = "llm" \| "rules"` (kontrak classifier §5.1) | `source: "LLM" \| "RULES" \| "MANUAL"` |
| Status | `status` | `status: Status` | `Status` (`BARU`, `DIPROSES`, `SELESAI`) | `status: "BARU"` |
| Status klasifikasi | `classification_status` | `classificationStatus: ClassificationStatus` | `ClassificationStatus` (`PENDING`, `RUNNING`, `DONE`, `FAILED`) | `classificationStatus: "PENDING"` |
| Kanal | `channel` | `channel: Channel` | `Channel` (`FRONT_DESK`, ...) | `channel: "FRONT_DESK"` |

Aturan konversi:

- `ClassifierSource` lowercase hanya hidup di dalam `lib/ai`. Di boundary persistence, panggil `toPrismaSource()`: `llm -> LLM`, `rules -> RULES`; `MANUAL` hanya dibuat service, bukan classifier.
- Sebaliknya `toDomainSource()`: `LLM -> llm`, `RULES -> rules`, `MANUAL` tidak dipetakan ke classifier.
- `RecommendationSource` tidak punya versi lowercase. Nama lama `CategorySource` beserta dua nilai lamanya **dihapus** dan tidak boleh muncul di kode, skema, JSON, atau dokumen; gunakan `recommendationSource` + `RECOMMENDATION_ACCEPTED`/`RECOMMENDATION_EDITED`/`MANUAL`.
- Semua validator zod memakai enum uppercase; tidak ada `toLowerCase()` pada nilai enum.

---

## 5. Kontrak classifier

### 5.1 Interface TypeScript

```ts
export const CATEGORIES = [
  "KEBERSIHAN_KAMAR",
  "TEKNISI_FASILITAS",
  "MAKANAN_MINUMAN",
  "RESEPSIONIS",
  "PERLU_DITINJAU",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type ClassifierSource = "llm" | "rules";

export interface ClassifierInput {
  text: string; // sudah di-trim, diredaksi, dan dibatasi 2000 karakter
}

export interface ClassifierAttempt {
  attemptNo: number; // 1..n, monotonik per keluhan
  source: ClassifierSource;
  category: Category | null; // null bila percobaan gagal
  confidence: number | null;
  reason: string | null;
  model: string | null;
  promptVersion: string | null;
  promptHash: string | null; // SHA-256 prompt; null untuk jalur rules
  rawResponse: string | null; // respons provider dipotong 8 KB; null untuk jalur rules
  latencyMs: number;
  errorCode?: "TIMEOUT" | "AUTH" | "RATE_LIMIT" | "INVALID_OUTPUT" | "NETWORK" | "PROVIDER_ERROR" | "BUDGET_EXCEEDED";
  errorMessage?: string;
  injectionSuspected: boolean;
  isFinal: boolean; // true hanya pada satu attempt per requestId
}

export interface ClassifierOutput {
  requestId: string;
  category: Category;
  confidence: number; // 0..1
  reason: string; // <= 200 karakter, Bahasa Indonesia
  source: ClassifierSource;
  model: string | null;
  promptVersion: string | null;
  latencyMs: number;
  errorCode?: string;
}

export interface ClassifierResult {
  requestId: string; // UUID yang sama untuk semua attempts
  attempts: ClassifierAttempt[]; // termasuk LLM gagal, retry, dan rules fallback
  final: ClassifierOutput; // non-nullable, selalu ada
  degraded: boolean; // true hanya bila final adalah output sintetis degradasi; dipetakan ke classifications.is_degraded pada baris final
}

export interface Classifier {
  classify(input: ClassifierInput): Promise<ClassifierResult>;
}

// Rantai produksi; tidak pernah melempar error ke UI.
export function classifyComplaint(text: string): Promise<ClassifierResult>;
```

Kontrak ini menggantikan `ClassifierOutput` tunggal (B1). `requestId` dibuat sekali per permintaan klasifikasi dan dipakai untuk partial unique `(requestId) WHERE isFinal=true`. `attempts` adalah sumber kebenaran audit teknis; `final` adalah ringkasan yang dikembalikan ke UI. `final` bersifat **non-nullable dan selalu ada**: bila rules pun gagal karena error tak terduga, service mengembalikan output sintetis `PERLU_DITINJAU` dengan `confidence=0`, `reason="klasifikasi menurun: fallback"`, `degraded=true`, dan menulis baris `classifications` `is_final=true`, `is_degraded=true`, dengan `classificationStatus=DONE`. `attempts` tetap memuat error aslinya. `rawResponse` dan `promptHash` disimpan per attempt dan dipetakan ke `classifications.raw_response`/`prompt_hash`; keduanya `null` untuk jalur rules.

### 5.2 Bentuk output LLM

Provider diminta mengembalikan JSON objek saja:

```json
{
  "category": "TEKNISI_FASILITAS",
  "confidence": 0.82,
  "reason": "Keluhan menyebut AC tidak dingin dan teknisi belum datang."
}
```

Aturan:

- `category` harus persis salah satu dari lima enum.
- `confidence` harus angka finite 0-1, bukan string.
- `reason` string 1-200 karakter; lebih dari 200 dipotong dan dicatat di log.
- Field tambahan diabaikan, tidak boleh memengaruhi keputusan.
- LLM **tidak boleh** mengembalikan departemen, status, atau aksi. Bila ada, diabaikan.
- `Perlu Ditinjau` adalah output sah dan dihitung sebagai abstain/eskalasi, bukan kegagalan teknis.

Penanganan format (S16):

1. Provider dipanggil dengan `response_format: { type: "json_object" }` bila didukung. Parameter ini opsional; bila provider menolaknya, panggilan tetap berjalan tanpa parameter dan validasi tetap dilakukan.
2. Sebelum parsing, `stripCodeFence()` menghapus pagar ```json ... ``` dan ``` ... ``` di awal/akhir respons.
3. Bila setelah fence masih ada teks tambahan, ambil objek JSON pertama yang seimbang (`{...}`) dan abaikan sisanya **hanya bila** objek itu valid; jika tidak, tolak sebagai `INVALID_OUTPUT`.
4. Test wajib: JSON polos, JSON berpagar ```` ```json ````, JSON berpagar tanpa tag bahasa, JSON dengan teks sebelum/sesudah, dan JSON rusak.

### 5.3 Validasi output dan rantai fallback

| Kondisi | Tindakan | Baris `classifications` | Hasil ke UI / status |
| --- | --- | --- | --- |
| JSON valid (termasuk setelah fence/teks tambahan dibersihkan), enum valid, confidence valid | Terima | `LLM`, `isFinal=true` | Rekomendasi AI; `classificationStatus=DONE` |
| JSON rusak / bukan objek setelah `stripCodeFence()` | Tolak, tanpa retry | `LLM`, `INVALID_OUTPUT`, `isFinal=false` | Lanjut rules; `DONE` |
| Kategori di luar enum | Tolak, tanpa retry | `LLM`, `INVALID_OUTPUT`, `isFinal=false` | Lanjut rules; `DONE` |
| Confidence di luar 0-1 atau bukan angka | Tolak, tanpa retry | `LLM`, `INVALID_OUTPUT`, `isFinal=false` | Lanjut rules; `DONE` |
| Timeout / network error | Retry 1x bila sisa budget > 3 detik, lalu fallback | Baris per percobaan; baris rules `isFinal=true` | Rekomendasi rules; `DONE` |
| HTTP 429 / 5xx | Retry 1x dengan backoff bila budget cukup, lalu fallback | `RATE_LIMIT`/`PROVIDER_ERROR`; baris rules `isFinal=true` | Rekomendasi rules; `DONE` |
| HTTP 401/403 | Tanpa retry, fallback | `AUTH`, `isFinal=false`; rules final | Rekomendasi rules; `DONE` |
| `aiConfigured=false` (salah satu `AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY` kosong) | Tanpa panggilan network | `RULES`, `isFinal=true` | Rekomendasi rules; UI menampilkan "Mode rules-only (AI tidak dikonfigurasi)"; `DONE` |
| Budget cap tercapai (akumulasi `ai_usage` hari ini >= `AI_BUDGET_USD`) | Tanpa panggilan network | `RULES`, `BUDGET_EXCEEDED`, `isFinal=true` | Rekomendasi rules; `DONE` |
| Rules tidak menemukan kata kunci / skor di bawah ambang / seri | Fallback terakhir | `RULES`, `PERLU_DITINJAU`, `isFinal=true` | Perlu Ditinjau; `DONE` |
| Rules error tak terduga | Tangkap di service, hasilkan output sintetis | `RULES`, `PROVIDER_ERROR`/`INVALID_OUTPUT`, `is_final=true`, `is_degraded=true`, `category=PERLU_DITINJAU`, `confidence=0` | Output sintetis `PERLU_DITINJAU` confidence 0, `degraded=true`, `classificationStatus=DONE`; UI menampilkan badge degradasi dari `is_degraded` |

Prinsip: **tidak ada jalur yang membuat create keluhan gagal karena AI.** Create selesai dengan `classificationStatus=PENDING`; klasifikasi berjalan terpisah. Jalur normal selalu berakhir `DONE` dengan tepat satu baris final, termasuk saat LLM gagal dan rules dipakai. `classificationStatus=FAILED` **hanya** dipakai oleh job pemulihan saat proses mati di tengah jalan (baris `RUNNING` lebih dari 2 menit); pada kondisi itu tidak ada baris `isFinal` dan `error_message` wajib diisi pada `complaints.classification_error`. Retry eksplisit membuat `requestId` baru. Event `CLASSIFICATION_FAILED` hanya ditulis oleh job pemulihan tersebut.

Mode rules-only wajib terlihat: `GET /api/health` mengembalikan `aiConfigured`, UI menampilkan badge kecil, dan log boot menulis `aiConfigured=false` (tanpa secret).

### 5.4 Timeout dan retry

| Parameter | Nilai | Catatan |
| --- | --- | --- |
| Timeout per panggilan | 8000 ms | Via `AbortController`, mencakup connect + baca |
| Budget total request klasifikasi | 13000 ms | Deadline keseluruhan; dipakai untuk memutuskan retry |
| Retry | 1 | Hanya timeout, network, 429, 5xx, dan hanya bila sisa budget > 3000 ms |
| Backoff | 750 ms | Tetap dan deterministik |
| Retry untuk output invalid | 0 | Langsung rules agar murah dan deterministik |
| Temperature | 0 | Konstanta kode, bukan env |
| Max output token | 200 | Cukup untuk JSON pendek |
| `maxDuration` route (bila Vercel) | 15 detik | Hanya relevan untuk alternatif Vercel; VPS tidak memakai batas platform |
| Total waktu worst case | 13000 ms | UI menampilkan "mengklasifikasi..." dan tidak membekukan halaman |

Perhitungan worst case: panggilan pertama 8000 ms + backoff 750 ms + sisa budget 4250 ms untuk panggilan kedua = 13000 ms. Bila sisa budget <= 3000 ms, retry tidak dijalankan dan langsung rules. `AI_TIMEOUT_MS` boleh diturunkan lewat env, tetapi tidak boleh melebihi 8000 ms.

### 5.5 Prompt versioning dan penyimpanan prompt

- Prompt disimpan di repo: `lib/ai/prompts/classify.v1.ts`.
- Setiap file mengekspor `PROMPT_VERSION`, `SYSTEM_PROMPT`, dan `buildUserPrompt(text)`.
- Perubahan isi prompt wajib menaikkan versi (`classify.v2`, dst.), menambah hash, dan menjalankan ulang evaluasi pada split dev; split test hanya dipakai untuk hasil final.
- `classifications.promptVersion` dan `promptHash` diisi setiap panggilan LLM.
- Saat boot, `CLASSIFIER_PROMPT_VERSION` divalidasi **fail-fast** terhadap `PROMPT_VERSION` yang diekspor kode. Bila tidak sama, proses berhenti dengan pesan jelas (S15). Nilai env tidak boleh menjadi sumber kebenaran versi prompt.
- Prompt tidak boleh memuat data keluhan nyata, contoh dari test set, atau secret.
- Prompt memuat daftar kategori beserta definisi singkat dan aturan "jangan menebak bila ambigu".

### 5.6 Batas panjang dan normalisasi input

- Form menerima 5-2000 karakter setelah trim; di luar itu ditolak sebelum masuk database.
- Normalisasi: trim, ubah whitespace berulang menjadi satu spasi, hapus karakter zero-width, batasi tetap 2000 karakter.
- Teks kosong/whitespace tidak pernah dikirim ke LLM.
- Teks yang bukan keluhan tetap dikirim; hasil wajar adalah `Perlu Ditinjau` (diuji BB-16).
- Batas 2000 adalah konstanta kode `MAX_COMPLAINT_CHARS` yang terikat pada `varchar(2000)` dan check constraint database. Tidak ada env `MAX_COMPLAINT_CHARS` terpisah (S15); mengubah batas berarti migrasi + konstanta baru.

### 5.7 PII dan redaksi

- `guestName` dan `roomNumber` **tidak pernah** dimasukkan ke prompt, log klasifikasi, atau pesan error.
- Sebelum dikirim ke LLM, teks keluhan diredaksi:
  - email -> `[EMAIL]`
  - nomor telepon Indonesia (`08xx`, `62xx`, `+62xx`) -> `[TELEPON]`
  - NIK 16 digit -> `[NIK]`
  - pola `kamar <nomor>` / `room <nomor>` -> `kamar [NOMOR]`
- Teks asli tetap disimpan di database untuk kebutuhan operasional, tetapi tidak ditampilkan di log.
- Redaksi juga wajib diterapkan pada **log aplikasi**: `rawText`, `guestName`, `roomNumber`, `reason`, `rawResponse`, `resolutionNote`, dan `metadata` event tidak boleh ditulis mentah. Log hanya memuat ID, kategori, status, dan kode error.
- PII di-scrub sesuai jadwal retensi §9.4: **90 hari sejak `closed_at`** untuk keluhan `SELESAI`; untuk keluhan yang belum `SELESAI`, `guestName` dan `roomNumber` di-scrub **180 hari sejak `createdAt`**. Scrub di database, bukan hapus baris.
- Redaksi bersifat best-effort; keterbatasan ini dicatat di laporan evaluasi dan risk register.
- Untuk pilot, kebijakan data provider wajib ditinjau. Free tier tertentu dapat memakai data untuk peningkatan layanan; bila tidak dapat diterima, gunakan provider/akun dengan jaminan no-training.

### 5.8 Guard prompt injection

- Teks tamu dibungkus delimiter `<complaint>...</complaint>`; kemunculan delimiter asli di input dihapus.
- System prompt menyatakan bahwa isi delimiter adalah data, bukan instruksi, dan model hanya boleh mengembalikan JSON kategori.
- Otoritas tetap pada validasi skema: output di luar enum ditolak.
- LLM tidak diberi kemampuan memanggil tool, mengubah database, atau memilih departemen/status.
- Heuristik mendeteksi frasa seperti "abaikan instruksi", "ignore previous", "system prompt", "kamu adalah"; bila terdeteksi, dicatat pada `classifications.injection_suspected=true` dan metadata event. Tidak mengubah jalur keputusan; klasifikasi tetap berjalan dan tetap divalidasi.
- Untuk pengujian deterministik (BB-15), seam test-only `POST /api/test/seam/injection` hanya aktif bila `ENABLE_TEST_SEAMS=true` dan memaksa flag pada percobaan berikutnya. Seam ini tidak terdaftar di build produksi.
- Tidak ada rahasia, system prompt lengkap, atau nama model internal yang dikirim ke pengguna.

### 5.9 Rules classifier

Spesifikasi lengkap ada di **`docs/RULES.md`** (B4). Ringkasnya:

- Berbasis daftar kata kunci per kategori di `lib/ai/rules.ts`, tanpa network dan tanpa random. `RULES_VERSION` saat ini `rules.v1`.
- Setiap kategori punya daftar kata kunci dan bobot 1-3; skor kategori = jumlah bobot kata kunci yang cocok (setelah normalisasi dan penanganan negasi).
- Ambang minimum `MIN_SCORE=3`; bila skor tertinggi di bawah ambang atau seri antar kategori berbeda, hasil `PERLU_DITINJAU`.
- Confidence rules adalah fungsi deterministik dari skor terbaik dan skor kedua (formula di `docs/RULES.md`), 0-1, tidak diklaim terkalibrasi.
- 15 fixture di `docs/RULES.md` wajib lulus unit test dan menjadi baseline evaluasi.
- Versi rules dibekukan **sebelum** split test dibekukan. Setelah beku, perubahan kata kunci/bobot/ambang hanya boleh lewat versi rules baru dan rerun ketiga sistem.
- Isi awal bersifat hipotesis dan boleh direvisi hanya di luar test set.
- Urutan rantai: LLM → rules (kategori, atau `PERLU_DITINJAU` bila rules abstain) → `PERLU_DITINJAU` hanya bila rules abstain. Rules tidak boleh memanggil LLM.

---

## 6. Fase eksekusi

Estimasi dalam hari kerja orang, bersifat target, bukan komitmen tanggal. Fase 4 dapat berjalan paralel dengan Fase 2-3 setelah kontrak classifier dan taxonomy dibekukan.

Catatan referensi file: `docs/RULES.md` dan `docs/BLACKBOX.md` sudah ada di repo ini. Runbook operasional, panduan deploy, naskah demo, dan laporan akhir adalah **artefak yang akan dibuat** pada fase terkait; penyebutannya adalah rencana, bukan tautan ke file yang sudah ada.

### 6.1 Ringkasan fase

| Fase | Nama | Milestone | Estimasi | Dependency | Bisa paralel dengan |
| --- | --- | --- | --- | --- | --- |
| 0 | Fondasi | A | 1,5 | - | - |
| 1 | Kontrak domain | A | 2 | 0 | - |
| 2 | Mesin klasifikasi | A | 3 | 1 | 3 (shell UI), 4 (dataset) |
| 3 | Alur Front Office (UI) | A | 4 | **1 (shell), 1+2 (panel)** | 4 |
| 4 | Dataset & evaluasi | A | **4-6** | 1, 2 (interface) | 2, 3 |
| 5 | Hardening pilot | B | 4 | **A selesai** (F0-F4, F6a, F7 sesuai DoD) | - |
| 6a | Deploy publik demo | A | 1 | 3, 4 | 7 |
| 6b | Deploy produksi pilot | B | 1 | 5 | - |
| 7 | Paket demo & laporan | A | 2 | 3, 4, 6a | 6a |

**Critical path (S13):**

- Milestone A pada **satu worker** dan Fase 4 = 5 hari (titik tengah 4-6): 1,5 + 2 + 3 + 4 + 5 + 1 + 2 = **18,5 hari kerja**. Angka inilah yang dipakai sebagai baseline, bukan 15-17.
- Bila Fase 7 tumpang tindih dengan Fase 6a, Milestone A sekitar 17,5 hari. Bila dua worker dipakai dan Fase 3/Fase 4 benar-benar paralel setelah Fase 2, Milestone A dapat turun ke sekitar 14-15 hari; ini asumsi paralelisasi, bukan baseline.
- Total sampai Milestone B = 18,5 + 4 (Fase 5) + 1 (Fase 6b) = **23,5 hari kerja** (rentang 22,5-24,5 tergantung Fase 4).
- **"A selesai" berarti seluruh DoD Milestone A terpenuhi**, termasuk URL publik (Fase 6a) dan paket demo (Fase 7). Fase 5 tidak boleh mulai dengan alasan "Fase 4 sudah selesai" saja.

Angka ini target perencanaan, bukan janji.

### 6.2 Fase 0 — Fondasi

**Tujuan:** repo aplikasi dapat dijalankan konsisten di lokal, healthcheck dan environment tervalidasi.

**Task:**

- [ ] Scaffold Next.js App Router + TypeScript + Tailwind; ESLint dan Prettier.
- [ ] Pin Node: `.nvmrc` + `engines.node` di `package.json`, dicatat di README.
- [ ] Tambah `lib/env.ts` dengan validasi zod. Env inti (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `POSTGRES_PASSWORD`) wajib dan gagal cepat bila kosong. `AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY` **opsional**; bila salah satu kosong set `aiConfigured=false`, boot tetap sukses.
- [ ] Validasi fail-fast `CLASSIFIER_PROMPT_VERSION` terhadap konstanta `PROMPT_VERSION` di kode (S15).
- [ ] Tambah `Dockerfile` multi-stage (target `app`), user non-root, output standalone; `Dockerfile.migrator` (target `migrator`) berisi Prisma CLI + schema + seed.
- [ ] Tambah `docker-compose.yml`: service `db` (Postgres 16, healthcheck `pg_isready`, volume), `migrate`, `seed` (profile `demo`), dan `app`.
- [ ] Tambah `GET /api/health` yang mengecek `SELECT 1` dan status konfigurasi AI tanpa memanggil provider.
- [ ] Tambah `lib/log.ts` (JSON terstruktur, redaksi field sensitif).
- [ ] Tambah `.env.example` dan `.env.production.example` lengkap; README development notes (npm via `cmd //c`).
- [ ] Siapkan script `lint`, `typecheck`, `test`, `build`; CI opsional tetapi disarankan.

**File/area (lock map):** `package.json`, `.nvmrc`, `tsconfig.json`, `next.config.*`, `tailwind.config.*`, `postcss.config.*`, `Dockerfile`, `Dockerfile.migrator`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `.env.production.example`, `app/api/health/route.ts`, `lib/env.ts`, `lib/log.ts`, `README.md`.

**Dependency:** tidak ada.

**Acceptance criteria:**

- `docker compose --profile demo up --build` dari volume kosong menyalakan db, menjalankan migrasi, seed demo, dan app; healthcheck hijau.
- `GET /api/health` mengembalikan 200 dengan `{ status, db, aiConfigured, version }` tanpa secret; `aiConfigured=false` sah dan tidak membuat app gagal.
- `cmd //c "npm run lint"`, `cmd //c "npm run typecheck"`, `cmd //c "npm run build"` lulus.
- Env **inti** yang hilang membuat proses gagal dengan pesan jelas. Env AI yang hilang **tidak** menggagalkan boot; log menulis `aiConfigured=false`.
- `CLASSIFIER_PROMPT_VERSION` yang tidak cocok dengan kode menggagalkan boot.
- Log tidak memuat password, API key, cookie, atau PII.

**Estimasi:** 1,5 hari. **Artefak:** repo aplikasi yang bisa dijalankan, compose, healthcheck, dokumen env.

### 6.3 Fase 1 — Kontrak domain

**Tujuan:** skema data, auth satu peran, state machine, dan audit dapat diuji tanpa UI.

**Task:**

- [ ] Tulis `prisma/schema.prisma` untuk `users`, `complaints`, `complaint_events`, `classifications`, `ai_usage` dan enum terkait, termasuk `requestId`, `appliedClassificationId`, `classificationStatus`, `channel`, `archivedAt`, `recommendationSource`, `injectionSuspected`, dan `isDegraded`.
- [ ] Buat migrasi SQL yang menambahkan check constraint (termasuk `verified_by_id IS NOT NULL` untuk `DIPROSES`/`SELESAI` dan `resolution_note` 10-1000), index, partial unique `(request_id) WHERE is_final`, dan trigger append-only/scrub. Wajib termasuk index `(classification_status, classification_started_at)` untuk job pemulihan dan index `(archived_at, created_at desc)` untuk arsip.
- [ ] Implementasi `lib/domain/taxonomy.ts`, `status.ts`, `validation.ts` (zod), `enums.ts` (konvensi casing §4.7).
- [ ] Implementasi `lib/auth` (Auth.js credentials, `bcryptjs` cost 12, JWT session 8 jam, tanpa signup); cek `isActive` per request.
- [ ] Implementasi middleware proteksi route; `/login` dan `/api/health` publik.
- [ ] Implementasi `ComplaintService.create` (wajib `clientRequestId`), `verify`, `changeCategory`, `assignDepartment`, `transitionStatus`, `getTimeline`.
- [ ] Implementasi `AuditService` dan penulisan event dalam transaksi yang sama.
- [ ] Implementasi `RetentionService.scrubPii` + event `PII_SCRUBBED`.
- [ ] Seed idempoten: satu user Front Office dan data demo bertanda `isDemo=true`; tersedia sebagai service compose `seed`.
- [ ] Unit test seluruh transisi valid/invalid, constraint, append-only trigger, dan scrub yang tidak menghapus audit.

**File/area:** `prisma/**`, `lib/domain/**`, `lib/auth/**`, `lib/services/**`, `lib/db/**`, `middleware.ts`, `app/(auth)/login/**`, `app/api/complaints/route.ts`, `tests/unit/domain/**`, `tests/integration/audit/**`.

**Dependency:** Fase 0.

**Acceptance criteria:**

- `prisma migrate deploy` bersih pada database kosong.
- Transisi tidak valid ditolak 409 dan tidak menulis event; transisi ke status sama juga 409.
- Update/delete pada `complaint_events` ditolak database; `classifications` menolak DELETE dan menolak UPDATE kolom keputusan.
- Login benar mengarah ke dashboard; akses tanpa sesi diarahkan ke `/login`; API tanpa sesi 401; user `isActive=false` tidak bisa login dan sesi lamanya ditolak pada request berikutnya.
- Keluhan `DIPROSES` tanpa departemen/kategori/verifikator/`verifiedById` ditolak di service dan constraint (test negatif).
- `resolutionNote` 1-9 karakter ditolak; 10-1000 diterima.
- Double submit dengan `clientRequestId` sama menghasilkan satu keluhan; `clientRequestId` kosong ditolak 400.
- Scrub PII mengganti kolom terpilih, menulis `PII_SCRUBBED`, dan seluruh event lama tetap utuh.

**Estimasi:** 2 hari. **Artefak:** skema, migrasi, seed, service domain, test.

### 6.4 Fase 2 — Mesin klasifikasi

**Tujuan:** klasifikasi end-to-end dengan abstraksi provider, fallback deterministik, dan jejak lengkap.

**Task:**

- [ ] Implementasi `lib/ai/client.ts` (OpenAI-compatible, timeout 8 detik, deadline total 13 detik, retry terbatas, `response_format` JSON opsional, budget cap).
- [ ] Implementasi budget cap berbasis tabel `ai_usage`: sebelum panggilan, jumlahkan biaya hari ini (`Asia/Jakarta`) terhadap `AI_BUDGET_USD`; bila terlampaui, lewati network, pakai rules, dan catat `BUDGET_EXCEEDED` pada baris `classifications`. Setelah panggilan sukses, tulis satu baris `ai_usage`.
- [ ] Implementasi job pemulihan klasifikasi macet: baris `RUNNING` dengan `classificationStartedAt` lebih dari 2 menit diubah ke `FAILED`, `classification_error` diisi, event `CLASSIFICATION_FAILED` ditulis, dan tidak ada baris `isFinal` untuk request itu. Job men-set `FAILED` **hanya jika** tidak ada baris `is_final=true` untuk `request_id` tersebut; saat retry dari `FAILED`, `classification_error` dibersihkan.
- [ ] Implementasi `lib/ai/prompts/classify.v1.ts` + hash.
- [ ] Implementasi `lib/ai/validate-output.ts` sesuai tabel 5.3, termasuk `stripCodeFence()` dan ekstraksi objek JSON pertama.
- [ ] Implementasi `lib/ai/rules.ts` sesuai `docs/RULES.md` (`RULES_VERSION`, bobot, ambang, tie-break, formula confidence) + 15 fixture.
- [ ] Implementasi `lib/ai/redact.ts` dan test PII.
- [ ] Implementasi `lib/ai/chain.ts`: LLM → rules (kategori, atau `PERLU_DITINJAU` bila rules abstain) → `PERLU_DITINJAU` hanya bila rules abstain, mengembalikan `ClassifierResult`, tidak pernah throw ke pemanggil.
- [ ] Implementasi `ClassificationService` asinkron: `PENDING -> RUNNING -> DONE` (jalur normal), simpan seluruh `attempts` dengan `requestId`, satu `isFinal=true` per request `DONE`. `FAILED` hanya di-set job pemulihan.
- [ ] Implementasi rate limit klasifikasi (20/menit/user) dan endpoint `POST /api/complaints/[id]/classify`.
- [ ] Test dengan mock provider: valid, JSON berpagar, JSON dengan teks tambahan, invalid enum, timeout, 401, 429, 5xx, `aiConfigured=false`, budget cap, prompt injection.

**File/area:** `lib/ai/**`, `lib/services/classification-service.ts`, `lib/rate-limit.ts`, `app/api/complaints/[id]/classify/route.ts`, `tests/unit/ai/**`, `tests/integration/classify/**`.

**Dependency:** Fase 1. Dataset boleh mulai paralel setelah taxonomy beku.

**Acceptance criteria:**

- Output LLM valid diterima dan disimpan dengan source `LLM`.
- Output di luar enum tidak pernah tersimpan sebagai kategori sah dan memicu rules.
- Internet mati/API key salah menghasilkan rekomendasi rules, bukan error 500.
- `aiConfigured=false` (env AI kosong) tidak memanggil network dan tetap menghasilkan rules; app boot normal.
- Setiap percobaan (termasuk gagal dan retry) punya baris `classifications` dengan `requestId` sama; hanya satu `isFinal=true` per request `DONE`.
- Panggilan provider tidak berada di dalam transaksi DB; test membuktikan transaksi create selesai sebelum classify dipanggil.
- JSON berpagar ```` ```json ````, JSON dengan teks tambahan, dan JSON rusak diuji eksplisit.
- PII terredaksi pada payload yang dikirim ke provider (diverifikasi dengan mock yang merekam request).
- Prompt injection tidak dapat mengubah status/departemen, tetap menghasilkan enum sah, dan `injection_suspected=true` tercatat.
- Rate limit endpoint classify mengembalikan 429 dengan `Retry-After` pada request ke-21.
- Budget cap: dengan akumulasi `ai_usage` hari ini >= `AI_BUDGET_USD`, tidak ada panggilan network; hasil rules dan baris `BUDGET_EXCEEDED` tercatat.
- Job pemulihan mengubah baris `RUNNING` > 2 menit menjadi `FAILED` tanpa baris `isFinal`, mengisi `classification_error`, dan menulis `CLASSIFICATION_FAILED`; baris `RUNNING` < 2 menit tidak disentuh. Job **tidak** men-set `FAILED` bila sudah ada baris `is_final=true` untuk `request_id` itu; retry dari `FAILED` membersihkan `classification_error`.
- Rules error tak terduga menghasilkan output sintetis `PERLU_DITINJAU` confidence 0 dengan `degraded=true` dan `is_degraded=true` tersimpan pada baris final (UI tetap menampilkan status degradasi setelah reload), status `DONE`, bukan `FAILED`.

**Estimasi:** 3 hari. **Artefak:** classifier, rules, prompt v1, test, endpoint klasifikasi.

### 6.5 Fase 3 — Alur Front Office (UI)

**Tujuan:** enam fitur inti dapat digunakan petugas dari login sampai rekap.

**Task:**

- [ ] Halaman daftar keluhan: filter status/kategori/departemen/channel/tanggal, pagination; baris `archived_at` tidak tampil di daftar default. Pencarian kode `[jika disetujui]`.
- [ ] Form keluhan baru: validasi 5-2000 karakter, counter, nama/kamar opsional, `channel`, `clientRequestId` wajib.
- [ ] Panel rekomendasi AI: kategori, confidence, source (LLM/rules), alasan, status klasifikasi, tombol retry. Tombol "coba klasifikasi ulang" `[jika disetujui]`.
- [ ] Dialog verifikasi: terima rekomendasi atau ubah kategori dengan alasan wajib.
- [ ] Pemilihan departemen dengan saran mapping, tetapi dapat diubah.
- [ ] Aksi status `BARU -> DIPROSES -> SELESAI`, dialog resolusi wajib 10-1000 karakter.
- [ ] Dashboard: kartu total/status/kategori, **kartu rekap "asal keluhan" per `channel`**, rekap departemen, daftar perlu ditinjau, daftar **"keluhan terbuka > 180 hari"**, banner data demo. Filter dashboard menyertakan `channel`. Tren 7/30 hari `[jika disetujui]`.
- [ ] Timeline audit pada halaman detail; aksi tambah catatan internal menulis event `NOTE_ADDED`. Event `CLASSIFICATION_APPLIED` ditulis saat petugas menerima/mengganti kategori, yaitu saat `appliedClassificationId` diset.
- [ ] Export CSV sesuai filter (kolom bagian 10.6).
- [ ] Empty state, loading, error state, disabled state saat submit; layout responsif.
- [ ] Setelah create sukses, UI memanggil classify dan menampilkan state `PENDING/RUNNING/DONE/FAILED` tanpa membekukan halaman; tombol retry saat `FAILED`.

**File/area:** `app/(app)/**`, `components/**`, `app/api/export/complaints/route.ts`, `lib/services/dashboard-service.ts`, `tests/e2e/**`.

**Dependency:** **1 (shell), 1+2 (panel)**. Shell UI boleh mulai setelah Fase 1; panel klasifikasi menunggu Fase 2.

**Acceptance criteria:**

- Alur happy path BB-01 s.d. BB-03 lulus.
- Tidak ada tombol yang mengubah status tanpa dialog konfirmasi dan tanpa syarat terpenuhi.
- Dashboard kosong menampilkan nol/empty state, bukan NaN atau error; kartu "asal keluhan" dan filter `channel` berfungsi.
- Export CSV hanya memuat baris sesuai filter, memuat kolom `channel`, tidak memuat `guestName`/`roomNumber`/`rawText`, dan `resolutionNote` di-redaksi. Baris `archived_at` tidak masuk export default.
- Semua teks yang dimasukkan pengguna di-escape; tidak ada `dangerouslySetInnerHTML`.
- Akses tanpa login selalu dialihkan; tidak ada data yang bocor lewat RSC payload.
- UI menampilkan mode rules-only saat `aiConfigured=false` dan tidak memblokir alur.

**Acceptance terpisah untuk task `[jika disetujui]` (S5):**

- Pencarian kode: hanya mencari `code` persis/prefix, tidak memindai `rawText`; test query.
- Tombol klasifikasi ulang: menambah `requestId` baru, tidak mengubah kategori final sampai petugas menerapkan; test integrasi.
- Tren 7/30 hari: query agregat memakai index tanggal; test angka nol dan rentang kosong.

Bila salah satu tidak disetujui, UI tetap berfungsi tanpa fitur tersebut dan acceptance di atas tidak berlaku.

**Estimasi:** 4 hari. **Artefak:** UI lengkap, dashboard, export, E2E test.

### 6.6 Fase 4 — Dataset & evaluasi

**Tujuan:** baseline rules/LLM/hybrid terukur dan dapat direproduksi.

**Task:**

- [ ] Tulis 200 item sintetis sesuai `docs/EVALUATION.md` (40/kategori, ~25% ambigu), termasuk komposisi 40 item `PERLU_DITINJAU`: 15 ambigu multi-intent, 15 `not_complaint`, 10 konteks kurang. Total 50 item ambigu = 15 ambigu di `PERLU_DITINJAU` + 35 ambigu tersebar di 4 kategori non-`PERLU_DITINJAU` (±9 per kategori).
- [ ] Bekukan `RULES_VERSION` (`rules.v1`) **sebelum** split test dibekukan.
- [ ] Validasi skema JSONL, distribusi, split, dan near-duplicate lintas split (trigram/Jaccard > 0,90 ditolak).
- [ ] Bekukan manifest hash split test.
- [ ] Implementasi harness yang memakai interface classifier yang sama untuk rules, LLM, hybrid; hybrid memakai ulang prediksi LLM dari run yang sama.
- [ ] Hitung accuracy, macro-F1, per-class P/R/F1, confusion matrix, prediksi `PERLU_DITINJAU`, operational abstain, invalid-output rate, fallback rate, latency p50/p95, biaya per 1000.
- [ ] Jalankan analisis error dan tulis 10-20 contoh kesalahan.
- [ ] Jalankan uji stabilitas 3x pada **DEV subset 30 item**, bukan test.
- [ ] Hasilkan CSV, HTML report, dan ringkasan markdown; commit hasil.
- [ ] Tulis keterbatasan dan ancaman validitas.

**File/area:** `eval/**`, `tests/fixtures/eval/**`, script di `package.json`, `docs/EVALUATION.md`.

**Dependency:** taxonomy Fase 1 dan interface classifier Fase 2. Penulisan item bisa mulai lebih awal; harness butuh interface beku.

**Acceptance criteria:**

- Dataset tepat 200 item, 40 per kategori (24 dev/16 test), 50 item ambigu (± 2) dengan rincian 15 ambigu multi-intent di `PERLU_DITINJAU` + 35 ± 2 di kategori non-`PERLU_DITINJAU` (±9 per kategori), split dev/test beku; komposisi `PERLU_DITINJAU` sesuai target.
- Rules dibekukan sebelum hash test; perubahan setelah itu = `rules.v2` + rerun ketiga sistem.
- Near-duplicate lintas split (Jaccard trigram > 0,90) = 0.
- Harness yang sama menghasilkan laporan untuk tiga sistem tanpa mengubah dataset; hybrid tidak memanggil provider lagi.
- Semua metrik dapat dihitung ulang dari file prediksi mentah; `predictions.jsonl` memuat `run_id`, `request_id`, `input_tokens`, `output_tokens` (token `null` untuk rules/manual), dan `source` uppercase.
- Laporan memuat confusion matrix 5x5 dan daftar error, bukan hanya angka agregat.
- Uji stabilitas 3x memakai DEV subset 30 item; test tidak dipakai berulang.
- Tidak ada angka hasil yang dikarang; bila belum dijalankan, ditulis "belum diukur".

**Estimasi:** **4-6 hari** (dataset + harness + 3 run + laporan). **Artefak:** dataset, manifest, harness, laporan tiga arah, analisis error.

### 6.7 Fase 5 — Hardening pilot (Milestone B)

**Tujuan:** aplikasi siap dipakai terbatas di satu hotel, bukan sekadar demo.

**Task:**

- [ ] UAT dengan minimal 3 petugas Front Office; catat dan tutup temuan.
- [ ] Evaluasi eksternal 30 keluhan nyata (dengan izin dan anonimisasi).
- [ ] Load test 50 pengguna bersamaan; perbaiki query/index yang lambat.
- [ ] Rate limit bersama untuk lebih dari satu instance bila replika ditambah.
- [ ] Backup otomatis + restore drill; dokumentasikan RPO/RTO.
- [ ] Job retensi dan **scrub PII** (anonymize, bukan delete baris); event `PII_SCRUBBED` oleh `SYSTEM`.
- [ ] Review keamanan (OWASP Top 10), dependency audit, header keamanan.
- [ ] Monitoring uptime, alert error rate, runbook insiden.
- [ ] Sinkronkan nama departemen hotel pilot dengan mapping.
- [ ] Review kebijakan data provider AI untuk pilot.

**File/area:** `infra/**`, runbook operasional (artefak Fase 5), `lib/rate-limit.ts`, `prisma/migrations/**`, job retensi, konfigurasi monitoring, test beban.

**Dependency:** Milestone A selesai dan hotel pilot tersedia.

**Acceptance criteria:**

- Tidak ada blocker UAT yang belum ditutup.
- Load test memenuhi target p95 < 3 detik pada data pilot.
- Restore dari backup berhasil dalam RTO target.
- Job retensi terbukti men-scrub PII sesuai kebijakan, **tanpa menghapus satu pun baris `complaint_events` lama**; jumlah event lama tetap dan total bertambah tepat satu `PII_SCRUBBED`, dibuktikan test.
- 30 keluhan nyata dianotasi dan hasilnya dilaporkan dengan batasan.
- Runbook diuji pada satu simulasi insiden.

**Estimasi:** 4 hari. **Artefak:** laporan UAT, hasil load test, bukti restore, hasil eval nyata, runbook.

### 6.8 Fase 6 — Deploy publik

**Tujuan 6a:** URL demo akademik aktif dan aman. **Tujuan 6b:** deployment pilot dengan operasi dasar.

**Task 6a:**

- [ ] Siapkan VPS, firewall (22/80/443), DNS.
- [ ] Jalankan compose produksi app + db + Caddy; TLS otomatis.
- [ ] Set secret produksi, rotasi kredensial demo, dan jalankan tanpa profile `demo` (seed tidak berjalan otomatis).
- [ ] Jalankan migrasi lewat service satu kali, bukan saat request.
- [ ] Uji login, klasifikasi, export, healthcheck dari luar.
- [ ] Siapkan prosedur reset data demo.

URL publik pada 6a adalah **DoD Milestone A**. Demo lokal tidak memenuhi DoD; bila terpaksa, catat sebagai deviasi darurat (change request D11/O5) dan tetap sediakan video cadangan.

**Task 6b:**

- [ ] Backup harian + salinan mingguan di luar host.
- [ ] Uptime monitor dan alert.
- [ ] Log rotation dan retensi log.
- [ ] Rollback image dan migrasi dikeringkan (dry run).
- [ ] Dokumentasi akses dan serah terima kredensial.

**File/area:** `docker-compose.prod.yml`, `Caddyfile`, `.env.production.example`, panduan deploy (artefak Fase 6), runbook operasional (artefak Fase 5), script backup.

**Dependency:** 6a setelah Fase 3-4; 6b setelah Fase 5.

**Acceptance criteria:**

- HTTPS aktif, HTTP redirect ke HTTPS, healthcheck hijau.
- Tidak ada secret di repo atau image; image berjalan sebagai non-root.
- Migrasi dan rollback diuji di staging.
- Kredensial demo tidak sama dengan kredensial produksi.
- Backup otomatis terverifikasi.

**Estimasi:** 1 hari (6a) + 1 hari (6b). **Artefak:** URL publik, konfigurasi deploy, runbook, bukti rollback.

### 6.9 Fase 7 — Paket demo & laporan

**Tujuan:** presentasi konsisten dengan implementasi dan bukti.

**Task:**

- [ ] Siapkan 8-12 keluhan showcase (mencakup semua kategori, satu fallback, satu selesai, satu perlu ditinjau).
- [ ] Tulis skrip demo 5 menit dan latihan dua kali.
- [ ] Rekam video cadangan **dua jalur** (LLM aktif dan rules-only) dan screenshot untuk slide.
- [ ] Perbarui deck M1-M5 sesuai bagian 14.
- [ ] Lampirkan ringkasan evaluasi, confusion matrix, risk register, dan riwayat keputusan terkunci.
- [ ] Siapkan daftar pertanyaan yang mungkin muncul beserta jawaban berbasis data.
- [ ] Pastikan semua klaim di deck dapat ditelusuri ke artefak.

**File/area:** naskah demo dan laporan akhir (artefak Fase 7), `eval/reports/**`, materi presentasi di luar repo bila perlu.

**Dependency:** Fase 3, 4, 6a.

**Acceptance criteria:**

- Demo berjalan dua kali berturut-turut di bawah 6 menit tanpa langkah manual tersembunyi.
- Setiap fitur yang diklaim di deck benar-benar ada.
- Angka evaluasi di deck sama dengan file hasil.
- Keterbatasan dataset disebut eksplisit.

**Estimasi:** 2 hari. **Artefak:** skrip demo, video, deck final, ringkasan laporan.

---

## 7. Metodologi evaluasi (ringkas)

Detail lengkap di `docs/EVALUATION.md`.

- **Dataset:** 200 keluhan sintetis, 40 per kategori, ~25% ambigu/multi-intent, variasi typo, campur Inggris, panjang bervariasi. Komposisi 40 item `PERLU_DITINJAU`: 15 ambigu multi-intent, 15 `not_complaint`, 10 konteks kurang. Total 50 item ambigu = 15 ambigu di `PERLU_DITINJAU` + 35 ambigu di 4 kategori non-`PERLU_DITINJAU` (±9 per kategori). Satu label tunggal per item + catatan.
- **Split:** dev 120 / test 80 (24/16 per kategori), stratifikasi ambigu, dibekukan dengan hash manifest. Dev untuk iterasi prompt/rules; test hanya untuk hasil final.
- **Urutan pembekuan:** `RULES_VERSION` dibekukan lebih dulu, lalu test split di-hash. Setelah final run, perubahan label = dataset versi baru + hash baru + rerun **ketiga** sistem; hasil lama diarsipkan.
- **Sistem yang dibandingkan:** (1) rules saja, (2) LLM saja dengan prompt/model dipin, (3) hybrid sesuai rantai produksi. Ketiganya memakai test set yang sama dan beku.
- **Perilaku saat gagal (B6):** rules-only selalu memakai rules; LLM-only bila invalid/timeout -> `PERLU_DITINJAU` **tanpa** fallback rules; hybrid memakai rantai LLM → rules (kategori, atau `PERLU_DITINJAU` bila rules abstain) → `PERLU_DITINJAU` hanya bila rules abstain.
- **Reuse prediksi (B6):** hybrid memakai ulang prediksi LLM dari run yang sama, bukan memanggil provider lagi. Konsekuensi: biaya hybrid = biaya LLM; tidak ada biaya tambahan untuk rules.
- **Metrik:** accuracy, macro-F1, per-class precision/recall/F1, confusion matrix 5x5, **prediksi kelas `PERLU_DITINJAU`**, **operational abstain rate** (item non-`PERLU_DITINJAU` yang diprediksi `PERLU_DITINJAU`), invalid-output rate, fallback rate, latency p50/p95, biaya per 1000. Target awal (belum diukur, bukan hasil): rules macro-F1 >= 0,60; **LLM dan hybrid sama-sama >= 0,80**; p95 latency LLM <= 8 detik.
- **Stabilitas:** 3 run pada **DEV subset 30 item**, bukan test; hasil test tidak dipakai untuk memilih run terbaik.
- **Reproducibility:** seed dataset tetap, file test di-hash, model ID dan prompt version dipin, temperature 0, hasil mentah prediksi disimpan, commit hash dicatat.
- **Kejujuran:** dataset sintetis tidak mewakili distribusi nyata. Klaim performa harus menyebut sumber data, jumlah, dan batasan. Uji tambahan 30 keluhan nyata dilakukan saat pilot.
- **Laporan:** CSV + HTML + ringkasan markdown di `eval/reports/`; semua angka harus bisa dihitung ulang dari `predictions.jsonl`.

---

## 8. Matriks verifikasi black-box

Matriks lengkap (prasyarat, langkah, hasil diharapkan, hasil aktual, bukti, status) ada di **`docs/BLACKBOX.md`**. Bagian ini hanya memetakan ID ke jenis dan fase pemilik. Semua skenario dijalankan pada build yang sama dengan dataset demo; hasil dicatat di `docs/BLACKBOX.md`.

| ID | Ringkasan | Jenis | Fase pemilik |
| --- | --- | --- | --- |
| BB-01 | Create cepat (`PENDING`), lalu classify asinkron; keluhan tersimpan | F | 1, 2, 3 |
| BB-02 | Terima rekomendasi; `recommendationSource=RECOMMENDATION_ACCEPTED` | F | 1, 3 |
| BB-03 | Ubah kategori; `RECOMMENDATION_EDITED` + alasan | F | 1, 3 |
| BB-04 | Alasan ubah kategori kosong ditolak | N | 1, 3 |
| BB-05 | `DIPROSES` tanpa kategori/departemen/verifikator ditolak | N | 1, 3 |
| BB-06 | `SELESAI` tanpa catatan atau catatan 1-9 karakter ditolak | N | 1, 3 |
| BB-07 | `BARU -> SELESAI` ditolak 409 | N | 1 |
| BB-08 | `SELESAI -> DIPROSES` ditolak 409 | N | 1 |
| BB-09 | Teks kosong ditolak | N | 1, 3 |
| BB-10 | Hanya whitespace ditolak | N | 1, 3 |
| BB-11 | 2001+ karakter ditolak | N | 1, 3 |
| BB-12 | 1-4 karakter ditolak | N | 1, 3 |
| BB-13 | XSS di-escape | S | 3 |
| BB-14 | SQL injection diperlakukan sebagai teks | S | 1 |
| BB-15 | Prompt injection tidak mengubah aksi; flag `injection_suspected` | S | 2 |
| BB-16 | Teks bukan keluhan -> `Perlu Ditinjau`/kategori wajar | N | 2 |
| BB-17 | Campur Indonesia-Inggris tetap menghasilkan enum sah | F | 2 |
| BB-18 | Double submit `clientRequestId` sama -> satu keluhan | N | 1, 3 |
| BB-19 | LLM output di luar enum -> rules; satu `requestId`, satu `isFinal` | F | 2 |
| BB-20 | Provider mati/timeout -> rules, keluhan tetap tersimpan, UI tidak 500 | F | 2 |
| BB-21 | API key invalid -> rules, `AUTH` tercatat, key tidak bocor | S | 2 |
| BB-22 | HTTP 429 -> retry 1x lalu rules | F | 2 |
| BB-23 | Request classify ke-21 dalam 1 menit -> 429 `Retry-After` | S | 2 |
| BB-24 | Tanpa sesi -> redirect/401 | S | 1 |
| BB-25 | Percobaan login gagal ke-5 diblokir, pesan generik | S | 1 |
| BB-26 | Export CSV sesuai filter, tanpa PII default, aman formula | F | 3 |
| BB-27 | Dashboard kosong -> nol/empty state | F | 3 |
| BB-28 | Delete/update event audit ditolak trigger (kecuali redaksi `metadata` via scrub) | S | 1 |
| BB-29 | PII teredaksi di payload provider dan log | S | 2 |
| BB-30 | Ubah kategori setelah `SELESAI` ditolak | N | 1, 3 |
| BB-31 | Transisi ke status yang sama -> 409 | N | 1 |
| BB-32 | Stale update / optimistic concurrency -> 409 | N | 1, 3 |
| BB-33 | Alasan ubah kategori 1-9 karakter ditolak | N | 1, 3 |
| BB-34 | Alasan ubah departemen saat `DIPROSES` wajib | N | 1, 3 |
| BB-35 | User nonaktif tidak bisa login; sesi lama ditolak | S | 1 |
| BB-36 | Rate limit create/export -> 429 | S | 1, 3 |
| BB-37 | Trigger `classifications`: DELETE ditolak, UPDATE hanya kolom teks bebas (scrub), kolom keputusan immutable | S | 1 |

### 8.1 Seam pengujian

- **Route transisi test-only:** `POST /api/test/seam/transition` hanya terdaftar bila `ENABLE_TEST_SEAMS=true`; di produksi env ini wajib `false` dan route mengembalikan 404.
- **Mock provider:** arahkan `AI_BASE_URL` ke stub lokal (mis. `http://mock-ai:8080/v1`) yang bisa mengembalikan JSON valid, JSON berpagar, enum invalid, 429, 401, timeout, atau koneksi mati.
- **`injectionSuspected`:** kolom `classifications.injection_suspected` + seam `POST /api/test/seam/injection` (test-only) untuk memaksa flag pada percobaan berikutnya.
- **BB-23:** rate limit yang diuji adalah endpoint `POST /api/complaints/[id]/classify`, 20/menit/user; request ke-21 = 429.
- **BB-25:** blokir terjadi pada **percobaan gagal ke-5** (bukan setelah), dengan pesan generik dan `Retry-After`.
- **BB-36:** rate limit create 10/menit/user dan export 5/menit/user diuji terpisah.

Catatan eksekusi: BB-15, BB-19, BB-20, BB-21, BB-22 membutuhkan mock/fault injection atau seam test-only; jangan mengandalkan mematikan internet hotel saat demo. Untuk demo, gunakan data seed yang sudah memuat jejak fallback.

---

## 9. Keamanan & privasi

### 9.1 Kontrol wajib

| Area | Kontrol |
| --- | --- |
| Secret | Hanya di env server; `.env*` di-ignore kecuali `.env.example` dan `.env.production.example`; tidak ada `NEXT_PUBLIC_` untuk AI atau database; rotasi kredensial demo sebelum publik |
| Validasi input | Zod di server untuk semua form/route; batas panjang; whitelist enum; normalisasi sebelum simpan; `clientRequestId` wajib UUID |
| Output encoding | React escaping default; larang `dangerouslySetInnerHTML`; CSV escape terhadap formula `= + - @` |
| Autentikasi | Auth.js credentials, `bcryptjs` cost 12, pesan login generik, throttle login 5/menit/IP, session 8 jam, cookie `httpOnly`, `secure` di produksi, `sameSite=lax` |
| Otorisasi | Semua halaman dan API memeriksa sesi **dan `isActive` per request** (bukan hanya saat login); satu peran tetapi tetap cek per request; tidak ada akses objek tanpa sesi |
| Rate limit | Klasifikasi 20/menit/user; create 10/menit/user; export 5/menit/user; login 5/menit/IP (blokir pada percobaan gagal ke-5). In-memory untuk satu instance; bila multi-instance, pindah ke penyimpanan bersama di Fase 5 |
| Prompt injection | Delimiter, instruksi sistem, validasi skema, tanpa tool; LLM tidak dapat mengubah status/departemen; flag `injection_suspected` |
| Audit | Event append-only dengan aktor dan timestamp; trigger menolak delete/update struktural; UPDATE `metadata` hanya diizinkan trigger dan satu-satunya kode aplikasi yang melakukannya adalah `RetentionService`; `PII_SCRUBBED` tidak menghapus event |
| Log | JSON terstruktur; redaksi `password`, `authorization`, `cookie`, `AI_API_KEY`, `guestName`, `roomNumber`, `rawText`, `reason`, `rawResponse`, `resolutionNote`; simpan ID keluhan, bukan isi |
| Error | Pesan generik ke pengguna; detail hanya di server; tidak menampilkan stack trace |
| Header | HSTS (produksi), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`/`frame-ancestors 'none'`, CSP dasar |
| Dependency | Lockfile di-commit; `npm audit` di CI; kurangi dependency; review pembaruan besar |
| Backup | Harian, retensi 14 hari lokal + mingguan offsite; restore diuji |
| Retensi | Keluhan 12 bulan lewat flag `archived_at` (bukan delete); PII 90 hari sejak `closed_at`; keluhan belum `SELESAI`: `guest_name`/`room_number` 180 hari sejak `created_at`; log 30 hari (O4, terkunci) |
| Monitoring | Healthcheck, uptime monitor, alert error rate dan fallback rate; Sentry hanya bila disetujui (butuh persetujuan terpisah) |

### 9.2 Data dan PII

- Data minimum: teks keluhan wajib; nama dan nomor kamar opsional.
- Nama/kamar tidak dikirim ke LLM dan tidak masuk log.
- Teks keluhan sendiri bisa memuat PII; redaksi best-effort sebelum ke provider.
- Export CSV default tidak memuat nama, nomor kamar, teks mentah, dan `resolutionNote` (di-redaksi/dikeluarkan).
- Tidak ada data tamu nyata di repo, test, atau dataset evaluasi.
- Data demo diberi flag dan banner agar tidak dikira data operasional.
- PII di-scrub di tempat sesuai §9.4: 90 hari sejak `closed_at`; untuk keluhan belum `SELESAI`, `guestName`/`roomNumber` 180 hari sejak `createdAt`. Baris dan audit tetap ada.

### 9.3 Pemetaan NIST AI RMF 1.0

| Fungsi | Praktik di proyek ini | Artefak |
| --- | --- | --- |
| Govern | Kebijakan "AI merekomendasikan, manusia memutuskan"; pemilik sistem; versi prompt/model; tidak ada auto-action; review risiko | Dokumen ini, risk register, riwayat prompt |
| Map | Batas penggunaan (5 kategori, 1 peran, teks Indonesia); alur data dan PII; stakeholder Front Office; dataset dan keterbatasannya | Bagian 4-5, `EVALUATION.md` |
| Measure | Evaluasi 200 item, confusion matrix, macro-F1, abstain rate, latency, biaya; uji black-box termasuk kegagalan; audit kelengkapan | Laporan eval, matriks BB, log klasifikasi |
| Manage | Fallback rules, timeout/retry, rate limit, rollback, retensi/scrub, runbook insiden, mitigasi risiko, riwayat keputusan terkunci | Rantai classifier, runbook, risk register |

Catatan: pemetaan ini ringkas dan tidak mengklaim sertifikasi atau kepatuhan penuh NIST.

### 9.4 Retensi dan scrub PII (B5)

Retensi **tidak menghapus baris**. Data di-anonymize/scrub di tempat agar referensi audit tetap valid.

| Data | Batas | Tindakan |
| --- | --- | --- |
| Keluhan (baris `complaints`) | 12 bulan sejak `created_at` | Set `archived_at` oleh retention job; **baris tidak dihapus**, tetapi disembunyikan dari daftar default dan tidak masuk export default kecuali diminta eksplisit (`include_archived=true`) |
| PII keluhan `SELESAI` | **90 hari sejak `closed_at`** | Scrub `guest_name`, `room_number`, `raw_text`, `resolution_note`; baris dan relasi tetap ada |
| PII keluhan belum `SELESAI` | **180 hari sejak `created_at`** | Scrub `guest_name` dan `room_number` saja; `raw_text`/`resolution_note` tidak di-scrub. Keluhan tetap tampil di laporan **"keluhan terbuka > 180 hari"** |
| Log aplikasi | 30 hari | Rotasi + hapus file log (bukan data operasional) |

`archived_at` adalah flag, bukan penghapusan: nilainya hanya di-set oleh retention job, tidak pernah oleh UI, dan baris terarsip tetap dapat ditelusuri lewat query eksplisit/audit.

Kolom `reason`, `raw_response`, dan `error_message` pada `classifications` **tidak punya jadwal retensi terpisah**: ketiganya mengikuti jadwal scrub keluhan induknya, yaitu **90 hari sejak `closed_at`** keluhan tersebut. Untuk keluhan yang belum `SELESAI`, kolom teks bebas `classifications` tidak di-scrub karena jadwal induknya (180 hari sejak `created_at`) hanya menyentuh `guest_name` dan `room_number`.

Kolom yang boleh di-scrub:

| Tabel | Kolom | Nilai pengganti |
| --- | --- | --- |
| `complaints` | `guest_name`, `room_number` | `NULL` |
| `complaints` | `raw_text` | `[REDACTED]`; bukan `NULL`/string kosong agar check `char_length(btrim(raw_text)) between 5 and 2000` tetap valid |
| `complaints` | `resolution_note` | **selalu `[REDACTED]` (10 karakter), tidak pernah `NULL`**; check `char_length(btrim(resolution_note)) between 10 and 1000` dan check `SELESAI` tetap valid |
| `classifications` | `reason`, `raw_response`, `error_message` | `[REDACTED]` atau `NULL`; set `is_scrubbed=true`. `reason` bila di-scrub memakai `[REDACTED]` |
| `complaint_events` | nilai sensitif di dalam `metadata` | `[REDACTED]`; struktur event dan `event_type` tidak berubah |

**Mengapa `resolution_note` memakai `[REDACTED]` dan tidak di-`NULL`-kan:** check constraint `resolution_note IS NULL OR char_length(btrim(resolution_note)) between 10 and 1000` dan check `status <> 'SELESAI' OR resolution_note IS NOT NULL` adalah invariant "SELESAI wajib punya catatan". Bila scrub mengisi `NULL`, baris `SELESAI` akan melanggar check dan/atau menghapus invariant tersebut. Marker `[REDACTED]` panjangnya tepat 10 karakter sehingga lolos batas bawah 10 dan tetap non-NULL. Constraint **tidak dilonggarkan**; marker dipilih agar scrub PII tidak mengubah status, tidak merusak audit, dan tetap memenuhi kontrak domain.

Aturan:

1. Scrub dan arsip dijalankan oleh `RetentionService` (job terjadwal), bukan oleh UI. `RetentionService` adalah satu-satunya kode aplikasi yang meng-UPDATE `complaint_events.metadata` dan yang men-set `complaints.archived_at`.
2. Setiap keluhan yang di-scrub menulis event baru `PII_SCRUBBED` dengan `actor_type=SYSTEM`, `actor_id=NULL`, dan metadata berisi **daftar kolom** yang di-scrub (bukan nilainya).
3. **Audit tetap utuh setelah scrub:** tidak ada baris `complaint_events` lama yang dihapus atau diubah tipenya; jumlah event lama tetap, dan total bertambah tepat 1 event `PII_SCRUBBED`. Trigger `complaint_events` hanya mengizinkan UPDATE kolom `metadata` untuk redaksi, tidak untuk menghapus. Trigger PostgreSQL tidak mengenal pemanggil, jadi "hanya `RetentionService` yang meng-UPDATE" adalah invariant kode + review, bukan enforcement tingkat database.
4. `resolutionNote` dikeluarkan dari export default; bila export eksplisit memintanya, nilainya diredaksi. Setelah scrub, nilainya `[REDACTED]` (bukan `NULL`).
5. Log aplikasi juga meredaksi kolom yang sama; scrub database tidak membatalkan kewajiban redaksi log.
6. Keluhan berumur 12 bulan: retention job men-set `archived_at`, tidak menghapus baris. Daftar default dan export default mengecualikan baris dengan `archived_at IS NOT NULL`; query/export eksplisit dapat memintanya dengan `include_archived=true`.
7. Test wajib (skenario B5): buat keluhan `SELESAI` + beberapa event, jalankan scrub, lalu pastikan (a) `guest_name`/`room_number` menjadi `NULL`, `raw_text` menjadi `[REDACTED]`, (b) `resolution_note` menjadi `[REDACTED]` dan **tetap non-NULL**, (c) baris `SELESAI` masih lolos check constraint dan invariant 2, (d) jumlah event lama tidak berubah, (e) event `PII_SCRUBBED` ada dengan `actor_type=SYSTEM`, (f) timeline keluhan masih dapat dibaca. Test terpisah: keluhan belum `SELESAI` berumur > 180 hari hanya men-scrub `guest_name`/`room_number` dan tetap muncul di laporan "keluhan terbuka > 180 hari"; keluhan > 12 bulan mendapat `archived_at` tanpa kehilangan baris.

---

## 10. Deployment & operasional

### 10.1 Rekomendasi default

**VPS dengan Docker Compose + Caddy.** Alasan: compose sudah dipakai lokal, Postgres berjalan di host yang sama, TLS otomatis, tidak ada ketergantungan platform, dan rate limit in-memory valid untuk satu instance. Spesifikasi awal target: 2 vCPU, 4 GB RAM, 40 GB SSD.

**Alternatif (butuh change request terhadap O5):** Vercel + Postgres terkelola (mis. Neon). Bila opsi ini dipakai: rate limit in-memory tidak andal di serverless sehingga wajib penyimpanan bersama (Redis/Upstash) untuk create/classify/export/login; migrasi dijalankan terpisah; perlu connection pooling; `export const maxDuration = 15` pada route classify; batas rate limit bersama tetap 20/menit/user untuk classify, 10/menit/user create, 5/menit/user export, 5/menit/IP login. Biaya/kuota dihitung sebelum dipilih.

### 10.2 Docker Compose (garis besar)

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: smartguest
      POSTGRES_USER: smartguest
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U smartguest -d smartguest"]
      interval: 5s
      timeout: 3s
      retries: 10
    volumes:
      - pgdata:/var/lib/postgresql/data

  migrate:
    build:
      context: .
      target: migrator          # image memuat Prisma CLI + schema + seed
    command: ["npx", "prisma", "migrate", "deploy"]
    env_file: .env
    depends_on:
      db:
        condition: service_healthy

  seed:
    build:
      context: .
      target: migrator          # image yang sama dengan migrate
    command: ["npx", "tsx", "prisma/seed.ts"]
    env_file: .env
    environment:
      SEED_DEMO: "true"
    profiles: ["demo"]
    restart: "no"
    depends_on:
      migrate:
        condition: service_completed_successfully

  app:
    build:
      context: .
      target: app
    env_file: .env
    depends_on:
      migrate:
        condition: service_completed_successfully
      seed:
        condition: service_completed_successfully
        required: false          # seed hanya ada di profile demo (Compose >= 2.24)
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

Catatan B8:

- `Dockerfile.migrator` (target `migrator`) memuat Prisma CLI, `prisma/schema.prisma`, migrasi, dan seed script (termasuk runtime `tsx` untuk `prisma/seed.ts`); image `app` tidak memuat Prisma CLI di runtime.
- `docker compose --profile demo up --build` dari volume kosong menjalankan `db -> migrate -> seed -> app`. Seed idempoten (`upsert` user, `skipDuplicates` untuk data demo) sehingga aman dijalankan ulang.
- Tanpa profile `demo`, seed tidak berjalan; produksi pilot membuat user lewat prosedur admin.
- Produksi menambahkan service `caddy` (80/443), log rotation, dan tidak mempublikasikan port database ke host.

### 10.3 Environment variables

| Variabel | Wajib | Rahasia | Default | Catatan |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Ya | Ya | - | `postgresql://smartguest:...@db:5432/smartguest` |
| `AUTH_SECRET` | Ya | Ya | - | Minimal 32 byte acak |
| `AUTH_URL` | Ya | Tidak | - | URL publik, mis. `https://demo.example.com` |
| `AUTH_TRUST_HOST` | Tidak | Tidak | `true` | Di belakang Caddy |
| `AI_BASE_URL` | **Tidak** | Tidak | `https://generativelanguage.googleapis.com/v1beta/openai/` | Endpoint OpenAI-compatible; kosong -> `aiConfigured=false` |
| `AI_MODEL` | **Tidak** | Tidak | `gemini-2.5-flash` (pin saat implementasi) | Catat versi persis untuk evaluasi |
| `AI_API_KEY` | **Tidak** | Ya | - | Jangan pernah log; kosong -> `aiConfigured=false` |
| `AI_TIMEOUT_MS` | Tidak | Tidak | `8000` | Timeout per panggilan; tidak boleh > 8000 |
| `AI_MAX_RETRIES` | Tidak | Tidak | `1` | Hanya error tertentu dan bila sisa budget > 3 detik |
| `AI_BUDGET_USD` | Tidak | Tidak | `5` | Budget cap demo; akumulasi `ai_usage` hari ini dicek sebelum panggilan; bila >= cap, panggilan dilewati dan `BUDGET_EXCEEDED` dicatat |
| `CLASSIFIER_PROMPT_VERSION` | Tidak | Tidak | `classify.v1` | **Fail-fast saat boot** bila tidak sama dengan `PROMPT_VERSION` di kode |
| `RATE_LIMIT_CLASSIFY_PER_MIN` | Tidak | Tidak | `20` | Per user |
| `RATE_LIMIT_CREATE_PER_MIN` | Tidak | Tidak | `10` | Per user |
| `RATE_LIMIT_EXPORT_PER_MIN` | Tidak | Tidak | `5` | Per user |
| `RATE_LIMIT_LOGIN_PER_MIN` | Tidak | Tidak | `5` | Per IP |
| `SEED_OFFICER_EMAIL` | Tidak | Tidak | `fo@demo.local` | Hanya untuk seed |
| `SEED_OFFICER_PASSWORD` | Ya saat demo | Ya | - | Hanya untuk seed; minimal 12 karakter; wajib bila `SEED_DEMO=true` |
| `SEED_DEMO` | Tidak | Tidak | `false` | Set true hanya untuk profile demo / seed lokal |
| `ENABLE_TEST_SEAMS` | Tidak | Tidak | `false` | **Wajib false di produksi**; seam test-only mati bila false |
| `LOG_LEVEL` | Tidak | Tidak | `info` | `debug` tidak untuk produksi |
| `APP_TIMEZONE` | Tidak | Tidak | `Asia/Jakarta` | Batas hari dashboard |
| `POSTGRES_PASSWORD` | Ya (compose) | Ya | - | Hanya untuk service db |

Catatan:

- Env AI **opsional**. `aiConfigured = Boolean(AI_BASE_URL && AI_MODEL && AI_API_KEY)`; bila false, mode rules-only aktif dan UI/log menampilkannya.
- `MAX_COMPLAINT_CHARS` **dihapus** dari env; batas 2000 adalah konstanta kode yang terikat ke `varchar(2000)` + check constraint (S15).
- `RULES_VERSION` adalah konstanta kode (`rules.v1`), bukan env, agar tidak bisa diubah tanpa deploy dan agar hash test set valid.
- Semua env divalidasi saat boot. Nilai contoh di `.env.example`/`.env.production.example` memakai placeholder, bukan secret nyata.

### 10.4 Migrasi dan seed

- Migrasi memakai `prisma migrate deploy`; tidak ada `db push` di produksi.
- Service `migrate` memakai image target `migrator` dan berjalan sekali sebelum app; kegagalan migrasi menghentikan deploy.
- Service `seed` memakai image yang sama, hanya ada di profile `demo`, dan idempoten (`upsert` user + `skipDuplicates` data demo). Seed membuat user FO dan 8-12 keluhan contoh dengan `isDemo=true`.
- `docker compose --profile demo up --build` dari volume kosong harus menghasilkan database ter-migrasi + data demo. Bila seed gagal, app tidak boleh mengklaim demo siap.
- Tidak ada seed otomatis di produksi pilot; user pilot dibuat lewat prosedur admin.
- Setiap migrasi yang mengubah data harus punya catatan rollback forward-only.

### 10.5 Healthcheck dan observability

- `GET /api/health` -> `{ status, db, aiConfigured, version }` dengan nilai `{status:"ok", db:"ok", aiConfigured:boolean, version:"..."}`; 503 bila database gagal. `aiConfigured=false` tetap 200 dan menandakan mode rules-only.
- Healthcheck tidak memanggil provider AI agar tidak memakai kuota.
- Log JSON dengan request ID, durasi, status, dan `complaintId`; tanpa PII.
- Alert minimum: app down 2 menit, error rate 5xx > 5% selama 5 menit, fallback rate > 20% selama 15 menit (target operasional, bukan hasil).

### 10.6 Export CSV

Kolom default: `code, created_at, channel, category, department, status, verified_at, closed_at, is_demo`.
Tidak ada `guest_name`, `room_number`, `raw_text`, atau `resolution_note` pada export default. `resolutionNote` hanya dapat diminta eksplisit (mis. `include_resolution_note=true`) dan tetap diredaksi (`[EMAIL]`, `[TELEPON]`, `[NIK]`, `[NOMOR]`) sebelum ditulis. Filter mengikuti dashboard (tanggal, status, kategori, departemen, channel). Baris dengan `archived_at IS NOT NULL` dikecualikan dari export default; sertakan hanya bila `include_archived=true`. Encoding UTF-8 dengan BOM, delimiter koma, quote sesuai RFC 4180, dan escape formula.

### 10.7 Backup, restore, dan rollback

- Backup: `pg_dump` harian pukul 02.00 WIB, retensi 14 hari; salinan mingguan ke storage terpisah.
- Restore drill minimal sekali sebelum Milestone B selesai dan sekali saat pilot.
- Rollback aplikasi: simpan image tag sebelumnya; `docker compose up -d` dengan tag lama. Rollback database bersifat forward-only: pulihkan backup bila perlu, lalu jalankan migrasi kompensasi. Jangan `migrate reset` di produksi.
- Rekam commit hash dan versi image pada setiap deploy.

### 10.8 Kredensial demo

| Item | Nilai |
| --- | --- |
| Email demo | `fo@demo.local` (dapat diubah via `SEED_OFFICER_EMAIL`) |
| Password demo | Diisi via `SEED_OFFICER_PASSWORD`; tidak di-commit; dibagikan terpisah saat presentasi |
| Data demo | 8-12 keluhan dengan `isDemo=true`, termasuk satu contoh fallback rules dan satu keluhan selesai |
| Reset demo | `docker compose --profile demo down -v` lalu `docker compose --profile demo up --build`; hanya untuk lingkungan demo |

Kredensial demo wajib diganti sebelum URL publik diumumkan dan tidak boleh sama dengan kredensial pilot.

---

## 11. Risk register

| Risiko | Dampak | Mitigasi | Deteksi |
| --- | --- | --- | --- |
| LLM salah kategori | Keluhan salah departemen, keterlambatan | Verifikasi wajib, tampilkan confidence dan alasan, rules fallback, evaluasi berkala | Tingkat koreksi kategori di dashboard; analisis error |
| Kuota/provider down saat demo | Segmen LLM gagal, demo terhambat | Mode rules-only otomatis (`aiConfigured`/fallback), video cadangan dua jalur, data seed fallback; **jangan klaim demo bebas internet untuk segmen LLM** | Fallback rate; log error; healthcheck |
| Prompt injection mengubah output | Keputusan salah atau data bocor | Delimiter, validasi enum, tanpa tool, tidak ada auto-action, uji BB-15 | Flag `injection_suspected`, review respons mentah |
| PII bocor ke provider/log | Pelanggaran privasi, kehilangan kepercayaan | Redaksi, field terstruktur tidak dikirim, log redaction, review kebijakan provider | Test PII, audit log, review provider |
| Scrub PII tidak lengkap/merusak audit | Data pribadi tertinggal atau timeline hilang | Daftar kolom scrub eksplisit, trigger append-only, event `PII_SCRUBBED`, test jumlah event sebelum/sesudah | Audit scrub; test B5; review log |
| Dataset sintetis terlalu mudah | Klaim performa berlebihan | Split beku, label review, uji 30 keluhan nyata, tulis batasan | Perbandingan hasil sintetis vs pilot |
| Scope creep (PMS, multi-role, notifikasi) | Proyek tidak selesai | Out of scope eksplisit, change request, fokus Milestone A | Review backlog dan dokumen ini |
| Annotator tunggal bias | Label tidak kredibel | 20% item direview buta, catat kappa, adjudikasi | Audit label; kappa target >= 0,70 |
| Kehilangan data/audit | Tidak dapat ditelusuri | Backup harian, restore drill, append-only trigger | Log backup; uji restore |
| Salah konfigurasi auth | Akses tidak sah | Tanpa signup, middleware, cek `isActive` per request, test 401/redirect, `bcryptjs` cost 12, rotasi kredensial | Test keamanan; access log |
| Supply chain dependency | Kompromi atau build rusak | Lockfile, `npm audit`, dependency minimal, review pembaruan | CI audit; Dependabot |
| Dashboard lambat | Demo/pilot tidak nyaman | Index, pagination, query agregat, load test | p95 monitoring; query plan |
| Data demo dikira data nyata | Laporan menyesatkan | Flag `isDemo`, banner, exclude dari laporan pilot | Review dashboard/export |
| Resistensi petugas | Pilot gagal | UAT, UI sederhana, SOP singkat, libatkan FO sejak awal | Feedback UAT; tingkat penggunaan |
| Kepatuhan UU PDP | Risiko hukum | Minimalisasi data, retensi + scrub, izin pilot, review kebijakan | Review legal; audit data; event `PII_SCRUBBED` |

---

## 12. Rencana demo 5 menit

Keluhan showcase utama: "AC di kamar 412 tidak dingin sejak semalam, sudah dua kali saya lapor ke resepsionis tapi belum ada teknisi yang datang." (kategori harapan: Teknisi & Fasilitas). Siapkan juga satu keluhan F&B dan satu keluhan ambigu.

| Waktu | Aksi | Yang dibuktikan |
| --- | --- | --- |
| 0:00-0:45 | Login sebagai FO, buka dashboard | Auth satu peran, rekap awal, banner data demo, status kosong/terisi jelas |
| 0:45-1:30 | Buat keluhan showcase, tunjukkan validasi dan counter; tunjukkan status `PENDING -> RUNNING -> DONE` | Input tervalidasi, create cepat, klasifikasi asinkron berjalan |
| 1:30-2:15 | Tunjukkan panel rekomendasi: kategori, confidence, alasan, source LLM | AI merekomendasikan, bukan memutuskan |
| 2:15-3:00 | Terima/ubah kategori, tetapkan Engineering, ubah ke Diproses, buka timeline | Verifikasi manusia, mapping departemen, audit trail |
| 3:00-3:45 | Buka keluhan seed yang memakai fallback rules; jelaskan error LLM dan sumber rules | Aplikasi tetap berguna saat AI gagal; keputusan deterministik |
| 3:45-4:30 | Selesaikan keluhan dengan catatan resolusi; kembali ke dashboard dan export CSV | Status machine, rekap berubah, export sesuai filter |
| 4:30-5:00 | Tampilkan ringkasan evaluasi: macro-F1, confusion matrix, batasan dataset sintetis | Klaim terukur dan jujur |

Hal yang harus ditunjukkan di setiap menit: (1) alur dan peran, (2) validasi, (3) rekomendasi AI, (4) keputusan manusia + audit, (5) fallback, (6) status + rekap, (7) bukti evaluasi.

Persiapan: dataset demo direset, kredensial diuji, dan **video cadangan** disiapkan untuk dua jalur: (a) LLM aktif, (b) mode rules-only bila internet/kuota gagal. Jangan mengklaim demo "tidak bergantung internet" untuk segmen LLM; yang dijamin adalah aplikasi tetap berguna lewat fallback rules.

---

## 13. Out of scope

Hal berikut **tidak** dikerjakan pada Milestone A maupun B kecuali ada persetujuan tertulis dan perubahan dokumen:

- Integrasi PMS atau sistem hotel lain.
- Pesan otomatis ke tamu/departemen (WhatsApp, email, SMS).
- Analisis gambar/foto keluhan.
- Prediksi kepuasan tamu atau analitik prediktif.
- Multi-hotel/tenant, multi-cabang, atau billing.
- Peran selain Front Office (Housekeeping, Engineering, Manager, Admin) dan RBAC granular.
- Registrasi mandiri, manajemen user dari UI, SSO.
- Aplikasi mobile native atau mode offline.
- Auto-close, auto-assign, atau auto-escalation tanpa konfirmasi manusia.
- Kategori kustom yang dapat diedit dari UI.
- SLA engine, notifikasi eskalasi, dan pengingat otomatis.
- Analitik lanjutan (forecasting, clustering, sentimen).
- Dukungan bahasa selain Indonesia dan Inggris terbatas pada input.
- Integrasi pembayaran.
- Audit kepatuhan formal atau sertifikasi NIST.

Fitur pendukung di dalam alur inti yang ditandai **`[jika disetujui]`** dan punya acceptance terpisah di Fase 3: pencarian kode keluhan, tombol klasifikasi ulang, dan tren 7/30 hari di dashboard. Bila tidak disetujui, UI tetap berfungsi tanpa ketiganya.

Perubahan di luar scope yang memerlukan change request: field prioritas, multi-departemen per keluhan, notifikasi email internal, dan dashboard per departemen. Tidak ada pekerjaan kanal masuk tambahan di Milestone A.

---

## 14. Pemetaan ke deck M1-M5

| Bagian deck | Yang perlu disesuaikan | Alasan |
| --- | --- | --- |
| M1 Analisis | Tambahkan batasan: satu peran, dataset sintetis, tanpa PMS; tambahkan pemetaan NIST AI RMF dan risk register ringkas | Menunjukkan analisis risiko, bukan hanya visi |
| M2 Aplikasi dasar | Ganti mockup dengan screenshot aplikasi nyata; jelaskan state machine, audit trail, dan URL publik VPS + Caddy (bukan hanya Docker lokal) | Agar klaim sesuai implementasi |
| M3 Integrasi AI | Tegaskan abstraksi OpenAI-compatible, prompt/rules versioning, mode rules-only saat AI tidak dikonfigurasi, dan "AI merekomendasikan, manusia memutuskan"; hapus klaim auto-assign/auto-close bila ada | Menghindari overclaim dan menjelaskan kegagalan |
| M4 Evaluasi | Isi dengan hasil nyata: 200 item, split, macro-F1, per-class, confusion matrix, prediksi `PERLU_DITINJAU` vs operational abstain, invalid-output rate, fallback rate, latency, biaya list price, batasan sintetis | Mengganti target/klaim dengan bukti |
| M5 Pelaporan | Tambahkan risk register, riwayat keputusan terkunci, rencana pilot, hasil UAT (bila ada), dan referensi lengkap (Vial 2019; Verhoef et al. 2021; Kumawat et al. 2025; Tabassi 2023) | Konsistensi akademik dan keberlanjutan |

Aturan presentasi:

- Setiap angka di slide harus punya sumber file di `eval/reports/` atau dokumen ini.
- Jika belum diukur, tulis "target" atau "belum diukur"; jangan menampilkan angka seolah hasil.
- Sebut dataset sintetis sebagai keterbatasan pada slide evaluasi.
- Jangan menampilkan data tamu nyata; gunakan data demo.
- Perbarui deck setelah Fase 7, bukan sebelum evaluasi selesai.

---

## 15. Referensi

- Vial, G. (2019). Understanding digital transformation: A review and a research agenda. *Journal of Strategic Information Systems*, 28(2), 118-144. https://doi.org/10.1016/j.jsis.2019.01.003
- Verhoef, P. C., Broekhuizen, T., Bart, Y., Bhattacharya, A., Dong, J. Q., Fabian, N., & Haenlein, M. (2021). Digital transformation: A multidisciplinary reflection and research agenda. *Journal of Business Research*, 122, 889-901. https://doi.org/10.1016/j.jbusres.2019.09.022
- Kumawat, A., Datta, S., Prentice, C., & Leung, D. (2025). Artificial intelligence in hospitality: A review and research agenda. *International Journal of Hospitality Management*, 124, 103986. https://doi.org/10.1016/j.ijhm.2024.103986
- Tabassi, E. (2023). *Artificial Intelligence Risk Management Framework (AI RMF 1.0)* (NIST AI 100-1). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.AI.100-1
