import { env } from '../env.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export async function closeDb() {
  await pool.end();
}
