import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card';
import { Button } from '@/client/components/ui/button';
import { InputOTP } from '@/client/components/ui/input-otp';
import { Alert, AlertContent, AlertDescription, AlertIndicator } from '@/client/components/ui/alert';

interface LoginPageProps {
	onLogin: (code: string) => Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
	const [code, setCode] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		setLoading(true);
		try {
			await onLogin(code);
			setCode('');
		} catch {
			setError('验证码无效或认证服务未配置');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
						<ShieldCheck className="h-6 w-6 text-blue-600" />
					</div>
					<CardTitle>管理后台登录</CardTitle>
					<CardDescription>请输入 6 位 TOTP 验证码</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="flex justify-center">
							<InputOTP
								value={code}
								onChange={setCode}
								maxLength={6}
								pattern="^[0-9]+$"
							/>
						</div>
						{error && (
							<Alert status="danger">
								<AlertIndicator />
								<AlertContent>
									<AlertDescription>{error}</AlertDescription>
								</AlertContent>
							</Alert>
						)}
						<Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
							{loading ? '验证中...' : '登录'}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
