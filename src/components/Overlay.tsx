import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/format';

function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);
}

export function Drawer({
  open,
  onClose,
  children,
  label,
  width = 'wide'
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  width?: 'normal' | 'wide';
}) {
  useOverlay(open, onClose);
  return (
    <div className={cn('overlay', open && 'overlay--open')} aria-hidden={!open}>
      <button type="button" className="overlay__scrim" aria-label="关闭面板" onClick={onClose} tabIndex={open ? 0 : -1} />
      <section className={cn('drawer', `drawer--${width}`)} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'normal'
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'small' | 'normal';
}) {
  useOverlay(open, onClose);
  return (
    <div className={cn('overlay overlay--center', open && 'overlay--open')} aria-hidden={!open}>
      <button type="button" className="overlay__scrim" aria-label="关闭对话框" onClick={onClose} tabIndex={open ? 0 : -1} />
      <section className={cn('dialog', `dialog--${size}`)} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog__header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </section>
    </div>
  );
}

export function DrawerHeader({
  title,
  subtitle,
  onClose
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <header className="drawer__header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
        <X size={18} />
      </button>
    </header>
  );
}
