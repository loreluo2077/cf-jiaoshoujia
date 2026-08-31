import { md5 } from 'js-md5';
import type { PaymentNotification, PaymentProvider, PaymentRequest, PaymentResult } from '../core/types';

type XunhuConfig = { appid: string; secret: string; gateway: string; notifyUrl: string; returnUrl?: string };

export function xunhuSign(params: Record<string, unknown>, secret: string) {
	const filtered = Object.entries(params)
		.filter(([key, value]) => key !== 'hash' && value !== '' && value !== null && value !== undefined)
		.map(([key, value]) => [key, String(value)] as const)
		.sort(([a], [b]) => a.localeCompare(b));
	return md5(filtered.map(([key, value]) => `${key}=${value}`).join('&') + secret);
}

export class XunhuPayProvider implements PaymentProvider {
	readonly key = 'xunhupay';
	constructor(private readonly config: XunhuConfig) {}
	supports(type: string) {
		return type === 'alipay' || type === 'wxpay';
	}
	private async post(path: string, params: Record<string, unknown>) {
		const payload = { ...params, hash: xunhuSign(params, this.config.secret) };
		const response = await fetch(new URL(path, this.config.gateway), {
			method: 'POST',
			headers: { 'content-type': 'application/json;charset=UTF-8' },
			body: JSON.stringify(payload),
		});
		if (!response.ok) throw new Error(`XunhuPay API returned ${response.status}`);
		return (await response.json()) as Record<string, any>;
	}
	async createPayment(request: PaymentRequest): Promise<PaymentResult> {
		const data = await this.post('/payment/do.html', {
			version: '1.1',
			appid: this.config.appid,
			trade_order_id: request.orderId,
			total_fee: request.amount.toFixed(2),
			title: request.subject,
			notify_url: request.notifyUrl || this.config.notifyUrl,
			return_url: request.returnUrl || this.config.returnUrl || '',
			time: String(Math.floor(Date.now() / 1000)),
			nonce_str: crypto.randomUUID().replaceAll('-', ''),
		});
		if (Number(data.errcode) !== 0) throw new Error(data.errmsg || 'XunhuPay create payment failed');
		// XunhuPay's documented response puts these fields at the top level.
		// Accept the nested shape as a compatibility fallback for older gateways.
		const result = data.data && typeof data.data === 'object' ? data.data : data;
		if (!result.url && !result.url_qrcode) {
			throw new Error(
				`XunhuPay response missing payment URL (errcode=${String(data.errcode ?? 'unknown')}, errmsg=${String(data.errmsg || 'unknown')})`,
			);
		}
		return { tradeNo: String(result.open_order_id || request.orderId), payUrl: result.url, qrCode: result.url_qrcode };
	}
	async verifyNotification(body: string): Promise<PaymentNotification> {
		const params = Object.fromEntries(new URLSearchParams(body));
		if (!params.hash || xunhuSign(params, this.config.secret) !== params.hash) throw new Error('XunhuPay signature verification failed');
		if (params.appid !== this.config.appid) throw new Error('XunhuPay merchant mismatch');
		const amount = Number(params.total_fee);
		if (!params.trade_order_id || !params.transaction_id || !Number.isFinite(amount)) throw new Error('Invalid XunhuPay notification');
		return {
			orderId: params.trade_order_id,
			tradeNo: params.transaction_id,
			amount,
			status: params.status === 'OD' ? 'success' : 'failed',
		};
	}
	async refund(_tradeNo: string, orderId: string, amount: number) {
		if (amount <= 0) throw new Error('Refund amount must be positive');
		const data = await this.post('/payment/refund.html', {
			appid: this.config.appid,
			trade_order_id: orderId,
			reason: 'admin refund',
			time: String(Math.floor(Date.now() / 1000)),
			nonce_str: crypto.randomUUID().replaceAll('-', ''),
		});
		if (Number(data.errcode) !== 0) throw new Error(data.errmsg || 'XunhuPay refund failed');
	}
}
