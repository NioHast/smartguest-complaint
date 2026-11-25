// Data seed demo untuk database lokal SmartGuest.
//
// Dipisahkan dari `db.ts` agar logika koneksi/skema tidak bercampur dengan
// konten contoh. Tanggal seed sengaja relatif terhadap waktu server saat seed
// dijalankan (perilaku lama dipertahankan): keluhan disimpan berdasarkan
// selisih jam dari `Date.now()`.
//
// Modul ini aman diimpor oleh server karena hanya berisi data dan tipe.

import type { CategoryCode, Channel, ComplaintStatus, DepartmentCode } from './types';

interface SeedLog {
  action: string;
  detail: string;
  actor: string;
  hoursAgo: number;
}

interface SeedComplaint {
  guest_name: string;
  room_number: string;
  channel: Channel;
  raw_text: string;
  ai_category: CategoryCode;
  ai_confidence: number;
  ai_reason: string;
  category?: CategoryCode;
  department?: DepartmentCode;
  change_reason?: string;
  status: ComplaintStatus;
  created_by: string;
  hoursAgo: number;
  verifiedHoursAgo?: number;
  resolvedHoursAgo?: number;
  logs: SeedLog[];
}

export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

export const SEED_COMPLAINTS: SeedComplaint[] = [
  {
    guest_name: 'Budi Santoso',
    room_number: '302',
    channel: 'phone',
    raw_text:
      'AC kamar 302 tidak dingin sejak tadi malam. Sudah saya laporkan dua kali ke front desk tetapi belum ada teknisi yang datang.',
    ai_category: 'teknisi',
    ai_confidence: 0.4,
    ai_reason: 'Keluhan menyebut AC kamar tidak dingin dan sudah dilaporkan dua kali tanpa tindak lanjut.',
    category: 'teknisi',
    department: 'engineering',
    status: 'diproses',
    created_by: 'user-staff',
    hoursAgo: 9,
    verifiedHoursAgo: 7,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Intan Permata',
        hoursAgo: 9,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Teknisi & Fasilitas → Engineering.',
        actor: 'Yusuf Maulana',
        hoursAgo: 7,
      },
    ],
  },
  {
    guest_name: 'Siti Rahmawati',
    room_number: '115',
    channel: 'front_desk',
    raw_text:
      'Handuk di kamar mandi bernoda dan tidak diganti sejak kemarin. Tisu toilet juga habis dan belum diisi ulang.',
    ai_category: 'kebersihan',
    ai_confidence: 1,
    ai_reason: 'Keluhan menyebut handuk bernoda yang belum diganti serta tisu toilet habis di kamar mandi.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 6,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Intan Permata',
        hoursAgo: 6,
      },
    ],
  },
  {
    guest_name: 'Andi Wijaya',
    room_number: '508',
    channel: 'whatsapp',
    raw_text:
      'Sarapan yang saya pesan ke kamar sudah dingin saat tiba, telur juga tidak matang sesuai permintaan.',
    ai_category: 'fnb',
    ai_confidence: 0.8,
    ai_reason: 'Keluhan menyebut sarapan room service dingin dan telur tidak matang sesuai permintaan.',
    category: 'fnb',
    department: 'fnb',
    status: 'selesai',
    created_by: 'user-manager',
    hoursAgo: 30,
    verifiedHoursAgo: 28,
    resolvedHoursAgo: 26,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui WhatsApp.',
        actor: 'Yusuf Maulana',
        hoursAgo: 30,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Makanan & Minuman → F&B.',
        actor: 'Intan Permata',
        hoursAgo: 28,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Yusuf Maulana',
        hoursAgo: 26,
      },
    ],
  },
  {
    guest_name: 'Dewi Lestari',
    room_number: '701',
    channel: 'front_desk',
    raw_text:
      'Saya menunggu hampir 45 menit sebelum mendapat kunci kamar, tanpa penjelasan dari petugas mana pun.',
    ai_category: 'perlu_ditinjau',
    ai_confidence: 0.2,
    ai_reason: 'Keluhan menyebut waktu tunggu panjang tanpa penjelasan petugas; konteksnya ambigu.',
    category: 'resepsionis',
    department: 'front_office',
    change_reason:
      'Tamu mengeluh antrean dan pelayanan front desk saat check-in, bukan kasus yang perlu ditinjau duty manager.',
    status: 'diproses',
    created_by: 'user-staff',
    hoursAgo: 3,
    verifiedHoursAgo: 2,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Intan Permata',
        hoursAgo: 3,
      },
      {
        action: 'verifikasi_ubah',
        detail:
          'Mengubah kategori dari Perlu Ditinjau ke Resepsionis (Front Office). Alasan: antrean check-in.',
        actor: 'Yusuf Maulana',
        hoursAgo: 2,
      },
    ],
  },
  {
    guest_name: 'Rizky Pratama',
    room_number: '412',
    channel: 'phone',
    raw_text:
      'Ada pesta berisik di kamar 414 sejak tengah malam. Kami sudah menelepon front desk tiga kali tetapi tidak ada yang menindak.',
    ai_category: 'perlu_ditinjau',
    ai_confidence: 0.2,
    ai_reason: 'Keluhan kebisingan antar kamar tidak jelas masuk kategori operasional mana; perlu ditinjau.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 2,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Intan Permata',
        hoursAgo: 2,
      },
    ],
  },
  {
    guest_name: 'Nur Aisyah',
    room_number: '503',
    channel: 'email',
    raw_text:
      'Ada tagihan ganda untuk parkir dan room service di struk akhir saya. Mohon diperiksa sebelum check-out besok pagi.',
    ai_category: 'resepsionis',
    ai_confidence: 0.4,
    ai_reason: 'Keluhan menyebut tagihan ganda parkir dan room service yang perlu diperiksa sebelum check-out.',
    category: 'resepsionis',
    department: 'front_office',
    status: 'selesai',
    created_by: 'user-manager',
    hoursAgo: 48,
    verifiedHoursAgo: 46,
    resolvedHoursAgo: 44,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Email.',
        actor: 'Yusuf Maulana',
        hoursAgo: 48,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Resepsionis → Front Office.',
        actor: 'Yusuf Maulana',
        hoursAgo: 46,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Ratna Puspita',
        hoursAgo: 44,
      },
    ],
  },
  {
    guest_name: 'Agus Setiawan',
    room_number: '207',
    channel: 'front_desk',
    raw_text:
      'Air panas di kamar mandi kamar 207 tidak keluar sejak pagi, keran hanya mengeluarkan air dingin.',
    ai_category: 'teknisi',
    ai_confidence: 0.4,
    ai_reason: 'Keluhan menyebut air panas tidak keluar dan keran hanya mengeluarkan air dingin.',
    category: 'teknisi',
    department: 'engineering',
    status: 'diproses',
    created_by: 'user-staff',
    hoursAgo: 1,
    verifiedHoursAgo: 0.8,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Intan Permata',
        hoursAgo: 1,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Teknisi & Fasilitas → Engineering.',
        actor: 'Intan Permata',
        hoursAgo: 0.8,
      },
    ],
  },
  {
    guest_name: 'Maya Putri',
    room_number: '918',
    channel: 'phone',
    raw_text:
      'Pintu lift sayap timur macet dan saya terjebak di dalamnya sekitar 10 menit. Tombol darurat juga tidak berfungsi.',
    ai_category: 'teknisi',
    ai_confidence: 0.6,
    ai_reason: 'Keluhan menyebut pintu lift macet dan tombol darurat tidak berfungsi; insiden keselamatan.',
    category: 'perlu_ditinjau',
    department: 'duty_manager',
    change_reason:
      'Insiden keselamatan pada lift perlu penanganan Duty Manager, bukan sekadar perbaikan teknis.',
    status: 'selesai',
    created_by: 'user-manager',
    hoursAgo: 5,
    verifiedHoursAgo: 4.5,
    resolvedHoursAgo: 4,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Yusuf Maulana',
        hoursAgo: 5,
      },
      {
        action: 'verifikasi_ubah',
        detail:
          'Mengubah kategori dari Teknisi & Fasilitas ke Perlu Ditinjau (Duty Manager). Alasan: insiden keselamatan lift.',
        actor: 'Ratna Puspita',
        hoursAgo: 4.5,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Ratna Puspita',
        hoursAgo: 4,
      },
    ],
  },
  {
    guest_name: 'Hendra Gunawan',
    room_number: '601',
    channel: 'whatsapp',
    raw_text:
      'Kolam renang tertutup tanpa pemberitahuan padahal saya memilih hotel ini karena fasilitasnya. Anak-anak kecewa sekali.',
    ai_category: 'perlu_ditinjau',
    ai_confidence: 0,
    ai_reason: 'Keluhan tentang kolam renang yang ditutup tanpa pemberitahuan tidak masuk kategori operasional yang ada.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 8,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui WhatsApp.',
        actor: 'Intan Permata',
        hoursAgo: 8,
      },
    ],
  },
  {
    guest_name: 'Rina Kartika',
    room_number: '620',
    channel: 'phone',
    raw_text:
      'Kamar terasa apek dan handuk yang tersedia masih basah. Saya sudah menunggu housekeeping sejak pagi.',
    ai_category: 'kebersihan',
    ai_confidence: 0.4,
    ai_reason: 'Keluhan menyebut kamar apek dan handuk basah; housekeeping belum datang sejak pagi.',
    category: 'kebersihan',
    department: 'housekeeping',
    status: 'diproses',
    created_by: 'user-staff',
    hoursAgo: 12,
    verifiedHoursAgo: 11,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Intan Permata',
        hoursAgo: 12,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Kebersihan Kamar → Housekeeping.',
        actor: 'Yusuf Maulana',
        hoursAgo: 11,
      },
    ],
  },
  {
    guest_name: 'Fajar Nugroho',
    room_number: '215',
    channel: 'front_desk',
    raw_text:
      'Kopi di area lobi sudah habis sejak jam 7 pagi dan staf baru mengisi ulang setelah saya ingatkan dua kali.',
    ai_category: 'perlu_ditinjau',
    ai_confidence: 0.2,
    ai_reason: 'Keluhan menyebut kopi lobi habis dan staf lambat mengisi ulang; menyangkut stok F&B.',
    category: 'fnb',
    department: 'fnb',
    change_reason: 'Keluhan menyangkut stok dan penyajian kopi di lobi, ditangani tim F&B.',
    status: 'selesai',
    created_by: 'user-staff',
    hoursAgo: 20,
    verifiedHoursAgo: 19,
    resolvedHoursAgo: 18,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Intan Permata',
        hoursAgo: 20,
      },
      {
        action: 'verifikasi_ubah',
        detail: 'Mengubah kategori dari Perlu Ditinjau ke Makanan & Minuman (F&B). Alasan: stok kopi lobi.',
        actor: 'Yusuf Maulana',
        hoursAgo: 19,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Intan Permata',
        hoursAgo: 18,
      },
    ],
  },
  {
    guest_name: 'Lina Marlina',
    room_number: '433',
    channel: 'email',
    raw_text:
      'WiFi di kamar 433 sangat lambat dan sering terputus. Saya harus presentasi online jam 10.',
    ai_category: 'teknisi',
    ai_confidence: 0.4,
    ai_reason: 'Keluhan menyebut WiFi lambat dan sering terputus saat akan presentasi online.',
    category: 'teknisi',
    department: 'engineering',
    status: 'diproses',
    created_by: 'user-manager',
    hoursAgo: 0.5,
    verifiedHoursAgo: 0.3,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Email.',
        actor: 'Yusuf Maulana',
        hoursAgo: 0.5,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Teknisi & Fasilitas → Engineering.',
        actor: 'Yusuf Maulana',
        hoursAgo: 0.3,
      },
    ],
  },
  {
    guest_name: 'Ahmad Fauzi',
    room_number: '1102',
    channel: 'other',
    raw_text: 'Pintu balkon kamar tidak bisa dikunci dan gagang pintunya longgar.',
    ai_category: 'teknisi',
    ai_confidence: 0.4,
    ai_reason: 'Keluhan menyebut pintu balkon tidak bisa dikunci dan gagang pintunya longgar.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 10,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Lainnya.',
        actor: 'Intan Permata',
        hoursAgo: 10,
      },
    ],
  },
  {
    guest_name: 'Sri Wahyuni',
    room_number: '305',
    channel: 'front_desk',
    raw_text:
      'Resepsionis tidak ramah saat saya menanyakan tagihan, jawabannya singkat dan terkesan mengabaikan saya.',
    ai_category: 'resepsionis',
    ai_confidence: 0.6,
    ai_reason: 'Keluhan menyebut resepsionis tidak ramah saat ditanya soal tagihan.',
    category: 'resepsionis',
    department: 'front_office',
    status: 'selesai',
    created_by: 'user-staff',
    hoursAgo: 26,
    verifiedHoursAgo: 25,
    resolvedHoursAgo: 24,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Intan Permata',
        hoursAgo: 26,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Resepsionis → Front Office.',
        actor: 'Yusuf Maulana',
        hoursAgo: 25,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Yusuf Maulana',
        hoursAgo: 24,
      },
    ],
  },
  {
    guest_name: 'Bayu Saputra',
    room_number: '808',
    channel: 'phone',
    raw_text:
      'Nasi goreng pesanan anak saya masih mentah dan rasanya hambar. Tolong diganti dengan yang matang.',
    ai_category: 'fnb',
    ai_confidence: 1,
    ai_reason: 'Keluhan menyebut nasi goreng pesanan anak masih mentah dan rasanya hambar.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 4,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Intan Permata',
        hoursAgo: 4,
      },
    ],
  },
];
