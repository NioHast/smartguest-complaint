# SmartGuest Complaint — Spesifikasi Rules Classifier

- Versi: `rules.v1`
- Tanggal: 4 November 2026
- Status: spesifikasi; implementasi dan pengujian belum dibuat
- Dokumen induk: `docs/PLAN.md` (§5.9) dan `docs/EVALUATION.md` (§3)

Dokumen ini mendefinisikan rules classifier secara lengkap: kata kunci, bobot, ambang, tie-break, formula confidence, versi, dan fixture. Tujuannya agar rules deterministik, dapat diuji, dan dapat dibekukan sebelum test set evaluasi dibekukan.

> **Catatan kejujuran:** isi awal kata kunci dan bobot bersifat **hipotesis**. Boleh direvisi hanya di luar test set. Setelah `rules.v1` dibekukan dan test split di-hash, perubahan apa pun harus menjadi `rules.v2` + rerun ketiga sistem.

---

## 1. Ruang lingkup

Rules classifier memetakan teks keluhan Bahasa Indonesia ke salah satu dari lima kategori:

| Kode | Kategori |
| --- | --- |
| `KEBERSIHAN_KAMAR` | Kebersihan Kamar |
| `TEKNISI_FASILITAS` | Teknisi & Fasilitas |
| `MAKANAN_MINUMAN` | Makanan & Minuman |
| `RESEPSIONIS` | Resepsionis |
| `PERLU_DITINJAU` | Perlu Ditinjau |

Rules **tidak** menentukan departemen, status, atau aksi. Rules tidak memanggil network, tidak memakai random, dan tidak memakai jam/waktu server.

---

## 2. Normalisasi input

Urutan operasi (harus sama di unit test dan produksi):

1. Trim.
2. Unicode NFKC.
3. Lowercase.
4. Hapus karakter zero-width (`\u200B`-`\u200D`, `\uFEFF`).
5. Ganti tanda baca kecuali hyphen (`-`) dengan spasi.
6. Collapse whitespace berulang menjadi satu spasi.
7. Batasi 2000 karakter (konstanta `MAX_COMPLAINT_CHARS`).
8. Tokenisasi dengan pemisah spasi.
9. Untuk setiap token dengan panjang > 5, hapus sufiks posesif `nya`, `ku`, `mu` (contoh: `spreinya` -> `sprei`, `handuknya` -> `handuk`, `telurnya` -> `telur`). Tidak ada stemming lain.

Input kosong/whitespace tidak pernah dikirim ke rules; pemanggil wajib menolak lebih dulu (5-2000 karakter).

---

## 3. Tabel kata kunci dan bobot

Aturan entri:

- Bobot bulat 1-3.
- Frasa maksimal 3 token (contoh: `tidak mengalir`, `room service`).
- Satu kata kunci hanya boleh dimiliki satu kategori.
- Pencocokan memakai **longest match**: frasa 3 token dicek sebelum 2 token, sebelum 1 token. Kata kunci yang tumpang tindih dengan match yang lebih panjang tidak dihitung dua kali.
- Setiap kata kunci dihitung **paling banyak sekali** per item, berapa pun kemunculannya.

### 3.1 `KEBERSIHAN_KAMAR` (18 entri)

| Kata kunci | Bobot |
| --- | --- |
| noda | 2 |
| kotor | 2 |
| bau | 2 |
| apek | 2 |
| debu | 2 |
| berdebu | 1 |
| sprei | 2 |
| handuk | 2 |
| selimut | 1 |
| bantal | 1 |
| sampah | 2 |
| rambut | 2 |
| jamur | 2 |
| lendir | 2 |
| kerak | 1 |
| jorok | 2 |
| kusam | 1 |
| pengap | 1 |

### 3.2 `TEKNISI_FASILITAS` (20 entri)

| Kata kunci | Bobot |
| --- | --- |
| ac | 2 |
| bocor | 3 |
| rusak | 2 |
| mati | 2 |
| lampu | 2 |
| air | 1 |
| mengalir | 2 |
| listrik | 2 |
| kran | 2 |
| shower | 2 |
| tv | 2 |
| remote | 1 |
| wifi | 1 |
| lift | 2 |
| berfungsi | 2 |
| teknisi | 2 |
| panas | 1 |
| tidak mengalir | 3 |
| tidak dingin | 3 |
| tidak berfungsi | 3 |

### 3.3 `MAKANAN_MINUMAN` (19 entri)

| Kata kunci | Bobot |
| --- | --- |
| sarapan | 2 |
| makan | 1 |
| makanan | 2 |
| minuman | 2 |
| nasi | 2 |
| telur | 2 |
| ayam | 2 |
| ikan | 2 |
| basi | 3 |
| hambar | 2 |
| mentah | 2 |
| restoran | 2 |
| room service | 2 |
| menu | 2 |
| porsi | 2 |
| keracunan | 3 |
| kadaluarsa | 3 |
| tidak enak | 2 |
| dingin | 1 |

### 3.4 `RESEPSIONIS` (18 entri)

| Kata kunci | Bobot |
| --- | --- |
| resepsionis | 3 |
| resepionis | 3 |
| check in | 2 |
| checkin | 2 |
| check out | 2 |
| antre | 2 |
| antri | 2 |
| lama | 1 |
| reservasi | 2 |
| booking | 2 |
| tidak ramah | 3 |
| judes | 2 |
| bellboy | 2 |
| koper | 2 |
| front desk | 2 |
| telepon | 1 |
| salah kamar | 3 |
| deposit | 1 |

Catatan: `resepsionis` dan `resepionis` adalah dua entri sengaja (salah ketik umum). Total entri = 18 + 20 + 19 + 18 = **75**.

`PERLU_DITINJAU` tidak punya kata kunci; ia adalah hasil abstain (lihat §4).

---

## 4. Skoring, ambang, dan tie-break

Untuk setiap kategori `c`:

```text
S_c = jumlah bobot kata kunci unik yang cocok dan tidak dinegasi
Best = max(S_c)
Second = nilai tertinggi kedua (0 bila tidak ada)
```

Penanganan negasi:

- Token negasi: `tidak`, `belum`, `bukan`, `gak`, `nggak`, `tdk`, `tak`.
- Bila kata kunci (yang tidak dimulai dengan token negasi) didahului token negasi dalam jarak maksimal 2 token, kata kunci itu dianggap tidak cocok (bobot 0).
- Frasa yang sudah mengandung negasi (`tidak mengalir`, `tidak dingin`, `tidak enak`, `tidak ramah`) dicocokkan lebih dulu sebagai frasa; token negasi tidak menegasi frasa itu lagi.

Aturan keputusan:

1. Bila `Best < MIN_SCORE` (3) -> `PERLU_DITINJAU`.
2. Bila `Best == Second` dan `Best >= 3` -> `PERLU_DITINJAU` (seri tidak boleh dimenangkan secara arbitrer).
3. Selain itu -> kategori dengan skor `Best`.
4. Bila tidak ada kata kunci sama sekali -> `PERLU_DITINJAU`.

Tidak ada tie-break berbasis urutan kategori, panjang teks, atau waktu. Aturan 1-3 sudah deterministik.

---

## 5. Formula confidence

Confidence hanya untuk keputusan yang punya pemenang. Nilainya **tidak diklaim terkalibrasi**; ia hanya skor deterministik 0-1.

```text
jika PERLU_DITINJAU karena Best < 3:
  confidence = 0.300
jika PERLU_DITINJAU karena seri:
  confidence = 0.400
selain itu:
  raw = 0.50 + 0.08 * Best - 0.04 * Second
  confidence = min(0.950, max(0.000, raw))
  confidence = round_half_up(confidence, 3)
```

`round_half_up(x, 3) = Math.round(x * 1000) / 1000` pada JavaScript.

Sifat:

- Monoton naik terhadap `Best`, monoton turun terhadap `Second`.
- Tidak pernah melebihi 0,950 agar tidak terlihat "pasti benar".
- Tidak memakai panjang teks, jumlah token, atau waktu.

---

## 6. Versi dan pembekuan

| Item | Nilai |
| --- | --- |
| `RULES_VERSION` | `rules.v1` |
| Lokasi implementasi | `lib/ai/rules.ts` |
| Hash | `RULES_HASH = sha256(JSON kanonik)`; JSON kanonik: UTF-8, key diurutkan leksikografis, tanpa whitespace berlebih, menyertakan `RULES_VERSION`, semua entri kata kunci + bobot per kategori, `MIN_SCORE`, aturan tie-break, dan seluruh parameter formula confidence |
| Pembekuan | `rules.v1` dibekukan **sebelum** split test di-hash |
| Perubahan setelah beku | Naikkan versi (`rules.v2`), hitung hash baru, rerun rules + LLM + hybrid pada test set yang sama, arsipkan hasil lama |

`RULES_VERSION` adalah konstanta kode, bukan env. Alasan: env bisa berubah tanpa commit dan membuat hash test tidak bermakna.

Definisi kanonik `RULES_HASH` (harus deterministik lintas mesin):

1. Bentuk objek JSON: `{ "rulesVersion": RULES_VERSION, "minScore": MIN_SCORE, "keywords": { "<KATEGORI>": { "<kata kunci>": <bobot>, ... }, ... }, "tieBreak": <aturan>, "confidence": { <parameter formula §5> } }`.
2. Key di setiap level diurutkan **leksikografis** (kode Unicode, case-sensitive) sebelum serialisasi.
3. Serialisasi tanpa whitespace (pemisah `,` dan `:` saja), UTF-8 tanpa BOM.
4. `RULES_VERSION`, semua bobot, `MIN_SCORE`, aturan tie-break, dan semua ambang/parameter formula confidence **wajib** ikut di-hash; mengubah salah satunya mengubah hash.
5. `RULES_HASH = "sha256:" + hex(sha256(bytes UTF-8))`, dicatat di laporan dan manifest test set.

---

## 7. Fixture wajib (15 item)

Fixture ini adalah unit test kontrak. Format: `input` -> kategori yang diharapkan + confidence yang diharapkan. Semua confidence dihitung dengan formula §5.

| ID | Input | Kategori | Confidence | Catatan |
| --- | --- | --- | --- | --- |
| F01 | `spreinya ada noda kuning dan handuknya bau apek` | `KEBERSIHAN_KAMAR` | 0.950 | skor 10 (sprei 2 + noda 2 + handuk 2 + bau 2 + apek 2) |
| F02 | `AC di kamar 412 tidak dingin dari semalam` | `TEKNISI_FASILITAS` | 0.900 | skor 5 (ac 2 + tidak dingin 3); `dingin` tidak dihitung |
| F03 | `air di kamar mandi tidak mengalir` | `TEKNISI_FASILITAS` | 0.820 | skor 4 (tidak mengalir 3 + air 1) |
| F04 | `sarapan nasi gorengnya dingin dan telurnya mentah` | `MAKANAN_MINUMAN` | 0.950 | skor 9 (sarapan 2 + nasi 2 + dingin 1 + telur 2 + mentah 2) |
| F05 | `check in lama banget antre hampir 40 menit` | `RESEPSIONIS` | 0.900 | skor 5 (check in 2 + lama 1 + antre 2) |
| F06 | `resepsionis tidak ramah dan judes` | `RESEPSIONIS` | 0.950 | skor 8 (resepsionis 3 + tidak ramah 3 + judes 2) |
| F07 | `wifi mati dan tv tidak berfungsi` | `TEKNISI_FASILITAS` | 0.950 | skor 8 (wifi 1 + mati 2 + tv 2 + tidak berfungsi 3) |
| F08 | `lampu kamar mandi rusak, teknisi belum datang` | `TEKNISI_FASILITAS` | 0.950 | skor 6 (lampu 2 + rusak 2 + teknisi 2) |
| F09 | `makanan basi, ayamnya bau` | `MAKANAN_MINUMAN` | 0.950 | skor 7 vs 2 (makanan 2 + basi 3 + ayam 2; bau 2 milik Kebersihan) |
| F10 | `selimut dan bantal bau apek` | `KEBERSIHAN_KAMAR` | 0.950 | skor 6 (selimut 1 + bantal 1 + bau 2 + apek 2) |
| F11 | `apa kabar selamat pagi` | `PERLU_DITINJAU` | 0.300 | tidak ada kata kunci |
| F12 | `tolong bantu` | `PERLU_DITINJAU` | 0.300 | tidak ada kata kunci |
| F13 | `AC bocor dan air menetes ke kasur` | `TEKNISI_FASILITAS` | 0.950 | skor 6 (ac 2 + bocor 3 + air 1) |
| F14 | `sarapan telat dan kamar kotor` | `PERLU_DITINJAU` | 0.300 | skor terbaik 2 < ambang 3 (sarapan 2 vs kotor 2) |
| F15 | `sprei kotor dan tv mati` | `PERLU_DITINJAU` | 0.400 | seri 4 vs 4 (sprei 2 + kotor 2; tv 2 + mati 2) |

Catatan fixture:

- F02 menguji negasi + frasa.
- F04 menguji sufiks `-nya` dan kata kunci lintas kategori yang tidak boleh menang.
- F09 menguji kategori lain sebagai `Second` yang menurunkan confidence.
- F14 menguji ambang minimum.
- F15 menguji tie-break seri -> `PERLU_DITINJAU`.

---

## 8. Hubungan dengan evaluasi

- Rules adalah baseline deterministik pada `docs/EVALUATION.md` §3.
- Fixture §7 wajib lulus sebelum `rules.v1` dibekukan.
- Test set tidak boleh dipakai untuk menambah/menghapus kata kunci, mengubah bobot, atau mengubah ambang.
- Bila hasil evaluasi menunjukkan rules lemah, perbaikan dilakukan pada dev set dan menghasilkan `rules.v2`; test set hanya dijalankan ulang setelah versi baru beku.
