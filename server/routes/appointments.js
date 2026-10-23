import express from 'express';
import { AppError, notFound } from '../lib/errors.js';
import { hasPermission, audit, requirePermission } from '../auth.js';
import { parseBody, appointmentCreateSchema, appointmentUpdateSchema, statusSchema, dateSchema, timeSchema, phoneSchema } from '../lib/schemas.js';
import { getSettings } from '../domain/settings.js';
import { timeToMinutes } from '../lib/time.js';
import {
  listAppointments, appointmentDetail, createAppointment, updateAppointment,
  changeStatus, deleteAppointment, findConflicts, findNearbySlots, canTransition, STATUSES
} from '../domain/appointments.js';
import { z } from 'zod';

const checkSchema = z.object({
  date: dateSchema,
  time: timeSchema,
  partySize: z.coerce.number().int().min(1).max(50).default(2),
  tableId: z.string().trim().max(80).nullable().optional(),
  comboId: z.string().trim().max(80).nullable().optional(),
  excludeId: z.string().trim().max(80).optional()
});

function validateTimeSlot(db, time) {
  const settings = getSettings(db);
  if (!settings.enforce_time_slots) return;
  const slots = db.prepare('SELECT start_time AS startTime, end_time AS endTime FROM time_slots WHERE active = 1').all();
  if (!slots.length) return;
  const minutes = timeToMinutes(time);
  const inside = slots.some((slot) => minutes >= timeToMinutes(slot.startTime) && minutes <= timeToMinutes(slot.endTime));
  if (!inside) {
    throw new AppError(`当前启用了时段限制，${time} 不在可预约时段内`, 422, 'OUTSIDE_TIME_SLOT', {
      slots: slots.map((slot) => `${slot.startTime}-${slot.endTime}`)
    });
  }
}

export function appointmentRoutes({ db }) {
  const router = express.Router();

  router.get('/', requirePermission('appointments:read'), (req, res) => {
    res.json(listAppointments(db, req.query));
  });

  router.post('/check', requirePermission('appointments:read'), (req, res) => {
    const data = parseBody(checkSchema, req.body);
    const settings = getSettings(db);
    const windowMinutes = Number(settings.conflict_window_minutes || 90);
    res.json({
      conflicts: findConflicts(db, { ...data, windowMinutes }),
      nearbySlots: findNearbySlots(db, { ...data, windowMinutes }),
      windowMinutes
    });
  });

  router.get('/:id', requirePermission('appointments:read'), (req, res) => {
    res.json(appointmentDetail(db, req.params.id));
  });

  router.post('/', requirePermission('appointments:write'), (req, res) => {
    const parsed = parseBody(appointmentCreateSchema, req.body);
    validateTimeSlot(db, parsed.time);
    const settings = getSettings(db);
    const allowOverride = hasPermission(req.user, 'appointments:override');
    if (parsed.overrideConflict && !allowOverride) throw new AppError('当前角色没有覆盖冲突的权限', 403, 'FORBIDDEN');
    const statusExplicit = Object.prototype.hasOwnProperty.call(req.body || {}, 'status') && Boolean(req.body.status);
    // auto_confirm 仅作用于未显式指定状态的电话来源预约。
    const status = !statusExplicit && settings.auto_confirm && parsed.source === 'phone' ? 'confirmed' : parsed.status;
    const result = createAppointment(db, {
      ...parsed,
      status,
      conflictWindowMinutes: Number(settings.conflict_window_minutes || 90)
    }, req.user, { allowOverride });
    audit(db, req, { action: result.overridden ? 'appointment.override_create' : 'appointment.create', entityType: 'appointment', entityId: result.item.id, detail: `${result.item.guestName} ${result.item.date} ${result.item.time}` });
    res.status(201).json(result);
  });

  router.patch('/:id', requirePermission('appointments:write'), (req, res) => {
    const parsed = parseBody(appointmentUpdateSchema, req.body);
    if (parsed.time) validateTimeSlot(db, parsed.time);
    const allowOverride = hasPermission(req.user, 'appointments:override');
    if (parsed.overrideConflict && !allowOverride) throw new AppError('当前角色没有覆盖冲突的权限', 403, 'FORBIDDEN');
    const force = Boolean(req.body.force) && hasPermission(req.user, 'appointments:override');
    const settings = getSettings(db);
    const result = updateAppointment(db, req.params.id, parsed, req.user, {
      allowOverride, force,
      conflictWindowMinutes: Number(settings.conflict_window_minutes || 90)
    });
    audit(db, req, { action: 'appointment.update', entityType: 'appointment', entityId: req.params.id, detail: result.item.guestName });
    res.json(result);
  });

  router.patch('/:id/status', requirePermission('appointments:write'), (req, res) => {
    const data = parseBody(statusSchema, req.body);
    const force = data.force && hasPermission(req.user, 'appointments:override');
    if (data.force && !force) throw new AppError('当前角色没有强制流转状态的权限', 403, 'FORBIDDEN');
    const item = changeStatus(db, req.params.id, data.status, req.user, data.note, { force });
    audit(db, req, { action: 'appointment.status', entityType: 'appointment', entityId: item.id, detail: `${item.guestName} -> ${item.status}` });
    res.json({ item });
  });

  router.delete('/:id', requirePermission('appointments:delete'), (req, res) => {
    const item = deleteAppointment(db, req.params.id);
    audit(db, req, { action: 'appointment.delete', entityType: 'appointment', entityId: item.id, detail: item.guestName });
    res.json({ ok: true, item });
  });

  return router;
}
