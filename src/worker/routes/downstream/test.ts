import { Hono } from 'hono';
import { sign } from '../../payment/downstream/easypay';

export const downstreamTestRoutes = new Hono<{ Bindings: Env }>();

downstreamTestRoutes.post('/notify', async (c) => {
	if (!c.env.EASYPAY_BRIDGE_PID || !c.env.EASYPAY_BRIDGE_KEY) return c.text('fail', 503);
	const params = Object.fromEntries(new URLSearchParams(await c.req.text()));
	if (params.pid !== c.env.EASYPAY_BRIDGE_PID || params.trade_status !== 'TRADE_SUCCESS') return c.text('fail', 400);
	if (!params.sign || sign(params, c.env.EASYPAY_BRIDGE_KEY) !== params.sign.toLowerCase()) return c.text('fail', 400);
	return c.text('success');
});
