import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, Coins, Download, FileSpreadsheet, PhoneCall, Users } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { ReportPayload } from '../types';
import { STATUS_META, SOURCE_META, TIER_META, cn, formatDate, maskPhone, todayString } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, PageLoader } from '../components/States';
import { useToast } from '../components/Toast';

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function currency(value: number) {
  return '¥' + Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export function ReportsPage() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayString());
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState<'appointments' | 'revenue' | 'calls'>('appointments');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await api.reports(from, to)); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : '报表加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [from, to]);

  const maxTrend = useMemo(() => Math.max(1, ...(data?.trend || []).map((item) => item[metric])), [data, metric]);
  const totalStatus = (data?.distributions.status || []).reduce((sum, item) => sum + item.count, 0);

  function exportFile(type: 'csv' | 'json', scope?: string) {
    const link = document.createElement('a');
    link.href = api.exportUrl(type, scope);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('导出已开始下载');
  }

  function quickRange(days: number) {
    setFrom(daysAgo(days - 1)); setTo(todayString());
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="数据洞察" title="运营报表" description="按时间范围分析预约、营收、来电与客户结构，并导出真实数据。"
        actions={can('data:export') ? (
          <div className="button-cluster">
            <button className="button button--ghost" onClick={() => exportFile('csv', 'appointments')}><FileSpreadsheet size={15} />预约 CSV</button>
            <button className="button button--ghost" onClick={() => exportFile('csv', 'customers')}><FileSpreadsheet size={15} />客户 CSV</button>
            <button className="button button--secondary" onClick={() => exportFile('json')}><Download size={15} />完整 JSON</button>
          </div>
        ) : undefined} />

      <section className="filter-bar filter-bar--wrap">
        <div className="filter-search filter-search--date"><CalendarRange size={16} /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="开始日期" /></div>
        <span className="filter-label">至</span>
        <div className="filter-search filter-search--date"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="结束日期" /></div>
        <div className="filter-divider" />
        {[7, 30, 90].map((days) => <button key={days} type="button" className={cn('quick-status__item', from === daysAgo(days - 1) && to === todayString() && 'is-active')} onClick={() => quickRange(days)}>近 {days} 天</button>)}
        <div className="filter-spacer" />
        <span className="filter-stat">趋势最多展示 90 天</span>
      </section>

      {loading && <PageLoader rows={6} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && data && (
        <>
          <section className="metric-grid">
            <article className="metric-card"><div className="metric-card__icon metric-card__icon--indigo"><BarChart3 size={18} /></div><div><span>预约总数</span><strong>{data.appointments.total}</strong></div><p>完成 {data.appointments.completed} · 取消 {data.appointments.cancelled}</p></article>
            <article className="metric-card"><div className="metric-card__icon metric-card__icon--green"><Users size={18} /></div><div><span>到店人数</span><strong>{data.appointments.guests}</strong></div><p>平均每单 {data.appointments.averageParty} 人</p></article>
            <article className="metric-card"><div className="metric-card__icon metric-card__icon--amber"><Coins size={18} /></div><div><span>营收</span><strong>{currency(data.revenue.total)}</strong></div><p>{data.revenue.payments} 笔付款 · 均单 {currency(data.revenue.average)}</p></article>
            <article className="metric-card"><div className="metric-card__icon metric-card__icon--blue"><PhoneCall size={18} /></div><div><span>来电</span><strong>{data.calls.total}</strong></div><p>已转化 {data.calls.converted} · 模拟 {data.calls.simulated}</p></article>
          </section>

          <div className="split-grid split-grid--wide">
            <section className="panel">
              <header className="panel__header">
                <div><h2>趋势</h2><p>{formatDate(data.range.from, 'M月d日')} — {formatDate(data.range.to, 'M月d日')}</p></div>
                <div className="segmented">
                  <button type="button" className={metric === 'appointments' ? 'is-active' : ''} onClick={() => setMetric('appointments')}>预约</button>
                  <button type="button" className={metric === 'revenue' ? 'is-active' : ''} onClick={() => setMetric('revenue')}>营收</button>
                  <button type="button" className={metric === 'calls' ? 'is-active' : ''} onClick={() => setMetric('calls')}>来电</button>
                </div>
              </header>
              <div className="bar-chart" role="img" aria-label="趋势柱状图">
                {data.trend.map((item) => (
                  <div className="bar-chart__col" key={item.date} title={`${item.date} · 预约 ${item.appointments} · 营收 ${currency(item.revenue)} · 来电 ${item.calls}`}>
                    <span className="bar-chart__value">{item[metric] || ''}</span>
                    <span className="bar-chart__bar" style={{ height: Math.max(2, (item[metric] / maxTrend) * 100) + '%' }} />
                    <span className="bar-chart__label">{formatDate(item.date, 'd')}</span>
                  </div>
                ))}
                {data.trend.length === 0 && <p className="muted-block">所选范围暂无趋势数据。</p>}
              </div>
            </section>

            <section className="panel">
              <header className="panel__header"><div><h2>预约状态</h2><p>共 {data.appointments.total} 条预约</p></div><span className="panel__meta">完成率 {data.appointments.completionRate}%</span></header>
              <div className="distribution-list">
                {data.distributions.status.map((item) => (
                  <div className="distribution-row" key={item.key}>
                    <span>{STATUS_META[item.key as keyof typeof STATUS_META]?.label || item.key}</span>
                    <div className="distribution-bar"><i style={{ width: (totalStatus ? (item.count / totalStatus) * 100 : 0) + '%' }} /></div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
                {data.distributions.status.length === 0 && <p className="muted-block">暂无数据。</p>}
              </div>
              <div className="stat-pairs">
                <div><span>未到店率</span><strong>{data.appointments.noShowRate}%</strong></div>
                <div><span>散客登记</span><strong>{data.walkIns}</strong></div>
                <div><span>新增客户</span><strong>{data.customers.newCustomers}</strong></div>
                <div><span>客户总数</span><strong>{data.customers.total}</strong></div>
              </div>
            </section>
          </div>

          <div className="split-grid">
            <section className="panel">
              <header className="panel__header"><div><h2>预约来源</h2><p>渠道结构</p></div></header>
              <div className="chip-stat-list">
                {data.distributions.source.map((item) => (
                  <div className="chip-stat" key={item.key}><span>{SOURCE_META[item.key as keyof typeof SOURCE_META] || item.key}</span><strong>{item.count}</strong></div>
                ))}
                {data.distributions.source.length === 0 && <p className="muted-block">暂无数据。</p>}
              </div>
              <div className="panel-divider" />
              <header className="panel__header"><div><h2>客户等级</h2><p>全部客户结构</p></div></header>
              <div className="chip-stat-list">
                {data.distributions.tier.map((item) => (
                  <div className="chip-stat" key={item.key}><span>{TIER_META[item.key as keyof typeof TIER_META]?.label || item.key}</span><strong>{item.count}</strong></div>
                ))}
              </div>
            </section>

            <section className="panel table-panel">
              <header className="panel__header"><div><h2>高价值客户</h2><p>按累计消费排序</p></div><span className="panel__meta">Top {Math.min(10, data.topCustomers.length)}</span></header>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>客户</th><th>等级</th><th>到店</th><th>累计消费</th></tr></thead>
                  <tbody>
                    {data.topCustomers.map((customer) => (
                      <tr key={customer.id} className="data-table__row data-table__row--static">
                        <td><div className="customer-inline"><strong>{customer.name}</strong><span>{maskPhone(customer.phone)}</span></div></td>
                        <td><span className={'tier-badge tier-' + TIER_META[customer.tier].tone}>{TIER_META[customer.tier].label}</span></td>
                        <td>{customer.visitCount}</td>
                        <td><strong>{currency(customer.totalSpent)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.topCustomers.length === 0 && <p className="muted-block">暂无客户数据。</p>}
            </section>
          </div>

          <section className="panel">
            <header className="panel__header"><div><h2>来电关键词</h2><p>来自通话关键词标签的频次统计</p></div></header>
            <div className="keyword-cloud">
              {data.distributions.keywords.map((keyword) => (
                <span className="keyword-pill" key={keyword.label}>{keyword.label}<strong>{keyword.count}</strong></span>
              ))}
              {data.distributions.keywords.length === 0 && <p className="muted-block">暂无关键词数据。</p>}
            </div>
          </section>

          <div className="inline-alert inline-alert--info">
            报表数据来自本地演示数据库；模拟通话与模拟 AI 结果会计入统计并在通话中心明确标记。
          </div>
        </>
      )}
    </div>
  );
}
