import express from 'express';
import { audit, requirePermission } from '../auth.js';
import { parseBody, settingsSchema } from '../lib/schemas.js';
import { publicSettings, setSettings, getSettings } from '../domain/settings.js';
import { aiStatus } from '../adapters/ai.js';
import { telephonyStatus } from '../adapters/telephony.js';
import { feishuStatus } from '../adapters/feishu.js';
import { validateWebhookUrl } from '../adapters/webhook.js';

export function settingRoutes({ db }) {
  const router = express.Router();

  router.get('/', requirePermission('settings:read'), (req, res) => {
    const settings = publicSettings(db);
    const raw = getSettings(db);
    res.json({
      settings,
      meta: {
        conflictWindow: { value: Number(raw.conflict_window_minutes || 90), min: 15, max: 240 },
        autoAnswerTimeout: { value: Number(raw.auto_answer_timeout || 8), min: 0, max: 60 },
        integrations: {
          ai: aiStatus(raw),
          telephony: telephonyStatus(raw),
          feishu: feishuStatus(raw),
          webhook: { url: raw.webhook_url || '', validation: validateWebhookUrl(raw.webhook_url) }
        },
        disclaimer: '演示数据均为虚构；模拟电话、转写和 AI 结果不会伪装为真实服务。'
      }
    });
  });

  router.patch('/', requirePermission('settings:write'), (req, res) => {
    const patch = parseBody(settingsSchema, req.body || {});
    const result = setSettings(db, patch);
    audit(db, req, { action: 'settings.update', entityType: 'settings', entityId: '', detail: result.updated.join(',') });
    res.json({ ...result, meta: { updatedAt: new Date().toISOString() } });
  });

  return router;
}
