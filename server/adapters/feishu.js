import crypto from 'node:crypto';
import { localDateTime } from '../lib/time.js';

function configReady(settings = {}) {
  return Boolean(settings.feishu_app_id && settings.feishu_app_secret && settings.feishu_app_token);
}

export function feishuStatus(settings = {}) {
  const ready = configReady(settings);
  return {
    provider: 'feishu',
    mode: ready ? 'configured-not-verified' : 'mock',
    configured: ready,
    realReady: false,
    status: ready
      ? '已填写配置，但真实 API 调用未启用；当前使用模拟同步。'
      : '未配置飞书凭据；当前使用模拟同步。',
    tables: {
      reservations: settings.feishu_table_reservations || '',
      customers: settings.feishu_table_customers || '',
      walkIns: settings.feishu_table_walkins || '',
      seatConfig: settings.feishu_table_seat_config || '',
      seatLayouts: settings.feishu_table_layouts || ''
    },
    lastJob: null,
    disclaimer: '模拟同步不会访问飞书服务器，也不会传输任何真实数据。'
  };
}

export function testFeishu(settings = {}) {
  const ready = configReady(settings);
  return {
    ok: true,
    simulated: true,
    configured: ready,
    message: ready
      ? '配置字段完整；真实飞书 API 调用尚未启用，本次为模拟测试。'
      : '未配置完整凭据；已通过模拟连接测试。',
    checkedAt: localDateTime()
  };
}

export function runFeishuSync(db, { direction = 'push', entity = 'appointments', settings = {}, actorId = null } = {}) {
  const id = `sync_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const now = localDateTime();
  const counts = {
    appointments: Number(db.prepare('SELECT COUNT(*) AS count FROM appointments').get().count),
    customers: Number(db.prepare('SELECT COUNT(*) AS count FROM customers').get().count),
    calls: Number(db.prepare('SELECT COUNT(*) AS count FROM calls').get().count),
    walkIns: Number(db.prepare('SELECT COUNT(*) AS count FROM walk_ins').get().count)
  };
  const detail = JSON.stringify({
    simulated: true,
    direction,
    entity,
    configured: configReady(settings),
    counts,
    message: '模拟同步完成：未访问飞书 API，未传输真实数据。',
    actorId: actorId || null
  });
  db.prepare(`
    INSERT INTO sync_jobs (id, provider, direction, status, detail, simulated, started_at, finished_at)
    VALUES (?, 'feishu', ?, 'simulated', ?, 1, ?, ?)
  `).run(id, direction, detail, now, now);
  return db.prepare('SELECT * FROM sync_jobs WHERE id = ?').get(id);
}
