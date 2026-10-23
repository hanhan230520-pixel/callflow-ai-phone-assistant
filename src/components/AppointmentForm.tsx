import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, LoaderCircle, ShieldAlert, Users } from 'lucide-react';
import { api, ApiError } from '../api';
import type {
  Appointment, AppointmentInput, AppointmentPrefill, AppointmentSource, AppointmentStatus,
  ComboRoom, ConflictResult, DiningTable
} from '../types';
import { SOURCE_META, STATUS_META, STATUS_ORDER, cn, todayString } from '../lib/format';
import { Drawer, DrawerHeader } from './Overlay';
import { Field } from './Field';
import { useToast } from './Toast';

interface FormState {
  guestName: string; phone: string; date: string; time: string; partySize: string;
  tableId: string; comboId: string; source: AppointmentSource; status: AppointmentStatus;
  occasion: string; notes: string;
}
type Errors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  guestName: '', phone: '', date: todayString(), time: '', partySize: '2', tableId: '', comboId: '',
  source: 'phone', status: 'pending', occasion: '', notes: ''
};

// 新建预约只允许进行中的初始状态；完成/未到店/已取消必须通过状态流转产生。
const INITIAL_STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'seated'];

export function AppointmentForm({
  open, onClose, appointment, prefill, tables, combos = [], canOverride = false, onSaved
}: {
  open: boolean;
  onClose: () => void;
  appointment?: Appointment | null;
  prefill?: AppointmentPrefill | null;
  tables: DiningTable[];
  combos?: ComboRoom[];
  canOverride?: boolean;
  onSaved: (appointment: Appointment) => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [conflict, setConflict] = useState<ConflictResult | null>(null);
  const [override, setOverride] = useState(false);
  const [conflictWindow, setConflictWindow] = useState(90);

  useEffect(() => {
    if (!open) return;
    setErrors({}); setSubmitError(''); setConflict(null); setOverride(false);
    if (appointment) {
      setForm({
        guestName: appointment.guestName, phone: appointment.phone, date: appointment.date,
        time: appointment.time, partySize: String(appointment.partySize), tableId: appointment.tableId || '',
        comboId: appointment.comboId || '', source: appointment.source, status: appointment.status,
        occasion: appointment.occasion || '', notes: appointment.notes || ''
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        date: prefill?.date || todayString(),
        time: prefill?.time || '',
        guestName: prefill?.guestName || '',
        phone: prefill?.phone || '',
        partySize: prefill?.partySize ? String(prefill.partySize) : EMPTY_FORM.partySize,
        occasion: prefill?.occasion || '',
        tableId: prefill?.comboId ? '' : (prefill?.tableId || ''),
        comboId: prefill?.comboId || '',
        notes: prefill?.notes || ''
      });
    }
  }, [open, appointment, prefill]);

  useEffect(() => {
    if (!open) return;
    api.settings()
      .then((result) => {
        const value = Number(result.meta?.conflictWindow?.value ?? result.settings?.conflict_window_minutes ?? 90);
        if (Number.isFinite(value) && value > 0) setConflictWindow(value);
      })
      .catch(() => undefined);
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
    if (['date', 'time', 'tableId', 'comboId', 'partySize'].includes(key)) { setConflict(null); setOverride(false); }
  };

  const selectedTable = tables.find((table) => table.id === form.tableId);
  const selectedCombo = combos.find((combo) => combo.id === form.comboId);
  const capacity = selectedCombo?.capacity ?? selectedTable?.capacity;

  function validate(): boolean {
    const next: Errors = {};
    if (!form.guestName.trim()) next.guestName = '请填写客人姓名';
    if (!/^1[3-9]\d{9}$/.test(form.phone.replace(/\D/g, ''))) next.phone = '请输入有效的 11 位手机号';
    if (!form.date) next.date = '请选择预约日期';
    // 仅新建或实际改动日期时校验过去日期，避免历史预约无法编辑备注或时间。
    if (form.date && (!appointment || form.date !== appointment.date) && form.date < todayString()) {
      next.date = '不能创建或修改为过去日期的预约';
    }
    if (!form.time) next.time = '请选择预约时间';
    const party = Number(form.partySize);
    if (!Number.isInteger(party) || party < 1 || party > 50) next.partySize = '人数需在 1–50 之间';
    if (capacity && party > capacity) next.tableId = `所选资源最多容纳 ${capacity} 人`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function checkAvailability() {
    if (!validate()) return;
    setChecking(true);
    setSubmitError('');
    try {
      const result = await api.checkAppointment({
        date: form.date, time: form.time, partySize: Number(form.partySize),
        tableId: form.tableId || null, comboId: form.comboId || null, excludeId: appointment?.id
      });
      setConflict(result);
      if (!result.conflicts.length) showToast(result.nearbySlots.length ? '所选时段可用；也列出了附近可选时段' : '所选时段可用');
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '冲突检测失败');
    } finally { setChecking(false); }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true); setSubmitError('');
    const payload: AppointmentInput = {
      guestName: form.guestName.trim(), phone: form.phone.trim(), date: form.date, time: form.time,
      partySize: Number(form.partySize), tableId: form.comboId ? null : (form.tableId || null),
      comboId: form.comboId || null, source: form.source, status: form.status,
      occasion: form.occasion.trim(), notes: form.notes.trim(), customerId: prefill?.customerId || undefined,
      overrideConflict: override
    };
    try {
      const result = appointment
        ? await api.updateAppointment(appointment.id, payload)
        : await api.createAppointment(payload);
      showToast(appointment ? '预约已更新' : override ? '预约已创建（覆盖冲突）' : '预约已创建');
      onSaved(result.item);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '保存失败，请稍后重试';
      setSubmitError(message);
      if (error instanceof ApiError && error.code === 'TABLE_CONFLICT') {
        setConflict(error.details as ConflictResult);
        setErrors((current) => ({ ...current, tableId: message }));
      }
      if (error instanceof ApiError && error.code === 'CAPACITY_EXCEEDED') setErrors((current) => ({ ...current, partySize: error.message }));
      if (error instanceof ApiError && error.code === 'OUTSIDE_TIME_SLOT') setErrors((current) => ({ ...current, time: error.message }));
    } finally { setSaving(false); }
  }

  return (
    <Drawer open={open} onClose={onClose} label={appointment ? '编辑预约' : '新建预约'}>
      <form className="drawer-form" onSubmit={handleSubmit} noValidate>
        <DrawerHeader title={appointment ? '编辑预约' : '新建预约'} subtitle={`系统会按手机号自动匹配客户，并执行 ${conflictWindow} 分钟冲突检测`} onClose={onClose} />
        <div className="drawer__body">
          {submitError && <div className="inline-alert inline-alert--error" role="alert">{submitError}</div>}
          <div className="form-section">
            <div className="form-section__title">客人信息</div>
            <div className="form-grid form-grid--2">
              <Field label="客人姓名" htmlFor="guestName" required error={errors.guestName}>
                <input id="guestName" className={cn('input', errors.guestName && 'input--error')} value={form.guestName} onChange={(event) => set('guestName', event.target.value)} placeholder="如：演示客户 01" autoFocus />
              </Field>
              <Field label="手机号" htmlFor="phone" required error={errors.phone} hint="列表与详情中默认脱敏显示">
                <input id="phone" className={cn('input', errors.phone && 'input--error')} value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="11 位手机号" inputMode="tel" />
              </Field>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section__title">预约安排</div>
            <div className="form-grid form-grid--2">
              <Field label="日期" htmlFor="resDate" required error={errors.date}>
                <div className="input-with-icon"><CalendarDays size={16} /><input id="resDate" type="date" className={cn('input', errors.date && 'input--error')} value={form.date} onChange={(event) => set('date', event.target.value)} /></div>
              </Field>
              <Field label="时间" htmlFor="resTime" required error={errors.time}>
                <div className="input-with-icon"><Clock3 size={16} /><input id="resTime" type="time" className={cn('input', errors.time && 'input--error')} value={form.time} onChange={(event) => set('time', event.target.value)} /></div>
              </Field>
              <Field label="人数" htmlFor="partySize" required error={errors.partySize}>
                <div className="input-with-icon"><Users size={16} /><input id="partySize" type="number" min={1} max={50} className={cn('input', errors.partySize && 'input--error')} value={form.partySize} onChange={(event) => set('partySize', event.target.value)} /></div>
              </Field>
              <Field label="桌台" htmlFor="tableId" error={errors.tableId} hint={selectedTable ? `${selectedTable.areaName || selectedTable.area || '未分区'} · 最多 ${selectedTable.capacity} 人` : '可暂不安排，稍后补填'}>
                <select id="tableId" className={cn('input select', errors.tableId && 'input--error')} value={form.tableId} disabled={Boolean(form.comboId)} onChange={(event) => set('tableId', event.target.value)}>
                  <option value="">待安排</option>
                  {tables.map((table) => <option key={table.id} value={table.id}>{table.name} · {table.areaName || table.area || '未分区'} · {table.capacity} 人</option>)}
                </select>
              </Field>
              <Field label="组合包间" htmlFor="comboId" className="field--full" hint={selectedCombo ? `包含 ${selectedCombo.tableIds.length} 张桌台 · 最多 ${selectedCombo.capacity} 人` : '选择组合包间后将忽略单桌选择'}>
                <select id="comboId" className="input select" value={form.comboId} onChange={(event) => { set('comboId', event.target.value); if (event.target.value) set('tableId', ''); }}>
                  <option value="">不使用组合包间</option>
                  {combos.filter((combo) => combo.active).map((combo) => <option key={combo.id} value={combo.id}>{combo.name} · {combo.capacity} 人</option>)}
                </select>
              </Field>
            </div>
            <div className="form-inline-actions">
              <button type="button" className="button button--secondary button--sm" onClick={checkAvailability} disabled={checking}>
                {checking ? <LoaderCircle size={15} className="spin" /> : <ShieldAlert size={15} />}检测桌台冲突
              </button>
              <span>窗口：前后 {conflictWindow} 分钟</span>
            </div>
          </div>

          {conflict && (
            <div className={cn('conflict-panel', conflict.conflicts.length ? 'conflict-panel--danger' : 'conflict-panel--ok')}>
              <div className="conflict-panel__head">
                {conflict.conflicts.length ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
                <strong>{conflict.conflicts.length ? `检测到 ${conflict.conflicts.length} 条时间冲突` : '当前时段没有冲突'}</strong>
              </div>
              {conflict.conflicts.map((item) => (
                <div className="conflict-row" key={item.id}>
                  <span className="conflict-row__time">{item.time}</span>
                  <span>{item.guestName} · {item.partySize} 人</span>
                  <span>{item.comboName || item.tableName || '未安排桌台'}</span>
                </div>
              ))}
              {conflict.nearbySlots.length > 0 && (
                <div className="nearby-slots">
                  <span>附近可用时段</span>
                  <div>{conflict.nearbySlots.map((slot) => (
                    <button key={`${slot.time}-${slot.tableId}-${slot.comboId}`} type="button" onClick={() => { set('time', slot.time); setConflict(null); setOverride(false); }}>
                      {slot.time}{slot.tableName ? ` · ${slot.tableName}` : ''}
                    </button>
                  ))}</div>
                </div>
              )}
              {conflict.conflicts.length > 0 && canOverride && (
                <label className="override-check">
                  <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
                  <span>我确认需要覆盖冲突并承担安排风险（记录审计日志）</span>
                </label>
              )}
            </div>
          )}

          <div className="form-section">
            <div className="form-section__title">预约属性</div>
            <div className="form-grid form-grid--2">
              <Field label="预约来源" htmlFor="source">
                <select id="source" className="input select" value={form.source} onChange={(event) => set('source', event.target.value as AppointmentSource)}>
                  {Object.entries(SOURCE_META).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="预约状态" htmlFor="status">
                <select id="status" className="input select" value={form.status} onChange={(event) => set('status', event.target.value as AppointmentStatus)}>
                  {(appointment ? STATUS_ORDER : INITIAL_STATUSES).map((value) => <option key={value} value={value}>{STATUS_META[value].label}</option>)}
                </select>
              </Field>
              <Field label="场景" htmlFor="occasion" className="field--full">
                <input id="occasion" className="input" list="occasion-options" value={form.occasion} onChange={(event) => set('occasion', event.target.value)} placeholder="普通用餐 / 生日 / 商务用餐" />
                <datalist id="occasion-options"><option value="普通用餐" /><option value="生日" /><option value="纪念日" /><option value="商务用餐" /><option value="家庭聚餐" /><option value="朋友聚会" /></datalist>
              </Field>
              <Field label="备注" htmlFor="notes" className="field--full">
                <textarea id="notes" className="input textarea" rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder="座位偏好、过敏信息、现场准备事项等" />
              </Field>
            </div>
          </div>
        </div>
        <footer className="drawer__footer">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" className="button button--primary" disabled={saving}>
            {saving && <LoaderCircle size={16} className="spin" />}
            {saving ? '保存中…' : override ? '覆盖冲突并保存' : appointment ? '保存修改' : '创建预约'}
          </button>
        </footer>
      </form>
    </Drawer>
  );
}
