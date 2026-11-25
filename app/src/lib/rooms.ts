// Parsing daftar kamar untuk halaman QR.
//
// Modul ini tidak punya dependensi runtime (aman diimpor klien maupun server)
// dan menjadi satu sumber aturan sanitasi daftar kamar: trim, buang entri
// kosong/tidak valid, dedupe tanpa peka huruf besar/kecil, lalu batasi jumlah.

export const MAX_QR_ROOMS = 60;
export const DEFAULT_QR_ROOMS = ['101', '102', '103'] as const;

const MAX_ROOM_LENGTH = 10;
const ROOM_PATTERN = /^[A-Za-z0-9-]+$/;

export interface ParsedRoomList {
  rooms: string[];
  truncated: boolean;
}

/**
 * Ubah nilai query `kamar` menjadi daftar kamar siap tampil.
 *
 * - setiap entri di-trim, entri kosong/tidak valid dibuang;
 * - duplikat (tanpa peka huruf besar/kecil) dibuang, urutan pertama dipertahankan;
 * - maksimum `MAX_QR_ROOMS` kamar, sisanya dipotong;
 * - daftar kosong (parameter tidak ada atau seluruhnya tidak valid) kembali ke
 *   kamar default supaya halaman QR tidak pernah kosong.
 */
export function parseRoomList(
  value: string | string[] | undefined
): ParsedRoomList {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  const seen = new Set<string>();
  const rooms: string[] = [];

  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (
      !trimmed ||
      trimmed.length > MAX_ROOM_LENGTH ||
      !ROOM_PATTERN.test(trimmed)
    ) {
      continue;
    }
    // Label kamar ditampilkan dalam huruf besar agar `ph1` dan `PH1` konsisten
    // sebagai satu kamar yang sama.
    const entry = trimmed.toUpperCase();
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rooms.push(entry);
  }

  if (rooms.length === 0) {
    return { rooms: [...DEFAULT_QR_ROOMS], truncated: false };
  }

  const truncated = rooms.length > MAX_QR_ROOMS;
  return {
    rooms: truncated ? rooms.slice(0, MAX_QR_ROOMS) : rooms,
    truncated,
  };
}
