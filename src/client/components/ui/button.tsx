import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/client/lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost'; size?: 'sm' | 'default' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'primary', size = 'default', ...props }, ref) => (
	<button ref={ref} className={cn('ui-button', `ui-button-${variant}`, size === 'sm' && 'ui-button-sm', className)} {...props} />
));
Button.displayName = 'Button';
