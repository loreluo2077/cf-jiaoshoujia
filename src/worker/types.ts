import type { Hono } from 'hono';

export type WorkerEnv = { Bindings: Env; Variables: { requestId: string } };
export type WorkerApp = Hono<WorkerEnv>;
