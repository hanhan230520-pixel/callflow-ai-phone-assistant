import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { closeDatabase, openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { addDays, localDateString } from '../server/lib/time.js';

test('CallFlow API', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'callflow-full-test-'));
  const db = openDatabase(path.join(directory, 'test.db'));
  const app = createApp({ db, demoMode: true });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const today = localDateString();
  const tomorrow = addDays(today, 1);

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase(db);
    await rm(directory, { recursive: true, force: true });
  });

  async function raw(route, { method = 'GET', body, cookie, csrf = true, headers = {} } = {}) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'x-callflow-csrf': '1' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { response, body: json, text };
  }

  async function login(username, password) {
    const result = await raw('/api/auth/login', { method: 'POST', body: { username, password } });
    assert.equal(result.response.status, 200, `login failed for ${username}`);
    const rawCookie = result.response.headers.getSetCookie?.()[0] || result.response.headers.get('set-cookie');
    return { cookie: rawCookie.split(';')[0], user: result.body.user };
  }

  const admin = await login('admin', process.env.DEMO_ADMIN_PASSWORD || 'CallFlowDemo!2026');
  const api = (route, options = {}) => raw(route, { ...options, cookie: admin.cookie });

  await t.test('health endpoint exposes demo-safe metadata without authentication', async () => {
    const { response, body } = await raw('/api/health');
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.app, 'CallFlow');
    assert.equal(body.database, 'ok');
    assert.equal(body.demoMode, true);
    assert.match(body.disclosure, /模拟/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  await t.test('mutating API requests require the CSRF header', async () => {
    const missing = await raw('/api/auth/login', { method: 'POST', csrf: false, body: { username: 'admin', password: 'x' } });
    assert.equal(missing.response.status, 403);
    assert.equal(missing.body.error.code, 'CSRF_REQUIRED');
    const read = await raw('/api/dashboard');
    assert.equal(read.response.status, 401);
  });

  await t.test('login, session and demo account metadata work', async () => {
    const me = await api('/api/auth/me');
    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.username, 'admin');
    assert.ok(me.body.user.permissions.includes('*'));
    const demo = await raw('/api/auth/demo-accounts');
    assert.equal(demo.response.status, 200);
    assert.equal(demo.body.accounts.length, 4);
    assert.ok(demo.body.accounts.every((account) => account.role && account.username));
  });

  await t.test('server-side RBAC blocks viewer writes and admin routes', async () => {
    const viewer = await login('viewer', process.env.DEMO_VIEWER_PASSWORD || 'CallFlowViewer!2026');
    const read = await raw('/api/dashboard', { cookie: viewer.cookie });
    assert.equal(read.response.status, 200);
    const write = await raw('/api/appointments', {
      cookie: viewer.cookie, method: 'POST',
      body: { guestName: '只读测试', phone: '13900000000', date: tomorrow, time: '15:00', partySize: 2, source: 'phone', status: 'pending' }
    });
    assert.equal(write.response.status, 403);
    const adminRoute = await raw('/api/admin/users', { cookie: viewer.cookie });
    assert.equal(adminRoute.response.status, 403);
    const settings = await raw('/api/settings', { cookie: viewer.cookie });
    assert.equal(settings.response.status, 200);
  });

  await t.test('dashboard aggregates appointments, tables, calls and revenue', async () => {
    const { response, body } = await api(`/api/dashboard?date=${today}`);
    assert.equal(response.status, 200);
    assert.equal(body.date, today);
    assert.ok(body.metrics.appointments >= 5);
    assert.ok(body.metrics.guests > 0);
    assert.ok(body.metrics.tables >= 10);
    assert.ok(Array.isArray(body.todayAppointments));
    assert.ok(body.todayAppointments.every((item) => item.date === today && item.status !== 'cancelled'));
    assert.ok(Array.isArray(body.tables) && body.tables.length > 0);
    assert.ok(Array.isArray(body.trend) && body.trend.length === 7);
    assert.ok(body.sourceCounts && body.statusCounts);
  });

  await t.test('appointment list supports filters and full detail', async () => {
    const all = await api('/api/appointments?pageSize=50');
    assert.equal(all.response.status, 200);
    assert.ok(all.body.total >= 10);
    const confirmed = await api('/api/appointments?status=confirmed&pageSize=50');
    assert.ok(confirmed.body.items.length > 0);
    assert.ok(confirmed.body.items.every((item) => item.status === 'confirmed'));
    const search = await api('/api/appointments?search=13800000001&pageSize=50');
    assert.ok(search.body.items.length > 0);
    const detail = await api('/api/appointments/apt_demo_01');
    assert.equal(detail.response.status, 200);
    assert.ok(detail.body.item.guestName);
    assert.ok(Array.isArray(detail.body.history));
    assert.ok(detail.body.history.length >= 1);
    assert.ok(Array.isArray(detail.body.calls));
    assert.ok(Array.isArray(detail.body.payments));
    assert.ok(Array.isArray(detail.body.customer.tags));
    assert.equal(typeof detail.body.customer.totalSpent, 'number');
    assert.equal(typeof detail.body.customer.visitCount, 'number');
  });

  await t.test('90-minute conflict detection and nearby slot recommendations work', async () => {
    const check = await api('/api/appointments/check', {
      method: 'POST',
      body: { date: today, time: '12:10', partySize: 2, tableId: 'table_a01' }
    });
    assert.equal(check.response.status, 200);
    assert.equal(check.body.windowMinutes, 90);
    assert.ok(check.body.conflicts.length >= 1);
    assert.equal(check.body.conflicts[0].tableName, 'A01');
    assert.ok(Array.isArray(check.body.nearbySlots));
    assert.ok(check.body.nearbySlots.length >= 1);
    assert.ok(check.body.nearbySlots.every((slot) => Math.abs(slot.offset) >= 30));

    const conflict = await api('/api/appointments', {
      method: 'POST',
      body: { guestName: '冲突测试', phone: '13900000001', date: today, time: '12:10', partySize: 2, tableId: 'table_a01', source: 'phone', status: 'pending' }
    });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.error.code, 'TABLE_CONFLICT');
    assert.ok(Array.isArray(conflict.body.error.details.conflicts));

    const override = await api('/api/appointments', {
      method: 'POST',
      body: { guestName: '覆盖冲突测试', phone: '13900000002', date: today, time: '12:10', partySize: 2, tableId: 'table_a01', source: 'phone', status: 'pending', overrideConflict: true, notes: '自动化测试：显式覆盖并记录审计' }
    });
    assert.equal(override.response.status, 201);
    assert.equal(override.body.overridden, true);
    assert.equal(override.body.item.conflictOverride, true);
    const audit = await api('/api/admin/audit?pageSize=100&action=appointment.override_create');
    assert.ok(audit.body.items.some((item) => item.entityId === override.body.item.id));
  });

  await t.test('appointment creation, capacity, past-date and status transitions are enforced', async () => {
    const created = await api('/api/appointments', {
      method: 'POST',
      body: {
        guestName: '接口测试客人', phone: '13900000002', date: today, time: '19:00', partySize: 2,
        tableId: 'table_a01', source: 'phone', status: 'pending', occasion: '测试场景', notes: '自动化测试预约'
      }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.item.status, 'pending');
    assert.ok(created.body.item.customerId);
    const id = created.body.item.id;
    const detail = await api(`/api/appointments/${id}`);
    assert.equal(detail.body.customer.phone, '13900000002');

    const confirmed = await api(`/api/appointments/${id}/status`, { method: 'PATCH', body: { status: 'confirmed', note: '电话确认' } });
    assert.equal(confirmed.response.status, 200);
    assert.equal(confirmed.body.item.status, 'confirmed');
    const seated = await api(`/api/appointments/${id}/status`, { method: 'PATCH', body: { status: 'seated' } });
    assert.equal(seated.body.item.status, 'seated');
    const invalid = await api(`/api/appointments/${id}/status`, { method: 'PATCH', body: { status: 'pending' } });
    assert.equal(invalid.response.status, 422);
    assert.equal(invalid.body.error.code, 'INVALID_TRANSITION');

    const past = await api('/api/appointments', {
      method: 'POST',
      body: { guestName: '过去日期', phone: '13900000003', date: '2020-01-01', time: '18:00', partySize: 2, source: 'phone', status: 'pending' }
    });
    assert.equal(past.response.status, 422);
    assert.equal(past.body.error.code, 'PAST_DATE');

    const capacity = await api('/api/appointments', {
      method: 'POST',
      body: { guestName: '容量测试', phone: '13900000004', date: tomorrow, time: '18:00', partySize: 3, tableId: 'table_a01', source: 'phone', status: 'pending' }
    });
    assert.equal(capacity.response.status, 422);
    assert.equal(capacity.body.error.code, 'CAPACITY_EXCEEDED');
  });

  await t.test('customer profiles, payments, duplicate phones and merge are transactional', async () => {
    const list = await api('/api/customers?search=%E6%BC%94%E7%A4%BA%E5%AE%A2%E6%88%B7%2001');
    assert.equal(list.response.status, 200);
    assert.ok(list.body.items.length >= 1);
    const existing = await api(`/api/customers/${list.body.items[0].id}`);
    assert.ok(Array.isArray(existing.body.appointments));
    assert.ok(existing.body.stats.totalSpent >= 0);

    const target = await api('/api/customers', {
      method: 'POST',
      body: { name: '合并目标客户', phone: '13900000011', tier: 'regular', preferences: '靠窗', allergies: '', notes: '目标档案', tags: ['测试'] }
    });
    const source = await api('/api/customers', {
      method: 'POST',
      body: { name: '合并源客户', phone: '13900000012', tier: 'vip', preferences: '安静', allergies: '花生', notes: '源档案', tags: ['VIP'] }
    });
    assert.equal(target.response.status, 201);
    assert.equal(source.response.status, 201);

    const payment = await api(`/api/customers/${source.body.item.id}/payments`, {
      method: 'POST', body: { amount: 500, method: 'wechat', note: '自动化测试消费' }
    });
    assert.equal(payment.response.status, 201);
    assert.equal(payment.body.payment.amount, 500);
    assert.equal(payment.body.detail.stats.totalSpent >= 500, true);

    const duplicate = await api('/api/customers', {
      method: 'POST',
      body: { name: '重复手机号', phone: '13900000012', tier: 'new', preferences: '', allergies: '', notes: '', tags: [] }
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.error.code, 'PHONE_EXISTS');

    const merged = await api(`/api/customers/${source.body.item.id}/merge`, {
      method: 'POST', body: { sourceId: source.body.item.id, targetId: target.body.item.id }
    });
    assert.equal(merged.response.status, 200);
    assert.equal(merged.body.item.tier, 'vip');
    const sourceAfter = await api(`/api/customers/${source.body.item.id}`);
    assert.equal(sourceAfter.response.status, 404);
    const targetAfter = await api(`/api/customers/${target.body.item.id}`);
    assert.ok(targetAfter.body.stats.totalSpent >= 500);
    assert.ok(targetAfter.body.item.tags.includes('VIP'));
  });

  await t.test('simulated call chain: incoming, answer, transcript, AI analysis, appointment', async () => {
    const incoming = await api('/api/calls/simulate-incoming', {
      method: 'POST', body: { phone: '13900000021', contactName: '模拟来电测试', scenario: 'birthday' }
    });
    assert.equal(incoming.response.status, 201);
    assert.equal(incoming.body.simulated, true);
    assert.equal(incoming.body.item.isSimulated, true);
    assert.equal(incoming.body.item.status, 'ringing');
    assert.ok(Array.isArray(incoming.body.script.lines));
    const callId = incoming.body.item.id;

    const answered = await api(`/api/calls/${callId}/answer`, { method: 'POST', body: {} });
    assert.equal(answered.body.item.status, 'answered');
    assert.equal(answered.body.simulated, true);

    const transcript = await api(`/api/calls/${callId}/transcribe`, { method: 'POST', body: { scenario: 'birthday' } });
    assert.equal(transcript.response.status, 200);
    assert.equal(transcript.body.simulated, true);
    assert.ok(transcript.body.item.transcript.length > 10);
    assert.ok(transcript.body.segments.length >= 2);
    assert.ok(transcript.body.segments.every((segment) => ['agent', 'customer'].includes(segment.speaker)));

    const analysis = await api(`/api/calls/${callId}/analyze`, { method: 'POST', body: {} });
    assert.equal(analysis.response.status, 200);
    assert.equal(analysis.body.simulated, true);
    assert.ok(analysis.body.call.aiSummary.length > 0);
    assert.ok(Array.isArray(analysis.body.call.aiTags));
    assert.ok(Array.isArray(analysis.body.analysis.profile.suggestions));
    assert.ok(analysis.body.analysis.profile.suggestions.length > 0);
    assert.equal(analysis.body.analysis.profile.simulated, true);
    assert.ok(analysis.body.analysis.keywords.length >= 1);
    assert.ok(['positive', 'negative'].includes(analysis.body.analysis.sentiment));
    assert.ok(Array.isArray(analysis.body.call.keywords));
    const highRiskNotice = await api('/api/notifications?pageSize=100');
    assert.ok(highRiskNotice.body.items.some((item) => item.entityId === callId && item.type === 'warning'));

    const known = await api('/api/calls/simulate-incoming', {
      method: 'POST', body: { phone: '13800000001', scenario: 'vip' }
    });
    assert.ok(known.body.customer);
    assert.ok(Array.isArray(known.body.customer.tags));
    assert.equal(typeof known.body.customer.visitCount, 'number');

    const converted = await api(`/api/calls/${callId}/appointment`, {
      method: 'POST',
      body: { guestName: '模拟来电测试', date: tomorrow, time: '15:30', partySize: 4, tableId: 'table_b03', status: 'confirmed', notes: '模拟 AI 转化预约' }
    });
    assert.equal(converted.response.status, 201);
    assert.equal(converted.body.appointment.source, 'phone');
    assert.equal(converted.body.appointment.status, 'confirmed');
    assert.equal(converted.body.call.appointmentId, converted.body.appointment.id);

    const recording = await api(`/api/calls/${callId}/recording`, { method: 'POST', body: {} });
    assert.equal(recording.response.status, 200);
    assert.equal(recording.body.item.recordingRef, `simulated://callflow/recording/${callId}`);

    const hungUp = await api(`/api/calls/${callId}/hangup`, { method: 'POST', body: {} });
    assert.equal(hungUp.response.status, 200);
    assert.equal(hungUp.body.item.status, 'completed');
    assert.ok(hungUp.body.item.durationSeconds >= 0);
  });

  await t.test('walk-in registration and conversion create a seated appointment', async () => {
    const created = await api('/api/walk-ins', {
      method: 'POST', body: { name: '散客测试', phone: '13900000031', date: today, time: '16:20', partySize: 2, tableId: 'table_b01', notes: '现场等位测试', status: 'waiting' }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.item.status, 'waiting');
    assert.ok(created.body.item.customerId);

    const converted = await api(`/api/walk-ins/${created.body.item.id}/convert`, {
      method: 'POST', body: { date: today, time: '16:20', partySize: 2, tableId: 'table_b01' }
    });
    assert.equal(converted.response.status, 201);
    assert.equal(converted.body.walkIn.status, 'converted');
    assert.equal(converted.body.appointment.source, 'walk_in');
    assert.equal(converted.body.appointment.status, 'seated');
    assert.equal(converted.body.walkIn.convertedAppointmentId, converted.body.appointment.id);
  });

  await t.test('tables, areas, combos and time slots support full CRUD', async () => {
    const layout = await api(`/api/tables?date=${today}`);
    assert.equal(layout.response.status, 200);
    assert.ok(layout.body.areas.length >= 4);
    assert.ok(layout.body.tables.length >= 10);
    assert.ok(layout.body.combos.length >= 2);
    assert.ok(layout.body.slots.length >= 2);
    assert.ok(layout.body.tables.some((table) => table.seatedAppointmentId));

    const area = await api('/api/tables/areas', { method: 'POST', body: { name: '测试区域', sortOrder: 99 } });
    assert.equal(area.response.status, 201);
    const tableA = await api('/api/tables/tables', { method: 'POST', body: { name: 'T97', areaId: area.body.id, capacity: 2, shape: 'square', x: 1, y: 9 } });
    const tableB = await api('/api/tables/tables', { method: 'POST', body: { name: 'T98', areaId: area.body.id, capacity: 2, shape: 'round', x: 2, y: 9 } });
    assert.equal(tableA.response.status, 201);
    assert.equal(tableB.response.status, 201);
    const updated = await api(`/api/tables/tables/${tableA.body.id}`, { method: 'PATCH', body: { status: 'cleaning' } });
    assert.equal(updated.response.status, 200);

    const combo = await api('/api/tables/combos', { method: 'POST', body: { name: '测试组合', tableIds: [tableA.body.id, tableB.body.id], notes: '自动化测试' } });
    assert.equal(combo.response.status, 201);
    assert.equal(combo.body.capacity, 4);
    const combos = await api(`/api/tables?date=${today}`);
    assert.ok(combos.body.combos.some((item) => item.id === combo.body.id && item.tableIds.length === 2));
    assert.equal((await api(`/api/tables/combos/${combo.body.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/tables/tables/${tableA.body.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/tables/tables/${tableB.body.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/tables/areas/${area.body.id}`, { method: 'DELETE' })).response.status, 200);

    const slot = await api('/api/tables/slots', { method: 'POST', body: { name: '测试时段', startTime: '06:00', endTime: '07:00', sortOrder: 99 } });
    assert.equal(slot.response.status, 201);
    const slotUpdate = await api(`/api/tables/slots/${slot.body.id}`, { method: 'PATCH', body: { endTime: '07:30' } });
    assert.equal(slotUpdate.response.status, 200);
    assert.equal((await api(`/api/tables/slots/${slot.body.id}`, { method: 'DELETE' })).response.status, 200);
  });

  await t.test('reports return summary, trend, distributions and top customers', async () => {
    const { response, body } = await api(`/api/reports?from=${addDays(today, -30)}&to=${tomorrow}`);
    assert.equal(response.status, 200);
    assert.ok(body.range.from < body.range.to);
    assert.ok(body.appointments.total >= 10);
    assert.ok(typeof body.appointments.completionRate === 'number');
    assert.ok(body.revenue.total >= 0);
    assert.ok(body.calls.total >= 1);
    assert.ok(body.trend.length >= 7);
    assert.ok(Array.isArray(body.distributions.status));
    assert.ok(Array.isArray(body.distributions.source));
    assert.ok(Array.isArray(body.topCustomers));
    assert.ok(body.topCustomers.length >= 1);
  });

  await t.test('notifications can be listed, marked read and deleted', async () => {
    const list = await api('/api/notifications?pageSize=50');
    assert.equal(list.response.status, 200);
    assert.ok(Array.isArray(list.body.items));
    assert.ok(list.body.unread >= 1);
    const marked = await api('/api/notifications/read-all', { method: 'POST', body: {} });
    assert.equal(marked.response.status, 200);
    const after = await api('/api/notifications?unread=true&pageSize=10');
    assert.equal(after.body.unread, 0);
    assert.equal(after.body.items.length, 0);
  });

  await t.test('settings persist rules and mask sensitive integration secrets', async () => {
    const initial = await api('/api/settings');
    assert.equal(initial.response.status, 200);
    assert.ok(initial.body.settings.business_name);
    assert.ok(initial.body.meta.conflictWindow.value >= 15);
    assert.ok(initial.body.meta.disclaimer.includes('模拟'));

    const updated = await api('/api/settings', {
      method: 'PATCH', body: { conflict_window_minutes: 45, auto_confirm: true, feishu_app_secret: 'demo-secret-value-123' }
    });
    assert.equal(updated.response.status, 200);
    assert.ok(updated.body.updated.includes('conflict_window_minutes'));
    assert.equal(updated.body.settings.conflict_window_minutes, 45);
    assert.equal(updated.body.settings.auto_confirm, true);
    assert.notEqual(updated.body.settings.feishu_app_secret, 'demo-secret-value-123');
    assert.equal(updated.body.settings.feishu_app_secret_set, true);

    const conflict = await api('/api/appointments/check', {
      method: 'POST', body: { date: today, time: '12:10', partySize: 2, tableId: 'table_a01' }
    });
    assert.equal(conflict.body.windowMinutes, 45);

    const badTelephony = await api('/api/settings', { method: 'PATCH', body: { telephony_mode: 'sip' } });
    assert.equal(badTelephony.response.status, 422);
    assert.equal(badTelephony.body.error.code, 'INVALID_TELEPHONY_MODE');
    const adbTelephony = await api('/api/settings', { method: 'PATCH', body: { telephony_mode: 'adb' } });
    assert.equal(adbTelephony.response.status, 200);
    assert.equal(adbTelephony.body.settings.telephony_mode, 'adb');
    await api('/api/settings', { method: 'PATCH', body: { conflict_window_minutes: 90, auto_confirm: false, telephony_mode: 'mock' } });
  });

  await t.test('integration adapters are mocked, labelled and never presented as real', async () => {
    const status = await api('/api/integrations');
    assert.equal(status.response.status, 200);
    assert.match(status.body.disclosure, /模拟/);
    assert.ok(status.body.telephony.mode);
    assert.ok(status.body.ai.stt.mode);
    assert.ok(Array.isArray(status.body.syncJobs));

    const ai = await api('/api/integrations/ai/test', { method: 'POST', body: {} });
    assert.equal(ai.response.status, 200);
    assert.equal(ai.body.simulated, true);
    const telephony = await api('/api/integrations/telephony/test', { method: 'POST', body: {} });
    assert.equal(telephony.body.simulated, true);
    const feishu = await api('/api/integrations/feishu/test', { method: 'POST', body: {} });
    assert.equal(feishu.response.status, 200);
    const sync = await api('/api/integrations/feishu/sync', { method: 'POST', body: { direction: 'both' } });
    assert.equal(sync.response.status, 201);
    assert.equal(sync.body.simulated, true);
    assert.equal(sync.body.job.direction, 'both');
    const webhook = await api('/api/integrations/webhook/test', { method: 'POST', body: { url: 'https://example.com/hooks/demo' } });
    assert.equal(webhook.response.status, 200);
    assert.equal(webhook.body.simulated, true);
    assert.match(webhook.body.note, /模拟/);
  });

  await t.test('CSV/JSON export, CSV import and local backup restore work', async () => {
    const csv = await api('/api/data/export/csv?type=customers');
    assert.equal(csv.response.status, 200);
    assert.match(csv.response.headers.get('content-type'), /text\/csv/);
    assert.match(csv.text.split('\n')[0], /name/);
    assert.ok(csv.text.split('\n').length >= 5);

    const json = await api('/api/data/export/json');
    assert.equal(json.response.status, 200);
    assert.equal(json.body.format, 'callflow-full-backup');
    assert.ok(json.body.data.customers.length >= 5);
    assert.equal(json.body.data.users, undefined);

    const imported = await api('/api/data/import/csv', {
      method: 'POST', body: { type: 'customers', content: 'name,phone,tier,tags\nCSV 导入客户,13900000061,regular,"[""CSV""]"\n' }
    });
    assert.equal(imported.response.status, 200);
    assert.equal(imported.body.imported, 1);
    const csvCustomer = await api('/api/customers?search=13900000061');
    assert.ok(csvCustomer.body.items.some((item) => item.name === 'CSV 导入客户'));

    const backup = await api('/api/data/backups', { method: 'POST', body: {} });
    assert.equal(backup.response.status, 201);
    assert.ok(backup.body.backup.filename.endsWith('.json'));
    const backups = await api('/api/data/backups');
    assert.ok(backups.body.items.some((item) => item.filename === backup.body.backup.filename));
    const restored = await api('/api/data/backups/restore', { method: 'POST', body: { filename: backup.body.backup.filename } });
    assert.equal(restored.response.status, 200);
    assert.ok(restored.body.counts.customers >= 1);
  });

  await t.test('admin user lifecycle, audit trail and diagnostics are real', async () => {
    const users = await api('/api/admin/users');
    assert.equal(users.response.status, 200);
    assert.ok(users.body.items.length >= 4);
    assert.ok(users.body.roles.admin.includes('*'));

    const created = await api('/api/admin/users', {
      method: 'POST',
      body: { username: 'qa_agent', displayName: '测试坐席', password: 'QualityPass!2026', role: 'agent', active: true }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.user.role, 'agent');
    const userId = created.body.user.id;

    const updated = await api(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'viewer', displayName: '测试只读' } });
    assert.equal(updated.body.user.role, 'viewer');
    const disabled = await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
    assert.equal(disabled.response.status, 200);
    const blocked = await raw('/api/auth/login', { method: 'POST', body: { username: 'qa_agent', password: 'QualityPass!2026' } });
    assert.equal(blocked.response.status, 401);

    const audit = await api('/api/admin/audit?pageSize=100');
    assert.equal(audit.response.status, 200);
    assert.ok(audit.body.total >= 5);
    assert.ok(audit.body.items.some((item) => item.action === 'user.create'));

    const diagnostics = await api('/api/admin/diagnostics');
    assert.equal(diagnostics.response.status, 200);
    assert.equal(diagnostics.body.database.integrity, 'ok');
    assert.ok(diagnostics.body.database.counts.appointments >= 10);
    assert.ok(diagnostics.body.warnings.some((warning) => warning.includes('模拟')));
  });

  await t.test('appointment guards: initial status, auto confirm and historical edits', async () => {
    const terminal = await api('/api/appointments', {
      method: 'POST',
      body: { guestName: '终态初始值', phone: '13900000081', date: tomorrow, time: '22:30', partySize: 2, source: 'phone', status: 'completed' }
    });
    assert.equal(terminal.response.status, 422);
    assert.equal(terminal.body.error.code, 'INVALID_INITIAL_STATUS');

    await api('/api/settings', { method: 'PATCH', body: { auto_confirm: true } });
    const auto = await api('/api/appointments', {
      method: 'POST',
      body: { guestName: '自动确认', phone: '13900000082', date: tomorrow, time: '21:00', partySize: 2, source: 'phone' }
    });
    assert.equal(auto.response.status, 201);
    assert.equal(auto.body.item.status, 'confirmed');
    const online = await api('/api/appointments', {
      method: 'POST',
      body: { guestName: '在线不自动确认', phone: '13900000083', date: tomorrow, time: '21:00', partySize: 2, source: 'online' }
    });
    assert.equal(online.body.item.status, 'pending');
    await api('/api/settings', { method: 'PATCH', body: { auto_confirm: false } });

    const pastList = await api(`/api/appointments?to=${addDays(today, -1)}&pageSize=50`);
    const past = pastList.body.items.find((item) => !item.comboId);
    assert.ok(past, '演示数据应包含历史预约');
    const sameDate = await api(`/api/appointments/${past.id}`, {
      method: 'PATCH', body: { date: past.date, time: past.time, tableId: null, comboId: null, notes: '历史预约备注编辑' }
    });
    assert.equal(sameDate.response.status, 200);
    const toPast = await api(`/api/appointments/${past.id}`, {
      method: 'PATCH', body: { date: '2020-01-01', tableId: null, comboId: null }
    });
    assert.equal(toPast.response.status, 422);
    assert.equal(toPast.body.error.code, 'PAST_DATE');
  });

  await t.test('table/combo integrity and slot validation protect active bookings', async () => {
    const area = await api('/api/tables/areas', { method: 'POST', body: { name: '完整性区域', sortOrder: 96 } });
    const tableA = await api('/api/tables/tables', { method: 'POST', body: { name: 'INT1', areaId: area.body.id, capacity: 2 } });
    const tableB = await api('/api/tables/tables', { method: 'POST', body: { name: 'INT2', areaId: area.body.id, capacity: 4 } });
    const tableC = await api('/api/tables/tables', { method: 'POST', body: { name: 'INT3', areaId: area.body.id, capacity: 2 } });
    const singleCombo = await api('/api/tables/combos', { method: 'POST', body: { name: '单桌组合', tableIds: [tableA.body.id] } });
    assert.equal(singleCombo.response.status, 400);
    const duplicateCombo = await api('/api/tables/combos', { method: 'POST', body: { name: '重复桌台组合', tableIds: [tableA.body.id, tableA.body.id] } });
    assert.equal(duplicateCombo.response.status, 422);
    assert.equal(duplicateCombo.body.error.code, 'INVALID_TABLE_SELECTION');
    const combo = await api('/api/tables/combos', { method: 'POST', body: { name: '完整性组合', tableIds: [tableA.body.id, tableB.body.id] } });
    assert.equal(combo.body.capacity, 6);

    const comboApt = await api('/api/appointments', {
      method: 'POST',
      body: { guestName: '组合预约', phone: '13900000084', date: tomorrow, time: '10:00', partySize: 4, comboId: combo.body.id, source: 'phone', status: 'confirmed' }
    });
    assert.equal(comboApt.response.status, 201);
    const second = await api('/api/appointments', {
      method: 'POST',
      body: { guestName: '组合第二单', phone: '13900000085', date: tomorrow, time: '11:00', partySize: 2, comboId: combo.body.id, source: 'phone', status: 'confirmed', overrideConflict: true }
    });
    assert.equal(second.response.status, 201);

    const layout = await api(`/api/tables?date=${tomorrow}`);
    const memberA = layout.body.tables.find((item) => item.id === tableA.body.id);
    const memberB = layout.body.tables.find((item) => item.id === tableB.body.id);
    assert.equal(memberA.bookedAppointmentId, comboApt.body.item.id);
    assert.equal(memberB.bookedAppointmentId, comboApt.body.item.id);

    const reduce = await api(`/api/tables/tables/${tableB.body.id}`, { method: 'PATCH', body: { capacity: 1 } });
    assert.equal(reduce.response.status, 422);
    assert.equal(reduce.body.error.code, 'CAPACITY_BELOW_ACTIVE_APPOINTMENT');
    const deleteMember = await api(`/api/tables/tables/${tableA.body.id}`, { method: 'DELETE' });
    assert.equal(deleteMember.response.status, 409);
    assert.equal(deleteMember.body.error.code, 'TABLE_IN_COMBO');
    const deleteCombo = await api(`/api/tables/combos/${combo.body.id}`, { method: 'DELETE' });
    assert.equal(deleteCombo.response.status, 409);
    assert.equal(deleteCombo.body.error.code, 'COMBO_IN_USE');
    const changeTables = await api(`/api/tables/combos/${combo.body.id}`, { method: 'PATCH', body: { tableIds: [tableA.body.id, tableC.body.id] } });
    assert.equal(changeTables.response.status, 409);
    assert.equal(changeTables.body.error.code, 'COMBO_IN_USE');
    const reduceCombo = await api(`/api/tables/combos/${combo.body.id}`, { method: 'PATCH', body: { capacity: 2 } });
    assert.equal(reduceCombo.response.status, 422);
    assert.equal(reduceCombo.body.error.code, 'CAPACITY_BELOW_ACTIVE_APPOINTMENT');

    const conflict = await api(`/api/appointments/${second.body.item.id}`, { method: 'PATCH', body: { time: '11:15' } });
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.error.code, 'TABLE_CONFLICT');
    await api('/api/settings', { method: 'PATCH', body: { conflict_window_minutes: 30 } });
    const narrowWindow = await api(`/api/appointments/${second.body.item.id}`, { method: 'PATCH', body: { time: '11:15' } });
    assert.equal(narrowWindow.response.status, 200);
    await api('/api/settings', { method: 'PATCH', body: { conflict_window_minutes: 90 } });

    const badSlot = await api('/api/tables/slots', { method: 'POST', body: { name: '倒置时段', startTime: '07:00', endTime: '06:00' } });
    assert.equal(badSlot.response.status, 422);
    assert.equal(badSlot.body.error.code, 'INVALID_TIME_RANGE');
    const slot = await api('/api/tables/slots', { method: 'POST', body: { name: '完整性时段', startTime: '06:00', endTime: '07:00' } });
    assert.equal(slot.response.status, 201);
    const badSlotUpdate = await api(`/api/tables/slots/${slot.body.id}`, { method: 'PATCH', body: { endTime: '05:30' } });
    assert.equal(badSlotUpdate.response.status, 422);
    assert.equal(badSlotUpdate.body.error.code, 'INVALID_TIME_RANGE');
    const slotUpdate = await api(`/api/tables/slots/${slot.body.id}`, { method: 'PATCH', body: { endTime: '07:30' } });
    assert.equal(slotUpdate.response.status, 200);
    const slotAudit = await api('/api/admin/audit?action=slot.&pageSize=200');
    assert.ok(slotAudit.body.items.some((row) => row.entityId === slot.body.id));

    assert.equal((await api(`/api/tables/slots/${slot.body.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/appointments/${comboApt.body.item.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/appointments/${second.body.item.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/tables/combos/${combo.body.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/tables/tables/${tableA.body.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/tables/tables/${tableB.body.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/tables/tables/${tableC.body.id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await api(`/api/tables/areas/${area.body.id}`, { method: 'DELETE' })).response.status, 200);
  });

  await t.test('walk-in guards: phone required, status and date rules, capacity', async () => {
    const noPhone = await api('/api/walk-ins', { method: 'POST', body: { name: '无电话散客', phone: '', date: tomorrow, time: '12:00', partySize: 2, tableId: null, notes: '' } });
    assert.equal(noPhone.response.status, 201);
    const blocked = await api(`/api/walk-ins/${noPhone.body.item.id}/convert`, { method: 'POST', body: { time: '12:00', partySize: 2 } });
    assert.equal(blocked.response.status, 422);
    assert.equal(blocked.body.error.code, 'WALKIN_PHONE_REQUIRED');
    const converted = await api(`/api/walk-ins/${noPhone.body.item.id}/convert`, { method: 'POST', body: { phone: '13900000091', time: '12:00', partySize: 2 } });
    assert.equal(converted.response.status, 201);
    assert.equal(converted.body.appointment.phone, '13900000091');

    const manualConverted = await api('/api/walk-ins', { method: 'POST', body: { name: '手动终态', phone: '13900000092', date: tomorrow, time: '13:00', partySize: 2, status: 'converted' } });
    assert.equal(manualConverted.response.status, 422);
    assert.equal(manualConverted.body.error.code, 'INVALID_WALKIN_STATUS');
    const badPhone = await api('/api/walk-ins', { method: 'POST', body: { name: '错误手机号', phone: '123', date: tomorrow, time: '13:10', partySize: 2 } });
    assert.equal(badPhone.response.status, 400);
    assert.equal(badPhone.body.error.code, 'VALIDATION_ERROR');
    const pastUpdate = await api('/api/walk-ins', { method: 'POST', body: { name: '历史散客', phone: '13900000093', date: tomorrow, time: '16:00', partySize: 2 } });
    const toPast = await api(`/api/walk-ins/${pastUpdate.body.item.id}`, { method: 'PATCH', body: { date: '2020-01-01' } });
    assert.equal(toPast.response.status, 422);
    assert.equal(toPast.body.error.code, 'PAST_DATE');
    const capacity = await api('/api/walk-ins', { method: 'POST', body: { name: '超容量散客', phone: '13900000094', date: tomorrow, time: '12:10', partySize: 5, tableId: 'table_a01' } });
    assert.equal(capacity.response.status, 422);
    assert.equal(capacity.body.error.code, 'CAPACITY_EXCEEDED');
  });

  await t.test('call linking syncs customer, analysis shapes keywords and dedupes alerts', async () => {
    const createdCall = await api('/api/calls', {
      method: 'POST', body: { contactName: '关联客户', phone: '13900000101', direction: 'inbound', status: 'completed', durationSeconds: 30, followUp: false, notes: '关联测试' }
    });
    assert.ok(createdCall.body.item.customerId == null);
    const appointment = await api('/api/appointments', {
      method: 'POST', body: { guestName: '关联客户', phone: '13900000101', date: tomorrow, time: '20:40', partySize: 2, source: 'phone', status: 'pending' }
    });
    const customerId = appointment.body.item.customerId;
    const linked = await api(`/api/calls/${createdCall.body.item.id}/link`, { method: 'POST', body: { appointmentId: appointment.body.item.id } });
    assert.equal(linked.body.item.customerId, customerId);
    const unlinked = await api(`/api/calls/${createdCall.body.item.id}/link`, { method: 'POST', body: { appointmentId: null } });
    assert.equal(unlinked.body.item.customerId, customerId);
    const phoneChanged = await api(`/api/calls/${createdCall.body.item.id}`, { method: 'PATCH', body: { phone: '13900009999' } });
    assert.equal(phoneChanged.body.item.customerId, null);

    const keywordCall = await api('/api/calls', {
      method: 'POST', body: { contactName: '标签格式', phone: '13900000102', direction: 'inbound', status: 'completed', durationSeconds: 20, followUp: false, notes: '' }
    });
    const analysis = await api(`/api/calls/${keywordCall.body.item.id}/analyze`, { method: 'POST', body: {} });
    assert.ok(analysis.body.call.keywords.length >= 1);
    assert.ok(analysis.body.call.keywords.every((keyword) => typeof keyword.key === 'string' && !('term' in keyword)));

    const riskyCall = await api('/api/calls', {
      method: 'POST', body: { contactName: '投诉客户', phone: '13900000103', direction: 'inbound', status: 'completed', durationSeconds: 60, transcript: '我要投诉，等了一个小时，非常不满。', followUp: true, notes: '' }
    });
    const riskyId = riskyCall.body.item.id;
    const first = await api(`/api/calls/${riskyId}/analyze`, { method: 'POST', body: {} });
    assert.ok(first.body.call.keywords.some((keyword) => keyword.level === 'high'));
    await api(`/api/calls/${riskyId}/analyze`, { method: 'POST', body: {} });
    const notices = await api('/api/notifications?pageSize=200');
    const riskNotices = notices.body.items.filter((item) => item.entityId === riskyId && item.title === '通话需要重点跟进');
    assert.equal(riskNotices.length, 1);
  });

  await t.test('reports honor explicit ranges and label all area distributions', async () => {
    const report = await api(`/api/reports?from=${today}&to=${tomorrow}`);
    assert.equal(report.response.status, 200);
    assert.deepEqual(report.body.trend.map((item) => item.date), [today, tomorrow]);
    assert.ok(report.body.distributions.area.every((item) => typeof item.area === 'string' && item.area.length > 0));
  });

  await t.test('data safeguards: CSV injection, import validation, confirmReplace, backups and clear scope', async () => {
    await api('/api/customers', { method: 'POST', body: { name: '=SUM(1,1)', phone: '13900000111', tier: 'new', preferences: '', allergies: '', notes: '', tags: [] } });
    const csv = await api('/api/data/export/csv?type=customers');
    assert.ok(csv.text.includes("'=SUM(1,1)"));

    const imported = await api('/api/data/import/csv', {
      method: 'POST',
      body: {
        type: 'appointments',
        content: `id,guest_name,phone,date,time,party_size,source,status\ncsv_ok_1,CSV预约,13900000112,${tomorrow},04:00,2,online,pending\ncsv_bad,CSV坏行,123,${tomorrow},04:10,2,online,pending\n`
      }
    });
    assert.equal(imported.response.status, 200);
    assert.equal(imported.body.imported, 1);
    assert.equal(imported.body.skipped, 1);

    const exported = await api('/api/data/export/json');
    const noConfirm = await api('/api/data/import/json', { method: 'POST', body: exported.body });
    assert.equal(noConfirm.response.status, 409);
    assert.equal(noConfirm.body.error.code, 'CONFIRM_REQUIRED');
    const empty = await api('/api/data/import/json', { method: 'POST', body: { format: 'callflow-full-backup', data: {}, confirmReplace: true } });
    assert.equal(empty.response.status, 422);
    assert.equal(empty.body.error.code, 'EMPTY_BACKUP');

    const backupOne = await api('/api/data/backups', { method: 'POST', body: {} });
    const backupTwo = await api('/api/data/backups', { method: 'POST', body: {} });
    assert.notEqual(backupOne.body.backup.filename, backupTwo.body.backup.filename);

    const cleared = await api('/api/data/clear', { method: 'POST', body: { scope: 'appointments' } });
    assert.equal(cleared.response.status, 200);
    const walkIns = await api('/api/walk-ins?search=13900000091');
    const convertedWalkIn = walkIns.body.items.find((item) => item.phone === '13900000091');
    assert.ok(convertedWalkIn);
    assert.equal(convertedWalkIn.status, 'seated');
    assert.equal(convertedWalkIn.convertedAppointmentId, null);
  });

  await t.test('demo reset restores fictional seed data without touching users', async () => {
    const reset = await api('/api/data/reset-demo', { method: 'POST', body: {} });
    assert.equal(reset.response.status, 200);
    const dashboard = await api(`/api/dashboard?date=${today}`);
    assert.ok(dashboard.body.metrics.appointments >= 5);
    const me = await api('/api/auth/me');
    assert.equal(me.body.user.username, 'admin');
    const users = await api('/api/admin/users');
    assert.ok(users.body.items.length >= 4);
  });
});
