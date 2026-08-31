import { useState, useEffect } from 'react';
import { RefreshCw, Save, Plus, Edit, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card';
import { Button } from '@/client/components/ui/button';
import { Input } from '@/client/components/ui/input';
import { Label } from '@/client/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableScrollContainer } from '@/client/components/ui/table';
import { Spinner } from '@/client/components/ui/spinner';
import { Alert, AlertContent, AlertDescription, AlertIndicator } from '@/client/components/ui/alert';
import type { Setting } from '@/client/types';

export function SettingsPage() {
	const [settings, setSettings] = useState<Setting[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [actionError, setActionError] = useState('');
	const [actionSuccess, setActionSuccess] = useState('');
	const [editingSetting, setEditingSetting] = useState<{ key: string; value: string } | null>(null);
	const [saving, setSaving] = useState(false);

	const fetchSettings = async () => {
		try {
			setLoading(true);
			setError('');
			const response = await fetch('/api/settings');
			if (!response.ok) throw new Error('加载失败');
			const data = await response.json() as { settings: Setting[] };
			setSettings(data.settings || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : '加载设置失败');
		} finally {
			setLoading(false);
		}
	};

	const saveSetting = async () => {
		if (!editingSetting) return;

		try {
			setSaving(true);
			setActionError('');
			setActionSuccess('');
			const response = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(editingSetting),
			});
			if (!response.ok) throw new Error('保存失败');
			setActionSuccess('保存成功');
			setEditingSetting(null);
			await fetchSettings();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : '保存失败');
		} finally {
			setSaving(false);
		}
	};

	const deleteSetting = async (key: string) => {
		if (!confirm('确认删除此设置项？')) return;

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

	useEffect(() => {
		fetchSettings();
	}, []);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-gray-900">系统设置</h1>
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

			{/* 编辑表单 */}
			{editingSetting && (
				<Card>
					<CardHeader>
						<CardTitle>{editingSetting.key ? '编辑设置' : '添加设置'}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="key">键名</Label>
							<Input
								id="key"
								value={editingSetting.key}
								onChange={(e) => setEditingSetting({ ...editingSetting, key: e.target.value })}
								placeholder="例如：site_name"
								disabled={settings.some(s => s.key === editingSetting.key)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="value">值</Label>
							<Input
								id="value"
								value={editingSetting.value}
								onChange={(e) => setEditingSetting({ ...editingSetting, value: e.target.value })}
								placeholder="输入配置值"
							/>
						</div>
						<div className="flex justify-end gap-2">
							<Button variant="outline" onClick={() => setEditingSetting(null)}>
								取消
							</Button>
							<Button onClick={saveSetting} disabled={saving || !editingSetting.key || !editingSetting.value}>
								{saving ? <Spinner size="sm" className="mr-2" /> : <Save className="h-4 w-4 mr-2" />}
								保存
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>配置列表</CardTitle>
							<CardDescription>共 {settings.length} 个配置项</CardDescription>
						</div>
						<div className="flex gap-2">
							<Button onClick={fetchSettings} variant="outline" size="sm">
								<RefreshCw className="h-4 w-4 mr-2" />
								刷新
							</Button>
							<Button size="sm" onClick={() => setEditingSetting({ key: '', value: '' })}>
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
						<div className="text-center py-12 text-gray-500">暂无配置项</div>
					) : (
						<TableScrollContainer>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>键名</TableHead>
										<TableHead>值</TableHead>
										<TableHead>更新时间</TableHead>
										<TableHead>操作</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{settings.map((setting) => (
										<TableRow key={setting.key}>
											<TableCell className="font-mono text-sm">{setting.key}</TableCell>
											<TableCell className="max-w-md truncate">{setting.value}</TableCell>
											<TableCell className="text-sm text-gray-600">
												{new Date(setting.updatedAt).toLocaleString('zh-CN')}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-2">
													<Button
														variant="ghost"
														size="sm"
														onClick={() => setEditingSetting({ key: setting.key, value: setting.value })}
													>
														<Edit className="h-4 w-4" />
													</Button>
													<Button
														variant="ghost"
														size="sm"
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
		</div>
	);
}
