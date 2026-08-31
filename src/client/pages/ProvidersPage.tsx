import { useState, useEffect } from 'react';
import { RefreshCw, Plus, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card';
import { Button } from '@/client/components/ui/button';
import { Badge } from '@/client/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableScrollContainer } from '@/client/components/ui/table';
import { Spinner } from '@/client/components/ui/spinner';
import { Alert, AlertContent, AlertDescription, AlertIndicator } from '@/client/components/ui/alert';
import type { Provider } from '@/client/types';

export function ProvidersPage() {
	const [providers, setProviders] = useState<Provider[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [actionError, setActionError] = useState('');
	const [actionSuccess, setActionSuccess] = useState('');

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
							<Button size="sm">
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
													>
														{provider.enabled ? (
															<PowerOff className="h-4 w-4" />
														) : (
															<Power className="h-4 w-4" />
														)}
													</Button>
													<Button variant="ghost" size="sm">
														<Edit className="h-4 w-4" />
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => deleteProvider(provider.id)}
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
		</div>
	);
}
