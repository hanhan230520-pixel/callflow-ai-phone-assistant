export type AppointmentStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'no_show' | 'cancelled';
export type AppointmentSource = 'phone' | 'walk_in' | 'online' | 'referral' | 'other';
export type CustomerTier = 'new' | 'regular' | 'vip';
export type CallDirection = 'inbound' | 'outbound';
export type CallStatus = 'ringing' | 'answered' | 'completed' | 'missed' | 'follow_up';
export type WalkInStatus = 'waiting' | 'seated' | 'converted' | 'cancelled';
export type Role = 'admin' | 'manager' | 'agent' | 'viewer';
export type CallScenario = 'reservation' | 'business' | 'birthday' | 'complaint' | 'inquiry' | 'vip' | 'cancel';

export interface User {
  id: string; username: string; displayName: string; role: Role;
  permissions: string[]; createdAt?: string; updatedAt?: string; active?: boolean;
}

export interface DiningTable {
  id: string; name: string; areaId?: string | null; area?: string; areaName?: string | null;
  capacity: number; shape?: 'square' | 'round' | 'rectangle'; x?: number; y?: number;
  status?: 'available' | 'cleaning' | 'disabled'; comboGroup?: string; active?: boolean;
  seatedAppointmentId?: string | null; bookedAppointmentId?: string | null;
  guestName?: string | null; appointmentTime?: string | null;
}

export interface ComboRoom { id: string; name: string; capacity: number; notes: string; active: boolean; tableIds: string[]; }
export interface Area { id: string; name: string; sortOrder: number; }
export interface TimeSlot { id: string; name: string; startTime: string; endTime: string; sortOrder: number; active: boolean; }
export interface LayoutData { date: string; areas: Area[]; tables: DiningTable[]; combos: ComboRoom[]; slots: TimeSlot[]; }

export interface Appointment {
  id: string; customerId: string | null; guestName: string; phone: string; date: string; time: string;
  partySize: number; tableId: string | null; comboId: string | null;
  source: AppointmentSource; status: AppointmentStatus; occasion: string; notes: string;
  conflictOverride: boolean; createdAt: string; updatedAt: string; cancelledAt?: string | null;
  customerName?: string | null; customerTier: CustomerTier | null; customerTags?: string[];
  customerTotalSpent?: number; customerVisitCount?: number;
  customerPreferences: string | null; customerAllergies: string | null;
  tableName: string | null; areaId?: string | null; areaName: string | null;
  tableCapacity: number | null; comboName: string | null; comboCapacity: number | null;
}

export interface Customer {
  id: string; name: string; phone: string; tier: CustomerTier;
  preferences: string; allergies: string; notes: string; tags: string[];
  totalSpent: number; visitCount: number; lastContactAt: string | null;
  createdAt: string; updatedAt: string;
  appointmentCount?: number; completedCount?: number; noShowCount?: number;
  nextVisit?: string | null; lastVisit?: string | null;
}

export interface Payment {
  id: string; customerId: string; appointmentId: string | null; amount: number;
  method: string; note: string; receiptRef: string; paidAt: string;
  createdBy?: string | null; createdAt?: string;
}

export interface CallKeyword { key: string; label?: string; level?: 'low' | 'medium' | 'high'; }
export interface CallSegment { id: string; speaker: 'agent' | 'customer'; startMs: number; endMs: number; text: string; }

export interface CallLog {
  id: string; contactName: string; phone: string; customerId: string | null;
  calledAt: string; answeredAt?: string | null; endedAt?: string | null;
  direction: CallDirection; status: CallStatus; durationSeconds: number;
  recordingRef?: string | null; transcript: string; aiSummary: string; aiTags: string[];
  aiExtracted: Record<string, unknown>; keywords: CallKeyword[]; sentiment: string;
  scenario: CallScenario; followUp: boolean; notes: string; appointmentId: string | null;
  isSimulated: boolean; createdBy?: string | null; createdAt: string; updatedAt: string;
  customerName?: string | null; customerTier?: CustomerTier | null;
  linkedGuestName?: string | null; linkedDate?: string | null; linkedTime?: string | null;
  linkedStatus?: AppointmentStatus | null;
}

export interface CallStats { total: number; today: number; followUp: number; simulated: number; completed: number; }
export interface CallDetail {
  item: CallLog; customer: Customer | null; segments: CallSegment[]; appointment: Appointment | null;
  script?: { lines?: string[]; tips?: string[]; scenario?: string; simulated?: boolean; provider?: string };
}

export interface WalkIn {
  id: string; name: string; phone: string; customerId: string | null; date: string; time: string;
  partySize: number; tableId: string | null; notes: string; status: WalkInStatus;
  convertedAppointmentId: string | null; createdAt: string; updatedAt: string;
  tableName?: string | null; areaName?: string | null; customerTier?: CustomerTier | null; customerTags?: string[];
}

export interface NotificationItem {
  id: string; type: 'info' | 'success' | 'warning' | 'error'; title: string; body: string;
  entityType: string; entityId: string; read: boolean; createdAt: string;
}

export interface DashboardData {
  date: string;
  metrics: { appointments: number; guests: number; pending: number; confirmed: number; seated: number;
    calls: number; tables: number; availableTables: number; customers: number; monthRevenue: number; unreadNotifications: number; };
  todayAppointments: Appointment[]; upcoming: Appointment[]; calls: CallLog[];
  attention: Array<{ id: string; guestName: string; time: string; partySize: number; occasion: string;
    preferences: string; allergies: string; notes: string; status: AppointmentStatus; }>;
  tables: DiningTable[]; combos: ComboRoom[];
  sourceCounts: Record<string, number>; statusCounts: Record<string, number>;
  trend: Array<{ date: string; appointments: number; completed: number; guests: number; revenue: number; calls: number }>;
  notes: string[];
}

export interface AppointmentHistoryEntry {
  id: string; fromStatus: string; toStatus: string; note: string; createdAt: string; changedByName: string | null;
}
export interface AppointmentDetail {
  item: Appointment; customer: Customer | null; history: AppointmentHistoryEntry[];
  calls: CallLog[]; payments: Payment[];
}
export interface CustomerDetail {
  item: Customer; appointments: Appointment[]; calls: CallLog[]; payments: Payment[];
  stats: { appointmentCount: number; completedCount: number; noShowCount: number; cancelledCount: number;
    totalSpent: number; lastVisit: string | null; nextVisit: string | null; };
}

export interface ReportSummary {
  range: { from: string; to: string };
  appointments: { total: number; completed: number; cancelled: number; noShow: number; active: number;
    guests: number; averageParty: number; completionRate: number; noShowRate: number; };
  revenue: { total: number; payments: number; average: number };
  calls: { total: number; completed: number; followUp: number; simulated: number; totalDuration: number; converted: number };
  customers: { total: number; newCustomers: number };
  walkIns: number;
}
export interface ReportPayload extends ReportSummary {
  trend: Array<{ date: string; appointments: number; completed: number; guests: number; revenue: number; calls: number }>;
  distributions: {
    status: Array<{ key: string; count: number }>; source: Array<{ key: string; count: number }>;
    tier: Array<{ key: string; count: number }>; keywords: Array<{ label: string; count: number }>;
  };
  topCustomers: Array<{ id: string; name: string; phone: string; tier: CustomerTier; totalSpent: number; visitCount: number }>;
}

export interface Settings {
  business_name: string; business_phone: string; business_address: string; business_hours: string;
  currency: string; conflict_window_minutes: number; enforce_time_slots: boolean; auto_confirm: boolean;
  ai_mode: string; ai_model: string; ai_base_url: string; transcription_enabled: boolean;
  recording_enabled: boolean; auto_answer_enabled: boolean; auto_answer_timeout: number;
  telephony_mode: string; feishu_app_id: string; feishu_app_secret: string; feishu_app_token: string;
  feishu_table_reservations: string; feishu_table_customers: string; feishu_table_walkins: string;
  feishu_table_seat_config: string; feishu_table_layouts: string; webhook_url: string;
  webhook_events: string[]; demo_mode: boolean; ui_density: string; disclaimer_ack: boolean;
  [key: string]: unknown;
}

export interface IntegrationStatus {
  ai: { mode: string; mockAvailable: boolean; scenarios: string[]; disclaimer: string;
    stt: { mode: string; status: string; realProvider: string; realReady: boolean; note: string };
    llm: { mode: string; status: string; provider: string; realReady: boolean; note: string }; };
  telephony: { mode: string; mockAvailable: boolean; device: string; connected: boolean;
    realReady: boolean; capabilities: Record<string, boolean>;
    simulation: { available: boolean; label: string; note: string };
    realIntegration: { status: string; note: string }; disclaimer: string; };
  feishu: { configured: boolean; status: string; note: string; simulated: boolean; lastJob: SyncJob | null; };
  webhook: { url: string; validation: { ok: boolean; reason?: string }; deliveries: WebhookDelivery[] };
  syncJobs: SyncJob[]; disclosure: string;
}

export interface SyncJob {
  id: string; provider: string; direction: string; status: string;
  detail: unknown; simulated: boolean; startedAt: string; finishedAt: string;
}
export interface WebhookDelivery {
  id: string; url: string; event: string; status: string;
  responseStatus: number | null; responseBody: string; createdAt: string;
}
export interface BackupItem { filename: string; size: number; modifiedAt: string; }
export interface Diagnostics {
  app: { name: string; version: string; node: string; uptimeSeconds: number };
  database: { engine: string; integrity: string; counts: Record<string, number>; backups: number };
  runtime: { memoryMb: number; pid: number };
  integrations: IntegrationStatus; warnings: string[]; checkedAt: string;
}

export interface AppointmentInput {
  guestName: string; phone: string; date: string; time: string; partySize: number;
  tableId: string | null; comboId?: string | null; source: AppointmentSource; status: AppointmentStatus;
  occasion: string; notes: string; customerId?: string | null; overrideConflict?: boolean;
}
export interface CustomerInput {
  name: string; phone: string; tier: CustomerTier; preferences: string; allergies: string; notes: string; tags: string[];
}
export interface CallInput {
  contactName: string; phone: string; calledAt?: string; direction: CallDirection; status?: CallStatus;
  durationSeconds: number; transcript?: string; aiSummary?: string; aiTags?: string[];
  aiExtracted?: Record<string, unknown>; keywords?: CallKeyword[]; sentiment?: string;
  scenario?: CallScenario; followUp: boolean; notes: string; appointmentId?: string | null;
  customerId?: string | null; isSimulated?: boolean;
}
export interface WalkInInput {
  name: string; phone: string; date: string; time: string; partySize: number;
  tableId: string | null; notes: string; status?: WalkInStatus;
}
export interface AppointmentPrefill {
  guestName?: string; phone?: string; date?: string; time?: string; partySize?: number;
  occasion?: string; tableId?: string | null; comboId?: string | null; notes?: string;
  callId?: string; customerId?: string;
}
export interface ConflictInfo {
  id: string; guestName: string; time: string; date: string; partySize: number;
  status: AppointmentStatus; tableName: string | null; comboName: string | null; sharedTableIds: string[];
}
export interface NearbySlot {
  time: string; tableId: string | null; comboId: string | null;
  tableName?: string; capacity?: number; offset: number;
}
export interface ConflictResult { conflicts: ConflictInfo[]; nearbySlots: NearbySlot[]; windowMinutes: number; }
