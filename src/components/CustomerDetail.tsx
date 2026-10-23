import { useEffect, useState } from 'react';
import { CalendarPlus, CreditCard, Merge, MessageSquareText, Pencil, Phone, ShieldAlert } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Customer, CustomerDetail as Detail } from '../types';
import {
  SOURCE_META, TIER_META, formatDate, formatDateTime, maskPhone
} from '../lib/format';
import { Drawer, DrawerHeader } from './Overlay';
import { Avatar } from './Avatar';
import { StatusBadge } from './Badges';
import { ErrorState, PageLoader } from './States';

export function CustomerDetailDrawer({
  open, customerId, onClose, onEdit, onBook, onAddPayment, onMerge
}: {
  open: boolean;
  customerId: string | null;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
  onBook: (customer: Customer) => void;
  onAddPayment?: (customer: Customer) => void;
  onMerge?: (customer: Customer) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!customerId) return;
    setLoading(true);
    setError('');
    try {
      setDetail(await api.customer(customerId));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '客户资料加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && customerId) load();
    else setDetail(null);
  }, [open, customerId]);

  const customer = detail?.item;

  return (
    <Drawer open={open} onClose={onClose} label="客户资料">
      <DrawerHeader title="客户资料" subtitle="查看预约历史与服务偏好" onClose={onClose} />
      <div className="drawer__body drawer__body--flush">
        {loading && <PageLoader rows={5} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && customer && detail && (
          <>
            <section className="customer-hero">
              <Avatar name={customer.name} size="lg" />
              <div className="customer-hero__identity">
                <h3>{customer.name}</h3>
                <p><Phone size={14} />{maskPhone(customer.phone)}</p>
              </div>
              <span className={`tier-pill tier-${TIER_META[customer.tier].tone}`}>{TIER_META[customer.tier].label}</span>
              <div className="customer-hero__actions">
                <button type="button" className="button button--primary button--sm" onClick={() => onBook(customer)}>
                  <CalendarPlus size={15} />新建预约
                </button>
                <button type="button" className="button button--secondary button--sm" onClick={() => onEdit(customer)}>
                  <Pencil size={15} />编辑资料
                </button>
                {onAddPayment && <button type="button" className="button button--secondary button--sm" onClick={() => onAddPayment(customer)}>
                  <CreditCard size={15} />记一笔消费
                </button>}
                {onMerge && <button type="button" className="button button--ghost button--sm" onClick={() => onMerge(customer)}>
                  <Merge size={15} />合并档案
                </button>}
              </div>
            </section>

            <section className="customer-stats">
              <div><strong>{detail.stats.appointmentCount}</strong><span>累计预约</span></div>
              <div><strong>{detail.stats.completedCount}</strong><span>已完成</span></div>
              <div><strong>{detail.stats.noShowCount}</strong><span>未到店</span></div>
              <div><strong>{detail.stats.nextVisit ? formatDate(detail.stats.nextVisit, 'M月d日') : '—'}</strong><span>下次预约</span></div>
              <div><strong>¥{Number(detail.stats.totalSpent || customer.totalSpent || 0).toFixed(0)}</strong><span>累计消费</span></div>
            </section>

            <section className="detail-section">
              <h4>服务偏好</h4>
              <div className="tag-list">
                {customer.preferences ? <span className="soft-tag">偏好 · {customer.preferences}</span> : <span className="soft-tag soft-tag--empty">暂无偏好记录</span>}
                {customer.allergies && <span className="soft-tag soft-tag--danger"><ShieldAlert size={13} />过敏 · {customer.allergies}</span>}
                {(customer.tags || []).map((tag) => <span className="soft-tag" key={tag}>{tag}</span>)}
              </div>
              {customer.notes && <div className="note-box"><MessageSquareText size={16} /><p>{customer.notes}</p></div>}
            </section>

            <section className="detail-section">
              <h4>预约记录</h4>
              {detail.appointments.length === 0 ? (
                <div className="inline-empty">暂无预约记录</div>
              ) : (
                <div className="customer-booking-list">
                  {detail.appointments.slice(0, 8).map((item) => (
                    <div className="customer-booking" key={item.id}>
                      <div className="customer-booking__date">
                        <strong>{formatDate(item.date, 'M月d日')}</strong>
                        <span>{item.time}</span>
                      </div>
                      <div className="customer-booking__body">
                        <strong>{item.partySize} 人 · {item.tableName || '待安排'}</strong>
                        <span>{SOURCE_META[item.source]}{item.occasion ? ` · ${item.occasion}` : ''}</span>
                      </div>
                      <StatusBadge status={item.status} withDot={false} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="detail-section">
              <h4>消费记录</h4>
              {detail.payments.length === 0 ? <div className="inline-empty">暂无消费记录</div> : (
                <div className="history-list">
                  {detail.payments.slice(0, 8).map((payment) => (
                    <div className="history-item" key={payment.id}>
                      <div><strong>{formatDateTime(payment.paidAt, 'M月d日 HH:mm')} · {payment.method}</strong><span>{payment.note || payment.receiptRef || '无备注'}</span></div>
                      <span className="amount">¥{Number(payment.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="detail-section">
              <h4>联系记录</h4>
              {detail.calls.length === 0 ? (
                <div className="inline-empty">暂无联系记录</div>
              ) : (
                <div className="mini-timeline">
                  {detail.calls.slice(0, 5).map((call) => (
                    <div className="mini-timeline__item" key={call.id}>
                      <span className="mini-timeline__dot" />
                      <div>
                        <strong>{call.direction === 'inbound' ? '来电' : '去电'} · {formatDateTime(call.calledAt, 'M月d日 HH:mm')}</strong>
                        <p>{call.aiSummary || call.notes || '暂无摘要'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}
