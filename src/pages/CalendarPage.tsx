import { useEffect, useMemo, useState } from 'react';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  startOfMonth, startOfWeek, subMonths
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarPlus, ChevronLeft, ChevronRight, Clock3, Users } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { Appointment, ComboRoom, DiningTable } from '../types';
import {
  SOURCE_META, STATUS_META, STATUS_ORDER, cn, formatDate, maskPhone
} from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/Badges';
import { AppointmentForm } from '../components/AppointmentForm';
import { AppointmentDetailDrawer } from '../components/AppointmentDetail';
import { EmptyState, ErrorState, PageLoader } from '../components/States';
import { useToast } from '../components/Toast';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function CalendarPage() {
  const { showToast } = useToast();
  const { can } = useAuth();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [combos, setCombos] = useState<ComboRoom[]>([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [prefill, setPrefill] = useState<{ date?: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api.layout().then((layout) => { setTables(layout.tables.filter((table) => table.active !== false)); setCombos(layout.combos); }).catch(() => undefined);
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const from = format(startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const to = format(endOfWeek(endOfMonth(month), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      let page = 1;
      let pages = 1;
      let items: Appointment[] = [];
      do {
        const response = await api.appointments({ from, to, page, pageSize: 50 });
        items = [...items, ...response.items];
        pages = response.totalPages;
        page += 1;
      } while (page <= pages && page <= 5);
      setAppointments(items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '日历加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month]);

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  }), [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach((appointment) => {
      const list = map.get(appointment.date) || [];
      list.push(appointment);
      map.set(appointment.date, list);
    });
    map.forEach((list) => list.sort((a, b) => a.time.localeCompare(b.time)));
    return map;
  }, [appointments]);

  const dayKey = format(selectedDay, 'yyyy-MM-dd');
  const dayAppointments = (byDate.get(dayKey) || []).filter((item) => item.status !== 'cancelled');
  const dayGuests = dayAppointments.reduce((total, item) => total + item.partySize, 0);
  const today = new Date();

  function jumpMonth(offset: number) {
    const next = offset > 0 ? addMonths(month, 1) : subMonths(month, 1);
    setMonth(next);
    setSelectedDay(startOfMonth(next));
  }

  function jumpToday() {
    const now = new Date();
    setMonth(startOfMonth(now));
    setSelectedDay(now);
  }

  function openNew(date = selectedDay) {
    setEditing(null);
    setPrefill({ date: format(date, 'yyyy-MM-dd') });
    setFormOpen(true);
  }

  function openEdit(appointment: Appointment) {
    setSelectedId(null);
    setEditing(appointment);
    setPrefill(null);
    setFormOpen(true);
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="预约日历"
        title="预约日历"
        description="按月查看预约分布，选择日期后在右侧查看当天安排。点击预约可进入详情。"
        actions={<button type="button" className="button button--primary" onClick={() => openNew()}><CalendarPlus size={16} />新建预约</button>}
      />

      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <header className="calendar-toolbar">
            <div className="calendar-month">
              <h2>{format(month, 'yyyy年 M月', { locale: zhCN })}</h2>
              <span>{appointments.filter((item) => item.status !== 'cancelled').length} 条有效预约</span>
            </div>
            <div className="calendar-nav">
              <button type="button" className="button button--secondary button--sm" onClick={jumpToday}>今天</button>
              <div className="calendar-nav__arrows">
                <button type="button" className="icon-button" onClick={() => jumpMonth(-1)} aria-label="上个月"><ChevronLeft size={17} /></button>
                <button type="button" className="icon-button" onClick={() => jumpMonth(1)} aria-label="下个月"><ChevronRight size={17} /></button>
              </div>
            </div>
          </header>

          <div className="calendar-weekdays">
            {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>

          {loading ? (
            <div className="calendar-loading"><PageLoader rows={4} /></div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <div className="calendar-grid">
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const list = byDate.get(key) || [];
                const active = list.filter((item) => item.status !== 'cancelled');
                const isCurrentMonth = isSameMonth(day, month);
                const isSelected = isSameDay(day, selectedDay);
                const isToday = isSameDay(day, today);
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn('calendar-day', !isCurrentMonth && 'is-outside', isSelected && 'is-selected', isToday && 'is-today')}
                    onClick={() => setSelectedDay(day)}
                    aria-label={`${format(day, 'yyyy年M月d日')}，${active.length} 条预约`}
                  >
                    <span className="calendar-day__number">{format(day, 'd')}</span>
                    <div className="calendar-day__events">
                      {active.slice(0, 2).map((item) => (
                        <span key={item.id} className={cn('calendar-event', `event-${STATUS_META[item.status].tone}`)}>
                          <i />{item.time} {item.guestName}
                        </span>
                      ))}
                      {active.length > 2 && <span className="calendar-more">+{active.length - 2} 条</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <footer className="calendar-legend">
            {STATUS_ORDER.filter((status) => status !== 'cancelled').map((status) => (
              <span key={status}><i className={`legend-dot tone-${STATUS_META[status].tone}`} />{STATUS_META[status].label}</span>
            ))}
            <span className="calendar-legend__hint">演示数据 · 日期与状态可实时修改</span>
          </footer>
        </section>

        <aside className="panel day-panel">
          <header className="day-panel__header">
            <div>
              <span>{formatDate(dayKey, 'EEEE')}</span>
              <h2>{formatDate(dayKey, 'M月d日')}</h2>
              <p>{dayAppointments.length} 条预约 · 预计 {dayGuests} 人</p>
            </div>
            <button type="button" className="icon-button" onClick={() => openNew()} aria-label="为当天新建预约"><CalendarPlus size={18} /></button>
          </header>

          <div className="day-panel__body">
            {dayAppointments.length === 0 ? (
              <EmptyState
                title="当天暂无安排"
                description="为这一天创建一条预约。"
                action={<button type="button" className="button button--secondary button--sm" onClick={() => openNew()}>新建预约</button>}
              />
            ) : (
              <div className="day-agenda">
                {dayAppointments.map((appointment) => (
                  <button type="button" className="day-agenda__item" key={appointment.id} onClick={() => setSelectedId(appointment.id)}>
                    <div className="day-agenda__time"><strong>{appointment.time}</strong><span>{appointment.partySize} 人</span></div>
                    <span className={cn('day-agenda__line', `line-${STATUS_META[appointment.status].tone}`)} />
                    <div className="day-agenda__body">
                      <div>
                        <strong>{appointment.guestName}</strong>
                        <Avatar name={appointment.guestName} size="sm" />
                      </div>
                      <span>{appointment.comboName || appointment.tableName || '待安排'} · {SOURCE_META[appointment.source]}</span>
                      <p>{maskPhone(appointment.phone)}{appointment.notes ? ` · ${appointment.notes}` : ''}</p>
                    </div>
                    <StatusBadge status={appointment.status} withDot={false} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="day-panel__stats">
            <div><Clock3 size={15} /><span>最早 {dayAppointments[0]?.time || '—'}</span></div>
            <div><Users size={15} /><span>共 {dayGuests} 人</span></div>
          </div>
        </aside>
      </div>

      <AppointmentForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); setPrefill(null); }}
        appointment={editing}
        prefill={prefill}
        tables={tables}
        combos={combos}
        canOverride={can('appointments:override')}
        onSaved={() => { setFormOpen(false); setEditing(null); setPrefill(null); load(); }}
      />
      <AppointmentDetailDrawer
        open={Boolean(selectedId)}
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={load}
        onEdit={openEdit}
      />
    </div>
  );
}
