import express from 'express';
import { AppError } from '../lib/errors.js';
import { audit, requirePermission } from '../auth.js';
import { parseBody, importCsvSchema, clearSchema, backupRestoreSchema } from '../lib/schemas.js';
import {
  exportCsv, exportJson, importJson, importCsv, clearScope,
  createBackup, listBackups, restoreBackup, resetDemoData
} from '../domain/data.js';

export function dataRoutes({ db }) {
  const router = express.Router();

  router.get('/export/csv', requirePermission('data:export'), (req, res) => {
    const type = String(req.query.type || 'customers');
    const result = exportCsv(db, type);
    audit(db, req, { action: 'data.export_csv', entityType: 'data', entityId: type, detail: `${result.rows} rows` });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  });

  router.get('/export/json', requirePermission('data:export'), (req, res) => {
    const payload = exportJson(db);
    audit(db, req, { action: 'data.export_json', entityType: 'data', entityId: '', detail: 'full backup payload' });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="callflow-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  });

  router.post('/import/json', requirePermission('data:import'), (req, res) => {
    if (req.body?.confirmReplace !== true) {
      throw new AppError('导入会覆盖当前业务数据，请确认后再提交', 409, 'CONFIRM_REQUIRED');
    }
    const result = importJson(db, req.body);
    audit(db, req, { action: 'data.import_json', entityType: 'data', entityId: '', detail: JSON.stringify(result.counts) });
    res.json({ ...result, note: '导入仅覆盖备份中出现的业务表；不恢复密码或敏感配置。' });
  });

  router.post('/import/csv', requirePermission('data:import'), (req, res) => {
    const data = parseBody(importCsvSchema, req.body || {});
    const result = importCsv(db, data.type, data.content);
    audit(db, req, { action: 'data.import_csv', entityType: 'data', entityId: data.type, detail: `${result.imported} imported` });
    res.json(result);
  });

  router.post('/clear', requirePermission('data:import'), (req, res) => {
    const data = parseBody(clearSchema, req.body || {});
    clearScope(db, data.scope);
    audit(db, req, { action: 'data.clear', entityType: 'data', entityId: data.scope, detail: '清除业务数据' });
    res.json({ ok: true, scope: data.scope });
  });

  router.get('/backups', requirePermission('data:backup'), (req, res) => {
    res.json({ items: listBackups() });
  });

  router.post('/backups', requirePermission('data:backup'), (req, res) => {
    const backup = createBackup(db, req.user);
    audit(db, req, { action: 'data.backup_create', entityType: 'backup', entityId: backup.filename, detail: `${backup.size} bytes` });
    res.status(201).json({ backup });
  });

  router.post('/backups/restore', requirePermission('data:backup'), (req, res) => {
    const data = parseBody(backupRestoreSchema, req.body || {});
    const result = restoreBackup(db, data.filename);
    audit(db, req, { action: 'data.backup_restore', entityType: 'backup', entityId: data.filename, detail: JSON.stringify(result.counts) });
    res.json({ ...result, restoredFrom: data.filename });
  });

  router.post('/reset-demo', requirePermission('data:import'), (req, res) => {
    resetDemoData(db);
    audit(db, req, { action: 'data.reset_demo', entityType: 'data', entityId: '', detail: '重置为虚构演示数据' });
    res.json({ ok: true, message: '已重置为虚构演示数据；用户与设置保留。' });
  });

  return router;
}
