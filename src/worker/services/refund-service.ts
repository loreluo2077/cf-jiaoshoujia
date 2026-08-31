import { createDb } from '../../db/client';
import { logBusiness } from '../utils/business-logger';
import { AuditLogRepository } from '../repositories/audit-log';
import { OrderRepository } from '../repositories/order';
import { ProviderRepository } from '../repositories/provider';
import { createPaymentProviders } from '../payment/providers';

export interface RefundRequest {
	orderId: string;
	/** 退款金额，不传则全额退款 */
	amount?: number;
	reason?: string;
	requestUrl: string;
}

type RefundSuccess = { ok: true; status: string; refundAmount: string };
type RefundFailure = { ok: false; error: string; status: number };

/**
 * 退款服务，封装订单退款的完整业务逻辑：
 * 校验订单状态 → 调用支付 provider 退款 → 更新订单状态 → 写审计日志。
 *
 * @author Alfie
 */
export class RefundService {
	private readonly orderDao;
	private readonly providerDao;
	private readonly auditLogDao;

	constructor(private readonly env: Env) {
		const db = createDb(env.DB);
		this.orderDao = new OrderRepository(db);
		this.providerDao = new ProviderRepository(db);
		this.auditLogDao = new AuditLogRepository(db);
	}

	/**
	 * 执行退款操作。
	 *
	 * @returns RefundSuccess 退款成功；RefundFailure 携带 HTTP 状态码和错误信息
	 * @author Alfie
	 */
	async refund(input: RefundRequest): Promise<RefundSuccess | RefundFailure> {
		logBusiness({ action: 'REFUND', orderId: input.orderId, phase: '入参', payload: { amount: input.amount, reason: input.reason } });
		const order = await this.orderDao.findById(input.orderId);
		if (!order) return { ok: false, error: 'Order not found', status: 404 };

		const amount = Number(input.amount ?? order.amount);
		const alreadyRefunded = Number(order.refundAmount || 0);
		if (
			!['PAID', 'COMPLETED', 'PARTIALLY_REFUNDED'].includes(order.status) ||
			amount <= 0 ||
			amount > Number(order.amount) - alreadyRefunded
		) {
			return { ok: false, error: 'Order is not refundable', status: 409 };
		}

		const providerRows = await this.providerDao.findForOrder(order.appId, order.providerInstanceId);

		// xunhupay 仅支持全额退款，提前校验
		const selectedInstance = order.providerInstanceId ? providerRows.find((row) => row.id === order.providerInstanceId) : providerRows[0];
		if (selectedInstance?.providerKey === 'xunhupay') {
			try {
				const providerConfig = JSON.parse(selectedInstance.config || '{}') as Record<string, unknown>;
				if (providerConfig.appid && providerConfig.secret && providerConfig.gateway && Math.abs(amount - Number(order.amount)) > 0.001) {
					return { ok: false, error: 'XunhuPay only supports full refunds', status: 422 };
				}
			} catch {
				return { ok: false, error: 'Payment provider configuration is invalid', status: 422 };
			}
		}

		const providers = createPaymentProviders(providerRows, input.requestUrl);
		try {
			if (order.paymentType === 'stripe' && order.paymentTradeNo && providers.stripe) {
				await providers.stripe.refund(order.paymentTradeNo, amount);
			} else if ((order.paymentType === 'alipay' || order.paymentType === 'wxpay') && providers.easyPay) {
				await providers.easyPay.refund(order.paymentTradeNo || order.id, order.id, amount);
			} else if (order.paymentType === 'alipay_direct' && order.paymentTradeNo && providers.alipay) {
				await providers.alipay.refund(order.paymentTradeNo, amount);
			} else if (order.paymentType === 'wxpay_direct' && providers.wxpay) {
				await providers.wxpay.refund(order.id, amount, Number(order.amount));
			} else if (order.paymentTradeNo && providers.generic) {
				await providers.generic.refund(order.paymentTradeNo, order.id, amount);
			}
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'Payment provider refund failed';
			logBusiness({ action: 'REFUND', orderId: input.orderId, phase: '失败', error: reason });
			return { ok: false, error: reason, status: 502 };
		}

		const totalRefunded = alreadyRefunded + amount;
		const newStatus = totalRefunded >= Number(order.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
		const now = new Date();
		await this.orderDao.update(order.id, {
			refundAmount: totalRefunded.toFixed(2),
			refundReason: input.reason ?? null,
			refundAt: now,
			status: newStatus,
			updatedAt: now,
		});
		await this.auditLogDao.insert({
			id: crypto.randomUUID(),
			orderId: order.id,
			action: 'REFUND_REQUESTED',
			operator: 'admin',
			createdAt: now,
		});
		logBusiness({ action: 'REFUND', orderId: order.id, phase: '成功', payload: { newStatus, totalRefunded: totalRefunded.toFixed(2) } });
		return { ok: true, status: newStatus, refundAmount: totalRefunded.toFixed(2) };
	}
}
