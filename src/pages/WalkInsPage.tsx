import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, LoaderCircle, Plus, Search, UserPlus, Users, X } from 'lucide-react';
import { api, ApiError } from '../api';
import type { DiningTable, WalkIn, WalkInInput, WalkInStatus } from '../types';
import { cn, formatDate, maskPhone, todayString } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '../components/States';
import { Dialog } from '../components/Overlay';
import { Field } from '../components/Field';
import { useToast } from '../components/Toast';

const STATUS_META: Record<WalkInStatus, { label: string; tone: string }> = {
  waiting: { label: '等待安排', tone: 'amber' },
  seated: { label: '已入座', tone: 'green' },
  converted: { label: '已转预约', tone: 'indigo' },
  cancelled: { label: '已取消', tone: 'muted' }
};

export function WalkInsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<WalkIn[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WalkIn | null>(null);
  const [converting, setConverting] = useState<WalkIn | null>(null);

  useEffect(() => {
    api.layout().then((layout) => setTables(layout.tables.filter((table) => table.active !== false))).catch(() => undefined);
  }, []);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await api.walkIns({ search, status });
      setItems(result.items); setWaiting(result.waiting);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '散客列表加载失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [search, status]);

  async function seat(item: WalkIn) {
    try {
      await api.updateWalkIn(item.id, { status: 'seated' });
      showToast('已标记入座'); void load();
    } catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '更新失败', 'error'); }
  }

  async function cancel(item: WalkIn) {
    try {
      await api.updateWalkIn(item.id, { status: 'cancelled' });
      showToast('散客记录已取消'); void load();
    } catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '更新失败', 'error'); }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="客户运营"
        title="散客登记"
        description="登记无预约到店客人，安排桌台并一键转为正式预约。"
        actions={<button type="button" className="button button--primary" onClick={() => { setEditing(null); setFormOpen(true); }}><UserPlus size={16} />登记散客</button>}
      />

      <section className="metric-grid metric-grid--compact">
        <article className="metric-card"><div className="metric-card__icon metric-card__icon--amber"><Clock3 size={18} /></div><div><span>等待安排</span><strong>{waiting}</strong></div><p>当前等待入座的散客</p></article>
        <article className="metric-card"><div className="metric-card__icon metric-card__icon--indigo"><Users size={18} /></div><div><span>当前列表</span><strong>{items.length}</strong></div><p>按筛选条件统计</p></article>
        <article className="metric-card"><div className="metric-card__icon metric-card__icon--green"><CheckCircle2 size={18} /></div><div><span>可转预约</span><strong>{items.filter((item) => !item.convertedAppointmentId && item.status !== 'cancelled').length}</strong></div><p>登记记录可继续转化</p></article>
      </section>

      <section className="filter-bar">
        <div className="filter-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索姓名、手机号或备注" aria-label="搜索散客" />{search && <button type="button" onClick={() => setSearch('')} aria-label="清空"><X size={14} /></button>}</div>
        <div className="filter-divider" />
        <div className="quick-status quick-status--inline">
          {[{ value: '', label: '全部' }, ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))].map((item) => (
            <button key={item.value || 'all'} type="button" className={cn('quick-status__item', status === item.value && 'is-active')} onClick={() => setStatus(item.value)}>{item.label}</button>
          ))}
        </div>
      </section>

      {loading && <PageLoader rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && <div className="panel"><EmptyState title="暂无散客记录" description="登记到店散客，安排桌台并保留完整记录。" action={<button className="button button--primary button--sm" onClick={() => setFormOpen(true)}>登记散客</button>} icon={<UserPlus size={22} />} /></div>}
      {!loading && !error && items.length > 0 && (
        <div className="panel table-panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>登记时间</th><th>客人</th><th>人数</th><th>桌台</th><th className="hide-md">状态</th><th>备注</th><th aria-label="操作" /></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="data-table__row data-table__row--static">
                    <td><div className="date-cell"><strong>{item.time}</strong><span>{formatDate(item.date, 'M月d日')}</span></div></td>
                    <td><div className="guest-cell"><UserPlus size={16} /><div><strong>{item.name}</strong><span>{maskPhone(item.phone) || '未留电话'}</span></div></div></td>
                    <td><span className="party-cell">{item.partySize}<small>人</small></span></td>
                    <td><div className="table-cell"><strong>{item.tableName || '待安排'}</strong><span>{item.areaName || '未分配区域'}</span></div></td>
                    <td className="hide-md"><span className={cn('status-badge', `tone-${STATUS_META[item.status].tone}`)}>{STATUS_META[item.status].label}</span></td>
                    <td><div className="summary-cell"><span>{item.notes || '—'}</span></div></td>
                    <td><div className="row-actions row-actions--wide">
                      {item.status === 'waiting' && <button className="button button--ghost button--xs" onClick={() => seat(item)}>入座</button>}
                      {!item.convertedAppointmentId && item.status !== 'cancelled' && <button className="button button--secondary button--xs" onClick={() => setConverting(item)}><ArrowUpRight size={14} />转预约</button>}
                      {item.status === 'waiting' && <button className="button button--ghost button--xs" onClick={() => cancel(item)}>取消</button>}
                      <button className="button button--ghost button--xs" onClick={() => { setEditing(item); setFormOpen(true); }}>编辑</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <WalkInForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} walkIn={editing} tables={tables} onSaved={() => { setFormOpen(false); setEditing(null); void load(); }} />
      <ConvertWalkInDialog walkIn={converting} tables={tables} onClose={() => setConverting(null)} onConverted={() => { setConverting(null); void load(); }} />
    </div>
  );
}

function WalkInForm({
  open, onClose, walkIn, tables, onSaved
}: {
  open: boolean; onClose: () => void; walkIn: WalkIn | null; tables: DiningTable[]; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<WalkInInput>({ name: '', phone: '', date: todayString(), time: '', partySize: 2, tableId: null, notes: '', status: 'waiting' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(walkIn ? { name: walkIn.name, phone: walkIn.phone, date: walkIn.date, time: walkIn.time, partySize: walkIn.partySize, tableId: walkIn.tableId, notes: walkIn.notes, status: walkIn.status } : { name: '', phone: '', date: todayString(), time: '', partySize: 2, tableId: null, notes: '', status: 'waiting' });
  }, [open, walkIn]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setSaving(true);
    try {
      if (walkIn) await api.updateWalkIn(walkIn.id, form);
      else await api.createWalkIn(form);
      showToast(walkIn ? '散客记录已更新' : '散客已登记');
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title={walkIn ? '编辑散客记录' : '登记散客'} description="散客记录可用于现场排位，也可以在安排后转为正式预约。"
      footer={<><button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button button--primary" type="submit" form="walkin-form" disabled={saving}>{saving && <LoaderCircle size={16} className="spin" />}{saving ? '保存中…' : '保存登记'}</button></>}>
      <form id="walkin-form" className="form-grid form-grid--2" onSubmit={submit}>
        {error && <div className="inline-alert inline-alert--error field--full">{error}</div>}
        <Field label="姓名" htmlFor="walkName" required><input id="walkName" className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="如：到店客人 01" autoFocus /></Field>
        <Field label="手机号" htmlFor="walkPhone" hint="可选，用于匹配客户档案"><input id="walkPhone" className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="11 位手机号" /></Field>
        <Field label="日期" htmlFor="walkDate" required><input id="walkDate" type="date" className="input" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
        <Field label="到店时间" htmlFor="walkTime" required><input id="walkTime" type="time" className="input" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></Field>
        <Field label="人数" htmlFor="walkParty" required><input id="walkParty" type="number" min={1} max={50} className="input" value={form.partySize} onChange={(event) => setForm({ ...form, partySize: Number(event.target.value) })} /></Field>
        <Field label="桌台" htmlFor="walkTable"><select id="walkTable" className="input select" value={form.tableId || ''} onChange={(event) => setForm({ ...form, tableId: event.target.value || null })}><option value="">待安排</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name} · {table.capacity} 人</option>)}</select></Field>
        <Field label="备注" htmlFor="walkNotes" className="field--full"><textarea id="walkNotes" className="input textarea" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="人数构成、等位需求、儿童座椅等" /></Field>
      </form>
    </Dialog>
  );
}

function ConvertWalkInDialog({
  walkIn, tables, onClose, onConverted
}: {
  walkIn: WalkIn | null; tables: DiningTable[]; onClose: () => void; onConverted: () => void;
}) {
  const { showToast } = useToast();
  const [phone, setPhone] = useState('');
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [tableId, setTableId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!walkIn) return;
    setPhone(walkIn.phone || ''); setTime(walkIn.time); setPartySize(walkIn.partySize); setTableId(walkIn.tableId || ''); setError('');
  }, [walkIn]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!walkIn) return;
    if (!/^1[3-9]\d{9}$/.test(phone.replace(/\D/g, ''))) { setError('转为正式预约前需要填写有效的 11 位手机号'); return; }
    setSaving(true); setError('');
    try {
      await api.convertWalkIn(walkIn.id, {
        phone: phone.trim(), time, partySize, tableId: tableId || null,
        date: walkIn.date < todayString() ? todayString() : walkIn.date
      });
      showToast('散客已转为预约');
      onConverted();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '转化失败');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={Boolean(walkIn)} onClose={onClose} title="将散客转为预约" description={walkIn ? `${walkIn.name} · ${walkIn.partySize} 人 · 原到店时间 ${walkIn.time}` : ''}
      footer={<><button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button button--primary" type="submit" form="convert-form" disabled={saving}>{saving && <LoaderCircle size={16} className="spin" />}{saving ? '转化中…' : '确认转预约'}</button></>}>
      <form id="convert-form" className="form-grid form-grid--2" onSubmit={submit}>
        {error && <div className="inline-alert inline-alert--error field--full">{error}<span>如需覆盖冲突，请在预约管理中编辑或使用管理员覆盖功能。</span></div>}
        <Field label="手机号" htmlFor="convertPhone" required hint="用于匹配客户档案，缺失时无法转为正式预约"><input id="convertPhone" className="input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="11 位手机号" inputMode="tel" /></Field>
        <Field label="预约时间" htmlFor="convertTime" required><input id="convertTime" type="time" className="input" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
        <Field label="人数" htmlFor="convertParty" required><input id="convertParty" type="number" min={1} max={50} className="input" value={partySize} onChange={(event) => setPartySize(Number(event.target.value))} /></Field>
        <Field label="桌台" htmlFor="convertTable" className="field--full" hint="服务端会执行容量与系统配置的冲突窗口检测">
          <select id="convertTable" className="input select" value={tableId} onChange={(event) => setTableId(event.target.value)}><option value="">自动推荐/待安排</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.name} · {table.capacity} 人</option>)}</select>
        </Field>
        <div className="inline-alert inline-alert--info field--full">转化后散客记录保留，并标记为“已转预约”；预约来源为“到店预约”，初始状态为已到店。</div>
      </form>
    </Dialog>
  );
}
