import { useState, useEffect } from 'react';
import { RefreshCw, Plus, Edit, Trash2, X, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card';
import { Button } from '@/client/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableScrollContainer } from '@/client/components/ui/table';
import { Spinner } from '@/client/components/ui/spinner';
import { Alert, AlertContent, AlertDescription, AlertIndicator } from '@/client/components/ui/alert';

interface Setting {
	key: string;
	value: string;
	createdAt?: string;
	updatedAt: string;
}

export function SettingsPage() {
	const [settings, setSettings] = useState<Setting[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [actionError, setActionError] = useState('');
	const [actionSuccess, setActionSuccess] = useState('');
	const [showDialog, setShowDialog] = useState(false);
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [formData, setFormData] = useState({ key: '', value: '' });
	const [submitting, setSubmitting] = useState(false);

	const fetchSettings = async () => {
		try {
			setLoading(true);
			setError('');
			const response = await fetch('/api/settings');
			if (!response.ok) throw new Error('加载失败');
			const data = await response.json() as { settings: Setting[] };
			setSettings(data.settings || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : '加载系统配置失败');
		} finally {
			setLoading(false);
		}
	};

	const deleteSetting = async (key: string) => {
		if (!confirm(`确认删除配置项 "${key}"？`)) return;

		try {
			setActionError('');
			setActionSuccess('');
			const response = await fetch(`/api/settings/${key}`, {
				method: 'DELETE',
			});
			if (!response.ok) throw new Error('删除失败');
			setActionSuccess('删除成功');
			await fetchSettings();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : '删除失败');
		}
	};

	const openAddDialog = () => {
		setEditingKey(null);
		setFormData({ key: '', value: '' });
		setShowDialog(true);
	};

	const openEditDialog = (setting: Setting) => {
		setEditingKey(setting.key);
		setFormData({ key: setting.key, value: setting.value });
		setShowDialog(true);
	};

	const closeDialog = () => {
		setShowDialog(false);
		setEditingKey(null);
		setActionError('');
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);
		setActionError('');

		try {
			if (!formData.key.trim() || !formData.value.trim()) {
				throw new Error('配置项和值不能为空');
			}

			const response = await fetch(`/api/settings/${formData.key}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ value: formData.value }),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({})) as { error?: string };
				throw new Error(errorData.error || '操作失败');
			}

			setActionSuccess(editingKey ? '更新成功' : '添加成功');
			closeDialog();
			await fetchSettings();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : '操作失败');
		} finally {
			setSubmitting(false);
		}
	};

	useEffect(() => {
		fetchSettings();
	}, []);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-gray-900">系统配置</h1>
				<p className="text-gray-600 mt-2">管理系统配置项</p>
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
							<CardTitle>配置项列表</CardTitle>
							<CardDescription>共 {settings.length} 个配置项</CardDescription>
						</div>
						<div className="flex gap-2">
							<Button onClick={fetchSettings} variant="outline" size="sm">
								<RefreshCw className="h-4 w-4 mr-2" />
								刷新
							</Button>
							<Button size="sm" onClick={openAddDialog}>
								<Plus className="h-4 w-4 mr-2" />
								添加配置
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
					) : settings.length === 0 ? (
						<div className="text-center py-12 text-gray-500">暂无系统配置</div>
					) : (
						<TableScrollContainer>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>配置项</TableHead>
										<TableHead>配置值</TableHead>
										<TableHead>创建时间</TableHead>
										<TableHead>更新时间</TableHead>
										<TableHead>操作</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{settings.map((setting) => (
										<TableRow key={setting.key}>
											<TableCell className="font-mono text-sm font-medium">{setting.key}</TableCell>
											<TableCell className="max-w-md truncate">{setting.value}</TableCell>
											<TableCell className="text-sm text-gray-600">
									{new Date(setting.createdAt || setting.updatedAt).toLocaleString('zh-CN')}
											</TableCell>
											<TableCell className="text-sm text-gray-600">
												{new Date(setting.updatedAt).toLocaleString('zh-CN')}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2">
									<Button variant="ghost" size="sm" aria-label="编辑配置" onClick={() => openEditDialog(setting)}>
														<Edit className="h-4 w-4" />
													</Button>
													<Button
										variant="ghost"
										size="sm"
										aria-label="删除配置"
														onClick={() => deleteSetting(setting.key)}
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
					<div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
						<div className="flex items-center justify-between p-6 border-b">
							<h2 className="text-xl font-bold">
								{editingKey ? '编辑配置' : '添加配置'}
							</h2>
							<button onClick={closeDialog} className="text-gray-400 hover:text-gray-600">
								<X className="h-5 w-5" />
							</button>
						</div>
						<form onSubmit={handleSubmit} className="p-6 space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									配置项 * {editingKey && <span className="text-gray-500 text-xs">(不可修改)</span>}
								</label>
								<input
									type="text"
									required
									disabled={!!editingKey}
									value={formData.key}
									onChange={(e) => setFormData({ ...formData, key: e.target.value })}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono"
									placeholder="例如：payment.timeout"
								/>
								<p className="text-xs text-gray-500 mt-1">
									只能包含字母、数字、点、下划线和横线，最长 100 个字符
								</p>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									配置值 *
								</label>
								<textarea
									required
									rows={4}
									value={formData.value}
									onChange={(e) => setFormData({ ...formData, value: e.target.value })}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="输入配置值"
								/>
							</div>

							<div className="flex justify-end gap-3 pt-4 border-t">
								<Button type="button" variant="outline" onClick={closeDialog}>
									取消
								</Button>
								<Button type="submit" disabled={submitting}>
									{submitting ? <Spinner size="sm" className="mr-2" /> : null}
									{submitting ? '提交中...' : editingKey ? '更新' : '添加'}
								</Button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
