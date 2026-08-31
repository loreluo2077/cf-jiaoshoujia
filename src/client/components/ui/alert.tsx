import { type HTMLAttributes } from 'react';
import { cn } from '@/client/lib/utils';
export const Alert = ({
	className,
	status = 'default',
	...props
}: HTMLAttributes<HTMLDivElement> & { status?: 'default' | 'success' | 'danger' }) => (
	<div role="status" className={cn('ui-alert', `alert-${status}`, className)} {...props} />
);
export const AlertIndicator = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
	<span className={cn('alert__indicator', className)} aria-hidden="true" {...props} />
);
export const AlertContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn('alert__content', className)} {...props} />
);
export const AlertTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
	<h3 className={cn('alert__title', className)} {...props} />
);
export const AlertDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
	<p className={cn('alert__description', className)} {...props} />
);
