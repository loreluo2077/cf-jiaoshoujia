import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, SESSION_SUBJECT } from './constants';
import type { WorkerEnv } from '../../types';

export async function issueSession(c: Context<WorkerEnv>): Promise<void> {
	await setSignedCookie(c, SESSION_COOKIE, `${SESSION_SUBJECT}.${Date.now() + SESSION_MAX_AGE_SECONDS * 1000}`, c.env.SESSION_SECRET, {
		httpOnly: true,
		secure: new URL(c.req.url).protocol === 'https:',
		sameSite: 'Lax',
		path: '/',
		maxAge: SESSION_MAX_AGE_SECONDS,
	});
}

export async function hasValidSession(c: Context<WorkerEnv>): Promise<boolean> {
	if (!c.env.SESSION_SECRET) return false;
	const value = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
	if (value === undefined || value === false) return false;

	const [subject, expiresAt] = value.split('.');
	return subject === SESSION_SUBJECT && Number.isFinite(Number(expiresAt)) && Number(expiresAt) > Date.now();
}

export function clearSession(c: Context<WorkerEnv>): void {
	deleteCookie(c, SESSION_COOKIE, { path: '/' });
}
