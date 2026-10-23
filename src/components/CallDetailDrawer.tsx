import { useEffect, useState } from 'react';
import {
  Bot, CalendarPlus, CheckCircle2, FileText, Link2, LoaderCircle, Mic, PhoneCall,
  PhoneIncoming, PhoneOutgoing, Sparkles, UserRound
} from 'lucide-react';
import { api, ApiError } from '../api';
import type { CallDetail, CallLog, CallStatus } from '../types';
import { formatDateTime, formatDuration, maskPhone } from '../lib/format';
import { Drawer, DrawerHeader } from './Overlay';
import { Avatar } from './Avatar';
import { TierBadge } from './Badges';
import { ErrorState, PageLoader } from './States';
import { useToast } from './Toast';

const STATUS_LABEL: Record<CallStatus, string> = {
  ringing: '响铃中', answered: '通话中', completed: '已完成', missed: '未接', follow_up: '待跟进'
};

export function CallDetailDrawer({
  open, callId, onClose, onChanged, onConvert
}: {
  open: boolean; callId: string | null; onClose: () => void;
  onChanged: () => void; onConvert: (call: CallLog) => void;
}) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');

  const load = async () => {
    if (!callId) return;
    setLoading(true); setError('');
    try { setDetail(await api.call(callId)); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : '通话详情加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (open && callId) void load();
    else setDetail(null);
  }, [open, callId]);

  async function act(name: string, action: () => Promise<unknown>, message: string) {
    setWorking(name);
    try { await action(); showToast(message); await load(); onChanged(); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '操作失败', 'error'); }
    finally { setWorking(''); }
  }

  const call = detail?.item;
  const extracted = (call?.aiExtracted || {}) as Record<string, unknown>;
  const hasAnalysis = Boolean(call?.aiSummary);

  return (
    <Drawer open={open} onClose={onClose} label="通话详情">
      <DrawerHeader title="通话详情" subtitle={call ? `${formatDateTime(call.calledAt, 'M月d日 HH:mm')} · ${formatDuration(call.durationSeconds)}` : '查看转写、AI 分析与预约转化'} onClose={onClose} />
      <div className="drawer__body drawer__body--flush">
        {loading && <PageLoader rows={5} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && call && detail && (
          <>
            <section className="call-detail-hero">
              <div className="call-detail-hero__top">
                <span className={call.direction === 'inbound' ? 'call-direction is-inbound' : 'call-direction is-outbound'}>
                  {call.direction === 'inbound' ? <PhoneIncoming size={17} /> : <PhoneOutgoing size={17} />}
                </span>
                <Avatar name={call.contactName} size="lg" />
                <div className="call-detail-hero__identity">
                  <h3>{call.contactName}</h3>
                  <p>{maskPhone(call.phone)} · {call.direction === 'inbound' ? '来电' : '去电'}</p>
                </div>
                <span className={`call-status call-status--${call.status}`}>{STATUS_LABEL[call.status]}</span>
              </div>
              <div className="call-detail-badges">
                {call.isSimulated && <span className="demo-badge">模拟来电</span>}
                {call.customerTier && detail.customer && <TierBadge tier={detail.customer.tier} />}
                {call.scenario && <span className="soft-tag">场景 · {call.scenario}</span>}
                {call.sentiment && <span className="soft-tag">情绪 · {call.sentiment}</span>}
              </div>
              <div className="detail-actions">
                {call.status === 'ringing' && <button className="button button--primary button--sm" onClick={() => act('answer', () => api.answerCall(call.id), '已接听模拟来电')} disabled={Boolean(working)}>{working === 'answer' ? <LoaderCircle size={15} className="spin" /> : <PhoneCall size={15} />}接听</button>}
                {call.status === 'answered' && <button className="button button--secondary button--sm" onClick={() => act('hangup', () => api.hangupCall(call.id), '通话已结束')} disabled={Boolean(working)}>结束通话</button>}
                <button className="button button--secondary button--sm" onClick={() => act('transcribe', () => api.transcribeCall(call.id, call.scenario), '已生成模拟转写')} disabled={Boolean(working)}>
                  {working === 'transcribe' ? <LoaderCircle size={15} className="spin" /> : <FileText size={15} />}{call.transcript ? '重新转写' : '生成模拟转写'}
                </button>
                <button className="button button--primary button--sm" onClick={() => act('analyze', () => api.analyzeCall(call.id), 'AI 模拟分析完成')} disabled={Boolean(working)}>
                  {working === 'analyze' ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}AI 分析
                </button>
                {!call.appointmentId && <button className="button button--secondary button--sm" onClick={() => onConvert(call)}><CalendarPlus size={15} />转为预约</button>}
              </div>
            </section>

            {hasAnalysis && (
              <section className="detail-section">
                <h4><Bot size={15} /> AI 摘要与标签 <span className="simulated-label">模拟结果</span></h4>
                <div className="ai-summary-card">
                  <p>{call.aiSummary}</p>
                  <div className="tag-list">
                    {call.aiTags.map((tag) => <span className="soft-tag" key={tag}>{tag}</span>)}
                    {call.keywords.map((keyword, index) => <span className={`soft-tag ${keyword.level === 'high' ? 'soft-tag--danger' : ''}`} key={`${keyword.key}-${index}`}>{keyword.label || keyword.key}{keyword.level === 'high' ? ' · 高优先级' : ''}</span>)}
                  </div>
                </div>
                {Boolean(extracted.date || extracted.time || extracted.partySize) && (
                  <div className="extracted-grid">
                    <div><span>日期</span><strong>{String(extracted.date || '未提取')}</strong></div>
                    <div><span>时间</span><strong>{String(extracted.time || '未提取')}</strong></div>
                    <div><span>人数</span><strong>{extracted.partySize ? `${extracted.partySize} 人` : '未提取'}</strong></div>
                    <div><span>场景</span><strong>{String(extracted.occasion || '未提取')}</strong></div>
                  </div>
                )}
              </section>
            )}

            <section className="detail-section">
              <h4><Mic size={15} /> 通话转写 <span className="simulated-label">模拟 STT</span></h4>
              {detail.segments.length === 0 ? <div className="inline-empty">尚未生成转写，点击上方“生成模拟转写”。</div> : (
                <div className="transcript-list">
                  {detail.segments.map((segment) => (
                    <div className={`transcript-line transcript-line--${segment.speaker}`} key={segment.id}>
                      <span>{segment.speaker === 'agent' ? '坐席' : '客户'}</span>
                      <p>{segment.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {detail.customer && (
              <section className="detail-section">
                <h4><UserRound size={15} /> 客户画像</h4>
                <div className="customer-inline-card">
                  <Avatar name={detail.customer.name} />
                  <div><strong>{detail.customer.name}</strong><span>{detail.customer.preferences || '暂无偏好'} · 累计 {detail.customer.visitCount} 次到店</span></div>
                  <TierBadge tier={detail.customer.tier} />
                </div>
                {detail.customer.allergies && <div className="inline-alert inline-alert--warning">过敏提醒：{detail.customer.allergies}</div>}
              </section>
            )}

            <section className="detail-section">
              <h4><Link2 size={15} /> 关联预约</h4>
              {call.appointmentId && detail.appointment ? (
                <div className="linked-booking linked-booking--large">
                  <CheckCircle2 size={18} />
                  <div><strong>{detail.appointment.guestName} · {detail.appointment.date} {detail.appointment.time}</strong><span>{detail.appointment.partySize} 人 · {detail.appointment.comboName || detail.appointment.tableName || '待安排'}</span></div>
                </div>
              ) : <div className="inline-empty">尚未转为预约，可在上方点击“转为预约”。</div>}
            </section>

            {call.notes && <section className="detail-section"><h4>跟进备注</h4><div className="note-box"><FileText size={16} /><p>{call.notes}</p></div></section>}
            <section className="detail-section">
              <button className="button button--ghost button--sm" onClick={() => act('recording', () => api.simulateRecording(call.id), '已生成模拟录音占位')} disabled={Boolean(working)}>
                {working === 'recording' ? <LoaderCircle size={15} className="spin" /> : <Mic size={15} />}生成模拟录音占位
              </button>
              {call.recordingRef && <span className="simulated-label">{call.recordingRef} · 无真实音频</span>}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}
