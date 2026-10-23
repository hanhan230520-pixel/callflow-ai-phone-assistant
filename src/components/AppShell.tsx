import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Bell, CalendarDays, ClipboardList, HelpCircle, Info, LayoutDashboard,
  LayoutGrid, LogOut, Menu, PhoneCall, Plus, Settings, ShieldCheck, Sparkles, UserPlus, Users, X
} from 'lucide-react';
import { api, ApiError } from '../api';
import { roleLabel, useAuth } from '../auth';
import { cn, formatDate, todayString } from '../lib/format';
import { BrandLockup, BrandMark } from './BrandMark';
import { Avatar } from './Avatar';
import { Dialog } from './Overlay';
import { useToast } from './Toast';

const NAV_GROUPS: Array<{ label: string; items: Array<{ label: string; path: string; icon: typeof LayoutDashboard; end?: boolean; permission?: string; badge?: boolean }> }> = [
  {
    label: '运营工作台',
    items: [
      { label: '运营概览', path: '/', icon: LayoutDashboard, end: true },
      { label: '预约日历', path: '/calendar', icon: CalendarDays },
      { label: '预约管理', path: '/appointments', icon: ClipboardList },
      { label: '来电中心', path: '/calls', icon: PhoneCall }
    ]
  },
  {
    label: '客户运营',
    items: [
      { label: '客户档案', path: '/customers', icon: Users },
      { label: '散客登记', path: '/walk-ins', icon: UserPlus }
    ]
  },
  {
    label: '资源与洞察',
    items: [
      { label: '桌台布局', path: '/tables', icon: LayoutGrid },
      { label: '运营报表', path: '/reports', icon: BarChart3 }
    ]
  },
  {
    label: '系统',
    items: [
      { label: '通知中心', path: '/notifications', icon: Bell, badge: true },
      { label: '系统设置', path: '/settings', icon: Settings },
      { label: '账号与审计', path: '/admin', icon: ShieldCheck, permission: 'audit:read' },
      { label: '系统诊断', path: '/diagnostics', icon: Activity, permission: 'diagnostics:read' },
      { label: '使用帮助', path: '/help', icon: HelpCircle }
    ]
  }
];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, can } = useAuth();
  const { showToast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    api.notifications({ unread: 'true', pageSize: 5 })
      .then((result) => setUnread(result.unread))
      .catch(() => undefined);
  }, [location.pathname]);

  async function resetDemo() {
    setResetting(true);
    try {
      const result = await api.resetDemo();
      showToast(result.message);
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : '重置失败', 'error');
      setResetting(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-frame">
      <div className={cn('sidebar-scrim', mobileOpen && 'is-visible')} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <aside className={cn('sidebar', mobileOpen && 'is-open')}>
        <div className="sidebar__top">
          <Link to="/" className="sidebar__brand" aria-label="CallFlow 首页"><BrandLockup /></Link>
          <button type="button" className="icon-button sidebar__mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={18} /></button>
        </div>

        {can('appointments:write') && <Link to="/appointments?new=1" className="sidebar__create"><Plus size={17} />新建预约</Link>}

        <nav className="sidebar__nav" aria-label="主导航">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => !item.permission || can(item.permission));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group.label}>
                <span className="sidebar__nav-label">{group.label}</span>
                {items.map(({ label, path, icon: Icon, end, badge }) => (
                  <NavLink key={path} to={path} end={end} className={({ isActive }) => cn('nav-item', isActive && 'is-active')}>
                    <Icon size={18} strokeWidth={1.9} /><span>{label}</span>
                    {badge && unread > 0 && <em className="nav-item__badge">{unread > 99 ? '99+' : unread}</em>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar__bottom">
          {can('data:import') && (
            <button type="button" className="demo-card" onClick={() => setAboutOpen(true)}>
              <span className="demo-card__icon"><Sparkles size={16} /></span>
              <span className="demo-card__copy"><strong>演示环境</strong><span>虚构数据 · 本地 SQLite</span></span>
              <Info size={15} />
            </button>
          )}
          <div className="sidebar__account">
            <Avatar name={user?.displayName || '演'} size="sm" />
            <div><strong>{user?.displayName || '未登录'}</strong><span>{roleLabel(user?.role || 'viewer')} · CallFlow</span></div>
            <button type="button" className="icon-button" onClick={handleLogout} aria-label="退出登录" title="退出登录"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar__left">
            <button type="button" className="icon-button topbar__menu" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={20} /></button>
            <div className="topbar__context">
              <span className="topbar__workspace">预约工作台</span>
              <span className="topbar__separator">/</span>
              <span>{formatDate(todayString(), 'M月d日')}</span>
            </div>
          </div>
          <div className="topbar__right">
            <span className="env-badge"><span className="env-badge__dot" />演示环境</span>
            <Link to="/notifications" className="icon-button topbar__bell" aria-label="通知中心">
              <Bell size={18} />
              {unread > 0 && <span className="topbar__bell-dot">{unread > 9 ? '9+' : unread}</span>}
            </Link>
            <div className="topbar__profile"><Avatar name={user?.displayName || '演'} size="sm" /><span>{user?.displayName}</span></div>
          </div>
        </header>
        <main className="page-content"><Outlet /></main>
      </div>

      <Dialog open={aboutOpen} onClose={() => { setAboutOpen(false); setConfirmReset(false); }} title="关于 CallFlow">
        <div className="about-panel">
          <div className="about-brand">
            <BrandMark size={52} />
            <div><h3>CallFlow</h3><p>AI 电话预约工作台 · 独立作品集演示</p></div>
          </div>
          <div className="about-badges"><span>独立实现</span><span>虚构数据</span><span>v1.0.0</span></div>
          <p className="about-text">
            覆盖来电、模拟转写、AI 信息提取、预约冲突检测、客户画像、散客、桌台、报表、通知、导入导出与备份恢复的完整本地工作台。
          </p>
          <div className="about-grid">
            <div><strong>数据存储</strong><span>本地 SQLite；所有客户、通话与预约均为虚构演示数据。</span></div>
            <div><strong>真实与模拟</strong><span>真实电话、STT、AI 与飞书接入需要外部环境；当前默认模拟并明确标识。</span></div>
            <div><strong>技术栈</strong><span>React · TypeScript · Vite · Express · node:sqlite</span></div>
            <div><strong>品牌说明</strong><span>不含原系统源码、视觉素材、客户信息或内部服务地址。</span></div>
          </div>
          {can('data:import') && (
            <div className="about-reset">
              <div><strong>重置演示数据</strong><span>恢复初始虚构预约、客户与通话；用户与设置保留。</span></div>
              {!confirmReset ? (
                <button type="button" className="button button--secondary button--sm" onClick={() => setConfirmReset(true)}>重置数据</button>
              ) : (
                <div className="about-reset__confirm">
                  <button type="button" className="button button--ghost button--sm" onClick={() => setConfirmReset(false)}>取消</button>
                  <button type="button" className="button button--danger button--sm" onClick={resetDemo} disabled={resetting}>
                    {resetting ? '重置中…' : '确认重置'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
