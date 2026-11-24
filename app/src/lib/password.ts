// Password hashing helpers backed by node:crypto scrypt (no native builds).
//
// Stored format: scrypt$N$r$p$saltHex$hashHex

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const DEFAULT_N = 16384; // scrypt cost (2^14)
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MAXMEM = 64 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_BYTES, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
    maxmem: MAXMEM,
  });
  return [
    'scrypt',
    String(DEFAULT_N),
    String(DEFAULT_R),
    String(DEFAULT_P),
    salt.toString('hex'),
    hash.toString('hex'),
  ].join('$');
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    const actual = scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAXMEM,
    });
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
