import crypto from 'node:crypto';
import { AppError, notFound } from '../lib/errors.js';
import { localDateString, localDateTime } from '../lib/time.js';
import { getAppointment } from './appointments.js';

export const TIERS = ['new', 'regular', 'vip'];
export const PAYMENT_METHODS = ['wechat', 'alipay', 'cash', 'card', 'credit', 'comp', 'other'];

function parseTags(value) {
  try {
    const tags = JSON.parse(value || '[]');
    return Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : [];
  } catch { return []; }
}

export function mapCustomer(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseTags(row.tags),
    totalSpent: Number(row.totalSpent || 0),
    visitCount: Number(row.visitCount || 0),
    appointmentCount: row.appointmentCount == null ? undefined : Number(row.appointmentCount)
  };
}

const customerSelect = `
  SELECT c.id, c.name, c.phone, c.tier, c.preferences, c.allergies, c.notes, c.tags,
    c.total_spent AS totalSpent, c.visit_count AS visitCount, c.last_contact_at AS lastContactAt,
    c.created_at AS createdAt, c.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM appointments a WHERE a.customer_id = c.id AND a.status <> 'cancelled') AS appointmentCount,
    (SELECT MAX(a.date) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed') AS lastVisit,
    (SELECT MIN(a.date) FROM appointments a
      WHERE a.customer_id = c.id AND a.date >= ? AND a.status IN ('pending', 'confirmed', 'seated')) AS nextVisit,
    (SELECT COUNT(*) FROM payments p WHERE p.customer_id = c.id) AS paymentCount
  FROM customers c
`;

export function listCustomers(db, query = {}) {
  const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(5, Number.parseInt(String(query.pageSize || '50'), 10) || 50));
  const offset = (page - 1) * pageSize;
  const today = localDateString();
  const where = [];
  const params = [today];
  const search = String(query.search || '').trim();
  if (search) {
    where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.preferences LIKE ? OR c.allergies LIKE ? OR c.tags LIKE ? OR c.notes LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term);
  }
  if (TIERS.includes(String(query.tier || ''))) { where.push('c.tier = ?'); params.push(query.tier); }
  if (query.tag) { where.push('c.tags LIKE ?'); params.push(`%${String(query.tag)}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM customers c ${whereSql}`).get(...params.slice(1)).count);
  const sort = String(query.sort || 'recent');
  const orderBy = {
    spend: 'c.total_spent DESC, c.name ASC',
    visits: 'c.visit_count DESC, c.name ASC',
    name: 'c.name ASC',
    tier: "CASE c.tier WHEN 'vip' THEN 0 WHEN 'regular' THEN 1 ELSE 2 END, c.name ASC",
    recent: 'c.updated_at DESC'
  }[sort] || 'c.updated_at DESC';
  const items = db.prepare(`${customerSelect} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset).map(mapCustomer);
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function getCustomer(db, id) {
  return mapCustomer(db.prepare(`${customerSelect} WHERE c.id = ?`).get(localDateString(), id));
}

export function customerDetail(db, id) {
  const item = getCustomer(db, id);
  if (!item) throw notFound('客户');
  const appointments = db.prepare(`
    SELECT a.id, a.guest_name AS guestName, a.phone, a.date, a.time, a.party_size AS partySize,
      a.status, a.source, a.table_id AS tableId, a.combo_id AS comboId, a.notes,
      t.name AS tableName, cr.name AS comboName
    FROM appointments a LEFT JOIN dining_tables t ON t.id = a.table_id
    LEFT JOIN combo_rooms cr ON cr.id = a.combo_id
    WHERE a.customer_id = ? OR a.phone = ? ORDER BY a.date DESC, a.time DESC LIMIT 50
  `).all(id, item.phone);
  const calls = db.prepare(`
    SELECT id, contact_name AS contactName, phone, called_at AS calledAt, status, direction,
      duration_seconds AS durationSeconds, ai_summary AS aiSummary, ai_tags AS aiTags,
      appointment_id AS appointmentId, is_simulated AS isSimulated
    FROM calls WHERE customer_id = ? OR phone = ? ORDER BY called_at DESC LIMIT 50
  `).all(id, item.phone).map((row) => ({ ...row, aiTags: parseTags(row.aiTags), isSimulated: Boolean(row.isSimulated) }));
  const payments = db.prepare(`
    SELECT id, amount, method, note, receipt_ref AS receiptRef, paid_at AS paidAt, appointment_id AS appointmentId, created_at AS createdAt
    FROM payments WHERE customer_id = ? ORDER BY paid_at DESC, created_at DESC
  `).all(id).map((row) => ({ ...row, amount: Number(row.amount) }));
  const stats = {
    appointmentCount: appointments.filter((row) => row.status !== 'cancelled').length,
    completedCount: appointments.filter((row) => row.status === 'completed').length,
    noShowCount: appointments.filter((row) => row.status === 'no_show').length,
    cancelledCount: appointments.filter((row) => row.status === 'cancelled').length,
    lastVisit: appointments.find((row) => row.status === 'completed')?.date || null,
    nextVisit: [...appointments].reverse().find((row) => row.date >= localDateString() && ['pending', 'confirmed', 'seated'].includes(row.status))?.date || null,
    totalSpent: payments.reduce((sum, row) => sum + Number(row.amount), 0)
  };
  return { item, appointments, calls, payments, stats };
}

export function createCustomer(db, data) {
  const duplicate = db.prepare('SELECT id FROM customers WHERE phone = ?').get(data.phone);
  if (duplicate) throw new AppError('该手机号已存在于客户档案中', 409, 'PHONE_EXISTS');
  const now = localDateTime();
  const id = `cust_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.prepare(`
    INSERT INTO customers (id, name, phone, tier, preferences, allergies, notes, tags, total_spent, visit_count, last_contact_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
  `).run(
    id, data.name, data.phone, data.tier || 'new', data.preferences || '', data.allergies || '',
    data.notes || '', JSON.stringify(data.tags || []), now, now, now
  );
  return getCustomer(db, id);
}

export function updateCustomer(db, id, data) {
  const existing = getCustomer(db, id);
  if (!existing) throw notFound('客户');
  if (data.phone && data.phone !== existing.phone) {
    const duplicate = db.prepare('SELECT id FROM customers WHERE phone = ? AND id <> ?').get(data.phone, id);
    if (duplicate) throw new AppError('该手机号已存在于客户档案中', 409, 'PHONE_EXISTS');
  }
  const merged = {
    name: data.name ?? existing.name,
    phone: data.phone ?? existing.phone,
    tier: data.tier ?? existing.tier,
    preferences: data.preferences ?? existing.preferences,
    allergies: data.allergies ?? existing.allergies,
    notes: data.notes ?? existing.notes,
    tags: Object.prototype.hasOwnProperty.call(data, 'tags') ? data.tags : existing.tags
  };
  db.prepare(`
    UPDATE customers SET name = ?, phone = ?, tier = ?, preferences = ?, allergies = ?, notes = ?, tags = ?, updated_at = ?
    WHERE id = ?
  `).run(merged.name, merged.phone, merged.tier, merged.preferences, merged.allergies, merged.notes, JSON.stringify(merged.tags || []), localDateTime(), id);
  return getCustomer(db, id);
}

export function deleteCustomer(db, id) {
  const existing = getCustomer(db, id);
  if (!existing) throw notFound('客户');
  const active = db.prepare(`
    SELECT COUNT(*) AS count FROM appointments WHERE customer_id = ? AND status IN ('pending', 'confirmed', 'seated')
  `).get(id);
  if (Number(active.count) > 0) throw new AppError('该客户仍有未完成预约，不能删除；可先取消预约或合并客户', 409, 'CUSTOMER_HAS_ACTIVE_APPOINTMENTS');
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  return existing;
}

export function addPayment(db, customerId, data, actor) {
  const customer = getCustomer(db, customerId);
  if (!customer) throw notFound('客户');
  if (data.appointmentId) {
    const appointment = getAppointment(db, data.appointmentId);
    if (!appointment) throw notFound('预约');
  }
  const now = localDateTime();
  const id = `pay_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO payments (id, customer_id, appointment_id, amount, method, note, receipt_ref, paid_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, customerId, data.appointmentId || null, Number(data.amount), data.method || 'other',
      data.note || '', data.receiptRef || '', data.paidAt || now, actor?.id || null, now
    );
    db.prepare('UPDATE customers SET total_spent = total_spent + ?, updated_at = ? WHERE id = ?')
      .run(Number(data.amount), now, customerId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
}

export function mergeCustomers(db, sourceId, targetId) {
  if (sourceId === targetId) throw new AppError('不能将客户合并到自身', 400, 'INVALID_MERGE');
  const source = getCustomer(db, sourceId);
  const target = getCustomer(db, targetId);
  if (!source) throw notFound('源客户');
  if (!target) throw notFound('目标客户');
  const now = localDateTime();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE appointments SET customer_id = ? WHERE customer_id = ?').run(targetId, sourceId);
    db.prepare('UPDATE calls SET customer_id = ? WHERE customer_id = ?').run(targetId, sourceId);
    db.prepare('UPDATE walk_ins SET customer_id = ? WHERE customer_id = ?').run(targetId, sourceId);
    db.prepare('UPDATE payments SET customer_id = ? WHERE customer_id = ?').run(targetId, sourceId);
    const combinedTags = [...new Set([...(target.tags || []), ...(source.tags || [])])];
    const preferences = [target.preferences, source.preferences].filter(Boolean).join('；');
    const allergies = [target.allergies, source.allergies].filter(Boolean).join('；');
    const notes = [target.notes, source.notes].filter(Boolean).join('\n');
    const tierOrder = { new: 0, regular: 1, vip: 2 };
    const tier = tierOrder[source.tier] > tierOrder[target.tier] ? source.tier : target.tier;
    db.prepare(`
      UPDATE customers SET tags = ?, preferences = ?, allergies = ?, notes = ?, tier = ?,
        total_spent = total_spent + ?, visit_count = visit_count + ?, last_contact_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(combinedTags), preferences, allergies, notes, tier,
      Number(source.totalSpent || 0), Number(source.visitCount || 0),
      source.lastContactAt || target.lastContactAt || now, now, targetId
    );
    db.prepare('DELETE FROM customers WHERE id = ?').run(sourceId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getCustomer(db, targetId);
}
