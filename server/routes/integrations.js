import express from 'express';
import { z } from 'zod';
import { audit, requirePermission } from '../auth.js';
import { parseBody, feishuSyncSchema } from '../lib/schemas.js';
import { getSettings } from '../domain/settings.js';
import { aiStatus } from '../adapters/ai.js';
import { telephonyStatus } from '../adapters/telephony.js';
import { feishuStatus, testFeishu, runFeishuSync } from '../adapters/feishu.js';
import { dispatchWebhook, validateWebhookUrl } from '../adapters/webhook.js';

const webhookTestSchema = z.object({
  url: z.string().trim().max(500).optional(),
  event: z.string().trim().max(80).optional().default('test.ping')
});

export function integrationRoutes({ db }) {
  const router = express.Router();

  router.get('/', requirePermission('settings:read'), (req, res) => {
    const settings = getSettings(db);
    const syncJobs = db.prepare('SELECT id, provider, direction, status, detail, simulated, started_at AS startedAt, finished_at AS finishedAt FROM sync_jobs ORDER BY started_at DESC LIMIT 20')
      .all().map((row) => ({ ...row, simulated: Boolean(row.simulated), detail: safeJson(row.detail) }));
    const deliveries = db.prepare('SELECT id, url, event, status, response_status AS responseStatus, response_body AS responseBody, created_at AS createdAt FROM webhook_deliveries ORDER BY created_at DESC LIMIT 20').all();
    res.json({
      ai: aiStatus(settings),
      telephony: telephonyStatus(settings),
      feishu: { ...feishuStatus(settings), lastJob: syncJobs.find((job) => job.provider === 'feishu') || null },
      webhook: { url: settings.webhook_url || '', validation: validateWebhookUrl(settings.webhook_url), deliveries },
      syncJobs,
      disclosure: '所有外部集成当前均为模拟或仅配置状态；不会拨号、不会调用真实 AI、不会访问飞书、默认不会发起 Webhook 网络请求。'
    });
  });

  router.post('/ai/test', requirePermission('settings:write'), (req, res) => {
    const settings = getSettings(db);
    const status = aiStatus(settings);
    res.json({ ok: true, simulated: true, ...status, message: '模拟 AI 适配器正常；未发起外部模型请求。', checkedAt: new Date().toISOString() });
  });

  router.post('/telephony/test', requirePermission('settings:write'), (req, res) => {
    const settings = getSettings(db);
    const status = telephonyStatus(settings);
    res.json({ ok: true, simulated: true, ...status, message: '模拟电话适配器正常；未连接实体设备。', checkedAt: new Date().toISOString() });
  });

  router.post('/feishu/test', requirePermission('settings:write'), (req, res) => {
    const settings = getSettings(db);
    const result = testFeishu(settings);
    audit(db, req, { action: 'integration.feishu_test', entityType: 'integration', entityId: 'feishu', detail: result.message });
    res.json(result);
  });

  router.post('/feishu/sync', requirePermission('settings:write'), (req, res) => {
    const data = parseBody(feishuSyncSchema, req.body || {});
    const settings = getSettings(db);
    const job = runFeishuSync(db, { direction: data.direction, settings, actorId: req.user.id });
    audit(db, req, { action: 'integration.feishu_sync', entityType: 'sync', entityId: job.id, detail: data.direction });
    res.status(201).json({ job: { ...job, simulated: true, detail: safeJson(job.detail) }, simulated: true });
  });

  router.post('/webhook/test', requirePermission('settings:write'), async (req, res) => {
    const data = parseBody(webhookTestSchema, req.body || {});
    const settings = getSettings(db);
    const url = data.url || settings.webhook_url || '';
    const delivery = await dispatchWebhook(db, {
      url,
      event: data.event,
      payload: { demo: true, message: 'CallFlow 模拟 Webhook 测试', fixture: true },
      simulated: true
    });
    audit(db, req, { action: 'integration.webhook_test', entityType: 'webhook', entityId: delivery.id, detail: delivery.status });
    res.json({ delivery, simulated: true, note: '测试使用模拟投递，不会发起真实网络请求。' });
  });

  return router;
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return value; }
}
