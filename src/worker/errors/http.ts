import { HTTPException } from 'hono/http-exception';

function httpError(status: 400 | 401 | 404 | 503, error: string, message: string) {
	return new HTTPException(status, { res: Response.json({ error, message }, { status }) });
}

export function badRequest(message = '请求参数无效') { return httpError(400, 'BAD_REQUEST', message); }
export function unauthorized(message = 'Unauthorized') { return httpError(401, 'Unauthorized', message); }
export function notFound(message = '资源不存在') { return httpError(404, 'NOT_FOUND', message); }
export function serviceUnavailable(message = '服务暂时不可用') { return httpError(503, 'SERVICE_UNAVAILABLE', message); }
