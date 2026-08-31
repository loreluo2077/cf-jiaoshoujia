const SENSITIVE_KEYS = /(?:key|secret|sign|token|config|password)/i;

/**
 * 递归脱敏，过滤敏感字段值为 [REDACTED]
 */
function sanitize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sanitize);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEYS.test(k) ? '[REDACTED]' : sanitize(v)]));
	}
	return value;
}

/**
 * 结构化业务日志条目
 * @author Alfie
 */
export interface BusinessLogEntry {
	/** 业务动作标识，如 CREATE_ORDER、PAYMENT_CALLBACK、DELIVER_ORDER */
	action: string;
	/** 关联订单 ID */
	orderId?: string;
	/** 阶段：入参 | 出参 | 成功 | 失败 | 处理中 */
	phase: '入参' | '出参' | '成功' | '失败' | '处理中';
	/** 附加业务数据，自动脱敏敏感字段 */
	payload?: unknown;
	/** 错误描述，phase 为"失败"时填写 */
	error?: string;
}

/**
 * 输出结构化业务日志，单行 JSON 格式，便于日志平台解析与订单追踪。
 *
 * 示例输出：
 * {"ts":"2024-01-01T00:00:00.000Z","action":"CREATE_ORDER","orderId":"xxx","phase":"成功","payload":{...}}
 *
 * @author Alfie
 */
export function logBusiness(entry: BusinessLogEntry): void {
	const record: Record<string, unknown> = {
		ts: new Date().toISOString(),
		action: entry.action,
	};
	if (entry.orderId) record.orderId = entry.orderId;
	record.phase = entry.phase;
	if (entry.payload !== undefined) record.payload = sanitize(entry.payload);
	if (entry.error) record.error = entry.error;
	console.info(JSON.stringify(record));
}
