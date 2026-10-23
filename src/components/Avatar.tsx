import { avatarTone, cn, initials } from '../lib/format';

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cn('avatar', `avatar--${size}`, `avatar--tone-${avatarTone(name)}`, className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
