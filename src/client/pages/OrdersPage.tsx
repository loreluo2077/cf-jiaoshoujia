import { useState, useEffect } from 'react';
import { Search, Eye, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card';
import { Input } from '@/client/components/ui/input';
import { Button } from '@/client/components/ui/button';
import { Badge } from '@/client/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableScrollContainer } from '@/client/components/ui/table';
import { Spinner } from '@/client/components/ui/spinner';
import type { Order } from '@/client/types';

const statusConfig = {
	PENDING: { label: '待支付', color: 'default' as const },
	PAID: { label: '已支付', color: 'success' as const },
	RECHARGING: { label: '充值中', color: 'warning' as const },
	COMPLETED: { label: '已完成', color: 'success' as const },
	FAILED: { label: '失败', color: 'danger' as const },
	REFUNDED: { label: '已退款', color: 'default' as const },
};

export function OrdersPage() {
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

	const fetchOrders = async () => {
		try {
			setLoading(true);
			setError('');
			const response = await fetch('/api/admin/orders');
			if (!response.ok) throw new Error('加载失败');
			const data = await response.json() as { orders: Order[] };
			setOrders(data.orders || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : '加载订单失败');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchOrders();
	}, []);

	const filteredOrders = orders.filter(order =>
		order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
		order.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
		order.externalOrderNo?.toLowerCase().includes(searchTerm.toLowerCase())
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-gray-900">订单管理</h1>
				<p className="text-gray-600 mt-2">查看和管理所有订单</p>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>订单列表</CardTitle>
							<CardDescription>共 {orders.length} 个订单</CardDescription>
						</div>
						<Button onClick={fetchOrders} variant="outline" size="sm">
							<RefreshCw className="h-4 w-4 mr-2" />
							刷新
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
						<Input
							placeholder="搜索订单 ID、商品名称或外部订单号..."
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
					) : filteredOrders.length === 0 ? (
						<div className="text-center py-12 text-gray-500">
							{searchTerm ? '没有找到匹配的订单' : '暂无订单'}
						</div>
					) : (
						<TableScrollContainer>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>订单 ID</TableHead>
										<TableHead>商品名称</TableHead>
										<TableHead>金额</TableHead>
										<TableHead>支付方式</TableHead>
										<TableHead>状态</TableHead>
										<TableHead>创建时间</TableHead>
										<TableHead>操作</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredOrders.map((order) => (
										<TableRow key={order.id}>
											<TableCell className="font-mono text-sm">{order.id.slice(0, 8)}...</TableCell>
											<TableCell>{order.subject}</TableCell>
											<TableCell className="font-semibold">¥{order.amount}</TableCell>
											<TableCell>
												<Badge color="default">{order.paymentType}</Badge>
											</TableCell>
											<TableCell>
												<Badge color={statusConfig[order.status].color}>
													{statusConfig[order.status].label}
												</Badge>
											</TableCell>
											<TableCell className="text-sm text-gray-600">
												{new Date(order.createdAt).toLocaleString('zh-CN')}
											</TableCell>
											<TableCell>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setSelectedOrder(order)}
												>
													<Eye className="h-4 w-4" />
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</TableScrollContainer>
					)}
				</CardContent>
			</Card>

			{/* 订单详情对话框 - 稍后实现 */}
			{selectedOrder && (
				<OrderDetailModal
					order={selectedOrder}
					onClose={() => setSelectedOrder(null)}
					onRefresh={fetchOrders}
				/>
			)}
		</div>
	);
}

// 订单详情弹窗组件
function OrderDetailModal({ order, onClose, onRefresh }: { order: Order; onClose: () => void; onRefresh: () => void }) {
	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
				<CardHeader>
					<CardTitle>订单详情</CardTitle>
					<CardDescription>订单 ID: {order.id}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="text-sm font-medium text-gray-600">商品名称</label>
							<p className="mt-1">{order.subject}</p>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-600">订单金额</label>
							<p className="mt-1 text-lg font-semibold">¥{order.amount}</p>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-600">支付方式</label>
							<p className="mt-1">{order.paymentType}</p>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-600">订单状态</label>
							<div className="mt-1">
								<Badge color={statusConfig[order.status].color}>
									{statusConfig[order.status].label}
								</Badge>
							</div>
						</div>
						{order.externalOrderNo && (
							<div>
								<label className="text-sm font-medium text-gray-600">外部订单号</label>
								<p className="mt-1 font-mono text-sm">{order.externalOrderNo}</p>
							</div>
						)}
						{order.paymentTradeNo && (
							<div>
								<label className="text-sm font-medium text-gray-600">支付流水号</label>
								<p className="mt-1 font-mono text-sm">{order.paymentTradeNo}</p>
							</div>
						)}
						<div>
							<label className="text-sm font-medium text-gray-600">创建时间</label>
							<p className="mt-1 text-sm">{new Date(order.createdAt).toLocaleString('zh-CN')}</p>
						</div>
						{order.paidAt && (
							<div>
								<label className="text-sm font-medium text-gray-600">支付时间</label>
								<p className="mt-1 text-sm">{new Date(order.paidAt).toLocaleString('zh-CN')}</p>
							</div>
						)}
						{order.payUrl && (
							<div className="col-span-2">
								<label className="text-sm font-medium text-gray-600">支付链接</label>
								<a
									href={order.payUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="mt-1 flex items-center text-blue-600 hover:underline text-sm"
								>
									<ExternalLink className="h-4 w-4 mr-1" />
									打开支付页面
								</a>
							</div>
						)}
						{order.failedReason && (
							<div className="col-span-2">
								<label className="text-sm font-medium text-gray-600">失败原因</label>
								<p className="mt-1 text-red-600">{order.failedReason}</p>
							</div>
						)}
					</div>

					<div className="flex justify-end gap-2 pt-4 border-t">
						<Button variant="outline" onClick={onClose}>
							关闭
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
