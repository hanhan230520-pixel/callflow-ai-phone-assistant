import { cn } from '../lib/format';

export function BrandMark({ size = 38, className }: { size?: number; className?: string }) {
  return (
    <div className={cn('brand-mark', className)} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <rect x="5" y="5" width="30" height="30" rx="8" stroke="currentColor" strokeWidth="2.4" />
        <path d="M12 13h16M12 19h7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M20 31c3.7 0 6.4-2.2 6.4-5 0-2-1.4-3-2.7-2.6-1.6.5-1.1 3-2.9 3-1.1 0-1.5-1-1.5-2.1" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('brand-lockup', compact && 'brand-lockup--compact')}>
      <BrandMark size={compact ? 34 : 38} />
      {!compact && (
        <div className="brand-copy">
          <strong>CallFlow</strong>
          <span>电话预约工作台</span>
        </div>
      )}
    </div>
  );
}
