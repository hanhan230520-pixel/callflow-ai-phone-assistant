import express from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { audit, requirePermission } from '../auth.js';
import { localDateString, localDateTime, timeToMinutes } from '../lib/time.js';
import { parseBody, areaSchema, tableSchema, tableUpdateSchema, comboSchema, timeSchema } from '../lib/schemas.js';

const slotSchema = z.object({
  name: z.string().trim().min(1).max(40),
  startTime: timeSchema,
  endTime: timeSchema,
  sortOrder: z.coerce.number().int().optional().default(0),
  active: z.boolean().optional().default(true)
});

function validateSlotRange(startTime, endTime) {
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new AppError('时段结束时间必须晚于开始时间', 422, 'INVALID_TIME_RANGE', { startTime, endTime });
  }
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

export function layoutData(db, date = localDateString()) {
  const areas = db.prepare('SELECT id, name, sort_order AS sortOrder FROM areas ORDER BY sort_order, name').all();
  const tables = db.prepare(`
    SELECT t.id, t.name, t.area_id AS areaId, t.capacity, t.shape, t.x, t.y, t.status,
      t.combo_group AS comboGroup, t.active,
      (SELECT a.id FROM appointments a WHERE a.date = ? AND a.status = 'seated'
        AND (a.table_id = t.id OR a.combo_id IN (SELECT ct.combo_id FROM combo_room_tables ct WHERE ct.table_id = t.id))
        ORDER BY a.time LIMIT 1) AS seatedAppointmentId,
      (SELECT a.id FROM appointments a WHERE a.date = ? AND a.status IN ('pending', 'confirmed')
        AND (a.table_id = t.id OR a.combo_id IN (SELECT ct.combo_id FROM combo_room_tables ct WHERE ct.table_id = t.id))
        ORDER BY a.time LIMIT 1) AS bookedAppointmentId,
      (SELECT a.guest_name FROM appointments a WHERE a.date = ? AND a.status IN ('pending', 'confirmed', 'seated')
        AND (a.table_id = t.id OR a.combo_id IN (SELECT ct.combo_id FROM combo_room_tables ct WHERE ct.table_id = t.id))
        ORDER BY a.time LIMIT 1) AS guestName,
      (SELECT a.time FROM appointments a WHERE a.date = ? AND a.status IN ('pending', 'confirmed', 'seated')
        AND (a.table_id = t.id OR a.combo_id IN (SELECT ct.combo_id FROM combo_room_tables ct WHERE ct.table_id = t.id))
        ORDER BY a.time LIMIT 1) AS appointmentTime
    FROM dining_tables t ORDER BY t.name
  `).all(date, date, date, date).map((row) => ({ ...row, active: Boolean(row.active) }));
  const combos = db.prepare('SELECT id, name, capacity, notes, active FROM combo_rooms ORDER BY name')
    .all().map((row) => ({ ...row, active: Boolean(row.active), tableIds: db.prepare('SELECT table_id AS tableId FROM combo_room_tables WHERE combo_id = ?').all(row.id).map((item) => item.tableId) }));
  const slots = db.prepare('SELECT id, name, start_time AS startTime, end_time AS endTime, sort_order AS sortOrder, active FROM time_slots ORDER BY sort_order, start_time')
    .all().map((row) => ({ ...row, active: Boolean(row.active) }));
  return { date, areas, tables, combos, slots };
}

export function tableRoutes({ db }) {
  const router = express.Router();
  router.get('/', requirePermission('tables:read'), (req, res) => {
    res.json(layoutData(db, req.query.date || localDateString()));
  });

  router.post('/areas', requirePermission('tables:write'), (req, res) => {
    const data = parseBody(areaSchema, req.body);
    const id = newId('area');
    db.prepare('INSERT INTO areas (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)')
      .run(id, data.name, data.sortOrder || 0, localDateTime());
    audit(db, req, { action: 'area.create', entityType: 'area', entityId: id, detail: data.name });
    res.status(201).json({ id });
  });
  router.patch('/areas/:id', requirePermission('tables:write'), (req, res) => {
    const data = parseBody(areaSchema.partial(), req.body);
    const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('区域');
    db.prepare('UPDATE areas SET name = ?, sort_order = ? WHERE id = ?')
      .run(data.name ?? existing.name, data.sortOrder ?? existing.sort_order, req.params.id);
    audit(db, req, { action: 'area.update', entityType: 'area', entityId: req.params.id, detail: data.name ?? existing.name });
    res.json({ ok: true });
  });
  router.delete('/areas/:id', requirePermission('tables:write'), (req, res) => {
    const existing = db.prepare('SELECT * FROM areas WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('区域');
    db.prepare('DELETE FROM areas WHERE id = ?').run(req.params.id);
    audit(db, req, { action: 'area.delete', entityType: 'area', entityId: req.params.id, detail: existing.name });
    res.json({ ok: true });
  });

  router.post('/tables', requirePermission('tables:write'), (req, res) => {
    const data = parseBody(tableSchema, req.body);
    const id = newId('table');
    const now = localDateTime();
    db.prepare(`
      INSERT INTO dining_tables (id, name, area_id, capacity, shape, x, y, status, combo_group, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.areaId || null, data.capacity, data.shape, data.x, data.y, data.status, data.comboGroup || '', data.active ? 1 : 0, now, now);
    audit(db, req, { action: 'table.create', entityType: 'table', entityId: id, detail: data.name });
    res.status(201).json({ id });
  });
  router.patch('/tables/:id', requirePermission('tables:write'), (req, res) => {
    const data = parseBody(tableUpdateSchema, req.body);
    const existing = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('桌台');
    if (data.capacity != null) {
      // 同时检查直接预约与该桌台所属组合包间的未完成预约，避免缩小容量后无法容纳现有预约。
      const largest = db.prepare(`
        SELECT MAX(party_size) AS maxParty FROM appointments
        WHERE status IN ('pending', 'confirmed', 'seated')
          AND (table_id = ? OR combo_id IN (SELECT combo_id FROM combo_room_tables WHERE table_id = ?))
      `).get(req.params.id, req.params.id);
      if (largest?.maxParty != null && Number(data.capacity) < Number(largest.maxParty)) {
        throw new AppError(`该桌台仍有 ${largest.maxParty} 人的未完成预约，容量不能降到 ${data.capacity} 人`, 422, 'CAPACITY_BELOW_ACTIVE_APPOINTMENT', { maxParty: Number(largest.maxParty) });
      }
    }
    db.prepare(`
      UPDATE dining_tables SET name = ?, area_id = ?, capacity = ?, shape = ?, x = ?, y = ?, status = ?,
        combo_group = ?, active = ?, updated_at = ? WHERE id = ?
    `).run(
      data.name ?? existing.name,
      Object.prototype.hasOwnProperty.call(data, 'areaId') ? (data.areaId || null) : existing.area_id,
      data.capacity ?? existing.capacity, data.shape ?? existing.shape,
      data.x ?? existing.x, data.y ?? existing.y, data.status ?? existing.status,
      data.comboGroup ?? existing.combo_group,
      data.active == null ? existing.active : (data.active ? 1 : 0),
      localDateTime(), req.params.id
    );
    audit(db, req, { action: 'table.update', entityType: 'table', entityId: req.params.id, detail: data.name || existing.name });
    res.json({ ok: true });
  });
  router.delete('/tables/:id', requirePermission('tables:write'), (req, res) => {
    const existing = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('桌台');
    const active = db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE table_id = ? AND status IN ('pending','confirmed','seated')").get(req.params.id);
    if (Number(active.count) > 0) throw new AppError('该桌台仍有未完成预约，不能删除', 409, 'TABLE_IN_USE');
    const combo = db.prepare(`
      SELECT c.id, c.name FROM combo_room_tables ct JOIN combo_rooms c ON c.id = ct.combo_id
      WHERE ct.table_id = ?
    `).get(req.params.id);
    if (combo) throw new AppError(`该桌台属于组合包间「${combo.name}」，请先调整或删除组合包间`, 409, 'TABLE_IN_COMBO', { comboId: combo.id });
    db.prepare('DELETE FROM dining_tables WHERE id = ?').run(req.params.id);
    audit(db, req, { action: 'table.delete', entityType: 'table', entityId: req.params.id, detail: existing.name });
    res.json({ ok: true });
  });

  router.post('/combos', requirePermission('tables:write'), (req, res) => {
    const data = parseBody(comboSchema, req.body);
    const tableIds = [...new Set(data.tableIds)];
    // 去重后仍需满足两张桌台，避免重复 ID 绕过组合包间的最小桌台数。
    if (tableIds.length < 2) throw new AppError('组合包间至少需要选择两张不同的桌台', 422, 'INVALID_TABLE_SELECTION');
    const tables = db.prepare(`SELECT id, capacity FROM dining_tables WHERE id IN (${tableIds.map(() => '?').join(',')})`).all(...tableIds);
    if (tables.length !== tableIds.length) throw new AppError('包含不存在的桌台', 422, 'INVALID_TABLE_SELECTION');
    const capacity = data.capacity || tables.reduce((sum, table) => sum + Number(table.capacity), 0);
    const id = newId('combo');
    const now = localDateTime();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO combo_rooms (id, name, capacity, notes, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, data.name, capacity, data.notes || '', data.active ? 1 : 0, now, now);
      const link = db.prepare('INSERT INTO combo_room_tables (combo_id, table_id) VALUES (?, ?)');
      for (const table of tables) link.run(id, table.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    audit(db, req, { action: 'combo.create', entityType: 'combo', entityId: id, detail: data.name });
    res.status(201).json({ id, capacity });
  });
  router.patch('/combos/:id', requirePermission('tables:write'), (req, res) => {
    const data = parseBody(comboSchema.partial(), req.body);
    const existing = db.prepare('SELECT * FROM combo_rooms WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('组合包间');
    let capacity = data.capacity ?? existing.capacity;
    let tableIds = null;
    if (Array.isArray(data.tableIds)) {
      tableIds = [...new Set(data.tableIds)];
      if (tableIds.length < 2) throw new AppError('组合包间至少需要选择两张不同的桌台', 422, 'INVALID_TABLE_SELECTION');
      const tables = db.prepare(`SELECT id, capacity FROM dining_tables WHERE id IN (${tableIds.map(() => '?').join(',')})`).all(...tableIds);
      if (tables.length !== tableIds.length) throw new AppError('包含不存在的桌台', 422, 'INVALID_TABLE_SELECTION');
      const active = db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE combo_id = ? AND status IN ('pending','confirmed','seated')").get(req.params.id);
      if (Number(active.count) > 0) throw new AppError('该组合包间仍有未完成预约，不能调整桌台组合', 409, 'COMBO_IN_USE');
      if (data.capacity == null) capacity = tables.reduce((sum, table) => sum + Number(table.capacity), 0);
    }
    if (data.capacity != null) {
      const largest = db.prepare(`
        SELECT MAX(party_size) AS maxParty FROM appointments
        WHERE combo_id = ? AND status IN ('pending', 'confirmed', 'seated')
      `).get(req.params.id);
      if (largest?.maxParty != null && Number(capacity) < Number(largest.maxParty)) {
        throw new AppError(`该组合包间仍有 ${largest.maxParty} 人的未完成预约，容量不能降到 ${capacity} 人`, 422, 'CAPACITY_BELOW_ACTIVE_APPOINTMENT', { maxParty: Number(largest.maxParty) });
      }
    }
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE combo_rooms SET name = ?, capacity = ?, notes = ?, active = ?, updated_at = ? WHERE id = ?')
        .run(data.name ?? existing.name, capacity, data.notes ?? existing.notes,
          data.active == null ? existing.active : (data.active ? 1 : 0), localDateTime(), req.params.id);
      if (tableIds) {
        db.prepare('DELETE FROM combo_room_tables WHERE combo_id = ?').run(req.params.id);
        const link = db.prepare('INSERT INTO combo_room_tables (combo_id, table_id) VALUES (?, ?)');
        for (const tableId of tableIds) link.run(req.params.id, tableId);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    audit(db, req, { action: 'combo.update', entityType: 'combo', entityId: req.params.id, detail: data.name ?? existing.name });
    res.json({ ok: true, capacity });
  });
  router.delete('/combos/:id', requirePermission('tables:write'), (req, res) => {
    const existing = db.prepare('SELECT * FROM combo_rooms WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('组合包间');
    const active = db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE combo_id = ? AND status IN ('pending','confirmed','seated')").get(req.params.id);
    if (Number(active.count) > 0) throw new AppError('该组合包间仍有未完成预约，不能删除', 409, 'COMBO_IN_USE');
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM combo_room_tables WHERE combo_id = ?').run(req.params.id);
      db.prepare('DELETE FROM combo_rooms WHERE id = ?').run(req.params.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    audit(db, req, { action: 'combo.delete', entityType: 'combo', entityId: req.params.id, detail: existing.name });
    res.json({ ok: true });
  });

  router.post('/slots', requirePermission('tables:write'), (req, res) => {
    const data = parseBody(slotSchema, req.body);
    validateSlotRange(data.startTime, data.endTime);
    const id = newId('slot');
    db.prepare('INSERT INTO time_slots (id, name, start_time, end_time, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, data.name, data.startTime, data.endTime, data.sortOrder, data.active ? 1 : 0);
    audit(db, req, { action: 'slot.create', entityType: 'slot', entityId: id, detail: `${data.name} ${data.startTime}-${data.endTime}` });
    res.status(201).json({ id });
  });
  router.patch('/slots/:id', requirePermission('tables:write'), (req, res) => {
    const data = parseBody(slotSchema.partial(), req.body);
    const existing = db.prepare('SELECT * FROM time_slots WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('时段');
    const startTime = data.startTime ?? existing.start_time;
    const endTime = data.endTime ?? existing.end_time;
    validateSlotRange(startTime, endTime);
    db.prepare('UPDATE time_slots SET name = ?, start_time = ?, end_time = ?, sort_order = ?, active = ? WHERE id = ?')
      .run(data.name ?? existing.name, startTime, endTime,
        data.sortOrder ?? existing.sort_order, data.active == null ? existing.active : (data.active ? 1 : 0), req.params.id);
    audit(db, req, { action: 'slot.update', entityType: 'slot', entityId: req.params.id, detail: `${data.name ?? existing.name} ${startTime}-${endTime}` });
    res.json({ ok: true });
  });
  router.delete('/slots/:id', requirePermission('tables:write'), (req, res) => {
    const existing = db.prepare('SELECT * FROM time_slots WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('时段');
    db.prepare('DELETE FROM time_slots WHERE id = ?').run(req.params.id);
    audit(db, req, { action: 'slot.delete', entityType: 'slot', entityId: req.params.id, detail: existing.name });
    res.json({ ok: true });
  });

  return router;
}
