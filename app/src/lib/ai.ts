// Mesin klasifikasi keluhan SmartGuest.
//
// Dua jalur:
// 1. LLM (OpenAI SDK, mendukung OPENAI_BASE_URL untuk provider kompatibel).
// 2. Fallback aturan kata kunci Bahasa Indonesia yang selalu berjalan tanpa
//    API key dan selalu menghasilkan salah satu dari 5 kategori tetap.

import OpenAI from 'openai';
import type { CategoryCode } from './types';

export type ClassificationSource = 'llm' | 'rules';

export interface ClassificationResult {
  category: CategoryCode;
  confidence: number;
  source: ClassificationSource;
  reason: string;
  raw?: unknown;
}

// Runtime list sengaja didefinisikan lokal agar modul ini tetap bisa dijalankan
// langsung oleh Node (scripts/test-ai-heuristics.js) tanpa resolver Next.js.
const CATEGORY_CODES: CategoryCode[] = [
  'kebersihan',
  'teknisi',
  'fnb',
  'resepsionis',
  'perlu_ditinjau',
];

type RuleCategory = Exclude<CategoryCode, 'perlu_ditinjau'>;

// Minimal 12 kata kunci per kategori (termasuk sinonim dan typo umum).
const KEYWORDS: Record<RuleCategory, string[]> = {
  kebersihan: [
    'kotor',
    'kotoran',
    'berdebu',
    'debu',
    'noda',
    'bernoda',
    'handuk',
    'sprei',
    'selimut',
    'bantal',
    'kasur',
    'tempat tidur',
    'kamar mandi',
    'toilet',
    'wc',
    'kloset',
    'tisu',
    'sampah',
    'bau',
    'apek',
    'berlumut',
    'diganti',
    'belum dibersihkan',
    'tidak dibersihkan',
    'disapu',
    'dipel',
    'cermin',
    'karpet',
    'shampoo',
    'sabun',
    'sikat gigi',
    'amenities',
  ],
  teknisi: [
    'ac',
    'pendingin',
    'tidak dingin',
    'air panas',
    'bocor',
    'kebocoran',
    'lampu',
    'mati',
    'rusak',
    'error',
    'tidak berfungsi',
    'tidak nyala',
    'wifi',
    'internet',
    'jaringan',
    'terputus',
    'lemot',
    'tv',
    'televisi',
    'remote',
    'listrik',
    'stop kontak',
    'colokan',
    'shower',
    'keran',
    'pintu',
    'kunci',
    'keycard',
    'kartu kamar',
    'lift',
    'elevator',
    'water heater',
    'mampet',
    'tersumbat',
    'tewas',
    'konslet',
  ],
  fnb: [
    'makanan',
    'makan',
    'sarapan',
    'breakfast',
    'minuman',
    'kopi',
    'teh',
    'jus',
    'restoran',
    'restaurant',
    'room service',
    'menu',
    'pesanan',
    'rasa',
    'hambar',
    'asin',
    'tawar',
    'basi',
    'mentah',
    'mateng',
    'matang',
    'dingin',
    'porsi',
    'kualitas makanan',
    'pelayan restoran',
    'waitress',
    'koki',
    'dapur',
    'buffet',
    'prasmanan',
    'roti',
    'nasi',
    'telur',
    'ayam',
    'susu',
  ],
  resepsionis: [
    'resepsionis',
    'receptionist',
    'front desk',
    'check-in',
    'check in',
    'checkin',
    'check-out',
    'antre',
    'antrean',
    'meja depan',
    'meja resepsionis',
    'lobi',
    'lobby',
    'lama sekali',
    'menunggu lama',
    'booking',
    'reservasi',
    'pemesanan kamar',
    'tamu menunggu',
    'tidak ada staf',
    'pelayanan lambat',
    'proses lama',
    'tidak ramah',
    'kasar',
    'acuh',
    'diabaikan',
    'tidak ditanggapi',
    'salah kamar',
    'tagihan',
  ],
};

const MIN_KEYWORD_SCORE = 2;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countKeywordHits(text: string, keywords: string[]): string[] {
  const normalized = text.toLowerCase();
  const hits: string[] = [];

  for (const keyword of keywords) {
    const needle = keyword.toLowerCase();
    let matched = false;

    if (needle.length <= 3) {
      // Kata pendek seperti "ac", "tv", "wc" harus cocok sebagai kata utuh.
      matched = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(normalized);
    } else {
      matched = normalized.includes(needle);
    }

    if (matched) hits.push(keyword);
  }

  return hits;
}

function confidenceFor(score: number): number {
  return Number(Math.min(1, score / 5).toFixed(2));
}

/**
 * Klasifikasi deterministik berbasis kata kunci. Tidak membutuhkan jaringan
 * atau API key, sehingga tetap jujur saat demo offline.
 */
export function classifyByRules(text: string): ClassificationResult {
  const scored = (Object.keys(KEYWORDS) as RuleCategory[]).map((category) => ({
    category,
    hits: countKeywordHits(text, KEYWORDS[category]),
  }));

  const highestScore = Math.max(...scored.map((entry) => entry.hits.length));
  const winners = scored.filter((entry) => entry.hits.length === highestScore);

  if (highestScore < MIN_KEYWORD_SCORE || winners.length !== 1) {
    let reason: string;
    if (highestScore === 0) {
      reason = 'Tidak ada kata kunci yang cukup kuat; keluhan perlu ditinjau petugas.';
    } else if (winners.length > 1) {
      reason = `Kata kunci saling bersaing (${winners
        .map((entry) => entry.category)
        .join(', ')}); keluhan perlu ditinjau petugas.`;
    } else {
      reason = `Hanya ${highestScore} kata kunci yang cocok; keluhan perlu ditinjau petugas.`;
    }

    return {
      category: 'perlu_ditinjau',
      confidence: confidenceFor(highestScore),
      source: 'rules',
      reason,
    };
  }

  const winner = winners[0];
  const sampleHits = winner.hits.slice(0, 4).join(', ');

  return {
    category: winner.category,
    confidence: confidenceFor(winner.hits.length),
    source: 'rules',
    reason: `Cocok dengan kata kunci: ${sampleHits}.`,
  };
}

// ---------------------------------------------------------------------------
// Jalur LLM
// ---------------------------------------------------------------------------

const DEFAULT_AI_MODEL = 'deepseek-chat';
const DEFAULT_AI_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
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

export type AiProvider = 'deepseek' | 'openai' | 'none';

export interface AiConfig {
  provider: AiProvider;
  model: string;
  baseURL?: string;
  apiKey?: string;
}

export interface AiStatus {
  configured: boolean;
  provider: AiProvider;
  model: string;
}

/**
 * Konfigurasi server-side. Prioritas:
 * 1. AI_API_KEY + AI_BASE_URL + AI_MODEL (default DeepSeek).
 * 2. OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL (kompatibilitas lama).
 * 3. Tanpa key -> mode aturan kata kunci.
 *
 * Tidak pernah memakai NEXT_PUBLIC_* agar key tidak bocor ke browser.
 */
export function getAiConfig(): AiConfig {
  const deepseekKey = process.env.AI_API_KEY?.trim();
  if (deepseekKey) {
    return {
      provider: 'deepseek',
      apiKey: deepseekKey,
      baseURL: process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL,
      model: process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL,
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
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
    provider: config.provider,
    model: config.model,
  };
}

/** Membersihkan pembungkus ```json ... ``` yang kadang ditambahkan model. */
export function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function createClient(config: AiConfig): OpenAI | null {
  if (!config.apiKey) return null;

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
}

function isValidCategory(value: unknown): value is CategoryCode {
  return typeof value === 'string' && CATEGORY_CODES.includes(value as CategoryCode);
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

async function classifyWithLlm(text: string, config: AiConfig): Promise<ClassificationResult | null> {
  const client = createClient(config);
  if (!client) return null;

  const startedAt = Date.now();

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Keluhan tamu: "${text}"` },
      ],
    });

    const latencyMs = Date.now() - startedAt;
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      console.warn(`[klasifikasi] LLM mengembalikan konten kosong setelah ${latencyMs}ms; fallback aturan kata kunci.`);
      return null;
    }

    const parsed = JSON.parse(stripCodeFence(content)) as {
      kategori?: unknown;
      confidence?: unknown;
      alasan?: unknown;
    };

    // Kategori di luar enum dianggap tidak valid -> fallback aturan kata kunci.
    if (!isValidCategory(parsed.kategori)) {
      console.warn(
        `[klasifikasi] LLM (${config.provider}/${config.model}) memberi kategori di luar enum setelah ${latencyMs}ms; fallback aturan kata kunci.`
      );
      return null;
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
      source: 'llm',
      reason,
      raw: parsed,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const detail = describeError(err);
    const statusLabel = detail.status ? `HTTP ${detail.status}` : 'tanpa status HTTP';
    // Jangan pernah mencetak API key ke log.
    console.error(
      `[klasifikasi] LLM ${config.provider}/${config.model} gagal setelah ${latencyMs}ms (${statusLabel}): ${detail.message}. Fallback aturan kata kunci.`
    );
    return null;
  }
}

/**
 * Klasifikasi utama: coba LLM bila key tersedia, lalu fallback deterministik
 * ke aturan kata kunci. Alasan fallback selalu menyebutkan bahwa AI gagal.
 */
export async function classifyComplaint(text: string): Promise<ClassificationResult> {
  const config = getAiConfig();
  if (config.provider === 'none') {
    return classifyByRules(text);
  }

  const llmResult = await classifyWithLlm(text, config);
  if (llmResult) return llmResult;

  const fallback = classifyByRules(text);
  return {
    ...fallback,
    reason: `Fallback aturan kata kunci karena AI tidak tersedia. ${fallback.reason}`,
  };
}
