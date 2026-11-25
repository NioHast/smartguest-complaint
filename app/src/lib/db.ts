// Lapisan data SQLite lokal untuk SmartGuest.
//
// Memakai modul bawaan `node:sqlite` (DatabaseSync) agar aplikasi berjalan
// sepenuhnya offline di localhost tanpa kredensial dan tanpa build native.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { hashPassword } from './password';
import { hoursAgoIso, SEED_COMPLAINTS, seedComplaintId } from './seed-data';
import { CATEGORY_TO_DEPARTMENT, canTransition } from './workflow';
import {
  CATEGORIES,
  CHANNEL_LABELS,
  STATUS_LABELS,
  categoryLabel,
  type ActivityLog,
  type CategoryCode,
  type Channel,
  type Complaint,
  type ComplaintAnalysis,
  type ComplaintStatus,
  type DepartmentCode,
  type Profile,
} from './types';

export type {
  ActivityLog,
  CategoryCode,
  Channel,
  Complaint,
  ComplaintAnalysis,
  ComplaintStatus,
  DepartmentCode,
  Profile,
} from './types';

/**
 * Dilempar saat perubahan data melanggar aturan alur kerja. Route API
 * menerjemahkannya menjadi HTTP 400 (bukan 500).
 */
export class StatusGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatusGuardError';
  }
}

// ---------------------------------------------------------------------------
// Koneksi / skema
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = process.env.SMARTGUEST_DB_PATH || path.join(DATA_DIR, 'smartguest.db');
const SCHEMA_FILE = path.join(process.cwd(), 'schema.sql');

interface GlobalWithDb {
  __smartguestDb?: DatabaseSync;
}

const globalForDb = globalThis as unknown as GlobalWithDb;

/**
 * Membuka (dan pada panggilan pertama membuat skema + seed) database SQLite.
 * Aman dipanggil dari route API mana pun; handle di-cache per proses.
 */
export function getDb(): DatabaseSync {
  if (globalForDb.__smartguestDb) return globalForDb.__smartguestDb;

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  applySchema(db);
  seedDatabase(db);

  globalForDb.__smartguestDb = db;
  return db;
}

function applySchema(db: DatabaseSync) {
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  db.exec(schema);
}

export function healthCheck(): { ok: boolean; version: string; db: string; complaints: number } {
  try {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) AS count FROM complaints').get() as { count: number } | undefined;
    return {
      ok: true,
      version: String(process.env.npm_package_version || '0.1.0'),
      db: 'ok',
      complaints: row?.count ?? 0,
    };
  } catch (err) {
    console.error('Health check SQLite gagal:', err);
    return {
      ok: false,
      version: String(process.env.npm_package_version || '0.1.0'),
      db: 'error',
      complaints: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Pemetaan baris -> objek
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function nullableString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function mapComplaint(row: Row): Complaint {
  return {
    id: String(row.id),
    guest_name: nullableString(row.guest_name),
    room_number: nullableString(row.room_number),
    channel: row.channel as Channel,
    raw_text: String(row.raw_text),
    ai_category: nullableString(row.ai_category) as CategoryCode | undefined,
    ai_confidence: row.ai_confidence === null || row.ai_confidence === undefined ? undefined : Number(row.ai_confidence),
    ai_reason: nullableString(row.ai_reason),
    category: nullableString(row.category) as CategoryCode | undefined,
    department: nullableString(row.department) as DepartmentCode | undefined,
    status: row.status as ComplaintStatus,
    verified_by: nullableString(row.verified_by),
    verified_at: nullableString(row.verified_at),
    change_reason: nullableString(row.change_reason),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    resolved_at: nullableString(row.resolved_at),
  };
}

function mapAnalysis(row: Row): ComplaintAnalysis {
  let raw: unknown = undefined;
  if (typeof row.ai_response_raw === 'string' && row.ai_response_raw.length > 0) {
    try {
      raw = JSON.parse(row.ai_response_raw);
    } catch {
      raw = row.ai_response_raw;
    }
  }
  return {
    id: String(row.id),
    complaint_id: String(row.complaint_id),
    ai_response_raw: raw,
    created_at: String(row.created_at),
  };
}

function mapLog(row: Row): ActivityLog {
  return {
    id: String(row.id),
    complaint_id: nullableString(row.complaint_id),
    actor: nullableString(row.actor),
    action: String(row.action),
    detail: nullableString(row.detail),
    created_at: String(row.created_at),
  };
}

function mapProfile(row: Row): Profile {
  return {
    id: String(row.id),
    email: String(row.email),
    full_name: String(row.full_name),
    updated_at: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Pengguna + sesi
// ---------------------------------------------------------------------------

export interface StoredUser extends Profile {
  password_hash: string;
}

export function findUserByEmail(email: string): StoredUser | null {
  const db = getDb();
  const row = db
    .prepare('SELECT id, email, password_hash, full_name, created_at FROM users WHERE email = ?')
    .get(email.trim().toLowerCase()) as Row | undefined;
  if (!row) return null;
  return { ...mapProfile(row), password_hash: String(row.password_hash) };
}

export function createSession(userId: string, ttlMs = 7 * 24 * 60 * 60 * 1000): { token: string; expires_at: string } {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const now = new Date().toISOString();

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    expiresAt,
    now
  );

  return { token, expires_at: expiresAt };
}

export function getSessionUser(token: string): Profile | null {
  const db = getDb();
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.full_name, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now) as Row | undefined;
  return row ? mapProfile(row) : null;
}

export function deleteSession(token: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ---------------------------------------------------------------------------
// Operasi keluhan
// ---------------------------------------------------------------------------

export interface NewComplaintInput {
  guest_name?: string | null;
  room_number?: string | null;
  channel: Channel;
  raw_text: string;
  ai_category: CategoryCode;
  ai_confidence: number;
  ai_reason: string;
  ai_response_raw?: unknown;
  created_by?: string | null;
  actor: string;
}

export interface VerificationUpdate {
  category: CategoryCode;
  department: DepartmentCode;
  actor: string;
  action: 'verifikasi_ubah';
  detail: string;
  change_reason?: string | null;
}

function insertLog(
  db: DatabaseSync,
  complaintId: string,
  actor: string,
  action: string,
  detail: string,
  createdAt: string
): void {
  db.prepare(
    `INSERT INTO activity_logs (id, complaint_id, actor, action, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), complaintId, actor, action, detail, createdAt);
}

export function getComplaints(): Complaint[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM complaints ORDER BY created_at DESC').all() as Row[];
  return rows.map(mapComplaint);
}

export function getComplaint(id: string): Complaint | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as Row | undefined;
  return row ? mapComplaint(row) : null;
}

export function getComplaintDetails(
  id: string
): { complaint: Complaint; analysis?: ComplaintAnalysis; logs: ActivityLog[] } | null {
  const db = getDb();
  const complaintRow = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as Row | undefined;
  if (!complaintRow) return null;

  const analysisRow = db
    .prepare('SELECT * FROM complaint_analysis WHERE complaint_id = ?')
    .get(id) as Row | undefined;
  const logRows = db
    .prepare('SELECT * FROM activity_logs WHERE complaint_id = ? ORDER BY created_at ASC')
    .all(id) as Row[];

  return {
    complaint: mapComplaint(complaintRow),
    analysis: analysisRow ? mapAnalysis(analysisRow) : undefined,
    logs: logRows.map(mapLog),
  };
}

/**
 * Menurunkan departemen penanggung jawab dari kategori. Satu sumber aturan
 * tetap `CATEGORY_TO_DEPARTMENT` di `workflow.ts`; helper ini hanya
 * mempersempit tipe agar pemanggil tidak perlu mengulang pemetaan.
 */
export function departmentForCategory(category: CategoryCode): DepartmentCode {
  return CATEGORY_TO_DEPARTMENT[category];
}

export function createComplaint(input: NewComplaintInput): Complaint {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  // Semua jalur create mengisi kategori dan departemen otomatis dari hasil
  // klasifikasi AI. Tidak ada lagi baris dengan kategori NULL; petugas hanya
  // mengoreksi bila hasil AI tidak tepat.
  const category = input.ai_category;
  const department = departmentForCategory(input.ai_category);

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO complaints
         (id, guest_name, room_number, channel, raw_text, ai_category, ai_confidence, ai_reason,
          category, department, status, verified_by, verified_at, change_reason, created_by, created_at, updated_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'baru', NULL, NULL, NULL, ?, ?, ?, NULL)`
    ).run(
      id,
      input.guest_name ?? null,
      input.room_number ?? null,
      input.channel,
      input.raw_text,
      input.ai_category,
      input.ai_confidence,
      input.ai_reason,
      category,
      department,
      input.created_by ?? null,
      now,
      now
    );

    db.prepare(
      `INSERT INTO complaint_analysis (id, complaint_id, ai_response_raw, created_at)
       VALUES (?, ?, ?, ?)`
    ).run(
      randomUUID(),
      id,
      input.ai_response_raw === undefined ? null : JSON.stringify(input.ai_response_raw),
      now
    );

    insertLog(db, id, input.actor, 'keluhan_dicatat', `Keluhan dicatat melalui ${CHANNEL_LABELS[input.channel]}.`, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getComplaint(id) as Complaint;
}

export function updateVerification(id: string, update: VerificationUpdate): Complaint | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as Row | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  const current = mapComplaint(existing);
  const nextStatus: ComplaintStatus = current.status === 'baru' ? 'diproses' : current.status;

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE complaints
         SET category = ?, department = ?, verified_by = ?, verified_at = ?, change_reason = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      update.category,
      update.department,
      update.actor,
      now,
      update.change_reason ?? null,
      nextStatus,
      now,
      id
    );

    insertLog(db, id, update.actor, update.action, update.detail, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getComplaint(id);
}

export function updateStatus(id: string, status: ComplaintStatus, actor: string): Complaint | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as Row | undefined;
  if (!existing) return null;

  const current = mapComplaint(existing);

  // Status hanya boleh bergerak sesuai `ALLOWED_TRANSITIONS`
  // (baru -> diproses -> selesai). Verifikasi bukan lagi syarat, tetapi
  // `baru -> selesai` tetap ditolak karena harus melewati `diproses`.
  if (!canTransition(current.status, status)) {
    throw new StatusGuardError(
      `Transisi status dari ${STATUS_LABELS[current.status]} ke ${STATUS_LABELS[status]} tidak diizinkan.`
    );
  }

  const now = new Date().toISOString();
  const resolvedAt = status === 'selesai' ? now : null;

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE complaints SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?').run(
      status,
      now,
      resolvedAt,
      id
    );

    insertLog(
      db,
      id,
      actor,
      'status_diubah',
      `Status diubah dari ${STATUS_LABELS[current.status]} menjadi ${STATUS_LABELS[status]}.`,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getComplaint(id);
}

// ---------------------------------------------------------------------------
// Seed data (hanya bila database masih kosong)
// ---------------------------------------------------------------------------

const SEED_PASSWORD = 'password';

const SEED_USERS = [
  { id: 'user-admin', email: 'admin@smartguest.local', full_name: 'Ratna Puspita' },
  { id: 'user-manager', email: 'manager@smartguest.local', full_name: 'Yusuf Maulana' },
  { id: 'user-staff', email: 'staff@smartguest.local', full_name: 'Intan Permata' },
];

type SeedMode = 'static' | 'ai';

interface SeedAiItem {
  category: CategoryCode;
  confidence: number;
  reason: string;
}

/** Lokasi hasil klasifikasi AI yang dibekukan; ditulis oleh `scripts/seed-ai.mjs`. */
const AI_SEED_FILE = path.join(DATA_DIR, 'seed-ai.json');
const AI_SEED_HINT = 'Jalankan npm run seed:ai terlebih dahulu.';

/**
 * `SEED_MODE` menentukan sumber nilai `ai_*` saat database kosong:
 * - `static` (default): nilai literal di `seed-data.ts`, tanpa panggilan AI.
 * - `ai`: hasil beku di `data/seed-ai.json` (wajib ada dan lengkap).
 *
 * Nilai lain ditolak agar tidak ada fallback diam-diam ke jalur statis.
 */
function resolveSeedMode(): SeedMode {
  const raw = process.env.SEED_MODE?.trim().toLowerCase();
  if (!raw || raw === 'static') return 'static';
  if (raw === 'ai') return 'ai';
  throw new Error(
    `SEED_MODE="${process.env.SEED_MODE}" tidak dikenal. Gunakan "static" (default) atau "ai".`
  );
}

function isSeedAiItem(value: unknown): value is SeedAiItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.category === 'string' &&
    (CATEGORIES as readonly string[]).includes(item.category) &&
    typeof item.confidence === 'number' &&
    Number.isFinite(item.confidence) &&
    item.confidence >= 0 &&
    item.confidence <= 1 &&
    typeof item.reason === 'string' &&
    item.reason.trim().length > 0
  );
}

/**
 * Membaca dan memvalidasi `data/seed-ai.json`. Sinkron karena dipanggil dari
 * `seedDatabase`, yang sendiri dipanggil dari `getDb()`.
 */
function loadAiSeedItems(): Map<string, SeedAiItem> {
  let raw: string;
  try {
    raw = fs.readFileSync(AI_SEED_FILE, 'utf8');
  } catch {
    throw new Error(`SEED_MODE=ai: data/seed-ai.json tidak ditemukan. ${AI_SEED_HINT}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`SEED_MODE=ai: data/seed-ai.json bukan JSON valid. ${AI_SEED_HINT}`);
  }

  const items = (parsed as { items?: unknown } | null)?.items;
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    throw new Error(`SEED_MODE=ai: data/seed-ai.json tidak memuat objek "items". ${AI_SEED_HINT}`);
  }

  const byId = new Map<string, SeedAiItem>();
  const missing: string[] = [];

  SEED_COMPLAINTS.forEach((_, index) => {
    const id = seedComplaintId(index);
    const item = (items as Record<string, unknown>)[id];
    if (item === undefined) {
      missing.push(id);
      return;
    }
    if (!isSeedAiItem(item)) {
      throw new Error(
        `SEED_MODE=ai: entri "${id}" di data/seed-ai.json tidak valid ` +
          `(butuh category, confidence 0..1, dan reason). ${AI_SEED_HINT}`
      );
    }
    byId.set(id, {
      category: item.category,
      confidence: item.confidence,
      reason: item.reason,
    });
  });

  if (missing.length > 0) {
    throw new Error(
      `SEED_MODE=ai: data/seed-ai.json tidak lengkap untuk ${missing.length} dari ` +
        `${SEED_COMPLAINTS.length} keluhan (${missing.join(', ')}). ${AI_SEED_HINT}`
    );
  }

  return byId;
}

/**
 * Teks log `verifikasi_ubah` dibangun dari nilai yang benar-benar disimpan
 * (`ai_category` dan kategori final), bukan literal seed. Dengan begitu jalur
 * `SEED_MODE=ai` tidak menghasilkan log yang kontradiktif bila kategori AI
 * berbeda dari asumsi data statis.
 */
function verifikasiUbahDetail(aiCategory: CategoryCode, category: CategoryCode | null): string {
  if (category === null || aiCategory === category) {
    return `Meninjau ulang kategori ${categoryLabel(category ?? aiCategory)}; keputusan petugas tetap.`;
  }
  return `Mengubah kategori dari ${categoryLabel(aiCategory)} menjadi ${categoryLabel(category)}.`;
}

function seedDatabase(db: DatabaseSync) {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (Number(userCount.count) === 0) {
    const insertUser = db.prepare(
      'INSERT INTO users (id, email, password_hash, full_name, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    const passwordHash = hashPassword(SEED_PASSWORD);
    for (const user of SEED_USERS) {
      insertUser.run(user.id, user.email, passwordHash, user.full_name, new Date().toISOString());
    }
  }

  const complaintCount = db.prepare('SELECT COUNT(*) AS count FROM complaints').get() as { count: number };
  if (Number(complaintCount.count) > 0) return;

  const seedMode = resolveSeedMode();
  const aiItems = seedMode === 'ai' ? loadAiSeedItems() : null;

  const insertComplaint = db.prepare(
    `INSERT INTO complaints
       (id, guest_name, room_number, channel, raw_text, ai_category, ai_confidence, ai_reason,
        category, department, status, verified_by, verified_at, change_reason, created_by, created_at, updated_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAnalysis = db.prepare(
    `INSERT INTO complaint_analysis (id, complaint_id, ai_response_raw, created_at)
     VALUES (?, ?, ?, ?)`
  );
  const insertLog = db.prepare(
    'INSERT INTO activity_logs (id, complaint_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  db.exec('BEGIN');
  try {
    SEED_COMPLAINTS.forEach((seed, index) => {
      const id = seedComplaintId(index);
      const ai = aiItems?.get(id);

      // Tiga keluhan dengan `change_reason` adalah skenario koreksi petugas:
      // nilai ai_* literal dipertahankan agar rekomendasi AI dijamin berbeda
      // dari kategori final, termasuk saat SEED_MODE=ai. Untuk keluhan lain,
      // hasil beku AI (bila ada) menggantikan nilai statis.
      const useFrozenAi = ai !== undefined && !seed.change_reason;
      const aiCategory = useFrozenAi ? ai.category : seed.ai_category;
      const aiConfidence = useFrozenAi ? ai.confidence : seed.ai_confidence;
      const aiReason = useFrozenAi ? ai.reason : seed.ai_reason;

      // Semua seed sudah punya kategori & departemen otomatis. Hanya baris
      // yang dikoreksi petugas (change_reason) yang mempertahankan kategori
      // final statis; sisanya mengikuti hasil klasifikasi.
      let category = seed.category;
      let department = seed.department;
      if (useFrozenAi) {
        category = aiCategory;
        department = CATEGORY_TO_DEPARTMENT[aiCategory];
      }

      const createdAt = hoursAgoIso(seed.hoursAgo);
      const verifiedAt =
        seed.verifiedHoursAgo !== undefined ? hoursAgoIso(seed.verifiedHoursAgo) : null;
      const resolvedAt = seed.resolvedHoursAgo !== undefined ? hoursAgoIso(seed.resolvedHoursAgo) : null;
      const verifiedBy = verifiedAt ? seed.logs.find((log) => log.action.startsWith('verifikasi_'))?.actor ?? null : null;
      // `updated_at` mengikuti aktivitas terakhir (pembuatan, perubahan status,
      // atau koreksi), bukan sekadar createdAt.
      const updatedAt = hoursAgoIso(
        Math.min(seed.hoursAgo, ...seed.logs.map((log) => log.hoursAgo))
      );

      insertComplaint.run(
        id,
        seed.guest_name,
        seed.room_number,
        seed.channel,
        seed.raw_text,
        aiCategory,
        aiConfidence,
        aiReason,
        category,
        department,
        seed.status,
        verifiedBy,
        verifiedAt,
        seed.change_reason ?? null,
        seed.created_by,
        createdAt,
        updatedAt,
        resolvedAt
      );

      insertAnalysis.run(
        `analysis-seed-${String(index + 1).padStart(2, '0')}`,
        id,
        JSON.stringify({
          kategori: aiCategory,
          confidence: aiConfidence,
          alasan: aiReason,
        }),
        createdAt
      );

      seed.logs.forEach((log, logIndex) => {
        insertLog.run(
          `log-seed-${String(index + 1).padStart(2, '0')}-${logIndex + 1}`,
          id,
          log.actor,
          log.action,
          log.action === 'verifikasi_ubah' ? verifikasiUbahDetail(aiCategory, category) : log.detail,
          hoursAgoIso(log.hoursAgo)
        );
      });
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Service object (kompatibilitas pemanggilan async di route API)
// ---------------------------------------------------------------------------

export const dbService = {
  async getComplaints(): Promise<Complaint[]> {
    return getComplaints();
  },
  async getComplaint(id: string): Promise<Complaint | null> {
    return getComplaint(id);
  },
  async getComplaintDetails(id: string) {
    return getComplaintDetails(id);
  },
  async createComplaint(input: NewComplaintInput): Promise<Complaint> {
    return createComplaint(input);
  },
  async updateVerification(id: string, update: VerificationUpdate): Promise<Complaint | null> {
    return updateVerification(id, update);
  },
  async updateStatus(id: string, status: ComplaintStatus, actor: string): Promise<Complaint | null> {
    return updateStatus(id, status, actor);
  },
};
