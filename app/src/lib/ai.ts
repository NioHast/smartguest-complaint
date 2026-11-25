// Mesin klasifikasi keluhan SmartGuest.
//
// Satu jalur: LLM (SDK OpenAI; endpoint diatur lewat AI_BASE_URL untuk
// provider kompatibel). Tanpa AI_API_KEY tidak ada jalur alternatif: pemanggil
// menerima ClassifierError lalu menyimpan keluhan sebagai Perlu Ditinjau.

import OpenAI from 'openai';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import { CATEGORIES, type CategoryCode } from './types';

export interface ClassificationResult {
  category: CategoryCode;
  confidence: number;
  reason: string;
}

export type ClassifierErrorCode = 'NOT_CONFIGURED' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT';

/**
 * Kegagalan klasifikasi yang bisa dipetakan route API ke status HTTP.
 * `status` dan `latencyMs` hanya terisi untuk kegagalan penyedia LLM.
 */
export class ClassifierError extends Error {
  code: ClassifierErrorCode;
  status?: number;
  latencyMs?: number;

  constructor(
    code: ClassifierErrorCode,
    message: string,
    options?: { status?: number; latencyMs?: number }
  ) {
    super(message);
    this.name = 'ClassifierError';
    this.code = code;
    this.status = options?.status;
    this.latencyMs = options?.latencyMs;
  }
}

// ---------------------------------------------------------------------------
// Jalur LLM
// ---------------------------------------------------------------------------

const DEFAULT_AI_MODEL = 'deepseek-chat';
const DEFAULT_AI_BASE_URL = 'https://api.deepseek.com';
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_OUTPUT_TOKENS = 200;

const SYSTEM_PROMPT = `Anda adalah asisten operasional hotel yang mengklasifikasikan keluhan tamu ke dalam 5 kategori tetap:
- kebersihan: kebersihan kamar, kamar mandi, handuk/sprei, sampah, bau.
- teknisi: AC, air panas, listrik, lampu, WiFi, TV, lift, kunci, kerusakan fasilitas.
- fnb: makanan, minuman, sarapan, restoran, room service, rasa dan kualitas sajian.
- resepsionis: check-in/check-out, antrean, reservasi, pelayanan front desk, tagihan.
- perlu_ditinjau: keluhan yang tidak jelas, ambigu, pujian, atau tidak masuk kategori lain.

Balas HANYA dengan JSON valid tanpa markdown:
{"kategori":"<kebersihan|teknisi|fnb|resepsionis|perlu_ditinjau>","confidence":<angka 0 sampai 1>,"alasan":"<alasan singkat Bahasa Indonesia>"}
Jika ragu, gunakan perlu_ditinjau. Jangan menambahkan kunci lain.`;

/** 'llm' = konfigurasi AI tersedia; 'none' = AI belum dikonfigurasi. */
export type AiProvider = 'llm' | 'none';

export interface AiConfig {
  provider: AiProvider;
  model: string;
  baseURL?: string;
  apiKey?: string;
}

export interface AiStatus {
  configured: boolean;
  model: string;
}

/**
 * Konfigurasi server-side. Dua tingkat:
 * 1. AI_API_KEY + AI_BASE_URL + AI_MODEL (default DeepSeek) -> LLM.
 * 2. Tanpa AI_API_KEY -> 'none' (klasifikasi wajib gagal, tanpa jalur alternatif).
 *
 * Provider OpenAI-compatible lain cukup lewat AI_BASE_URL + AI_MODEL.
 * Tidak pernah memakai NEXT_PUBLIC_* agar key tidak bocor ke browser.
 */
export function getAiConfig(): AiConfig {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (apiKey) {
    return {
      provider: 'llm',
      apiKey,
      baseURL: process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL,
      model: process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL,
    };
  }

  return {
    provider: 'none',
    model: process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL,
  };
}

/** Status aman untuk UI/endpoint: tanpa API key. */
export function getAiStatus(): AiStatus {
  const config = getAiConfig();
  return {
    configured: config.provider !== 'none',
    model: config.model,
  };
}

/** Membersihkan pembungkus ```json ... ``` yang kadang ditambahkan model. */
function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function createClient(config: AiConfig): OpenAI {
  if (!config.apiKey) {
    throw new ClassifierError(
      'NOT_CONFIGURED',
      'Klasifikasi AI belum dikonfigurasi. Isi AI_API_KEY di app/.env lalu restart server.'
    );
  }

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
}

function isValidCategory(value: unknown): value is CategoryCode {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(Math.min(1, Math.max(0, value)).toFixed(2));
}

function describeError(err: unknown): { status?: number; message: string } {
  if (err && typeof err === 'object') {
    const candidate = err as { status?: unknown; message?: unknown; name?: unknown };
    return {
      status: typeof candidate.status === 'number' ? candidate.status : undefined,
      message: typeof candidate.message === 'string' ? candidate.message : String(candidate.name || 'error'),
    };
  }
  return { message: String(err) };
}

function providerErrorMessage(status: number | undefined, latencyMs: number): string {
  const detail = status ? `HTTP ${status}` : `timeout setelah ${latencyMs} ms`;
  return `Layanan AI gagal (${detail}). Coba lagi.`;
}

async function classifyWithLlm(text: string, config: AiConfig): Promise<ClassificationResult> {
  const client = createClient(config);
  const startedAt = Date.now();

  let completion: ChatCompletion;
  try {
    completion = await client.chat.completions.create({
      model: config.model,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Keluhan tamu: "${text}"` },
      ],
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const detail = describeError(err);
    const statusLabel = detail.status ? `HTTP ${detail.status}` : 'tanpa status HTTP';
    // Jangan pernah mencetak API key ke log.
    console.error(
      `[klasifikasi] LLM ${config.provider}/${config.model} gagal setelah ${latencyMs}ms (${statusLabel}): ${detail.message}`
    );
    throw new ClassifierError('PROVIDER_ERROR', providerErrorMessage(detail.status, latencyMs), {
      status: detail.status,
      latencyMs,
    });
  }

  const latencyMs = Date.now() - startedAt;
  const content = completion.choices[0]?.message?.content;

  if (!content || content.trim().length === 0) {
    console.warn(`[klasifikasi] LLM mengembalikan konten kosong setelah ${latencyMs}ms.`);
    throw new ClassifierError(
      'INVALID_OUTPUT',
      'Layanan AI mengembalikan hasil yang tidak valid. Coba lagi.',
      { latencyMs }
    );
  }

  let parsed: { kategori?: unknown; confidence?: unknown; alasan?: unknown };
  try {
    parsed = JSON.parse(stripCodeFence(content)) as {
      kategori?: unknown;
      confidence?: unknown;
      alasan?: unknown;
    };
  } catch {
    console.warn(`[klasifikasi] Balasan LLM bukan JSON valid setelah ${latencyMs}ms.`);
    throw new ClassifierError(
      'INVALID_OUTPUT',
      'Layanan AI mengembalikan hasil yang tidak valid. Coba lagi.',
      { latencyMs }
    );
  }

  if (!parsed || !isValidCategory(parsed.kategori)) {
    console.warn(`[klasifikasi] LLM memberi kategori di luar enum setelah ${latencyMs}ms.`);
    throw new ClassifierError(
      'INVALID_OUTPUT',
      'Layanan AI mengembalikan hasil yang tidak valid. Coba lagi.',
      { latencyMs }
    );
  }

  const confidence = normalizeConfidence(parsed.confidence) ?? 0.5;
  const reason =
    typeof parsed.alasan === 'string' && parsed.alasan.trim().length > 0
      ? parsed.alasan.trim()
      : 'Diklasifikasikan oleh model AI.';

  console.info(
    `[klasifikasi] LLM ${config.provider}/${config.model} selesai dalam ${latencyMs}ms (kategori: ${parsed.kategori}).`
  );

  return {
    category: parsed.kategori,
    confidence,
    reason,
  };
}

/**
 * Klasifikasi utama. Tidak pernah mengembalikan hasil alternatif: tanpa
 * konfigurasi AI atau saat LLM gagal, ClassifierError dilempar dan pemanggil
 * menyimpan keluhan sebagai Perlu Ditinjau untuk ditangani manual.
 */
export async function classifyComplaint(text: string): Promise<ClassificationResult> {
  const config = getAiConfig();
  if (config.provider === 'none') {
    throw new ClassifierError(
      'NOT_CONFIGURED',
      'Klasifikasi AI belum dikonfigurasi. Isi AI_API_KEY di app/.env lalu restart server.'
    );
  }

  return classifyWithLlm(text, config);
}
