import { addDays, localDateString } from '../lib/time.js';
import { appointmentSelect, mapAppointment } from './appointments.js';
import { callSelect, mapCall } from './calls.js';
import { reportTrend } from './reports.js';

export function dashboardData(db, requestedDate = localDateString()) {
  const rows = db.prepare(`${appointmentSelect}
    WHERE a.date = ? AND a.status <> 'cancelled'
    ORDER BY a.time ASC, a.guest_name ASC
  `).all(requestedDate).map(mapAppointment);
  const calls = db.prepare(`${callSelect}
    WHERE substr(cl.called_at, 1, 10) = ?
    ORDER BY cl.called_at DESC LIMIT 8
  `).all(requestedDate).map(mapCall);
  const todayCallCount = Number(db.prepare(
    "SELECT COUNT(*) AS count FROM calls WHERE substr(called_at, 1, 10) = ?"
  ).get(requestedDate).count);
  const upcoming = db.prepare(`${appointmentSelect}
    WHERE a.date > ? AND a.date <= ? AND a.status IN ('pending', 'confirmed', 'seated')
    ORDER BY a.date ASC, a.time ASC LIMIT 8
  `).all(requestedDate, addDays(requestedDate, 7)).map(mapAppointment);
  const tables = db.prepare(`
    SELECT t.id, t.name, t.capacity, t.status, t.shape, t.x, t.y, ar.name AS areaName,
      (SELECT a.id FROM appointments a WHERE a.date = ? AND a.status = 'seated'
        AND (a.table_id = t.id OR a.combo_id IN (SELECT ct.combo_id FROM combo_room_tables ct WHERE ct.table_id = t.id))
        LIMIT 1) AS seatedAppointmentId,
      (SELECT a.id FROM appointments a WHERE a.date = ? AND a.status IN ('pending', 'confirmed')
        AND (a.table_id = t.id OR a.combo_id IN (SELECT ct.combo_id FROM combo_room_tables ct WHERE ct.table_id = t.id))
        LIMIT 1) AS bookedAppointmentId
    FROM dining_tables t LEFT JOIN areas ar ON ar.id = t.area_id
    WHERE t.active = 1 ORDER BY ar.sort_order, t.name
  `).all(requestedDate, requestedDate);
  const combos = db.prepare('SELECT id, name, capacity, notes, active FROM combo_rooms ORDER BY name').all();
  const unread = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read = 0').get();
  const revenue = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE substr(paid_at, 1, 7) = ?").get(requestedDate.slice(0, 7));
  const customers = db.prepare('SELECT COUNT(*) AS count FROM customers').get();
  const attention = rows.filter((row) => {
    const occasion = String(row.occasion || '').trim();
    return Boolean(row.customerAllergies || row.customerPreferences || row.notes) || (occasion !== '' && occasion !== '普通用餐');
  })
    .slice(0, 6)
    .map((row) => ({
      id: row.id, guestName: row.guestName, time: row.time, partySize: row.partySize,
      occasion: row.occasion, preferences: row.customerPreferences || '',
      allergies: row.customerAllergies || '', notes: row.notes || '', status: row.status
    }));
  const statusCounts = rows.reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
  const sourceCounts = rows.reduce((acc, row) => { acc[row.source] = (acc[row.source] || 0) + 1; return acc; }, {});
  return {
    date: requestedDate,
    metrics: {
      appointments: rows.length,
      guests: rows.filter((row) => ['pending', 'confirmed', 'seated'].includes(row.status))
        .reduce((sum, row) => sum + Number(row.partySize || 0), 0),
      pending: rows.filter((row) => row.status === 'pending').length,
      confirmed: rows.filter((row) => row.status === 'confirmed').length,
      seated: rows.filter((row) => row.status === 'seated').length,
      calls: todayCallCount,
      tables: tables.length,
      availableTables: tables.filter((row) => row.status === 'available' && !row.bookedAppointmentId && !row.seatedAppointmentId).length,
      customers: Number(customers.count),
      monthRevenue: Number(revenue.total || 0),
      unreadNotifications: Number(unread.count)
    },
    todayAppointments: rows,
    upcoming,
    calls,
    attention,
    tables,
    combos,
    statusCounts,
    sourceCounts,
    trend: reportTrend(db, 7),
    notes: [
      '演示数据均为虚构；模拟通话与模拟 AI 结果会在界面中明确标记。',
      '电话、录音、STT、AI 与飞书的真实接入需要外部设备/配置和合规确认。'
    ]
  };
}
