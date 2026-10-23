import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight, CalendarPlus, ChevronLeft, ChevronRight, FilterX, LoaderCircle,
  Pencil, Search, X
} from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { Appointment, AppointmentPrefill, AppointmentStatus, ComboRoom, DiningTable } from '../types';
import {
  SOURCE_META, STATUS_META, STATUS_ORDER, cn, formatDate, maskPhone
} from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { TierBadge } from '../components/Badges';
import { AppointmentForm } from '../components/AppointmentForm';
import { AppointmentDetailDrawer } from '../components/AppointmentDetail';
import { EmptyState, ErrorState, PageLoader } from '../components/States';
import { useToast } from '../components/Toast';

interface ListData {
  items: Appointment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function AppointmentsPage() {
  const { showToast } = useToast();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [combos, setCombos] = useState<ComboRoom[]>([]);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [prefill, setPrefill] = useState<AppointmentPrefill | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    api.layout().then((layout) => { setTables(layout.tables.filter((table) => table.active !== false)); setCombos(layout.combos); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, source, from, to]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.appointments({
        search: debouncedSearch, status, source, from, to, page, pageSize: 10
      }));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '预约列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [debouncedSearch, status, source, from, to, page]);

  useEffect(() => {
    const isNew = searchParams.get('new') === '1';
    const editId = searchParams.get('edit');
    if (isNew) {
      const partySize = Number(searchParams.get('partySize'));
      setEditing(null);
      setPrefill({
        guestName: searchParams.get('name') || '',
        phone: searchParams.get('phone') || '',
        date: searchParams.get('date') || undefined,
        time: searchParams.get('time') || undefined,
        partySize: Number.isInteger(partySize) && partySize >= 1 && partySize <= 50 ? partySize : undefined,
        occasion: searchParams.get('occasion') || undefined,
        notes: searchParams.get('notes') || ''
      });
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    } else if (editId) {
      api.appointment(editId)
        .then((result) => {
          setEditing(result.item);
          setFormOpen(true);
        })
        .catch((requestError) => showToast(requestError instanceof ApiError ? requestError.message : '预约加载失败', 'error'));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const filtersActive = Boolean(search || status || source || from || to);

  function resetFilters() {
    setSearch('');
    setStatus('');
    setSource('');
    setFrom('');
    setTo('');
  }

  async function updateStatus(appointment: Appointment, nextStatus: AppointmentStatus) {
    if (nextStatus === appointment.status) return;
    setUpdatingId(appointment.id);
    try {
      const result = await api.changeAppointmentStatus(appointment.id, nextStatus);
      setData((current) => current ? {
        ...current,
        items: current.items.map((item) => item.id === appointment.id ? result.item : item)
      } : current);
      showToast(`状态已更新为「${STATUS_META[nextStatus].label}」`);
      // 状态筛选或分页下，本地替换可能留下不符合筛选条件的行，重新拉取以保持一致。
      void load();
    } catch (requestError) {
      showToast(requestError instanceof ApiError ? requestError.message : '状态更新失败', 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  function openNew() {
    setEditing(null);
    setPrefill(null);
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
        eyebrow="预约管理"
        title="预约列表"
        description="集中查看、筛选并维护所有预约。支持状态流转、桌台冲突校验与客户档案自动关联。"
        actions={<button type="button" className="button button--primary" onClick={openNew}><CalendarPlus size={16} />新建预约</button>}
      />

      <section className="filter-bar">
        <div className="filter-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索姓名、手机号、桌台或备注"
            aria-label="搜索预约"
          />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="清空搜索"><X size={14} /></button>}
        </div>
        <div className="filter-divider" />
        <select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="按状态筛选">
          <option value="">全部状态</option>
          {STATUS_ORDER.map((value) => <option key={value} value={value}>{STATUS_META[value].label}</option>)}
        </select>
        <select className="filter-select" value={source} onChange={(event) => setSource(event.target.value)} aria-label="按来源筛选">
          <option value="">全部来源</option>
          {Object.entries(SOURCE_META).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="date-range">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="开始日期" />
          <span>至</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="结束日期" />
        </div>
        {filtersActive && (
          <button type="button" className="filter-clear" onClick={resetFilters}><FilterX size={15} />重置</button>
        )}
      </section>

      <div className="quick-status" aria-label="快捷状态筛选">
        {[{ value: '', label: '全部' }, ...STATUS_ORDER.map((value) => ({ value, label: STATUS_META[value].label }))].map((item) => (
          <button
            key={item.value || 'all'}
            type="button"
            className={cn('quick-status__item', status === item.value && 'is-active')}
            onClick={() => setStatus(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="list-summary">
        <span>{data ? `共 ${data.total} 条预约` : '正在统计预约'}</span>
        {data && data.total > 0 && <span>第 {data.page} / {data.totalPages} 页</span>}
      </div>

      {loading && <PageLoader rows={5} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && data && (
        data.items.length === 0 ? (
          <div className="panel">
            <EmptyState
              title={filtersActive ? '没有匹配的预约' : '还没有预约记录'}
              description={filtersActive ? '尝试更换筛选条件或清空搜索关键词。' : '创建第一条预约，开始使用预约工作台。'}
              action={filtersActive
                ? <button type="button" className="button button--secondary button--sm" onClick={resetFilters}>清空筛选</button>
                : <button type="button" className="button button--primary button--sm" onClick={openNew}>新建预约</button>}
            />
          </div>
        ) : (
          <div className="panel table-panel">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>日期 / 时间</th>
                    <th>客人</th>
                    <th className="hide-lg">手机号</th>
                    <th>人数</th>
                    <th>桌台</th>
                    <th className="hide-md">来源</th>
                    <th>状态</th>
                    <th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((appointment) => (
                    <AppointmentTableRow
                      key={appointment.id}
                      appointment={appointment}
                      updating={updatingId === appointment.id}
                      onOpen={() => setSelectedId(appointment.id)}
                      onEdit={() => openEdit(appointment)}
                      onStatusChange={(next) => updateStatus(appointment, next)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="table-footer">
              <span>显示 {data.items.length} 条，共 {data.total} 条</span>
              <div className="pagination">
                <button type="button" className="pagination__button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="上一页"><ChevronLeft size={16} /></button>
                <span>{page} / {data.totalPages}</span>
                <button type="button" className="pagination__button" disabled={page >= data.totalPages} onClick={() => setPage((current) => current + 1)} aria-label="下一页"><ChevronRight size={16} /></button>
              </div>
            </footer>
          </div>
        )
      )}

      <AppointmentForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); setPrefill(null); }}
        appointment={editing}
        prefill={prefill}
        tables={tables}
        combos={combos}
        canOverride={can('appointments:override')}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          setPrefill(null);
          load();
        }}
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

function AppointmentTableRow({
  appointment, updating, onOpen, onEdit, onStatusChange
}: {
  appointment: Appointment;
  updating: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onStatusChange: (status: AppointmentStatus) => void;
}) {
  return (
    <tr className="data-table__row" onClick={onOpen}>
      <td>
        <div className="date-cell">
          <strong>{appointment.time}</strong>
          <span>{formatDate(appointment.date, 'M月d日')}</span>
        </div>
      </td>
      <td>
        <div className="guest-cell">
          <Avatar name={appointment.guestName} size="sm" />
          <div>
            <strong>{appointment.guestName}{appointment.customerTier && <TierBadge tier={appointment.customerTier} />}</strong>
            <span>{appointment.partySize} 人 · {appointment.occasion || '普通用餐'}</span>
          </div>
        </div>
      </td>
      <td className="hide-lg"><span className="masked-phone">{maskPhone(appointment.phone)}</span></td>
      <td><span className="party-cell">{appointment.partySize}<small>人</small></span></td>
      <td>
        <div className="table-cell">
          <strong>{appointment.comboName || appointment.tableName || '待安排'}</strong>
          <span>{appointment.comboName ? '组合包间' : appointment.areaName || '未分配区域'}</span>
        </div>
      </td>
      <td className="hide-md"><span className="source-cell">{SOURCE_META[appointment.source]}</span></td>
      <td onClick={(event) => event.stopPropagation()}>
        <div className={cn('status-select-wrap', updating && 'is-updating')}>
          <select
            className={cn('status-select', `tone-${STATUS_META[appointment.status].tone}`)}
            value={appointment.status}
            onChange={(event) => onStatusChange(event.target.value as AppointmentStatus)}
            disabled={updating}
            aria-label={`修改 ${appointment.guestName} 的预约状态`}
          >
            {STATUS_ORDER.map((value) => <option key={value} value={value}>{STATUS_META[value].label}</option>)}
          </select>
          {updating && <LoaderCircle size={14} className="spin" />}
        </div>
      </td>
      <td onClick={(event) => event.stopPropagation()}>
        <div className="row-actions">
          <button type="button" className="icon-button icon-button--sm" onClick={onEdit} aria-label="编辑预约"><Pencil size={15} /></button>
          <button type="button" className="icon-button icon-button--sm" onClick={onOpen} aria-label="查看预约详情"><ArrowUpRight size={16} /></button>
        </div>
      </td>
    </tr>
  );
}
