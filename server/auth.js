import crypto from 'node:crypto';
import { hashPassword, verifyPassword, randomToken, hashToken, parseCookies } from './lib/security.js';
import { localDateTime } from './lib/time.js';
import { AppError, forbidden } from './lib/errors.js';

export const SESSION_COOKIE = 'callflow_session';
export const SESSION_HOURS = 12;

export const ROLE_PERMISSIONS = {
  admin: ['*'],
  manager: [
    'dashboard:read', 'appointments:read', 'appointments:write', 'appointments:override',
    'appointments:delete', 'customers:read', 'customers:write', 'customers:delete',
    'calls:read', 'calls:write', 'calls:delete', 'walkins:read', 'walkins:write',
    'tables:read', 'tables:write', 'reports:read', 'notifications:read',
    'notifications:write', 'settings:read', 'settings:write', 'diagnostics:read',
    'data:export', 'data:import', 'data:backup', 'audit:read'
  ],
  agent: [
    'dashboard:read', 'appointments:read', 'appointments:write', 'customers:read',
    'customers:write', 'calls:read', 'calls:write', 'walkins:read', 'walkins:write',
    'tables:read', 'reports:read', 'notifications:read', 'notifications:write',
    'settings:read'
  ],
  viewer: [
    'dashboard:read', 'appointments:read', 'customers:read', 'calls:read',
    'walkins:read', 'tables:read', 'reports:read', 'notifications:read', 'settings:read'
  ]
};

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
}

export function hasPermission(user, permission) {
  if (!user) return false;
  const permissions = user.permissions || permissionsFor(user.role);
  return permissions.includes('*') || permissions.includes(permission);
}

export function ensurePermission(user, permission) {
  if (!hasPermission(user, permission)) throw forbidden(`缺少权限：${permission}`);
}

export function cleanupSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(localDateTime());
}

export function createSession(db, userId) {
  cleanupSessions(db);
  const token = randomToken(32);
  const id = hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 3_600_000);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(id, userId, localDateTime(expires), localDateTime(now));
  return { token, expiresAt: localDateTime(expires) };
}

export function destroySession(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

export function destroyUserSessions(db, userId, exceptToken = '') {
  if (exceptToken) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(userId, hashToken(exceptToken));
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

export function getSessionUser(db, req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.id AS sessionId, s.expires_at AS expiresAt,
      u.id, u.username, u.display_name AS displayName, u.role, u.active,
      u.created_at AS createdAt, u.updated_at AS updatedAt
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(hashToken(token));
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now() || !row.active) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.sessionId);
    return null;
  }
  const { sessionId, expiresAt, ...user } = row;
  return { ...user, permissions: permissionsFor(user.role), sessionExpiresAt: expiresAt };
}

export function cookieAttributes() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_HOURS * 3_600_000
  };
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, cookieAttributes());
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { ...cookieAttributes(), maxAge: undefined });
}

export function sessionTokenFromRequest(req) {
  return parseCookies(req.headers.cookie || '')[SESSION_COOKIE] || '';
}

export function requireAuth(db) {
  return (req, res, next) => {
    const user = getSessionUser(db, req);
    if (!user) throw new AppError('请先登录', 401, 'UNAUTHENTICATED');
    req.user = user;
    next();
  };
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) throw forbidden(`缺少权限：${permission}`);
    next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden('当前角色不能执行该操作');
    next();
  };
}

export function audit(db, req, { action, entityType = '', entityId = '', detail = '' }) {
  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_type, entity_id, detail, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `audit_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`,
    req.user?.id || null,
    req.user?.displayName || req.user?.username || 'system',
    action,
    entityType,
    entityId,
    typeof detail === 'string' ? detail : JSON.stringify(detail),
    String(req.ip || '').replace('::ffff:', ''),
    localDateTime()
  );
}

export function createUser(db, { username, displayName, password, role = 'agent', active = true }) {
  const now = localDateTime();
  const id = `user_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, displayName, hashPassword(password), role, active ? 1 : 0, now, now);
  return db.prepare('SELECT id, username, display_name AS displayName, role, active, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?').get(id);
}

export function verifyLogin(db, username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username || '').trim());
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) return null;
  return user;
}

export function changePassword(db, userId, newPassword) {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(newPassword), localDateTime(), userId);
}
