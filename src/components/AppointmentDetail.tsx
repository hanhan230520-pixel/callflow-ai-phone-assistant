import { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, CalendarDays, Check, CheckCircle2, Clock3, LoaderCircle,
  MapPin, MessageSquareText, Pencil, Phone, UserRound, Users, XCircle
} from 'lucide-react';
import { api, ApiError } from '../api';
import type { Appointment, AppointmentDetail as Detail, AppointmentStatus } from '../types';
import { SOURCE_META, STATUS_META, formatDate, formatDateTime, humanStatusFlow, maskPhone } from '../lib/format';
import { Drawer, DrawerHeader } from './Overlay';
import { Avatar } from './Avatar';
import { StatusBadge, TierBadge } from './Badges';
import { ErrorState, PageLoader } from './States';
import { useToast } from './Toast';

export function AppointmentDetailDrawer({
  open, appointmentId, onClose, onChanged, onEdit
}: {
  open: boolean; appointmentId: string | null; onClose: () => void;
  onChanged: () => void; onEdit: (appointment: Appointment) => void;
}) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<AppointmentStatus | 'cancel' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = async () => {
    if (!appointmentId) return;
    setLoading(true); setError('');
    try { setDetail(await api.appointment(appointmentId)); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : '预约详情加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (open && appointmentId) { setConfirmCancel(false); void load(); }
    else setDetail(null);
  }, [open, appointmentId]);

  async function changeStatus(status: AppointmentStatus) {
    if (!detail) return;
    setUpdating(status === 'cancelled' ? 'cancel' : status);
    try {
      await api.changeAppointmentStatus(detail.item.id, status);
      showToast(status === 'cancelled' ? '预约已取消' : `状态已更新为「${STATUS_META[status].label}」`);
      setConfirmCancel(false); await load(); onChanged();
    } catch (requestError) {
      showToast(requestError instanceof ApiError ? requestError.message : '状态更新失败', 'error');
    } finally { setUpdating(null); }
  }

  const appointment = detail?.item;
  const resource = appointment?.comboName || appointment?.tableName || '待安排';

  return (
    <Drawer open={open} onClose={onClose} label="预约详情">
      <DrawerHeader title="预约详情" subtitle={appointment ? `${formatDate(appointment.date, 'yyyy年M月d日')} ${appointment.time}` : '查看客人信息与预约记录'} onClose={onClose} />
      <div className="drawer__body drawer__body--flush">
        {loading && <PageLoader rows={5} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && appointment && detail && (
          <>
            <section className="detail-hero">
              <div className="detail-hero__top">
                <Avatar name={appointment.guestName} size="lg" />
                <div className="detail-hero__identity">
                  <div className="detail-hero__name-row"><h3>{appointment.guestName}</h3>{appointment.customerTier && <TierBadge tier={appointment.customerTier} />}</div>
                  <div className="detail-hero__meta"><span><Phone size={14} />{maskPhone(appointment.phone)}</span><span><Users size={14} />{appointment.partySize} 人</span></div>
                </div>
                <StatusBadge status={appointment.status} />
              </div>
              <div className="detail-flow-note">{humanStatusFlow(appointment.status)}</div>
              <div className="detail-actions">
                {appointment.status === 'pending' && <button type="button" className="button button--primary button--sm" disabled={Boolean(updating)} onClick={() => changeStatus('confirmed')}>{updating === 'confirmed' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}确认预约</button>}
                {appointment.status === 'confirmed' && <button type="button" className="button button--primary button--sm" disabled={Boolean(updating)} onClick={() => changeStatus('seated')}>{updating === 'seated' ? <LoaderCircle size={15} className="spin" /> : <UserRound size={15} />}标记到店</button>}
                {appointment.status === 'seated' && <button type="button" className="button button--primary button--sm" disabled={Boolean(updating)} onClick={() => changeStatus('completed')}>{updating === 'completed' ? <LoaderCircle size={15} className="spin" /> : <CheckCircle2 size={15} />}完成服务</button>}
                {appointment.status === 'confirmed' && <button type="button" className="button button--ghost button--sm" onClick={() => changeStatus('no_show')}>未到店</button>}
                {['pending', 'confirmed', 'seated'].includes(appointment.status) && <button type="button" className="button button--ghost button--sm" onClick={() => setConfirmCancel(true)}><XCircle size={15} />取消预约</button>}
                <button type="button" className="button button--secondary button--sm" onClick={() => onEdit(appointment)}><Pencil size={15} />编辑</button>
              </div>
              {confirmCancel && (
                <div className="inline-confirm">
                  <AlertTriangle size={17} />
                  <div><strong>确认取消这条预约？</strong><span>取消后状态会保留在记录中，桌台将重新释放。</span></div>
                  <div className="inline-confirm__actions">
                    <button type="button" className="button button--ghost button--xs" onClick={() => setConfirmCancel(false)}>返回</button>
                    <button type="button" className="button button--danger button--xs" disabled={updating === 'cancel'} onClick={() => changeStatus('cancelled')}>{updating === 'cancel' && <LoaderCircle size={13} className="spin" />}确认取消</button>
                  </div>
                </div>
              )}
            </section>

            <section className="detail-section">
              <h4>预约信息</h4>
              <div className="info-grid">
                <div><span><CalendarDays size={14} />日期</span><strong>{formatDate(appointment.date, 'yyyy年M月d日')}</strong></div>
                <div><span><Clock3 size={14} />时间</span><strong>{appointment.time}</strong></div>
                <div><span><MapPin size={14} />桌台</span><strong>{resource}{appointment.areaName && appointment.tableName ? ` · ${appointment.areaName}` : ''}</strong></div>
                <div><span><ArrowUpRight size={14} />来源</span><strong>{SOURCE_META[appointment.source]}</strong></div>
                <div><span><Users size={14} />人数</span><strong>{appointment.partySize} 人</strong></div>
                <div><span>场景</span><strong>{appointment.occasion || '未标记'}</strong></div>
              </div>
              {appointment.conflictOverride && <div className="inline-alert inline-alert--warning">此预约创建或编辑时覆盖了桌台冲突，已记录审计信息。</div>}
            </section>

            {(detail.customer?.preferences || detail.customer?.allergies || appointment.notes || detail.customer?.tags?.length) && (
              <section className="detail-section">
                <h4>服务提醒</h4>
                <div className="tag-list">
                  {detail.customer?.preferences && <span className="soft-tag">偏好 · {detail.customer.preferences}</span>}
                  {detail.customer?.allergies && <span className="soft-tag soft-tag--danger">过敏 · {detail.customer.allergies}</span>}
                  {detail.customer?.tags?.map((tag) => <span className="soft-tag" key={tag}>{tag}</span>)}
                </div>
                {appointment.notes && <div className="note-box"><MessageSquareText size={16} /><p>{appointment.notes}</p></div>}
              </section>
            )}

            <section className="detail-section">
              <h4>最近联系</h4>
              {detail.calls.length === 0 ? <div className="inline-empty">暂无关联的联系记录</div> : (
                <div className="mini-timeline">
                  {detail.calls.slice(0, 5).map((call) => (
                    <div className="mini-timeline__item" key={call.id}>
                      <span className="mini-timeline__dot" />
                      <div>
                        <strong>{call.direction === 'inbound' ? '来电' : '去电'} · {formatDateTime(call.calledAt, 'M月d日 HH:mm')}{call.isSimulated ? ' · 模拟' : ''}</strong>
                        <p>{call.aiSummary || '暂无 AI 摘要'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="detail-section">
              <h4>状态历史</h4>
              {detail.history.length === 0 ? <div className="inline-empty">暂无状态变更</div> : (
                <div className="status-history">
                  {detail.history.map((entry) => (
                    <div className="status-history__row" key={entry.id}>
                      <span className="status-history__dot" />
                      <div>
                        <strong>{entry.fromStatus ? `${STATUS_META[entry.fromStatus as AppointmentStatus]?.label || entry.fromStatus} → ` : '创建 → '}{STATUS_META[entry.toStatus as AppointmentStatus]?.label || entry.toStatus}</strong>
                        <span>{formatDateTime(entry.createdAt, 'M月d日 HH:mm')}{entry.changedByName ? ` · ${entry.changedByName}` : ''}{entry.note ? ` · ${entry.note}` : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {detail.payments.length > 0 && (
              <section className="detail-section">
                <h4>消费记录</h4>
                <div className="history-list">
                  {detail.payments.map((payment) => (
                    <div className="history-item" key={payment.id}>
                      <div><strong>{formatDateTime(payment.paidAt, 'M月d日 HH:mm')} · {payment.method}</strong><span>{payment.note || payment.receiptRef || '无备注'}</span></div>
                      <span className="amount">¥{Number(payment.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
