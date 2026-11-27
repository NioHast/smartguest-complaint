# Evaluasi Klasifikasi Keluhan SmartGuest

Dataset berlabel dan harness untuk mengukur performa `classifyComplaint()` di `app/src/lib/ai.ts`.

## Cara menjalankan

Dari direktori `app/` (memuat `app/.env` otomatis):

```bash
cd app
npm run eval
```

Alternatif dari root repo, dengan flag env eksplisit:

```bash
node --env-file-if-exists=app/.env app/scripts/eval.mjs
```

Butuh `AI_API_KEY` di `app/.env`. Skrip memanggil AI 100 kali secara berurutan
dengan jeda 800-1200 ms agar tidak menabrak rate limit. Bila key kosong atau ada
panggilan gagal (setelah satu kali ulang), skrip exit 1 tanpa menulis hasil.

## Isi

- `dataset.jsonl` - 100 keluhan Bahasa Indonesia, 20 per kategori.
- `results/predictions.jsonl` - prediksi per item + latency.
- `results/matrix.csv`, `results/matrix.md` - confusion matrix 5x5.
- `results/summary.md` - akurasi, macro-F1, metrik per kategori, abstain rate, latensi.

## Run terakhir

- Tanggal: 2026-11-27T02:57:27.402Z
- Model: `deepseek-chat`
- Jumlah item: 100

## Batasan

- Dataset **sintetis** 100 item yang ditulis penulis; bukan keluhan tamu nyata dan
  tidak mewakili distribusi keluhan hotel sebenarnya.
- Label adalah penilaian manusia tunggal (penulis dataset). Item ambigu diberi
  catatan alasan, tetapi label tetap bisa diperdebatkan.
- Sampel kecil (100 item), sehingga selisih beberapa persen tidak stabil secara statistik.
- Prompt/model dapat berubah kapan saja; hasil tidak sepenuhnya deterministik dan
  tidak boleh digeneralisasi ke populasi tamu lain.
- Evaluasi hanya mengukur kategori, bukan kualitas alasan atau kalibrasi confidence.

