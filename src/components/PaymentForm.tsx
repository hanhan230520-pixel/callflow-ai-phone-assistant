import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Customer } from '../types';
import { cn, localDateTimeValue } from '../lib/format';
import { Dialog } from './Overlay';
import { Field } from './Field';
import { useToast } from './Toast';

const METHODS = [
  { value: 'wechat', label: '微信支付' }, { value: 'alipay', label: '支付宝' },
  { value: 'cash', label: '现金' }, { value: 'card', label: '银行卡' },
  { value: 'credit', label: '挂账' }, { value: 'comp', label: '招待' }, { value: 'other', label: '其他' }
];

export function PaymentForm({
  open, onClose, customer, onSaved
}: {
  open: boolean; onClose: () => void; customer: Customer | null; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('wechat');
  const [paidAt, setPaidAt] = useState(localDateTimeValue());
  const [note, setNote] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(''); setMethod('wechat'); setPaidAt(localDateTimeValue()); setNote(''); setReceiptRef(''); setError('');
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!customer) return;
    setError(''); setSaving(true);
    try {
      await api.addPayment(customer.id, {
        amount: Number(amount), method, note, receiptRef,
        paidAt: paidAt.replace('T', ' ')
      });
      showToast('消费记录已保存');
      onSaved(); onClose();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title="记录消费" description={customer ? `为 ${customer.name} 记录一笔消费，累计消费将自动更新。` : ''}
      footer={<><button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button button--primary" type="submit" form="payment-form" disabled={saving}>{saving && <LoaderCircle size={16} className="spin" />}{saving ? '保存中…' : '保存消费'}</button></>}>
      <form id="payment-form" className="form-grid form-grid--2" onSubmit={submit}>
        {error && <div className="inline-alert inline-alert--error field--full">{error}</div>}
        <Field label="金额" htmlFor="payAmount" required><input id="payAmount" type="number" min="0.01" step="0.01" className={cn('input')} value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus /></Field>
        <Field label="支付方式" htmlFor="payMethod"><select id="payMethod" className="input select" value={method} onChange={(event) => setMethod(event.target.value)}>{METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
        <Field label="消费时间" htmlFor="payAt"><input id="payAt" type="datetime-local" className="input" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></Field>
        <Field label="凭证号" htmlFor="payRef"><input id="payRef" className="input" value={receiptRef} onChange={(event) => setReceiptRef(event.target.value)} placeholder="可选" /></Field>
        <Field label="备注" htmlFor="payNote" className="field--full"><input id="payNote" className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="如：晚餐消费、包间最低消费" /></Field>
      </form>
    </Dialog>
  );
}
