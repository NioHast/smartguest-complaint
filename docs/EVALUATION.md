# SmartGuest Complaint — Spesifikasi Dataset dan Metodologi Evaluasi

> Catatan implementasi: jalur klasifikasi aturan kata kunci dihapus; aplikasi hanya memakai LLM, dan tanpa API key pencatatan keluhan gagal (503).

- Versi: 1.2
- Tanggal: 4 November 2026
- Status: spesifikasi; dataset dan harness belum dibuat
- Dokumen induk: `docs/PLAN.md`
- Spesifikasi rules: `docs/RULES.md` (versi `rules.v1`)

Dokumen ini mengatur cara membuat dataset sintetis, memberi label, menjalankan evaluasi klasifikasi, dan melaporkan hasil. Tujuannya bukan membuktikan bahwa sistem "akurat", melainkan mengukur seberapa baik tiga pendekatan (rules, LLM, hybrid) pada dataset yang dibekukan, lalu melaporkan hasil apa adanya.

Riwayat revisi ringkas: 1.1 menambahkan komposisi 40 item `PERLU_DITINJAU`, validator near-duplicate lintas split, aturan pembekuan rules sebelum test, perilaku gagal per sistem, reuse prediksi LLM oleh hybrid, pemisahan metrik abstain, dan field token/request di `predictions.jsonl`. 1.2 memperbaiki komposisi 50 item ambigu (15 di `PERLU_DITINJAU` + ±9 di tiap kategori non-`PERLU_DITINJAU`), memperbaiki kolom hybrid pada tabel perilaku gagal, memisahkan `run_id` dari `request_id`, menyeragamkan `source` uppercase, menetapkan token `null` untuk rules, menambahkan missed escalation rate ke template, dan mewajibkan pencatatan sumber/tanggal harga list price.

---

## 1. Ruang lingkup

Yang dievaluasi: kemampuan memetakan teks keluhan Bahasa Indonesia ke satu dari lima kategori tetap.

| Kode | Kategori |
| --- | --- |
| `KEBERSIHAN_KAMAR` | Kebersihan Kamar |
| `TEKNISI_FASILITAS` | Teknisi & Fasilitas |
| `MAKANAN_MINUMAN` | Makanan & Minuman |
| `RESEPSIONIS` | Resepsionis |
| `PERLU_DITINJAU` | Perlu Ditinjau |

Yang tidak dievaluasi pada dokumen ini:

- kualitas keputusan petugas setelah rekomendasi;
- kepuasan tamu;
- kecepatan penyelesaian oleh departemen;
- performa pada bahasa selain Indonesia (input campur Inggris hanya variasi terbatas);
- data keluhan nyata sebelum pilot.

Evaluasi ini mengukur classifier, bukan produk secara keseluruhan. Hasil produk dibuktikan lewat matriks black-box di `docs/BLACKBOX.md` (ringkasan di `docs/PLAN.md` bagian 8).

---

## 2. Spesifikasi dataset

### 2.1 Jumlah dan distribusi

| Dimensi | Target | Catatan |
| --- | --- | --- |
| Total item | 200 | Tetap; perubahan berarti versi dataset baru |
| Per kategori | 40 | Seimbang, termasuk `PERLU_DITINJAU` |
| Ambigu/multi-intent | 50 item (25%) | **±9 per kategori non-`PERLU_DITINJAU` + 15 di `PERLU_DITINJAU`** (35 ambigu tersebar di 4 kategori + 15 ambigu multi-intent); label tetap tunggal + catatan |
| Typo/penulisan tidak baku | 30 item (15%) | Salah ketik wajar, singkatan, huruf kecil semua |
| Campur Inggris | 20 item (10%) | Frasa teknis seperti "AC", "check in", "room service" |
| Panjang < 80 karakter | 60 item (30%) | Keluhan singkat |
| Panjang 80-300 karakter | 100 item (50%) | Panjang umum |
| Panjang > 300 karakter | 40 item (20%) | Cerita panjang, tetap <= 2000 karakter |
| Split dev | 120 item | 24 per kategori; untuk iterasi prompt/rules |
| Split test | 80 item | 16 per kategori; dibekukan, dipakai sekali untuk hasil final |

Kategori dan split harus seimbang. Ambigu, typo, campur Inggris, dan panjang didistribusikan proporsional ke dev/test (dev 60%, test 40%).

Tidak ada data nyata. Semua nama, nomor kamar, dan detail bersifat fiktif. Nomor kamar fiktif boleh muncul untuk menguji redaksi, tetapi tidak boleh merujuk orang nyata.

**Komposisi 40 item `PERLU_DITINJAU` (B9):**

| Subjenis | Jumlah | Tag wajib | Aturan label |
| --- | --- | --- | --- |
| Ambigu multi-intent | 15 | `ambiguous`, `multi_intent` | Dua intent berbeda departemen dengan bobot setara |
| Bukan keluhan (`not_complaint`) | 15 | `not_complaint` | Sapaan, pertanyaan umum, spam, obrolan |
| Konteks kurang | 10 | `insufficient_context` | Teks terlalu umum/fragmen sehingga tidak ada intent yang dapat ditindaklanjuti |

Target total item bertag `not_complaint` = 15 (semuanya berlabel `PERLU_DITINJAU`). Item ambigu multi-intent tidak dihitung sebagai `not_complaint`.

**Konsistensi 50 item ambigu (B9):** 50 item ambigu = **15 ambigu multi-intent berlabel `PERLU_DITINJAU`** + **35 ambigu berlabel salah satu dari empat kategori non-`PERLU_DITINJAU`** (±9 per kategori). Angka 15 ambigu sudah termasuk di dalam 40 item `PERLU_DITINJAU` (15 ambigu + 15 `not_complaint` + 10 konteks kurang), jadi tidak boleh dihitung dua kali. Setiap kategori tetap berisi 40 item (24 dev / 16 test), termasuk `PERLU_DITINJAU`. Total dataset tetap 200 item, split tetap 120 dev / 80 test.

### 2.2 Aturan penulisan item

1. Tulis seperti petugas Front Office mengetik cepat: huruf kecil, singkatan, typo wajar, tanpa markdown.
2. Satu item berisi satu keluhan utama. Untuk item ambigu, boleh ada dua intent, tetapi tetap satu label.
3. Gunakan Bahasa Indonesia sebagai bahasa utama. Variasi campur Inggris dibatasi pada istilah yang lazim di hotel.
4. Jangan menyalin keluhan dari internet, review publik, atau data tamu nyata.
5. Jangan memakai nama tamu nyata. Bila perlu, gunakan "tamu", "Bu", "Pak", atau nama fiktif yang jelas umum.
6. Panjang 5-2000 karakter; mayoritas 20-400 karakter.
7. Hindari item yang hanya menyebut kategori secara eksplisit (mis. "ini keluhan kebersihan kamar") karena mengukur hafalan label, bukan pemahaman.
8. Hindari duplikat dan parafrase dekat. Tidak boleh ada dua item dengan teks yang setelah normalisasi memiliki kemiripan > 0,90, terutama lintas split.
9. Item test tidak boleh dipakai untuk menulis prompt, memilih kata kunci rules, atau menyesuaikan threshold.
10. Simpan variasi realistis: keluhan marah, keluhan sopan, keluhan singkat, keluhan berbelit, dan teks yang bukan keluhan.

### 2.3 Contoh item (format final, belum menjadi dataset)

Lima contoh berikut hanya ilustrasi format dan gaya. Dataset final belum dibuat dan belum dihitung sebagai 200 item.

```jsonl
{"id":"sg-0001","text":"spreinya ada noda kuning dan handuknya bau apek, tolong diganti ya","label":"KEBERSIHAN_KAMAR","notes":"keluhan utama kebersihan linen","split":"dev","tags":["typo"]}
{"id":"sg-0002","text":"AC di kamar 412 tidak dingin dari semalam, sudah dua kali lapor tapi teknisi belum datang","label":"TEKNISI_FASILITAS","notes":"AC + keterlambatan teknisi; intent utama fasilitas","split":"dev","tags":["room_number"]}
{"id":"sg-0003","text":"sarapan pagi ini nasi gorengnya dingin dan telurnya belum matang, anak saya jadi tidak mau makan","label":"MAKANAN_MINUMAN","notes":"kualitas makanan","split":"test","tags":[]}
{"id":"sg-0004","text":"check in lama banget, antre hampir 40 menit padahal sudah reservasi online","label":"RESEPSIONIS","notes":"layanan resepsionis saat check-in","split":"test","tags":["mixed_lang"]}
{"id":"sg-0005","text":"air di kamar mandi tidak mengalir dan sarapan tadi juga telat, ini bagaimana sih pelayanannya","label":"PERLU_DITINJAU","notes":"dua intent setara: fasilitas dan F&B; eskalasi untuk dipilah petugas","split":"dev","tags":["ambiguous","multi_intent"]}
```

Catatan format:

- `id` unik, format `sg-0001` sampai `sg-0200`.
- `text` adalah teks asli yang dikirim ke classifier; jangan menambahkan label ke dalam teks.
- `label` harus salah satu dari lima enum.
- `notes` menjelaskan alasan label, terutama untuk item ambigu; boleh string kosong.
- `split` hanya `dev` atau `test`.
- `tags` opsional: `ambiguous`, `multi_intent`, `typo`, `mixed_lang`, `room_number`, `not_complaint`, `insufficient_context`, `long`, `short`.
- Satu baris satu objek JSON, UTF-8 tanpa BOM, akhir baris LF.

### 2.4 Aturan anotasi

1. **Satu label per item.** Tidak ada multi-label pada evaluasi ini.
2. Label ditentukan oleh **intent utama yang dapat ditindaklanjuti**, bukan oleh emosi atau panjang teks.
3. Bila dua intent berbeda departemen memiliki bobot setara dan tidak ada yang jelas dominan, label `PERLU_DITINJAU` dan jelaskan di `notes`.
4. Bila teks bukan keluhan (sapaan, pertanyaan umum, spam), label `PERLU_DITINJAU` dan tag `not_complaint`.
5. Bila teks menyebut kategori secara eksplisit tetapi isinya berbeda, ikuti isi, bukan kata kategorinya.
6. Typo dan singkatan tidak diperbaiki saat anotasi; label berdasarkan makna.
7. Untuk item dengan dua intent yang masih satu departemen (mis. noda sprei dan handuk bau), pilih kategori departemen tersebut, bukan `PERLU_DITINJAU`.
8. Anotator utama menulis label awal, lalu meninjau ulang setelah jeda minimal 24 jam.
9. Minimal 20% item (40 item) ditinjau buta oleh anotator kedua. Perbedaan didiskusikan dan diputuskan; keputusan akhir dicatat.
10. Target kesepakatan antar-anotator: Cohen's kappa >= 0,70. Ini target, bukan hasil. Bila di bawah target, definisi label direvisi dan dataset versi baru dibuat.
11. **Window errata (B9):** perubahan label hanya boleh sebelum **final run** dimulai. Setelah final run, perubahan label = dataset versi baru (`smartguest-v2`), hash baru, dan **rerun ketiga sistem**; hasil lama diarsipkan, bukan ditimpa. Setiap errata mencatat `id`, label lama/baru, alasan, dan tanggal.
12. Anotator tidak boleh melihat prediksi model saat memberi label.

### 2.5 Penanganan item ambigu

- Tetap satu label.
- `notes` wajib menjelaskan intent yang bersaing dan alasan memilih label.
- Bila benar-benar seimbang: `PERLU_DITINJAU`.
- Item ambigu tidak dihapus hanya karena sulit; justru dipertahankan untuk mengukur perilaku abstain.
- Evaluasi melaporkan metrik terpisah untuk subset ambigu (lihat bagian 5), karena performa pada subset ini lebih relevan untuk keputusan operasional.

### 2.6 Format file dan validasi

File: `eval/dataset/smartguest-v1.jsonl`.

| Field | Tipe | Wajib | Aturan |
| --- | --- | --- | --- |
| `id` | string | Ya | Unik, `sg-` + 4 digit |
| `text` | string | Ya | 5-2000 karakter setelah trim |
| `label` | string | Ya | Salah satu dari 5 enum |
| `notes` | string | Ya | Boleh kosong; <= 300 karakter |
| `split` | string | Ya | `dev` atau `test` |
| `tags` | array string | Tidak | Dari daftar tag yang disepakati |

Validasi otomatis minimal:

- 200 baris, tidak ada JSON rusak.
- 40 item per label; 120 dev dan 80 test; 24/16 per label per split.
- Tidak ada `id` duplikat.
- Tidak ada teks duplikat setelah normalisasi (lowercase, trim, hapus tanda baca).
- **Near-duplicate lintas split:** kemiripan karakter trigram (Jaccard) antar dua item dari split berbeda tidak boleh > 0,90. Validator mencetak pasangan yang melanggar; dataset tidak boleh dibekukan selama masih ada pelanggaran.
- Komposisi `PERLU_DITINJAU`: 15 ambigu multi-intent, 15 `not_complaint`, 10 konteks kurang; total tag `not_complaint` = 15.
- Jumlah item ambigu 50 ± 2, terdiri dari tepat 15 item ambigu multi-intent berlabel `PERLU_DITINJAU` dan 35 ± 2 item ambigu di empat kategori non-`PERLU_DITINJAU` (±9 per kategori); typo 30 ± 2; campur Inggris 20 ± 2.
- Semua `text` memenuhi batas panjang dan tidak kosong.
- Tidak ada string yang menyerupai PII nyata (email/telepon/NIK) kecuali pola fiktif yang sengaja untuk uji redaksi.

Manifest: `eval/dataset/manifest.sha256` berisi hash file dataset, hash per split, dan `RULES_VERSION`. Urutan pembekuan: `rules.v1` dibekukan lebih dulu, lalu dataset + hash test. Hash test dibekukan sebelum eksperimen dan dicatat di laporan.

---

## 3. Sistem yang dievaluasi

Harness yang sama harus dipakai untuk ketiga sistem; hanya implementasi classifier yang berbeda.

| Sistem | Definisi | Yang diukur |
| --- | --- | --- |
| Rules | `lib/ai/rules.ts` saja (`rules.v1`), tanpa network | Baseline deterministik dan kecepatan |
| LLM | Panggilan provider dengan prompt `classify.v1`, temperature 0, output divalidasi | Kualitas model dan biaya |
| Hybrid | Rantai produksi: LLM → rules (kategori, atau `PERLU_DITINJAU` bila rules abstain) → `PERLU_DITINJAU` hanya bila rules abstain | Kualitas yang benar-benar dipakai aplikasi |

**Perilaku saat gagal (B6) — harus sama di harness dan di kode:**

| Kondisi | Rules-only | LLM-only | Hybrid |
| --- | --- | --- | --- |
| Provider tidak dikonfigurasi | Rules | `PERLU_DITINJAU` | Rules -> kategori, atau `PERLU_DITINJAU` bila rules abstain |
| Timeout / network | Rules | `PERLU_DITINJAU` | Rules -> kategori, atau `PERLU_DITINJAU` bila rules abstain |
| HTTP 401/403/429/5xx | Rules | `PERLU_DITINJAU` | Retry terbatas -> rules -> kategori, atau `PERLU_DITINJAU` bila rules abstain |
| Output invalid (JSON/enum/confidence) | Rules | `PERLU_DITINJAU` | Rules -> kategori, atau `PERLU_DITINJAU` bila rules abstain |
| Confidence LLM rendah | — | Tetap dipakai (LLM-only tidak punya ambang operasional) | LLM tetap dipakai; verifikasi manusia menangani |
| Rules di bawah ambang/seri | `PERLU_DITINJAU` | — | `PERLU_DITINJAU` |

Catatan kolom hybrid: hybrid **tidak selalu** jatuh ke `PERLU_DITINJAU`. Bila provider gagal, output invalid, atau provider tidak dikonfigurasi, hybrid menjalankan rules atas teks yang sama; hasilnya kategori rules bila rules punya pemenang yang lolos ambang, dan baru `PERLU_DITINJAU` bila rules abstain (skor di bawah ambang atau seri).

Aturan penting:

- Ketiga sistem menerima input yang identik, pada **test set 80 item yang sama dan beku**.
- Hybrid **memakai ulang prediksi LLM dari run yang sama**, bukan memanggil provider lagi. Konsekuensi biaya: biaya hybrid = biaya LLM; tidak ada panggilan tambahan.
- **Reuse prediksi dan tabel kegagalan:** pada run hybrid yang memakai reuse prediksi LLM, yang dievaluasi adalah **hasil fallback atas output LLM yang tercatat**, bukan kegagalan provider baru. Karena itu kolom hybrid pada tabel di atas menggambarkan transformasi deterministik terhadap output tercatat (rules -> kategori, atau `PERLU_DITINJAU` bila rules abstain), dan bukan simulasi provider yang mati pada saat run hybrid.
- Hybrid tidak boleh memakai label referensi atau informasi split.
- Rules tidak boleh diubah setelah split test dibekukan tanpa menaikkan versi (`rules.v2`) dan mengulang seluruh evaluasi ketiga sistem.
- Prompt LLM tidak boleh memuat contoh dari test set.
- Evaluasi tidak melatih model. Tidak ada fine-tuning pada Milestone A/B.

### 3.1 Parameter yang dibekukan

| Parameter | Nilai |
| --- | --- |
| Dataset | `smartguest-v1`, hash dicatat |
| Prompt | `classify.v1`, hash dicatat |
| Rules | `rules.v1`, hash/commit dicatat; dibekukan sebelum hash test |
| Model | ID persis dari provider, dicatat di laporan |
| Temperature | 0 |
| Max output token | 200 |
| Timeout | 8000 ms per panggilan; deadline total 13000 ms |
| Retry | 1 untuk timeout/network/429/5xx bila sisa budget > 3000 ms; 0 untuk output invalid |
| Tanggal eksperimen | Dicatat |
| Commit kode | Dicatat |
| `run_id` | ID unik satu eksekusi harness; dipakai untuk mengaitkan semua prediksi (rules/LLM/hybrid) dari run yang sama |
| `request_id` | ID unik satu klasifikasi/item (satu baris logis di `predictions.jsonl`); boleh berbeda antar item dalam satu `run_id` |

Bila provider mengubah model di belakang ID yang sama, hasil tidak dapat dibandingkan langsung. Catat tanggal, versi yang dilaporkan provider bila ada, dan jalankan ulang bila model berubah.

---

## 4. Prosedur evaluasi langkah demi langkah

1. **Bekukan rules.** Selesaikan `docs/RULES.md` + implementasi `rules.v1`, jalankan 15 fixture, lalu kunci `RULES_VERSION` dan hash-nya. Rules dibekukan **sebelum** test split.
2. **Bekukan dataset.** Selesaikan 200 item, validasi (termasuk near-duplicate lintas split), hitung hash, dan simpan manifest. Setelah langkah ini, test set tidak boleh diubah.
3. **Bekukan kode dan prompt.** Commit kode harness, prompt, dan rules. Catat commit hash.
4. **Siapkan environment.** `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` opsional; bila kosong, catat `aiConfigured=false` di `config.json`, jalankan rules saja, dan tandai LLM/hybrid **belum diukur**. Jangan mengklaim perbandingan tiga arah bila hanya rules yang berjalan. Rules tidak memerlukan network.
5. **Validasi dataset.** Jalankan validator; pastikan 200 item, distribusi, komposisi `PERLU_DITINJAU`, dan tidak ada duplikat/near-duplicate.
6. **Jalankan rules.** Simpan prediksi mentah untuk seluruh 200 item; metrik final tiga arah dilaporkan pada test set 80 item agar setara dengan LLM dan hybrid. Rules harus menghasilkan output untuk semua item tanpa error.
7. **Jalankan LLM.** Jalankan pada test set (80 item) **satu kali** untuk hasil final; simpan `run_id` untuk eksekusi ini, `request_id` per item, token input/output, dan setiap percobaan. Bila ingin melihat variasi, jalankan 3 kali pada **DEV subset 30 item** (tiap eksekusi punya `run_id` sendiri); jangan memilih run terbaik untuk laporan utama. Dev set 120 item hanya untuk iterasi.
8. **Jalankan hybrid.** Gunakan rantai produksi yang sama, tetapi **pakai ulang prediksi LLM dari langkah 7** untuk item yang sama; jangan memanggil provider lagi. Simpan keputusan rules/fallback per item.
9. **Validasi prediksi.** Pastikan setiap item punya prediksi; kategori selalu enum; tidak ada item yang hilang atau dobel.
10. **Hitung metrik.** Hasil dihitung dari file prediksi, bukan diketik manual.
11. **Buat laporan.** Hasilkan CSV, HTML, dan ringkasan markdown; sertakan confusion matrix dan analisis error.
12. **Analisis error.** Ambil minimal 10-20 kesalahan, kelompokkan pola (mis. kebersihan vs teknisi, F&B vs resepsionis, ambigu).
13. **Arsipkan dan commit.** Simpan prediksi mentah, metrik, laporan, dan hash. Bila perlu perubahan setelah final run, buat dataset versi baru + hash baru + rerun ketiga sistem; arsipkan hasil lama.
14. **Catat batasan.** Tulis jumlah item, split, model, tanggal, dan ancaman validitas pada ringkasan.
15. **Uji eksternal (pilot).** Setelah pilot, ulangi pada 30 keluhan nyata yang sudah dianonimkan dan bandingkan dengan hasil sintetis.

Aturan rerun:

- Selama pengembangan, gunakan dev set untuk iterasi prompt/rules.
- Test set dipakai sekali untuk hasil final. Bila ada bug harness, perbaiki, dokumentasikan, dan jalankan ulang seluruh sistem dengan versi yang sama; jangan hanya mengulang sistem yang jelek.
- Jangan menghapus hasil run yang gagal; simpan sebagai bukti.
- Window errata hanya sampai final run dimulai. Setelah itu, perubahan label atau rules = versi baru + hash baru + rerun **ketiga** sistem; hasil lama diarsipkan.
- Hybrid tidak boleh dijalankan ulang dengan memanggil provider hanya untuk "memperbaiki" hasil; ia memakai prediksi LLM run yang sama.

### 4.1 Perintah target (belum tersedia)

Perintah berikut adalah target saat implementasi; belum ada `package.json` di repo ini.

```bash
cmd //c "npm run eval:validate"
cmd //c "npm run eval:rules"
cmd //c "npm run eval:llm"
cmd //c "npm run eval:hybrid"
cmd //c "npm run eval:report"
```

Harness harus bisa dijalankan tanpa UI dan tanpa database produksi. Dataset dan hasil tidak boleh bergantung pada state aplikasi.

---

## 5. Metrik dan cara menghitung

Untuk N item:

- **Accuracy** = jumlah prediksi benar / N.
- **Precision per kelas** = TP / (TP + FP).
- **Recall per kelas** = TP / (TP + FN).
- **F1 per kelas** = 2 × (P × R) / (P + R); 0 bila P + R = 0.
- **Macro-F1** = rata-rata F1 lima kelas tanpa bobot. Metrik utama karena kelas seimbang dan semua kategori penting.
- **Predicted `PERLU_DITINJAU` rate** = jumlah prediksi `PERLU_DITINJAU` / N. Ini **prediksi kelas**, bukan ukuran abstain operasional.
- **Operational abstain rate (S8)** = item berlabel **bukan** `PERLU_DITINJAU` yang diprediksi `PERLU_DITINJAU` / jumlah item berlabel bukan `PERLU_DITINJAU`. Inilah biaya operasional eskalasi palsu; namai eksplisit, jangan campur dengan metrik sebelumnya.
- **Missed escalation rate** = item berlabel `PERLU_DITINJAU` yang diprediksi kategori lain / jumlah item `PERLU_DITINJAU`.
- **Invalid-output rate** = percobaan LLM dengan `error_code=INVALID_OUTPUT` / seluruh percobaan LLM. Wajib dilaporkan untuk LLM-only dan hybrid.
- **Fallback rate** = item yang hasil akhirnya bukan dari LLM / N (relevan untuk hybrid). Laporkan bersama alasan fallback.
- **Latency p50/p95** = persentil durasi classifier per item. Laporkan dua versi: hanya panggilan sukses, dan semua percobaan termasuk timeout/fallback.
- **Biaya per 1000 klasifikasi** = ((rata-rata `input_tokens` / 1.000.000) × harga input list price + (rata-rata `output_tokens` / 1.000.000) × harga output list price) × 1000. Sertakan retry dan fallback dalam rata-rata. Untuk free tier, laporkan biaya efektif (0) dan biaya list price secara terpisah; karena hybrid memakai ulang prediksi LLM, biayanya sama dengan LLM.

**Sumber harga list price (wajib dicatat):** estimasi biaya memakai harga list price resmi provider pada tanggal pengambilan, dalam USD per 1 juta token. Isi tabel berikut saat run, lalu salin ke `config.json` dan laporan. Jangan memakai harga lisan atau harga yang tidak bertanggal.

| Item | Nilai |
| --- | --- |
| Provider | - (mis. Google Gemini API) |
| Sumber harga | - (URL dokumentasi harga resmi provider) |
| Tanggal pengambilan harga | - (`YYYY-MM-DD`) |
| Mata uang | USD |
| Harga input (USD / 1 juta token) | - |
| Harga output (USD / 1 juta token) | - |
| Catatan free tier | - (kuota gratis, masa berlaku, batas laju) |
- **Confusion matrix** = matriks 5×5, baris = label referensi, kolom = prediksi.

Interval kepercayaan: laporkan 95% Wilson interval untuk accuracy dan bootstrap untuk macro-F1. Dengan test set 80 item, interval akan lebar; ini harus disebut, bukan disembunyikan.

### 5.1 Target awal (belum diukur)

Semua angka di bawah adalah **target perencanaan**, bukan hasil.

| Metrik | Rules | LLM | Hybrid |
| --- | --- | --- | --- |
| Macro-F1 | >= 0,60 | >= 0,80 | >= 0,80 (sama dengan LLM; S9) |
| Accuracy | >= 0,60 | >= 0,80 | >= 0,80 |
| Invalid-output rate | 0 | <= 5% | <= 5% |
| Fallback rate | 0 | 0 | <= 10% |
| p95 latency | < 50 ms | <= 8 detik | <= 8 detik (reuse prediksi) |
| Biaya per 1000 | 0 | dilaporkan (list price) | sama dengan LLM |

Target hybrid tidak dibuat lebih tinggi dari LLM karena hybrid memakai ulang prediksi LLM yang sama dan hanya menambah rules/fallback; perbedaan hasil harus dijelaskan, bukan diklaim sebagai keunggulan tanpa bukti.

Target ini boleh direvisi setelah baseline nyata diukur, tetapi revisi harus dicatat dan tidak boleh dilakukan setelah melihat hasil test untuk "menyelamatkan" klaim.

---

## 6. Template hasil

Isi tabel setelah eksperimen. Jangan mengisi angka sebelum ada run nyata; gunakan `-` atau "belum diukur".

### 6.1 Ringkasan

| Sistem | Accuracy | 95% CI | Macro-F1 | Pred. `PERLU` | Op. abstain | Missed escalation | Invalid-output | Fallback | p50 | p95 | Biaya/1000 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rules | - | - | - | - | - | - | - | - | - | - | - |
| LLM | - | - | - | - | - | - | - | - | - | - | - |
| Hybrid | - | - | - | - | - | - | - | - | - | - | - |

### 6.2 Per kelas

| Sistem | Kelas | Precision | Recall | F1 | Support |
| --- | --- | --- | --- | --- | --- |
| Rules | Kebersihan Kamar | - | - | - | 16 |
| Rules | Teknisi & Fasilitas | - | - | - | 16 |
| Rules | Makanan & Minuman | - | - | - | 16 |
| Rules | Resepsionis | - | - | - | 16 |
| Rules | Perlu Ditinjau | - | - | - | 16 |
| LLM | Kebersihan Kamar | - | - | - | 16 |
| LLM | Teknisi & Fasilitas | - | - | - | 16 |
| LLM | Makanan & Minuman | - | - | - | 16 |
| LLM | Resepsionis | - | - | - | 16 |
| LLM | Perlu Ditinjau | - | - | - | 16 |
| Hybrid | Kebersihan Kamar | - | - | - | 16 |
| Hybrid | Teknisi & Fasilitas | - | - | - | 16 |
| Hybrid | Makanan & Minuman | - | - | - | 16 |
| Hybrid | Resepsionis | - | - | - | 16 |
| Hybrid | Perlu Ditinjau | - | - | - | 16 |

### 6.3 Confusion matrix (template)

Baris = label referensi; kolom = prediksi. Isi dengan jumlah item.

| Referensi \ Prediksi | Kebersihan | Teknisi | F&B | Resepsionis | Perlu Ditinjau | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Kebersihan | - | - | - | - | - | 16 |
| Teknisi | - | - | - | - | - | 16 |
| F&B | - | - | - | - | - | 16 |
| Resepsionis | - | - | - | - | - | 16 |
| Perlu Ditinjau | - | - | - | - | - | 16 |
| Total | - | - | - | - | - | 80 |

### 6.4 Analisis error

| ID | Teks (potong 120 char) | Label | Prediksi | Sistem | Catatan |
| --- | --- | --- | --- | --- | --- |
| - | - | - | - | - | - |

### 6.5 Stabilitas (DEV subset 30 item, 3 run)

Uji ini memakai item dari **split dev**, bukan test. Tujuannya melihat variasi, bukan memilih run terbaik.

| Run | Accuracy | Macro-F1 | Jumlah output invalid | Catatan |
| --- | --- | --- | --- | --- |
| 1 | - | - | - | - |
| 2 | - | - | - | - |
| 3 | - | - | - | - |

### 6.6 Uji eksternal pilot (30 keluhan nyata)

| Metrik | Nilai | Catatan |
| --- | --- | --- |
| Jumlah item | - | Setelah anonimisasi |
| Accuracy | - | - |
| Macro-F1 | - | - |
| Tingkat koreksi oleh petugas | - | Dari data aplikasi, bila tersedia |
| Perbedaan vs sintetis | - | Arah dan besar perbedaan |

### 6.7 Cara membaca confusion matrix

1. **Diagonal** adalah prediksi benar. Jumlah diagonal / total = accuracy.
2. **Sel di luar diagonal** menunjukkan arah kesalahan. Contoh: baris Kebersihan, kolom Teknisi berarti keluhan kebersihan diprediksi sebagai masalah teknisi.
3. **Baris** menunjukkan recall: dari semua item berlabel X, berapa yang benar diprediksi X.
4. **Kolom** menunjukkan precision: dari semua yang diprediksi Y, berapa yang benar-benar Y.
5. Pola yang perlu dicari: kebingungan Kebersihan vs Teknisi (air, AC, bau), F&B vs Resepsionis (room service, sarapan), dan kategori lain vs `Perlu Ditinjau`.
6. `Perlu Ditinjau` tidak otomatis "salah". Item yang benar-benar ambigu memang seharusnya masuk sana; karena itu laporkan juga operational abstain (false escalation) dan missed escalation.
7. Jangan menyimpulkan dari accuracy saja bila distribusi kelas berubah. Dataset ini seimbang, tetapi data pilot belum tentu.
8. Periksa support per kelas. Per-class F1 dengan 16 item sangat sensitif; satu-dua item bisa mengubah angka besar.

---

## 7. Batas kejujuran metodologis

### 7.1 Ancaman validitas

| Ancaman | Dampak | Pengurangan |
| --- | --- | --- |
| Dataset sintetis ditulis sendiri | Hasil cenderung optimistis; penulis tahu pola yang diharapkan | Split beku, review buta 20%, uji 30 keluhan nyata, laporkan batas |
| Satu anotator | Bias label pribadi | Anotator kedua untuk 20%, kappa, adjudikasi |
| Test set kecil (80 item) | Interval kepercayaan lebar; per-class hanya 16 item | Laporkan CI; jangan klaim generalisasi |
| Prompt/rules disesuaikan di dev, tetapi penulis juga tahu test | Kebocoran tidak langsung | Test tidak dipakai untuk iterasi; hash dan commit dicatat; `rules.v1` dibekukan sebelum hash test |
| Errata setelah final run | Hasil tidak sebanding | Window errata ditutup setelah final run; perubahan = dataset/rules versi baru + rerun ketiga sistem + arsip hasil lama |
| Hybrid memakai ulang prediksi LLM | Kegagalan provider pada run terpisah tidak terukur | Nyatakan sebagai batasan; yang dievaluasi adalah fallback atas output LLM tercatat; fallback rate dan invalid-output rate tetap dilaporkan |
| Distribusi tidak mewakili hotel nyata | Performa di lapangan bisa turun | Uji pilot 30 keluhan nyata; bandingkan per kategori |
| Bahasa dan budaya terbatas | Dialek, bahasa daerah, dan gaya tamu asing tidak tercakup | Sebut batas; tambah variasi terbatas; jangan klaim multibahasa |
| Ambiguitas buatan | Tidak sama dengan ambiguitas nyata | Definisikan aturan label; uji dengan petugas |
| Model provider berubah | Hasil tidak reproducible | Pin model ID, catat tanggal, simpan respons, jalankan ulang bila berubah |
| Free tier | Kuota, rate limit, dan kebijakan data berbeda dari produksi | Laporkan; uji provider berbayar sebelum pilot bila perlu |
| Angka biaya | Free tier tidak mencerminkan biaya nyata | Laporkan biaya list price dan biaya efektif terpisah |

### 7.2 Aturan pelaporan

- Sebut jumlah item, split, versi dataset, prompt, model, dan tanggal.
- Tampilkan confusion matrix, bukan hanya satu angka.
- Tampilkan hasil yang buruk dan analisis error; jangan hanya contoh yang benar.
- Jangan memilih run terbaik dari beberapa run untuk laporan utama.
- Jangan mengklaim "akurat" tanpa angka dan batas.
- Jangan menyebut dataset sintetis sebagai "data hotel".
- Jangan mencampur data demo (`isDemo=true`) dengan hasil evaluasi.
- Bila hasil di bawah target, tulis apa adanya dan jelaskan kemungkinan penyebab.
- Cantumkan bahwa hasil ini belum tentu berlaku untuk keluhan nyata sampai uji pilot dilakukan.

### 7.3 Uji eksternal saat pilot

Saat pilot, ambil 30 keluhan nyata dengan izin hotel, anonimkan nama/kamar/kontak, lalu anotasi dengan aturan yang sama. Jalankan hybrid dan bandingkan dengan hasil sintetis. Laporkan:

- perbedaan accuracy dan macro-F1;
- kategori yang paling sering berubah;
- tingkat koreksi kategori oleh petugas di aplikasi;
- contoh kesalahan yang tidak muncul di dataset sintetis.

Jika hasil nyata jauh lebih buruk, jangan menyembunyikan; jadikan dasar perbaikan prompt, rules, atau alur verifikasi.

---

## 8. Artefak keluaran dan lokasi

```text
eval/
  dataset/
    smartguest-v1.jsonl
    manifest.sha256
  runs/
    2026-11-04T10-00-00Z/
      config.json
      rules/
        predictions.jsonl
        metrics.json
        confusion-matrix.csv
      llm/
        predictions.jsonl
        metrics.json
        confusion-matrix.csv
      hybrid/
        predictions.jsonl
        metrics.json
        confusion-matrix.csv
      report.html
      SUMMARY.md
  reports/
    latest/
      report.html
      SUMMARY.md
      confusion-matrix-hybrid.csv
```

### 8.1 Format prediksi mentah

`predictions.jsonl`, satu baris per item:

```json
{"id":"sg-0001","run_id":"run-2026-11-04T10-00-00Z","request_id":"req-7f3c...","label":"KEBERSIHAN_KAMAR","predicted":"KEBERSIHAN_KAMAR","confidence":0.810,"source":"LLM","input_tokens":132,"output_tokens":24,"latency_ms":1240,"error_code":null,"is_final":true,"correct":true}
```

Field wajib: `id`, `run_id`, `request_id`, `label`, `predicted`, `confidence`, `source`, `input_tokens`, `output_tokens`, `latency_ms`, `error_code`, `is_final`, `correct`. Konvensi:

- `run_id` mengidentifikasi satu eksekusi harness (satu folder `eval/runs/<run>/`); `request_id` mengidentifikasi satu klasifikasi/item dan dipakai untuk mengaitkan prediksi LLM dengan baris hybrid yang memakai ulang hasil yang sama di `run_id` itu.
- `source` memakai UPPERCASE: `LLM`, `RULES`, atau `MANUAL`, konsisten dengan kontrak JSON di `docs/PLAN.md` §4.7.
- `input_tokens` dan `output_tokens` bertipe nullable. Untuk `source=RULES` (dan `MANUAL`), isinya `null`, bukan `0`, karena tidak ada panggilan provider. Rata-rata biaya hanya dihitung dari baris dengan token tidak null.

Jangan menyimpan API key, prompt lengkap, atau PII.

### 8.2 File laporan

| Artefak | Isi | Lokasi |
| --- | --- | --- |
| `metrics.json` | Semua metrik agregat dan per kelas, parameter run | `eval/runs/<run>/<sistem>/` |
| `confusion-matrix.csv` | Matriks 5×5, baris referensi, kolom prediksi | `eval/runs/<run>/<sistem>/` |
| `predictions.jsonl` | Prediksi per item | `eval/runs/<run>/<sistem>/` |
| `report.html` | Laporan mandiri tanpa CDN eksternal: ringkasan, tabel, confusion matrix, error | `eval/runs/<run>/` |
| `SUMMARY.md` | Ringkasan naratif: hasil, batasan, kesimpulan | `eval/runs/<run>/` |
| `config.json` | Commit, `run_id`, model, prompt version, dataset hash, tanggal, parameter, sumber + tanggal + mata uang harga list price | `eval/runs/<run>/` |
| Salinan terbaru | Hasil yang dirujuk presentasi | `eval/reports/latest/` |

Aturan:

- Commit dataset, manifest, konfigurasi, prediksi, metrik, dan laporan ke repo. Jangan commit secret atau respons mentah yang memuat PII.
- HTML report harus dapat dibuka tanpa internet.
- Setiap laporan memuat dataset hash, commit hash, model, prompt version, dan tanggal.
- Jangan menimpa run lama; buat folder run baru.

### 8.3 Checklist sebelum mengklaim hasil

- [ ] `rules.v1` dibekukan dan di-hash sebelum test split dibekukan.
- [ ] Dataset 200 item, distribusi dan komposisi `PERLU_DITINJAU` sesuai, manifest hash ada.
- [ ] Validator near-duplicate lintas split (trigram/Jaccard > 0,90) melaporkan nol pelanggaran.
- [ ] Test set tidak diubah setelah hash dibekukan; tidak ada errata setelah final run.
- [ ] Rules, LLM, dan hybrid memakai item dan urutan yang sama.
- [ ] Hybrid memakai ulang prediksi LLM dari `run_id` yang sama, bukan panggilan provider baru.
- [ ] Semua item punya prediksi; tidak ada yang hilang.
- [ ] `predictions.jsonl` memuat `run_id`, `request_id`, `input_tokens`, `output_tokens`; token `null` untuk rules/manual.
- [ ] Confusion matrix 5×5 dan metrik per kelas tersedia.
- [ ] Predicted `PERLU` rate, operational abstain rate, dan missed escalation rate dilaporkan terpisah.
- [ ] Invalid-output rate dan fallback rate dilaporkan.
- [ ] Sumber harga list price, tanggal pengambilan, dan mata uang tercatat di `config.json` dan laporan.
- [ ] Analisis error minimal 10 item.
- [ ] Batasan sintetis, ukuran test, dan model disebut.
- [ ] Angka di ringkasan sama dengan file metrik.
- [ ] Tidak ada klaim yang tidak dapat ditelusuri ke artefak.
