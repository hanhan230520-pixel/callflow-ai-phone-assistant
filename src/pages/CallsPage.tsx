import { useEffect, useState } from 'react';
import {
  ArrowUpRight, Bot, CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight, Phone, PhoneCall,
  PhoneIncoming, PhoneOutgoing, Plus, Search, Sparkles, Waves, X
} from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { Appointment, AppointmentPrefill, CallLog, CallStats, ComboRoom, DiningTable } from '../types';
import { cn, formatDate, formatDateTime, formatDuration, maskPhone } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '../components/States';
import { CallForm } from '../components/CallForm';
import { AppointmentForm } from '../components/AppointmentForm';
import { CallDetailDrawer } from '../components/CallDetailDrawer';
import { SimulateCallDialog } from '../components/SimulateCallDialog';
import { useToast } from '../components/Toast';

const CALL_STATUS_LABEL: Record<string, string> = {
  ringing: '响铃中', answered: '通话中', completed: '已完成', missed: '未接', follow_up: '待跟进'
};

export function CallsPage() {
  const { showToast } = useToast();
  const { can } = useAuth();
  const [items, setItems] = useState<CallLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [combos, setCombos] = useState<ComboRoom[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [simulated, setSimulated] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [convertingCall, setConvertingCall] = useState<CallLog | null>(null);
  const [bookingPrefill, setBookingPrefill] = useState<AppointmentPrefill | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    api.layout().then((layout) => { setTables(layout.tables.filter((table) => table.active !== false)); setCombos(layout.combos); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await api.calls({ search: debouncedSearch, status, followUp, simulated, page, pageSize: 20 });
      setItems(result.items); setTotal(result.total); setTotalPages(result.totalPages); setStats(result.stats);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '联系记录加载失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { setPage(1); }, [debouncedSearch, followUp, simulated, status]);
  useEffect(() => { void load(); }, [debouncedSearch, followUp, simulated, status, page]);

  async function toggleFollowUp(call: CallLog) {
    setUpdatingId(call.id);
    try {
      const result = await api.updateCall(call.id, { followUp: !call.followUp });
      setItems((current) => current.map((item) => item.id === call.id ? result.item : item));
      showToast(!call.followUp ? '已标记为完成跟进' : '已重新加入待跟进');
      void load();
    } catch (requestError) {
      showToast(requestError instanceof ApiError ? requestError.message : '更新失败', 'error');
    } finally { setUpdatingId(null); }
  }

  function openConversion(call: CallLog) {
    setSelectedId(null); setSimulateOpen(false);
    const extracted = (call.aiExtracted || {}) as Record<string, unknown>;
    setConvertingCall(call);
    const extractedParty = Number(extracted.partySize);
    setBookingPrefill({
      guestName: String(extracted.guestName || call.contactName),
      phone: String(extracted.phone || call.phone),
      date: extracted.date ? String(extracted.date) : undefined,
      time: extracted.time ? String(extracted.time) : undefined,
      partySize: Number.isInteger(extractedParty) && extractedParty >= 1 && extractedParty <= 50 ? extractedParty : undefined,
      occasion: extracted.occasion ? String(extracted.occasion) : undefined,
      tableId: extracted.tableId ? String(extracted.tableId) : undefined,
      comboId: extracted.comboId ? String(extracted.comboId) : undefined,
      notes: String(extracted.notes || call.aiSummary || call.notes || '')
    });
    setBookingOpen(true);
  }

  async function handleBookingSaved(appointment: Appointment) {
    if (convertingCall) {
      try {
        await api.linkCall(convertingCall.id, appointment.id);
        showToast('预约已创建并关联到通话记录');
      } catch (requestError) {
        showToast(requestError instanceof ApiError ? requestError.message : '预约已创建，但关联失败', 'error');
      }
    }
    setBookingOpen(false); setBookingPrefill(null); setConvertingCall(null); void load();
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="来电中心"
        title="来电与 AI 通话工作台"
        description="模拟来电识别、通话状态、转写、AI 提取与预约转化。所有模拟内容均有明确标记。"
        actions={
          <>
            <button type="button" className="button button--secondary" onClick={() => setFormOpen(true)}><Plus size={16} />手动记录</button>
            <button type="button" className="button button--primary" onClick={() => setSimulateOpen(true)}><Waves size={16} />模拟来电</button>
          </>
        }
      />

      <section className="metric-grid metric-grid--compact">
        <article className="metric-card"><div className="metric-card__icon metric-card__icon--indigo"><PhoneCall size={18} /></div><div><span>累计通话</span><strong>{stats?.total ?? '—'}</strong></div><p>含手动与模拟记录</p></article>
        <article className="metric-card"><div className="metric-card__icon metric-card__icon--blue"><Phone size={18} /></div><div><span>今日来电</span><strong>{stats?.today ?? '—'}</strong></div><p>按联系时间统计</p></article>
        <article className="metric-card"><div className="metric-card__icon metric-card__icon--amber"><Sparkles size={18} /></div><div><span>待跟进</span><strong>{stats?.followUp ?? '—'}</strong></div><p>需要二次联系</p></article>
        <article className="metric-card"><div className="metric-card__icon metric-card__icon--violet"><Bot size={18} /></div><div><span>模拟通话</span><strong>{stats?.simulated ?? '—'}</strong></div><p>链路演示产生的记录</p></article>
      </section>

      <section className="filter-bar">
        <div className="filter-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索联系人、手机号、摘要或转写" aria-label="搜索联系记录" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="清空搜索"><X size={14} /></button>}
        </div>
        <div className="filter-divider" />
        <select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="按通话状态筛选">
          <option value="">全部状态</option>
          {Object.entries(CALL_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="filter-select" value={simulated} onChange={(event) => setSimulated(event.target.value)} aria-label="按来源筛选">
          <option value="">全部来源</option><option value="true">模拟通话</option><option value="false">手动记录</option>
        </select>
        <div className="quick-status quick-status--inline">
          {[{ value: '', label: '全部' }, { value: 'true', label: '待跟进' }, { value: 'false', label: '已跟进' }].map((item) => (
            <button key={item.value || 'all'} type="button" className={cn('quick-status__item', followUp === item.value && 'is-active')} onClick={() => setFollowUp(item.value)}>{item.label}</button>
          ))}
        </div>
      </section>

      <div className="list-summary"><span>{loading ? '正在加载联系记录' : `共 ${total} 条联系记录`}</span><span>敏感号码已脱敏 · 模拟记录单独标记</span></div>

      {loading && <PageLoader rows={5} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && (
        <div className="panel">
          <EmptyState
            title="没有匹配的通话记录"
            description="发起一次模拟来电，体验完整的识别、转写与 AI 提取流程。"
            action={<button type="button" className="button button--primary button--sm" onClick={() => setSimulateOpen(true)}><Waves size={15} />发起模拟来电</button>}
            icon={<PhoneCall size={22} />}
          />
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="panel table-panel">
          <div className="table-scroll">
            <table className="data-table call-table">
              <thead><tr><th>联系时间</th><th>联系人</th><th className="hide-md">状态</th><th>沟通摘要</th><th className="hide-lg">关联预约</th><th>跟进</th><th aria-label="操作" /></tr></thead>
              <tbody>
                {items.map((call) => (
                  <tr key={call.id} className="data-table__row" onClick={() => setSelectedId(call.id)}>
                    <td><div className="date-cell"><strong>{formatDateTime(call.calledAt, 'HH:mm')}</strong><span>{formatDate(call.calledAt, 'M月d日')}</span></div></td>
                    <td>
                      <div className="call-contact">
                        <span className={cn('call-direction', call.direction === 'inbound' ? 'is-inbound' : 'is-outbound')}>{call.direction === 'inbound' ? <PhoneIncoming size={15} /> : <PhoneOutgoing size={15} />}</span>
                        <div><strong>{call.contactName}{call.isSimulated && <span className="demo-badge demo-badge--subtle">模拟</span>}</strong><span>{maskPhone(call.phone)}</span></div>
                      </div>
                    </td>
                    <td className="hide-md"><span className={`call-status call-status--${call.status}`}>{CALL_STATUS_LABEL[call.status] || call.status}</span><span className="duration-label">{formatDuration(call.durationSeconds)}</span></td>
                    <td><div className="summary-cell"><strong>{call.aiSummary || '暂无摘要'}</strong>{call.notes && <span>{call.notes}</span>}</div></td>
                    <td className="hide-lg">
                      {call.appointmentId ? <div className="linked-booking"><CalendarPlus size={14} /><div><strong>{call.linkedGuestName || '已关联'}</strong><span>{call.linkedDate ? `${formatDate(call.linkedDate, 'M月d日')} ${call.linkedTime || ''}` : '已关联预约'}</span></div></div> : <span className="muted-text">未关联</span>}
                    </td>
                    <td><span className={cn('follow-badge', call.followUp ? 'is-pending' : 'is-done')}>{call.followUp ? <Phone size={12} /> : <CheckCircle2 size={12} />}{call.followUp ? '待跟进' : '已跟进'}</span></td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="row-actions row-actions--wide">
                        <button type="button" className="button button--ghost button--xs" onClick={() => toggleFollowUp(call)} disabled={updatingId === call.id}>{call.followUp ? <Check size={14} /> : <Phone size={14} />}{call.followUp ? '标记已跟进' : '重新跟进'}</button>
                        {!call.appointmentId && <button type="button" className="button button--secondary button--xs" onClick={() => openConversion(call)}><ArrowUpRight size={14} />转预约</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="table-footer">
            <span>显示 {items.length} 条，共 {total} 条</span>
            <div className="pagination">
              <button type="button" className="pagination__button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="上一页"><ChevronLeft size={16} /></button>
              <span>{page} / {totalPages}</span>
              <button type="button" className="pagination__button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} aria-label="下一页"><ChevronRight size={16} /></button>
            </div>
          </footer>
        </div>
      )}

      <CallForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); void load(); }} />
      <SimulateCallDialog open={simulateOpen} onClose={() => setSimulateOpen(false)} onConvert={openConversion} onUpdated={load} />
      <CallDetailDrawer open={Boolean(selectedId)} callId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} onConvert={openConversion} />
      <AppointmentForm
        open={bookingOpen}
        onClose={() => { setBookingOpen(false); setBookingPrefill(null); setConvertingCall(null); }}
        prefill={bookingPrefill}
        tables={tables}
        combos={combos}
        canOverride={can('appointments:override')}
        onSaved={handleBookingSaved}
      />
    </div>
  );
}
