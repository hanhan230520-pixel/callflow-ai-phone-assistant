import { useEffect, useState, type FormEvent } from 'react';
import { Bot, Building2, CheckCircle2, Cloud, Database, LoaderCircle, Phone, Save, ShieldCheck, Webhook } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import type { BackupItem, IntegrationStatus, Settings } from '../types';
import { cn, formatDate } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, PageLoader } from '../components/States';
import { Field } from '../components/Field';
import { useToast } from '../components/Toast';

type TabKey = 'business' | 'booking' | 'integrations' | 'data' | 'account';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Building2; permission?: string }> = [
  { key: 'business', label: '业务信息', icon: Building2 },
  { key: 'booking', label: '预约规则', icon: ShieldCheck },
  { key: 'integrations', label: 'AI · 电话 · 飞书', icon: Bot, permission: 'settings:write' },
  { key: 'data', label: '数据与备份', icon: Database, permission: 'data:backup' },
  { key: 'account', label: '账号安全', icon: ShieldCheck }
];

export function SettingsPage() {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>('business');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [meta, setMeta] = useState<{ conflictWindow: { min: number; max: number }; autoAnswerTimeout: { min: number; max: number } } | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await api.settings();
      setSettings(result.settings);
      setMeta({ conflictWindow: result.meta.conflictWindow, autoAnswerTimeout: result.meta.autoAnswerTimeout });
      api.integrations().then(setIntegrations).catch(() => undefined);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '设置加载失败');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  async function save(patch: Partial<Settings>) {
    setSaving(true);
    try {
      const result = await api.updateSettings(patch);
      setSettings(result.settings);
      showToast('设置已保存（' + result.updated.length + ' 项）');
      void api.integrations().then(setIntegrations).catch(() => undefined);
    } catch (requestError) {
      showToast(requestError instanceof ApiError ? requestError.message : '保存失败', 'error');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="page-stack"><PageHeader eyebrow="系统" title="系统设置" description="业务信息、预约规则、集成适配器与数据管理。" /><PageLoader rows={6} /></div>;
  if (error || !settings) return <div className="page-stack"><PageHeader eyebrow="系统" title="系统设置" description="业务信息、预约规则、集成适配器与数据管理。" /><ErrorState message={error || '设置不可用'} onRetry={load} /></div>;

  const visibleTabs = TABS.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="page-stack">
      <PageHeader eyebrow="系统" title="系统设置" description="业务信息、预约规则、外部适配器状态与本地数据管理。敏感字段仅显示掩码，不会回传明文。" />

      <div className="settings-layout">
        <nav className="settings-nav">
          {visibleTabs.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className={cn('settings-nav__item', tab === key && 'is-active')} onClick={() => setTab(key)}><Icon size={17} /><span>{label}</span></button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === 'business' && <BusinessTab settings={settings} saving={saving} onSave={save} />}
          {tab === 'booking' && <BookingTab settings={settings} meta={meta} saving={saving} onSave={save} />}
          {tab === 'integrations' && <IntegrationTab settings={settings} integrations={integrations} saving={saving} onSave={save} onRefresh={load} />}
          {tab === 'data' && <DataTab onChanged={load} />}
          {tab === 'account' && <AccountTab />}
        </div>
      </div>
    </div>
  );
}

function BusinessTab({ settings, saving, onSave }: { settings: Settings; saving: boolean; onSave: (patch: Partial<Settings>) => void }) {
  const [form, setForm] = useState({
    business_name: String(settings.business_name || ''), business_phone: String(settings.business_phone || ''),
    business_address: String(settings.business_address || ''), business_hours: String(settings.business_hours || ''),
    currency: String(settings.currency || 'CNY'), ui_density: String(settings.ui_density || 'comfortable')
  });
  function submit(event: FormEvent) { event.preventDefault(); onSave(form); }
  return (
    <form className="settings-card" onSubmit={submit}>
      <header className="settings-card__header"><div><h2>业务信息</h2><p>用于工作台展示、报表抬头与演示说明，不包含任何真实商户信息。</p></div><Building2 size={20} /></header>
      <div className="form-grid form-grid--2">
        <Field label="名称" htmlFor="businessName" required><input id="businessName" className="input" value={form.business_name} onChange={(event) => setForm({ ...form, business_name: event.target.value })} /></Field>
        <Field label="联系电话" htmlFor="businessPhone"><input id="businessPhone" className="input" value={form.business_phone} onChange={(event) => setForm({ ...form, business_phone: event.target.value })} /></Field>
        <Field label="地址" htmlFor="businessAddress"><input id="businessAddress" className="input" value={form.business_address} onChange={(event) => setForm({ ...form, business_address: event.target.value })} /></Field>
        <Field label="营业时间" htmlFor="businessHours"><input id="businessHours" className="input" value={form.business_hours} onChange={(event) => setForm({ ...form, business_hours: event.target.value })} placeholder="11:00-22:00" /></Field>
        <Field label="币种" htmlFor="currency"><select id="currency" className="input select" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option value="CNY">人民币 CNY</option><option value="USD">美元 USD</option><option value="HKD">港币 HKD</option></select></Field>
        <Field label="界面密度" htmlFor="density"><select id="density" className="input select" value={form.ui_density} onChange={(event) => setForm({ ...form, ui_density: event.target.value })}><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></Field>
        <div className="form-actions field--full"><button className="button button--primary" type="submit" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{saving ? '保存中…' : '保存业务信息'}</button></div>
      </div>
    </form>
  );
}

function BookingTab({ settings, meta, saving, onSave }: { settings: Settings; meta: { conflictWindow: { min: number; max: number }; autoAnswerTimeout: { min: number; max: number } } | null; saving: boolean; onSave: (patch: Partial<Settings>) => void }) {
  const [form, setForm] = useState({
    conflict_window_minutes: Number(settings.conflict_window_minutes || 90),
    enforce_time_slots: Boolean(settings.enforce_time_slots), auto_confirm: Boolean(settings.auto_confirm),
    auto_answer_enabled: Boolean(settings.auto_answer_enabled), auto_answer_timeout: Number(settings.auto_answer_timeout || 8)
  });
  function submit(event: FormEvent) { event.preventDefault(); onSave(form); }
  return (
    <form className="settings-card" onSubmit={submit}>
      <header className="settings-card__header"><div><h2>预约与接听规则</h2><p>规则由服务端强制执行，修改后立即影响新的预约与冲突检测。</p></div><ShieldCheck size={20} /></header>
      <div className="form-grid form-grid--2">
        <Field label="冲突检测窗口（分钟）" htmlFor="conflictWindow" required hint={meta ? '允许范围 ' + meta.conflictWindow.min + '–' + meta.conflictWindow.max + ' 分钟，默认 90' : '默认 90 分钟'}>
          <input id="conflictWindow" type="number" min={meta?.conflictWindow.min || 15} max={meta?.conflictWindow.max || 240} className="input" value={form.conflict_window_minutes} onChange={(event) => setForm({ ...form, conflict_window_minutes: Number(event.target.value) })} />
        </Field>
        <Field label="自动接听等待（秒）" htmlFor="autoAnswerTimeout" hint="仅影响模拟来电的自动接听提示，不影响真实设备"><input id="autoAnswerTimeout" type="number" min={0} max={60} className="input" value={form.auto_answer_timeout} onChange={(event) => setForm({ ...form, auto_answer_timeout: Number(event.target.value) })} /></Field>
        <label className="check-field field--full"><input type="checkbox" checked={form.enforce_time_slots} onChange={(event) => setForm({ ...form, enforce_time_slots: event.target.checked })} /><span><strong>强制营业时段</strong><small>开启后，预约时间必须落在“桌台布局 → 营业时段”中启用的时段内。时间段为空时不做限制。</small></span></label>
        <label className="check-field field--full"><input type="checkbox" checked={form.auto_confirm} onChange={(event) => setForm({ ...form, auto_confirm: event.target.checked })} /><span><strong>新预约自动确认</strong><small>电话或模拟 AI 创建预约时直接设为已确认；仍会执行容量与冲突检测。</small></span></label>
        <label className="check-field field--full"><input type="checkbox" checked={form.auto_answer_enabled} onChange={(event) => setForm({ ...form, auto_answer_enabled: event.target.checked })} /><span><strong>模拟自动接听</strong><small>仅用于演示流程，模拟来电仍需在来电中心手动接听；不会自动拨号或录音。</small></span></label>
        <div className="inline-alert inline-alert--info field--full">冲突检测窗口按日期、桌台/组合包间和预约状态计算；覆盖冲突需要 appointments:override 权限并写入审计日志。</div>
        <div className="form-actions field--full"><button className="button button--primary" type="submit" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{saving ? '保存中…' : '保存规则'}</button></div>
      </div>
    </form>
  );
}

function IntegrationTab({
  settings, integrations, saving, onSave, onRefresh
}: {
  settings: Settings; integrations: IntegrationStatus | null; saving: boolean;
  onSave: (patch: Partial<Settings>) => void; onRefresh: () => void;
}) {
  const { showToast } = useToast();
  const [ai, setAi] = useState({ ai_mode: String(settings.ai_mode || 'mock'), ai_model: String(settings.ai_model || 'mock-local'), ai_base_url: '', transcription_enabled: Boolean(settings.transcription_enabled), recording_enabled: Boolean(settings.recording_enabled), disclaimer_ack: Boolean(settings.disclaimer_ack) });
  const [telephony, setTelephony] = useState({ telephony_mode: String(settings.telephony_mode || 'mock') });
  const [feishu, setFeishu] = useState({ feishu_app_id: '', feishu_app_secret: '', feishu_app_token: '', feishu_table_reservations: String(settings.feishu_table_reservations || ''), feishu_table_customers: String(settings.feishu_table_customers || ''), feishu_table_walkins: String(settings.feishu_table_walkins || ''), feishu_table_seat_config: String(settings.feishu_table_seat_config || ''), feishu_table_layouts: String(settings.feishu_table_layouts || '') });
  const [webhook, setWebhook] = useState({ webhook_url: String(settings.webhook_url || '') });
  const [testing, setTesting] = useState('');

  async function test(kind: 'ai' | 'telephony' | 'feishu' | 'webhook') {
    setTesting(kind);
    try {
      if (kind === 'ai') { const result = await api.testAi(); showToast(String(result.message || '模拟 AI 适配器正常')); }
      else if (kind === 'telephony') { const result = await api.testTelephony(); showToast(String(result.message || '模拟电话适配器正常')); }
      else if (kind === 'feishu') { const result = await api.testFeishu(); showToast(result.message); }
      else { const result = await api.testWebhook(webhook.webhook_url || undefined); showToast(result.note); }
      onRefresh();
    } catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '测试失败', 'error'); }
    finally { setTesting(''); }
  }

  async function sync() {
    setTesting('sync');
    try { const result = await api.syncFeishu('both'); showToast(result.simulated ? '模拟飞书同步已完成；未访问真实飞书' : '同步已完成'); onRefresh(); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '同步失败', 'error'); }
    finally { setTesting(''); }
  }

  function saveAi(event: FormEvent) {
    event.preventDefault();
    const patch: Partial<Settings> = { ...ai };
    if (!ai.ai_base_url) delete patch.ai_base_url;
    onSave(patch);
  }
  function saveFeishu(event: FormEvent) {
    event.preventDefault();
    const patch: Partial<Settings> = { ...feishu, ...webhook };
    // 敏感字段留空表示“不修改”；非敏感字段（表 ID、Webhook）留空应允许清空。
    const sensitive = ['feishu_app_id', 'feishu_app_secret', 'feishu_app_token'];
    sensitive.forEach((key) => { if (patch[key] === '') delete patch[key]; });
    onSave(patch);
  }

  const aiStatus = integrations?.ai;
  const telephonyStatus = integrations?.telephony;
  const feishuStatus = integrations?.feishu;

  return (
    <div className="settings-stack">
      <form className="settings-card" onSubmit={saveAi}>
        <header className="settings-card__header"><div><h2>AI 与语音转写</h2><p>默认模拟模式，不会发起外部模型请求；真实接入需要配置供应商并完成合规评估。</p></div><Bot size={20} /></header>
        <div className="integration-status"><span className={cn('status-badge', aiStatus?.llm.realReady ? 'tone-green' : 'tone-amber')}>{aiStatus?.llm.realReady ? '真实适配器已配置' : '模拟适配器'}</span><span>STT：{aiStatus?.stt.status || '模拟'} · LLM：{aiStatus?.llm.status || '模拟'}</span></div>
        <div className="form-grid form-grid--2">
          <Field label="AI 模式" htmlFor="aiMode"><select id="aiMode" className="input select" value={ai.ai_mode} onChange={(event) => setAi({ ...ai, ai_mode: event.target.value })}><option value="mock">模拟 AI（默认）</option><option value="openai-compatible">OpenAI 兼容接口</option><option value="disabled">停用 AI</option></select></Field>
          <Field label="模型名称" htmlFor="aiModel" hint="真实模型接入前仅作为配置保存"><input id="aiModel" className="input" value={ai.ai_model} onChange={(event) => setAi({ ...ai, ai_model: event.target.value })} /></Field>
          <Field label="API 基础地址" htmlFor="aiBaseUrl" className="field--full" hint={settings.ai_base_url_set ? '已配置：' + String(settings.ai_base_url || '') + '；留空表示不修改' : '留空表示不配置；敏感地址以掩码显示，不会回传明文'}>
            <input id="aiBaseUrl" className="input" value={ai.ai_base_url} onChange={(event) => setAi({ ...ai, ai_base_url: event.target.value })} placeholder="https://…（可选）" autoComplete="off" />
          </Field>
          <label className="check-field"><input type="checkbox" checked={ai.transcription_enabled} onChange={(event) => setAi({ ...ai, transcription_enabled: event.target.checked })} /><span><strong>启用转写</strong><small>模拟通话可生成标记为模拟的转写</small></span></label>
          <label className="check-field"><input type="checkbox" checked={ai.recording_enabled} onChange={(event) => setAi({ ...ai, recording_enabled: event.target.checked })} /><span><strong>录音开关</strong><small>真实录音尚未实现，仅保存设置</small></span></label>
          <label className="check-field field--full"><input type="checkbox" checked={ai.disclaimer_ack} onChange={(event) => setAi({ ...ai, disclaimer_ack: event.target.checked })} /><span><strong>已阅读模拟与合规说明</strong><small>确认模拟数据、模拟 AI 结果会在界面明确标记。</small></span></label>
          <div className="form-actions field--full">
            <button className="button button--primary" type="submit" disabled={saving}><Save size={16} />保存 AI 设置</button>
            <button className="button button--secondary" type="button" onClick={() => test('ai')} disabled={testing === 'ai'}>{testing === 'ai' ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}测试模拟适配器</button>
          </div>
        </div>
      </form>

      <form className="settings-card" onSubmit={(event) => { event.preventDefault(); onSave(telephony); }}>
        <header className="settings-card__header"><div><h2>电话设备</h2><p>当前无实体设备；模拟模式支持完整来电演示链路。</p></div><Phone size={20} /></header>
        <div className="integration-status"><span className={cn('status-badge', telephonyStatus?.connected ? 'tone-green' : 'tone-amber')}>{telephonyStatus?.connected ? '设备已连接' : '未连接实体设备'}</span><span>{telephonyStatus?.device || telephonyStatus?.simulation?.note || '模拟电话适配器可用'}</span></div>
        <div className="form-grid form-grid--2">
          <Field label="电话模式" htmlFor="telephonyMode" hint={telephonyStatus?.realIntegration?.note}><select id="telephonyMode" className="input select" value={telephony.telephony_mode} onChange={(event) => setTelephony({ ...telephony, telephony_mode: event.target.value })}><option value="mock">模拟电话（默认）</option><option value="adb">ADB 设备桥接（未接入）</option><option value="cti">CTI 网关（未接入）</option></select></Field>
          <div className="form-actions"><button className="button button--primary" type="submit" disabled={saving}><Save size={16} />保存</button><button className="button button--secondary" type="button" onClick={() => test('telephony')} disabled={testing === 'telephony'}>{testing === 'telephony' ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}检测适配器</button></div>
        </div>
      </form>

      <form className="settings-card" onSubmit={saveFeishu}>
        <header className="settings-card__header"><div><h2>飞书同步适配器</h2><p>当前为模拟同步，不访问真实飞书接口；配置字段仅用于演示敏感信息掩码与状态检查。</p></div><Cloud size={20} /></header>
        <div className="integration-status"><span className={cn('status-badge', feishuStatus?.configured ? 'tone-green' : 'tone-muted')}>{feishuStatus?.configured ? '已配置' : '未配置'}</span><span>{feishuStatus?.note || '模拟适配器可用'} · {feishuStatus?.status || 'simulated'}</span><button type="button" className="button button--ghost button--xs" onClick={() => test('feishu')} disabled={testing === 'feishu'}>测试连接</button><button type="button" className="button button--secondary button--xs" onClick={sync} disabled={testing === 'sync'}>{testing === 'sync' ? '同步中…' : '模拟双向同步'}</button></div>
        <div className="form-grid form-grid--2">
          <Field label="App ID" htmlFor="feishuAppId" hint={settings.feishu_app_id_set ? '已配置（掩码）' : '未配置'}><input id="feishuAppId" className="input" value={feishu.feishu_app_id} onChange={(event) => setFeishu({ ...feishu, feishu_app_id: event.target.value })} placeholder={settings.feishu_app_id_set ? '留空表示不修改' : 'cli_xxx'} autoComplete="off" /></Field>
          <Field label="App Secret" htmlFor="feishuSecret" hint={settings.feishu_app_secret_set ? '已配置（掩码，不会回显）' : '未配置'}><input id="feishuSecret" type="password" className="input" value={feishu.feishu_app_secret} onChange={(event) => setFeishu({ ...feishu, feishu_app_secret: event.target.value })} placeholder={settings.feishu_app_secret_set ? '留空表示不修改' : '仅本地演示配置'} autoComplete="new-password" /></Field>
          <Field label="App Token" htmlFor="feishuToken" className="field--full" hint={settings.feishu_app_token_set ? '已配置（掩码）' : '未配置'}><input id="feishuToken" type="password" className="input" value={feishu.feishu_app_token} onChange={(event) => setFeishu({ ...feishu, feishu_app_token: event.target.value })} placeholder={settings.feishu_app_token_set ? '留空表示不修改' : '仅本地演示配置'} autoComplete="new-password" /></Field>
          <Field label="预约表 ID" htmlFor="feishuTableRes"><input id="feishuTableRes" className="input" value={feishu.feishu_table_reservations} onChange={(event) => setFeishu({ ...feishu, feishu_table_reservations: event.target.value })} /></Field>
          <Field label="客户表 ID" htmlFor="feishuTableCus"><input id="feishuTableCus" className="input" value={feishu.feishu_table_customers} onChange={(event) => setFeishu({ ...feishu, feishu_table_customers: event.target.value })} /></Field>
          <Field label="散客表 ID" htmlFor="feishuTableWalk"><input id="feishuTableWalk" className="input" value={feishu.feishu_table_walkins} onChange={(event) => setFeishu({ ...feishu, feishu_table_walkins: event.target.value })} /></Field>
          <Field label="座位配置表 ID" htmlFor="feishuTableSeat"><input id="feishuTableSeat" className="input" value={feishu.feishu_table_seat_config} onChange={(event) => setFeishu({ ...feishu, feishu_table_seat_config: event.target.value })} /></Field>
          <Field label="布局表 ID" htmlFor="feishuTableLayout"><input id="feishuTableLayout" className="input" value={feishu.feishu_table_layouts} onChange={(event) => setFeishu({ ...feishu, feishu_table_layouts: event.target.value })} /></Field>
          <Field label="Webhook URL" htmlFor="webhookUrl" className="field--full" hint="仅用于模拟投递与格式校验；测试不会发起真实网络请求"><input id="webhookUrl" className="input" value={webhook.webhook_url} onChange={(event) => setWebhook({ webhook_url: event.target.value })} placeholder="https://example.com/hooks/callflow" /></Field>
        </div>
        {integrations?.syncJobs && integrations.syncJobs.length > 0 && (
          <div className="sync-list">
            <strong>最近同步任务</strong>
            {integrations.syncJobs.slice(0, 4).map((job) => (
              <div className="sync-row" key={job.id}><span>{job.provider} · {job.direction}</span><span>{formatDate(job.startedAt, 'M月d日 HH:mm')}</span><span className={cn('status-badge', job.status === 'completed' ? 'tone-green' : 'tone-amber')}>{job.status}</span><span className="demo-badge demo-badge--subtle">{job.simulated ? '模拟' : '真实'}</span></div>
            ))}
          </div>
        )}
        <div className="form-actions">
          <button className="button button--primary" type="submit" disabled={saving}><Save size={16} />保存集成配置</button>
          <button className="button button--ghost" type="button" onClick={() => test('webhook')} disabled={testing === 'webhook'}><Webhook size={16} />测试 Webhook</button>
        </div>
      </form>
      <div className="inline-alert inline-alert--warning">{integrations?.disclosure || '外部集成当前均为模拟或仅配置状态；不会拨号、不会调用真实 AI、不会访问飞书、默认不会发起 Webhook 网络请求。'}</div>
    </div>
  );
}

function DataTab({ onChanged }: { onChanged: () => void }) {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [csvType, setCsvType] = useState<'customers' | 'appointments' | 'calls'>('customers');
  const [scope, setScope] = useState<'appointments' | 'calls' | 'customers' | 'walkins' | 'notifications'>('appointments');

  const loadBackups = async () => {
    setLoading(true);
    try { const result = await api.backups(); setBackups(result.items); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '备份列表加载失败', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadBackups(); }, []);

  async function createBackup() {
    setWorking('create');
    try { const result = await api.createBackup(); showToast('备份已创建：' + result.backup.filename); await loadBackups(); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '备份失败', 'error'); }
    finally { setWorking(''); }
  }
  async function restore(filename: string) {
    if (!window.confirm('从 ' + filename + ' 恢复会覆盖当前业务数据，确定继续吗？')) return;
    setWorking('restore');
    try { await api.restoreBackup(filename); showToast('数据已恢复'); onChanged(); await loadBackups(); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '恢复失败', 'error'); }
    finally { setWorking(''); }
  }
  async function importFile(file: File, kind: 'csv' | 'json') {
    setWorking('import');
    try {
      const content = await file.text();
      if (kind === 'csv') {
        const result = await api.importCsv(csvType, content);
        showToast('CSV 导入完成：' + result.imported + ' 条，跳过 ' + result.skipped + ' 条');
        if (result.errors.length) showToast('部分行失败：' + result.errors[0].message, 'error');
      } else {
        const payload = JSON.parse(content);
        if (!window.confirm('导入 JSON 备份会覆盖当前业务数据（用户、密码与敏感配置除外），确定继续吗？')) return;
        const result = await api.importJson({ ...payload, confirmReplace: true });
        showToast('JSON 导入完成：' + Object.values(result.counts).reduce((sum, count) => sum + Number(count), 0) + ' 条记录');
      }
      onChanged();
    } catch (requestError) {
      showToast(requestError instanceof ApiError ? requestError.message : '导入失败，请检查文件格式', 'error');
    } finally { setWorking(''); }
  }
  async function clearData() {
    if (!window.confirm('确定清除所选业务数据吗？此操作不可撤销，请先创建备份。')) return;
    setWorking('clear');
    try { await api.clearData(scope); showToast('已清除所选数据'); onChanged(); await loadBackups(); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '清除失败', 'error'); }
    finally { setWorking(''); }
  }
  async function resetDemo() {
    if (!window.confirm('重置为初始虚构演示数据？现有业务数据会被替换，用户与设置保留。')) return;
    setWorking('reset');
    try { const result = await api.resetDemo(); showToast(result.message); onChanged(); await loadBackups(); }
    catch (requestError) { showToast(requestError instanceof ApiError ? requestError.message : '重置失败', 'error'); }
    finally { setWorking(''); }
  }

  return (
    <div className="settings-stack">
      <section className="settings-card">
        <header className="settings-card__header"><div><h2>导出</h2><p>导出当前本地演示数据库中的业务数据。</p></div><Database size={20} /></header>
        <div className="button-cluster">
          {can('data:export') && <><button className="button button--secondary" onClick={() => { window.location.href = api.exportUrl('csv', 'customers'); }}>客户 CSV</button><button className="button button--secondary" onClick={() => { window.location.href = api.exportUrl('csv', 'appointments'); }}>预约 CSV</button><button className="button button--secondary" onClick={() => { window.location.href = api.exportUrl('csv', 'calls'); }}>通话 CSV</button><button className="button button--ghost" onClick={() => { window.location.href = api.exportUrl('json'); }}>完整 JSON 备份</button></>}
        </div>
        <p className="hint-text">导出文件不包含密码哈希、飞书密钥或任何真实生产数据。</p>
      </section>

      <section className="settings-card">
        <header className="settings-card__header"><div><h2>备份与恢复</h2><p>备份保存在项目根目录的 backups/ 目录（可用 BACKUP_DIR 覆盖），仅管理员或具备备份权限的角色可操作。</p></div><button className="button button--primary button--sm" onClick={createBackup} disabled={working === 'create'}>{working === 'create' ? '创建中…' : '创建备份'}</button></header>
        {loading ? <div className="muted-block">正在加载备份…</div> : backups.length === 0 ? <div className="muted-block">暂无备份。创建一份备份后再执行恢复或清除操作。</div> : (
          <div className="backup-list">
            {backups.map((backup) => (
              <div className="backup-row" key={backup.filename}><div><strong>{backup.filename}</strong><span>{formatDate(backup.modifiedAt, 'yyyy-MM-dd HH:mm')} · {(backup.size / 1024).toFixed(1)} KB</span></div><button className="button button--ghost button--xs" onClick={() => restore(backup.filename)} disabled={working === 'restore'}>恢复</button></div>
            ))}
          </div>
        )}
      </section>

      <section className="settings-card">
        <header className="settings-card__header"><div><h2>导入</h2><p>CSV 支持客户、预约、通话；JSON 使用本系统导出的备份格式。</p></div></header>
        <div className="form-grid form-grid--2">
          <Field label="CSV 数据类型" htmlFor="csvType"><select id="csvType" className="input select" value={csvType} onChange={(event) => setCsvType(event.target.value as typeof csvType)}><option value="customers">客户</option><option value="appointments">预约</option><option value="calls">通话</option></select></Field>
          <Field label="选择 CSV 文件" htmlFor="csvFile"><input id="csvFile" type="file" accept=".csv,text/csv" className="input" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file, 'csv'); event.target.value = ''; }} disabled={working === 'import'} /></Field>
          <Field label="选择 JSON 备份" htmlFor="jsonFile" className="field--full"><input id="jsonFile" type="file" accept=".json,application/json" className="input" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file, 'json'); event.target.value = ''; }} disabled={working === 'import'} /></Field>
        </div>
      </section>

      <section className="settings-card settings-card--danger">
        <header className="settings-card__header"><div><h2>清除与重置</h2><p>仅影响业务数据；用户、角色、设置和审计日志保留。</p></div></header>
        <div className="form-grid form-grid--2">
          <Field label="清除范围" htmlFor="clearScope"><select id="clearScope" className="input select" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="appointments">预约与状态历史</option><option value="calls">通话与转写</option><option value="customers">客户与消费</option><option value="walkins">散客</option><option value="notifications">通知</option></select></Field>
          <div className="form-actions"><button className="button button--danger" type="button" onClick={clearData} disabled={working === 'clear'}>清除所选数据</button><button className="button button--secondary" type="button" onClick={resetDemo} disabled={working === 'reset'}>重置为演示数据</button></div>
        </div>
      </section>
    </div>
  );
}

function AccountTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (newPassword !== confirmPassword) { setError('两次输入的新密码不一致'); return; }
    if (newPassword.length < 10) { setError('新密码至少 10 个字符'); return; }
    setSaving(true);
    try {
      const result = await api.auth.password(currentPassword, newPassword);
      showToast(result.message);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '修改失败');
    } finally { setSaving(false); }
  }

  return (
    <form className="settings-card" onSubmit={submit}>
      <header className="settings-card__header"><div><h2>账号安全</h2><p>{user?.displayName} · {user?.username} · 建议使用长密码并定期更换。</p></div><ShieldCheck size={20} /></header>
      <div className="form-grid form-grid--2">
        {error && <div className="inline-alert inline-alert--error field--full">{error}</div>}
        <Field label="当前密码" htmlFor="currentPassword" className="field--full" required><input id="currentPassword" type="password" className="input" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></Field>
        <Field label="新密码" htmlFor="newPassword" required hint="至少 10 个字符"><input id="newPassword" type="password" className="input" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></Field>
        <Field label="确认新密码" htmlFor="confirmPassword" required><input id="confirmPassword" type="password" className="input" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></Field>
        <div className="form-actions field--full"><button className="button button--primary" type="submit" disabled={saving}>{saving ? '更新中…' : '更新密码'}</button></div>
      </div>
      <div className="inline-alert inline-alert--info">修改密码会使该账号在其他会话上的登录失效；所有权限仍在服务端校验。</div>
    </form>
  );
}
