export function log(module: string, phase: '入参' | '出参', requestId: string, value: unknown): void {
	const output = JSON.stringify({ requestId, data: value });
	console.log(`[${module}][${phase}]:${output}`);
}
