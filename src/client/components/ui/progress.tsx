import { cn } from '@/client/lib/utils';
export const Progress = ({ value = 0, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: number }) => <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className={cn('ui-progress', className)} {...props}><div className="progress__fill" style={{ width: `${value}%` }} /></div>;
