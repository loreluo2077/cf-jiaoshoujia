const SENSITIVE_KEYS = /(?:key|secret|sign|token|config|password)/i;


/**
 * 业务日志条目
 */
export interface BusinessLogEntry {
	/** 日志消息 */
	message: string;
	/** 关联订单 ID */
	orderId?: string;
	/** 附加业务数据，自动脱敏敏感字段 */
	payload?: unknown;
	/** 错误描述 */
	error?: string;
}

/**
 * 输出简洁易读的业务日志。
 *
 * 示例输出：
 * 创建订单开始，orderId：xxx，payload：{...}
 * 支付回调成功，orderId：xxx
 * 退款失败，orderId：xxx，错误：余额不足
 */
export function logBusiness(entry: BusinessLogEntry): void {
	const parts: string[] = [entry.message];

	if (entry.orderId) {
		parts.push(`orderId：${entry.orderId}`);
	}

	if (entry.error) {
		parts.push(`错误：${entry.error}`);
	}

	if (entry.payload !== undefined) {
		parts.push(`payload：${JSON.stringify(entry.payload)}`);
	}

	console.info(parts.join('，'));
}
