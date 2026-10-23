import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { seedDemoData } from './seed.js';

export function openDatabase(databasePath = process.env.DATABASE_PATH || './data/callflow-full.db') {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  createSchema(db);
  seedDemoData(db);
  return db;
}

export function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('admin', 'manager', 'agent', 'viewer')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS areas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dining_tables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      area_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
      capacity INTEGER NOT NULL,
      shape TEXT NOT NULL DEFAULT 'square',
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'cleaning', 'disabled')),
      combo_group TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS combo_rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      capacity INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS combo_room_tables (
      combo_id TEXT NOT NULL REFERENCES combo_rooms(id) ON DELETE CASCADE,
      table_id TEXT NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
      PRIMARY KEY (combo_id, table_id)
    );

    CREATE TABLE IF NOT EXISTS time_slots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'new'
        CHECK (tier IN ('new', 'regular', 'vip')),
      preferences TEXT NOT NULL DEFAULT '',
      allergies TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      total_spent REAL NOT NULL DEFAULT 0,
      visit_count INTEGER NOT NULL DEFAULT 0,
      last_contact_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'other',
      note TEXT NOT NULL DEFAULT '',
      receipt_ref TEXT NOT NULL DEFAULT '',
      paid_at TEXT NOT NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      guest_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      table_id TEXT REFERENCES dining_tables(id) ON DELETE SET NULL,
      combo_id TEXT REFERENCES combo_rooms(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'phone'
        CHECK (source IN ('phone', 'walk_in', 'online', 'referral', 'other')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'seated', 'completed', 'no_show', 'cancelled')),
      occasion TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      conflict_override INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      cancelled_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS appointment_status_history (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      from_status TEXT NOT NULL DEFAULT '',
      to_status TEXT NOT NULL,
      changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      contact_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      called_at TEXT NOT NULL,
      answered_at TEXT NOT NULL DEFAULT '',
      ended_at TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
      status TEXT NOT NULL DEFAULT 'ringing'
        CHECK (status IN ('ringing', 'answered', 'completed', 'missed', 'follow_up')),
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      recording_ref TEXT NOT NULL DEFAULT '',
      transcript TEXT NOT NULL DEFAULT '',
      ai_summary TEXT NOT NULL DEFAULT '',
      ai_tags TEXT NOT NULL DEFAULT '[]',
      ai_extracted TEXT NOT NULL DEFAULT '{}',
      keywords TEXT NOT NULL DEFAULT '[]',
      sentiment TEXT NOT NULL DEFAULT '',
      scenario TEXT NOT NULL DEFAULT 'reservation',
      follow_up INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS call_segments (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      speaker TEXT NOT NULL CHECK (speaker IN ('customer', 'agent', 'system')),
      start_ms INTEGER NOT NULL DEFAULT 0,
      end_ms INTEGER NOT NULL DEFAULT 0,
      text TEXT NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS walk_ins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      table_id TEXT REFERENCES dining_tables(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'seated', 'converted', 'cancelled')),
      converted_appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      event TEXT NOT NULL,
      status TEXT NOT NULL,
      request_body TEXT NOT NULL DEFAULT '',
      response_status INTEGER,
      response_body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_jobs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      simulated INTEGER NOT NULL DEFAULT 1,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
    CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone);
    CREATE INDEX IF NOT EXISTS idx_appointments_table ON appointments(table_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_calls_called_at ON calls(called_at);
    CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone);
    CREATE INDEX IF NOT EXISTS idx_calls_customer ON calls(customer_id);
    CREATE INDEX IF NOT EXISTS idx_calls_appointment ON calls(appointment_id);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_walkins_date ON walk_ins(date);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);
}

export function closeDatabase(db) {
  try {
    db.close();
  } catch {
    // Already closed.
  }
}
