import express from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { audit, hasPermission, requirePermission } from '../auth.js';
import { parseBody, walkInCreateSchema, walkInUpdateSchema, optionalPhoneSchema, dateSchema, timeSchema } from '../lib/schemas.js';
import { listWalkIns, createWalkIn, updateWalkIn, deleteWalkIn, convertWalkIn } from '../domain/walkins.js';

const convertSchema = z.object({
  guestName: z.string().trim().max(60).optional(),
  phone: optionalPhoneSchema,
  date: dateSchema.optional(),
  time: timeSchema.optional(),
  partySize: z.coerce.number().int().min(1).max(50).optional(),
  tableId: z.string().trim().max(80).nullable().optional(),
  comboId: z.string().trim().max(80).nullable().optional(),
  occasion: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  overrideConflict: z.boolean().optional().default(false)
});

export function walkInRoutes({ db }) {
  const router = express.Router();
  router.get('/', requirePermission('walkins:read'), (req, res) => res.json(listWalkIns(db, req.query)));
  router.post('/', requirePermission('walkins:write'), (req, res) => {
    const data = parseBody(walkInCreateSchema, req.body);
    const item = createWalkIn(db, data, req.user);
    audit(db, req, { action: 'walkin.create', entityType: 'walkin', entityId: item.id, detail: item.name });
    res.status(201).json({ item });
  });
  router.patch('/:id', requirePermission('walkins:write'), (req, res) => {
    const data = parseBody(walkInUpdateSchema, req.body);
    const item = updateWalkIn(db, req.params.id, data);
    audit(db, req, { action: 'walkin.update', entityType: 'walkin', entityId: item.id, detail: item.name });
    res.json({ item });
  });
  router.delete('/:id', requirePermission('walkins:write'), (req, res) => {
    const item = deleteWalkIn(db, req.params.id);
    audit(db, req, { action: 'walkin.delete', entityType: 'walkin', entityId: item.id, detail: item.name });
    res.json({ ok: true, item });
  });
  router.post('/:id/convert', requirePermission('appointments:write'), (req, res) => {
    const data = parseBody(convertSchema, req.body || {});
    const allowOverride = hasPermission(req.user, 'appointments:override');
    if (data.overrideConflict && !allowOverride) throw new AppError('当前角色没有覆盖冲突的权限', 403, 'FORBIDDEN');
    const result = convertWalkIn(db, req.params.id, req.user, data);
    audit(db, req, { action: 'walkin.convert', entityType: 'walkin', entityId: req.params.id, detail: result.appointment?.id || '' });
    res.status(201).json(result);
  });
  return router;
}
