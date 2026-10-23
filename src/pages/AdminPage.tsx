import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LoaderCircle, Pencil, Plus, Search, ShieldCheck, UserCog, UserX } from 'lucide-react';
import { api, ApiError } from '../api';
import { roleLabel, useAuth } from '../auth';
import type { Role, User } from '../types';
import { cn, formatDateTime } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, PageLoader } from '../components/States';
import { Dialog } from '../components/Overlay';
import { Field } from '../components/Field';
import { useToast } from '../components/Toast';

const ROLES: Role[] = ['admin', 'manager', 'agent', 'viewer'];

interface AuditRow { id: string; actorName: string; action: string; entityType: string; entityId: string; detail: string; ip: string; createdAt: string; }

export function AdminPage() {
  const { user, can } = useAuth();
  const [tab, setTab] = useState<'users' | 'audit' | 'roles'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<Role, string[]> | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditAction, setAuditAction] = useState('');
  const [auditActor, setAuditActor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ user: User | null } | null>(null);
  const isAdmin = user?.role === 'admin';

  const loadUsers = async () => {
    if (!isAdmin) { setRolePermissions(null); return; }
    try {
      const result = await api.users();
      setUsers(result.items); setRolePermissions(result.roles);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '用户列表加载失败');
    }
  };

  const loadAudit = async () => {
    if (!can('audit:read')) return;
    try {
      const result = await api.auditLogs({ pageSize: 80, action: auditAction || undefined, actor: auditActor || undefined });
      setAudit(result.items); setAuditTotal(result.total);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '审计日志加载失败');
    }
  };

  useEffect(() => {
    setLoading(true); setError('');
    Promise.all([loadUsers(), loadAudit()]).finally(() => setLoading(false));
  }, [isAdmin, auditAction, auditActor]);

  // 非管理员（如具备 audit:read 的经理）没有账号/角色页签，默认展示审计日志，避免空白页。
  useEffect(() => {
    if (!isAdmin && tab !== 'audit') setTab('audit');
  }, [isAdmin, tab]);

  async function disable(target: User) {
    if (!window.confirm('确定停用账号 ' + target.username + ' 吗？该账号的会话会立即失效。')) return;
    try { await api.deleteUser(target.id); void loadUsers(); }
    catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : '操作失败'); }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="系统" title="账号与审计" description="服务端角色权限、账号状态与关键操作审计日志。"
        actions={isAdmin ? <button className="button button--primary" onClick={() => setDialog({ user: null })}><Plus size={16} />新增账号</button> : undefined} />
      <div className="segmented segmented--page">
        {isAdmin && <button type="button" className={tab === 'users' ? 'is-active' : ''} onClick={() => setTab('users')}>账号管理</button>}
        <button type="button" className={tab === 'audit' ? 'is-active' : ''} onClick={() => setTab('audit')}>审计日志</button>
        {isAdmin && <button type="button" className={tab === 'roles' ? 'is-active' : ''} onClick={() => setTab('roles')}>角色权限</button>}
      </div>

      {loading && <PageLoader rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={() => { void loadUsers(); void loadAudit(); }} />}
      {!loading && !error && tab === 'users' && isAdmin && (
        users.length === 0 ? <div className="panel"><EmptyState title="暂无账号" description="创建账号并分配角色。" icon={<UserCog size={22} />} /></div> : (
          <div className="panel table-panel"><div className="table-scroll"><table className="data-table">
            <thead><tr><th>账号</th><th>角色</th><th>状态</th><th className="hide-md">创建时间</th><th aria-label="操作" /></tr></thead>
            <tbody>{users.map((item) => (
              <tr key={item.id} className="data-table__row data-table__row--static">
                <td><div className="customer-inline"><strong>{item.displayName}</strong><span>{item.username}</span></div></td>
                <td><span className="role-chip">{roleLabel(item.role)}</span></td>
                <td><span className={cn('status-badge', item.active !== false ? 'tone-green' : 'tone-muted')}>{item.active !== false ? '启用' : '停用'}</span></td>
                <td className="hide-md">{formatDateTime(item.createdAt || '', 'yyyy-MM-dd HH:mm')}</td>
                <td><div className="row-actions"><button className="icon-button" onClick={() => setDialog({ user: item })} aria-label="编辑账号"><Pencil size={15} /></button>{item.id !== user?.id && item.active !== false && <button className="icon-button icon-button--danger" onClick={() => disable(item)} aria-label="停用账号"><UserX size={15} /></button>}</div></td>
              </tr>
            ))}</tbody>
          </table></div></div>
        )
      )}

      {!loading && !error && tab === 'audit' && (
        <>
          <section className="filter-bar">
            <div className="filter-search"><Search size={16} /><input value={auditAction} onChange={(event) => setAuditAction(event.target.value)} placeholder="按操作筛选，如 appointment" aria-label="操作筛选" /></div>
            <div className="filter-search"><Search size={16} /><input value={auditActor} onChange={(event) => setAuditActor(event.target.value)} placeholder="按操作人或 ID 筛选" aria-label="操作人筛选" /></div>
            <div className="filter-spacer" />
            <span className="filter-stat">{auditTotal} 条日志</span>
          </section>
          {audit.length === 0 ? <div className="panel"><EmptyState title="暂无审计日志" description="关键写操作会记录操作人、实体、详情与 IP。" icon={<ShieldCheck size={22} />} /></div> : (
            <div className="panel table-panel"><div className="table-scroll"><table className="data-table">
              <thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>实体</th><th>详情</th><th className="hide-md">IP</th></tr></thead>
              <tbody>{audit.map((row) => (
                <tr key={row.id} className="data-table__row data-table__row--static">
                  <td>{formatDateTime(row.createdAt, 'MM-dd HH:mm:ss')}</td>
                  <td>{row.actorName || '系统'}</td>
                  <td><code className="code-chip">{row.action}</code></td>
                  <td>{row.entityType}<span className="table-cell__sub">{row.entityId || '—'}</span></td>
                  <td><div className="summary-cell"><span>{row.detail || '—'}</span></div></td>
                  <td className="hide-md">{row.ip || '—'}</td>
                </tr>
              ))}</tbody>
            </table></div></div>
          )}
        </>
      )}

      {!loading && !error && tab === 'roles' && isAdmin && rolePermissions && (
        <div className="role-grid">
          {ROLES.map((role) => (
            <section className="panel role-card" key={role}>
              <header className="role-card__header"><div><h2>{roleLabel(role)}</h2><p>{role}</p></div><span className="count-chip">{rolePermissions[role].length} 项权限</span></header>
              <div className="role-card__permissions">{rolePermissions[role].map((permission) => <code key={permission} className="code-chip">{permission}</code>)}</div>
            </section>
          ))}
        </div>
      )}

      <UserDialog open={Boolean(dialog)} user={dialog?.user || null} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void loadUsers(); }} />
    </div>
  );
}

function UserDialog({ open, user, onClose, onSaved }: { open: boolean; user: User | null; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername(user?.username || ''); setDisplayName(user?.displayName || ''); setPassword('');
    setRole(user?.role || 'agent'); setActive(user ? user.active !== false : true); setError('');
  }, [open, user]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (user) {
        await api.updateUser(user.id, { displayName, role, active, password: password || undefined });
        showToast('账号已更新');
      } else {
        await api.createUser({ username, displayName, password, role, active });
        showToast('账号已创建');
      }
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title={user ? '编辑账号' : '新增账号'} description="角色权限在服务端校验；密码至少 10 个字符。"
      footer={<><button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button button--primary" type="submit" form="user-form" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />}{saving ? '保存中…' : '保存账号'}</button></>}>
      <form id="user-form" className="form-grid form-grid--2" onSubmit={submit}>
        {error && <div className="inline-alert inline-alert--error field--full">{error}</div>}
        <Field label="用户名" htmlFor="userUsername" required hint="字母、数字、点、下划线或短横线"><input id="userUsername" className="input" value={username} onChange={(event) => setUsername(event.target.value)} disabled={Boolean(user)} autoFocus={!user} /></Field>
        <Field label="显示名称" htmlFor="userDisplayName" required><input id="userDisplayName" className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field>
        <Field label={user ? '重置密码（可选）' : '初始密码'} htmlFor="userPassword" required={!user} hint={user ? '留空则不修改；修改后会注销该账号其他会话' : '至少 10 个字符'}><input id="userPassword" type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></Field>
        <Field label="角色" htmlFor="userRole"><select id="userRole" className="input select" value={role} onChange={(event) => setRole(event.target.value as Role)}>{ROLES.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></Field>
        <label className="check-field field--full"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>启用账号</strong><small>停用后该账号无法登录，所有现有会话失效</small></span></label>
      </form>
    </Dialog>
  );
}
