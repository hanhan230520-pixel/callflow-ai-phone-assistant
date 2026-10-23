import crypto from 'node:crypto';
import { AppError, notFound } from '../lib/errors.js';
import { isValidDateString, isValidTimeString, localDateString, localDateTime, minutesToTime, timeToMinutes } from '../lib/time.js';

export const STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'no_show', 'cancelled'];
export const SOURCES = ['phone', 'walk_in', 'online', 'referral', 'other'];
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'seated'];
// 新建预约只能处于进行中的初始状态；completed/no_show/cancelled 必须通过状态流转达成。
export const INITIAL_STATUSES = ['pending', 'confirmed', 'seated'];

const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['seated', 'no_show', 'cancelled'],
  seated: ['completed', 'cancelled'],
  completed: [],
  no_show: [],
  cancelled: []
};

export const appointmentSelect = `
  SELECT
    a.id, a.customer_id AS customerId, a.guest_name AS guestName, a.phone,
    a.date, a.time, a.party_size AS partySize, a.table_id AS tableId,
    a.combo_id AS comboId, a.source, a.status, a.occasion, a.notes,
    a.conflict_override AS conflictOverride, a.created_by AS createdBy,
    a.created_at AS createdAt, a.updated_at AS updatedAt, a.cancelled_at AS cancelledAt,
    c.name AS customerName, c.tier AS customerTier, c.tags AS customerTags,
    c.total_spent AS customerTotalSpent, c.visit_count AS customerVisitCount,
    c.preferences AS customerPreferences, c.allergies AS customerAllergies,
    t.name AS tableName, t.area_id AS areaId, ar.name AS areaName,
    t.capacity AS tableCapacity, t.status AS tableStatus,
    cr.name AS comboName, cr.capacity AS comboCapacity
  FROM appointments a
  LEFT JOIN customers c ON c.id = a.customer_id
  LEFT JOIN dining_tables t ON t.id = a.table_id
  LEFT JOIN areas ar ON ar.id = t.area_id
  LEFT JOIN combo_rooms cr ON cr.id = a.combo_id
`;

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function mapAppointment(row) {
  if (!row) return null;
  return {
    ...row,
    partySize: Number(row.partySize),
    conflictOverride: Boolean(row.conflictOverride),
    customerTags: parseJson(row.customerTags, []),
    customerTotalSpent: Number(row.customerTotalSpent || 0),
    customerVisitCount: Number(row.customerVisitCount || 0),
    tableCapacity: row.tableCapacity == null ? null : Number(row.tableCapacity),
    comboCapacity: row.comboCapacity == null ? null : Number(row.comboCapacity)
  };
}

export function getAppointment(db, id) {
  return mapAppointment(db.prepare(`${appointmentSelect} WHERE a.id = ?`).get(id));
}

export function getComboTableIds(db, comboId) {
  if (!comboId) return [];
  return db.prepare('SELECT table_id AS tableId FROM combo_room_tables WHERE combo_id = ?').all(comboId).map((row) => row.tableId);
}

export function getAppointmentTableIds(db, row) {
  if (!row) return [];
  if (row.comboId) return getComboTableIds(db, row.comboId);
  if (row.tableId) return [row.tableId];
  return [];
}

export function getTargetTableIds(db, { tableId, comboId }) {
  if (comboId) return getComboTableIds(db, comboId);
  if (tableId) return [tableId];
  return [];
}

export function getCapacity(db, { tableId, comboId }) {
  if (comboId) {
    const combo = db.prepare('SELECT capacity FROM combo_rooms WHERE id = ? AND active = 1').get(comboId);
    if (!combo) throw new AppError('组合包间不存在或已停用', 422, 'COMBO_NOT_FOUND');
    return Number(combo.capacity);
  }
  if (tableId) {
    const table = db.prepare('SELECT capacity, status, active FROM dining_tables WHERE id = ?').get(tableId);
    if (!table || !table.active) throw new AppError('桌台不存在或已停用', 422, 'TABLE_NOT_FOUND');
    if (table.status === 'disabled') throw new AppError('该桌台已停用', 422, 'TABLE_DISABLED');
    return Number(table.capacity);
  }
  return null;
}

export function validateAppointmentDate(date, { allowPast = false } = {}) {
  if (!isValidDateString(date)) throw new AppError('日期格式应为 YYYY-MM-DD', 400, 'VALIDATION_ERROR');
  if (!allowPast && date < localDateString()) throw new AppError('不能创建或修改为过去日期的预约', 422, 'PAST_DATE');
}

export function validateAppointmentTime(time) {
  if (!isValidTimeString(time)) throw new AppError('时间格式应为 HH:mm', 400, 'VALIDATION_ERROR');
}

export function findConflicts(db, { date, time, tableId, comboId, excludeId, windowMinutes = 90 }) {
  const targetTables = getTargetTableIds(db, { tableId, comboId });
  if (!targetTables.length) return [];
  const rows = db.prepare(`${appointmentSelect}
    WHERE a.date = ? AND a.status IN ('pending', 'confirmed', 'seated')
    ${excludeId ? 'AND a.id <> ?' : ''}
    ORDER BY a.time ASC
  `).all(...(excludeId ? [date, excludeId] : [date]));
  return rows
    .filter((row) => {
      const existingTables = getAppointmentTableIds(db, row);
      const overlap = existingTables.some((id) => targetTables.includes(id));
      if (!overlap) return false;
      return Math.abs(timeToMinutes(row.time) - timeToMinutes(time)) < windowMinutes;
    })
    .map((row) => {
      const shared = getAppointmentTableIds(db, row).filter((id) => targetTables.includes(id));
      return {
        id: row.id, guestName: row.guestName, time: row.time, date: row.date,
        partySize: row.partySize, status: row.status, tableName: row.tableName,
        comboName: row.comboName, sharedTableIds: shared
      };
    });
}

export function findNearbySlots(db, { date, time, partySize, tableId, comboId, excludeId, windowMinutes = 90, limit = 4 }) {
  const candidates = [];
  const hasTarget = Boolean(tableId || comboId);
  if (!hasTarget) {
    const tables = db.prepare(`
      SELECT id FROM dining_tables WHERE active = 1 AND status = 'available' AND capacity >= ?
      ORDER BY capacity ASC, name ASC
    `).all(Number(partySize || 1));
    if (!tables.length) return [];
  }
  const offsets = [];
  for (let step = 30; step <= 180; step += 30) offsets.push(-step, step);
  for (const offset of offsets) {
    const candidateMinutes = timeToMinutes(time) + offset;
    if (candidateMinutes < 0 || candidateMinutes > 23 * 60 + 59) continue;
    const candidateTime = minutesToTime(candidateMinutes);
    if (hasTarget) {
      let capacity = null;
      try { capacity = getCapacity(db, { tableId, comboId }); } catch { continue; }
      if (capacity != null && Number(partySize) > capacity) continue;
      const conflicts = findConflicts(db, { date, time: candidateTime, tableId, comboId, excludeId, windowMinutes });
      if (!conflicts.length) candidates.push({ time: candidateTime, tableId: tableId || null, comboId: comboId || null, offset });
    } else {
      const tables = db.prepare(`
        SELECT id, name, capacity FROM dining_tables
        WHERE active = 1 AND status = 'available' AND capacity >= ?
        ORDER BY capacity ASC, name ASC
      `).all(Number(partySize || 1));
      for (const table of tables) {
        const conflicts = findConflicts(db, { date, time: candidateTime, tableId: table.id, excludeId, windowMinutes });
        if (!conflicts.length) {
          candidates.push({ time: candidateTime, tableId: table.id, tableName: table.name, capacity: table.capacity, offset });
          break;
        }
      }
    }
    if (candidates.length >= limit) break;
  }
  return candidates.slice(0, limit);
}

function ensureCustomer(db, data, now) {
  if (data.customerId) {
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(data.customerId);
    if (existing) return existing.id;
  }
  const byPhone = db.prepare('SELECT id FROM customers WHERE phone = ?').get(data.phone);
  if (byPhone) return byPhone.id;
  const id = `cust_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.prepare(`
    INSERT INTO customers (id, name, phone, tier, preferences, allergies, notes, tags, total_spent, visit_count, last_contact_at, created_at, updated_at)
    VALUES (?, ?, ?, 'new', '', '', '', '[]', 0, 0, ?, ?, ?)
  `).run(id, data.guestName, data.phone, now, now, now);
  return id;
}

function addStatusHistory(db, appointmentId, fromStatus, toStatus, userId, note, now) {
  db.prepare(`
    INSERT INTO appointment_status_history (id, appointment_id, from_status, to_status, changed_by, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(`ash_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`, appointmentId, fromStatus || '', toStatus, userId || null, note || '', now);
}

function addNotification(db, { type = 'info', title, body = '', entityType = 'appointment', entityId = '' }) {
  db.prepare(`
    INSERT INTO notifications (id, type, title, body, entity_type, entity_id, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(`notif_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`, type, title, body, entityType, entityId, localDateTime());
}

function applyStatusEffect(db, appointment, fromStatus, toStatus, userId, now) {
  if (fromStatus === toStatus) return;
  if (toStatus === 'completed') {
    db.prepare('UPDATE customers SET visit_count = visit_count + 1, last_contact_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, appointment.customerId);
    addNotification(db, { type: 'success', title: '预约已完成', body: `${appointment.guestName} · ${appointment.date} ${appointment.time}`, entityId: appointment.id });
  } else if (toStatus === 'seated') {
    db.prepare('UPDATE customers SET last_contact_at = ?, updated_at = ? WHERE id = ?').run(now, now, appointment.customerId);
  } else if (toStatus === 'cancelled') {
    db.prepare('UPDATE appointments SET cancelled_at = ? WHERE id = ?').run(now, appointment.id);
  } else if (toStatus === 'no_show') {
    addNotification(db, { type: 'warning', title: '预约未到店', body: `${appointment.guestName} · ${appointment.date} ${appointment.time}`, entityId: appointment.id });
  }
}

export function createAppointment(db, data, actor, { allowOverride = false } = {}) {
  validateAppointmentDate(data.date);
  validateAppointmentTime(data.time);
  const initialStatus = data.status || 'pending';
  if (!INITIAL_STATUSES.includes(initialStatus)) {
    throw new AppError('新建预约只能使用待确认、已确认或已到店状态', 422, 'INVALID_INITIAL_STATUS', { allowed: INITIAL_STATUSES });
  }
  if (data.tableId && data.comboId) throw new AppError('桌台与组合包间只能选择其一', 400, 'INVALID_TABLE_SELECTION');
  const capacity = getCapacity(db, data);
  if (capacity != null && Number(data.partySize) > capacity) {
    throw new AppError(`所选桌台最多容纳 ${capacity} 人`, 422, 'CAPACITY_EXCEEDED', { capacity });
  }
  const windowMinutes = Number(data.conflictWindowMinutes || 90);
  const conflicts = findConflicts(db, { ...data, windowMinutes });
  const override = Boolean(data.overrideConflict && allowOverride);
  if (conflicts.length && !override) {
    throw new AppError(`该桌台在前后 ${windowMinutes} 分钟内已有有效预约`, 409, 'TABLE_CONFLICT', {
      conflicts,
      nearbySlots: findNearbySlots(db, { ...data, windowMinutes })
    });
  }
  const now = localDateTime();
  const id = `apt_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.exec('BEGIN');
  try {
    const customerId = ensureCustomer(db, data, now);
    db.prepare(`
      INSERT INTO appointments
        (id, customer_id, guest_name, phone, date, time, party_size, table_id, combo_id, source, status,
         occasion, notes, conflict_override, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, customerId, data.guestName, data.phone, data.date, data.time, data.partySize,
      data.tableId || null, data.comboId || null, data.source || 'phone', initialStatus,
      data.occasion || '', data.notes || '', override ? 1 : 0, actor?.id || null, now, now
    );
    addStatusHistory(db, id, '', initialStatus, actor?.id, override ? '创建时覆盖冲突' : '', now);
    const appointment = getAppointment(db, id);
    applyStatusEffect(db, appointment, '', appointment.status, actor?.id, now);
    addNotification(db, {
      type: 'info',
      title: override ? '预约已创建（覆盖冲突）' : '新预约已创建',
      body: `${appointment.guestName} · ${appointment.date} ${appointment.time} · ${appointment.partySize} 人`,
      entityId: id
    });
    db.exec('COMMIT');
    return { item: appointment, conflicts, overridden: override };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function updateAppointment(db, id, data, actor, { allowOverride = false, force = false, conflictWindowMinutes = 90 } = {}) {
  const existing = getAppointment(db, id);
  if (!existing) throw notFound('预约');
  const merged = {
    guestName: data.guestName ?? existing.guestName,
    phone: data.phone ?? existing.phone,
    date: data.date ?? existing.date,
    time: data.time ?? existing.time,
    partySize: data.partySize ?? existing.partySize,
    tableId: Object.prototype.hasOwnProperty.call(data, 'tableId') ? (data.tableId || null) : existing.tableId,
    comboId: Object.prototype.hasOwnProperty.call(data, 'comboId') ? (data.comboId || null) : existing.comboId,
    source: data.source ?? existing.source,
    status: data.status ?? existing.status,
    occasion: data.occasion ?? existing.occasion,
    notes: data.notes ?? existing.notes,
    customerId: data.customerId ?? existing.customerId,
    overrideConflict: Boolean(data.overrideConflict)
  };
  if (merged.tableId && merged.comboId) throw new AppError('桌台与组合包间只能选择其一', 400, 'INVALID_TABLE_SELECTION');
  // 仅在日期实际变更时校验是否为过去日期，避免仅编辑历史预约的备注/时间时被拒绝。
  if (data.date && data.date !== existing.date) validateAppointmentDate(merged.date, { allowPast: false });
  validateAppointmentTime(merged.time);
  const capacity = getCapacity(db, merged);
  if (capacity != null && Number(merged.partySize) > capacity) {
    throw new AppError(`所选桌台最多容纳 ${capacity} 人`, 422, 'CAPACITY_EXCEEDED', { capacity });
  }
  if (merged.status !== existing.status) {
    const allowed = TRANSITIONS[existing.status] || [];
    if (!force && !allowed.includes(merged.status)) {
      throw new AppError(`预约状态不能从 ${existing.status} 直接变为 ${merged.status}`, 422, 'INVALID_TRANSITION', { allowed });
    }
  }
  const windowMinutes = Number(conflictWindowMinutes || 90);
  const conflicts = findConflicts(db, { ...merged, excludeId: id, windowMinutes });
  const override = Boolean(merged.overrideConflict && allowOverride);
  if (conflicts.length && !override) {
    throw new AppError(`该桌台在前后 ${windowMinutes} 分钟内已有有效预约`, 409, 'TABLE_CONFLICT', {
      conflicts,
      nearbySlots: findNearbySlots(db, { ...merged, excludeId: id, windowMinutes })
    });
  }
  const now = localDateTime();
  db.exec('BEGIN');
  try {
    const customerId = ensureCustomer(db, merged, now);
    db.prepare(`
      UPDATE appointments SET customer_id = ?, guest_name = ?, phone = ?, date = ?, time = ?, party_size = ?,
        table_id = ?, combo_id = ?, source = ?, status = ?, occasion = ?, notes = ?, conflict_override = ?, updated_at = ?
      WHERE id = ?
    `).run(
      customerId, merged.guestName, merged.phone, merged.date, merged.time, merged.partySize,
      merged.tableId, merged.comboId, merged.source, merged.status, merged.occasion, merged.notes,
      override ? 1 : 0, now, id
    );
    if (merged.status !== existing.status) {
      addStatusHistory(db, id, existing.status, merged.status, actor?.id, force ? '管理员强制修改状态' : '编辑预约时修改状态', now);
      applyStatusEffect(db, { ...existing, ...merged, customerId }, existing.status, merged.status, actor?.id, now);
    }
    if (override) addStatusHistory(db, id, merged.status, merged.status, actor?.id, '编辑时覆盖桌台冲突', now);
    db.exec('COMMIT');
    return { item: getAppointment(db, id), conflicts, overridden: override };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function changeStatus(db, id, nextStatus, actor, note = '', { force = false } = {}) {
  if (!STATUSES.includes(nextStatus)) throw new AppError('预约状态不正确', 400, 'VALIDATION_ERROR');
  const existing = getAppointment(db, id);
  if (!existing) throw notFound('预约');
  if (existing.status === nextStatus) return existing;
  const allowed = TRANSITIONS[existing.status] || [];
  if (!force && !allowed.includes(nextStatus)) {
    throw new AppError(`预约状态不能从 ${existing.status} 直接变为 ${nextStatus}`, 422, 'INVALID_TRANSITION', { allowed });
  }
  const now = localDateTime();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, now, id);
    addStatusHistory(db, id, existing.status, nextStatus, actor?.id, note || '', now);
    applyStatusEffect(db, existing, existing.status, nextStatus, actor?.id, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getAppointment(db, id);
}

export function deleteAppointment(db, id) {
  const existing = getAppointment(db, id);
  if (!existing) throw notFound('预约');
  db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  return existing;
}

export function listAppointments(db, query = {}) {
  const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(5, Number.parseInt(String(query.pageSize || '20'), 10) || 20));
  const offset = (page - 1) * pageSize;
  const where = [];
  const params = [];
  const search = String(query.search || '').trim();
  if (search) {
    where.push('(a.guest_name LIKE ? OR a.phone LIKE ? OR a.notes LIKE ? OR t.name LIKE ? OR cr.name LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term, term);
  }
  if (STATUSES.includes(String(query.status || ''))) { where.push('a.status = ?'); params.push(query.status); }
  if (SOURCES.includes(String(query.source || ''))) { where.push('a.source = ?'); params.push(query.source); }
  if (isValidDateString(query.date)) { where.push('a.date = ?'); params.push(query.date); }
  if (isValidDateString(query.from)) { where.push('a.date >= ?'); params.push(query.from); }
  if (isValidDateString(query.to)) { where.push('a.date <= ?'); params.push(query.to); }
  if (query.customerId) { where.push('a.customer_id = ?'); params.push(query.customerId); }
  if (query.tableId) {
    where.push('(a.table_id = ? OR a.combo_id IN (SELECT combo_id FROM combo_room_tables WHERE table_id = ?))');
    params.push(query.tableId, query.tableId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.prepare(`
    SELECT COUNT(*) AS count FROM appointments a
    LEFT JOIN dining_tables t ON t.id = a.table_id
    LEFT JOIN combo_rooms cr ON cr.id = a.combo_id
    ${whereSql}
  `).get(...params).count);
  const items = db.prepare(`${appointmentSelect} ${whereSql}
    ORDER BY a.date ASC, a.time ASC, a.guest_name ASC LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset).map(mapAppointment);
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function appointmentDetail(db, id) {
  const item = getAppointment(db, id);
  if (!item) throw notFound('预约');
  const customerRow = item.customerId ? db.prepare('SELECT * FROM customers WHERE id = ?').get(item.customerId) : null;
  const customer = customerRow ? {
    ...customerRow,
    tags: parseJson(customerRow.tags, []),
    totalSpent: Number(customerRow.total_spent || 0),
    visitCount: Number(customerRow.visit_count || 0),
    lastContactAt: customerRow.last_contact_at,
    createdAt: customerRow.created_at,
    updatedAt: customerRow.updated_at
  } : null;
  const history = db.prepare(`
    SELECT h.id, h.from_status AS fromStatus, h.to_status AS toStatus, h.note, h.created_at AS createdAt,
      u.display_name AS changedByName
    FROM appointment_status_history h LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.appointment_id = ? ORDER BY h.created_at ASC
  `).all(id);
  const calls = db.prepare(`
    SELECT id, contact_name AS contactName, phone, called_at AS calledAt, status, direction,
      duration_seconds AS durationSeconds, ai_summary AS aiSummary, is_simulated AS isSimulated
    FROM calls WHERE appointment_id = ? OR phone = ? ORDER BY called_at DESC LIMIT 10
  `).all(id, item.phone).map((row) => ({ ...row, isSimulated: Boolean(row.isSimulated) }));
  const payments = item.customerId ? db.prepare('SELECT * FROM payments WHERE customer_id = ? ORDER BY paid_at DESC').all(item.customerId) : [];
  return { item, customer, history, calls, payments };
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}
