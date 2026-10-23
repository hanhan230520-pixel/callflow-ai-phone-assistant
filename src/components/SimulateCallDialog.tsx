import { useEffect, useState, type FormEvent } from 'react';
import { Bot, CalendarPlus, CheckCircle2, FileText, LoaderCircle, PhoneCall, PhoneIncoming, Sparkles, Waves } from 'lucide-react';
import { api, ApiError } from '../api';
import type { CallLog, CallScenario, Customer } from '../types';
import { maskPhone } from '../lib/format';
import { Drawer, DrawerHeader } from './Overlay';
import { Avatar } from './Avatar';
import { TierBadge } from './Badges';
import { Field } from './Field';
import { useToast } from './Toast';

const SCENARIOS: Array<{ value: CallScenario; label: string }> = [
  { value: 'reservation', label: '普通订位' }, { value: 'business', label: '商务宴请' },
  { value: 'birthday', label: '生日聚餐' }, { value: 'complaint', label: '投诉处理' },
  { value: 'inquiry', label: '信息咨询' }, { value: 'vip', label: 'VIP 接待' },
  { value: 'cancel', label: '取消预约' }
];

export function SimulateCallDialog({
  open, onClose, onConvert, onUpdated
}: {
  open: boolean; onClose: () => void;
  onConvert: (call: CallLog) => void; onUpdated: () => void;
}) {
  const { showToast } = useToast();
  const [phone, setPhone] = useState('13800000005');
  const [contactName, setContactName] = useState('');
  const [scenario, setScenario] = useState<CallScenario>('reservation');
  const [call, setCall] = useState<CallLog | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [script, setScript] = useState<{ lines?: string[]; tips?: string[] } | null>(null);
  const [analysis, setAnalysis] = useState<{ summary: string; tags: string[]; extracted: Record<string, unknown>; sentiment: string; profile?: { tags: string[]; suggestions: string[] } } | null>(null);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCall(null); setCustomer(null); setScript(null); setAnalysis(null); setError(''); setWorking('');
    setPhone('13800000005'); setContactName(''); setScenario('reservation');
  }, [open]);

  async function start(event: FormEvent) {
    event.preventDefault();
    setError(''); setWorking('start');
    try {
      const result = await api.simulateIncoming({ phone, contactName: contactName || undefined, scenario });
      setCall(result.item); setCustomer(result.customer); setScript(result.script || null);
      showToast('模拟来电已接入'); onUpdated();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '模拟来电失败');
    } finally { setWorking(''); }
  }

  async function step(name: string, action: () => Promise<{ item: CallLog } | { call: CallLog }>, message: string) {
    setWorking(name);
    try {
      const result = await action();
      const updated = 'call' in result ? result.call : result.item;
      setCall(updated); showToast(message); onUpdated();
    } catch (requestError) {
      showToast(requestError instanceof ApiError ? requestError.message : '操作失败', 'error');
    } finally { setWorking(''); }
  }

  async function analyze() {
    if (!call) return;
    setWorking('analyze');
    try {
      const result = await api.analyzeCall(call.id);
      setCall(result.call); setAnalysis(result.analysis); showToast('AI 模拟分析完成'); onUpdated();
    } catch (requestError) {
      showToast(requestError instanceof ApiError ? requestError.message : '分析失败', 'error');
    } finally { setWorking(''); }
  }

  return (
    <Drawer open={open} onClose={onClose} label="模拟来电">
      <DrawerHeader title="模拟来电演示" subtitle="无需实体电话，完整演示来电识别 → 接听 → 转写 → AI 分析 → 建预约" onClose={onClose} />
      <div className="drawer__body">
        <div className="simulation-notice"><Waves size={17} /><div><strong>模拟链路</strong><span>以下电话、转写与 AI 结果均由本地模拟器生成并明确标记，不代表真实电话或模型服务。</span></div></div>

        {!call ? (
          <form className="form-grid form-grid--2" onSubmit={start}>
            {error && <div className="inline-alert inline-alert--error field--full">{error}</div>}
            <Field label="来电号码" htmlFor="simPhone" required hint="可用演示号码：13800000001–13800000012">
              <input id="simPhone" className="input" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoFocus />
            </Field>
            <Field label="联系人（可选）" htmlFor="simName" hint="留空时按号码自动识别客户">
              <input id="simName" className="input" value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="自动识别" />
            </Field>
            <Field label="模拟通话场景" htmlFor="simScenario" className="field--full">
              <select id="simScenario" className="input select" value={scenario} onChange={(event) => setScenario(event.target.value as CallScenario)}>
                {SCENARIOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <div className="field--full">
              <button className="button button--primary" type="submit" disabled={working === 'start'}>
                {working === 'start' ? <LoaderCircle size={16} className="spin" /> : <PhoneIncoming size={16} />}
                {working === 'start' ? '接入中…' : '发起模拟来电'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="incoming-card">
              <span className="incoming-card__icon"><PhoneIncoming size={22} /></span>
              <div><strong>{call.contactName}</strong><span>{maskPhone(call.phone)} · 模拟来电</span></div>
              {customer ? <TierBadge tier={customer.tier} /> : <span className="soft-tag">新客户</span>}
            </div>

            {customer ? (
              <div className="customer-inline-card">
                <Avatar name={customer.name} />
                <div><strong>{customer.name}</strong><span>{customer.preferences || '暂无偏好'}{customer.allergies ? ` · 过敏：${customer.allergies}` : ''}</span></div>
                <span className="muted-text">{customer.visitCount} 次到店</span>
              </div>
            ) : <div className="inline-alert inline-alert--info">号码未匹配客户档案，转为预约时会自动创建新客户。</div>}

            {script?.lines && script.lines.length > 0 && (
              <div className="script-card">
                <div className="script-card__head"><Sparkles size={15} />推荐话术 <span className="simulated-label">模拟</span></div>
                <ul>{script.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
                {script.tips?.map((tip, index) => <p key={index}>提示：{tip}</p>)}
              </div>
            )}

            <div className="simulation-steps">
              <div className={`simulation-step ${['answered', 'completed'].includes(call.status) ? 'is-done' : 'is-active'}`}><span>1</span><div><strong>来电识别</strong><small>{customer ? '已匹配客户档案' : '新号码'}</small></div></div>
              <div className={`simulation-step ${['answered', 'completed'].includes(call.status) ? 'is-done' : ''}`}><span>2</span><div><strong>接通</strong><small>{call.status === 'ringing' ? '等待接听' : '已接听'}</small></div></div>
              <div className={`simulation-step ${call.transcript ? 'is-done' : ''}`}><span>3</span><div><strong>模拟转写</strong><small>{call.transcript ? '已生成' : '待生成'}</small></div></div>
              <div className={`simulation-step ${call.aiSummary ? 'is-done' : ''}`}><span>4</span><div><strong>AI 分析</strong><small>{call.aiSummary ? '已提取' : '待分析'}</small></div></div>
            </div>

            <div className="simulation-actions">
              {call.status === 'ringing' && <button className="button button--primary" onClick={() => step('answer', () => api.answerCall(call.id), '已接听模拟来电')} disabled={Boolean(working)}>{working === 'answer' ? <LoaderCircle size={16} className="spin" /> : <PhoneCall size={16} />}接听</button>}
              <button className="button button--secondary" onClick={() => step('transcribe', () => api.transcribeCall(call.id, scenario), '模拟转写已生成')} disabled={Boolean(working)}>{working === 'transcribe' ? <LoaderCircle size={16} className="spin" /> : <FileText size={16} />}{call.transcript ? '重新转写' : '生成模拟转写'}</button>
              <button className="button button--secondary" onClick={analyze} disabled={Boolean(working)}>{working === 'analyze' ? <LoaderCircle size={16} className="spin" /> : <Bot size={16} />}AI 分析</button>
              <button className="button button--primary" onClick={() => onConvert(call)}><CalendarPlus size={16} />转为预约</button>
            </div>

            {call.transcript && (
              <div className="transcript-box">
                <div className="transcript-box__head"><FileText size={14} />模拟转写文本 <span className="simulated-label">mock-stt</span></div>
                <pre>{call.transcript}</pre>
              </div>
            )}

            {analysis && (
              <div className="ai-summary-card">
                <div className="script-card__head"><CheckCircle2 size={15} />AI 模拟分析结果 <span className="simulated-label">mock-local</span></div>
                <p>{analysis.summary}</p>
                <div className="tag-list">{analysis.tags.map((tag) => <span className="soft-tag" key={tag}>{tag}</span>)}</div>
                <div className="extracted-grid">
                  <div><span>日期</span><strong>{String(analysis.extracted.date || '未提取')}</strong></div>
                  <div><span>时间</span><strong>{String(analysis.extracted.time || '未提取')}</strong></div>
                  <div><span>人数</span><strong>{analysis.extracted.partySize ? `${analysis.extracted.partySize} 人` : '未提取'}</strong></div>
                  <div><span>场景</span><strong>{String(analysis.extracted.occasion || '未提取')}</strong></div>
                </div>
                {analysis.profile?.suggestions?.length ? (
                  <div className="ai-profile">
                    <span>客户画像建议 · 模拟生成</span>
                    <ul>{analysis.profile.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
