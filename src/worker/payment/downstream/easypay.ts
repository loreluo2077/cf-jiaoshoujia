import { md5 } from 'js-md5';
import type { PaymentNotification, PaymentProvider, PaymentRequest, PaymentResult } from '../core/types';

export function sign(params: Record<string, string>, key: string) {
	const input = Object.entries(params)
		.filter(([k, v]) => k !== 'sign' && k !== 'sign_type' && v !== '')
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v}`)
		.join('&');
	return md5(input + key);
}

export class EasyPayProvider implements PaymentProvider {
	readonly key = 'easypay';
	constructor(
		private readonly config: { pid: string; pkey: string; apiBase: string; notifyUrl: string; returnUrl: string; cid?: string },
	) {}
	supports(type: string) {
		return type === 'alipay' || type === 'wxpay';
	}
	async createPayment(request: PaymentRequest): Promise<PaymentResult> {
		const params: Record<string, string> = {
			pid: this.config.pid,
			type: request.paymentType,
			out_trade_no: request.orderId,
			notify_url: request.notifyUrl || this.config.notifyUrl,
			return_url: request.returnUrl || this.config.returnUrl,
			name: request.subject,
			money: request.amount.toFixed(2),
			clientip: '127.0.0.1',
		};
		if (this.config.cid) params.cid = this.config.cid;
		params.sign = sign(params, this.config.pkey);
		params.sign_type = 'MD5';
		const response = await fetch(new URL('/mapi.php', this.config.apiBase), {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(params),
		});
		const data = (await response.json()) as {
			code: number;
			msg?: string;
			trade_no: string;
			payurl?: string;
			payurl2?: string;
			qrcode?: string;
		};
		if (data.code !== 1) throw new Error(data.msg || 'EasyPay create payment failed');
		return { tradeNo: data.trade_no, payUrl: data.payurl2 || data.payurl, qrCode: data.qrcode };
	}
	async verifyNotification(body: string, _headers?: Headers): Promise<PaymentNotification> {
		const params = Object.fromEntries(new URLSearchParams(body));
		const supplied = params.sign || '';
		if (sign(params, this.config.pkey) !== supplied) throw new Error('EasyPay signature verification failed');
		if (params.pid !== this.config.pid) throw new Error('EasyPay merchant mismatch');
		const amount = Number(params.money);
		if (!params.out_trade_no || !params.trade_no || !Number.isFinite(amount)) throw new Error('Invalid EasyPay notification');
		return {
			orderId: params.out_trade_no,
			tradeNo: params.trade_no,
			amount,
			status: params.trade_status === 'TRADE_SUCCESS' ? 'success' : 'failed',
		};
	}
	async refund(tradeNo: string, orderId: string, amount: number) {
		const params = new URLSearchParams({
			pid: this.config.pid,
			key: this.config.pkey,
			trade_no: tradeNo,
			out_trade_no: orderId,
			money: amount.toFixed(2),
		});
		const response = await fetch(new URL('/api.php?act=refund', this.config.apiBase), {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: params,
		});
		const data = (await response.json()) as { code?: number; msg?: string };
		if (data.code !== 1) throw new Error(data.msg || 'EasyPay refund failed');
	}
}
