import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/client/lib/utils';
type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: 'primary' | 'secondary' | 'soft'; color?: 'default' | 'success' | 'warning' | 'danger'; size?: 'sm' | 'default' };
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant = 'secondary', color = 'default', size = 'default', ...props }, ref) => <span ref={ref} className={cn('ui-badge', `badge-${variant}`, `badge-${color}`, size === 'sm' && 'ui-badge-sm', className)} {...props} />);
Badge.displayName = 'Badge';
