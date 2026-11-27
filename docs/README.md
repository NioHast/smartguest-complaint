# Indeks Dokumen

> Dokumen di folder ini mencerminkan implementasi per **27 November 2026**.
> Lokasi dari root repo: `docs/PLAN.md`, `docs/EVALUATION.md`, `docs/BLACKBOX.md`.

| Dokumen | Isi |
| --- | --- |
| [`PLAN.md`](PLAN.md) | Arsitektur, model data aktual, alur tamu/petugas, fitur, keputusan teknis, batasan, dan perintah menjalankan. |
| [`EVALUATION.md`](EVALUATION.md) | Metode evaluasi klasifikasi: dataset 100 item (20 per kategori), aturan label, metrik, dan batasan metodologis. Angka hasil tidak ditulis di sini; lihat `eval/results/summary.md`. |
| [`BLACKBOX.md`](BLACKBOX.md) | Hasil uji black-box pada satu build: identitas eksekusi, ringkasan status, detail skenario, dan bukti. |

Dataset, harness, dan hasil evaluasi ada di `eval/`. Jalankan dari direktori
`app/` dengan `npm run eval` (butuh `AI_API_KEY`).
