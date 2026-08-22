import {
	Alert,
	Button,
	Card,
	Chip,
	Input,
	InputOTP,
	Label,
	ProgressBar,
	REGEXP_ONLY_DIGITS,
	Spinner,
	Table,
	TextField,
} from '@heroui/react';
import {
	ArrowDownToLine,
	ArrowRight,
	ArrowUpFromLine,
	CheckCircle2,
	CircleDashed,
	Cloud,
	Database,
	Layers3,
	LoaderCircle,
	LogOut,
	RefreshCw,
	ShieldCheck,
	Timer,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

type Service = {
	id: string;
	name: string;
	stack: string;
	status: 'planned' | 'migrating' | 'ready';
	nextStep: string;
};

type Setting = {
	key: string;
	value: string;
	updatedAt: string;
};

type AuthState = 'checking' | 'required' | 'authenticated';

const statusLabel: Record<Service['status'], string> = {
	planned: '待迁移',
	migrating: '迁移中',
	ready: '已完成',
};

const statusAppearance = {
	planned: { color: 'default', icon: CircleDashed },
	migrating: { color: 'warning', icon: Timer },
	ready: { color: 'success', icon: CheckCircle2 },
} as const;

function App() {
	const [services, setServices] = useState<Service[]>([]);
	const [authState, setAuthState] = useState<AuthState>('checking');
	const [totpCode, setTotpCode] = useState('');
	const [authError, setAuthError] = useState('');
	const [authLoading, setAuthLoading] = useState(false);
	const [apiStatus, setApiStatus] = useState<'loading' | 'ok' | 'error'>('loading');
	const [databaseValue, setDatabaseValue] = useState('Hello D1');
	const [savedSetting, setSavedSetting] = useState<Setting | null>(null);
	const [databaseStatus, setDatabaseStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

	const loadApplication = async () => {
		try {
			const response = await fetch('/api/services');
			if (!response.ok) throw new Error('services failed');
			const serviceResponse = (await response.json()) as { services: Service[] };
			setServices(serviceResponse.services);
			setApiStatus('ok');
		} catch {
			setApiStatus('error');
		}
	};

	const authenticate = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setAuthError('');
		setAuthLoading(true);
		try {
			const response = await fetch('/api/auth/totp', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code: totpCode }),
			});
			if (!response.ok) throw new Error('invalid code');
			setAuthState('authenticated');
			setTotpCode('');
			await loadApplication();
		} catch {
			setAuthError('验证码无效或认证服务未配置');
		} finally {
			setAuthLoading(false);
		}
	};

	const logout = async () => {
		const response = await fetch('/api/auth/logout', { method: 'POST' });
		const { authenticated } = await response.json() as { authenticated: boolean };
		setAuthState(authenticated ? 'authenticated' : 'required');
		if (!authenticated) setServices([]);
	};

	const readDatabase = async () => {
		setDatabaseStatus('saving');
		try {
			const response = await fetch('/api/settings?key=database-demo');
			if (!response.ok) throw new Error('database read failed');
			const body = (await response.json()) as { settings: Setting[] };
			setSavedSetting(body.settings[0] ?? null);
			if (body.settings[0]) setDatabaseValue(body.settings[0].value);
			setDatabaseStatus('saved');
		} catch {
			setDatabaseStatus('error');
		}
	};

	const writeDatabase = async () => {
		setDatabaseStatus('saving');
		try {
			const response = await fetch('/api/settings/database-demo', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ value: databaseValue }),
			});
			if (!response.ok) throw new Error('database write failed');
			const body = (await response.json()) as { setting: Setting };
			setSavedSetting(body.setting);
			setDatabaseStatus('saved');
		} catch {
			setDatabaseStatus('error');
		}
	};

	useEffect(() => {
		fetch('/api/auth/session')
			.then((response) => response.json() as Promise<{ authenticated: boolean }>)
			.then(({ authenticated }) => {
				setAuthState(authenticated ? 'authenticated' : 'required');
				if (authenticated) void loadApplication();
			})
			.catch(() => setAuthState('required'));
	}, []);

	const completedServices = services.filter((service) => service.status === 'ready').length;
	const activeServices = services.filter((service) => service.status === 'migrating').length;
	const migrationProgress = services.length
		? Math.round(services.reduce((total, service) => total + (service.status === 'ready' ? 1 : service.status === 'migrating' ? 0.5 : 0), 0) / services.length * 100)
		: 0;

	if (authState === 'checking') {
		return (
			<div className="auth-screen">
				<Spinner size="lg" />
				<p>正在检查登录状态</p>
			</div>
		);
	}

	if (authState === 'required') {
		return (
			<div className="auth-screen">
				<form onSubmit={authenticate}>
					<Card className="auth-panel">
						<div className="brand-mark">J</div>
						<Card.Header>
							<Card.Title>输入动态验证码</Card.Title>
							<Card.Description>使用身份验证器中的 6 位 TOTP 验证码登录。</Card.Description>
						</Card.Header>
						<Card.Content className="auth-content">
							<Label htmlFor="totp-code">6 位验证码</Label>
							<InputOTP
								id="totp-code"
								aria-label="6 位验证码"
								className="totp-input"
								autoComplete="one-time-code"
								pattern={REGEXP_ONLY_DIGITS}
								maxLength={6}
								value={totpCode}
								onChange={(value) => {
									setTotpCode(value);
									setAuthError('');
								}}
								isDisabled={authLoading}
								isInvalid={Boolean(authError)}
								autoFocus
							>
								<InputOTP.Group className="otp-group">
									{Array.from({ length: 6 }, (_, index) => <InputOTP.Slot className="otp-slot" index={index} key={index} />)}
								</InputOTP.Group>
							</InputOTP>
							{authError && <p className="auth-error" role="alert">{authError}</p>}
						</Card.Content>
						<Card.Footer>
							<Button type="submit" variant="primary" fullWidth isDisabled={authLoading || totpCode.length !== 6}>
								{authLoading && <Spinner size="sm" />}
								{authLoading ? '验证中' : '登录'}
							</Button>
						</Card.Footer>
					</Card>
				</form>
			</div>
		);
	}

	return (
		<div className="app-shell">
			<header className="topbar">
				<div className="topbar-inner">
					<div className="brand-lockup">
						<div className="brand-mark">J</div>
						<div>
							<strong>Jiaoshoujia</strong>
							<span>Application Scaffold</span>
						</div>
					</div>
					<Chip color={apiStatus === 'ok' ? 'success' : apiStatus === 'error' ? 'danger' : 'default'} variant="soft" size="sm">
						<span className="status-dot" />
						<Chip.Label>{apiStatus === 'ok' ? 'Worker 在线' : apiStatus === 'error' ? 'API 不可用' : '连接中'}</Chip.Label>
					</Chip>
					<Button aria-label="退出登录" variant="ghost" size="sm" onPress={logout}>
						<LogOut size={16} />
						<span className="logout-label">退出</span>
					</Button>
				</div>
			</header>

			<main className="workspace">
				<section className="page-heading">
					<div>
						<p className="eyebrow">OVERVIEW</p>
						<h1>开发基线</h1>
						<p>Cloudflare Workers、Hono、React、HeroUI 与 Drizzle 的统一运行状态。</p>
					</div>
					<Button variant="outline" size="sm" onPress={loadApplication}>
						<RefreshCw size={15} />
						刷新状态
					</Button>
				</section>

				<Alert status={apiStatus === 'ok' ? 'success' : apiStatus === 'error' ? 'danger' : 'default'}>
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{apiStatus === 'ok' ? '本地开发环境已就绪' : apiStatus === 'error' ? 'Worker API 连接失败' : '正在连接 Worker'}</Alert.Title>
						<Alert.Description>
							{apiStatus === 'ok' ? '前端、Hono API 与 D1 binding 工作正常。' : apiStatus === 'error' ? '请检查 Vite Worker 日志和本地 bindings。' : '正在读取服务迁移状态。'}
						</Alert.Description>
					</Alert.Content>
				</Alert>

				<section className="metric-grid" aria-label="技术栈状态">
					<Card className="metric-card">
						<Cloud className="metric-icon" size={20} />
						<Card.Header>
							<Card.Description>运行时</Card.Description>
							<Card.Title>Cloudflare Workers</Card.Title>
						</Card.Header>
						<Card.Footer>workerd · Vite HMR</Card.Footer>
					</Card>
					<Card className="metric-card">
						<Layers3 className="metric-icon" size={20} />
						<Card.Header>
							<Card.Description>应用框架</Card.Description>
							<Card.Title>Hono + React 19</Card.Title>
						</Card.Header>
						<Card.Footer>HeroUI v3 · Tailwind v4</Card.Footer>
					</Card>
					<Card className="metric-card">
						<Database className="metric-icon" size={20} />
						<Card.Header>
							<Card.Description>数据层</Card.Description>
							<Card.Title>D1 + Drizzle</Card.Title>
						</Card.Header>
						<Card.Footer>SQLite migrations</Card.Footer>
					</Card>
					<Card className="metric-card">
						<ShieldCheck className="metric-icon" size={20} />
						<Card.Header>
							<Card.Description>认证</Card.Description>
							<Card.Title>TOTP + Token</Card.Title>
						</Card.Header>
						<Card.Footer>12 小时签名会话</Card.Footer>
					</Card>
				</section>

				<div className="dashboard-grid">
					<section className="table-section">
						<div className="section-heading">
							<div>
								<p className="eyebrow">MIGRATION</p>
								<h2>服务迁移清单</h2>
							</div>
							<Chip variant="secondary" size="sm">{services.length || 3} 个服务</Chip>
						</div>
						<Table variant="secondary">
							<Table.ScrollContainer>
								<Table.Content aria-label="服务迁移清单" className="min-w-[720px]">
									<Table.Header>
										<Table.Column isRowHeader>服务</Table.Column>
										<Table.Column>原技术栈</Table.Column>
										<Table.Column>状态</Table.Column>
										<Table.Column>下一步</Table.Column>
									</Table.Header>
									<Table.Body>
										{services.map((service) => {
											const appearance = statusAppearance[service.status];
											const StatusIcon = appearance.icon;
											return (
												<Table.Row key={service.id}>
													<Table.Cell><strong>{service.name}</strong></Table.Cell>
													<Table.Cell><span className="stack-text">{service.stack}</span></Table.Cell>
													<Table.Cell>
														<Chip color={appearance.color} variant="soft" size="sm">
															<StatusIcon size={12} />
															<Chip.Label>{statusLabel[service.status]}</Chip.Label>
														</Chip>
													</Table.Cell>
													<Table.Cell><span className="next-step-text">{service.nextStep}</span></Table.Cell>
												</Table.Row>
											);
										})}
									</Table.Body>
								</Table.Content>
							</Table.ScrollContainer>
						</Table>
					</section>

					<Card className="migration-card" variant="secondary">
						<Card.Header>
							<Card.Description>整体进度</Card.Description>
							<Card.Title>{migrationProgress}%</Card.Title>
						</Card.Header>
						<Card.Content>
							<ProgressBar aria-label="服务迁移进度" value={migrationProgress}>
								<ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
							</ProgressBar>
							<div className="migration-counts">
								<div><strong>{completedServices}</strong><span>已完成</span></div>
								<div><strong>{activeServices}</strong><span>进行中</span></div>
								<div><strong>{services.length - completedServices - activeServices}</strong><span>待迁移</span></div>
							</div>
						</Card.Content>
						<Card.Footer>迁移状态由 `/api/services` 提供</Card.Footer>
					</Card>
				</div>

				<Card className="database-card">
					<Card.Header>
						<Card.Description>D1 DATABASE LAB</Card.Description>
						<Card.Title>数据库读写验证</Card.Title>
					</Card.Header>
					<Card.Content className="database-content">
						<TextField fullWidth name="database-value" variant="secondary" value={databaseValue} onChange={setDatabaseValue}>
							<Label>测试值</Label>
							<Input placeholder="输入要写入 D1 的值" />
						</TextField>
						<div className="database-actions">
							<Button variant="primary" onPress={writeDatabase} isDisabled={databaseStatus === 'saving' || !databaseValue.trim()}>
								{databaseStatus === 'saving' ? <LoaderCircle className="spin" size={16} /> : <ArrowUpFromLine size={16} />}
								写入
							</Button>
							<Button variant="outline" onPress={readDatabase} isDisabled={databaseStatus === 'saving'}>
								<ArrowDownToLine size={16} />
								读取
							</Button>
						</div>
						<div className={`database-result ${databaseStatus}`}>
							<div>
								<span>{databaseStatus === 'saving' ? '执行中' : databaseStatus === 'error' ? '读写失败' : savedSetting ? '读取成功' : '等待操作'}</span>
								<strong>{savedSetting ? `${savedSetting.key} = ${savedSetting.value}` : 'app_settings / database-demo'}</strong>
							</div>
							<Database size={18} />
						</div>
					</Card.Content>
				</Card>

				<section className="pipeline-section">
					<div>
						<p className="eyebrow">REQUEST PIPELINE</p>
						<h2>统一请求链路</h2>
					</div>
					<div className="pipeline-flow">
						{['React + HeroUI', 'Hono API', 'Cloudflare bindings', 'D1 / R2 / KV'].map((item, index) => (
							<div className="pipeline-item" key={item}>
								<Chip variant={index === 0 ? 'primary' : 'secondary'}>{item}</Chip>
								{index < 3 && <ArrowRight aria-hidden="true" size={15} />}
							</div>
						))}
					</div>
				</section>
			</main>
		</div>
	);
}

export default App;
