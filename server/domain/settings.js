import crypto from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { localDateTime } from '../lib/time.js';
import { maskSecret } from '../lib/security.js';
import { TELEPHONY_MODES } from '../adapters/telephony.js';

export const SETTING_DEFAULTS = {
  business_name: 'CallFlow 演示餐厅',
  business_phone: '0000-0000000',
  business_address: '演示地址（虚构）',
  business_hours: '11:00-22:00',
  currency: 'CNY',
  conflict_window_minutes: 90,
  enforce_time_slots: false,
  auto_confirm: false,
  ai_mode: 'mock',
  ai_model: 'mock-local',
  ai_base_url: '',
  transcription_enabled: true,
  recording_enabled: false,
  auto_answer_enabled: false,
  auto_answer_timeout: 8,
  telephony_mode: 'mock',
  feishu_app_id: '',
  feishu_app_secret: '',
  feishu_app_token: '',
  feishu_table_reservations: '',
  feishu_table_customers: '',
  feishu_table_walkins: '',
  feishu_table_seat_config: '',
  feishu_table_layouts: '',
  webhook_url: '',
  webhook_events: ['appointment.created', 'appointment.status_changed', 'call.completed'],
  demo_mode: true,
  ui_density: 'comfortable',
  disclaimer_ack: false
};

export const SECRET_SETTING_KEYS = new Set(['feishu_app_secret']);
export const SENSITIVE_SETTING_KEYS = new Set(['feishu_app_id', 'feishu_app_secret', 'feishu_app_token', 'ai_base_url']);

function parseValue(value) {
  try { return JSON.parse(value); } catch { return value; }
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = { ...SETTING_DEFAULTS };
  for (const row of rows) settings[row.key] = parseValue(row.value);
  return settings;
}

export function publicSettings(db) {
  const settings = getSettings(db);
  const result = { ...settings };
  for (const key of SENSITIVE_SETTING_KEYS) {
    if (result[key]) result[key] = maskSecret(result[key]);
    result[`${key}_set`] = Boolean(settings[key]);
  }
  return result;
}

export function setSettings(db, patch) {
  const allowed = new Set(Object.keys(SETTING_DEFAULTS));
  const updated = [];
  const now = localDateTime();
  db.exec('BEGIN');
  try {
    for (const [key, value] of Object.entries(patch || {})) {
      if (!allowed.has(key)) continue;
      if (key === 'conflict_window_minutes') {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 15 || number > 240) {
          throw new AppError('冲突窗口应在 15–240 分钟之间', 422, 'VALIDATION_ERROR');
        }
      }
      if (key === 'auto_answer_timeout') {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || number > 60) {
          throw new AppError('自动接听等待时间应在 0–60 秒之间', 422, 'VALIDATION_ERROR');
        }
      }
      if (key === 'telephony_mode' && !TELEPHONY_MODES.includes(String(value))) {
        throw new AppError(`电话模式不正确，可选：${TELEPHONY_MODES.join(', ')}`, 422, 'INVALID_TELEPHONY_MODE');
      }
      if (key === 'webhook_url' && value) {
        try { new URL(value); } catch { throw new AppError('Webhook URL 格式不正确', 422, 'VALIDATION_ERROR'); }
      }
      db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
        .run(key, JSON.stringify(value), now);
      updated.push(key);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { updated, settings: publicSettings(db) };
}

export function getSetting(db, key) {
  return getSettings(db)[key];
}

export function addNotification(db, { type = 'info', title, body = '', entityType = '', entityId = '' }) {
  const id = `notif_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.prepare(`
    INSERT INTO notifications (id, type, title, body, entity_type, entity_id, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, type, title, body, entityType, entityId, localDateTime());
  return id;
}
