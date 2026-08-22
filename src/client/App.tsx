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
		await fetch('/api/auth/logout', { method: 'POST' });
		setAuthState('required');
		setServices([]);
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

	if (authState === 'checking') {
		return <div className="auth-screen"><div className="auth-panel"><div className="brand-mark">J</div><p className="eyebrow">APPLICATION SCAFFOLD</p><h1>检查登录状态</h1></div></div>;
	}

	if (authState === 'required') {
		return (
			<div className="auth-screen">
				<form className="auth-panel" onSubmit={authenticate}>
					<div className="brand-mark">J</div>
					<p className="eyebrow">PRIVATE WORKSPACE</p>
					<h1>输入动态验证码</h1>
					<p>使用身份验证器中的 6 位 TOTP 验证码登录。</p>
					<label htmlFor="totp-code">6 位验证码</label>
					<input
						id="totp-code"
						className="totp-input"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="[0-9]{6}"
						maxLength={6}
						value={totpCode}
						onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
						placeholder="000000"
						autoFocus
					/>
					<button className="auth-submit" type="submit" disabled={authLoading || totpCode.length !== 6}>{authLoading ? '验证中' : '登录'}</button>
					{authError && <p className="auth-error">{authError}</p>}
				</form>
			</div>
		);
	}

	return (
		<div className="app-shell">
			<header className="topbar">
				<div className="brand-mark">J</div>
				<div>
					<p className="eyebrow">APPLICATION SCAFFOLD</p>
					<h1>统一服务工作台</h1>
				</div>
				<div className={`runtime-status ${apiStatus}`}>
					<span className="status-dot" />
					{apiStatus === 'ok' ? 'Worker 在线' : apiStatus === 'error' ? 'API 不可用' : '连接中'}
				</div>
				<button className="logout-button" type="button" onClick={logout}>退出</button>
			</header>

			<main>
				<section className="intro">
					<div>
						<p className="eyebrow">CF / HONO / VITE / REACT / DRIZZLE</p>
						<h2>把技术规范固化成可复用的开发起点。</h2>
						<p className="intro-copy">
							Cloudflare Worker 负责运行时和部署，Hono 管理 API，React 提供前端体验，Drizzle 统一 D1 数据访问。
						</p>
					</div>
					<div className="stack-panel">
						<span>运行环境</span>
						<strong>Cloudflare Workers</strong>
						<small>Vite dev server · HMR · workerd</small>
					</div>
				</section>

				<section className="section-heading">
					<div>
						<p className="eyebrow">MIGRATION BOARD</p>
						<h3>服务迁移清单</h3>
					</div>
					<span className="count-label">{services.length || 3} 个服务</span>
				</section>

				<div className="service-grid">
					{services.map((service, index) => (
						<article className="service-card" key={service.id}>
							<div className="card-topline">
								<span className="service-index">0{index + 1}</span>
								<span className={`status-badge ${service.status}`}>{statusLabel[service.status]}</span>
							</div>
							<h4>{service.name}</h4>
							<p className="service-stack">{service.stack}</p>
							<div className="next-step">
								<span>下一步</span>
								<strong>{service.nextStep}</strong>
							</div>
						</article>
					))}
				</div>

				<section className="database-lab">
					<div className="database-copy">
						<p className="eyebrow">D1 DATABASE LAB</p>
						<h3>数据库读写验证</h3>
						<p>使用同一个 API 完成 Drizzle upsert 和查询，开发环境的数据持久化在本地 Wrangler 状态目录。</p>
					</div>
					<div className="database-controls">
						<label htmlFor="database-value">测试值</label>
						<div className="database-input-row">
							<input
								id="database-value"
								value={databaseValue}
								onChange={(event) => setDatabaseValue(event.target.value)}
							/>
							<button type="button" onClick={writeDatabase} disabled={databaseStatus === 'saving'}>写入</button>
							<button className="secondary-button" type="button" onClick={readDatabase} disabled={databaseStatus === 'saving'}>读取</button>
						</div>
						<div className={`database-result ${databaseStatus}`}>
							<span>{databaseStatus === 'saving' ? '执行中' : databaseStatus === 'error' ? '读写失败' : savedSetting ? '读取成功' : '尚未读取'}</span>
							<strong>{savedSetting ? `${savedSetting.key} = ${savedSetting.value}` : 'app_settings'}</strong>
						</div>
					</div>
				</section>

				<section className="architecture">
					<div>
						<p className="eyebrow">PROJECT SHAPE</p>
						<h3>清晰的边界，低摩擦的迁移。</h3>
					</div>
					<div className="architecture-flow">
						<span>React client</span><i>→</i><span>Hono API</span><i>→</i><span>D1 / R2 / KV</span>
					</div>
				</section>
			</main>
		</div>
	);
}

export default App;
