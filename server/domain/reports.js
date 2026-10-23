import { addDays, dateRange, isValidDateString, localDateString } from '../lib/time.js';

function range(query = {}) {
  const to = query.to || localDateString();
  const from = query.from || addDays(to, -29);
  return { from, to };
}

export function reportSummary(db, query = {}) {
  const { from, to } = range(query);
  const appointment = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS noShow,
      SUM(CASE WHEN status IN ('pending', 'confirmed', 'seated') THEN 1 ELSE 0 END) AS active,
      COALESCE(SUM(CASE WHEN status IN ('seated', 'completed') THEN party_size ELSE 0 END), 0) AS guests,
      COALESCE(AVG(CASE WHEN status IN ('seated', 'completed') THEN party_size END), 0) AS averageParty
    FROM appointments WHERE date BETWEEN ? AND ?
  `).get(from, to);
  const revenue = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM payments WHERE substr(paid_at, 1, 10) BETWEEN ? AND ?').get(from, to);
  const calls = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'follow_up' THEN 1 ELSE 0 END) AS followUp,
      SUM(CASE WHEN is_simulated = 1 THEN 1 ELSE 0 END) AS simulated,
      COALESCE(SUM(duration_seconds), 0) AS duration
    FROM calls WHERE substr(called_at, 1, 10) BETWEEN ? AND ?
  `).get(from, to);
  const customers = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS newCustomers
    FROM customers
  `).get(`${from}T00:00:00`);
  const walkIns = db.prepare('SELECT COUNT(*) AS total FROM walk_ins WHERE date BETWEEN ? AND ?').get(from, to);
  const conversion = db.prepare(`
    SELECT COUNT(*) AS total FROM calls
    WHERE substr(called_at, 1, 10) BETWEEN ? AND ? AND appointment_id IS NOT NULL
  `).get(from, to);
  return {
    range: { from, to },
    appointments: {
      total: Number(appointment.total || 0),
      completed: Number(appointment.completed || 0),
      cancelled: Number(appointment.cancelled || 0),
      noShow: Number(appointment.noShow || 0),
      active: Number(appointment.active || 0),
      guests: Number(appointment.guests || 0),
      averageParty: Number(Number(appointment.averageParty || 0).toFixed(1)),
      completionRate: Number(appointment.total) ? Number((Number(appointment.completed) / Number(appointment.total) * 100).toFixed(1)) : 0,
      noShowRate: Number(appointment.total) ? Number((Number(appointment.noShow) / Number(appointment.total) * 100).toFixed(1)) : 0
    },
    revenue: { total: Number(revenue.total || 0), payments: Number(revenue.count || 0), average: Number(revenue.count) ? Number((Number(revenue.total) / Number(revenue.count)).toFixed(2)) : 0 },
    calls: {
      total: Number(calls.total || 0), completed: Number(calls.completed || 0),
      followUp: Number(calls.followUp || 0), simulated: Number(calls.simulated || 0),
      totalDuration: Number(calls.duration || 0), converted: Number(conversion.total || 0)
    },
    customers: { total: Number(customers.total || 0), newCustomers: Number(customers.newCustomers || 0) },
    walkIns: Number(walkIns.total || 0)
  };
}

function trendDates(query) {
  if (query && typeof query === 'object' && (isValidDateString(query.from) || isValidDateString(query.to))) {
    const to = isValidDateString(query.to) ? query.to : localDateString();
    const from = isValidDateString(query.from) ? query.from : addDays(to, -29);
    if (from > to) return dateRange(1, to);
    const span = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;
    // 趋势最多展示 90 天；超出时保留结束日期前最近 90 天。
    return dateRange(Math.min(90, Math.max(1, span)), to);
  }
  const days = typeof query === 'number' ? query : Number(query?.days || 30);
  return dateRange(Math.min(90, Math.max(7, days || 30)));
}

export function reportTrend(db, query = 30) {
  const dates = trendDates(query);
  const appointmentRows = db.prepare(`
    SELECT date, COUNT(*) AS appointments, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      COALESCE(SUM(party_size), 0) AS guests
    FROM appointments WHERE date BETWEEN ? AND ? GROUP BY date
  `).all(dates[0], dates.at(-1));
  const paymentRows = db.prepare(`
    SELECT substr(paid_at, 1, 10) AS date, COALESCE(SUM(amount), 0) AS revenue
    FROM payments WHERE substr(paid_at, 1, 10) BETWEEN ? AND ? GROUP BY substr(paid_at, 1, 10)
  `).all(dates[0], dates.at(-1));
  const callRows = db.prepare(`
    SELECT substr(called_at, 1, 10) AS date, COUNT(*) AS calls
    FROM calls WHERE substr(called_at, 1, 10) BETWEEN ? AND ? GROUP BY substr(called_at, 1, 10)
  `).all(dates[0], dates.at(-1));
  const appointmentMap = Object.fromEntries(appointmentRows.map((row) => [row.date, row]));
  const paymentMap = Object.fromEntries(paymentRows.map((row) => [row.date, row]));
  const callMap = Object.fromEntries(callRows.map((row) => [row.date, row]));
  return dates.map((date) => ({
    date,
    appointments: Number(appointmentMap[date]?.appointments || 0),
    completed: Number(appointmentMap[date]?.completed || 0),
    guests: Number(appointmentMap[date]?.guests || 0),
    revenue: Number(paymentMap[date]?.revenue || 0),
    calls: Number(callMap[date]?.calls || 0)
  }));
}

export function reportDistributions(db, query = {}) {
  const { from, to } = range(query);
  const status = db.prepare('SELECT status, COUNT(*) AS count FROM appointments WHERE date BETWEEN ? AND ? GROUP BY status').all(from, to);
  const source = db.prepare('SELECT source, COUNT(*) AS count FROM appointments WHERE date BETWEEN ? AND ? GROUP BY source').all(from, to);
  const tier = db.prepare('SELECT tier, COUNT(*) AS count FROM customers GROUP BY tier').all();
  const area = db.prepare(`
    SELECT CASE
        WHEN a.combo_id IS NOT NULL THEN '组合包间'
        WHEN a.table_id IS NOT NULL THEN COALESCE(ar.name, '未分配区域')
        ELSE '未分配桌台'
      END AS area,
      COUNT(*) AS count
    FROM appointments a LEFT JOIN dining_tables t ON t.id = a.table_id
    LEFT JOIN areas ar ON ar.id = t.area_id
    WHERE a.date BETWEEN ? AND ?
    GROUP BY 1
  `).all(from, to);
  const callStatus = db.prepare('SELECT status, COUNT(*) AS count FROM calls WHERE substr(called_at, 1, 10) BETWEEN ? AND ? GROUP BY status').all(from, to);
  const keywordRows = db.prepare('SELECT keywords FROM calls WHERE substr(called_at, 1, 10) BETWEEN ? AND ?').all(from, to);
  const keywordCounts = {};
  for (const row of keywordRows) {
    try {
      for (const keyword of JSON.parse(row.keywords || '[]')) {
        keywordCounts[keyword.label || keyword.key] = (keywordCounts[keyword.label || keyword.key] || 0) + 1;
      }
    } catch { /* ignore malformed demo data */ }
  }
  return {
    status: status.map((row) => ({ ...row, count: Number(row.count) })),
    source: source.map((row) => ({ ...row, count: Number(row.count) })),
    tier: tier.map((row) => ({ ...row, count: Number(row.count) })),
    area: area.map((row) => ({ ...row, count: Number(row.count) })),
    callStatus: callStatus.map((row) => ({ ...row, count: Number(row.count) })),
    keywords: Object.entries(keywordCounts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  };
}

export function topCustomers(db, limit = 10) {
  return db.prepare(`
    SELECT id, name, phone, tier, total_spent AS totalSpent, visit_count AS visitCount, tags
    FROM customers ORDER BY total_spent DESC, visit_count DESC, name ASC LIMIT ?
  `).all(Math.min(50, Math.max(1, Number(limit) || 10))).map((row) => ({
    ...row,
    totalSpent: Number(row.totalSpent),
    visitCount: Number(row.visitCount),
    tags: (() => { try { return JSON.parse(row.tags || '[]'); } catch { return []; } })()
  }));
}

export function reportPayload(db, query = {}) {
  const summary = reportSummary(db, query);
  return {
    ...summary,
    trend: reportTrend(db, query),
    distributions: reportDistributions(db, query),
    topCustomers: topCustomers(db, query.limit || 10)
  };
}
