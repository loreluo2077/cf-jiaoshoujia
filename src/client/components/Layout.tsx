import { useState, type ReactNode } from 'react';
import { LogOut, ShoppingCart, RefreshCcw, CreditCard, Settings, Menu, X } from 'lucide-react';
import { Button } from '@/client/components/ui/button';

interface LayoutProps {
	children: ReactNode;
	currentPage: string;
	onNavigate: (page: string) => void;
	onLogout: () => void;
}

const navigation = [
	{ id: 'orders', name: '订单管理', icon: ShoppingCart },
	{ id: 'refunds', name: '退款管理', icon: RefreshCcw },
	{ id: 'providers', name: '支付渠道', icon: CreditCard },
	{ id: 'settings', name: '系统设置', icon: Settings },
];

export function Layout({ children, currentPage, onNavigate, onLogout }: LayoutProps) {
	const [sidebarOpen, setSidebarOpen] = useState(false);

	return (
		<div className="min-h-screen bg-gray-50">
			{/* 移动端菜单按钮 */}
			<div className="lg:hidden fixed top-4 left-4 z-50">
				<Button
					variant="outline"
					size="sm"
					onClick={() => setSidebarOpen(!sidebarOpen)}
				>
					{sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
				</Button>
			</div>

			{/* 侧边栏 */}
			<aside
				className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
					sidebarOpen ? 'translate-x-0' : '-translate-x-full'
				}`}
			>
				<div className="flex flex-col h-full">
					<div className="p-6 border-b border-gray-200">
						<h1 className="text-xl font-bold text-gray-900">管理后台</h1>
					</div>

					<nav className="flex-1 p-4 space-y-1">
						{navigation.map((item) => {
							const Icon = item.icon;
							const isActive = currentPage === item.id;
							return (
								<button
									key={item.id}
									onClick={() => {
										onNavigate(item.id);
										setSidebarOpen(false);
									}}
									className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
										isActive
											? 'bg-blue-50 text-blue-700'
											: 'text-gray-700 hover:bg-gray-100'
									}`}
								>
									<Icon className="h-5 w-5" />
									{item.name}
								</button>
							);
						})}
					</nav>

					<div className="p-4 border-t border-gray-200">
						<Button
							variant="outline"
							className="w-full justify-start"
							onClick={onLogout}
						>
							<LogOut className="h-4 w-4 mr-2" />
							退出登录
						</Button>
					</div>
				</div>
			</aside>

			{/* 遮罩层（移动端） */}
			{sidebarOpen && (
				<div
					className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
					onClick={() => setSidebarOpen(false)}
				/>
			)}

			{/* 主内容区 */}
			<main className="lg:ml-64 min-h-screen">
				<div className="p-6 lg:p-8">{children}</div>
			</main>
		</div>
	);
}
