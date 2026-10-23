import { z } from 'zod';
import { AppError } from './errors.js';
import { isValidDateString, isValidTimeString } from './time.js';

export const STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'no_show', 'cancelled'];
export const SOURCES = ['phone', 'walk_in', 'online', 'referral', 'other'];
export const TIERS = ['new', 'regular', 'vip'];
export const PAYMENT_METHODS = ['wechat', 'alipay', 'cash', 'card', 'credit', 'comp', 'other'];
export const CALL_STATUSES = ['ringing', 'answered', 'completed', 'missed', 'follow_up'];
export const SCENARIOS = ['reservation', 'business', 'birthday', 'complaint', 'inquiry', 'vip', 'cancel'];
export const ROLES = ['admin', 'manager', 'agent', 'viewer'];

const text = (max = 500) => z.string().trim().max(max);
const optionalText = (max = 2000) => z.string().trim().max(max).optional().default('');
export const phoneSchema = z.string()
  .transform((value) => String(value || '').replace(/\D/g, '').replace(/^86(?=1\d{10}$)/, ''))
  .pipe(z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的 11 位手机号码'));
// 散客电话允许为空；非空时按 11 位手机号校验并规范化。
export const optionalPhoneSchema = z.string().trim().max(30).optional().default('')
  .superRefine((value, ctx) => {
    if (!value) return;
    const digits = String(value).replace(/\D/g, '').replace(/^86(?=1\d{10}$)/, '');
    if (!/^1[3-9]\d{9}$/.test(digits)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '请输入有效的 11 位手机号码' });
    }
  })
  .transform((value) => (value ? String(value).replace(/\D/g, '').replace(/^86(?=1\d{10}$)/, '') : ''));
export const dateSchema = z.string().refine(isValidDateString, '日期格式应为 YYYY-MM-DD');
export const timeSchema = z.string().refine(isValidTimeString, '时间格式应为 HH:mm');

export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(issue?.message || '请求参数不正确', 400, 'VALIDATION_ERROR', { path: issue?.path });
  }
  return result.data;
}

export const appointmentCreateSchema = z.object({
  guestName: text(60).min(1, '请填写客人姓名'),
  phone: phoneSchema,
  date: dateSchema,
  time: timeSchema,
  partySize: z.coerce.number().int().min(1, '人数至少为 1').max(50, '人数不能超过 50'),
  tableId: z.string().trim().max(80).nullable().optional(),
  comboId: z.string().trim().max(80).nullable().optional(),
  source: z.enum(SOURCES).default('phone'),
  status: z.enum(STATUSES).default('pending'),
  occasion: optionalText(100),
  notes: optionalText(2000),
  customerId: z.string().trim().max(80).nullable().optional(),
  overrideConflict: z.boolean().optional().default(false)
});

export const appointmentUpdateSchema = appointmentCreateSchema.partial();

export const statusSchema = z.object({
  status: z.enum(STATUSES),
  note: z.string().trim().max(500).optional().default(''),
  force: z.boolean().optional().default(false)
});

export const customerCreateSchema = z.object({
  name: text(60).min(1, '请填写客户姓名'),
  phone: phoneSchema,
  tier: z.enum(TIERS).default('new'),
  preferences: optionalText(500),
  allergies: optionalText(500),
  notes: optionalText(2000),
  tags: z.array(z.string().trim().max(40)).max(30).optional().default([])
});
export const customerUpdateSchema = customerCreateSchema.partial();

export const paymentSchema = z.object({
  amount: z.coerce.number().finite().positive('金额必须大于 0').max(1000000),
  method: z.enum(PAYMENT_METHODS).default('other'),
  note: z.string().trim().max(500).optional().default(''),
  receiptRef: z.string().trim().max(300).optional().default(''),
  paidAt: z.string().trim().max(40).optional(),
  appointmentId: z.string().trim().max(80).nullable().optional()
});

export const mergeSchema = z.object({
  sourceId: z.string().trim().min(1),
  targetId: z.string().trim().min(1)
});

export const callCreateSchema = z.object({
  contactName: text(60).min(1, '请填写联系人'),
  phone: phoneSchema,
  calledAt: z.string().trim().max(40).optional(),
  direction: z.enum(['inbound', 'outbound']).default('inbound'),
  status: z.enum(CALL_STATUSES).default('completed'),
  durationSeconds: z.coerce.number().int().min(0).max(86400).optional().default(0),
  transcript: z.string().max(20000).optional().default(''),
  aiSummary: z.string().max(2000).optional().default(''),
  aiTags: z.array(z.string()).optional().default([]),
  aiExtracted: z.record(z.any()).optional().default({}),
  keywords: z.array(z.any()).optional().default([]),
  sentiment: z.string().max(40).optional().default(''),
  scenario: z.enum(SCENARIOS).optional().default('reservation'),
  followUp: z.boolean().optional().default(false),
  notes: z.string().trim().max(2000).optional().default(''),
  appointmentId: z.string().trim().max(80).nullable().optional(),
  customerId: z.string().trim().max(80).nullable().optional(),
  isSimulated: z.boolean().optional().default(false)
});
export const callUpdateSchema = callCreateSchema.partial();

export const simulateIncomingSchema = z.object({
  phone: phoneSchema,
  contactName: z.string().trim().max(60).optional(),
  scenario: z.enum(SCENARIOS).optional().default('reservation')
});

export const callAppointmentSchema = appointmentCreateSchema.partial().extend({
  overrideConflict: z.boolean().optional().default(false)
});

export const walkInCreateSchema = z.object({
  name: text(60).min(1, '请填写姓名'),
  phone: optionalPhoneSchema,
  date: dateSchema,
  time: timeSchema,
  partySize: z.coerce.number().int().min(1).max(50),
  tableId: z.string().trim().max(80).nullable().optional(),
  notes: optionalText(1000),
  status: z.enum(['waiting', 'seated', 'converted', 'cancelled']).default('waiting')
});
export const walkInUpdateSchema = walkInCreateSchema.partial();

export const areaSchema = z.object({ name: text(60).min(1), sortOrder: z.coerce.number().int().optional().default(0) });
export const tableSchema = z.object({
  name: text(40).min(1),
  areaId: z.string().trim().max(80).nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(100),
  shape: z.enum(['square', 'round', 'rectangle']).optional().default('square'),
  x: z.coerce.number().int().min(0).max(50).optional().default(0),
  y: z.coerce.number().int().min(0).max(50).optional().default(0),
  status: z.enum(['available', 'cleaning', 'disabled']).optional().default('available'),
  comboGroup: z.string().trim().max(40).optional().default(''),
  active: z.boolean().optional().default(true)
});
export const tableUpdateSchema = tableSchema.partial();
export const comboSchema = z.object({
  name: text(60).min(1),
  tableIds: z.array(z.string().trim().min(1)).min(2, '组合包间至少需要选择两张桌台'),
  capacity: z.coerce.number().int().min(1).max(200).optional(),
  notes: z.string().trim().max(500).optional().default(''),
  active: z.boolean().optional().default(true)
});

export const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, '用户名只能包含字母、数字、点、下划线或短横线'),
  displayName: text(60).min(1),
  password: z.string().min(10, '密码至少 10 个字符').max(200),
  role: z.enum(ROLES).default('agent'),
  active: z.boolean().optional().default(true)
});
export const userUpdateSchema = z.object({
  displayName: text(60).min(1).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(10).max(200).optional()
});

export const settingsSchema = z.record(z.any());

export const importCsvSchema = z.object({ type: z.enum(['customers', 'appointments', 'calls']), content: z.string().min(1).max(5_000_000) });
export const clearSchema = z.object({ scope: z.enum(['appointments', 'calls', 'customers', 'walkins', 'notifications', 'all']) });
export const backupRestoreSchema = z.object({ filename: z.string().trim().min(1) });

export const feishuSyncSchema = z.object({
  direction: z.enum(['pull', 'push', 'both']).default('pull')
});
