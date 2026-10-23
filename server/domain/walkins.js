import crypto from 'node:crypto';
import { AppError, notFound } from '../lib/errors.js';
import { localDateString, localDateTime } from '../lib/time.js';
import { addNotification, getSettings } from './settings.js';
import { createAppointment, getAppointment } from './appointments.js';

export const WALKIN_STATUSES = ['waiting', 'seated', 'converted', 'cancelled'];

const walkInSelect = `
  SELECT w.id, w.name, w.phone, w.customer_id AS customerId, w.date, w.time, w.party_size AS partySize,
    w.table_id AS tableId, w.notes, w.status, w.converted_appointment_id AS convertedAppointmentId,
    w.created_by AS createdBy, w.created_at AS createdAt, w.updated_at AS updatedAt,
    t.name AS tableName, ar.name AS areaName, c.tier AS customerTier, c.tags AS customerTags
  FROM walk_ins w
  LEFT JOIN dining_tables t ON t.id = w.table_id
  LEFT JOIN areas ar ON ar.id = t.area_id
  LEFT JOIN customers c ON c.id = w.customer_id
`;

function parseTags(value) {
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

export function mapWalkIn(row) {
  if (!row) return null;
  return {
    ...row,
    partySize: Number(row.partySize || 0),
    customerTags: parseTags(row.customerTags)
  };
}

export function getWalkIn(db, id) {
  return mapWalkIn(db.prepare(`${walkInSelect} WHERE w.id = ?`).get(id));
}

export function listWalkIns(db, query = {}) {
  const where = [];
  const params = [];
  if (query.date) { where.push('w.date = ?'); params.push(query.date); }
  if (WALKIN_STATUSES.includes(String(query.status || ''))) { where.push('w.status = ?'); params.push(query.status); }
  const search = String(query.search || '').trim();
  if (search) {
    where.push('(w.name LIKE ? OR w.phone LIKE ? OR w.notes LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = db.prepare(`${walkInSelect} ${whereSql} ORDER BY w.date DESC, w.time DESC LIMIT 200`)
    .all(...params).map(mapWalkIn);
  const waiting = db.prepare("SELECT COUNT(*) AS count FROM walk_ins WHERE status = 'waiting'").get();
  return { items, total: items.length, waiting: Number(waiting.count) };
}

function validateWalkInTable(db, tableId, partySize) {
  if (!tableId) return;
  const table = db.prepare('SELECT capacity, active FROM dining_tables WHERE id = ?').get(tableId);
  if (!table || !table.active) throw new AppError('桌台不存在或已停用', 422, 'TABLE_NOT_FOUND');
  if (Number(partySize) > Number(table.capacity)) {
    throw new AppError(`所选桌台最多容纳 ${table.capacity} 人`, 422, 'CAPACITY_EXCEEDED', { capacity: Number(table.capacity) });
  }
}

function resolveCustomer(db, data, now) {
  if (data.customerId) {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(data.customerId);
    if (customer) return customer.id;
  }
  if (!data.phone) return null;
  const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(data.phone);
  if (existing) return existing.id;
  const id = `cust_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.prepare(`
    INSERT INTO customers (id, name, phone, tier, preferences, allergies, notes, tags, total_spent, visit_count, last_contact_at, created_at, updated_at)
    VALUES (?, ?, ?, 'new', '', '', '', '[]', 0, 0, ?, ?, ?)
  `).run(id, data.name, data.phone, now, now, now);
  return id;
}

export function createWalkIn(db, data, actor) {
  const date = data.date || localDateString();
  if (date < localDateString()) throw new AppError('散客登记不能使用过去日期', 422, 'PAST_DATE');
  if ((data.status || 'waiting') === 'converted') {
    throw new AppError('“已转预约”只能通过转预约操作产生', 422, 'INVALID_WALKIN_STATUS');
  }
  validateWalkInTable(db, data.tableId, data.partySize);
  const now = localDateTime();
  const id = `walk_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.exec('BEGIN');
  try {
    const customerId = resolveCustomer(db, data, now);
    db.prepare(`
      INSERT INTO walk_ins (id, name, phone, customer_id, date, time, party_size, table_id, notes, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.name, data.phone || '', customerId, date, data.time, data.partySize,
      data.tableId || null, data.notes || '', data.status || 'waiting', actor?.id || null, now, now
    );
    addNotification(db, {
      type: 'info',
      title: '散客登记',
      body: `${data.name} · ${data.date || date} ${data.time} · ${data.partySize} 人`,
      entityType: 'walkin',
      entityId: id
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getWalkIn(db, id);
}

export function updateWalkIn(db, id, data) {
  const existing = getWalkIn(db, id);
  if (!existing) throw notFound('散客记录');
  const merged = {
    name: data.name ?? existing.name,
    phone: data.phone ?? existing.phone,
    date: data.date ?? existing.date,
    time: data.time ?? existing.time,
    partySize: data.partySize ?? existing.partySize,
    tableId: Object.prototype.hasOwnProperty.call(data, 'tableId') ? (data.tableId || null) : existing.tableId,
    notes: data.notes ?? existing.notes,
    status: data.status ?? existing.status
  };
  if (data.status === 'converted') {
    throw new AppError('“已转预约”只能通过转预约操作产生', 422, 'INVALID_WALKIN_STATUS');
  }
  if (data.date && merged.date < localDateString()) {
    throw new AppError('散客记录不能修改为过去日期', 422, 'PAST_DATE');
  }
  if (Object.prototype.hasOwnProperty.call(data, 'tableId') || data.partySize != null) {
    validateWalkInTable(db, merged.tableId, merged.partySize);
  }
  db.prepare(`
    UPDATE walk_ins SET name = ?, phone = ?, date = ?, time = ?, party_size = ?, table_id = ?, notes = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(merged.name, merged.phone, merged.date, merged.time, merged.partySize, merged.tableId, merged.notes, merged.status, localDateTime(), id);
  return getWalkIn(db, id);
}

export function deleteWalkIn(db, id) {
  const existing = getWalkIn(db, id);
  if (!existing) throw notFound('散客记录');
  db.prepare('DELETE FROM walk_ins WHERE id = ?').run(id);
  return existing;
}

export function convertWalkIn(db, id, actor, overrides = {}) {
  const existing = getWalkIn(db, id);
  if (!existing) throw notFound('散客记录');
  if (existing.convertedAppointmentId) {
    return { walkIn: existing, appointment: getAppointment(db, existing.convertedAppointmentId), alreadyConverted: true };
  }
  if (existing.status === 'cancelled') throw new AppError('已取消的散客记录不能转为预约', 409, 'WALKIN_CANCELLED');
  const phone = overrides.phone || existing.phone || '';
  if (!phone) {
    throw new AppError('转为正式预约前需要补充客人手机号', 422, 'WALKIN_PHONE_REQUIRED');
  }
  const date = overrides.date || (existing.date < localDateString() ? localDateString() : existing.date);
  const settings = getSettings(db);
  const result = createAppointment(db, {
    guestName: overrides.guestName || existing.name,
    phone,
    date,
    time: overrides.time || existing.time,
    partySize: overrides.partySize || existing.partySize,
    tableId: Object.prototype.hasOwnProperty.call(overrides, 'tableId') ? overrides.tableId : existing.tableId,
    comboId: overrides.comboId || null,
    source: 'walk_in',
    status: 'seated',
    occasion: overrides.occasion || '',
    notes: overrides.notes || existing.notes,
    customerId: existing.customerId,
    conflictWindowMinutes: Number(settings.conflict_window_minutes || 90),
    overrideConflict: Boolean(overrides.overrideConflict)
  }, actor, { allowOverride: Boolean(overrides.overrideConflict) && actor?.role !== 'viewer' });
  // 转预约时补录的手机号/匹配到的客户要回写到散客记录，避免记录与实际预约信息不一致。
  db.prepare("UPDATE walk_ins SET status = 'converted', converted_appointment_id = ?, phone = ?, customer_id = ?, updated_at = ? WHERE id = ?")
    .run(result.item.id, result.item.phone || phone, result.item.customerId || existing.customerId || null, localDateTime(), id);
  return { walkIn: getWalkIn(db, id), appointment: result.item, overridden: result.overridden };
}
