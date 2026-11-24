// Local authentication (fully offline, no JWT).
//
// Users live in the local `users` table, passwords are scrypt hashes and
// sessions are opaque random tokens stored in the `sessions` table. The browser
// only ever sees an httpOnly cookie containing that token.

import {
  createSession,
  deleteSession,
  findUserByEmail,
  getSessionUser,
  type Profile,
} from './db';
import { verifyPassword } from './password';

export const SESSION_COOKIE = 'smartguest_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionData {
  user: Profile;
}

export interface LoginResult {
  success: boolean;
  session?: SessionData;
  token?: string;
  expiresAt?: string;
  error?: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function loginStaff(email: string, password: string): Promise<LoginResult> {
  const record = findUserByEmail(normalizeEmail(email));

  if (!record) {
    return {
      success: false,
      error: 'Email atau kata sandi salah. Gunakan akun demo (mis. staff@smartguest.local / password).',
    };
  }

  if (!verifyPassword(password, record.password_hash)) {
    return {
      success: false,
      error: 'Email atau kata sandi salah. Gunakan akun demo (mis. staff@smartguest.local / password).',
    };
  }

  const { token, expires_at } = createSession(record.id, SESSION_TTL_MS);
  const user: Profile = {
    id: record.id,
    email: record.email,
    full_name: record.full_name,
    updated_at: record.updated_at,
  };

  return {
    success: true,
    token,
    expiresAt: expires_at,
    session: { user },
  };
}

export async function logoutStaff(token?: string | null): Promise<void> {
  if (token) deleteSession(token);
}

/** Resolves the session cookie token into a user/profile, or null. */
export function getSessionUserFromToken(token?: string | null): Profile | null {
  if (!token) return null;
  try {
    return getSessionUser(token);
  } catch (err) {
    console.error('Session lookup failed:', err);
    return null;
  }
}

/** Reads the session cookie from a Request without importing next/headers. */
export function readSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        // Cookie rusak / encoding tidak valid: anggap tidak ada sesi.
        return null;
      }
    }
  }
  return null;
}

/** Route helper: returns the authenticated profile or null (caller sends 401). */
export function requireUser(request: Request): Profile | null {
  return getSessionUserFromToken(readSessionToken(request));
}
