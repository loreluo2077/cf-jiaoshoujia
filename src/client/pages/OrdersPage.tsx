import { useState, useEffect } from 'react';
import { RefreshCw, Search, DollarSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card';
import { Button } from '@/client/components/ui/button';
import { Badge } from '@/client/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableScrollContainer } from '@/client/components/ui/table';
import { Spinner } from '@/client/components/ui/spinner';
import { Alert, AlertContent, AlertDescription, AlertIndicator } from '@/client/components/ui/alert';

interface Order {
	id: string;
	userId: string;
	amount: string;
	status: string;
	paymentType: string;
	subject: string;
	createdAt: string;
	paidAt: string | null;
	refundAmount: string | null;
}

interface Pagination {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'success' | 'warning' | 'danger' }> = {
	PENDING: { label: '待支付', color: 'warning' },
	PAID: { label: '已支付', color: 'success' },
	COMPLETED: { label: '已完成', color: 'success' },
	CANCELLED: { label: '已取消', color: 'default' },
	EXPIRED: { label: '已过期', color: 'default' },
	FAILED: { label: '失败', color: 'danger' },
	REFUNDED: { label: '已退款', color: 'default' },
};

export function OrdersPage() {
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [actionError, setActionError] = useState('');
	const [actionSuccess, setActionSuccess] = useState('');
	const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
	const [statusFilter, setStatusFilter] = useState('');
	const [showRefundDialog, setShowRefundDialog] = useState(false);
	const [refundingOrder, setRefundingOrder] = useState<Order | null>(null);
	const [refundAmount, setRefundAmount] = useState('');
	const [refundReason, setRefundReason] = useState('');
	const [refunding, setRefunding] = useState(false);

	const fetchOrders = async (page = 1) => {
		try {
			setLoading(true);
			setError('');
			const params = new URLSearchParams({
				page: page.toString(),
				page_size: pagination.pageSize.toString(),
			});
			if (statusFilter) params.append('status', statusFilter);

			const response = await fetch(`/api/admin/orders?${params}`);
			if (!response.ok) throw new Error('加载失败');
			const data = await response.json() as { orders: Order[]; pagination: Pagination };
			setOrders(data.orders || []);
			setPagination(data.pagination);
		} catch (err) {
			setError(err instanceof Error ? err.message : '加载订单失败');
		} finally {
			setLoading(false);
		}
	};

	const openRefundDialog = (order: Order) => {
		setRefundingOrder(order);
		setRefundAmount(order.amount);
		setRefundReason('');
		setShowRefundDialog(true);
	};

	const closeRefundDialog = () => {
		setShowRefundDialog(false);
		setRefundingOrder(null);
		setRefundAmount('');
		setRefundReason('');
		setActionError('');
	};

	const handleRefund = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!refundingOrder) return;

		setRefunding(true);
		setActionError('');

		try {
			const amount = parseFloat(refundAmount);
			if (isNaN(amount) || amount <= 0) {
				throw new Error('请输入有效的退款金额');
			}

			if (amount > parseFloat(refundingOrder.amount)) {
				throw new Error('退款金额不能超过订单金额');
			}

			const response = await fetch('/api/admin/refunds', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					orderId: refundingOrder.id,
					amount,
					reason: refundReason.trim() || undefined,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({})) as { error?: string };
				throw new Error(errorData.error || '退款失败');
			}

			setActionSuccess('退款申请成功');
			closeRefundDialog();
			await fetchOrders(pagination.page);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : '退款失败');
		} finally {
			setRefunding(false);
		}
	};

	useEffect(() => {
		fetchOrders(1);
	}, [statusFilter]);

	const canRefund = (order: Order) => {
		return ['PAID', 'COMPLETED'].includes(order.status) && !order.refundAmount;
	};

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-gray-900">订单管理</h1>
				<p className="text-gray-600 mt-2">查看和管理支付订单</p>
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
							<CardTitle>订单列表</CardTitle>
							<CardDescription>共 {pagination.total} 个订单</CardDescription>
						</div>
						<div className="flex gap-2">
							<select
								value={statusFilter}
								onChange={(e) => setStatusFilter(e.target.value)}
								className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							>
								<option value="">全部状态</option>
								<option value="PENDING">待支付</option>
								<option value="PAID">已支付</option>
								<option value="COMPLETED">已完成</option>
								<option value="REFUNDED">已退款</option>
								<option value="CANCELLED">已取消</option>
								<option value="EXPIRED">已过期</option>
								<option value="FAILED">失败</option>
							</select>
							<Button onClick={() => fetchOrders(pagination.page)} variant="outline" size="sm">
								<RefreshCw className="h-4 w-4 mr-2" />
								刷新
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
					) : orders.length === 0 ? (
						<div className="text-center py-12 text-gray-500">暂无订单</div>
					) : (
						<>
							<TableScrollContainer>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>订单号</TableHead>
											<TableHead>商品名称</TableHead>
											<TableHead>金额</TableHead>
											<TableHead>支付方式</TableHead>
											<TableHead>状态</TableHead>
											<TableHead>创建时间</TableHead>
											<TableHead>操作</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{orders.map((order) => {
											const statusInfo = STATUS_LABELS[order.status] || { label: order.status, color: 'default' };
											return (
												<TableRow key={order.id}>
													<TableCell className="font-mono text-sm">{order.id}</TableCell>
													<TableCell className="max-w-xs truncate">{order.subject}</TableCell>
													<TableCell className="font-medium">
														¥{Number(order.amount).toFixed(2)}
														{order.refundAmount && (
															<div className="text-xs text-red-600">
																退款: ¥{Number(order.refundAmount).toFixed(2)}
															</div>
														)}
													</TableCell>
													<TableCell>
														<span className="text-sm">{order.paymentType}</span>
													</TableCell>
													<TableCell>
														<Badge color={statusInfo.color}>{statusInfo.label}</Badge>
													</TableCell>
													<TableCell className="text-sm text-gray-600">
														{new Date(order.createdAt).toLocaleString('zh-CN')}
													</TableCell>
													<TableCell>
														{canRefund(order) && (
															<Button
																variant="ghost"
																size="sm"
																onClick={() => openRefundDialog(order)}
																title="退款"
															>
																<DollarSign className="h-4 w-4 text-orange-600" />
															</Button>
														)}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</TableScrollContainer>

							{pagination.totalPages > 1 && (
								<div className="flex items-center justify-between pt-4 border-t">
									<div className="text-sm text-gray-600">
										第 {pagination.page} / {pagination.totalPages} 页
									</div>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											disabled={pagination.page <= 1}
											onClick={() => fetchOrders(pagination.page - 1)}
										>
											上一页
										</Button>
										<Button
											variant="outline"
											size="sm"
											disabled={pagination.page >= pagination.totalPages}
											onClick={() => fetchOrders(pagination.page + 1)}
										>
											下一页
										</Button>
									</div>
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>

			{showRefundDialog && refundingOrder && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
					<div className="bg-white rounded-lg shadow-xl max-w-md w-full">
						<div className="flex items-center justify-between p-6 border-b">
							<h2 className="text-xl font-bold">申请退款</h2>
							<button onClick={closeRefundDialog} className="text-gray-400 hover:text-gray-600">
								<span className="text-2xl">&times;</span>
							</button>
						</div>
						<form onSubmit={handleRefund} className="p-6 space-y-4">
							<div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
								<div className="flex justify-between text-sm">
									<span className="text-gray-600">订单号：</span>
									<span className="font-mono">{refundingOrder.id}</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-gray-600">订单金额：</span>
									<span className="font-medium">¥{Number(refundingOrder.amount).toFixed(2)}</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-gray-600">商品：</span>
									<span className="max-w-[200px] truncate">{refundingOrder.subject}</span>
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									退款金额 *
								</label>
								<div className="relative">
									<span className="absolute left-3 top-2 text-gray-500">¥</span>
									<input
										type="number"
										required
										min="0.01"
										max={refundingOrder.amount}
										step="0.01"
										value={refundAmount}
										onChange={(e) => setRefundAmount(e.target.value)}
										className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									/>
								</div>
								<p className="text-xs text-gray-500 mt-1">
									最多可退款 ¥{Number(refundingOrder.amount).toFixed(2)}
								</p>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									退款原因
								</label>
								<textarea
									rows={3}
									value={refundReason}
									onChange={(e) => setRefundReason(e.target.value)}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="请输入退款原因（可选）"
								/>
							</div>

							{actionError && (
								<Alert status="danger">
									<AlertIndicator />
									<AlertContent>
										<AlertDescription>{actionError}</AlertDescription>
									</AlertContent>
								</Alert>
							)}

							<div className="flex justify-end gap-3 pt-4 border-t">
								<Button type="button" variant="outline" onClick={closeRefundDialog}>
									取消
								</Button>
								<Button type="submit" disabled={refunding}>
									{refunding ? <Spinner size="sm" className="mr-2" /> : null}
									{refunding ? '处理中...' : '确认退款'}
								</Button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
