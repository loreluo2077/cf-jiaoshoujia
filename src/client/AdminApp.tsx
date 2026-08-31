import { useState } from 'react';
import { useAuth } from '@/client/hooks/useApi';
import { LoginPage } from '@/client/pages/LoginPage';
import { Layout } from '@/client/components/Layout';
import { OrdersPage } from '@/client/pages/OrdersPage';
import { RefundsPage } from '@/client/pages/RefundsPage';
import { ProvidersPage } from '@/client/pages/ProvidersPage';
import { SettingsPage } from '@/client/pages/SettingsPage';
import { Spinner } from '@/client/components/ui/spinner';

function App() {
	const { authState, login, logout } = useAuth();
	const [currentPage, setCurrentPage] = useState('orders');

	if (authState === 'checking') {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<Spinner size="lg" />
			</div>
		);
	}

	if (authState === 'required') {
		return <LoginPage onLogin={login} />;
	}

	const renderPage = () => {
		switch (currentPage) {
			case 'orders':
				return <OrdersPage />;
			case 'refunds':
				return <RefundsPage />;
			case 'providers':
				return <ProvidersPage />;
			case 'settings':
				return <SettingsPage />;
			default:
				return <OrdersPage />;
		}
	};

	return (
		<Layout
			currentPage={currentPage}
			onNavigate={setCurrentPage}
			onLogout={logout}
		>
			{renderPage()}
		</Layout>
	);
}

export default App;
