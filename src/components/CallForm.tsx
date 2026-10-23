import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { api, ApiError } from '../api';
import type { CallDirection, CallInput, CallLog } from '../types';
import { cn, localDateTimeValue } from '../lib/format';
import { Dialog } from './Overlay';
import { Field } from './Field';
import { useToast } from './Toast';

export function CallForm({
  open, onClose, onSaved, prefill
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (call: CallLog) => void;
  prefill?: { contactName?: string; phone?: string; notes?: string } | null;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    contactName: '', phone: '', calledAt: localDateTimeValue(), direction: 'inbound' as CallDirection,
    durationMinutes: '3', summary: '', notes: '', followUp: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError('');
    setForm({
      contactName: prefill?.contactName || '',
      phone: prefill?.phone || '',
      calledAt: localDateTimeValue(),
      direction: 'inbound',
      durationMinutes: '3',
      summary: '',
      notes: prefill?.notes || '',
      followUp: false
    });
  }, [open, prefill]);

  const set = (key: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: '' }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.contactName.trim()) next.contactName = '请填写联系人';
    if (!/^1[3-9]\d{9}$/.test(form.phone.replace(/\D/g, ''))) next.phone = '请输入有效的 11 位手机号';
    if (!form.calledAt) next.calledAt = '请选择联系时间';
    if (!form.summary.trim()) next.summary = '请填写联系摘要';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    setSubmitError('');
    const payload: CallInput = {
      contactName: form.contactName.trim(),
      phone: form.phone.trim(),
      calledAt: form.calledAt,
      direction: form.direction,
      durationSeconds: Math.max(0, Number(form.durationMinutes) || 0) * 60,
      status: 'completed',
      aiSummary: form.summary.trim(),
      notes: form.notes.trim(),
      followUp: form.followUp,
      appointmentId: null,
      isSimulated: false
    };
    try {
      const result = await api.createCall(payload);
      showToast('联系记录已保存');
      onSaved(result.item);
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="新增联系记录"
      description="记录电话沟通结果。CallFlow 演示版不接入真实电话系统，由人工录入。"
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" form="call-form" className="button button--primary" disabled={saving}>
            {saving && <LoaderCircle size={16} className="spin" />}{saving ? '保存中…' : '保存记录'}
          </button>
        </>
      }
    >
      <form id="call-form" className="form-grid form-grid--2" onSubmit={submit} noValidate>
        {submitError && <div className="inline-alert inline-alert--error field--full" role="alert">{submitError}</div>}
        <Field label="联系人" htmlFor="callName" required error={errors.contactName}>
          <input id="callName" className="input" value={form.contactName} onChange={(event) => set('contactName', event.target.value)} placeholder="如：演示来电 07" autoFocus />
        </Field>
        <Field label="手机号" htmlFor="callPhone" required error={errors.phone} hint="界面中会脱敏展示">
          <input id="callPhone" className="input" value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="11 位手机号" inputMode="tel" />
        </Field>
        <Field label="联系时间" htmlFor="calledAt" required error={errors.calledAt}>
          <input id="calledAt" type="datetime-local" className={cn('input', errors.calledAt && 'input--error')} value={form.calledAt} onChange={(event) => set('calledAt', event.target.value)} />
        </Field>
        <Field label="方向" htmlFor="direction">
          <div className="segment-control">
            <button type="button" className={cn('segment-control__item', form.direction === 'inbound' && 'is-active')} onClick={() => set('direction', 'inbound')}>来电</button>
            <button type="button" className={cn('segment-control__item', form.direction === 'outbound' && 'is-active')} onClick={() => set('direction', 'outbound')}>去电</button>
          </div>
        </Field>
        <Field label="时长（分钟）" htmlFor="duration">
          <input id="duration" type="number" min={0} max={1440} className="input" value={form.durationMinutes} onChange={(event) => set('durationMinutes', event.target.value)} />
        </Field>
        <div className="field checkbox-field">
          <label className="checkbox-row">
            <input type="checkbox" checked={form.followUp} onChange={(event) => set('followUp', event.target.checked)} />
            <span>需要后续跟进</span>
          </label>
          <span className="field__hint">标记后会出现在待跟进筛选中</span>
        </div>
        <Field label="联系摘要" htmlFor="summary" required error={errors.summary} className="field--full">
          <input id="summary" className="input" value={form.summary} onChange={(event) => set('summary', event.target.value)} placeholder="如：咨询周末六人桌与停车信息" />
        </Field>
        <Field label="跟进备注" htmlFor="callNotes" className="field--full">
          <textarea id="callNotes" className="input textarea" rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder="记录客户需求、后续动作或约定回电时间" />
        </Field>
      </form>
    </Dialog>
  );
}
