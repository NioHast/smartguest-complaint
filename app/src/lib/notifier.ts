// Notifikasi Telegram opsional untuk petugas internal.
//
// Modul ini sengaja tidak pernah melempar exception: pemanggil tidak boleh
// gagal hanya karena notifikasi eksternal bermasalah. Tanpa
// TELEGRAM_BOT_TOKEN, notifikasi dilewati dan hanya dicatat di log.

import type { DepartmentCode } from './types';

export type NotificationResult = {
  sent: boolean;
  skipped?: string;
  error?: string;
};

export interface NotifyDepartmentInput {
  department: DepartmentCode;
  complaintId: string;
  roomNumber?: string | null;
  categoryLabel: string;
  rawText: string;
}

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 2000;
const MAX_TEXT_LENGTH = 300;
const MAX_ERROR_LENGTH = 200;

/** Nama variabel environment untuk chat_id sebuah departemen. */
function chatEnvKey(department: DepartmentCode): string {
  return `TELEGRAM_CHAT_${department.toUpperCase()}`;
}

/** Nama variabel environment untuk message_thread_id (opsional). */
function threadEnvKey(department: DepartmentCode): string {
  return `TELEGRAM_THREAD_${department.toUpperCase()}`;
}

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

/** Buang token dari teks apa pun sebelum dicetak ke log. */
function redact(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join('[REDACTED]');
}

function summarize(text: string, token: string): string {
  const clean = redact(text, token).replace(/\s+/g, ' ').trim();
  if (!clean) return 'unknown-error';
  return clean.length > MAX_ERROR_LENGTH ? `${clean.slice(0, MAX_ERROR_LENGTH)}…` : clean;
}

/** Potongan teks keluhan: rapikan spasi dan batasi panjangnya. */
function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.slice(0, MAX_TEXT_LENGTH);
}

/** Susun isi pesan Telegram (tanpa markdown). */
export function formatNotificationMessage(input: NotifyDepartmentInput): string {
  const room = input.roomNumber?.trim() || '-';
  return [
    `Keluhan baru — ${input.categoryLabel}`,
    `Kamar: ${room}`,
    excerpt(input.rawText),
    '',
    `ID: ${input.complaintId.slice(0, 8)}`,
  ].join('\n');
}

/**
 * Kirim notifikasi keluhan baru ke departemen terkait.
 *
 * Kegagalan apa pun (konfigurasi, jaringan, respons Telegram) dikembalikan
 * sebagai `NotificationResult`, bukan exception.
 */
export async function notifyDepartment(input: NotifyDepartmentInput): Promise<NotificationResult> {
  const token = readEnv('TELEGRAM_BOT_TOKEN');
  if (!token) {
    console.info('[notifikasi] Telegram belum dikonfigurasi; dilewati.');
    return { sent: false, skipped: 'not-configured' };
  }

  const chatId = readEnv(chatEnvKey(input.department));
  if (!chatId) {
    console.info(
      `[notifikasi] chat_id untuk departemen ${input.department} belum diisi; dilewati.`
    );
    return { sent: false, skipped: 'no-chat-id' };
  }

  const threadId = readEnv(threadEnvKey(input.department));
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: formatNotificationMessage(input),
    disable_web_page_preview: true,
  };
  if (threadId) payload.message_thread_id = threadId;

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    let description = '';
    try {
      const data = (await response.json()) as { ok?: boolean; description?: string };
      if (data?.ok === false) description = data.description ?? '';
    } catch {
      // Respons bukan JSON: cukup pakai status HTTP di bawah.
    }

    if (!response.ok || description) {
      const error = summarize(description || `HTTP ${response.status}`, token);
      console.error(`[notifikasi] Telegram menolak pesan ke ${input.department}: ${error}`);
      return { sent: false, error };
    }

    return { sent: true };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const error = summarize(raw, token);
    console.error(`[notifikasi] Gagal mengirim ke ${input.department}: ${error}`);
    return { sent: false, error };
  }
}
