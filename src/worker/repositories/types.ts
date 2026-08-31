import { createDb } from '../../db/client';

export type Database = ReturnType<typeof createDb>;
