import crypto from 'node:crypto';
import { AppError, notFound } from '../lib/errors.js';
import { localDateTime } from '../lib/time.js';
import { buildDialog, analyzeCall, scriptSuggestion, customerProfile, normalizeScenario } from '../adapters/ai.js';
import { createAppointment, getAppointment } from './appointments.js';

export const CALL_STATUSES = ['ringing', 'answered', 'completed', 'missed', 'follow_up'];

export const callSelect = `
  SELECT cl.id, cl.contact_name AS contactName, cl.phone, cl.customer_id AS customerId,
    cl.called_at AS calledAt, cl.answered_at AS answeredAt, cl.ended_at AS endedAt,
    cl.direction, cl.status, cl.duration_seconds AS durationSeconds, cl.recording_ref AS recordingRef,
    cl.transcript, cl.ai_summary AS aiSummary, cl.ai_tags AS aiTags, cl.ai_extracted AS aiExtracted,
    cl.keywords, cl.sentiment, cl.scenario, cl.follow_up AS followUp, cl.notes, cl.appointment_id AS appointmentId,
    cl.is_simulated AS isSimulated, cl.created_by AS createdBy, cl.created_at AS createdAt, cl.updated_at AS updatedAt,
    c.name AS customerName, c.tier AS customerTier, c.preferences AS customerPreferences,
    c.allergies AS customerAllergies, c.tags AS customerTags,
    a.guest_name AS linkedGuestName, a.date AS linkedDate, a.time AS linkedTime, a.status AS linkedStatus
  FROM calls cl
  LEFT JOIN customers c ON c.id = cl.customer_id
  LEFT JOIN appointments a ON a.id = cl.appointment_id
`;

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeCustomer(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseJson(row.tags, []),
    totalSpent: Number(row.total_spent || 0),
    visitCount: Number(row.visit_count || 0),
    lastContactAt: row.last_contact_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapCall(row) {
  if (!row) return null;
  return {
    ...row,
    durationSeconds: Number(row.durationSeconds || 0),
    followUp: Boolean(row.followUp),
    isSimulated: Boolean(row.isSimulated),
    aiTags: parseJson(row.aiTags, []),
    aiExtracted: parseJson(row.aiExtracted, {}),
    keywords: parseJson(row.keywords, []),
    customerTags: parseJson(row.customerTags, [])
  };
}

export function getCall(db, id) {
  return mapCall(db.prepare(`${callSelect} WHERE cl.id = ?`).get(id));
}

export function callDetail(db, id) {
  const item = getCall(db, id);
  if (!item) throw notFound('通话记录');
  const segments = db.prepare(`
    SELECT id, speaker, start_ms AS startMs, end_ms AS endMs, text, is_final AS isFinal
    FROM call_segments WHERE call_id = ? ORDER BY start_ms ASC
  `).all(id).map((row) => ({ ...row, isFinal: Boolean(row.isFinal) }));
  const customer = normalizeCustomer(item.customerId ? db.prepare('SELECT * FROM customers WHERE id = ?').get(item.customerId) : null);
  const appointment = item.appointmentId ? getAppointment(db, item.appointmentId) : null;
  return { item, segments, customer, appointment };
}

export function listCalls(db, query = {}) {
  const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(5, Number.parseInt(String(query.pageSize || '30'), 10) || 30));
  const offset = (page - 1) * pageSize;
  const where = [];
  const params = [];
  const search = String(query.search || '').trim();
  if (search) {
    where.push('(cl.contact_name LIKE ? OR cl.phone LIKE ? OR cl.ai_summary LIKE ? OR cl.transcript LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  if (CALL_STATUSES.includes(String(query.status || ''))) { where.push('cl.status = ?'); params.push(query.status); }
  if (['inbound', 'outbound'].includes(String(query.direction || ''))) { where.push('cl.direction = ?'); params.push(query.direction); }
  if (query.followUp === 'true' || query.followUp === 'false') { where.push('cl.follow_up = ?'); params.push(query.followUp === 'true' ? 1 : 0); }
  if (query.simulated === 'true' || query.simulated === 'false') { where.push('cl.is_simulated = ?'); params.push(query.simulated === 'true' ? 1 : 0); }
  if (query.customerId) { where.push('cl.customer_id = ?'); params.push(query.customerId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM calls cl ${whereSql}`).get(...params).count);
  const items = db.prepare(`${callSelect} ${whereSql} ORDER BY cl.called_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset).map(mapCall);
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function createManualCall(db, data, actor) {
  const now = localDateTime();
  const id = `call_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  if (data.appointmentId && !getAppointment(db, data.appointmentId)) {
    throw new AppError('关联的预约不存在', 422, 'APPOINTMENT_NOT_FOUND');
  }
  if (data.customerId && !db.prepare('SELECT id FROM customers WHERE id = ?').get(data.customerId)) {
    throw new AppError('关联的客户不存在', 422, 'CUSTOMER_NOT_FOUND');
  }
  const customer = data.customerId
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(data.customerId)
    : db.prepare('SELECT * FROM customers WHERE phone = ?').get(data.phone);
  db.prepare(`
    INSERT INTO calls
      (id, contact_name, phone, customer_id, called_at, answered_at, ended_at, direction, status,
       duration_seconds, transcript, ai_summary, ai_tags, ai_extracted, keywords, sentiment, scenario,
       follow_up, notes, appointment_id, is_simulated, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.contactName, data.phone, customer?.id || null, data.calledAt || now,
    data.answeredAt || now, data.endedAt || now, data.direction || 'inbound', data.status || 'completed',
    Number(data.durationSeconds || 0), data.transcript || '', data.aiSummary || '', JSON.stringify(data.aiTags || []),
    JSON.stringify(data.aiExtracted || {}), JSON.stringify(data.keywords || []), data.sentiment || '',
    normalizeScenario(data.scenario), data.followUp ? 1 : 0, data.notes || '', data.appointmentId || null,
    data.isSimulated ? 1 : 0, actor?.id || null, now, now
  );
  return getCall(db, id);
}

export function updateCall(db, id, data) {
  const existing = getCall(db, id);
  if (!existing) throw notFound('通话记录');
  if (data.appointmentId) {
    const appointment = getAppointment(db, data.appointmentId);
    if (!appointment) throw notFound('关联预约');
  }
  const merged = {
    contactName: data.contactName ?? existing.contactName,
    phone: data.phone ?? existing.phone,
    status: data.status ?? existing.status,
    followUp: data.followUp ?? existing.followUp,
    appointmentId: Object.prototype.hasOwnProperty.call(data, 'appointmentId') ? (data.appointmentId || null) : existing.appointmentId,
    transcript: data.transcript ?? existing.transcript,
    aiSummary: data.aiSummary ?? existing.aiSummary,
    aiTags: data.aiTags ?? existing.aiTags,
    aiExtracted: data.aiExtracted ?? existing.aiExtracted,
    keywords: data.keywords ?? existing.keywords,
    sentiment: data.sentiment ?? existing.sentiment,
    notes: data.notes ?? existing.notes
  };
  let customerId = existing.customerId;
  if (Object.prototype.hasOwnProperty.call(data, 'customerId')) {
    if (data.customerId) {
      const explicit = db.prepare('SELECT id FROM customers WHERE id = ?').get(data.customerId);
      if (!explicit) throw new AppError('关联的客户不存在', 422, 'CUSTOMER_NOT_FOUND');
      customerId = explicit.id;
    } else {
      customerId = null;
    }
  } else if (data.phone && data.phone !== existing.phone) {
    // 电话变更后重新匹配客户；未匹配到则不保留旧客户关联。
    const matched = db.prepare('SELECT id FROM customers WHERE phone = ?').get(merged.phone);
    customerId = matched?.id || null;
  }
  db.prepare(`
    UPDATE calls SET contact_name = ?, phone = ?, customer_id = ?, status = ?, follow_up = ?, appointment_id = ?,
      transcript = ?, ai_summary = ?, ai_tags = ?, ai_extracted = ?, keywords = ?, sentiment = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    merged.contactName, merged.phone, customerId, merged.status, merged.followUp ? 1 : 0,
    merged.appointmentId, merged.transcript, merged.aiSummary, JSON.stringify(merged.aiTags),
    JSON.stringify(merged.aiExtracted), JSON.stringify(merged.keywords), merged.sentiment, merged.notes || '', localDateTime(), id
  );
  return getCall(db, id);
}

export function deleteCall(db, id) {
  const existing = getCall(db, id);
  if (!existing) throw notFound('通话记录');
  db.prepare('DELETE FROM calls WHERE id = ?').run(id);
  return existing;
}

export function simulateIncoming(db, data, actor) {
  const phone = String(data.phone || '').replace(/\D/g, '');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new AppError('请输入有效的 11 位手机号码', 400, 'VALIDATION_ERROR');
  const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  const scenario = normalizeScenario(data.scenario);
  const now = localDateTime();
  const id = `call_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.prepare(`
    INSERT INTO calls
      (id, contact_name, phone, customer_id, called_at, direction, status, scenario, is_simulated, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'inbound', 'ringing', ?, 1, ?, ?, ?)
  `).run(id, data.contactName || customer?.name || '模拟来电客户', phone, customer?.id || null, now, scenario, actor?.id || null, now, now);
  return {
    item: getCall(db, id),
    customer: normalizeCustomer(customer),
    script: scriptSuggestion(customer, scenario)
  };
}

export function answerCall(db, id) {
  const existing = getCall(db, id);
  if (!existing) throw notFound('通话记录');
  if (!['ringing', 'follow_up'].includes(existing.status)) throw new AppError('当前通话状态不能接听', 409, 'INVALID_CALL_STATUS');
  db.prepare('UPDATE calls SET status = ?, answered_at = ?, updated_at = ? WHERE id = ?')
    .run('answered', localDateTime(), localDateTime(), id);
  return getCall(db, id);
}

export function hangupCall(db, id, { durationSeconds } = {}) {
  const existing = getCall(db, id);
  if (!existing) throw notFound('通话记录');
  const segments = db.prepare('SELECT MAX(end_ms) AS endMs FROM call_segments WHERE call_id = ?').get(id);
  const duration = Number(durationSeconds || Math.round(Number(segments?.endMs || 0) / 1000) || existing.durationSeconds || 0);
  db.prepare('UPDATE calls SET status = ?, ended_at = ?, duration_seconds = ?, updated_at = ? WHERE id = ?')
    .run('completed', localDateTime(), duration, localDateTime(), id);
  return getCall(db, id);
}

export function generateTranscript(db, id, { scenario } = {}) {
  const existing = getCall(db, id);
  if (!existing) throw notFound('通话记录');
  const customer = existing.customerId ? db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.customerId) : null;
  const normalizedCustomer = normalizeCustomer(customer);
  const activeScenario = normalizeScenario(scenario || existing.scenario);
  const extracted = existing.aiExtracted || {};
  const segments = buildDialog(normalizedCustomer, activeScenario, {
    phone: existing.phone,
    date: extracted.date,
    time: extracted.time,
    partySize: extracted.partySize
  });
  const transcript = segments.map((segment) => `${segment.speaker === 'customer' ? '客户' : '坐席'}：${segment.text}`).join('\n');
  const now = localDateTime();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM call_segments WHERE call_id = ?').run(id);
    const statement = db.prepare(`
      INSERT INTO call_segments (id, call_id, speaker, start_ms, end_ms, text, is_final, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    for (const segment of segments) {
      statement.run(
        `${id}_seg_${segment.index}_${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`,
        id, segment.speaker, segment.startMs, segment.endMs, segment.text, now
      );
    }
    db.prepare(`
      UPDATE calls SET status = CASE WHEN status = 'ringing' THEN 'answered' ELSE status END,
        answered_at = CASE WHEN answered_at = '' THEN ? ELSE answered_at END,
        transcript = ?, scenario = ?, updated_at = ? WHERE id = ?
    `).run(now, transcript, activeScenario, now, id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return callDetail(db, id);
}

export function analyzeCallRecord(db, id) {
  let detail = callDetail(db, id);
  if (!detail.item.transcript) detail = generateTranscript(db, id);
  const existing = detail.item;
  const customer = normalizeCustomer(detail.customer);
  const analysis = analyzeCall({
    customer,
    transcript: existing.transcript,
    scenario: existing.scenario,
    context: { phone: existing.phone, ...existing.aiExtracted }
  });
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE calls SET ai_summary = ?, ai_tags = ?, ai_extracted = ?, keywords = ?, sentiment = ?, updated_at = ?
      WHERE id = ?
    `).run(
      analysis.summary, JSON.stringify(analysis.tags), JSON.stringify(analysis.extracted),
      JSON.stringify(analysis.keywords), analysis.sentiment, localDateTime(), id
    );
    if (analysis.keywords.some((keyword) => keyword.level === 'high')) {
      // 同一通话只保留一条高风险跟进提醒，避免重复分析产生重复通知。
      const existingNotice = db.prepare(
        "SELECT id FROM notifications WHERE entity_type = 'call' AND entity_id = ? AND title = '通话需要重点跟进' LIMIT 1"
      ).get(id);
      if (!existingNotice) {
        db.prepare(`
          INSERT INTO notifications (id, type, title, body, entity_type, entity_id, read, created_at)
          VALUES (?, 'warning', ?, ?, 'call', ?, 0, ?)
        `).run(
          `notif_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
          '通话需要重点跟进', `${existing.contactName}：${analysis.summary}`, id, localDateTime()
        );
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const noShowCount = customer ? Number(db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE customer_id = ? AND status = 'no_show'").get(customer.id).count) : 0;
  const profile = customerProfile(customer, {
    totalSpent: customer?.totalSpent,
    noShowCount
  });
  return { call: getCall(db, id), analysis: { ...analysis, profile } };
}

export function createAppointmentFromCall(db, id, data, actor, { allowOverride = false } = {}) {
  const existing = getCall(db, id);
  if (!existing) throw notFound('通话记录');
  const extracted = existing.aiExtracted || {};
  const payload = {
    guestName: data.guestName || extracted.guestName || existing.contactName,
    phone: data.phone || extracted.phone || existing.phone,
    date: data.date || extracted.date,
    time: data.time || extracted.time,
    partySize: Number(data.partySize || extracted.partySize || 2),
    tableId: data.tableId || null,
    comboId: data.comboId || null,
    source: 'phone',
    status: data.status || 'confirmed',
    occasion: data.occasion || extracted.occasion || '',
    notes: data.notes || extracted.notes || '',
    customerId: existing.customerId || extracted.customerId || null,
    overrideConflict: Boolean(data.overrideConflict)
  };
  if (!payload.date || !payload.time) throw new AppError('缺少预约日期或时间，请先完成 AI 提取或手动补充', 422, 'MISSING_APPOINTMENT_FIELDS');
  if (!payload.tableId && !payload.comboId) {
    const tables = db.prepare(`
      SELECT id, capacity FROM dining_tables WHERE active = 1 AND status = 'available' AND capacity >= ?
      ORDER BY capacity ASC, name ASC
    `).all(payload.partySize);
    if (tables.length) payload.tableId = tables[0].id;
  }
  const result = createAppointment(db, payload, actor, { allowOverride });
  db.prepare('UPDATE calls SET appointment_id = ?, customer_id = ?, updated_at = ? WHERE id = ?')
    .run(result.item.id, result.item.customerId, localDateTime(), id);
  return { call: getCall(db, id), appointment: result.item, conflicts: result.conflicts, overridden: result.overridden };
}

export function linkAppointment(db, id, appointmentId) {
  const call = getCall(db, id);
  if (!call) throw notFound('通话记录');
  const appointment = appointmentId ? getAppointment(db, appointmentId) : null;
  if (appointmentId && !appointment) throw notFound('预约');
  // 关联预约时同步客户：通话尚未绑定客户而预约已匹配客户时补齐；解除关联时保留原客户。
  const customerId = call.customerId || appointment?.customerId || null;
  db.prepare('UPDATE calls SET appointment_id = ?, customer_id = ?, updated_at = ? WHERE id = ?')
    .run(appointmentId || null, customerId, localDateTime(), id);
  return getCall(db, id);
}

export function simulateRecording(db, id) {
  const call = getCall(db, id);
  if (!call) throw notFound('通话记录');
  const ref = `simulated://callflow/recording/${id}`;
  db.prepare('UPDATE calls SET recording_ref = ?, updated_at = ? WHERE id = ?').run(ref, localDateTime(), id);
  return { ...getCall(db, id), recording: { simulated: true, ref, note: '模拟录音占位，不包含真实音频文件。' } };
}

export function callStats(db) {
  const today = localDateTime().slice(0, 10);
  const rows = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN substr(called_at, 1, 10) = ? THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN follow_up = 1 THEN 1 ELSE 0 END) AS followUp,
      SUM(CASE WHEN is_simulated = 1 THEN 1 ELSE 0 END) AS simulated,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
    FROM calls
  `).get(today);
  return {
    total: Number(rows.total || 0), today: Number(rows.today || 0), followUp: Number(rows.followUp || 0),
    simulated: Number(rows.simulated || 0), completed: Number(rows.completed || 0)
  };
}
