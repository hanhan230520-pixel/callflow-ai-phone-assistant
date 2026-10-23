import { useEffect, useState } from 'react';
import { Bell, BellRing, CheckCheck, Info, Trash2, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { NotificationItem } from '../types';
import { cn, formatDateTime } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '../components/States';
import { useToast } from '../components/Toast';

const TYPE_META = {
  info: { label: '信息', icon: Info, tone: 'blue' },
  success: { label: '成功', icon: BellRing, tone: 'green' },
  warning: { label: '提醒', icon: TriangleAlert, tone: 'amber' },
  error: { label: '异常', icon: Bell, tone: 'red' }
} as const;

export function NotificationsPage() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const canWrite = can('notifications:write');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await api.notifications({ unread: filter === 'unread' ? 'true' : undefined, type: type || undefined, pageSize: 100 });
      setItems(result.items); setUnread(result.unread);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '通知加载失败');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [filter, type]);

  async function markRead(item: NotificationItem) {
    if (item.read) return;
    try { await api.markNotification(item.id); void load(); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '操作失败', 'error'); }
  }

  async function markAll() {
    setWorking(true);
    try { await api.markAllNotifications(); showToast('全部通知已标记为已读'); void load(); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '操作失败', 'error'); }
    finally { setWorking(false); }
  }

  async function remove(item: NotificationItem) {
    if (!window.confirm('确定删除这条通知吗？')) return;
    try { await api.deleteNotification(item.id); showToast('通知已删除'); void load(); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '删除失败', 'error'); }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="系统" title="通知中心" description="集中查看预约、来电、冲突、同步和数据操作产生的系统通知。"
        actions={canWrite ? <button className="button button--secondary" onClick={markAll} disabled={working || unread === 0}><CheckCheck size={16} />全部已读</button> : undefined} />

      <section className="filter-bar">
        <div className="quick-status quick-status--inline">
          <button type="button" className={cn('quick-status__item', filter === 'all' && 'is-active')} onClick={() => setFilter('all')}>全部</button>
          <button type="button" className={cn('quick-status__item', filter === 'unread' && 'is-active')} onClick={() => setFilter('unread')}>未读 {unread > 0 ? <em>{unread}</em> : null}</button>
        </div>
        <div className="filter-divider" />
        <div className="quick-status quick-status--inline">
          <button type="button" className={cn('quick-status__item', !type && 'is-active')} onClick={() => setType('')}>所有类型</button>
          {Object.entries(TYPE_META).map(([key, meta]) => <button key={key} type="button" className={cn('quick-status__item', type === key && 'is-active')} onClick={() => setType(key)}>{meta.label}</button>)}
        </div>
        <div className="filter-spacer" />
        <span className="filter-stat"><strong>{unread}</strong> 条未读</span>
      </section>

      {loading && <PageLoader rows={5} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && <div className="panel"><EmptyState title="暂无通知" description={filter === 'unread' ? '当前没有未读通知。' : '系统通知会在预约、来电和数据操作后出现在这里。'} icon={<Bell size={22} />} /></div>}
      {!loading && !error && items.length > 0 && (
        <div className="notice-list">
          {items.map((item) => {
            const meta = TYPE_META[item.type] || TYPE_META.info;
            const Icon = meta.icon;
            return (
              <article key={item.id} className={cn('notice-item', !item.read && 'is-unread')} onClick={() => markRead(item)}>
                <span className={cn('notice-item__icon', 'tone-' + meta.tone)}><Icon size={18} /></span>
                <div className="notice-item__body">
                  <div className="notice-item__title"><strong>{item.title}</strong>{!item.read && <span className="notice-dot" aria-label="未读" />}<time>{formatDateTime(item.createdAt, 'M月d日 HH:mm')}</time></div>
                  <p>{item.body || '无详细说明'}</p>
                  <span className="notice-item__meta">{meta.label}{item.entityType ? ' · ' + item.entityType : ''}</span>
                </div>
                {canWrite && <button className="icon-button icon-button--danger notice-item__action" onClick={(event) => { event.stopPropagation(); void remove(item); }} aria-label="删除通知"><Trash2 size={15} /></button>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
