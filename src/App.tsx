import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { useAuth } from './auth';
import { DashboardPage } from './pages/DashboardPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { CalendarPage } from './pages/CalendarPage';
import { CustomersPage } from './pages/CustomersPage';
import { CallsPage } from './pages/CallsPage';
import { WalkInsPage } from './pages/WalkInsPage';
import { TablesPage } from './pages/TablesPage';
import { ReportsPage } from './pages/ReportsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { HelpPage } from './pages/HelpPage';
import { LoginPage } from './pages/LoginPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="boot-screen"><div className="boot-mark" /><p>正在加载 CallFlow…</p></div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <div className="panel access-denied">
        <ShieldAlert size={26} />
        <h2>没有访问权限</h2>
        <p>当前角色无权访问此模块。权限由服务端校验；如需访问，请联系管理员调整角色。</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="customers" element={<RequirePermission permission="customers:read"><CustomersPage /></RequirePermission>} />
        <Route path="calls" element={<RequirePermission permission="calls:read"><CallsPage /></RequirePermission>} />
        <Route path="walk-ins" element={<RequirePermission permission="walkins:read"><WalkInsPage /></RequirePermission>} />
        <Route path="tables" element={<RequirePermission permission="tables:read"><TablesPage /></RequirePermission>} />
        <Route path="reports" element={<RequirePermission permission="reports:read"><ReportsPage /></RequirePermission>} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<RequirePermission permission="settings:read"><SettingsPage /></RequirePermission>} />
        <Route path="admin" element={<RequirePermission permission="audit:read"><AdminPage /></RequirePermission>} />
        <Route path="diagnostics" element={<RequirePermission permission="diagnostics:read"><DiagnosticsPage /></RequirePermission>} />
        <Route path="help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
