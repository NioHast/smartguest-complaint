// Validasi input keluhan bersama untuk jalur petugas dan jalur publik.
//
// Modul ini tidak punya dependensi runtime (aman diimpor klien maupun server).
// Satu sumber aturan panjang/pola dipakai route API dan halaman tamu/QR agar
// nilai yang lolos di UI tidak mungkin ditolak server.

export const MAX_RAW_TEXT = 2000;
export const MAX_ROOM_NUMBER = 10;
export const MAX_GUEST_NAME = 80;

/** Nomor kamar hanya boleh berisi huruf, angka, dan tanda hubung. */
export const ROOM_NUMBER_PATTERN = /^[A-Za-z0-9-]+$/;

export interface ComplaintInputValues {
  rawText: string;
  roomNumber: string | null;
  guestName: string | null;
}

export interface ValidateComplaintOptions {
  /**
   * Jalur publik menolak `guest_name` yang ada tetapi bukan string, bukan
   * mengabaikannya diam-diam. Jalur petugas tetap toleran (dianggap kosong).
   */
  rejectNonStringGuestName?: boolean;
}

export type ComplaintValidation =
  | { ok: true; value: ComplaintInputValues }
  | { ok: false; error: string };

/**
 * Validasi dan normalisasi isi permintaan pencatatan keluhan.
 *
 * Aturan:
 * - `raw_text` wajib string, 1–2000 karakter setelah trim;
 * - `room_number` opsional, maksimal 10 karakter, pola `[A-Za-z0-9-]`;
 * - `guest_name` opsional, maksimal 80 karakter.
 */
export function validateComplaintInput(
  body: unknown,
  options: ValidateComplaintOptions = {}
): ComplaintValidation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Format permintaan tidak valid.' };
  }

  const input = body as Record<string, unknown>;

  const rawText = typeof input.raw_text === 'string' ? input.raw_text.trim() : '';
  if (!rawText) {
    return { ok: false, error: 'Teks keluhan wajib diisi.' };
  }
  if (rawText.length > MAX_RAW_TEXT) {
    return { ok: false, error: `Teks keluhan maksimal ${MAX_RAW_TEXT} karakter.` };
  }

  let roomNumber: string | null = null;
  if (input.room_number !== undefined && input.room_number !== null) {
    if (typeof input.room_number !== 'string') {
      return { ok: false, error: 'Nomor kamar tidak valid.' };
    }
    const trimmedRoom = input.room_number.trim();
    if (trimmedRoom) {
      if (trimmedRoom.length > MAX_ROOM_NUMBER) {
        return {
          ok: false,
          error: `Nomor kamar maksimal ${MAX_ROOM_NUMBER} karakter.`,
        };
      }
      if (!ROOM_NUMBER_PATTERN.test(trimmedRoom)) {
        return {
          ok: false,
          error: 'Nomor kamar hanya boleh berisi huruf, angka, dan tanda hubung.',
        };
      }
      roomNumber = trimmedRoom;
    }
  }

  let guestName: string | null = null;
  if (input.guest_name !== undefined && input.guest_name !== null) {
    if (typeof input.guest_name !== 'string') {
      if (options.rejectNonStringGuestName) {
        return { ok: false, error: 'Nama tamu tidak valid.' };
      }
    } else {
      const trimmedName = input.guest_name.trim();
      if (trimmedName) {
        if (trimmedName.length > MAX_GUEST_NAME) {
          return {
            ok: false,
            error: `Nama tamu maksimal ${MAX_GUEST_NAME} karakter.`,
          };
        }
        guestName = trimmedName;
      }
    }
  }

  return { ok: true, value: { rawText, roomNumber, guestName } };
}

/**
 * Normalisasi nomor kamar dari query string. Mengembalikan string kosong bila
 * tidak valid, sehingga UI tidak pernah menampilkan/mengirim kamar yang pasti
 * ditolak server.
 */
export function normalizeRoomNumber(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed.length > MAX_ROOM_NUMBER || !ROOM_NUMBER_PATTERN.test(trimmed)) {
    return '';
  }
  return trimmed;
}
