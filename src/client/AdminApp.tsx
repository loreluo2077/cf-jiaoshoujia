import { useState } from 'react';
import { useAuth } from '@/client/hooks/useApi';
import { LoginPage } from '@/client/pages/LoginPage';
import { Layout } from '@/client/components/Layout';
import { OrdersPage } from '@/client/pages/OrdersPage';
import { ProvidersPage } from '@/client/pages/ProvidersPage';
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
			case 'providers':
				return <ProvidersPage />;
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
