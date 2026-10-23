import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole, PhoneCall, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { api, ApiError, type DemoAccount } from '../api';
import { useAuth } from '../auth';
import { BrandMark } from '../components/BrandMark';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('CallFlowDemo!2026');
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [demoNote, setDemoNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api.auth.demoAccounts().then((result) => {
      setAccounts(result.accounts);
      setDemoNote(result.note);
    }).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  function pickAccount(account: DemoAccount) {
    setUsername(account.username);
    setPassword(account.password);
    setError('');
  }

  return (
    <div className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand">
          <BrandMark size={44} />
          <div><strong>CallFlow</strong><span>AI 电话预约工作台</span></div>
        </div>
        <div className="login-hero">
          <span className="login-kicker"><Sparkles size={15} /> Modern appointment operations</span>
          <h1>每一通来电，<br />都成为可执行的预约。</h1>
          <p>来电识别、模拟转写、AI 提取、冲突检测、客户画像与运营报表，在一个本地可运行的工作台里完整串联。</p>
        </div>
        <div className="login-proof">
          <div><CheckCircle2 size={17} /><span>服务端会话与角色权限</span></div>
          <div><CheckCircle2 size={17} /><span>90 分钟桌台冲突检测</span></div>
          <div><CheckCircle2 size={17} /><span>全链路模拟电话演示</span></div>
          <div><CheckCircle2 size={17} /><span>虚构数据 · 本地 SQLite</span></div>
        </div>
        <div className="login-disclaimer">
          <ShieldCheck size={16} />
          <span>本项目为独立作品集演示，不含原系统源码、品牌素材、客户数据或生产凭据。电话、STT、AI 与飞书默认使用模拟适配器。</span>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-form-card">
          <div className="login-form-head">
            <span className="login-form-icon"><PhoneCall size={20} /></span>
            <div><h2>登录工作台</h2><p>使用演示账号进入运营工作台</p></div>
          </div>
          <form onSubmit={submit} noValidate>
            <label className="login-field">
              <span>用户名</span>
              <div className="input-with-icon"><UserRound size={16} /><input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus /></div>
            </label>
            <label className="login-field">
              <span>密码</span>
              <div className="input-with-icon"><LockKeyhole size={16} /><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></div>
            </label>
            {error && <div className="inline-alert inline-alert--error" role="alert">{error}</div>}
            <button className="button button--primary login-submit" type="submit" disabled={submitting}>
              {submitting ? <LoaderCircle size={17} className="spin" /> : null}
              {submitting ? '正在登录…' : '进入 CallFlow'}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </form>

          {accounts.length > 0 && (
            <div className="demo-accounts">
              <div className="demo-accounts__head"><span>演示账号</span><small>点击填入</small></div>
              <div className="demo-accounts__grid">
                {accounts.map((account) => (
                  <button key={account.username} type="button" onClick={() => pickAccount(account)} className={username === account.username ? 'demo-account is-active' : 'demo-account'}>
                    <strong>{account.label}</strong>
                    <span>{account.username}</span>
                    <small>{account.password}</small>
                  </button>
                ))}
              </div>
              <p>{demoNote}</p>
            </div>
          )}
          <div className="login-foot">仅限本地演示 · DEMO_MODE 可在部署时关闭</div>
        </div>
      </section>
    </div>
  );
}
