import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Armchair, CalendarDays, CircleDot, Layers3, LoaderCircle, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { Area, ComboRoom, DiningTable, LayoutData, TimeSlot } from '../types';
import { cn, formatDate, todayString } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '../components/States';
import { Dialog } from '../components/Overlay';
import { Field } from '../components/Field';
import { useToast } from '../components/Toast';

function tableTone(table: DiningTable) {
  if (table.status === 'disabled') return 'muted';
  if (table.status === 'cleaning') return 'amber';
  if (table.seatedAppointmentId) return 'green';
  if (table.bookedAppointmentId) return 'indigo';
  return 'slate';
}

function tableLabel(table: DiningTable) {
  if (table.status === 'disabled') return '停用';
  if (table.status === 'cleaning') return '清理中';
  if (table.seatedAppointmentId) return '已入座';
  if (table.bookedAppointmentId) return '已预订';
  return '空闲';
}

export function TablesPage() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [date, setDate] = useState(todayString());
  const [data, setData] = useState<LayoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tableDialog, setTableDialog] = useState<{ table: DiningTable | null } | null>(null);
  const [areaDialog, setAreaDialog] = useState<{ area: Area | null } | null>(null);
  const [comboDialog, setComboDialog] = useState<{ combo: ComboRoom | null } | null>(null);
  const [slotDialog, setSlotDialog] = useState<{ slot: TimeSlot | null } | null>(null);
  const canWrite = can('tables:write');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await api.layout(date)); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : '桌台数据加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [date]);

  async function remove(kind: 'table' | 'area' | 'combo' | 'slot', id: string, name: string) {
    if (!window.confirm('确定删除「' + name + '」吗？此操作不可撤销。')) return;
    try {
      if (kind === 'table') await api.deleteTable(id);
      else if (kind === 'area') await api.deleteArea(id);
      else if (kind === 'combo') await api.deleteCombo(id);
      else await api.deleteSlot(id);
      showToast('已删除'); void load();
    } catch (requestError) {
      showToast(requestError instanceof ApiError ? requestError.message : '删除失败', 'error');
    }
  }

  const grouped = useMemo(() => {
    const areas = data?.areas || [];
    const groups: Array<{ area: Area; tables: DiningTable[] }> = areas.map((area) => ({ area, tables: (data?.tables || []).filter((table) => table.areaId === area.id) }));
    const unassigned = (data?.tables || []).filter((table) => !table.areaId || !areas.some((area) => area.id === table.areaId));
    if (unassigned.length) groups.push({ area: { id: 'unassigned', name: '未分配区域', sortOrder: 9999 }, tables: unassigned });
    return groups.filter((group) => group.tables.length > 0);
  }, [data]);

  const activeTables = (data?.tables || []).filter((table) => table.active !== false && table.status !== 'disabled');
  const freeTables = activeTables.filter((table) => !table.bookedAppointmentId && !table.seatedAppointmentId && table.status === 'available');

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="场所运营"
        title="桌台与座位图"
        description="维护区域、桌台、组合包间与营业时段，实时查看指定日期的桌台占用情况。"
        actions={canWrite ? (
          <div className="button-cluster">
            <button type="button" className="button button--ghost" onClick={() => setAreaDialog({ area: null })}><Plus size={15} />区域</button>
            <button type="button" className="button button--ghost" onClick={() => setSlotDialog({ slot: null })}><Plus size={15} />时段</button>
            <button type="button" className="button button--secondary" onClick={() => setComboDialog({ combo: null })}><Layers3 size={15} />组合包间</button>
            <button type="button" className="button button--primary" onClick={() => setTableDialog({ table: null })}><Plus size={16} />新增桌台</button>
          </div>
        ) : undefined}
      />

      <section className="filter-bar">
        <div className="filter-search filter-search--date"><CalendarDays size={16} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="选择日期" /></div>
        <div className="filter-divider" />
        <span className="filter-label">桌台占用与预订状态按所选日期计算</span>
        <div className="filter-spacer" />
        <span className="filter-stat"><strong>{freeTables.length}</strong> / {activeTables.length} 空闲</span>
      </section>

      {loading && <PageLoader rows={5} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && data && (
        <>
          <section className="metrics-inline">
            <div><Armchair size={17} /><span>桌台</span><strong>{data.tables.length}</strong></div>
            <div><CircleDot size={17} /><span>空闲</span><strong>{freeTables.length}</strong></div>
            <div><Layers3 size={17} /><span>组合包间</span><strong>{data.combos.length}</strong></div>
            <div><Users size={17} /><span>总容量</span><strong>{data.tables.reduce((sum, table) => sum + Number(table.capacity || 0), 0)} 人</strong></div>
          </section>

          <section className="panel">
            <header className="panel__header">
              <div><h2>座位图</h2><p>{formatDate(date, 'yyyy年M月d日')} · 按区域展示桌台与占用情况</p></div>
              <span className="panel__meta">{grouped.length} 个区域</span>
            </header>
            {grouped.length === 0 ? (
              <EmptyState title="尚未配置桌台" description="先创建区域，再添加桌台，即可开始使用桌台预约与冲突检测。" icon={<Armchair size={22} />} action={canWrite ? <button className="button button--primary button--sm" onClick={() => setTableDialog({ table: null })}>新增桌台</button> : undefined} />
            ) : (
              <div className="floor">
                {grouped.map((group) => (
                  <div className="floor-area" key={group.area.id}>
                    <div className="floor-area__label"><span>{group.area.name}</span><small>{group.tables.length} 张桌台</small></div>
                    <div className="floor-grid">
                      {group.tables.map((table) => (
                        <button
                          type="button"
                          key={table.id}
                          className={cn('floor-table', 'floor-table--' + tableTone(table), !table.active && 'is-inactive')}
                          onClick={() => canWrite && setTableDialog({ table })}
                          title={canWrite ? '点击编辑桌台' : table.name}
                        >
                          <span className="floor-table__shape">{table.name}</span>
                          <span className="floor-table__meta">{table.capacity} 人 · {tableLabel(table)}</span>
                          {table.guestName && <span className="floor-table__guest">{table.guestName}{table.appointmentTime ? ' · ' + table.appointmentTime : ''}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="split-grid">
            <section className="panel">
              <header className="panel__header"><div><h2>组合包间</h2><p>多桌合并为一个可预约单元，参与容量与冲突检测</p></div>{canWrite && <button className="button button--ghost button--sm" onClick={() => setComboDialog({ combo: null })}><Plus size={14} />新增</button>}</header>
              {data.combos.length === 0 ? <EmptyState title="暂无组合包间" description="可将相邻桌台组合为包间，容量自动累加。" icon={<Layers3 size={20} />} /> : (
                <div className="stack-list">
                  {data.combos.map((combo) => (
                    <div className="stack-item" key={combo.id}>
                      <div className="stack-item__main"><strong>{combo.name}</strong><span>{combo.tableIds.map((id) => data.tables.find((table) => table.id === id)?.name || id).join(' + ')}</span><small>{combo.notes || '无备注'}</small></div>
                      <div className="stack-item__side"><span className="count-chip">{combo.capacity} 人</span><span className={cn('status-badge', combo.active ? 'tone-green' : 'tone-muted')}>{combo.active ? '启用' : '停用'}</span></div>
                      {canWrite && <div className="row-actions"><button className="icon-button" onClick={() => setComboDialog({ combo })} aria-label="编辑组合包间"><Pencil size={15} /></button><button className="icon-button icon-button--danger" onClick={() => remove('combo', combo.id, combo.name)} aria-label="删除组合包间"><Trash2 size={15} /></button></div>}
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <header className="panel__header"><div><h2>营业时段</h2><p>启用后可限制预约时间落在营业时段内</p></div>{canWrite && <button className="button button--ghost button--sm" onClick={() => setSlotDialog({ slot: null })}><Plus size={14} />新增</button>}</header>
              {data.slots.length === 0 ? <EmptyState title="暂无营业时段" description="新增午餐、晚餐等时段，便于预约排期。" icon={<CalendarDays size={20} />} /> : (
                <div className="stack-list">
                  {data.slots.map((slot) => (
                    <div className="stack-item" key={slot.id}>
                      <div className="stack-item__main"><strong>{slot.name}</strong><span>{slot.startTime} — {slot.endTime}</span></div>
                      <div className="stack-item__side"><span className={cn('status-badge', slot.active ? 'tone-green' : 'tone-muted')}>{slot.active ? '启用' : '停用'}</span></div>
                      {canWrite && <div className="row-actions"><button className="icon-button" onClick={() => setSlotDialog({ slot })} aria-label="编辑时段"><Pencil size={15} /></button><button className="icon-button icon-button--danger" onClick={() => remove('slot', slot.id, slot.name)} aria-label="删除时段"><Trash2 size={15} /></button></div>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="panel">
            <header className="panel__header"><div><h2>区域管理</h2><p>区域用于组织座位图，并影响桌台排序</p></div>{canWrite && <button className="button button--ghost button--sm" onClick={() => setAreaDialog({ area: null })}><Plus size={14} />新增区域</button>}</header>
            {data.areas.length === 0 ? <div className="muted-block">暂无区域，可在新增桌台时一并创建。</div> : (
              <div className="chip-row">
                {data.areas.map((area) => (
                  <span className="area-chip" key={area.id}>{area.name}<small>{data.tables.filter((table) => table.areaId === area.id).length} 张</small>{canWrite && <><button className="icon-button icon-button--tiny" onClick={() => setAreaDialog({ area })} aria-label="编辑区域"><Pencil size={13} /></button><button className="icon-button icon-button--tiny icon-button--danger" onClick={() => remove('area', area.id, area.name)} aria-label="删除区域"><Trash2 size={13} /></button></>}</span>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <TableFormDialog open={Boolean(tableDialog)} table={tableDialog?.table || null} areas={data?.areas || []} onClose={() => setTableDialog(null)} onSaved={() => { setTableDialog(null); void load(); }} />
      <AreaFormDialog open={Boolean(areaDialog)} area={areaDialog?.area || null} onClose={() => setAreaDialog(null)} onSaved={() => { setAreaDialog(null); void load(); }} />
      <ComboFormDialog open={Boolean(comboDialog)} combo={comboDialog?.combo || null} tables={data?.tables || []} onClose={() => setComboDialog(null)} onSaved={() => { setComboDialog(null); void load(); }} />
      <SlotFormDialog open={Boolean(slotDialog)} slot={slotDialog?.slot || null} onClose={() => setSlotDialog(null)} onSaved={() => { setSlotDialog(null); void load(); }} />
    </div>
  );
}

function TableFormDialog({
  open, table, areas, onClose, onSaved
}: {
  open: boolean; table: DiningTable | null; areas: Area[]; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState('');
  const [capacity, setCapacity] = useState(2);
  const [shape, setShape] = useState<'square' | 'round' | 'rectangle'>('square');
  const [status, setStatus] = useState<'available' | 'cleaning' | 'disabled'>('available');
  const [comboGroup, setComboGroup] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setName(table?.name || '');
    setAreaId(table?.areaId || '');
    setCapacity(table?.capacity || 2);
    setShape(table?.shape || 'square');
    setStatus((table?.status as 'available' | 'cleaning' | 'disabled') || 'available');
    setComboGroup(table?.comboGroup || '');
    setActive(table ? table.active !== false : true);
  }, [open, table]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    const payload = { name, areaId: areaId || null, capacity, shape, status, comboGroup, active };
    try {
      if (table) await api.updateTable(table.id, payload);
      else await api.createTable(payload);
      showToast(table ? '桌台已更新' : '桌台已创建');
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title={table ? '编辑桌台' : '新增桌台'} description="桌台容量会用于预约容量校验，状态会影响可预约性。"
      footer={<><button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button button--primary" type="submit" form="table-form" disabled={saving}>{saving && <LoaderCircle size={16} className="spin" />}{saving ? '保存中…' : '保存桌台'}</button></>}>
      <form id="table-form" className="form-grid form-grid--2" onSubmit={submit}>
        {error && <div className="inline-alert inline-alert--error field--full">{error}</div>}
        <Field label="桌台名称" htmlFor="tableName" required><input id="tableName" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="如：A01" autoFocus /></Field>
        <Field label="所属区域" htmlFor="tableArea"><select id="tableArea" className="input select" value={areaId} onChange={(event) => setAreaId(event.target.value)}><option value="">未分配</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></Field>
        <Field label="座位数" htmlFor="tableCapacity" required><input id="tableCapacity" type="number" min={1} max={100} className="input" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} /></Field>
        <Field label="桌型" htmlFor="tableShape"><select id="tableShape" className="input select" value={shape} onChange={(event) => setShape(event.target.value as typeof shape)}><option value="square">方桌</option><option value="round">圆桌</option><option value="rectangle">长桌</option></select></Field>
        <Field label="运营状态" htmlFor="tableStatus"><select id="tableStatus" className="input select" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="available">可用</option><option value="cleaning">清理中</option><option value="disabled">停用</option></select></Field>
        <Field label="组合标记" htmlFor="tableCombo" hint="可选，用于标注可组合区域"><input id="tableCombo" className="input" value={comboGroup} onChange={(event) => setComboGroup(event.target.value)} placeholder="如：东侧" /></Field>
        <label className="check-field field--full"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>启用桌台</strong><small>停用后不出现在可预约桌台列表中</small></span></label>
      </form>
    </Dialog>
  );
}

function AreaFormDialog({
  open, area, onClose, onSaved
}: {
  open: boolean; area: Area | null; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(area?.name || ''); setSortOrder(area?.sortOrder || 0); setError('');
  }, [open, area]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (area) await api.updateArea(area.id, { name, sortOrder });
      else await api.createArea({ name, sortOrder });
      showToast(area ? '区域已更新' : '区域已创建'); onSaved();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title={area ? '编辑区域' : '新增区域'} description="区域用于组织座位图，排序值越小越靠前。" size="small"
      footer={<><button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button button--primary" type="submit" form="area-form" disabled={saving}>{saving ? '保存中…' : '保存区域'}</button></>}>
      <form id="area-form" className="form-grid" onSubmit={submit}>
        {error && <div className="inline-alert inline-alert--error">{error}</div>}
        <Field label="区域名称" htmlFor="areaName" required><input id="areaName" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="如：大厅、露台、包间区" autoFocus /></Field>
        <Field label="排序" htmlFor="areaSort" hint="数字越小越靠前"><input id="areaSort" type="number" className="input" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></Field>
      </form>
    </Dialog>
  );
}

function ComboFormDialog({
  open, combo, tables, onClose, onSaved
}: {
  open: boolean; combo: ComboRoom | null; tables: DiningTable[]; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [capacity, setCapacity] = useState('');
  const [capacityTouched, setCapacityTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(combo?.name || ''); setTableIds(combo?.tableIds || []); setCapacity(combo ? String(combo.capacity) : '');
    setCapacityTouched(false); setNotes(combo?.notes || ''); setActive(combo ? combo.active : true); setError('');
  }, [open, combo]);

  const toggle = (id: string) => {
    setTableIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    // 未手动改容量时，桌台变化后使用自动累加，避免沿用旧组合的容量。
    if (!capacityTouched) setCapacity('');
  };
  const computed = tables.filter((table) => tableIds.includes(table.id)).reduce((sum, table) => sum + Number(table.capacity || 0), 0);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    if (tableIds.length < 2) { setError('组合包间至少需要选择两张桌台'); setSaving(false); return; }
    const payload: Record<string, unknown> = { name, notes, active };
    const tableIdsChanged = !combo
      || tableIds.length !== combo.tableIds.length
      || tableIds.some((id) => !combo.tableIds.includes(id));
    if (tableIdsChanged) payload.tableIds = tableIds;
    // 仅在用户手动填写容量时提交，否则由服务端按所选桌台重新累加，避免变更桌台后容量失真。
    if (capacityTouched && capacity) payload.capacity = Number(capacity);
    try {
      if (combo) await api.updateCombo(combo.id, payload);
      else await api.createCombo(payload as { name: string; tableIds: string[]; capacity?: number; notes?: string; active?: boolean });
      showToast(combo ? '组合包间已更新' : '组合包间已创建'); onSaved();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title={combo ? '编辑组合包间' : '新增组合包间'} description="选择两张或以上桌台组成包间，预约时按组合容量校验。"
      footer={<><button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button button--primary" type="submit" form="combo-form" disabled={saving || tableIds.length < 2}>{saving ? '保存中…' : '保存包间'}</button></>}>
      <form id="combo-form" className="form-grid form-grid--2" onSubmit={submit}>
        {error && <div className="inline-alert inline-alert--error field--full">{error}</div>}
        <Field label="包间名称" htmlFor="comboName" required><input id="comboName" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="如：东侧包间" autoFocus /></Field>
        <Field label="容量" htmlFor="comboCapacity" hint={tableIds.length ? '留空自动累加：' + computed + ' 人' : '留空自动累加所选桌台容量'}><input id="comboCapacity" type="number" min={1} max={200} className="input" value={capacity} onChange={(event) => { setCapacity(event.target.value); setCapacityTouched(true); }} placeholder={String(computed || '')} /></Field>
        <Field label="包含桌台" className="field--full" required>
          <div className="check-grid">
            {tables.map((table) => (
              <label className="check-card" key={table.id}><input type="checkbox" checked={tableIds.includes(table.id)} onChange={() => toggle(table.id)} /><span><strong>{table.name}</strong><small>{table.capacity} 人 · {table.status === 'disabled' ? '停用' : '可用'}</small></span></label>
            ))}
          </div>
        </Field>
        <Field label="备注" htmlFor="comboNotes" className="field--full"><textarea id="comboNotes" className="input textarea" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="包间说明、最低消费等" /></Field>
        <label className="check-field field--full"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>启用包间</strong><small>停用后不可用于新预约</small></span></label>
      </form>
    </Dialog>
  );
}

function SlotFormDialog({
  open, slot, onClose, onSaved
}: {
  open: boolean; slot: TimeSlot | null; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('11:00');
  const [endTime, setEndTime] = useState('14:00');
  const [sortOrder, setSortOrder] = useState(0);
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(slot?.name || ''); setStartTime(slot?.startTime || '11:00'); setEndTime(slot?.endTime || '14:00');
    setSortOrder(slot?.sortOrder || 0); setActive(slot ? slot.active : true); setError('');
  }, [open, slot]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    if (startTime >= endTime) { setError('结束时间必须晚于开始时间'); setSaving(false); return; }
    try {
      const payload = { name, startTime, endTime, sortOrder, active };
      if (slot) await api.updateSlot(slot.id, payload);
      else await api.createSlot(payload);
      showToast(slot ? '营业时段已更新' : '营业时段已创建'); onSaved();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title={slot ? '编辑营业时段' : '新增营业时段'} description="当系统设置启用时段限制时，预约时间必须落在任一启用时段内。" size="small"
      footer={<><button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button button--primary" type="submit" form="slot-form" disabled={saving}>{saving ? '保存中…' : '保存时段'}</button></>}>
      <form id="slot-form" className="form-grid form-grid--2" onSubmit={submit}>
        {error && <div className="inline-alert inline-alert--error field--full">{error}</div>}
        <Field label="时段名称" htmlFor="slotName" required className="field--full"><input id="slotName" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="如：午餐、晚餐" autoFocus /></Field>
        <Field label="开始时间" htmlFor="slotStart" required><input id="slotStart" type="time" className="input" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></Field>
        <Field label="结束时间" htmlFor="slotEnd" required><input id="slotEnd" type="time" className="input" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></Field>
        <Field label="排序" htmlFor="slotSort"><input id="slotSort" type="number" className="input" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></Field>
        <label className="check-field"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>启用</strong><small>参与预约时间校验</small></span></label>
      </form>
    </Dialog>
  );
}
