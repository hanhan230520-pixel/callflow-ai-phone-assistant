import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Database, HardDrive, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../api';
import type { Diagnostics } from '../types';
import { formatDateTime } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, PageLoader } from '../components/States';

const COUNT_LABELS: Record<string, string> = {
  users: '账号', customers: '客户', appointments: '预约', calls: '通话', call_segments: '转写片段',
  walk_ins: '散客', payments: '消费记录', notifications: '通知', audit_logs: '审计日志'
};

export function DiagnosticsPage() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await api.diagnostics()); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : '诊断信息加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="系统" title="系统诊断" description="运行时、数据库完整性、集成适配器与安全提醒。"
        actions={<button className="button button--secondary" onClick={load}><RefreshCw size={15} />重新检测</button>} />
      {loading && <PageLoader rows={5} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && data && (
        <>
          <section className="metric-grid">
            <article className="metric-card"><div className="metric-card__icon metric-card__icon--indigo"><Server size={18} /></div><div><span>应用</span><strong>{data.app.version}</strong></div><p>{data.app.name} · Node {data.app.node}</p></article>
            <article className="metric-card"><div className="metric-card__icon metric-card__icon--green"><Database size={18} /></div><div><span>数据库</span><strong>{data.database.integrity}</strong></div><p>{data.database.engine} · {data.database.backups} 份备份</p></article>
            <article className="metric-card"><div className="metric-card__icon metric-card__icon--blue"><Activity size={18} /></div><div><span>运行时长</span><strong>{Math.floor(data.app.uptimeSeconds / 60)} 分钟</strong></div><p>PID {data.runtime.pid}</p></article>
            <article className="metric-card"><div className="metric-card__icon metric-card__icon--amber"><HardDrive size={18} /></div><div><span>内存占用</span><strong>{data.runtime.memoryMb} MB</strong></div><p>检测于 {formatDateTime(data.checkedAt, 'HH:mm:ss')}</p></article>
          </section>

          {data.warnings.length > 0 && (
            <section className="panel">
              <header className="panel__header"><div><h2>提醒</h2><p>演示环境的限制与未启用能力</p></div><AlertTriangle size={18} /></header>
              <ul className="warning-list">{data.warnings.map((warning) => <li key={warning}><AlertTriangle size={15} /><span>{warning}</span></li>)}</ul>
            </section>
          )}

          <div className="split-grid">
            <section className="panel">
              <header className="panel__header"><div><h2>数据量</h2><p>本地 SQLite 表记录统计</p></div></header>
              <div className="count-grid">{Object.entries(data.database.counts).map(([key, count]) => (
                <div className="count-cell" key={key}><span>{COUNT_LABELS[key] || key}</span><strong>{count}</strong></div>
              ))}</div>
            </section>
            <section className="panel">
              <header className="panel__header"><div><h2>集成状态</h2><p>真实能力 / 模拟能力 / 待配置</p></div></header>
              <div className="integration-list">
                <div><ShieldCheck size={16} /><span>AI</span><strong>{data.integrations.ai.llm.status}</strong></div>
                <div><Server size={16} /><span>电话</span><strong>{data.integrations.telephony.realReady ? '真实适配器已就绪' : data.integrations.telephony.realIntegration.status}{data.integrations.telephony.mode === 'mock' ? ' · 模拟模式' : ''}</strong></div>
                <div><Database size={16} /><span>飞书</span><strong>{data.integrations.feishu.status}</strong></div>
              </div>
              <div className="inline-alert inline-alert--info">诊断不会发起外部网络请求，也不会暴露密钥明文。</div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
