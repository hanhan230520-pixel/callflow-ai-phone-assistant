import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { isValidDateString, isValidTimeString, localDateTime } from '../lib/time.js';
import { STATUSES, SOURCES, CALL_STATUSES } from '../lib/schemas.js';
import { seedDemoData } from '../seed.js';
import { SECRET_SETTING_KEYS, SENSITIVE_SETTING_KEYS } from './settings.js';

const CSV_COLUMNS = {
  customers: ['id', 'name', 'phone', 'tier', 'preferences', 'allergies', 'notes', 'tags', 'total_spent', 'visit_count', 'last_contact_at'],
  appointments: ['id', 'guest_name', 'phone', 'date', 'time', 'party_size', 'table_id', 'combo_id', 'source', 'status', 'occasion', 'notes'],
  calls: ['id', 'contact_name', 'phone', 'called_at', 'direction', 'status', 'duration_seconds', 'ai_summary', 'ai_tags', 'appointment_id', 'is_simulated']
};

const TABLE_COLUMNS = {
  areas: ['id', 'name', 'sort_order', 'created_at'],
  dining_tables: ['id', 'name', 'area_id', 'capacity', 'shape', 'x', 'y', 'status', 'combo_group', 'active', 'created_at', 'updated_at'],
  combo_rooms: ['id', 'name', 'capacity', 'notes', 'active', 'created_at', 'updated_at'],
  combo_room_tables: ['combo_id', 'table_id'],
  time_slots: ['id', 'name', 'start_time', 'end_time', 'sort_order', 'active'],
  customers: ['id', 'name', 'phone', 'tier', 'preferences', 'allergies', 'notes', 'tags', 'total_spent', 'visit_count', 'last_contact_at', 'created_at', 'updated_at'],
  payments: ['id', 'customer_id', 'appointment_id', 'amount', 'method', 'note', 'receipt_ref', 'paid_at', 'created_by', 'created_at'],
  appointments: ['id', 'customer_id', 'guest_name', 'phone', 'date', 'time', 'party_size', 'table_id', 'combo_id', 'source', 'status', 'occasion', 'notes', 'conflict_override', 'created_by', 'created_at', 'updated_at', 'cancelled_at'],
  appointment_status_history: ['id', 'appointment_id', 'from_status', 'to_status', 'changed_by', 'note', 'created_at'],
  calls: ['id', 'contact_name', 'phone', 'customer_id', 'called_at', 'answered_at', 'ended_at', 'direction', 'status', 'duration_seconds', 'recording_ref', 'transcript', 'ai_summary', 'ai_tags', 'ai_extracted', 'keywords', 'sentiment', 'scenario', 'follow_up', 'notes', 'appointment_id', 'is_simulated', 'created_by', 'created_at', 'updated_at'],
  call_segments: ['id', 'call_id', 'speaker', 'start_ms', 'end_ms', 'text', 'is_final', 'created_at'],
  walk_ins: ['id', 'name', 'phone', 'customer_id', 'date', 'time', 'party_size', 'table_id', 'notes', 'status', 'converted_appointment_id', 'created_by', 'created_at', 'updated_at'],
  notifications: ['id', 'type', 'title', 'body', 'entity_type', 'entity_id', 'read', 'created_at']
};

function csvEscape(value) {
  let text = value == null ? '' : String(value);
  // 防止 CSV 公式注入：以 = + - @ 或控制字符开头的值前加单引号。
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(rows, columns) {
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')).join('\n');
  return `﻿${header}\n${body}\n`;
}

export function parseCsv(text) {
  const input = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((item) => item.trim());
  return rows.filter((line) => line.some((value) => value !== '')).map((line) => Object.fromEntries(headers.map((header, index) => [header, line[index] ?? ''])));
}

export function exportCsv(db, type) {
  const columns = CSV_COLUMNS[type];
  if (!columns) throw new AppError('不支持的 CSV 导出类型', 400, 'INVALID_EXPORT_TYPE');
  const rows = db.prepare(`SELECT ${columns.join(', ')} FROM ${type} ORDER BY 1`).all();
  return { filename: `callflow-${type}-${localDateTime().replaceAll(':', '-')}.csv`, content: toCsv(rows, columns), rows: rows.length };
}

export function exportJson(db) {
  const data = {
    areas: db.prepare('SELECT * FROM areas ORDER BY sort_order').all(),
    dining_tables: db.prepare('SELECT * FROM dining_tables ORDER BY name').all(),
    combo_rooms: db.prepare('SELECT * FROM combo_rooms ORDER BY name').all(),
    combo_room_tables: db.prepare('SELECT * FROM combo_room_tables').all(),
    time_slots: db.prepare('SELECT * FROM time_slots ORDER BY sort_order').all(),
    customers: db.prepare('SELECT * FROM customers ORDER BY created_at').all(),
    payments: db.prepare('SELECT * FROM payments ORDER BY created_at').all(),
    appointments: db.prepare('SELECT * FROM appointments ORDER BY created_at').all(),
    appointment_status_history: db.prepare('SELECT * FROM appointment_status_history ORDER BY created_at').all(),
    calls: db.prepare('SELECT * FROM calls ORDER BY created_at').all(),
    call_segments: db.prepare('SELECT * FROM call_segments ORDER BY call_id, start_ms').all(),
    walk_ins: db.prepare('SELECT * FROM walk_ins ORDER BY created_at').all(),
    notifications: db.prepare('SELECT * FROM notifications ORDER BY created_at').all(),
    settings: db.prepare('SELECT * FROM settings').all().filter((row) => !SENSITIVE_SETTING_KEYS.has(row.key) && !SECRET_SETTING_KEYS.has(row.key))
  };
  return {
    format: 'callflow-full-backup',
    version: 1,
    exportedAt: localDateTime(),
    note: '业务数据备份；不包含密码哈希、飞书密钥、Webhook 密钥或真实生产数据。',
    data
  };
}

export function clearBusinessData(db, { manageTransaction = true } = {}) {
  if (manageTransaction) db.exec('BEGIN');
  try {
    for (const table of [
      'call_segments', 'calls', 'appointment_status_history', 'payments', 'walk_ins', 'appointments',
      'notifications', 'combo_room_tables', 'combo_rooms', 'dining_tables', 'areas', 'time_slots',
      'customers', 'sync_jobs', 'webhook_deliveries'
    ]) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    if (manageTransaction) db.exec('COMMIT');
  } catch (error) {
    if (manageTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

function insertRows(db, table, rows) {
  const columns = TABLE_COLUMNS[table];
  if (!columns || !Array.isArray(rows)) return 0;
  const statement = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
  let count = 0;
  for (const row of rows) {
    const values = columns.map((column) => {
      const value = row[column];
      if (value === undefined || value === null) {
        return ['created_by', 'changed_by', 'customer_id', 'appointment_id', 'table_id', 'combo_id', 'area_id', 'converted_appointment_id'].includes(column) ? null : '';
      }
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
    });
    statement.run(...values);
    count += 1;
  }
  return count;
}

export function importJson(db, payload) {
  if (!payload || payload.format !== 'callflow-full-backup' || !payload.data) {
    throw new AppError('备份格式不正确，需要 CallFlow backup JSON', 400, 'INVALID_BACKUP');
  }
  const data = payload.data;
  const coreTables = ['areas', 'dining_tables', 'customers', 'appointments'];
  const coreRows = coreTables.reduce((sum, table) => sum + (Array.isArray(data[table]) ? data[table].length : 0), 0);
  if (!coreRows) {
    throw new AppError('备份不包含任何业务数据，已拒绝导入以避免清空现有数据', 422, 'EMPTY_BACKUP');
  }
  const counts = {};
  db.exec('BEGIN');
  try {
    clearBusinessData(db, { manageTransaction: false });
    for (const table of ['areas', 'dining_tables', 'combo_rooms', 'combo_room_tables', 'time_slots', 'customers', 'appointments', 'appointment_status_history', 'calls', 'call_segments', 'walk_ins', 'payments', 'notifications']) {
      counts[table] = insertRows(db, table, data[table]);
    }
    if (Array.isArray(data.settings)) {
      for (const row of data.settings) {
        if (!row?.key || SENSITIVE_SETTING_KEYS.has(row.key) || SECRET_SETTING_KEYS.has(row.key)) continue;
        db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
          .run(row.key, row.value, row.updated_at || localDateTime());
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { counts };
}

export function importCsv(db, type, text) {
  if (!['customers', 'appointments', 'calls'].includes(type)) throw new AppError('不支持的 CSV 导入类型', 400, 'INVALID_IMPORT_TYPE');
  const rows = parseCsv(text);
  if (!rows.length) throw new AppError('CSV 没有可导入的数据行', 400, 'EMPTY_IMPORT');
  let imported = 0;
  const errors = [];
  db.exec('BEGIN');
  try {
    for (const [index, row] of rows.entries()) {
      try {
        if (type === 'customers') {
          const phone = String(row.phone || '').replace(/\D/g, '');
          const name = String(row.name || '').trim();
          if (!/^1[3-9]\d{9}$/.test(phone) || !name) throw new Error('姓名或手机号无效');
          const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
          const id = row.id || existing?.id || `cust_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
          const now = localDateTime();
          db.prepare(`
            INSERT INTO customers (id, name, phone, tier, preferences, allergies, notes, tags, total_spent, visit_count, last_contact_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, phone = excluded.phone, tier = excluded.tier,
              preferences = excluded.preferences, allergies = excluded.allergies, notes = excluded.notes,
              tags = excluded.tags, updated_at = excluded.updated_at
          `).run(
            id, name, phone, row.tier || 'new', row.preferences || '', row.allergies || '', row.notes || '',
            row.tags || '[]', Number(row.total_spent || 0), Number(row.visit_count || 0), row.last_contact_at || now, now, now
          );
        } else if (type === 'appointments') {
          const phone = String(row.phone || '').replace(/\D/g, '');
          const date = String(row.date || '').trim();
          const time = String(row.time || '').trim();
          const partySize = Number(row.party_size || 1);
          if (!/^1[3-9]\d{9}$/.test(phone) || !isValidDateString(date) || !isValidTimeString(time)) {
            throw new Error('预约手机号、日期或时间无效');
          }
          if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) throw new Error('预约人数应为 1–50 的整数');
          if (row.status && !STATUSES.includes(String(row.status))) throw new Error(`预约状态无效：${row.status}`);
          if (row.source && !SOURCES.includes(String(row.source))) throw new Error(`预约来源无效：${row.source}`);
          const customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
          const id = row.id || `apt_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
          db.prepare(`
            INSERT OR REPLACE INTO appointments
              (id, customer_id, guest_name, phone, date, time, party_size, table_id, combo_id, source, status, occasion, notes, conflict_override, created_by, created_at, updated_at, cancelled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, '')
          `).run(
            id, customer?.id || null, row.guest_name || '导入客户', phone, date, time,
            partySize, row.table_id || null, row.combo_id || null,
            row.source || 'other', row.status || 'pending', row.occasion || '', row.notes || '', localDateTime(), localDateTime()
          );
        } else {
          const phone = String(row.phone || '').replace(/\D/g, '');
          if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('通话手机号无效');
          if (row.status && !CALL_STATUSES.includes(String(row.status))) throw new Error(`通话状态无效：${row.status}`);
          if (row.direction && !['inbound', 'outbound'].includes(String(row.direction))) throw new Error(`通话方向无效：${row.direction}`);
          const customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
          const id = row.id || `call_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
          db.prepare(`
            INSERT OR REPLACE INTO calls
              (id, contact_name, phone, customer_id, called_at, direction, status, duration_seconds, ai_summary, ai_tags, appointment_id, is_simulated, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, row.contact_name || '导入联系人', phone, customer?.id || null, row.called_at || localDateTime(),
            row.direction || 'inbound', row.status || 'completed', Number(row.duration_seconds || 0),
            row.ai_summary || '', row.ai_tags || '[]', row.appointment_id || null,
            Number(row.is_simulated || 0), localDateTime(), localDateTime()
          );
        }
        imported += 1;
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { imported, skipped: errors.length, errors: errors.slice(0, 20) };
}

export function clearScope(db, scope) {
  const allowed = ['appointments', 'calls', 'customers', 'walkins', 'notifications', 'all'];
  if (!allowed.includes(scope)) throw new AppError('不支持的数据清理范围', 400, 'INVALID_SCOPE');
  db.exec('BEGIN');
  try {
    if (scope === 'appointments') {
      db.prepare('DELETE FROM appointment_status_history').run();
      db.prepare('UPDATE calls SET appointment_id = NULL').run();
      db.prepare('UPDATE payments SET appointment_id = NULL').run();
      // 关联预约被清理后，已转预约的散客恢复为已入座，避免出现指向空预约的“已转预约”。
      db.prepare("UPDATE walk_ins SET status = CASE WHEN status = 'converted' THEN 'seated' ELSE status END, converted_appointment_id = NULL").run();
      db.prepare('DELETE FROM appointments').run();
    } else if (scope === 'calls') {
      db.prepare('DELETE FROM call_segments').run();
      db.prepare('DELETE FROM calls').run();
    } else if (scope === 'customers') {
      db.prepare('UPDATE calls SET customer_id = NULL').run();
      db.prepare('UPDATE appointments SET customer_id = NULL').run();
      db.prepare('UPDATE walk_ins SET customer_id = NULL').run();
      db.prepare('DELETE FROM payments').run();
      db.prepare('DELETE FROM customers').run();
    } else if (scope === 'walkins') {
      db.prepare('DELETE FROM walk_ins').run();
    } else if (scope === 'notifications') {
      db.prepare('DELETE FROM notifications').run();
    } else {
      clearBusinessData(db, { manageTransaction: false });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { scope };
}

export function resetDemoData(db) {
  db.exec('BEGIN');
  try {
    clearBusinessData(db, { manageTransaction: false });
    seedDemoData(db, { manageTransaction: false });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { ok: true };
}

export function backupDirectory() {
  return path.resolve(process.env.BACKUP_DIR || './backups');
}

function ensureBackupDir() {
  const dir = backupDirectory();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createBackup(db, actor) {
  const dir = ensureBackupDir();
  const timestamp = localDateTime().replaceAll(':', '-');
  // 同一秒内创建多个备份时追加随机后缀，避免覆盖已有备份。
  const suffix = crypto.randomUUID().slice(0, 4);
  const filename = `callflow-backup-${timestamp}-${suffix}.json`;
  const filePath = path.join(dir, filename);
  const payload = {
    ...exportJson(db),
    createdBy: actor?.displayName || actor?.username || 'admin'
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { filename, size: fs.statSync(filePath).size, createdAt: payload.exportedAt };
}

export function listBackups() {
  const dir = ensureBackupDir();
  return fs.readdirSync(dir)
    .filter((name) => /^callflow-backup-.*\.json$/.test(name))
    .map((name) => {
      const stats = fs.statSync(path.join(dir, name));
      return { filename: name, size: stats.size, modifiedAt: stats.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function restoreBackup(db, filename) {
  const safeName = path.basename(String(filename || ''));
  if (!/^callflow-backup-.*\.json$/.test(safeName)) throw new AppError('备份文件名不正确', 400, 'INVALID_BACKUP_FILE');
  const filePath = path.join(ensureBackupDir(), safeName);
  if (!fs.existsSync(filePath)) throw new AppError('备份文件不存在', 404, 'BACKUP_NOT_FOUND');
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return importJson(db, payload);
}
