import { sign } from '../payment/downstream/easypay';

export type VerifyTestNotificationResult =
	| { ok: true }
	| { ok: false; code: 'NOT_CONFIGURED' | 'INVALID_PID' | 'INVALID_STATUS' | 'INVALID_SIGNATURE' };

/**
 * 测试服务，用于验证下游通知
 *
 * @author Alfie
 */
export class TestService {
	constructor(private readonly env: Env) {}

	verifyTestNotification(params: Record<string, string>): VerifyTestNotificationResult {
		const bridgePid = this.env.EASYPAY_BRIDGE_PID;
		const bridgeKey = this.env.EASYPAY_BRIDGE_KEY;

		if (!bridgePid || !bridgeKey) {
			return { ok: false, code: 'NOT_CONFIGURED' };
		}

		if (params.pid !== bridgePid) {
			return { ok: false, code: 'INVALID_PID' };
		}

		if (params.trade_status !== 'TRADE_SUCCESS') {
			return { ok: false, code: 'INVALID_STATUS' };
		}

		if (!params.sign || sign(params, bridgeKey) !== params.sign.toLowerCase()) {
			return { ok: false, code: 'INVALID_SIGNATURE' };
		}

		return { ok: true };
	}
}
