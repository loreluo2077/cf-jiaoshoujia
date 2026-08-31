import { useRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/client/lib/utils';

type InputOTPProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
	value: string;
	onChange: (value: string) => void;
	maxLength?: number;
};

export const InputOTP = ({ value, onChange, maxLength = 6, disabled, className, ...props }: InputOTPProps) => {
	const ref = useRef<HTMLInputElement>(null);
	return (
		<div className={cn('otp-control', className)} onClick={() => ref.current?.focus()}>
			<input
				ref={ref}
				value={value}
				onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, maxLength))}
				maxLength={maxLength}
				disabled={disabled}
				{...props}
			/>
			<div className="otp-group">
				{Array.from({ length: maxLength }, (_, index) => (
					<span className={cn('otp-slot', index === value.length && 'otp-slot-active')} key={index}>
						{value[index] ?? ''}
					</span>
				))}
			</div>
		</div>
	);
};
