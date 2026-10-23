import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Customer, CustomerInput, CustomerTier } from '../types';
import { TIER_META, cn } from '../lib/format';
import { Dialog } from './Overlay';
import { Field } from './Field';
import { useToast } from './Toast';

export function CustomerForm({
  open, onClose, customer, onSaved
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSaved: (customer: Customer) => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<CustomerInput>({
    name: '', phone: '', tier: 'new', preferences: '', allergies: '', notes: '', tags: []
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerInput, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError('');
    setForm(customer ? {
      name: customer.name,
      phone: customer.phone,
      tier: customer.tier,
      preferences: customer.preferences,
      allergies: customer.allergies,
      notes: customer.notes,
      tags: customer.tags || []
    } : { name: '', phone: '', tier: 'new', preferences: '', allergies: '', notes: '', tags: [] });
  }, [open, customer]);

  const set = <K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = '请填写客户姓名';
    if (!/^1[3-9]\d{9}$/.test(form.phone.replace(/\D/g, ''))) next.phone = '请输入有效的 11 位手机号';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    setSubmitError('');
    try {
      const result = customer
        ? await api.updateCustomer(customer.id, { ...form, name: form.name.trim(), phone: form.phone.trim() })
        : await api.createCustomer({ ...form, name: form.name.trim(), phone: form.phone.trim() });
      showToast(customer ? '客户资料已更新' : '客户资料已创建');
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
      title={customer ? '编辑客户资料' : '新建客户资料'}
      description="演示环境中的客户资料均为虚构，请勿录入真实个人信息。"
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" form="customer-form" className="button button--primary" disabled={saving}>
            {saving && <LoaderCircle size={16} className="spin" />}{saving ? '保存中…' : '保存资料'}
          </button>
        </>
      }
    >
      <form id="customer-form" className="form-grid form-grid--2" onSubmit={submit} noValidate>
        {submitError && <div className="inline-alert inline-alert--error field--full" role="alert">{submitError}</div>}
        <Field label="客户姓名" htmlFor="custName" required error={errors.name}>
          <input id="custName" className={cn('input', errors.name && 'input--error')} value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="如：演示客户 10" autoFocus />
        </Field>
        <Field label="手机号" htmlFor="custPhone" required error={errors.phone} hint="界面中会脱敏展示">
          <input id="custPhone" className={cn('input', errors.phone && 'input--error')} value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="11 位手机号" inputMode="tel" />
        </Field>
        <Field label="客户等级" htmlFor="custTier" className="field--full">
          <div className="segment-control segment-control--three">
            {(['new', 'regular', 'vip'] as CustomerTier[]).map((tier) => (
              <button
                key={tier}
                type="button"
                className={cn('segment-control__item', form.tier === tier && 'is-active')}
                onClick={() => set('tier', tier)}
              >
                {TIER_META[tier].label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="偏好" htmlFor="custPreferences" className="field--full">
          <input id="custPreferences" className="input" value={form.preferences} onChange={(event) => set('preferences', event.target.value)} placeholder="如：靠窗、安静区域、低糖饮品" />
        </Field>
        <Field label="过敏信息" htmlFor="custAllergies" className="field--full">
          <input id="custAllergies" className="input" value={form.allergies} onChange={(event) => set('allergies', event.target.value)} placeholder="如：花生、乳制品；没有可留空" />
        </Field>
        <Field label="客户标签" htmlFor="custTags" className="field--full" hint="使用逗号分隔，例如：高价值, 纪念日偏好, 需二次确认">
          <input id="custTags" className="input" value={form.tags.join('，')} onChange={(event) => set('tags', event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))} placeholder="高价值, 靠窗偏好" />
        </Field>
        <Field label="服务备注" htmlFor="custNotes" className="field--full">
          <textarea id="custNotes" className="input textarea" rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder="与预约服务相关的通用备注" />
        </Field>
      </form>
    </Dialog>
  );
}
