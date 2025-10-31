import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { PoolClient, QueryConfig } from 'pg';
import * as schema from './schema.js';

const isTest = process.env['NODE_ENV'] === 'test';

type QueryConfigWithTypes = QueryConfig & {
  types?: {
    getTypeParser?: unknown;
  };
};

const PG_MEM_PATCHED = Symbol('pgMemPatched');

type PatchedQueryable = {
  [PG_MEM_PATCHED]?: boolean;
};

type QueryConfigExtended = QueryConfigWithTypes & {
  rowMode?: string;
};

type QueryResultObject = {
  rows: unknown[];
  fields?: Array<{ name: string }>;
};

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function sanitizePgMemQueryConfig(config: QueryConfigExtended): {
  config: QueryConfigExtended;
  rowModeArray: boolean;
} {
  let sanitizedConfig: QueryConfigExtended = config;
  let mutated = false;

  const { types } = config;
  if (types && typeof types === 'object' && 'getTypeParser' in types) {
    sanitizedConfig = { ...sanitizedConfig };
    mutated = true;
    delete sanitizedConfig.types;
  }

  const rowModeArray = sanitizedConfig.rowMode === 'array';
  if (rowModeArray) {
    if (!mutated) {
      sanitizedConfig = { ...sanitizedConfig };
    }
    delete sanitizedConfig.rowMode;
  }

  return { config: sanitizedConfig, rowModeArray };
}

function mapRowsToArrays(result: QueryResultObject): QueryResultObject {
  if (!Array.isArray(result.fields)) {
    return result;
  }

  let fieldNames = result.fields.map((field) => field.name);
  let fields = result.fields;

  if (fieldNames.length === 0 && result.rows.length > 0) {
    const sampleRow = result.rows[0];
    if (sampleRow && typeof sampleRow === 'object' && !Array.isArray(sampleRow)) {
      fieldNames = Object.keys(sampleRow as Record<string, unknown>);
      fields = fieldNames.map((name) => ({ name }));
    }
  }

  if (fieldNames.length === 0) {
    return result;
  }

  const rows = result.rows.map((row) => {
    if (Array.isArray(row)) {
      return row;
    }
    if (!row || typeof row !== 'object') {
      return fieldNames.map(() => undefined);
    }
    const record = row as Record<string, unknown>;
    return fieldNames.map((name) => record[name]);
  });

  return {
    ...result,
    fields,
    rows,
  };
}

function patchPgMemQuery<T extends { query: pg.Pool['query'] }>(queryable: T): T {
  const marker = queryable as unknown as PatchedQueryable;
  if (marker[PG_MEM_PATCHED]) return queryable;

  const originalQuery = queryable.query as (...args: unknown[]) => unknown;

  queryable.query = function patchedQuery(
    this: unknown,
    queryTextOrConfig: unknown,
    ...rest: unknown[]
  ) {
    const args = [...rest];
    if (queryTextOrConfig && typeof queryTextOrConfig === 'object' && 'text' in queryTextOrConfig) {
      const { config: sanitizedConfig, rowModeArray } = sanitizePgMemQueryConfig(
        queryTextOrConfig as QueryConfigExtended
      );
      if (!rowModeArray) {
        return originalQuery.apply(this, [sanitizedConfig, ...args]);
      }

      const maybeCallback = args.length > 0 ? args[args.length - 1] : undefined;

      if (typeof maybeCallback === 'function') {
        const originalCallback = maybeCallback as (err: unknown, result: unknown) => void;
        const patchedArgs: unknown[] = [
          ...args.slice(0, -1),
          function patchedCallback(err: unknown, result: unknown) {
            if (err || !result) {
              originalCallback(err, result);
              return;
            }
            originalCallback(err, mapRowsToArrays(result as QueryResultObject));
          },
        ];
        return originalQuery.apply(this, [sanitizedConfig, ...patchedArgs]);
      }

      const result = originalQuery.apply(this, [sanitizedConfig, ...args]) as unknown;
      if (isPromiseLike(result)) {
        return (result as PromiseLike<unknown>).then((queryResult) =>
          mapRowsToArrays(queryResult as QueryResultObject)
        );
      }

      if (result && typeof result === 'object') {
        return mapRowsToArrays(result as QueryResultObject);
      }

      return result;
    }

    return originalQuery.apply(this, [queryTextOrConfig as unknown, ...args]);
  } as typeof queryable.query;

  marker[PG_MEM_PATCHED] = true;
  return queryable;
}

function patchPgMemPool(pool: pg.Pool): pg.Pool {
  patchPgMemQuery(pool);

  const originalConnect = pool.connect.bind(pool);

  pool.connect = function patchedConnect(
    callback?: (
      err: Error | undefined,
      client: PoolClient | undefined,
      done: (release?: unknown) => void
    ) => void
  ) {
    if (typeof callback === 'function') {
      return originalConnect((err, client, done) => {
        if (!err && client) {
          patchPgMemQuery(client);
        }
        callback(err, client, done);
      });
    }

    return originalConnect().then((client) => {
      patchPgMemQuery(client);
      return client;
    });
  } as typeof pool.connect;

  return pool;
}

function createPgMemPool(
  newDb: typeof import('pg-mem').newDb,
  DataType: typeof import('pg-mem').DataType
): pg.Pool {
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: randomUUID,
    impure: true,
  });
  mem.public.registerFunction({
    name: 'json_build_array',
    returns: DataType.jsonb,
    argsVariadic: DataType.jsonb,
    implementation: (...values: unknown[]) => JSON.stringify(values),
  });

  const migrationsDir = fileURLToPath(new URL('../../drizzle', import.meta.url));
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const contents = readFileSync(join(migrationsDir, file), 'utf8');
    const statements = contents
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      mem.public.none(statement);
    }
  }

  const adapter = mem.adapters.createPg();
  const Pool = adapter.Pool as unknown as typeof pg.Pool;
  const pool = new Pool() as unknown as pg.Pool;
  return patchPgMemPool(pool);
}

let pool: pg.Pool;

if (isTest) {
  const { newDb, DataType } = await import('pg-mem');
  pool = createPgMemPool(newDb, DataType);
} else {
  pool = new pg.Pool({ connectionString: env.DATABASE_URL });
}

let poolClosing = false;
let poolEnded = false;

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export async function closeDb() {
  if (poolClosing || poolEnded) return;
  poolClosing = true;
  try {
    await pool.end();
    poolEnded = true;
  } finally {
    poolClosing = false;
  }
}
