// Aturan alur kerja tunggal untuk server dan UI.
//
// Modul ini sengaja tidak punya dependensi runtime agar aman diimpor oleh
// komponen klien, route API, maupun tes Node (`node --test`).

import type { CategoryCode, ComplaintStatus, DepartmentCode } from './types';

/**
 * Transisi status yang diizinkan. `baru` tidak boleh langsung ke `selesai`:
 * keluhan wajib melewati status `diproses` (verifikasi) lebih dulu.
 */
export const ALLOWED_TRANSITIONS: Record<ComplaintStatus, readonly ComplaintStatus[]> = {
  baru: ['diproses'],
  diproses: ['selesai'],
  selesai: [],
};

/** True hanya bila perpindahan status `from` -> `to` diizinkan. */
export function canTransition(from: ComplaintStatus, to: ComplaintStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Pemetaan tetap kategori keluhan -> departemen penanggung jawab. */
export const CATEGORY_TO_DEPARTMENT: Record<CategoryCode, DepartmentCode> = {
  kebersihan: 'housekeeping',
  teknisi: 'engineering',
  fnb: 'fnb',
  resepsionis: 'front_office',
  perlu_ditinjau: 'duty_manager',
};
