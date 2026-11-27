# Ringkasan Evaluasi Klasifikasi Keluhan

- Tanggal run: 2026-11-27T02:57:27.402Z
- Model: `deepseek-chat`
- Host API: api.deepseek.com
- Jumlah item: 100
- Akurasi: **89.00%** (89/100 benar)
- Macro-F1: **0.8889**
- Operational abstain rate: **3.75%** (3/80 item non-perlu_ditinjau diprediksi perlu_ditinjau)
- Latensi p50: **888 ms**; p95: **1295 ms**; rata-rata: 901 ms

## Metrik per kategori

| Kategori | Support | Prediksi | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- |
| kebersihan | 20 | 20 | 0.9500 | 0.9500 | 0.9500 |
| teknisi | 20 | 23 | 0.8696 | 1.0000 | 0.9302 |
| fnb | 20 | 19 | 0.9474 | 0.9000 | 0.9231 |
| resepsionis | 20 | 19 | 0.8421 | 0.8000 | 0.8205 |
| perlu_ditinjau | 20 | 19 | 0.8421 | 0.8000 | 0.8205 |

## Catatan

- Confusion matrix lengkap ada di `matrix.csv` dan `matrix.md`.
- Prediksi per item ada di `predictions.jsonl`.
- Prompt dan model tidak diubah selama evaluasi; angka ini adalah pengukuran, bukan hasil tuning.
- abstain rate dihitung hanya dari item yang label sebenarnya bukan `perlu_ditinjau`.

