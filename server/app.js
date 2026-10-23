import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { AppError } from './lib/errors.js';
import { requireAuth } from './auth.js';
import { localDateTime } from './lib/time.js';
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { appointmentRoutes } from './routes/appointments.js';
import { customerRoutes } from './routes/customers.js';
import { callRoutes } from './routes/calls.js';
import { walkInRoutes } from './routes/walkins.js';
import { tableRoutes } from './routes/tables.js';
import { reportRoutes } from './routes/reports.js';
import { notificationRoutes } from './routes/notifications.js';
import { settingRoutes } from './routes/settings.js';
import { integrationRoutes } from './routes/integrations.js';
import { dataRoutes } from './routes/data.js';
import { adminRoutes } from './routes/admin.js';

const CSRF_HEADER = 'x-callflow-csrf';

export function createApp({ db, staticDir, demoMode = true }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: http://127.0.0.1:* http://localhost:*; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Lightweight CSRF guard: mutating API requests must carry a custom header
  // that a cross-site form cannot set without a CORS preflight.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get(CSRF_HEADER) !== '1') {
      throw new AppError('请求缺少 CSRF 校验头', 403, 'CSRF_REQUIRED');
    }
    next();
  });

  app.get('/api/health', (req, res) => {
    let database = 'ok';
    try { db.prepare('SELECT 1 AS ok').get(); } catch { database = 'error'; }
    res.json({
      ok: database === 'ok',
      app: 'CallFlow',
      version: '1.0.0',
      demoMode: Boolean(demoMode),
      database,
      time: localDateTime(),
      disclosure: '演示数据均为虚构；电话、STT、AI 与飞书默认为模拟适配器。'
    });
  });

  app.use('/api/auth', authRoutes({ db, demoMode }));

  const auth = requireAuth(db);
  app.use('/api/dashboard', auth, dashboardRoutes({ db }));
  app.use('/api/appointments', auth, appointmentRoutes({ db }));
  app.use('/api/customers', auth, customerRoutes({ db }));
  app.use('/api/calls', auth, callRoutes({ db }));
  app.use('/api/walk-ins', auth, walkInRoutes({ db }));
  app.use('/api/tables', auth, tableRoutes({ db }));
  app.use('/api/reports', auth, reportRoutes({ db }));
  app.use('/api/notifications', auth, notificationRoutes({ db }));
  app.use('/api/settings', auth, settingRoutes({ db }));
  app.use('/api/integrations', auth, integrationRoutes({ db }));
  app.use('/api/data', auth, dataRoutes({ db }));
  app.use('/api/admin', auth, adminRoutes({ db }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { message: '接口不存在', code: 'NOT_FOUND' } });
  });

  const indexHtml = staticDir ? path.join(staticDir, 'index.html') : '';
  if (indexHtml && fs.existsSync(indexHtml)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(indexHtml, (error) => { if (error) next(error); });
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: { message: '资源不存在', code: 'NOT_FOUND' } });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof AppError) {
      return res.status(error.status).json({
        error: { message: error.message, code: error.code || 'APP_ERROR', details: error.details ?? null }
      });
    }
    if (error?.type === 'entity.parse.failed' || error instanceof SyntaxError) {
      return res.status(400).json({ error: { message: '请求 JSON 格式不正确', code: 'INVALID_JSON' } });
    }
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: { message: '记录已存在，请检查名称或手机号是否重复', code: 'DUPLICATE' } });
    }
    if (String(error?.message || '').includes('FOREIGN KEY constraint failed')) {
      return res.status(409).json({ error: { message: '关联数据不存在或仍被引用', code: 'FOREIGN_KEY' } });
    }
    if (process.env.NODE_ENV !== 'test') console.error('[callflow]', error);
    res.status(500).json({ error: { message: '服务器内部错误', code: 'INTERNAL_ERROR' } });
  });

  return app;
}
