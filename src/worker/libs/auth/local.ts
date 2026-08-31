const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function hasLocalAuthBypass(request: Request, value?: string): boolean {
	if (value !== 'true') return false;
	return LOCAL_HOSTNAMES.has(new URL(request.url).hostname);
}
