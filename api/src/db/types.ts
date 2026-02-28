import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema.js';

export type DbOrTx = NodePgDatabase<typeof schema>;
