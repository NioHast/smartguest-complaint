# SmartGuest Complaint — Metodologi Evaluasi Klasifikasi

> Dokumen ini mencerminkan implementasi per **27 November 2026**. Bagian 1-5
> menjelaskan metode; bagian 6 memuat angka hasil run 27 November 2026 yang
> disalin dari `eval/results/summary.md` dan `eval/results/matrix.md`.

Evaluasi mengukur seberapa sering `classifyComplaint()` di `app/src/lib/ai.ts`
memetakan teks keluhan Bahasa Indonesia ke kategori yang sama dengan label
dataset. Evaluasi tidak mengukur kualitas koreksi petugas, kecepatan
penyelesaian, kepuasan tamu, atau seluruh alur produk.

## 1. Ruang lingkup

Kategori yang dievaluasi adalah lima kategori tetap: `kebersihan`, `teknisi`,
`fnb`, `resepsionis`, dan `perlu_ditinjau`. Sistem yang diuji hanya jalur LLM.
Tidak ada perbandingan antar-pendekatan karena hanya satu jalur klasifikasi
yang tersedia di implementasi. Tidak ada pelatihan model dan tidak ada tuning
pada saat run evaluasi.

## 2. Dataset

### 2.1 Jumlah dan distribusi

| Dimensi | Nilai |
| --- | --- |
| Total item | 100 |
| Item per kategori | 20 |
| Bahasa | Indonesia, dengan istilah hotel yang lazim (AC, check-in, room service) |
| Berkas | `eval/dataset.jsonl` (satu objek JSON per baris) |
| Field wajib | `id`, `text`, `label` |
| Field opsional | `notes` untuk menjelaskan dasar label, terutama item ambigu |

Distribusi seimbang: 20 item untuk masing-masing dari lima kategori, termasuk
`perlu_ditinjau`. Dataset tidak dibagi menjadi train/test (lihat §7).

### 2.2 Komposisi dan gaya penulisan

Setiap kategori berisi campuran gaya yang disengaja:

- **Jelas**: satu intent dominan yang langsung menunjuk satu departemen.
- **Ambigu**: dua intent berbeda departemen dengan bobot setara, atau konteks
  terlalu tipis untuk menentukan tindakan.
- **Typo/penulisan tidak baku**: salah ketik wajar, singkatan, huruf kecil,
  tanpa tanda baca.
- **Bukan keluhan**: sapaan, pertanyaan umum, obrolan, atau permintaan di luar
  empat departemen tetap.

Item ambigu yang kedua intent-nya setara dan item bukan-keluhan diberi label
`perlu_ditinjau`. Komposisi ini adalah keputusan penulisan dataset, bukan
sampel acak dari populasi keluhan hotel.

### 2.3 Aturan pelabelan

1. Satu item hanya punya satu label.
2. Label mengikuti **intent utama yang dapat ditindaklanjuti**, bukan emosi,
   panjang teks, atau kata kategori yang disebut.
3. Bila dua intent berbeda departemen benar-benar seimbang, label
   `perlu_ditinjau` dan alasannya dicatat di `notes`.
4. Teks yang bukan keluhan diberi label `perlu_ditinjau`.
5. Typo dan singkatan tidak diperbaiki saat pelabelan; label ditentukan dari
   makna teks.
6. Nama, nomor kamar, dan detail lain bersifat fiktif; tidak ada data tamu nyata.

### 2.4 Format dan validasi

Harness membaca `eval/dataset.jsonl`, mewajibkan `id`, `text`, dan `label`
bertipe string, menolak label di luar lima kategori, dan menolak `id` duplikat.
Baris kosong diabaikan. Harness tidak melakukan validasi statistik lanjutan
seperti near-duplicate atau keseimbangan subtipe.

## 3. Sistem yang dievaluasi

- Fungsi: `classifyComplaint(text)` di `app/src/lib/ai.ts`.
- Provider: endpoint OpenAI-compatible dari `AI_BASE_URL` (default DeepSeek),
  model dari `AI_MODEL` (default `deepseek-chat`).
- Prompt sistem dan skema output dibekukan selama satu run: lima kategori,
  JSON `{kategori, confidence, alasan}`, suhu 0, maksimal 200 token, timeout
  7 detik, tanpa retry otomatis di aplikasi.
- Hanya `text` yang dikirim ke model; nama tamu dan nomor kamar tidak ikut.
- Jalur ini memerlukan `AI_API_KEY`. Tanpa key, harness berhenti dan tidak
  menulis hasil; evaluasi tidak memakai `perlu_ditinjau` sebagai pengganti
  kegagalan konfigurasi.
- Harness memanggil model satu per satu secara berurutan dengan jeda
  800-1200 ms, dan mengulang satu kali bila satu panggilan gagal. Bila panggilan
  tetap gagal, seluruh run dibatalkan tanpa menulis hasil setengah jadi.

## 4. Menjalankan evaluasi

Dari direktori `app/`:

```bash
npm run eval
```

Prasyarat: `AI_API_KEY` tersedia di environment atau `app/.env`. Perintah
memakai skrip `app/scripts/eval.mjs` dan melakukan 100 panggilan model. Hasil
ditulis ke `eval/results/`:

| Berkas | Isi |
| --- | --- |
| `summary.md` | Akurasi, macro-F1, metrik per kategori, abstain rate, latensi |
| `predictions.jsonl` | Prediksi per item: label, prediksi, confidence, alasan, latency |
| `matrix.csv` | Confusion matrix 5x5 dalam CSV |
| `matrix.md` | Confusion matrix 5x5 dalam Markdown |

`eval/README.md` juga ditulis ulang oleh harness dengan ringkasan run terakhir.
Angka run terakhir disalin ke §6 beserta rujukan berkasnya; bila run diulang,
§6 harus diperbarui atau ditandai sebagai hasil run lama.

## 5. Metrik

- **Akurasi**: jumlah prediksi yang sama dengan label dibagi jumlah seluruh item.
- **Precision, recall, F1 per kategori**: dihitung dari confusion matrix dengan
  `precision = TP/(TP+FP)`, `recall = TP/(TP+FN)`, dan
  `F1 = 2*precision*recall/(precision+recall)`. Support dan jumlah prediksi
  dilaporkan per kategori agar metrik tidak dibaca tanpa konteks.
- **Macro-F1**: rata-rata F1 dari lima kategori dengan bobot sama, tanpa memakai
  support sebagai bobot. Dipakai karena dataset seimbang dan setiap kategori
  dianggap sama penting.
- **Confusion matrix 5x5**: baris adalah label aktual, kolom adalah prediksi.
  Matrix menunjukkan kategori yang paling sering tertukar, termasuk berapa item
  non-`perlu_ditinjau` yang diprediksi `perlu_ditinjau`.
- **Abstain operasional**: jumlah item berlabel non-`perlu_ditinjau` yang
  diprediksi `perlu_ditinjau` dibagi jumlah item berlabel non-`perlu_ditinjau`.
  Ini mengukur kecenderungan melempar keluhan yang bisa ditangani ke antrean
  manual, bukan akurasi dan bukan probabilitas kalibrasi.
- **Latensi**: p50, p95, dan rata-rata dari latency setiap panggilan API.
  p50/p95 memakai nearest-rank pada latency terurut; latency mencakup waktu
  jaringan dan respons model, bukan render UI atau penyimpanan database.

## 6. Hasil run terakhir (27 November 2026)

Angka berikut disalin apa adanya dari `eval/results/summary.md` dan
`eval/results/matrix.md`. Prompt dan model tidak diubah selama run, sehingga ini
adalah pengukuran, bukan hasil tuning.

| Metrik | Nilai |
| --- | --- |
| Tanggal run | 2026-11-27T02:57:27.402Z |
| Model | `deepseek-chat` |
| Jumlah item | 100 |
| Akurasi | **89.00%** (89/100) |
| Macro-F1 | **0.8889** |
| Operational abstain | **3.75%** (3/80) |
| Latensi p50 | **888 ms** |
| Latensi p95 | **1295 ms** |
| Latensi rata-rata | 901 ms |

### 6.1 Metrik per kategori

| Kategori | Support | Prediksi | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- |
| kebersihan | 20 | 20 | 0.9500 | 0.9500 | 0.9500 |
| teknisi | 20 | 23 | 0.8696 | 1.0000 | 0.9302 |
| fnb | 20 | 19 | 0.9474 | 0.9000 | 0.9231 |
| resepsionis | 20 | 19 | 0.8421 | 0.8000 | 0.8205 |
| perlu_ditinjau | 20 | 19 | 0.8421 | 0.8000 | 0.8205 |

### 6.2 Confusion matrix 5x5

Baris adalah label aktual, kolom adalah prediksi.

| Aktual \ Prediksi | kebersihan | teknisi | fnb | resepsionis | perlu_ditinjau | Total |
| --- | --- | --- | --- | --- | --- | --- |
| **kebersihan** | 19 | 0 | 0 | 0 | 1 | 20 |
| **teknisi** | 0 | 20 | 0 | 0 | 0 | 20 |
| **fnb** | 1 | 0 | 18 | 0 | 1 | 20 |
| **resepsionis** | 0 | 2 | 1 | 16 | 1 | 20 |
| **perlu_ditinjau** | 0 | 1 | 0 | 3 | 16 | 20 |
| **Total** | 20 | 23 | 19 | 19 | 19 | 100 |

### 6.3 Tafsiran

- Sebelas item salah. Tujuh di antaranya ada di 24 item ambigu (17/24 benar,
  70.8%); 56 item jelas/typo dan 5 item pujian/pertanyaan seluruhnya benar.
- Empat kesalahan sisanya semuanya item berlabel `perlu_ditinjau` yang
  diprediksi masuk departemen (E030, E055, E060, E065), sedangkan tiga item
  departemen diprediksi `perlu_ditinjau` (E058, E081, E084). Artinya 7 dari 11
  kesalahan menyentuh batas `perlu_ditinjau` vs departemen, dan arah
  `perlu_ditinjau` -> departemen adalah pola tunggal terbesar (4 kasus).
- Untuk keluhan yang menyentuh dua departemen, model tidak konsisten: kadang
  abstain (E058, E081), kadang memilih gejala sekunder alih-alih inti keluhan
  (E064 dan E079 memilih `teknisi`, E069 memilih `fnb`).
- Model cenderung mengikuti klausa kedua atau gejala yang disebut, bukan inti
  keluhan. Contoh E078, "Makanan kamar datang tapi piring kotor dan ada rambut
  di nasi.", diprediksi `kebersihan` padahal label `fnb` karena rambut di
  makanan adalah masalah kualitas sajian.
- Confidence bukan penjamin kebenaran: 5 prediksi dengan confidence >= 0.85
  tetap salah (E030 0.85, E060 0.90, E065 0.85, E078 0.85, E079 0.85).

### 6.4 Batasan angka ini

Dataset berisi 100 item sintetis dengan label buatan penulis, tanpa anotator
kedua dan tanpa split train/test; seluruh 100 item dipakai sebagai pengukuran.
Karena itu angka di atas hanya berlaku untuk dataset ini, bukan estimasi
generalisasi ke keluhan tamu nyata.

## 7. Batasan metodologis

- **Dataset sintetis.** Semua item ditulis untuk evaluasi, bukan keluhan tamu
  nyata. Distribusinya tidak mewakili hotel mana pun.
- **Label buatan penulis.** Label adalah penilaian manusia tunggal (penulis
  dataset), tanpa anotator kedua dan tanpa Cohen's kappa. Item ambigu diberi
  catatan, tetapi label tetap dapat diperdebatkan.
- **Sampel kecil.** 100 item berarti beberapa persen selisih tidak stabil
  secara statistik; hasil tidak boleh digeneralisasi ke populasi tamu lain.
- **Tidak ada split train/test.** Sistem tidak dilatih, sehingga tidak ada
  training set. Seluruh 100 item dipakai sebagai pengukuran; karena itu angka
  adalah deskripsi performa pada dataset ini, bukan estimasi generalisasi.
- **Confidence LLM bukan probabilitas terkalibrasi.** Nilai `confidence` adalah
  keluaran model yang dijepit ke 0-1, bukan hasil kalibrasi. Evaluasi tidak
  memakai threshold confidence; abstain dihitung dari label prediksi.
- **Tidak deterministik penuh.** Provider dapat mengubah model atau perilaku
  API; satu run tidak menjamin hasil yang sama pada run berikutnya.
- **Hanya kategori.** Evaluasi tidak menilai kualitas alasan, kegunaan
  rekomendasi bagi petugas, atau dampak operasional.
- **Tidak ada klaim perbandingan.** Karena tidak ada jalur rules/hybrid, tidak
  ada klaim bahwa LLM lebih baik atau lebih buruk daripada jalur tersebut.

## 8. Cara melaporkan hasil

- Kutip angka hanya dari `eval/results/summary.md` pada run yang jelas tanggal,
  model, dan commit-nya.
- Sebut jumlah item, model, dan sifat dataset sintetis bersama angka apa pun.
- Jangan menampilkan angka per kategori tanpa support-nya, dan jangan menyebut
  hasil sebagai "akurasi produksi" atau "performa di hotel".
- Bila run diulang setelah prompt/model berubah, itu adalah hasil run baru,
  bukan pembaruan run lama.
