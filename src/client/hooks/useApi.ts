import { useState, useEffect } from 'react';

export function useApi<T>(url: string, options?: RequestInit) {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await fetch(url, options);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const result = await response.json() as T;
			setData(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : '请求失败');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
	}, [url]);

	return { data, loading, error, refetch: fetchData };
}

export function useAuth() {
	const [authState, setAuthState] = useState<'checking' | 'required' | 'authenticated'>('checking');

	useEffect(() => {
		const checkAuth = async () => {
			try {
				const response = await fetch('/api/auth/session');
				const result = await response.json() as { authenticated: boolean };
				setAuthState(result.authenticated ? 'authenticated' : 'required');
			} catch {
				setAuthState('required');
			}
		};
		checkAuth();
	}, []);

	const login = async (code: string) => {
		const response = await fetch('/api/auth/totp', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code }),
		});
		if (!response.ok) throw new Error('认证失败');
		setAuthState('authenticated');
	};

	const logout = async () => {
		await fetch('/api/auth/logout', { method: 'POST' });
		setAuthState('required');
	};

	return { authState, login, logout };
}
