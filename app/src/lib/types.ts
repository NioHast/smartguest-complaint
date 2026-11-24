// Tipe data bersama untuk aplikasi SmartGuest.
// Modul ini aman diimpor oleh komponen klien karena tidak menyentuh SQLite.

// ---------------------------------------------------------------------------
// Kategori keluhan (5 kategori tetap sesuai rancangan)
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  'kebersihan',
  'teknisi',
  'fnb',
  'resepsionis',
  'perlu_ditinjau',
] as const;

export type CategoryCode = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CategoryCode, string> = {
  kebersihan: 'Kebersihan Kamar',
  teknisi: 'Teknisi & Fasilitas',
  fnb: 'Makanan & Minuman',
  resepsionis: 'Resepsionis',
  perlu_ditinjau: 'Perlu Ditinjau',
};

// ---------------------------------------------------------------------------
// Departemen penanggung jawab
// ---------------------------------------------------------------------------

export const DEPARTMENTS = [
  'housekeeping',
  'engineering',
  'fnb',
  'front_office',
  'duty_manager',
] as const;

export type DepartmentCode = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<DepartmentCode, string> = {
  housekeeping: 'Housekeeping',
  engineering: 'Engineering',
  fnb: 'F&B',
  front_office: 'Front Office',
  duty_manager: 'Duty Manager',
};

// Pemetaan kategori -> departemen tinggal di `src/lib/workflow.ts` supaya
// server dan UI memakai satu sumber aturan yang sama.

// ---------------------------------------------------------------------------
// Kanal masuk keluhan
// ---------------------------------------------------------------------------

export const CHANNELS = ['front_desk', 'phone', 'whatsapp', 'email', 'other'] as const;

export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  front_desk: 'Front Desk',
  phone: 'Telepon',
  whatsapp: 'WhatsApp',
  email: 'Email',
  other: 'Lainnya',
};

// ---------------------------------------------------------------------------
// Status alur kerja
// ---------------------------------------------------------------------------

export const COMPLAINT_STATUSES = ['baru', 'diproses', 'selesai'] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  baru: 'Baru',
  diproses: 'Diproses',
  selesai: 'Selesai',
};

// ---------------------------------------------------------------------------
// Entitas
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'staff';
  updated_at: string;
}

export interface Complaint {
  id: string;
  guest_name?: string;
  room_number?: string;
  channel: Channel;
  raw_text: string;
  ai_category?: CategoryCode;
  ai_confidence?: number;
  ai_reason?: string;
  category?: CategoryCode;
  department?: DepartmentCode;
  status: ComplaintStatus;
  verified_by?: string;
  verified_at?: string;
  change_reason?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

export interface ComplaintAnalysis {
  id: string;
  complaint_id: string;
  summary: string;
  ai_response_raw?: unknown;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  complaint_id?: string;
  actor?: string;
  action: string;
  detail?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Utilitas label
// ---------------------------------------------------------------------------

export function categoryLabel(category?: string | null): string {
  if (!category) return 'Belum diverifikasi';
  return CATEGORY_LABELS[category as CategoryCode] ?? category;
}

export function departmentLabel(department?: string | null): string {
  if (!department) return 'Belum ditentukan';
  return DEPARTMENT_LABELS[department as DepartmentCode] ?? department;
}

export function channelLabel(channel?: string | null): string {
  if (!channel) return '-';
  return CHANNEL_LABELS[channel as Channel] ?? channel;
}

export function statusLabel(status?: string | null): string {
  if (!status) return '-';
  return STATUS_LABELS[status as ComplaintStatus] ?? status;
}
