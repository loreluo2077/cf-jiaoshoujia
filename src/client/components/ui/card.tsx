import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/client/lib/utils';
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
	<section ref={ref} className={cn('ui-card', className)} {...props} />
));
Card.displayName = 'Card';
export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn('card__header', className)} {...props} />
);
export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
	<h3 className={cn('card__title', className)} {...props} />
);
export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
	<p className={cn('card__description', className)} {...props} />
);
export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn('card__content', className)} {...props} />
);
export const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
	<div className={cn('card__footer', className)} {...props} />
);
