import { useState, useEffect } from 'react';
import { RefreshCw, Plus, Edit, Trash2, Power, PowerOff, X, TestTube } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card';
import { Button } from '@/client/components/ui/button';
import { Badge } from '@/client/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableScrollContainer } from '@/client/components/ui/table';
import { Spinner } from '@/client/components/ui/spinner';
import { Alert, AlertContent, AlertDescription, AlertIndicator } from '@/client/components/ui/alert';
import type { Provider } from '@/client/types';

interface ProviderFormData {
	name: string;
	providerKey: string;
	supportedTypes: string;
	enabled: boolean;
	refundEnabled: boolean;
	sortOrder: number;
	// Alipay 配置
	alipay_appId?: string;
	alipay_privateKey?: string;
	alipay_publicKey?: string;
	alipay_gateway?: string;
	// WeChat Pay 配置
	wxpay_appId?: string;
	wxpay_mchId?: string;
	wxpay_privateKey?: string;
	wxpay_apiV3Key?: string;
	wxpay_certSerial?: string;
	wxpay_publicKey?: string;
	wxpay_apiBase?: string;
	// Stripe 配置
	stripe_secretKey?: string;
	stripe_webhookSecret?: string;
	// 迅虎支付配置
	xunhupay_appId?: string;
	xunhupay_appSecret?: string;
	xunhupay_apiBase?: string;
	// 通用配置
	generic_apiUrl?: string;
	generic_apiKey?: string;
	generic_apiSecret?: string;
}

const PROVIDER_TYPES = [
	{ value: 'alipay', label: '支付宝' },
	{ value: 'wxpay', label: '微信支付' },
	{ value: 'stripe', label: 'Stripe' },
	{ value: 'xunhupay', label: '迅虎支付' },
	{ value: 'generic', label: '通用渠道' },
];

export function ProvidersPage() {
	const [providers, setProviders] = useState<Provider[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [actionError, setActionError] = useState('');
	const [actionSuccess, setActionSuccess] = useState('');
	const [showDialog, setShowDialog] = useState(false);
	const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
	const [formData, setFormData] = useState<ProviderFormData>({
		name: '',
		providerKey: 'alipay',
		supportedTypes: '',
		enabled: true,
		refundEnabled: false,
		sortOrder: 0,
	});
	const [submitting, setSubmitting] = useState(false);
	const [showTestDialog, setShowTestDialog] = useState(false);
	const [testingProvider, setTestingProvider] = useState<Provider | null>(null);
	const [testAmount, setTestAmount] = useState('1.00');
	const [testPaymentType, setTestPaymentType] = useState('');
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<{ success: boolean; message: string; payUrl?: string } | null>(null);

	const fetchProviders = async () => {
		try {
			setLoading(true);
			setError('');
			const response = await fetch('/api/admin/providers');
			if (!response.ok) throw new Error('加载失败');
			const data = await response.json() as { providers: Provider[] };
			setProviders(data.providers || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : '加载支付渠道失败');
		} finally {
			setLoading(false);
		}
	};

	const toggleProvider = async (id: string, currentEnabled: boolean) => {
		try {
			setActionError('');
			setActionSuccess('');
			const response = await fetch(`/api/admin/providers/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ enabled: !currentEnabled }),
			});
			if (!response.ok) throw new Error('操作失败');
			setActionSuccess(`已${currentEnabled ? '禁用' : '启用'}支付渠道`);
			await fetchProviders();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : '操作失败');
		}
	};

	const deleteProvider = async (id: string) => {
		if (!confirm('确认删除此支付渠道？')) return;

		try {
			setActionError('');
			setActionSuccess('');
			const response = await fetch(`/api/admin/providers/${id}`, {
				method: 'DELETE',
			});
			if (!response.ok) throw new Error('删除失败');
			setActionSuccess('删除成功');
			await fetchProviders();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : '删除失败');
		}
	};

	const openTestDialog = (provider: Provider) => {
		setTestingProvider(provider);
		setTestAmount('1.00');
		setTestResult(null);

		// 根据渠道支持的支付类型设置默认值
		const supportedTypes = (provider.supportedTypes || '').split(',').map(t => t.trim()).filter(Boolean);
		if (supportedTypes.length > 0) {
			setTestPaymentType(supportedTypes[0]);
		} else {
			// 根据渠道类型推断默认支付类型
			if (provider.providerKey === 'alipay') {
				setTestPaymentType('alipay_direct');
			} else if (provider.providerKey === 'wxpay') {
				setTestPaymentType('wxpay_direct');
			} else {
				setTestPaymentType('alipay');
			}
		}

		setShowTestDialog(true);
	};

	const closeTestDialog = () => {
		setShowTestDialog(false);
		setTestingProvider(null);
		setTestResult(null);
	};

	const handleTestPayment = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!testingProvider) return;

		setTesting(true);
		setTestResult(null);

		try {
			const amount = parseFloat(testAmount);
			if (isNaN(amount) || amount <= 0) {
				throw new Error('请输入有效的金额');
			}

			// 调用测试支付接口
			const response = await fetch('/api/admin/payment-tests/downstream', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					amount,
					paymentType: testPaymentType,
					subject: `渠道测试 - ${testingProvider.name}`,
				}),
			});

			const data = await response.json() as { order?: { payUrl?: string; qrCode?: string }; error?: string };

			if (!response.ok) {
				throw new Error(data.error || '测试失败');
			}

			if (data.order?.payUrl) {
				setTestResult({
					success: true,
					message: '测试订单创建成功！',
					payUrl: data.order.payUrl,
				});
			} else if (data.order?.qrCode) {
				setTestResult({
					success: true,
					message: '测试订单创建成功！请扫描二维码支付',
				});
			} else {
				setTestResult({
					success: true,
					message: '测试订单创建成功！',
				});
			}
		} catch (err) {
			setTestResult({
				success: false,
				message: err instanceof Error ? err.message : '测试失败',
			});
		} finally {
			setTesting(false);
		}
	};

	const openAddDialog = () => {
		setEditingProvider(null);
		setFormData({
			name: '',
			providerKey: 'alipay',
			supportedTypes: '',
			enabled: true,
			refundEnabled: false,
			sortOrder: 0,
		});
		setShowDialog(true);
	};

	const openEditDialog = async (provider: Provider) => {
		try {
			const response = await fetch(`/api/admin/providers/${provider.id}`);
			if (!response.ok) throw new Error('加载失败');
			const data = await response.json() as { provider: Provider & { config: Record<string, unknown> } };
			setEditingProvider(provider);

			const config = data.provider.config || {};
			const newFormData: ProviderFormData = {
				name: data.provider.name,
				providerKey: data.provider.providerKey,
				supportedTypes: data.provider.supportedTypes || '',
				enabled: data.provider.enabled,
				refundEnabled: data.provider.refundEnabled || false,
				sortOrder: data.provider.sortOrder || 0,
			};

			// 根据渠道类型解析配置
			const providerKey = data.provider.providerKey;
			if (providerKey === 'alipay') {
				newFormData.alipay_appId = config.appId as string;
				newFormData.alipay_privateKey = config.privateKey as string;
				newFormData.alipay_publicKey = config.publicKey as string;
				newFormData.alipay_gateway = config.gateway as string;
			} else if (providerKey === 'wxpay') {
				newFormData.wxpay_appId = config.appId as string;
				newFormData.wxpay_mchId = config.mchId as string;
				newFormData.wxpay_privateKey = config.privateKey as string;
				newFormData.wxpay_apiV3Key = config.apiV3Key as string;
				newFormData.wxpay_certSerial = config.certSerial as string;
				newFormData.wxpay_publicKey = config.publicKey as string;
				newFormData.wxpay_apiBase = config.apiBase as string;
			} else if (providerKey === 'stripe') {
				newFormData.stripe_secretKey = config.secretKey as string;
				newFormData.stripe_webhookSecret = config.webhookSecret as string;
			} else if (providerKey === 'xunhupay') {
				newFormData.xunhupay_appId = config.appId as string;
				newFormData.xunhupay_appSecret = config.appSecret as string;
				newFormData.xunhupay_apiBase = config.apiBase as string;
			} else {
				newFormData.generic_apiUrl = config.apiUrl as string;
				newFormData.generic_apiKey = config.apiKey as string;
				newFormData.generic_apiSecret = config.apiSecret as string;
			}

			setFormData(newFormData);
			setShowDialog(true);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : '加载渠道信息失败');
		}
	};

	const closeDialog = () => {
		setShowDialog(false);
		setEditingProvider(null);
		setActionError('');
	};

	const buildConfigFromFormData = (): Record<string, unknown> => {
		const { providerKey } = formData;
		const config: Record<string, unknown> = {};

		if (providerKey === 'alipay') {
			if (formData.alipay_appId) config.appId = formData.alipay_appId;
			if (formData.alipay_privateKey) config.privateKey = formData.alipay_privateKey;
			if (formData.alipay_publicKey) config.publicKey = formData.alipay_publicKey;
			if (formData.alipay_gateway) config.gateway = formData.alipay_gateway;
		} else if (providerKey === 'wxpay') {
			if (formData.wxpay_appId) config.appId = formData.wxpay_appId;
			if (formData.wxpay_mchId) config.mchId = formData.wxpay_mchId;
			if (formData.wxpay_privateKey) config.privateKey = formData.wxpay_privateKey;
			if (formData.wxpay_apiV3Key) config.apiV3Key = formData.wxpay_apiV3Key;
			if (formData.wxpay_certSerial) config.certSerial = formData.wxpay_certSerial;
			if (formData.wxpay_publicKey) config.publicKey = formData.wxpay_publicKey;
			if (formData.wxpay_apiBase) config.apiBase = formData.wxpay_apiBase;
		} else if (providerKey === 'stripe') {
			if (formData.stripe_secretKey) config.secretKey = formData.stripe_secretKey;
			if (formData.stripe_webhookSecret) config.webhookSecret = formData.stripe_webhookSecret;
		} else if (providerKey === 'xunhupay') {
			if (formData.xunhupay_appId) config.appId = formData.xunhupay_appId;
			if (formData.xunhupay_appSecret) config.appSecret = formData.xunhupay_appSecret;
			if (formData.xunhupay_apiBase) config.apiBase = formData.xunhupay_apiBase;
		} else {
			if (formData.generic_apiUrl) config.apiUrl = formData.generic_apiUrl;
			if (formData.generic_apiKey) config.apiKey = formData.generic_apiKey;
			if (formData.generic_apiSecret) config.apiSecret = formData.generic_apiSecret;
		}

		return config;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);
		setActionError('');

		try {
			const config = buildConfigFromFormData();

			// 根据渠道类型自动设置支付类型
			let supportedTypes = formData.supportedTypes;
			if (formData.providerKey === 'alipay') {
				supportedTypes = 'alipay_direct';
			} else if (formData.providerKey === 'wxpay') {
				supportedTypes = 'wxpay_direct';
			} else if (formData.providerKey === 'stripe') {
				supportedTypes = 'stripe';
			}
			// xunhupay 和 generic 使用用户选择的值

			const url = editingProvider
				? `/api/admin/providers/${editingProvider.id}`
				: '/api/admin/providers';
			const method = editingProvider ? 'PATCH' : 'POST';

			const response = await fetch(url, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: formData.name,
					providerKey: formData.providerKey,
					supportedTypes,
					enabled: formData.enabled,
					refundEnabled: formData.refundEnabled,
					sortOrder: formData.sortOrder,
					config,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({})) as { error?: string };
				throw new Error(errorData.error || '操作失败');
			}

			setActionSuccess(editingProvider ? '更新成功' : '添加成功');
			closeDialog();
			await fetchProviders();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : '操作失败');
		} finally {
			setSubmitting(false);
		}
	};

	const renderConfigFields = () => {
		const { providerKey } = formData;

		if (providerKey === 'alipay') {
			return (
				<>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">App ID *</label>
						<input
							type="text"
							required
							value={formData.alipay_appId || ''}
							onChange={(e) => setFormData({ ...formData, alipay_appId: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="例如：2021001122334455"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">应用私钥 (Private Key) *</label>
						<textarea
							required
							rows={4}
							value={formData.alipay_privateKey || ''}
							onChange={(e) => setFormData({ ...formData, alipay_privateKey: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
							placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">支付宝公钥 (Public Key) *</label>
						<textarea
							required
							rows={4}
							value={formData.alipay_publicKey || ''}
							onChange={(e) => setFormData({ ...formData, alipay_publicKey: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
							placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">网关地址</label>
						<input
							type="text"
							value={formData.alipay_gateway || ''}
							onChange={(e) => setFormData({ ...formData, alipay_gateway: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="https://openapi.alipay.com/gateway.do"
						/>
					</div>
				</>
			);
		}

		if (providerKey === 'wxpay') {
			return (
				<>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">App ID *</label>
						<input
							type="text"
							required
							value={formData.wxpay_appId || ''}
							onChange={(e) => setFormData({ ...formData, wxpay_appId: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="例如：wx1234567890abcdef"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">商户号 (Mch ID) *</label>
						<input
							type="text"
							required
							value={formData.wxpay_mchId || ''}
							onChange={(e) => setFormData({ ...formData, wxpay_mchId: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="例如：1234567890"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">商户私钥 (Private Key) *</label>
						<textarea
							required
							rows={4}
							value={formData.wxpay_privateKey || ''}
							onChange={(e) => setFormData({ ...formData, wxpay_privateKey: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
							placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">API V3 密钥 *</label>
						<input
							type="text"
							required
							value={formData.wxpay_apiV3Key || ''}
							onChange={(e) => setFormData({ ...formData, wxpay_apiV3Key: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="32位密钥"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">证书序列号 (Cert Serial) *</label>
						<input
							type="text"
							required
							value={formData.wxpay_certSerial || ''}
							onChange={(e) => setFormData({ ...formData, wxpay_certSerial: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="商户证书序列号"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">微信支付平台公钥 *</label>
						<textarea
							required
							rows={4}
							value={formData.wxpay_publicKey || ''}
							onChange={(e) => setFormData({ ...formData, wxpay_publicKey: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
							placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">API 地址</label>
						<input
							type="text"
							value={formData.wxpay_apiBase || ''}
							onChange={(e) => setFormData({ ...formData, wxpay_apiBase: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="https://api.mch.weixin.qq.com"
						/>
					</div>
				</>
			);
		}

		if (providerKey === 'stripe') {
			return (
				<>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">Secret Key *</label>
						<input
							type="password"
							required
							value={formData.stripe_secretKey || ''}
							onChange={(e) => setFormData({ ...formData, stripe_secretKey: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
							placeholder="sk_live_..."
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">Webhook Secret</label>
						<input
							type="password"
							value={formData.stripe_webhookSecret || ''}
							onChange={(e) => setFormData({ ...formData, stripe_webhookSecret: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
							placeholder="whsec_..."
						/>
					</div>
				</>
			);
		}

		if (providerKey === 'xunhupay') {
			return (
				<>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">App ID *</label>
						<input
							type="text"
							required
							value={formData.xunhupay_appId || ''}
							onChange={(e) => setFormData({ ...formData, xunhupay_appId: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">App Secret *</label>
						<input
							type="password"
							required
							value={formData.xunhupay_appSecret || ''}
							onChange={(e) => setFormData({ ...formData, xunhupay_appSecret: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">API 地址</label>
						<input
							type="text"
							value={formData.xunhupay_apiBase || ''}
							onChange={(e) => setFormData({ ...formData, xunhupay_apiBase: e.target.value })}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="https://api.xunhupay.com"
						/>
					</div>
				</>
			);
		}

		// 通用渠道
		return (
			<>
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">API URL *</label>
					<input
						type="text"
						required
						value={formData.generic_apiUrl || ''}
						onChange={(e) => setFormData({ ...formData, generic_apiUrl: e.target.value })}
						className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="https://api.example.com"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
					<input
						type="text"
						value={formData.generic_apiKey || ''}
						onChange={(e) => setFormData({ ...formData, generic_apiKey: e.target.value })}
						className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
					<input
						type="password"
						value={formData.generic_apiSecret || ''}
						onChange={(e) => setFormData({ ...formData, generic_apiSecret: e.target.value })}
						className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			</>
		);
	};

	useEffect(() => {
		fetchProviders();
	}, []);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-gray-900">支付渠道配置</h1>
				<p className="text-gray-600 mt-2">管理支付渠道和配置</p>
			</div>

			{actionError && (
				<Alert status="danger">
					<AlertIndicator />
					<AlertContent>
						<AlertDescription>{actionError}</AlertDescription>
					</AlertContent>
				</Alert>
			)}

			{actionSuccess && (
				<Alert status="success">
					<AlertIndicator />
					<AlertContent>
						<AlertDescription>{actionSuccess}</AlertDescription>
					</AlertContent>
				</Alert>
			)}

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>支付渠道列表</CardTitle>
							<CardDescription>共 {providers.length} 个支付渠道</CardDescription>
						</div>
						<div className="flex gap-2">
							<Button onClick={fetchProviders} variant="outline" size="sm">
								<RefreshCw className="h-4 w-4 mr-2" />
								刷新
							</Button>
							<Button size="sm" onClick={openAddDialog}>
								<Plus className="h-4 w-4 mr-2" />
								添加渠道
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{loading ? (
						<div className="flex justify-center py-12">
							<Spinner size="lg" />
						</div>
					) : error ? (
						<div className="text-center py-12 text-red-600">{error}</div>
					) : providers.length === 0 ? (
						<div className="text-center py-12 text-gray-500">暂无支付渠道</div>
					) : (
						<TableScrollContainer>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>渠道标识</TableHead>
										<TableHead>渠道名称</TableHead>
										<TableHead>支持的支付方式</TableHead>
										<TableHead>状态</TableHead>
										<TableHead>创建时间</TableHead>
										<TableHead>更新时间</TableHead>
										<TableHead>操作</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{providers.map((provider) => (
										<TableRow key={provider.id}>
											<TableCell className="font-mono text-sm">{provider.providerKey}</TableCell>
											<TableCell className="font-medium">{provider.name}</TableCell>
											<TableCell>
												<div className="flex flex-wrap gap-1">
													{(provider.supportedTypes || '').split(',').map(t => t.trim()).filter(Boolean).map(type => (
														<Badge key={type} color="default" className="text-xs">
															{type}
														</Badge>
													))}
												</div>
											</TableCell>
											<TableCell>
												{provider.enabled ? (
													<Badge color="success">
														<Power className="h-3 w-3 mr-1" />
														启用
													</Badge>
												) : (
													<Badge color="default">
														<PowerOff className="h-3 w-3 mr-1" />
														禁用
													</Badge>
												)}
											</TableCell>
											<TableCell className="text-sm text-gray-600">
												{new Date(provider.createdAt).toLocaleString('zh-CN')}
											</TableCell>
											<TableCell className="text-sm text-gray-600">
												{new Date(provider.updatedAt).toLocaleString('zh-CN')}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2">
													<Button
														variant="ghost"
														size="sm"
														onClick={() => toggleProvider(provider.id, provider.enabled)}
														title={provider.enabled ? '禁用' : '启用'}
													>
														{provider.enabled ? (
															<PowerOff className="h-4 w-4" />
														) : (
															<Power className="h-4 w-4" />
														)}
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => openTestDialog(provider)}
														title="测试支付"
													>
														<TestTube className="h-4 w-4 text-green-600" />
													</Button>
													<Button variant="ghost" size="sm" onClick={() => openEditDialog(provider)} title="编辑">
														<Edit className="h-4 w-4" />
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => deleteProvider(provider.id)}
														title="删除"
													>
														<Trash2 className="h-4 w-4 text-red-600" />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</TableScrollContainer>
					)}
				</CardContent>
			</Card>

			{showDialog && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
					<div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
						<div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
							<h2 className="text-xl font-bold">
								{editingProvider ? '编辑支付渠道' : '添加支付渠道'}
							</h2>
							<button onClick={closeDialog} className="text-gray-400 hover:text-gray-600">
								<X className="h-5 w-5" />
							</button>
						</div>
						<form onSubmit={handleSubmit} className="p-6 space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									渠道类型 * {editingProvider && <span className="text-gray-500 text-xs">(不可修改)</span>}
								</label>
								<select
									required
									disabled={!!editingProvider}
									value={formData.providerKey}
									onChange={(e) => setFormData({ ...formData, providerKey: e.target.value })}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
								>
									{PROVIDER_TYPES.map((type) => (
										<option key={type.value} value={type.value}>
											{type.label}
										</option>
									))}
								</select>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									渠道名称 *
								</label>
								<input
									type="text"
									required
									value={formData.name}
									onChange={(e) => setFormData({ ...formData, name: e.target.value })}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="例如：支付宝主渠道"
								/>
							</div>

							{/* 根据渠道类型显示不同的支付方式选择 */}
							{formData.providerKey === 'xunhupay' || formData.providerKey === 'generic' ? (
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-2">
										支持的支付类型 *
									</label>
									<div className="space-y-2">
										<label className="flex items-center gap-2">
											<input
												type="checkbox"
												checked={formData.supportedTypes.includes('alipay')}
												onChange={(e) => {
													const types = formData.supportedTypes.split(',').map(t => t.trim()).filter(Boolean);
													if (e.target.checked) {
												if (!types.includes('alipay')) types.push('alipay');
											} else {
												const index = types.indexOf('alipay');
												if (index > -1) types.splice(index, 1);
											}
											setFormData({ ...formData, supportedTypes: types.join(',') });
										}}
												className="rounded border-gray-300"
											/>
											<span className="text-sm text-gray-700">支付宝 (alipay)</span>
										</label>
										<label className="flex items-center gap-2">
											<input
												type="checkbox"
												checked={formData.supportedTypes.includes('wxpay')}
												onChange={(e) => {
													const types = formData.supportedTypes.split(',').map(t => t.trim()).filter(Boolean);
													if (e.target.checked) {
														if (!types.includes('wxpay')) types.push('wxpay');
													} else {
														const index = types.indexOf('wxpay');
														if (index > -1) types.splice(index, 1);
													}
													setFormData({ ...formData, supportedTypes: types.join(',') });
												}}
												className="rounded border-gray-300"
											/>
											<span className="text-sm text-gray-700">微信支付 (wxpay)</span>
										</label>
									</div>
									<p className="text-xs text-gray-500 mt-1">选择该渠道支持的支付方式</p>
								</div>
							) : (
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										支持的支付类型
									</label>
									<input
										type="text"
										disabled
										value={
											formData.providerKey === 'alipay' ? 'alipay_direct' :
											formData.providerKey === 'wxpay' ? 'wxpay_direct' :
											formData.providerKey === 'stripe' ? 'stripe' :
											''
										}
										className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
									/>
									<p className="text-xs text-gray-500 mt-1">该渠道自动匹配对应的支付类型</p>
								</div>
							)}

							<div className="border-t pt-4">
								<h3 className="text-sm font-medium text-gray-900 mb-3">渠道配置</h3>
								<div className="space-y-4">
									{renderConfigFields()}
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									排序顺序
								</label>
								<input
									type="number"
									value={formData.sortOrder}
									onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
								<p className="text-xs text-gray-500 mt-1">数字越小越靠前</p>
							</div>

							<div className="flex items-center gap-4">
								<label className="flex items-center gap-2">
									<input
										type="checkbox"
										checked={formData.enabled}
										onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
										className="rounded border-gray-300"
									/>
									<span className="text-sm font-medium text-gray-700">启用渠道</span>
								</label>

								<label className="flex items-center gap-2">
									<input
										type="checkbox"
										checked={formData.refundEnabled}
										onChange={(e) => setFormData({ ...formData, refundEnabled: e.target.checked })}
										className="rounded border-gray-300"
									/>
									<span className="text-sm font-medium text-gray-700">支持退款</span>
								</label>
							</div>

							<div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white">
								<Button type="button" variant="outline" onClick={closeDialog}>
									取消
								</Button>
								<Button type="submit" disabled={submitting}>
									{submitting ? <Spinner size="sm" className="mr-2" /> : null}
									{submitting ? '提交中...' : editingProvider ? '更新' : '添加'}
								</Button>
							</div>
						</form>
					</div>
				</div>
			)}

			{showTestDialog && testingProvider && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
					<div className="bg-white rounded-lg shadow-xl max-w-md w-full">
						<div className="flex items-center justify-between p-6 border-b">
							<h2 className="text-xl font-bold">测试支付渠道</h2>
							<button onClick={closeTestDialog} className="text-gray-400 hover:text-gray-600">
								<X className="h-5 w-5" />
							</button>
						</div>
						<form onSubmit={handleTestPayment} className="p-6 space-y-4">
							<div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
								<p className="text-sm text-blue-800">
									<span className="font-medium">渠道：</span>{testingProvider.name}
								</p>
								<p className="text-sm text-blue-800 mt-1">
									<span className="font-medium">类型：</span>{testingProvider.providerKey}
								</p>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									支付类型 *
								</label>
								<select
									required
									value={testPaymentType}
									onChange={(e) => setTestPaymentType(e.target.value)}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
								>
									{(testingProvider.supportedTypes || '').split(',').map(t => t.trim()).filter(Boolean).length > 0 ? (
										(testingProvider.supportedTypes || '').split(',').map(t => t.trim()).filter(Boolean).map(type => (
											<option key={type} value={type}>{type}</option>
										))
									) : (
										<>
											<option value="alipay">alipay</option>
											<option value="wxpay">wxpay</option>
											<option value="alipay_direct">alipay_direct</option>
											<option value="wxpay_direct">wxpay_direct</option>
										</>
									)}
								</select>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									测试金额 *
								</label>
								<div className="relative">
									<span className="absolute left-3 top-2 text-gray-500">¥</span>
									<input
										type="number"
										required
										min="0.01"
										step="0.01"
										value={testAmount}
										onChange={(e) => setTestAmount(e.target.value)}
										className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
										placeholder="1.00"
									/>
								</div>
								<p className="text-xs text-gray-500 mt-1">用于测试的支付金额，建议使用小额金额</p>
							</div>

							{testResult && (
								<Alert status={testResult.success ? 'success' : 'danger'}>
									<AlertIndicator />
									<AlertContent>
										<AlertDescription>{testResult.message}</AlertDescription>
										{testResult.success && testResult.payUrl && (
											<div className="mt-2">
												<a
													href={testResult.payUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="text-sm text-blue-600 hover:text-blue-800 underline"
												>
													点击打开支付页面 →
												</a>
											</div>
										)}
									</AlertContent>
								</Alert>
							)}

							<div className="flex justify-end gap-3 pt-4 border-t">
								<Button type="button" variant="outline" onClick={closeTestDialog}>
									关闭
								</Button>
								<Button type="submit" disabled={testing}>
									{testing ? <Spinner size="sm" className="mr-2" /> : null}
									{testing ? '测试中...' : '开始测试'}
								</Button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
