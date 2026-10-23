import type {
  Appointment, AppointmentDetail, AppointmentInput, AppointmentStatus, AppointmentPrefill,
  BackupItem, CallDetail, CallInput, CallLog, CallScenario, CallStats, ConflictResult,
  Customer, CustomerDetail, CustomerInput, DashboardData, Diagnostics, IntegrationStatus,
  LayoutData, NotificationItem, Payment, ReportPayload, Role, Settings, User, WalkIn, WalkInInput
} from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const headers: Record<string, string> = {
    'x-callflow-csrf': '1',
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...((init?.headers as Record<string, string> | undefined) || {})
  };
  const response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !url.includes('/auth/login')) {
      window.dispatchEvent(new CustomEvent('callflow:unauthorized'));
    }
    throw new ApiError(body?.error?.message || '请求失败，请稍后重试', response.status, body?.error?.code, body?.error?.details);
  }
  return body as T;
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const result = search.toString();
  return result ? `?${result}` : '';
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export interface LoginResponse { user: User; expiresAt: string; }
export interface DemoAccount { username: string; password: string; role: Role; label: string; }
export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number; }

export const api = {
  auth: {
    demoAccounts: () => request<{ demoMode: boolean; note: string; accounts: DemoAccount[] }>('/api/auth/demo-accounts'),
    login: (username: string, password: string) => request<LoginResponse>('/api/auth/login', json('POST', { username, password })),
    logout: () => request<{ ok: boolean }>('/api/auth/logout', json('POST', {})),
    me: () => request<{ user: User }>('/api/auth/me'),
    password: (currentPassword: string, newPassword: string) =>
      request<{ ok: boolean; message: string }>('/api/auth/password', json('PATCH', { currentPassword, newPassword }))
  },
  dashboard: (date?: string) => request<DashboardData>(`/api/dashboard${query({ date })}`),

  appointments: (params: { search?: string; status?: string; source?: string; date?: string; from?: string; to?: string; customerId?: string; page?: number; pageSize?: number }) =>
    request<Paginated<Appointment>>(`/api/appointments${query(params)}`),
  appointment: (id: string) => request<AppointmentDetail>(`/api/appointments/${encodeURIComponent(id)}`),
  checkAppointment: (data: { date: string; time: string; partySize: number; tableId?: string | null; comboId?: string | null; excludeId?: string }) =>
    request<ConflictResult>('/api/appointments/check', json('POST', data)),
  createAppointment: (data: AppointmentInput) => request<{ item: Appointment; conflicts: unknown[]; overridden: boolean }>('/api/appointments', json('POST', data)),
  updateAppointment: (id: string, data: Partial<AppointmentInput> & { force?: boolean }) =>
    request<{ item: Appointment; conflicts: unknown[]; overridden: boolean }>(`/api/appointments/${encodeURIComponent(id)}`, json('PATCH', data)),
  changeAppointmentStatus: (id: string, status: AppointmentStatus, note = '', force = false) =>
    request<{ item: Appointment }>(`/api/appointments/${encodeURIComponent(id)}/status`, json('PATCH', { status, note, force })),
  deleteAppointment: (id: string) => request<{ ok: boolean }>(`/api/appointments/${encodeURIComponent(id)}`, json('DELETE', {})),

  customers: (params: { search?: string; tier?: string; tag?: string; sort?: string; page?: number; pageSize?: number }) =>
    request<Paginated<Customer>>(`/api/customers${query(params)}`),
  customer: (id: string) => request<CustomerDetail>(`/api/customers/${encodeURIComponent(id)}`),
  createCustomer: (data: CustomerInput) => request<{ item: Customer }>('/api/customers', json('POST', data)),
  updateCustomer: (id: string, data: Partial<CustomerInput>) => request<{ item: Customer }>(`/api/customers/${encodeURIComponent(id)}`, json('PATCH', data)),
  deleteCustomer: (id: string) => request<{ ok: boolean }>(`/api/customers/${encodeURIComponent(id)}`, json('DELETE', {})),
  addPayment: (customerId: string, data: { amount: number; method: string; note?: string; receiptRef?: string; paidAt?: string; appointmentId?: string | null }) =>
    request<{ payment: Payment; detail: CustomerDetail }>(`/api/customers/${encodeURIComponent(customerId)}/payments`, json('POST', data)),
  mergeCustomers: (sourceId: string, targetId: string) =>
    request<{ item: Customer }>(`/api/customers/${encodeURIComponent(sourceId)}/merge`, json('POST', { sourceId, targetId })),

  calls: (params: { search?: string; status?: string; scenario?: string; followUp?: string; simulated?: string; page?: number; pageSize?: number }) =>
    request<Paginated<CallLog> & { stats: CallStats }>(`/api/calls${query(params)}`),
  call: (id: string) => request<CallDetail>(`/api/calls/${encodeURIComponent(id)}`),
  callStats: () => request<CallStats>('/api/calls/stats'),
  createCall: (data: CallInput) => request<{ item: CallLog }>('/api/calls', json('POST', data)),
  updateCall: (id: string, data: Partial<CallInput>) => request<{ item: CallLog }>(`/api/calls/${encodeURIComponent(id)}`, json('PATCH', data)),
  deleteCall: (id: string) => request<{ ok: boolean }>(`/api/calls/${encodeURIComponent(id)}`, json('DELETE', {})),
  simulateIncoming: (data: { phone: string; contactName?: string; scenario?: CallScenario }) =>
    request<{ item: CallLog; customer: Customer | null; script: CallDetail['script']; simulated: boolean }>('/api/calls/simulate-incoming', json('POST', data)),
  answerCall: (id: string) => request<{ item: CallLog; simulated: boolean }>(`/api/calls/${encodeURIComponent(id)}/answer`, json('POST', {})),
  hangupCall: (id: string) => request<{ item: CallLog }>(`/api/calls/${encodeURIComponent(id)}/hangup`, json('POST', {})),
  transcribeCall: (id: string, scenario?: CallScenario) =>
    request<CallDetail & { simulated: boolean; note: string }>(`/api/calls/${encodeURIComponent(id)}/transcribe`, json('POST', { scenario })),
  analyzeCall: (id: string) => request<{ call: CallLog; analysis: { summary: string; tags: string[]; keywords: unknown[]; extracted: Record<string, unknown>; sentiment: string; simulated: boolean; profile: { tags: string[]; suggestions: string[]; simulated: boolean; provider: string } } }>(`/api/calls/${encodeURIComponent(id)}/analyze`, json('POST', {})),
  convertCall: (id: string, data: Partial<AppointmentInput>) =>
    request<{ call: CallLog; appointment: Appointment; conflicts: unknown[]; overridden: boolean }>(`/api/calls/${encodeURIComponent(id)}/appointment`, json('POST', data)),
  linkCall: (id: string, appointmentId: string | null) => request<{ item: CallLog }>(`/api/calls/${encodeURIComponent(id)}/link`, json('POST', { appointmentId })),
  simulateRecording: (id: string) => request<{ item: CallLog }>(`/api/calls/${encodeURIComponent(id)}/recording`, json('POST', {})),

  walkIns: (params: { search?: string; status?: string; date?: string }) =>
    request<{ items: WalkIn[]; total: number; waiting: number }>(`/api/walk-ins${query(params)}`),
  createWalkIn: (data: WalkInInput) => request<{ item: WalkIn }>('/api/walk-ins', json('POST', data)),
  updateWalkIn: (id: string, data: Partial<WalkInInput>) => request<{ item: WalkIn }>(`/api/walk-ins/${encodeURIComponent(id)}`, json('PATCH', data)),
  deleteWalkIn: (id: string) => request<{ ok: boolean }>(`/api/walk-ins/${encodeURIComponent(id)}`, json('DELETE', {})),
  convertWalkIn: (id: string, data: Partial<AppointmentInput> & { overrideConflict?: boolean }) =>
    request<{ walkIn: WalkIn; appointment: Appointment; overridden?: boolean }>(`/api/walk-ins/${encodeURIComponent(id)}/convert`, json('POST', data)),

  layout: (date?: string) => request<LayoutData>(`/api/tables${query({ date })}`),
  createArea: (data: { name: string; sortOrder?: number }) => request<{ id: string }>('/api/tables/areas', json('POST', data)),
  updateArea: (id: string, data: { name?: string; sortOrder?: number }) => request<{ ok: boolean }>(`/api/tables/areas/${encodeURIComponent(id)}`, json('PATCH', data)),
  deleteArea: (id: string) => request<{ ok: boolean }>(`/api/tables/areas/${encodeURIComponent(id)}`, json('DELETE', {})),
  createTable: (data: Record<string, unknown>) => request<{ id: string }>('/api/tables/tables', json('POST', data)),
  updateTable: (id: string, data: Record<string, unknown>) => request<{ ok: boolean }>(`/api/tables/tables/${encodeURIComponent(id)}`, json('PATCH', data)),
  deleteTable: (id: string) => request<{ ok: boolean }>(`/api/tables/tables/${encodeURIComponent(id)}`, json('DELETE', {})),
  createCombo: (data: { name: string; tableIds: string[]; capacity?: number; notes?: string; active?: boolean }) =>
    request<{ id: string; capacity: number }>('/api/tables/combos', json('POST', data)),
  updateCombo: (id: string, data: Record<string, unknown>) => request<{ ok: boolean }>(`/api/tables/combos/${encodeURIComponent(id)}`, json('PATCH', data)),
  deleteCombo: (id: string) => request<{ ok: boolean }>(`/api/tables/combos/${encodeURIComponent(id)}`, json('DELETE', {})),
  createSlot: (data: { name: string; startTime: string; endTime: string; sortOrder?: number; active?: boolean }) =>
    request<{ id: string }>('/api/tables/slots', json('POST', data)),
  updateSlot: (id: string, data: Record<string, unknown>) => request<{ ok: boolean }>(`/api/tables/slots/${encodeURIComponent(id)}`, json('PATCH', data)),
  deleteSlot: (id: string) => request<{ ok: boolean }>(`/api/tables/slots/${encodeURIComponent(id)}`, json('DELETE', {})),

  reports: (from?: string, to?: string) => request<ReportPayload>(`/api/reports${query({ from, to })}`),

  notifications: (params: { unread?: string; page?: number; pageSize?: number; type?: string }) =>
    request<Paginated<NotificationItem> & { unread: number }>(`/api/notifications${query(params)}`),
  markNotification: (id: string) => request<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/read`, json('PATCH', {})),
  markAllNotifications: () => request<{ ok: boolean }>('/api/notifications/read-all', json('POST', {})),
  deleteNotification: (id: string) => request<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}`, json('DELETE', {})),

  settings: () => request<{ settings: Settings; meta: { conflictWindow: { value: number; min: number; max: number }; autoAnswerTimeout: { value: number; min: number; max: number }; integrations: IntegrationStatus; disclaimer: string } }>('/api/settings'),
  updateSettings: (patch: Partial<Settings>) => request<{ updated: string[]; settings: Settings }>('/api/settings', json('PATCH', patch)),

  integrations: () => request<IntegrationStatus>('/api/integrations'),
  testAi: () => request<Record<string, unknown>>('/api/integrations/ai/test', json('POST', {})),
  testTelephony: () => request<Record<string, unknown>>('/api/integrations/telephony/test', json('POST', {})),
  testFeishu: () => request<{ ok: boolean; message: string; simulated?: boolean }>('/api/integrations/feishu/test', json('POST', {})),
  syncFeishu: (direction: 'pull' | 'push' | 'both' = 'pull') => request<{ job: Record<string, unknown>; simulated: boolean }>('/api/integrations/feishu/sync', json('POST', { direction })),
  testWebhook: (url?: string) => request<{ delivery: Record<string, unknown>; simulated: boolean; note: string }>('/api/integrations/webhook/test', json('POST', { url })),

  users: () => request<{ items: User[]; roles: Record<Role, string[]> }>('/api/admin/users'),
  createUser: (data: { username: string; displayName: string; password: string; role: Role; active?: boolean }) =>
    request<{ user: User }>('/api/admin/users', json('POST', data)),
  updateUser: (id: string, data: { displayName?: string; role?: Role; active?: boolean; password?: string }) =>
    request<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}`, json('PATCH', data)),
  deleteUser: (id: string) => request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}`, json('DELETE', {})),
  auditLogs: (params: { page?: number; pageSize?: number; action?: string; actor?: string }) =>
    request<Paginated<{ id: string; actorName: string; action: string; entityType: string; entityId: string; detail: string; ip: string; createdAt: string }>>(`/api/admin/audit${query(params)}`),
  roles: () => request<{ roles: Record<Role, string[]> }>('/api/admin/roles'),
  diagnostics: () => request<Diagnostics>('/api/admin/diagnostics'),

  backups: () => request<{ items: BackupItem[] }>('/api/data/backups'),
  createBackup: () => request<{ backup: BackupItem }>('/api/data/backups', json('POST', {})),
  restoreBackup: (filename: string) => request<{ counts: Record<string, number>; restoredFrom: string }>('/api/data/backups/restore', json('POST', { filename })),
  resetDemo: () => request<{ ok: boolean; message: string }>('/api/data/reset-demo', json('POST', {})),
  clearData: (scope: 'appointments' | 'calls' | 'customers' | 'walkins' | 'notifications' | 'all') =>
    request<{ ok: boolean; scope: string }>('/api/data/clear', json('POST', { scope })),
  importCsv: (type: 'customers' | 'appointments' | 'calls', content: string) =>
    request<{ imported: number; skipped: number; errors: Array<{ row: number; message: string }> }>('/api/data/import/csv', json('POST', { type, content })),
  importJson: (payload: unknown) => request<{ counts: Record<string, number> }>('/api/data/import/json', json('POST', payload)),
  exportUrl: (type: 'csv' | 'json', scope?: string) => type === 'json'
    ? '/api/data/export/json'
    : `/api/data/export/csv${query({ type: scope || 'customers' })}`
};
