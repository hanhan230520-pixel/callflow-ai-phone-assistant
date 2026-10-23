import type { ReactNode } from 'react';
import { cn } from '../lib/format';

export function Field({
  label, htmlFor, hint, error, required, children, className
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('field', className)}>
      <label htmlFor={htmlFor} className="field__label">
        {label}{required && <span className="field__required">*</span>}
      </label>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}
