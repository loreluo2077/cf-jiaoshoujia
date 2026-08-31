import { useState, useEffect } from 'react';
import { Search, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card';
import { Input } from '@/client/components/ui/input';
import { Button } from '@/client/components/ui/button';
import { Badge } from '@/client/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableScrollContainer } from '@/client/components/ui/table';
import { Spinner } from '@/client/components/ui/spinner';
import { Alert, AlertContent, AlertDescription, AlertIndicator } from '@/client/components/ui/alert';
import type { Refund } from '@/client/types';

const refundStatusConfig = {
	PENDING: { label: '待处理', color: 'default' as const },
	PROCESSING: { label: '处理中', color: 'warning' as const },
	COMPLETED: { label: '已完成', color: 'success' as const },
	FAILED: { label: '失败', color: 'danger' as const },
};

export function RefundsPage() {
	const [refunds, setRefunds] = useState<Refund[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [processingRefund, setProcessingRefund] = useState<string | null>(null);
	const [actionError, setActionError] = useState('');

	const fetchRefunds = async () => {
		try {
			setLoading(true);
			setError('');
			const response = await fetch('/api/admin/refunds');
			if (!response.ok) throw new Error('加载失败');
			const data = await response.json() as { refunds: Refund[] };
			setRefunds(data.refunds || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : '加载退款记录失败');
		} finally {
			setLoading(false);
		}
	};

	const handleProcess = async (refundId: string) => {
		if (!confirm('确认处理此退款申请？')) return;

		try {
			setProcessingRefund(refundId);
			setActionError('');
			const response = await fetch(`/api/admin/refunds/${refundId}/process`, {
				method: 'POST',
			});
			if (!response.ok) throw new Error('处理失败');
			await fetchRefunds();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : '处理退款失败');
		} finally {
			setProcessingRefund(null);
		}
	};

	useEffect(() => {
		fetchRefunds();
	}, []);

	const filteredRefunds = refunds.filter(refund =>
		refund.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
		refund.orderId.toLowerCase().includes(searchTerm.toLowerCase())
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-gray-900">退款管理</h1>
				<p className="text-gray-600 mt-2">处理和查看退款申请</p>
			</div>

			{actionError && (
				<Alert status="danger">
					<AlertIndicator />
					<AlertContent>
						<AlertDescription>{actionError}</AlertDescription>
					</AlertContent>
				</Alert>
			)}

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>退款列表</CardTitle>
							<CardDescription>共 {refunds.length} 个退款申请</CardDescription>
						</div>
						<Button onClick={fetchRefunds} variant="outline" size="sm">
							<RefreshCw className="h-4 w-4 mr-2" />
							刷新
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
						<Input
							placeholder="搜索退款 ID 或订单 ID..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10"
						/>
					</div>

					{loading ? (
						<div className="flex justify-center py-12">
							<Spinner size="lg" />
						</div>
					) : error ? (
						<div className="text-center py-12 text-red-600">{error}</div>
					) : filteredRefunds.length === 0 ? (
						<div className="text-center py-12 text-gray-500">
							{searchTerm ? '没有找到匹配的退款记录' : '暂无退款记录'}
						</div>
					) : (
						<TableScrollContainer>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>退款 ID</TableHead>
										<TableHead>订单 ID</TableHead>
										<TableHead>退款金额</TableHead>
										<TableHead>状态</TableHead>
										<TableHead>申请时间</TableHead>
										<TableHead>原因</TableHead>
										<TableHead>操作</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredRefunds.map((refund) => (
										<TableRow key={refund.id}>
											<TableCell className="font-mono text-sm">{refund.id.slice(0, 8)}...</TableCell>
											<TableCell className="font-mono text-sm">{refund.orderId.slice(0, 8)}...</TableCell>
											<TableCell className="font-semibold">¥{refund.amount}</TableCell>
											<TableCell>
												<Badge color={refundStatusConfig[refund.status].color}>
													{refundStatusConfig[refund.status].label}
												</Badge>
											</TableCell>
											<TableCell className="text-sm text-gray-600">
												{new Date(refund.createdAt).toLocaleString('zh-CN')}
											</TableCell>
											<TableCell className="text-sm max-w-xs truncate">
												{refund.reason || '-'}
											</TableCell>
											<TableCell>
												{refund.status === 'PENDING' && (
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleProcess(refund.id)}
														disabled={processingRefund === refund.id}
													>
														{processingRefund === refund.id ? (
															<Spinner size="sm" className="mr-2" />
														) : (
															<CheckCircle className="h-4 w-4 mr-2" />
														)}
														处理
													</Button>
												)}
												{refund.status === 'COMPLETED' && (
													<span className="text-sm text-green-600 flex items-center">
														<CheckCircle className="h-4 w-4 mr-1" />
														已完成
													</span>
												)}
												{refund.status === 'FAILED' && (
													<span className="text-sm text-red-600 flex items-center">
														<XCircle className="h-4 w-4 mr-1" />
														失败
													</span>
												)}
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
