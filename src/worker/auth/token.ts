function constantTimeEqual(left: string, right: string): boolean {
	const leftBytes = new TextEncoder().encode(left);
	const rightBytes = new TextEncoder().encode(right);
	if (leftBytes.length !== rightBytes.length) return false;

	let difference = 0;
	for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
	return difference === 0;
}

export function isValidApiToken(request: Request, expectedToken: string): boolean {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) return false;
	return constantTimeEqual(authorization.slice('Bearer '.length).trim(), expectedToken);
}

export function isValidNavigationToken(token: string | undefined, expectedToken: string): boolean {
	return Boolean(token) && constantTimeEqual(token!, expectedToken);
}
