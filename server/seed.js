import { hashPassword } from './lib/security.js';
import { addDays, localDateString, localDateTime } from './lib/time.js';
import { buildDialog, analyzeCall } from './adapters/ai.js';
import { SETTING_DEFAULTS } from './domain/settings.js';

function id(prefix, index) {
  return `${prefix}_demo_${String(index).padStart(2, '0')}`;
}

function insertSettings(db, now) {
  const statement = db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) statement.run(key, JSON.stringify(value), now);
}

function seedUsers(db, now) {
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count);
  if (count > 0) return;
  const accounts = [
    ['admin', '演示管理员', process.env.DEMO_ADMIN_PASSWORD || 'CallFlowDemo!2026', 'admin'],
    ['manager', '演示经理', process.env.DEMO_MANAGER_PASSWORD || 'CallFlowManager!2026', 'manager'],
    ['agent', '演示坐席', process.env.DEMO_AGENT_PASSWORD || 'CallFlowAgent!2026', 'agent'],
    ['viewer', '演示只读', process.env.DEMO_VIEWER_PASSWORD || 'CallFlowViewer!2026', 'viewer']
  ];
  const statement = db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, role, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);
  for (const [username, displayName, password, role] of accounts) {
    statement.run(`user_demo_${username}`, username, displayName, hashPassword(password), role, now, now);
  }
}

export function seedDemoData(db, { manageTransaction = true } = {}) {
  const now = localDateTime();
  insertSettings(db, now);
  seedUsers(db, now);
  const existing = Number(db.prepare('SELECT COUNT(*) AS count FROM customers').get().count);
  if (existing > 0) return;

  if (manageTransaction) db.exec('BEGIN');
  try {
    const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()?.id || null;
    const areas = [
      ['area_window', '窗边', 1], ['area_hall', '大厅', 2],
      ['area_quiet', '安静区', 3], ['area_private', '包间', 4], ['area_terrace', '露台', 5]
    ];
    const insertArea = db.prepare('INSERT OR IGNORE INTO areas (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)');
    for (const area of areas) insertArea.run(...area, now);

    const tables = [
      ['table_a01', 'A01', 'area_window', 2, 'round', 1, 1, 'available', ''],
      ['table_a02', 'A02', 'area_window', 2, 'round', 2, 1, 'available', ''],
      ['table_a03', 'A03', 'area_window', 4, 'square', 3, 1, 'available', ''],
      ['table_a04', 'A04', 'area_hall', 4, 'square', 1, 2, 'available', ''],
      ['table_b01', 'B01', 'area_hall', 4, 'square', 2, 2, 'available', ''],
      ['table_b02', 'B02', 'area_hall', 6, 'round', 3, 2, 'available', ''],
      ['table_b03', 'B03', 'area_quiet', 4, 'square', 1, 3, 'available', 'quiet'],
      ['table_b04', 'B04', 'area_quiet', 4, 'square', 2, 3, 'available', 'quiet'],
      ['table_c01', 'C01', 'area_private', 8, 'round', 1, 4, 'available', 'private'],
      ['table_c02', 'C02', 'area_private', 8, 'round', 2, 4, 'available', 'private'],
      ['table_d01', 'D01', 'area_terrace', 6, 'round', 1, 5, 'available', ''],
      ['table_d02', 'D02', 'area_terrace', 6, 'round', 2, 5, 'available', ''],
      ['table_e01', 'E01', 'area_hall', 2, 'square', 4, 2, 'cleaning', ''],
      ['table_e02', 'E02', 'area_quiet', 10, 'square', 3, 3, 'disabled', 'large']
    ];
    const insertTable = db.prepare(`
      INSERT OR IGNORE INTO dining_tables
        (id, name, area_id, capacity, shape, x, y, status, combo_group, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    for (const table of tables) insertTable.run(...table, now, now);

    const combos = [
      ['combo_private_a', '二连包间 A', 16, 'C01 + C02，适合商务宴请', 1],
      ['combo_quiet_b', '二连安静区 B', 8, 'B03 + B04，可做小型私密聚会', 1]
    ];
    const insertCombo = db.prepare(`
      INSERT OR IGNORE INTO combo_rooms (id, name, capacity, notes, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const combo of combos) insertCombo.run(...combo, now, now);
    const comboLinks = [
      ['combo_private_a', 'table_c01'], ['combo_private_a', 'table_c02'],
      ['combo_quiet_b', 'table_b03'], ['combo_quiet_b', 'table_b04']
    ];
    for (const link of comboLinks) {
      db.prepare('INSERT OR IGNORE INTO combo_room_tables (combo_id, table_id) VALUES (?, ?)').run(...link);
    }

    const slots = [
      ['slot_lunch', '午市', '11:00', '14:00', 1],
      ['slot_dinner', '晚市', '17:00', '22:00', 2]
    ];
    const insertSlot = db.prepare('INSERT OR IGNORE INTO time_slots (id, name, start_time, end_time, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)');
    for (const slot of slots) insertSlot.run(...slot);

    const customers = [
      ['cust_demo_01', '演示客户 01', '13800000001', 'vip', '靠窗、安静座位', '花生', '偏好在到店前确认菜单；资料均为虚构。', ['VIP', '靠窗', '高价值'], 6820, 18],
      ['cust_demo_02', '演示客户 02', '13800000002', 'regular', '包间', '', '企业小型聚餐，需要停车指引。', ['商务宴请', '停车'], 3280, 9],
      ['cust_demo_03', '演示客户 03', '13800000003', 'regular', '不要临通道', '海鲜', '常在工作日中午到店。', ['午市常客', '忌口'], 2260, 11],
      ['cust_demo_04', '演示客户 04', '13800000004', 'vip', '偏好低糖饮品', '', '纪念日场景，可提前准备卡片。', ['VIP', '纪念日'], 5160, 14],
      ['cust_demo_05', '演示客户 05', '13800000005', 'new', '', '乳制品', '首次预约，来自线上渠道。', ['新客户', '忌口'], 268, 1],
      ['cust_demo_06', '演示客户 06', '13800000006', 'regular', '靠墙座位', '', '家庭聚餐，需要儿童座椅。', ['家庭聚餐', '儿童'], 1840, 7],
      ['cust_demo_07', '演示客户 07', '13800000007', 'new', '', '', '新客户，电话中未补充特殊偏好。', ['新客户'], 0, 0],
      ['cust_demo_08', '演示客户 08', '13800000008', 'regular', '安静区域', '坚果', '曾提出需要儿童座椅。', ['安静区', '忌口'], 2980, 8],
      ['cust_demo_09', '演示客户 09', '13800000009', 'new', '', '', '历史预约演示。', ['历史客户'], 560, 2],
      ['cust_demo_10', '演示客户 10', '13800000010', 'vip', '包间、靠窗', '', '高价值客户，偏好商务宴请。', ['VIP', '商务宴请'], 9240, 22],
      ['cust_demo_11', '演示客户 11', '13800000011', 'regular', '露台', '酒精', '喜欢露台位置。', ['露台'], 1420, 5],
      ['cust_demo_12', '演示客户 12', '13800000012', 'new', '', '', '电话咨询后未预约，用于跟进演示。', ['待跟进'], 0, 0]
    ];
    const insertCustomer = db.prepare(`
      INSERT INTO customers
        (id, name, phone, tier, preferences, allergies, notes, tags, total_spent, visit_count, last_contact_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const customer of customers) {
      const [cid, name, phone, tier, preferences, allergies, notes, tags, totalSpent, visits] = customer;
      insertCustomer.run(cid, name, phone, tier, preferences, allergies, notes, JSON.stringify(tags), totalSpent, visits, now, now, now);
    }

    const today = localDateString();
    const yesterday = addDays(today, -1);
    const lastWeek = addDays(today, -7);
    const tomorrow = addDays(today, 1);
    const inTwoDays = addDays(today, 2);
    const inThreeDays = addDays(today, 3);
    const inFiveDays = addDays(today, 5);
    const appointments = [
      [1, 'cust_demo_01', '演示客户 01', '13800000001', today, '11:30', 2, 'table_a01', null, 'phone', 'confirmed', '普通用餐', '靠窗，避免花生类菜品。'],
      [2, 'cust_demo_02', '演示客户 02', '13800000002', today, '12:00', 4, 'table_b02', null, 'referral', 'seated', '商务用餐', '需要停车位指引。'],
      [3, 'cust_demo_03', '演示客户 03', '13800000003', today, '12:30', 2, 'table_a03', null, 'walk_in', 'confirmed', '普通用餐', '不要临通道，海鲜过敏。'],
      [4, 'cust_demo_04', '演示客户 04', '13800000004', today, '17:30', 6, 'table_d01', null, 'phone', 'confirmed', '纪念日', '准备一张简洁的纪念日卡片。'],
      [5, 'cust_demo_05', '演示客户 05', '13800000005', today, '18:00', 4, 'table_a04', null, 'online', 'pending', '普通用餐', '线上留言：乳制品过敏。'],
      [6, 'cust_demo_06', '演示客户 06', '13800000006', today, '19:00', 4, 'table_b04', null, 'phone', 'confirmed', '家庭聚餐', '靠墙座位，需要儿童座椅。'],
      [7, 'cust_demo_07', '演示客户 07', '13800000007', today, '19:30', 2, 'table_a02', null, 'phone', 'pending', '普通用餐', '待二次确认。'],
      [8, 'cust_demo_08', '演示客户 08', '13800000008', today, '20:00', 6, 'table_c01', null, 'phone', 'cancelled', '朋友聚会', '客户已取消，桌台可重新安排。'],
      [9, 'cust_demo_01', '演示客户 01', '13800000001', yesterday, '18:30', 2, 'table_a01', null, 'phone', 'completed', '普通用餐', '已完成的历史预约。'],
      [10, 'cust_demo_09', '演示客户 09', '13800000009', yesterday, '19:30', 4, 'table_b01', null, 'other', 'no_show', '普通用餐', '未到店，已记录用于演示状态。'],
      [11, 'cust_demo_02', '演示客户 02', '13800000002', tomorrow, '12:00', 4, 'table_b02', null, 'phone', 'confirmed', '商务用餐', '确认包间附近座位。'],
      [12, 'cust_demo_04', '演示客户 04', '13800000004', tomorrow, '18:30', 8, 'table_c02', null, 'phone', 'pending', '生日', '询问是否能准备无乳制品甜点。'],
      [13, 'cust_demo_06', '演示客户 06', '13800000006', inTwoDays, '19:00', 4, 'table_b03', null, 'referral', 'confirmed', '家庭聚餐', '希望安排儿童座椅。'],
      [14, 'cust_demo_03', '演示客户 03', '13800000003', inFiveDays, '12:30', 2, 'table_a03', null, 'phone', 'confirmed', '普通用餐', '海鲜过敏，已标记。'],
      [15, 'cust_demo_01', '演示客户 01', '13800000001', lastWeek, '18:00', 2, 'table_a02', null, 'phone', 'completed', '普通用餐', '历史到店记录。'],
      [16, 'cust_demo_10', '演示客户 10', '13800000010', today, '18:30', 10, null, 'combo_private_a', 'phone', 'confirmed', '商务宴请', '使用二连包间，需要发票与安静环境。'],
      [17, 'cust_demo_10', '演示客户 10', '13800000010', tomorrow, '19:00', 8, null, 'combo_quiet_b', 'phone', 'pending', '商务宴请', '使用二连安静区，确认最终人数。'],
      [18, 'cust_demo_11', '演示客户 11', '13800000011', today, '21:00', 6, 'table_d02', null, 'online', 'confirmed', '朋友聚会', '露台位置，酒精过敏。'],
      [19, 'cust_demo_12', '演示客户 12', '13800000012', tomorrow, '17:30', 4, 'table_a04', null, 'online', 'confirmed', '普通用餐', '首次到店，发送停车指引。'],
      [20, 'cust_demo_11', '演示客户 11', '13800000011', inThreeDays, '11:30', 4, 'table_b01', null, 'phone', 'confirmed', '普通用餐', '露台满时安排大厅。']
    ];
    const insertAppointment = db.prepare(`
      INSERT INTO appointments
        (id, customer_id, guest_name, phone, date, time, party_size, table_id, combo_id, source, status,
         occasion, notes, conflict_override, created_by, created_at, updated_at, cancelled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `);
    const insertHistory = db.prepare(`
      INSERT INTO appointment_status_history (id, appointment_id, from_status, to_status, changed_by, note, created_at)
      VALUES (?, ?, '', ?, ?, '演示数据初始化', ?)
    `);
    for (const item of appointments) {
      const [index, customerId, name, phone, date, time, party, tableId, comboId, source, status, occasion, notes] = item;
      const appointmentId = id('apt', index);
      insertAppointment.run(
        appointmentId, customerId, name, phone, date, time, party, tableId, comboId, source, status,
        occasion, notes, adminId, now, now, status === 'cancelled' ? now : ''
      );
      insertHistory.run(id('ash', index), appointmentId, status, adminId, now);
    }

    const payments = [
      [1, 'cust_demo_01', id('apt', 9), 688, 'wechat', '两人晚餐', -26],
      [2, 'cust_demo_01', id('apt', 15), 920, 'card', '历史消费', -7],
      [3, 'cust_demo_02', id('apt', 2), 1280, 'alipay', '商务用餐', -1],
      [4, 'cust_demo_04', id('apt', 9), 1560, 'wechat', '纪念日套餐', -20],
      [5, 'cust_demo_10', id('apt', 16), 3280, 'credit', '商务宴请', -2],
      [6, 'cust_demo_06', id('apt', 13), 760, 'cash', '家庭聚餐', -5],
      [7, 'cust_demo_08', id('apt', 8), 268, 'alipay', '朋友聚会', -3],
      [8, 'cust_demo_11', id('apt', 18), 540, 'wechat', '露台晚餐', -1]
    ];
    const insertPayment = db.prepare(`
      INSERT INTO payments (id, customer_id, appointment_id, amount, method, note, receipt_ref, paid_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?)
    `);
    for (const [index, customerId, appointmentId, amount, method, note, hoursAgo] of payments) {
      const paidAt = localDateTime(new Date(Date.now() + hoursAgo * 3_600_000));
      insertPayment.run(id('pay', index), customerId, appointmentId, amount, method, note, paidAt, adminId, paidAt);
    }

    const walkIns = [
      [1, '演示散客 01', '13700000001', null, today, '12:10', 2, 'table_e01', '午市临时到店，等待清理桌台。', 'waiting'],
      [2, '演示散客 02', '13700000002', 'cust_demo_06', today, '13:00', 4, 'table_b01', '已入座，关联家庭客户。', 'seated'],
      [3, '演示散客 03', '13700000003', null, yesterday, '18:40', 3, 'table_a04', '已转为正式预约用于演示。', 'converted']
    ];
    const insertWalkIn = db.prepare(`
      INSERT INTO walk_ins (id, name, phone, customer_id, date, time, party_size, table_id, notes, status, converted_appointment_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [index, name, phone, customerId, date, time, party, tableId, notes, status] of walkIns) {
      insertWalkIn.run(id('walk', index), name, phone, customerId, date, time, party, tableId, notes, status, status === 'converted' ? id('apt', 20) : null, adminId, now, now);
    }

    const customerRows = db.prepare('SELECT * FROM customers').all().map((row) => ({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      totalSpent: Number(row.total_spent),
      visitCount: Number(row.visit_count)
    }));
    const customerById = Object.fromEntries(customerRows.map((row) => [row.id, row]));
    const callSeeds = [
      [1, 'cust_demo_02', 'reservation', 'completed', 'inbound', 11, 3, false],
      [2, 'cust_demo_10', 'business', 'completed', 'inbound', 16, 5, false],
      [3, 'cust_demo_04', 'birthday', 'follow_up', 'inbound', 12, 8, true],
      [4, 'cust_demo_01', 'complaint', 'follow_up', 'inbound', null, 21, true],
      [5, 'cust_demo_12', 'inquiry', 'completed', 'inbound', null, 26, true],
      [6, 'cust_demo_06', 'reservation', 'completed', 'outbound', 13, 30, false],
      [7, 'cust_demo_03', 'cancel', 'completed', 'inbound', 14, 48, false],
      [8, 'cust_demo_10', 'vip', 'follow_up', 'inbound', 17, 54, true]
    ];
    const insertCall = db.prepare(`
      INSERT INTO calls
        (id, contact_name, phone, customer_id, called_at, answered_at, ended_at, direction, status,
         duration_seconds, recording_ref, transcript, ai_summary, ai_tags, ai_extracted, keywords,
         sentiment, scenario, follow_up, notes, appointment_id, is_simulated, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSegment = db.prepare(`
      INSERT INTO call_segments (id, call_id, speaker, start_ms, end_ms, text, is_final, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    for (const [index, customerId, scenario, status, direction, appointmentIndex, hoursAgo, followUp] of callSeeds) {
      const customer = customerById[customerId];
      const calledAt = localDateTime(new Date(Date.now() - hoursAgo * 3_600_000));
      const segments = buildDialog(customer, scenario);
      const transcript = segments.map((segment) => `${segment.speaker === 'customer' ? '客户' : '坐席'}：${segment.text}`).join('\n');
      const analysis = analyzeCall({ customer, transcript, scenario });
      const duration = Math.round((segments.at(-1)?.endMs || 0) / 1000);
      const callId = id('call', index);
      insertCall.run(
        callId, customer.name, customer.phone, customer.id, calledAt, calledAt, calledAt, direction, status,
        duration, '', transcript, analysis.summary, JSON.stringify(analysis.tags), JSON.stringify(analysis.extracted),
        JSON.stringify(analysis.keywords), analysis.sentiment, scenario, followUp ? 1 : 0, '',
        appointmentIndex ? id('apt', appointmentIndex) : null, 1, adminId, calledAt, calledAt
      );
      for (const segment of segments) {
        insertSegment.run(
          `${callId}_seg_${segment.index}`, callId, segment.speaker,
          segment.startMs, segment.endMs, segment.text, calledAt
        );
      }
    }

    const notifications = [
      [1, 'info', '今日有 7 组预约', '请关注 18:00 后的到店高峰与包间安排。', 'dashboard', ''],
      [2, 'warning', '客户 演示客户 04 有纪念日提醒', '今日 17:30 · 露台 D01 · 6 人。', 'appointment', id('apt', 4)],
      [3, 'success', '模拟通话已完成 AI 分析', '演示客户 10 的商务宴请需求已提取，可创建预约。', 'call', id('call', 2)],
      [4, 'warning', '投诉风险待跟进', '演示客户 01 的模拟通话包含投诉关键词，请主管回访。', 'call', id('call', 4)],
      [5, 'info', '飞书模拟同步完成', '未访问飞书 API，未传输真实数据。', 'sync', id('sync', 1)],
      [6, 'info', '演示数据说明', '本项目所有客户、电话、通话与 AI 结果均为虚构或模拟。', 'system', '']
    ];
    const insertNotification = db.prepare(`
      INSERT INTO notifications (id, type, title, body, entity_type, entity_id, read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `);
    for (const [index, type, title, body, entityType, entityId] of notifications) {
      insertNotification.run(id('notif', index), type, title, body, entityType, entityId, now);
    }

    const syncJobs = [
      [1, 'feishu', 'push', 'simulated', JSON.stringify({ simulated: true, counts: { appointments: 20, customers: 12 }, message: '模拟推送完成' }), now],
      [2, 'feishu', 'pull', 'simulated', JSON.stringify({ simulated: true, imported: 0, message: '模拟拉取完成，无真实数据' }), now]
    ];
    const insertSync = db.prepare(`
      INSERT INTO sync_jobs (id, provider, direction, status, detail, simulated, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);
    for (const [index, provider, direction, status, detail, timestamp] of syncJobs) {
      insertSync.run(id('sync', index), provider, direction, status, detail, timestamp, timestamp);
    }

    const deliveries = [
      [1, 'https://example.invalid/callflow-webhook', 'appointment.created', 'simulated', '{"simulated":true}', 200, '模拟投递：未发起网络请求'],
      [2, 'https://example.invalid/callflow-webhook', 'call.completed', 'simulated', '{"simulated":true}', 200, '模拟投递：未发起网络请求']
    ];
    const insertDelivery = db.prepare(`
      INSERT INTO webhook_deliveries (id, url, event, status, request_body, response_status, response_body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [index, url, event, status, body, responseStatus, responseBody] of deliveries) {
      insertDelivery.run(id('wh', index), url, event, status, body, responseStatus, responseBody, now);
    }

    if (manageTransaction) db.exec('COMMIT');
  } catch (error) {
    if (manageTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
