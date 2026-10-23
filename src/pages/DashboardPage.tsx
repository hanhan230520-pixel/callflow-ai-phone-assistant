import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CalendarDays, CalendarPlus, Clock3, Phone, Sparkles, Users
} from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { DashboardData } from '../types';
import { SOURCE_META, formatDate, formatDateTime, maskPhone, requestGreeting } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { StatusBadge, TierBadge } from '../components/Badges';
import { AppointmentDetailDrawer } from '../components/AppointmentDetail';
import { EmptyState, ErrorState, PageLoader } from '../components/States';

const SLOT_HOURS = [11, 12, 13, 17, 18, 19, 20, 21];

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.dashboard());
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '概览数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const slotData = useMemo(() => {
    if (!data) return [];
    return SLOT_HOURS.map((hour) => {
      const appointments = data.todayAppointments.filter((item) => Number(item.time.slice(0, 2)) === hour);
      return {
        hour,
        count: appointments.length,
        guests: appointments.reduce((total, item) => total + item.partySize, 0)
      };
    });
  }, [data]);

  const maxSlot = Math.max(1, ...slotData.map((slot) => slot.count));
  const sourceTotal = data ? Object.values(data.sourceCounts).reduce((sum, value) => sum + value, 0) : 0;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="运营概览"
        title={`${requestGreeting()}，${user?.displayName || '管理员'}`}
        description={data ? `${formatDate(data.date, 'yyyy年M月d日')} · ${formatDate(data.date, 'EEEE')}。这里汇总今天的预约节奏、服务提醒与联系跟进。` : '正在整理今天的预约节奏与服务提醒。'}
        actions={
          <>
            <Link to="/calendar" className="button button--secondary"><CalendarDays size={16} />查看日历</Link>
            <Link to="/appointments?new=1" className="button button--primary"><CalendarPlus size={16} />新建预约</Link>
          </>
        }
      />

      {loading && <PageLoader rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && data && (
        <>
          <section className="metric-grid" aria-label="今日关键指标">
            <article className="metric-card">
              <div className="metric-card__icon metric-card__icon--indigo"><ClipboardGlyph /></div>
              <div><span>今日预约</span><strong>{data.metrics.appointments}</strong></div>
              <p>{data.metrics.confirmed} 条已确认 · {data.metrics.seated} 条已到店</p>
            </article>
            <article className="metric-card">
              <div className="metric-card__icon metric-card__icon--blue"><Users size={18} /></div>
              <div><span>预计到店</span><strong>{data.metrics.guests}</strong></div>
              <p>按有效预约人数汇总</p>
            </article>
            <article className="metric-card">
              <div className="metric-card__icon metric-card__icon--amber"><Clock3 size={18} /></div>
              <div><span>待确认</span><strong>{data.metrics.pending}</strong></div>
              <p>{data.metrics.pending > 0 ? '建议优先完成电话确认' : '所有预约均已确认'}</p>
            </article>
            <article className="metric-card">
              <div className="metric-card__icon metric-card__icon--violet"><Phone size={18} /></div>
              <div><span>今日联系</span><strong>{data.metrics.calls}</strong></div>
              <p>{data.calls.filter((call) => call.followUp).length} 条需要继续跟进 · {data.metrics.availableTables} 张桌台当前可用</p>
            </article>
          </section>

          <div className="dashboard-grid">
            <section className="panel dashboard-schedule">
              <header className="panel__header">
                <div><h2>今日预约</h2><p>按时间排序，点击任意一行查看完整预约详情</p></div>
                <Link to="/appointments" className="text-link">全部预约<ArrowRight size={14} /></Link>
              </header>
              {data.todayAppointments.length === 0 ? (
                <EmptyState
                  title="今天还没有预约"
                  description="创建第一条预约，开始安排今天的座位与服务。"
                  action={<Link to="/appointments?new=1" className="button button--primary button--sm"><CalendarPlus size={15} />新建预约</Link>}
                  icon={<CalendarDays size={22} />}
                />
              ) : (
                <div className="schedule-list">
                  {data.todayAppointments.slice(0, 8).map((appointment) => (
                    <DashboardAppointmentRow key={appointment.id} appointment={appointment} onClick={() => setSelectedId(appointment.id)} />
                  ))}
                </div>
              )}
            </section>

            <aside className="dashboard-side">
              <section className="panel pulse-panel">
                <header className="panel__header panel__header--compact">
                  <div><h2>到店节奏</h2><p>午市与晚市的预约密度</p></div>
                  <span className="mini-legend"><span />预约数</span>
                </header>
                <div className="pulse-chart" aria-label="今日各时段预约数量">
                  {slotData.map((slot) => (
                    <div className="pulse-bar" key={slot.hour} title={`${slot.hour}:00 · ${slot.count} 条预约 · ${slot.guests} 人`}>
                      <div className="pulse-bar__track">
                        <span style={{ height: `${Math.max(8, (slot.count / maxSlot) * 100)}%` }} className={slot.count ? 'has-value' : ''} />
                      </div>
                      <strong>{slot.count}</strong>
                      <span>{String(slot.hour).padStart(2, '0')}:00</span>
                    </div>
                  ))}
                </div>
                <div className="pulse-footer">
                  <span><Sparkles size={14} />{data.metrics.guests} 位客人将在今天到店</span>
                  <span>{data.metrics.tables} 张桌台已配置</span>
                </div>
              </section>

              <section className="panel attention-panel">
                <header className="panel__header panel__header--compact">
                  <div><h2>服务提醒</h2><p>来自预约备注与客户偏好</p></div>
                  <span className="count-pill">{data.attention.length}</span>
                </header>
                {data.attention.length === 0 ? (
                  <div className="inline-empty">今天没有额外服务提醒</div>
                ) : (
                  <div className="attention-list">
                    {data.attention.map((item) => (
                      <button type="button" key={item.id} className="attention-item" onClick={() => setSelectedId(item.id)}>
                        <span className="attention-item__time">{item.time}</span>
                        <div>
                          <strong>{item.guestName}<span>{item.partySize} 人</span></strong>
                          <p>{item.allergies ? `过敏：${item.allergies}` : item.preferences || item.occasion || '有备注需要关注'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>

          <div className="dashboard-bottom-grid">
            <section className="panel compact-panel">
              <header className="panel__header panel__header--compact"><div><h2>预约来源</h2><p>今日有效预约构成</p></div></header>
              {sourceTotal === 0 ? <div className="inline-empty">暂无来源数据</div> : (
                <div className="distribution-list">
                  {Object.entries(data.sourceCounts).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
                    <div className="distribution-row" key={source}>
                      <div className="distribution-row__label">
                        <span>{SOURCE_META[source as keyof typeof SOURCE_META]}</span><strong>{count}</strong>
                      </div>
                      <div className="distribution-track"><span style={{ width: `${(count / sourceTotal) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel compact-panel">
              <header className="panel__header panel__header--compact">
                <div><h2>即将到来</h2><p>未来 7 天的预约</p></div>
                <Link to="/calendar" className="text-link">日历<ArrowRight size={14} /></Link>
              </header>
              {data.upcoming.length === 0 ? <div className="inline-empty">未来 7 天暂无预约</div> : (
                <div className="upcoming-list">
                  {data.upcoming.slice(0, 4).map((item) => (
                    <button type="button" className="upcoming-item" key={item.id} onClick={() => setSelectedId(item.id)}>
                      <div className="upcoming-item__date"><strong>{formatDate(item.date, 'd')}</strong><span>{formatDate(item.date, 'M月')}</span></div>
                      <div className="upcoming-item__body">
                        <strong>{item.guestName}</strong>
                        <span>{item.time} · {item.partySize} 人 · {item.tableName || '待安排'}</span>
                      </div>
                      <StatusBadge status={item.status} withDot={false} />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="panel compact-panel">
              <header className="panel__header panel__header--compact">
                <div><h2>最近联系</h2><p>电话沟通与跟进状态</p></div>
                <Link to="/calls" className="text-link">全部<ArrowRight size={14} /></Link>
              </header>
              {data.calls.length === 0 ? <div className="inline-empty">今天还没有联系记录</div> : (
                <div className="call-mini-list">
                  {data.calls.slice(0, 4).map((call) => (
                    <div className="call-mini" key={call.id}>
                      <span className={`call-direction ${call.direction === 'inbound' ? 'is-inbound' : 'is-outbound'}`}><Phone size={14} /></span>
                      <div>
                        <strong>{call.contactName}<span>{maskPhone(call.phone)}</span></strong>
                        <p>{call.aiSummary || '暂无 AI 摘要'}</p>
                      </div>
                      <time>{formatDateTime(call.calledAt, 'HH:mm')}</time>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <AppointmentDetailDrawer
        open={Boolean(selectedId)}
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={load}
        onEdit={(appointment) => navigate(`/appointments?edit=${appointment.id}`)}
      />
    </div>
  );
}

function DashboardAppointmentRow({ appointment, onClick }: { appointment: DashboardData['todayAppointments'][number]; onClick: () => void }) {
  return (
    <button type="button" className="schedule-row" onClick={onClick}>
      <div className="schedule-row__time"><strong>{appointment.time}</strong><span>{appointment.partySize} 人</span></div>
      <Avatar name={appointment.guestName} size="sm" />
      <div className="schedule-row__guest">
        <strong>{appointment.guestName}{appointment.customerTier && <TierBadge tier={appointment.customerTier} />}</strong>
        <span>{maskPhone(appointment.phone)} · {appointment.comboName || appointment.tableName || '待安排'}{appointment.areaName ? ` · ${appointment.areaName}` : ''}</span>
      </div>
      <StatusBadge status={appointment.status} />
      <ArrowRight size={15} className="schedule-row__arrow" />
    </button>
  );
}

function ClipboardGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="17" rx="3" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h5" />
    </svg>
  );
}
