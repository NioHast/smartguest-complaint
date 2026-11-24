-- Skema database lokal SmartGuest (SQLite)
-- Dijalankan otomatis saat startup oleh src/lib/db.ts (CREATE TABLE IF NOT EXISTS ...).
-- Berkas database: data/smartguest.db (tidak masuk git).

PRAGMA foreign_keys = ON;

-- Akun petugas (lokal, tanpa penyedia auth eksternal)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'manager', 'staff')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sesi server-side (cookie hanya berisi token acak)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Keluhan tamu + hasil klasifikasi + hasil verifikasi petugas
CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY,
  guest_name TEXT,
  room_number TEXT,
  channel TEXT NOT NULL DEFAULT 'front_desk'
    CHECK (channel IN ('front_desk', 'phone', 'whatsapp', 'email', 'other')),
  raw_text TEXT NOT NULL,
  ai_category TEXT
    CHECK (ai_category IN ('kebersihan', 'teknisi', 'fnb', 'resepsionis', 'perlu_ditinjau')),
  ai_confidence REAL,
  ai_reason TEXT,
  category TEXT
    CHECK (category IN ('kebersihan', 'teknisi', 'fnb', 'resepsionis', 'perlu_ditinjau')),
  department TEXT
    CHECK (department IN ('housekeeping', 'engineering', 'fnb', 'front_office', 'duty_manager')),
  status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'diproses', 'selesai')),
  verified_by TEXT,
  verified_at TEXT,
  change_reason TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);

-- Ringkasan analisis (dipertahankan minimal untuk jejak klasifikasi)
CREATE TABLE IF NOT EXISTS complaint_analysis (
  id TEXT PRIMARY KEY,
  complaint_id TEXT NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  ai_response_raw TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Jejak aktivitas petugas
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  complaint_id TEXT REFERENCES complaints(id) ON DELETE CASCADE,
  actor TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_complaint_id ON activity_logs(complaint_id);
