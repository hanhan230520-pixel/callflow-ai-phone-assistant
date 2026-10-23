import express from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { audit, requirePermission } from '../auth.js';
import { parseBody } from '../lib/schemas.js';
import { localDateTime } from '../lib/time.js';

const markSchema = z.object({ ids: z.array(z.string().trim().min(1)).max(200).optional() });

export function notificationRoutes({ db }) {
  const router = express.Router();

  router.get('/', requirePermission('notifications:read'), (req, res) => {
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(5, Number.parseInt(String(req.query.pageSize || '30'), 10) || 30));
    const where = [];
    const params = [];
    if (req.query.unread === 'true') where.push('read = 0');
    if (req.query.type) { where.push('type = ?'); params.push(String(req.query.type)); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM notifications ${whereSql}`).get(...params).count);
    const items = db.prepare(`
      SELECT id, type, title, body, entity_type AS entityType, entity_id AS entityId, read, created_at AS createdAt
      FROM notifications ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize).map((row) => ({ ...row, read: Boolean(row.read) }));
    const unread = Number(db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read = 0').get().count);
    res.json({ items, total, unread, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  });

  router.patch('/:id/read', requirePermission('notifications:write'), (req, res) => {
    const existing = db.prepare('SELECT id FROM notifications WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('通知');
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/read-all', requirePermission('notifications:write'), (req, res) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
    res.json({ ok: true });
  });

  router.post('/mark', requirePermission('notifications:write'), (req, res) => {
    const data = parseBody(markSchema, req.body || {});
    if (Array.isArray(data.ids) && data.ids.length) {
      const statement = db.prepare('UPDATE notifications SET read = 1 WHERE id = ?');
      for (const id of data.ids) statement.run(id);
    } else {
      db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
    }
    res.json({ ok: true });
  });

  router.delete('/:id', requirePermission('notifications:write'), (req, res) => {
    const existing = db.prepare('SELECT id FROM notifications WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('通知');
    db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
    audit(db, req, { action: 'notification.delete', entityType: 'notification', entityId: req.params.id, detail: '' });
    res.json({ ok: true });
  });

  return router;
}
