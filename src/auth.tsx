import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api.auth.me();
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('callflow:unauthorized', onUnauthorized);
    return () => window.removeEventListener('callflow:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.auth.login(username, password);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } finally { setUser(null); }
  }, []);

  const can = useCallback((permission: string) => {
    if (!user) return false;
    return user.permissions.includes('*') || user.permissions.includes(permission);
  }, [user]);

  const value = useMemo(() => ({ user, loading, login, logout, refresh, can }), [user, loading, login, logout, refresh, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function roleLabel(role: string): string {
  return ({ admin: '管理员', manager: '经理', agent: '坐席', viewer: '只读' } as Record<string, string>)[role] || role;
}
