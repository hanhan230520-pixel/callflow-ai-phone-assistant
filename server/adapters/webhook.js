import crypto from 'node:crypto';
import { localDateTime } from '../lib/time.js';

function isPrivateHost(hostname) {
  const value = String(hostname || '').toLowerCase();
  if (value === 'localhost' || value === '::1') return true;
  if (/^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return true;
  return false;
}

export function validateWebhookUrl(value) {
  if (!value) return { valid: false, reason: '未配置 Webhook URL' };
  let url;
  try { url = new URL(value); } catch { return { valid: false, reason: 'URL 格式不正确' }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { valid: false, reason: '仅支持 http/https' };
  if (isPrivateHost(url.hostname) && process.env.ALLOW_PRIVATE_WEBHOOKS !== 'true') {
    return { valid: false, reason: '默认禁止私网地址；如为本地测试请显式设置 ALLOW_PRIVATE_WEBHOOKS=true' };
  }
  return { valid: true, url: url.toString() };
}

export function recordDelivery(db, { url, event, status, requestBody = '', responseStatus = null, responseBody = '' }) {
  const id = `wh_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  db.prepare(`
    INSERT INTO webhook_deliveries (id, url, event, status, request_body, response_status, response_body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, url, event, status, requestBody, responseStatus, responseBody, localDateTime());
  return db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(id);
}

export async function dispatchWebhook(db, { url, event, payload, simulated = false }) {
  const body = JSON.stringify({ event, sentAt: new Date().toISOString(), simulated, data: payload });
  if (!url) {
    return recordDelivery(db, { url: '', event, status: 'skipped', requestBody: body, responseBody: '未配置 Webhook URL' });
  }
  const validation = validateWebhookUrl(url);
  if (!validation.valid) {
    return recordDelivery(db, { url, event, status: 'blocked', requestBody: body, responseBody: validation.reason });
  }
  if (simulated) {
    return recordDelivery(db, { url, event, status: 'simulated', requestBody: body, responseBody: '模拟投递：未发起网络请求' });
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(validation.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CallFlow-Event': event },
      body,
      signal: controller.signal
    });
    clearTimeout(timer);
    const text = await response.text();
    return recordDelivery(db, {
      url: validation.url, event, status: response.ok ? 'delivered' : 'failed', requestBody: body,
      responseStatus: response.status, responseBody: text.slice(0, 2000)
    });
  } catch (error) {
    return recordDelivery(db, {
      url: validation.url, event, status: 'failed', requestBody: body,
      responseBody: String(error?.message || '网络请求失败').slice(0, 2000)
    });
  }
}
