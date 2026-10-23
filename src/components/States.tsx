import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RotateCcw } from 'lucide-react';

export function PageLoader({ rows = 4 }: { rows?: number }) {
  return (
    <div className="panel skeleton-panel" aria-label="正在加载">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton skeleton--circle" />
          <span className="skeleton skeleton--long" />
          <span className="skeleton skeleton--short" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon || <Inbox size={22} />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state empty-state--error">
      <div className="empty-state__icon"><AlertTriangle size={22} /></div>
      <h3>无法加载内容</h3>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button button--secondary button--sm" onClick={onRetry}>
          <RotateCcw size={15} />重试
        </button>
      )}
    </div>
  );
}
