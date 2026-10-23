import express from 'express';
import { AppError, notFound } from '../lib/errors.js';
import { ROLE_PERMISSIONS, audit, requirePermission, requireRole, createUser, changePassword, destroyUserSessions } from '../auth.js';
import { parseBody, userCreateSchema, userUpdateSchema } from '../lib/schemas.js';
import { localDateTime } from '../lib/time.js';
import { listBackups } from '../domain/data.js';
import { getSettings } from '../domain/settings.js';
import { aiStatus } from '../adapters/ai.js';
import { telephonyStatus } from '../adapters/telephony.js';
import { feishuStatus } from '../adapters/feishu.js';

function publicUser(row) {
  return {
    id: row.id, username: row.username, displayName: row.display_name ?? row.displayName,
    role: row.role, active: Boolean(row.active), createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

export function adminRoutes({ db }) {
  const router = express.Router();

  router.get('/users', requireRole('admin'), (req, res) => {
    const items = db.prepare('SELECT id, username, display_name, role, active, created_at, updated_at FROM users ORDER BY created_at ASC').all().map(publicUser);
    res.json({ items, roles: ROLE_PERMISSIONS });
  });

  router.post('/users', requireRole('admin'), (req, res) => {
    const data = parseBody(userCreateSchema, req.body);
    const duplicate = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(data.username);
    if (duplicate) throw new AppError('用户名已存在', 409, 'USERNAME_EXISTS');
    const user = createUser(db, data);
    audit(db, req, { action: 'user.create', entityType: 'user', entityId: user.id, detail: `${user.username} ${user.role}` });
    res.status(201).json({ user });
  });

  router.patch('/users/:id', requireRole('admin'), (req, res) => {
    const data = parseBody(userUpdateSchema, req.body);
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('用户');
    if (existing.id === req.user.id && data.active === false) throw new AppError('不能停用当前登录账号', 422, 'CANNOT_DISABLE_SELF');
    if (existing.id === req.user.id && data.role && data.role !== 'admin') throw new AppError('不能降低当前登录管理员的角色', 422, 'CANNOT_DEMOTE_SELF');
    if (existing.role === 'admin' && data.role && data.role !== 'admin') {
      const admins = Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count);
      if (admins <= 1) throw new AppError('系统至少需要保留一名启用中的管理员', 422, 'LAST_ADMIN');
    }
    db.prepare('UPDATE users SET display_name = ?, role = ?, active = ?, updated_at = ? WHERE id = ?')
      .run(data.displayName ?? existing.display_name, data.role ?? existing.role,
        data.active == null ? existing.active : (data.active ? 1 : 0), localDateTime(), existing.id);
    if (data.password) changePassword(db, existing.id, data.password);
    if (data.active === false || data.password) destroyUserSessions(db, existing.id);
    audit(db, req, { action: 'user.update', entityType: 'user', entityId: existing.id, detail: `${existing.username}` });
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
    res.json({ user: publicUser(updated) });
  });

  router.delete('/users/:id', requireRole('admin'), (req, res) => {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('用户');
    if (existing.id === req.user.id) throw new AppError('不能删除当前登录账号', 422, 'CANNOT_DELETE_SELF');
    if (existing.role === 'admin') {
      const admins = Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count);
      if (admins <= 1) throw new AppError('系统至少需要保留一名启用中的管理员', 422, 'LAST_ADMIN');
    }
    db.prepare('UPDATE users SET active = 0, updated_at = ? WHERE id = ?').run(localDateTime(), existing.id);
    destroyUserSessions(db, existing.id);
    audit(db, req, { action: 'user.disable', entityType: 'user', entityId: existing.id, detail: existing.username });
    res.json({ ok: true });
  });

  router.get('/audit', requirePermission('audit:read'), (req, res) => {
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(200, Math.max(10, Number.parseInt(String(req.query.pageSize || '50'), 10) || 50));
    const where = [];
    const params = [];
    if (req.query.action) { where.push('action LIKE ?'); params.push(`%${req.query.action}%`); }
    if (req.query.actor) { where.push('(actor_name LIKE ? OR actor_id = ?)'); params.push(`%${req.query.actor}%`, String(req.query.actor)); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM audit_logs ${whereSql}`).get(...params).count);
    const items = db.prepare(`SELECT id, actor_id AS actorId, actor_name AS actorName, action, entity_type AS entityType, entity_id AS entityId, detail, ip, created_at AS createdAt FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    res.json({ items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  });

  router.get('/roles', requireRole('admin'), (req, res) => {
    res.json({ roles: ROLE_PERMISSIONS });
  });

  router.get('/diagnostics', requirePermission('diagnostics:read'), (req, res) => {
    const settings = getSettings(db);
    const counts = {};
    for (const table of ['users', 'customers', 'appointments', 'calls', 'call_segments', 'walk_ins', 'payments', 'notifications', 'audit_logs']) {
      counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
    }
    let integrity = 'unknown';
    try { integrity = db.prepare('PRAGMA integrity_check').get().integrity_check; } catch { integrity = 'unavailable'; }
    const warnings = [];
    if (settings.demo_mode) warnings.push('演示模式开启：登录页会显示演示账号，仅限本地展示。');
    if (settings.ai_mode === 'mock') warnings.push('AI 当前为模拟模式，不会产生真实模型调用。');
    if (settings.telephony_mode === 'mock') warnings.push('电话当前为模拟模式，不会连接实体设备。');
    if (settings.recording_enabled) warnings.push('录音开关已开启，但真实录音能力尚未实现。');
    if (settings.feishu_app_token || settings.feishu_app_secret) warnings.push('飞书配置字段已填写，但真实同步未启用。');
    res.json({
      app: { name: 'CallFlow', version: '1.0.0', node: process.version, uptimeSeconds: Math.round(process.uptime()) },
      database: { engine: 'SQLite (node:sqlite)', integrity, counts, backups: listBackups().length },
      runtime: { memoryMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)), pid: process.pid },
      integrations: { ai: aiStatus(settings), telephony: telephonyStatus(settings), feishu: feishuStatus(settings) },
      warnings,
      checkedAt: localDateTime()
    });
  });

  return router;
}
