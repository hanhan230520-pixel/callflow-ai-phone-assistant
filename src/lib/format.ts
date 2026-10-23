import { format, isValid, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type { AppointmentSource, AppointmentStatus, CustomerTier } from '../types';

export const STATUS_META: Record<AppointmentStatus, { label: string; tone: string }> = {
  pending: { label: '待确认', tone: 'amber' },
  confirmed: { label: '已确认', tone: 'indigo' },
  seated: { label: '已到店', tone: 'green' },
  completed: { label: '已完成', tone: 'slate' },
  no_show: { label: '未到店', tone: 'red' },
  cancelled: { label: '已取消', tone: 'muted' }
};

export const SOURCE_META: Record<AppointmentSource, string> = {
  phone: '电话预约',
  walk_in: '到店预约',
  online: '线上渠道',
  referral: '客户推荐',
  other: '其他'
};

export const TIER_META: Record<CustomerTier, { label: string; tone: string }> = {
  new: { label: '新客', tone: 'blue' },
  regular: { label: '常客', tone: 'violet' },
  vip: { label: 'VIP', tone: 'gold' }
};

export const STATUS_ORDER: AppointmentStatus[] = [
  'pending', 'confirmed', 'seated', 'completed', 'no_show', 'cancelled'
];

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  if (digits.length > 6) return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
  return digits || '—';
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function toDate(value: string): Date {
  const date = value.includes('T') ? new Date(value) : parseISO(value);
  return isValid(date) ? date : new Date();
}

export function formatDate(value: string, pattern = 'M月d日'): string {
  return format(toDate(value), pattern, { locale: zhCN });
}

export function formatWeekday(value: string): string {
  return format(toDate(value), 'EEEE', { locale: zhCN });
}

export function formatDateTime(value: string, pattern = 'M月d日 HH:mm'): string {
  return format(toDate(value), pattern, { locale: zhCN });
}

export function todayString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function initials(name: string): string {
  return name.replace(/\s+/g, '').slice(0, 1) || '客';
}

export function avatarTone(name: string): number {
  return Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0) % 6;
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '未记录';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

export function requestGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function localDateTimeValue(value = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function humanStatusFlow(status: AppointmentStatus): string {
  switch (status) {
    case 'pending': return '等待确认，建议尽快回电或发送确认信息';
    case 'confirmed': return '已确认，等待客人到店';
    case 'seated': return '客人已到店，服务进行中';
    case 'completed': return '本次预约已完成';
    case 'no_show': return '客人未到店，可记录原因并跟进';
    case 'cancelled': return '预约已取消，桌台已释放';
  }
}
