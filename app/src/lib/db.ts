// Lapisan data SQLite lokal untuk SmartGuest.
//
// Memakai modul bawaan `node:sqlite` (DatabaseSync) agar aplikasi berjalan
// sepenuhnya offline di localhost tanpa kredensial dan tanpa build native.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { hashPassword } from './password';
import {
  CHANNEL_LABELS,
  STATUS_LABELS,
  type ActivityLog,
  type AiSource,
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
  AiSource,
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

let initialized = false;

export function dbFilePath(): string {
  return DB_FILE;
}

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
  initialized = true;
  return db;
}

function applySchema(db: DatabaseSync) {
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  db.exec(schema);
}

export function isDatabaseInitialized(): boolean {
  return initialized;
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
    ai_source: nullableString(row.ai_source) as AiSource | undefined,
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
    summary: String(row.summary),
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
    role: row.role as Profile['role'],
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
    .prepare('SELECT id, email, password_hash, full_name, role, created_at FROM users WHERE email = ?')
    .get(email.trim().toLowerCase()) as Row | undefined;
  if (!row) return null;
  return { ...mapProfile(row), password_hash: String(row.password_hash) };
}

export function findUserById(id: string): Profile | null {
  const db = getDb();
  const row = db
    .prepare('SELECT id, email, full_name, role, created_at FROM users WHERE id = ?')
    .get(id) as Row | undefined;
  return row ? mapProfile(row) : null;
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
      `SELECT u.id, u.email, u.full_name, u.role, u.created_at
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
  ai_source: AiSource;
  ai_reason: string;
  summary: string;
  ai_response_raw?: unknown;
  created_by?: string | null;
  actor: string;
}

export interface VerificationUpdate {
  category: CategoryCode;
  department: DepartmentCode;
  actor: string;
  action: 'verifikasi_terima' | 'verifikasi_ubah';
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

export function createComplaint(input: NewComplaintInput): Complaint {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const summary =
    input.summary.length > 160 ? `${input.summary.slice(0, 157)}...` : input.summary;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO complaints
         (id, guest_name, room_number, channel, raw_text, ai_category, ai_confidence, ai_source, ai_reason,
          category, department, status, verified_by, verified_at, change_reason, created_by, created_at, updated_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'baru', NULL, NULL, NULL, ?, ?, ?, NULL)`
    ).run(
      id,
      input.guest_name ?? null,
      input.room_number ?? null,
      input.channel,
      input.raw_text,
      input.ai_category,
      input.ai_confidence,
      input.ai_source,
      input.ai_reason,
      input.created_by ?? null,
      now,
      now
    );

    db.prepare(
      `INSERT INTO complaint_analysis (id, complaint_id, summary, ai_response_raw, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      id,
      summary,
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

  // Pengaman di lapisan data: keluhan tanpa kategori belum terverifikasi dan
  // tidak boleh langsung diselesaikan, terlepas dari pemanggilnya.
  if (status === 'selesai' && !current.category) {
    throw new StatusGuardError(
      'Keluhan harus diverifikasi (memiliki kategori) sebelum dapat diselesaikan.'
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
  { id: 'user-admin', email: 'admin@smartguest.local', full_name: 'Audrey Hepburn', role: 'admin' as const },
  { id: 'user-manager', email: 'manager@smartguest.local', full_name: 'Gregory Peck', role: 'manager' as const },
  { id: 'user-staff', email: 'staff@smartguest.local', full_name: 'Humphrey Bogart', role: 'staff' as const },
];

interface SeedLog {
  action: string;
  detail: string;
  actor: string;
  hoursAgo: number;
}

interface SeedComplaint {
  guest_name: string;
  room_number: string;
  channel: Channel;
  raw_text: string;
  ai_category: CategoryCode;
  ai_confidence: number;
  ai_reason: string;
  category?: CategoryCode;
  department?: DepartmentCode;
  change_reason?: string;
  status: ComplaintStatus;
  created_by: string;
  hoursAgo: number;
  verifiedHoursAgo?: number;
  resolvedHoursAgo?: number;
  logs: SeedLog[];
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

const SEED_COMPLAINTS: SeedComplaint[] = [
  {
    guest_name: 'Budi Santoso',
    room_number: '302',
    channel: 'phone',
    raw_text:
      'AC kamar 302 tidak dingin sejak tadi malam. Sudah saya laporkan dua kali ke front desk tetapi belum ada teknisi yang datang.',
    ai_category: 'teknisi',
    ai_confidence: 0.4,
    ai_reason: 'Cocok dengan kata kunci: ac, tidak dingin.',
    category: 'teknisi',
    department: 'engineering',
    status: 'diproses',
    created_by: 'user-staff',
    hoursAgo: 9,
    verifiedHoursAgo: 7,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Humphrey Bogart',
        hoursAgo: 9,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Teknisi & Fasilitas → Engineering.',
        actor: 'Gregory Peck',
        hoursAgo: 7,
      },
    ],
  },
  {
    guest_name: 'Siti Rahmawati',
    room_number: '115',
    channel: 'front_desk',
    raw_text:
      'Handuk di kamar mandi bernoda dan tidak diganti sejak kemarin. Tisu toilet juga habis dan belum diisi ulang.',
    ai_category: 'kebersihan',
    ai_confidence: 1,
    ai_reason: 'Cocok dengan kata kunci: handuk, bernoda, diganti, kamar mandi.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 6,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Humphrey Bogart',
        hoursAgo: 6,
      },
    ],
  },
  {
    guest_name: 'Andi Wijaya',
    room_number: '508',
    channel: 'whatsapp',
    raw_text:
      'Sarapan yang saya pesan ke kamar sudah dingin saat tiba, telur juga tidak matang sesuai permintaan.',
    ai_category: 'fnb',
    ai_confidence: 0.8,
    ai_reason: 'Cocok dengan kata kunci: sarapan, dingin, telur, matang.',
    category: 'fnb',
    department: 'fnb',
    status: 'selesai',
    created_by: 'user-manager',
    hoursAgo: 30,
    verifiedHoursAgo: 28,
    resolvedHoursAgo: 26,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui WhatsApp.',
        actor: 'Gregory Peck',
        hoursAgo: 30,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Makanan & Minuman → F&B.',
        actor: 'Humphrey Bogart',
        hoursAgo: 28,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Gregory Peck',
        hoursAgo: 26,
      },
    ],
  },
  {
    guest_name: 'Dewi Lestari',
    room_number: '701',
    channel: 'front_desk',
    raw_text:
      'Saya menunggu hampir 45 menit sebelum mendapat kunci kamar, tanpa penjelasan dari petugas mana pun.',
    ai_category: 'perlu_ditinjau',
    ai_confidence: 0.2,
    ai_reason: 'Hanya 1 kata kunci yang cocok; keluhan perlu ditinjau petugas.',
    category: 'resepsionis',
    department: 'front_office',
    change_reason:
      'Tamu mengeluh antrean dan pelayanan front desk saat check-in, bukan kasus yang perlu ditinjau duty manager.',
    status: 'diproses',
    created_by: 'user-staff',
    hoursAgo: 3,
    verifiedHoursAgo: 2,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Humphrey Bogart',
        hoursAgo: 3,
      },
      {
        action: 'verifikasi_ubah',
        detail:
          'Mengubah kategori dari Perlu Ditinjau ke Resepsionis (Front Office). Alasan: antrean check-in.',
        actor: 'Gregory Peck',
        hoursAgo: 2,
      },
    ],
  },
  {
    guest_name: 'Rizky Pratama',
    room_number: '412',
    channel: 'phone',
    raw_text:
      'Ada pesta berisik di kamar 414 sejak tengah malam. Kami sudah menelepon front desk tiga kali tetapi tidak ada yang menindak.',
    ai_category: 'perlu_ditinjau',
    ai_confidence: 0.2,
    ai_reason: 'Hanya 1 kata kunci yang cocok; keluhan perlu ditinjau petugas.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 2,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Humphrey Bogart',
        hoursAgo: 2,
      },
    ],
  },
  {
    guest_name: 'Nur Aisyah',
    room_number: '503',
    channel: 'email',
    raw_text:
      'Ada tagihan ganda untuk parkir dan room service di struk akhir saya. Mohon diperiksa sebelum check-out besok pagi.',
    ai_category: 'resepsionis',
    ai_confidence: 0.4,
    ai_reason: 'Cocok dengan kata kunci: tagihan, check-out.',
    category: 'resepsionis',
    department: 'front_office',
    status: 'selesai',
    created_by: 'user-manager',
    hoursAgo: 48,
    verifiedHoursAgo: 46,
    resolvedHoursAgo: 44,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Email.',
        actor: 'Gregory Peck',
        hoursAgo: 48,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Resepsionis → Front Office.',
        actor: 'Gregory Peck',
        hoursAgo: 46,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Audrey Hepburn',
        hoursAgo: 44,
      },
    ],
  },
  {
    guest_name: 'Agus Setiawan',
    room_number: '207',
    channel: 'front_desk',
    raw_text:
      'Air panas di kamar mandi kamar 207 tidak keluar sejak pagi, keran hanya mengeluarkan air dingin.',
    ai_category: 'teknisi',
    ai_confidence: 0.4,
    ai_reason: 'Cocok dengan kata kunci: air panas, keran.',
    category: 'teknisi',
    department: 'engineering',
    status: 'diproses',
    created_by: 'user-staff',
    hoursAgo: 1,
    verifiedHoursAgo: 0.8,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Humphrey Bogart',
        hoursAgo: 1,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Teknisi & Fasilitas → Engineering.',
        actor: 'Humphrey Bogart',
        hoursAgo: 0.8,
      },
    ],
  },
  {
    guest_name: 'Maya Putri',
    room_number: '918',
    channel: 'phone',
    raw_text:
      'Pintu lift sayap timur macet dan saya terjebak di dalamnya sekitar 10 menit. Tombol darurat juga tidak berfungsi.',
    ai_category: 'teknisi',
    ai_confidence: 0.6,
    ai_reason: 'Cocok dengan kata kunci: lift, pintu, tidak berfungsi.',
    category: 'perlu_ditinjau',
    department: 'duty_manager',
    change_reason:
      'Insiden keselamatan pada lift perlu penanganan Duty Manager, bukan sekadar perbaikan teknis.',
    status: 'selesai',
    created_by: 'user-manager',
    hoursAgo: 5,
    verifiedHoursAgo: 4.5,
    resolvedHoursAgo: 4,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Gregory Peck',
        hoursAgo: 5,
      },
      {
        action: 'verifikasi_ubah',
        detail:
          'Mengubah kategori dari Teknisi & Fasilitas ke Perlu Ditinjau (Duty Manager). Alasan: insiden keselamatan lift.',
        actor: 'Audrey Hepburn',
        hoursAgo: 4.5,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Audrey Hepburn',
        hoursAgo: 4,
      },
    ],
  },
  {
    guest_name: 'Hendra Gunawan',
    room_number: '601',
    channel: 'whatsapp',
    raw_text:
      'Kolam renang tertutup tanpa pemberitahuan padahal saya memilih hotel ini karena fasilitasnya. Anak-anak kecewa sekali.',
    ai_category: 'perlu_ditinjau',
    ai_confidence: 0,
    ai_reason: 'Tidak ada kata kunci yang cukup kuat; keluhan perlu ditinjau petugas.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 8,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui WhatsApp.',
        actor: 'Humphrey Bogart',
        hoursAgo: 8,
      },
    ],
  },
  {
    guest_name: 'Rina Kartika',
    room_number: '620',
    channel: 'phone',
    raw_text:
      'Kamar terasa apek dan handuk yang tersedia masih basah. Saya sudah menunggu housekeeping sejak pagi.',
    ai_category: 'kebersihan',
    ai_confidence: 0.4,
    ai_reason: 'Cocok dengan kata kunci: apek, handuk.',
    category: 'kebersihan',
    department: 'housekeeping',
    status: 'diproses',
    created_by: 'user-staff',
    hoursAgo: 12,
    verifiedHoursAgo: 11,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Humphrey Bogart',
        hoursAgo: 12,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Kebersihan Kamar → Housekeeping.',
        actor: 'Gregory Peck',
        hoursAgo: 11,
      },
    ],
  },
  {
    guest_name: 'Fajar Nugroho',
    room_number: '215',
    channel: 'front_desk',
    raw_text:
      'Kopi di area lobi sudah habis sejak jam 7 pagi dan staf baru mengisi ulang setelah saya ingatkan dua kali.',
    ai_category: 'perlu_ditinjau',
    ai_confidence: 0.2,
    ai_reason: 'Kata kunci saling bersaing (fnb, resepsionis); keluhan perlu ditinjau petugas.',
    category: 'fnb',
    department: 'fnb',
    change_reason: 'Keluhan menyangkut stok dan penyajian kopi di lobi, ditangani tim F&B.',
    status: 'selesai',
    created_by: 'user-staff',
    hoursAgo: 20,
    verifiedHoursAgo: 19,
    resolvedHoursAgo: 18,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Humphrey Bogart',
        hoursAgo: 20,
      },
      {
        action: 'verifikasi_ubah',
        detail: 'Mengubah kategori dari Perlu Ditinjau ke Makanan & Minuman (F&B). Alasan: stok kopi lobi.',
        actor: 'Gregory Peck',
        hoursAgo: 19,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Humphrey Bogart',
        hoursAgo: 18,
      },
    ],
  },
  {
    guest_name: 'Lina Marlina',
    room_number: '433',
    channel: 'email',
    raw_text:
      'WiFi di kamar 433 sangat lambat dan sering terputus. Saya harus presentasi online jam 10.',
    ai_category: 'teknisi',
    ai_confidence: 0.4,
    ai_reason: 'Cocok dengan kata kunci: wifi, terputus.',
    category: 'teknisi',
    department: 'engineering',
    status: 'diproses',
    created_by: 'user-manager',
    hoursAgo: 0.5,
    verifiedHoursAgo: 0.3,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Email.',
        actor: 'Gregory Peck',
        hoursAgo: 0.5,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Teknisi & Fasilitas → Engineering.',
        actor: 'Gregory Peck',
        hoursAgo: 0.3,
      },
    ],
  },
  {
    guest_name: 'Ahmad Fauzi',
    room_number: '1102',
    channel: 'other',
    raw_text: 'Pintu balkon kamar tidak bisa dikunci dan gagang pintunya longgar.',
    ai_category: 'teknisi',
    ai_confidence: 0.4,
    ai_reason: 'Cocok dengan kata kunci: pintu, kunci.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 10,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Lainnya.',
        actor: 'Humphrey Bogart',
        hoursAgo: 10,
      },
    ],
  },
  {
    guest_name: 'Sri Wahyuni',
    room_number: '305',
    channel: 'front_desk',
    raw_text:
      'Resepsionis tidak ramah saat saya menanyakan tagihan, jawabannya singkat dan terkesan mengabaikan saya.',
    ai_category: 'resepsionis',
    ai_confidence: 0.6,
    ai_reason: 'Cocok dengan kata kunci: resepsionis, tidak ramah, tagihan.',
    category: 'resepsionis',
    department: 'front_office',
    status: 'selesai',
    created_by: 'user-staff',
    hoursAgo: 26,
    verifiedHoursAgo: 25,
    resolvedHoursAgo: 24,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Front Desk.',
        actor: 'Humphrey Bogart',
        hoursAgo: 26,
      },
      {
        action: 'verifikasi_terima',
        detail: 'Menerima rekomendasi AI: Resepsionis → Front Office.',
        actor: 'Gregory Peck',
        hoursAgo: 25,
      },
      {
        action: 'status_diubah',
        detail: 'Status diubah dari Diproses menjadi Selesai.',
        actor: 'Gregory Peck',
        hoursAgo: 24,
      },
    ],
  },
  {
    guest_name: 'Bayu Saputra',
    room_number: '808',
    channel: 'phone',
    raw_text:
      'Nasi goreng pesanan anak saya masih mentah dan rasanya hambar. Tolong diganti dengan yang matang.',
    ai_category: 'fnb',
    ai_confidence: 1,
    ai_reason: 'Cocok dengan kata kunci: nasi, pesanan, mentah, rasa.',
    status: 'baru',
    created_by: 'user-staff',
    hoursAgo: 4,
    logs: [
      {
        action: 'keluhan_dicatat',
        detail: 'Keluhan dicatat melalui Telepon.',
        actor: 'Humphrey Bogart',
        hoursAgo: 4,
      },
    ],
  },
];

function seedDatabase(db: DatabaseSync) {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (Number(userCount.count) === 0) {
    const insertUser = db.prepare(
      'INSERT INTO users (id, email, password_hash, full_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const passwordHash = hashPassword(SEED_PASSWORD);
    for (const user of SEED_USERS) {
      insertUser.run(user.id, user.email, passwordHash, user.full_name, user.role, new Date().toISOString());
    }
  }

  const complaintCount = db.prepare('SELECT COUNT(*) AS count FROM complaints').get() as { count: number };
  if (Number(complaintCount.count) > 0) return;

  const insertComplaint = db.prepare(
    `INSERT INTO complaints
       (id, guest_name, room_number, channel, raw_text, ai_category, ai_confidence, ai_source, ai_reason,
        category, department, status, verified_by, verified_at, change_reason, created_by, created_at, updated_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAnalysis = db.prepare(
    `INSERT INTO complaint_analysis (id, complaint_id, summary, ai_response_raw, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertLog = db.prepare(
    'INSERT INTO activity_logs (id, complaint_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  db.exec('BEGIN');
  try {
    SEED_COMPLAINTS.forEach((seed, index) => {
      const id = `complaint-seed-${String(index + 1).padStart(2, '0')}`;
      const createdAt = hoursAgoIso(seed.hoursAgo);
      const verifiedAt =
        seed.verifiedHoursAgo !== undefined && seed.category ? hoursAgoIso(seed.verifiedHoursAgo) : null;
      const resolvedAt = seed.resolvedHoursAgo !== undefined ? hoursAgoIso(seed.resolvedHoursAgo) : null;
      const verifiedBy = verifiedAt ? seed.logs.find((log) => log.action.startsWith('verifikasi_'))?.actor ?? null : null;

      insertComplaint.run(
        id,
        seed.guest_name,
        seed.room_number,
        seed.channel,
        seed.raw_text,
        seed.ai_category,
        seed.ai_confidence,
        'rules',
        seed.ai_reason,
        seed.category ?? null,
        seed.department ?? null,
        seed.status,
        verifiedBy,
        verifiedAt,
        seed.change_reason ?? null,
        seed.created_by,
        createdAt,
        resolvedAt ?? verifiedAt ?? createdAt,
        resolvedAt
      );

      insertAnalysis.run(
        `analysis-seed-${String(index + 1).padStart(2, '0')}`,
        id,
        seed.raw_text.length > 160 ? `${seed.raw_text.slice(0, 157)}...` : seed.raw_text,
        JSON.stringify({
          kategori: seed.ai_category,
          confidence: seed.ai_confidence,
          alasan: seed.ai_reason,
          sumber: 'rules',
        }),
        createdAt
      );

      seed.logs.forEach((log, logIndex) => {
        insertLog.run(
          `log-seed-${String(index + 1).padStart(2, '0')}-${logIndex + 1}`,
          id,
          log.actor,
          log.action,
          log.detail,
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
