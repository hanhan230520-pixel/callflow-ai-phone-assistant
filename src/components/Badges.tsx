import type { AppointmentStatus, CustomerTier } from '../types';
import { STATUS_META, TIER_META, cn } from '../lib/format';

export function StatusBadge({ status, withDot = true }: { status: AppointmentStatus; withDot?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn('status-badge', `tone-${meta.tone}`)}>
      {withDot && <span className="status-badge__dot" />}
      {meta.label}
    </span>
  );
}

export function TierBadge({ tier }: { tier: CustomerTier }) {
  const meta = TIER_META[tier];
  return <span className={cn('tier-badge', `tier-${meta.tone}`)}>{meta.label}</span>;
}

export function DemoBadge({ subtle = false }: { subtle?: boolean }) {
  return <span className={cn('demo-badge', subtle && 'demo-badge--subtle')}>演示数据</span>;
}
