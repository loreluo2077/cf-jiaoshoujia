import { createDb } from '../../db/client';
import { logBusiness } from '../utils/business-logger';
import { MerchantRepository } from '../repositories/merchant';
import { OrderRepository } from '../repositories/order';
import { sign } from '../payment/downstream/easypay';
import type { DeliverableOrder } from '../dto/order.dto';

export class OrderDeliveryService {
	private readonly orderDao;
	private readonly merchantDao;

	constructor(private readonly env: Env) {
		const db = createDb(env.DB);
		this.orderDao = new OrderRepository(db);
		this.merchantDao = new MerchantRepository(db);
	}

	private async notifyEasyPayMerchant(order: DeliverableOrder) {
		const merchant = order.downstreamMerchantId ? await this.merchantDao.findById(order.downstreamMerchantId) : undefined;
		const pid = merchant?.pid || this.env.EASYPAY_BRIDGE_PID;
		const key = merchant?.secret || this.env.EASYPAY_BRIDGE_KEY;
		if (!pid || !key) throw new Error('EasyPay merchant is not configured');
		if (!order.externalOrderNo || !order.externalNotifyUrl || !order.paymentTradeNo) throw new Error('EasyPay order mapping is incomplete');
		const callback: Record<string, string> = {
			pid,
			type: order.paymentType || 'alipay',
			out_trade_no: order.externalOrderNo,
			trade_no: order.paymentTradeNo,
			name: order.subject || '支付网关订单',
			money: Number(order.amount).toFixed(2),
			trade_status: 'TRADE_SUCCESS',
		};
		callback.sign = sign(callback, key);
		callback.sign_type = 'MD5';
		const response = await fetch(order.externalNotifyUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(callback),
		});
		const acknowledgment = (await response.text()).trim().toLowerCase();
		if (!response.ok || acknowledgment !== 'success')
			throw new Error(`EasyPay merchant notification was not acknowledged (${response.status})`);
	}

	async deliverPaidOrder(order: DeliverableOrder): Promise<'COMPLETED' | 'PAID'> {
		logBusiness({
			message: `订单交付开始，orderId：${order.id}`,
			payload: { orderType: order.orderType, externalNotifyUrl: order.externalNotifyUrl },
		});
		try {
			if (order.orderType === 'easypay_bridge') await this.notifyEasyPayMerchant(order);
			await this.orderDao.update(order.id, {
				status: 'COMPLETED',
				deliveryStatus: order.orderType === 'easypay_bridge' ? 'DELIVERED' : 'NOT_REQUIRED',
				completedAt: new Date(),
				failedReason: null,
				updatedAt: new Date(),
			});
			logBusiness({ message: `订单交付成功，orderId：${order.id}` });
			return 'COMPLETED';
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'notification failed';
			await this.orderDao.update(order.id, {
				status: 'PAID',
				deliveryStatus: order.orderType === 'easypay_bridge' ? 'FAILED' : 'NOT_REQUIRED',
				failedReason: reason,
				updatedAt: new Date(),
			});
			logBusiness({ message: `订单交付失败，orderId：${order.id}`, error: reason });
			return 'PAID';
		}
	}
}

export function deliverPaidOrder(env: Env, order: DeliverableOrder, _legacyDb?: ReturnType<typeof createDb>) {
	return new OrderDeliveryService(env).deliverPaidOrder(order);
}
