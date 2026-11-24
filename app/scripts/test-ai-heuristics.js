// Verifikasi mesin klasifikasi aturan kata kunci SmartGuest.
// Jalankan: node scripts/test-ai-heuristics.js

import { classifyByRules } from '../src/lib/ai.ts';

const testCases = [
  {
    text: 'AC kamar tidak dingin, saya sudah lapor tapi belum ditindaklanjuti',
    expected: 'teknisi',
    wajib: true,
  },
  {
    text: 'Handuk tidak diganti, kamar mandi kotor dan berbau',
    expected: 'kebersihan',
    wajib: true,
  },
  {
    text: 'Makanan sarapan dingin dan hambar',
    expected: 'fnb',
    wajib: true,
  },
  {
    text: 'Check-in lama sekali, resepsionis tidak ada di meja',
    expected: 'resepsionis',
    wajib: true,
  },
  {
    text: 'Terima kasih pelayanannya bagus',
    expected: 'perlu_ditinjau',
    wajib: true,
  },
  {
    text: 'Lampu kamar 402 mati dan tidak bisa dinyalakan',
    expected: 'teknisi',
  },
  {
    text: 'Sprei bernoda dan sampah di kamar belum diangkut',
    expected: 'kebersihan',
  },
  {
    text: 'Nasi ayam yang saya pesan masih mentah dan rasanya hambar',
    expected: 'fnb',
  },
  {
    text: 'Antrean check-out panjang dan tidak ada staf di meja resepsionis',
    expected: 'resepsionis',
  },
  {
    text: 'Kebisingan dari kamar sebelah membuat saya tidak bisa tidur',
    expected: 'perlu_ditinjau',
  },
  {
    text: 'Air panas tidak keluar, keran kamar mandi rusak',
    expected: 'teknisi',
  },
  {
    text: 'WiFi di kamar lambat dan sering terputus',
    expected: 'teknisi',
  },
  {
    text: 'Pintu kamar tidak bisa dikunci, kartu kamar juga tidak berfungsi',
    expected: 'teknisi',
  },
  {
    text: 'Resepsionis tidak ramah saat saya menanyakan tagihan',
    expected: 'resepsionis',
  },
  {
    text: 'Handuk basah dan sprei kotor',
    expected: 'kebersihan',
  },
  {
    text: 'AC nya tewas, kamar terasa panas sekali',
    expected: 'teknisi',
  },
  {
    text: 'Kamar saya berdebu dan cermin kamar mandi belum dibersihkan',
    expected: 'kebersihan',
  },
  {
    text: 'Pesanan room service salah, saya minta jus tapi diberi teh',
    expected: 'fnb',
  },
];

let lulus = 0;

console.log('====================================================');
console.log('VERIFIKASI KLASIFIKASI ATURAN KATA KUNCI SMARTGUEST');
console.log('====================================================\n');

testCases.forEach((testCase, index) => {
  const hasil = classifyByRules(testCase.text);
  const kategoriCocok = hasil.category === testCase.expected;
  const sumberCocok = hasil.source === 'rules';
  const confidenceValid =
    typeof hasil.confidence === 'number' && hasil.confidence >= 0 && hasil.confidence <= 1;
  const alasanValid = typeof hasil.reason === 'string' && hasil.reason.length > 0;
  const lolos = kategoriCocok && sumberCocok && confidenceValid && alasanValid;

  if (lolos) lulus += 1;

  console.log(`Kasus #${String(index + 1).padStart(2, '0')}${testCase.wajib ? ' (wajib)' : ''}: "${testCase.text}"`);
  console.log(`  - Kategori : ${hasil.category} (harap: ${testCase.expected}) [${kategoriCocok ? 'LULUS' : 'GAGAL'}]`);
  console.log(`  - Keyakinan: ${(hasil.confidence * 100).toFixed(0)}%`);
  console.log(`  - Sumber   : ${hasil.source} [${sumberCocok ? 'LULUS' : 'GAGAL'}]`);
  console.log(`  - Alasan   : ${hasil.reason}`);
  console.log(`  - Hasil    : ${lolos ? 'LULUS' : 'GAGAL'}\n`);
});

console.log('====================================================');
console.log(`RINGKASAN: ${lulus}/${testCases.length} KASUS LULUS`);
console.log('====================================================');

process.exit(lulus === testCases.length ? 0 : 1);
