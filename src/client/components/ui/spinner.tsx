import { LoaderCircle } from 'lucide-react';
import { cn } from '@/client/lib/utils';
export const Spinner = ({ className, size = 'default' }: { className?: string; size?: 'sm' | 'default' | 'lg' }) => (
	<LoaderCircle
		aria-label="加载中"
		className={cn('spin', size === 'sm' ? 'spinner-sm' : size === 'lg' ? 'spinner-lg' : 'spinner-default', className)}
	/>
);
