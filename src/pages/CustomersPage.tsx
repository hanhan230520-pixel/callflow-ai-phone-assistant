import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, CreditCard, Merge, Phone, Plus, Search, UserPlus, X } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { AppointmentPrefill, ComboRoom, Customer, DiningTable } from '../types';
import { TIER_META, cn, formatDate, maskPhone } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { EmptyState, ErrorState, PageLoader } from '../components/States';
import { CustomerForm } from '../components/CustomerForm';
import { CustomerDetailDrawer } from '../components/CustomerDetail';
import { AppointmentForm } from '../components/AppointmentForm';
import { PaymentForm } from '../components/PaymentForm';
import { Dialog } from '../components/Overlay';
import { Field } from '../components/Field';
import { useToast } from '../components/Toast';

const TIERS = ['', 'new', 'regular', 'vip'] as const;

export function CustomersPage() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [combos, setCombos] = useState<ComboRoom[]>([]);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [mergeSource, setMergeSource] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tier, setTier] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<AppointmentPrefill | null>(null);

  useEffect(() => {
    api.layout().then((layout) => { setTables(layout.tables.filter((table) => table.active !== false)); setCombos(layout.combos); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.customers({ search: debouncedSearch, tier, page, pageSize: 24 });
      setCustomers(result.items); setTotal(result.total); setTotalPages(result.totalPages);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '客户列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); }, [debouncedSearch, tier]);
  useEffect(() => { void load(); }, [debouncedSearch, tier, page]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(customer: Customer) {
    setSelectedId(null);
    setEditing(customer);
    setFormOpen(true);
  }

  function bookFor(customer: Customer) {
    setSelectedId(null);
    setBookingPrefill({ guestName: customer.name, phone: customer.phone, customerId: customer.id });
    setBookingOpen(true);
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="客户关系"
        title="客户档案"
        description="管理客户偏好、过敏信息与预约历史。手机号默认脱敏展示，所有资料均为虚构演示数据。"
        actions={<button type="button" className="button button--primary" onClick={openNew}><UserPlus size={16} />新建客户</button>}
      />

      <section className="filter-bar">
        <div className="filter-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索客户姓名、手机号或偏好" aria-label="搜索客户" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="清空搜索"><X size={14} /></button>}
        </div>
        <div className="filter-divider" />
        <div className="quick-status quick-status--inline" aria-label="客户等级筛选">
          {TIERS.map((value) => (
            <button
              key={value || 'all'}
              type="button"
              className={cn('quick-status__item', tier === value && 'is-active')}
              onClick={() => setTier(value)}
            >
              {value ? TIER_META[value].label : '全部客户'}
            </button>
          ))}
        </div>
      </section>

      <div className="list-summary">
        <span>{loading ? '正在加载客户资料' : `共 ${total} 位客户`}</span>
        <span>联系人信息已脱敏显示</span>
      </div>

      {loading && <PageLoader rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && customers.length === 0 && (
        <div className="panel">
          <EmptyState
            title={search || tier ? '没有匹配的客户' : '还没有客户资料'}
            description={search || tier ? '尝试清空搜索或切换客户等级。' : '新建客户资料，或在创建预约时自动生成。'}
            action={search || tier
              ? <button type="button" className="button button--secondary button--sm" onClick={() => { setSearch(''); setTier(''); }}>清空筛选</button>
              : <button type="button" className="button button--primary button--sm" onClick={openNew}>新建客户</button>}
          />
        </div>
      )}

      {!loading && !error && customers.length > 0 && (
        <div className="customer-grid">
          {customers.map((customer) => (
            <button type="button" className="customer-card" key={customer.id} onClick={() => setSelectedId(customer.id)}>
              <div className="customer-card__top">
                <Avatar name={customer.name} />
                <div className="customer-card__identity">
                  <div><h3>{customer.name}</h3><span className={`tier-pill tier-${TIER_META[customer.tier].tone}`}>{TIER_META[customer.tier].label}</span></div>
                  <p><Phone size={13} />{maskPhone(customer.phone)}</p>
                </div>
                <ArrowUpRight size={16} className="customer-card__arrow" />
              </div>

              <div className="customer-card__tags">
                {customer.preferences && <span className="soft-tag">偏好 · {customer.preferences}</span>}
                {customer.allergies && <span className="soft-tag soft-tag--danger">过敏 · {customer.allergies}</span>}
                {(customer.tags || []).slice(0, 2).map((tag) => <span className="soft-tag" key={tag}>{tag}</span>)}
                {!customer.preferences && !customer.allergies && !(customer.tags || []).length && <span className="soft-tag soft-tag--empty">暂无特殊偏好</span>}
              </div>

              <div className="customer-card__stats">
                <div><strong>{customer.appointmentCount || 0}</strong><span>累计预约</span></div>
                <div><strong>{customer.visitCount || 0}</strong><span>到店次数</span></div>
                <div><strong>¥{Number(customer.totalSpent || 0).toFixed(0)}</strong><span>累计消费</span></div>
              </div>
            </button>
          ))}
          <button type="button" className="customer-add-card" onClick={openNew}>
            <span><Plus size={20} /></span>
            <strong>添加客户</strong>
            <p>创建一份新的虚构客户资料</p>
          </button>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className="list-summary">
          <span>显示 {customers.length} 位，共 {total} 位</span>
          <div className="pagination">
            <button type="button" className="pagination__button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="上一页"><ChevronLeft size={16} /></button>
            <span>{page} / {totalPages}</span>
            <button type="button" className="pagination__button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} aria-label="下一页"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      <CustomerForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        customer={editing}
        onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
      />
      <CustomerDetailDrawer
        open={Boolean(selectedId)}
        customerId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={openEdit}
        onBook={bookFor}
        onAddPayment={(customer) => { setSelectedId(null); setPaymentCustomer(customer); }}
        onMerge={(customer) => { setSelectedId(null); setMergeSource(customer); }}
      />
      <PaymentForm open={Boolean(paymentCustomer)} customer={paymentCustomer} onClose={() => setPaymentCustomer(null)} onSaved={load} />
      <MergeCustomersDialog source={mergeSource} customers={customers} onClose={() => setMergeSource(null)} onMerged={() => { setMergeSource(null); showToast('客户已合并'); load(); }} />
      <AppointmentForm
        open={bookingOpen}
        onClose={() => { setBookingOpen(false); setBookingPrefill(null); }}
        prefill={bookingPrefill}
        tables={tables}
        combos={combos}
        canOverride={can('appointments:override')}
        onSaved={() => { setBookingOpen(false); setBookingPrefill(null); load(); }}
      />
    </div>
  );
}

function MergeCustomersDialog({
  source, customers, onClose, onMerged
}: {
  source: Customer | null; customers: Customer[]; onClose: () => void; onMerged: () => void;
}) {
  const [targetId, setTargetId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTargetId(''); setError(''); }, [source]);

  async function merge() {
    if (!source || !targetId) return;
    setSaving(true); setError('');
    try {
      await api.mergeCustomers(source.id, targetId);
      onMerged();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '合并失败');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={Boolean(source)} onClose={onClose} title="合并客户档案" description="源客户的预约、通话、散客与消费记录会迁移到目标客户，随后源档案删除。"
      footer={<><button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button button--danger" type="button" onClick={merge} disabled={saving || !targetId}>{saving ? '合并中…' : '确认合并'}</button></>}>
      {source && (
        <div className="form-grid">
          {error && <div className="inline-alert inline-alert--error">{error}</div>}
          <div className="inline-alert inline-alert--warning">
            源客户：{source.name} · {maskPhone(source.phone)} · {source.appointmentCount || 0} 条预约
          </div>
          <Field label="合并到目标客户" htmlFor="mergeTarget" required hint="请选择需要保留的客户档案">
            <select id="mergeTarget" className="input select" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">选择目标客户</option>
              {customers.filter((customer) => customer.id !== source.id).map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name} · {maskPhone(customer.phone)}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </Dialog>
  );
}
