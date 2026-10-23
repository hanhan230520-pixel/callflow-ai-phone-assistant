import express from 'express';
import { createSession, destroySession, destroyUserSessions, setSessionCookie, clearSessionCookie, sessionTokenFromRequest, verifyLogin, changePassword, audit, requireAuth, permissionsFor } from '../auth.js';
import { verifyPassword } from '../lib/security.js';
import { AppError } from '../lib/errors.js';
import { localDateTime } from '../lib/time.js';

const attempts = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const record = attempts.get(ip) || { count: 0, first: now };
  if (now - record.first > 15 * 60 * 1000) { record.count = 0; record.first = now; }
  record.count += 1;
  attempts.set(ip, record);
  if (record.count > 20) throw new AppError('登录尝试过于频繁，请稍后再试', 429, 'RATE_LIMITED');
}

export function authRoutes({ db, demoMode = true }) {
  const router = express.Router();
  const auth = requireAuth(db);

  router.get('/demo-accounts', (req, res) => {
    if (!demoMode) throw new AppError('演示账号信息已关闭', 404, 'NOT_FOUND');
    res.json({
      demoMode: true,
      note: '仅用于本地演示；生产环境请关闭 DEMO_MODE 并修改全部密码。',
      accounts: [
        { username: 'admin', password: process.env.DEMO_ADMIN_PASSWORD || 'CallFlowDemo!2026', role: 'admin', label: '管理员' },
        { username: 'manager', password: process.env.DEMO_MANAGER_PASSWORD || 'CallFlowManager!2026', role: 'manager', label: '经理' },
        { username: 'agent', password: process.env.DEMO_AGENT_PASSWORD || 'CallFlowAgent!2026', role: 'agent', label: '坐席' },
        { username: 'viewer', password: process.env.DEMO_VIEWER_PASSWORD || 'CallFlowViewer!2026', role: 'viewer', label: '只读' }
      ]
    });
  });

  router.post('/login', (req, res) => {
    checkRateLimit(req.ip || 'unknown');
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) throw new AppError('请输入用户名和密码', 400, 'VALIDATION_ERROR');
    const user = verifyLogin(db, username, password);
    if (!user) throw new AppError('用户名或密码不正确', 401, 'INVALID_CREDENTIALS');
    const session = createSession(db, user.id);
    setSessionCookie(res, session.token);
    attempts.delete(req.ip || 'unknown');
    db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(localDateTime(), user.id);
    req.user = { id: user.id, displayName: user.display_name, role: user.role };
    audit(db, req, { action: 'auth.login', entityType: 'user', entityId: user.id, detail: '登录成功' });
    res.json({
      user: {
        id: user.id, username: user.username, displayName: user.display_name, role: user.role,
        permissions: permissionsFor(user.role)
      },
      expiresAt: session.expiresAt
    });
  });

  router.post('/logout', (req, res) => {
    const token = sessionTokenFromRequest(req);
    destroySession(db, token);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', auth, (req, res) => {
    res.json({ user: req.user });
  });

  router.patch('/password', auth, (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 10) throw new AppError('新密码至少 10 个字符', 422, 'WEAK_PASSWORD');
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!row || !verifyPassword(currentPassword, row.password_hash)) throw new AppError('当前密码不正确', 422, 'INVALID_PASSWORD');
    changePassword(db, req.user.id, newPassword);
    destroyUserSessions(db, req.user.id, sessionTokenFromRequest(req));
    audit(db, req, { action: 'auth.password_changed', entityType: 'user', entityId: req.user.id, detail: '用户修改密码' });
    res.json({ ok: true, message: '密码已更新，其他会话已退出' });
  });

  return router;
}
