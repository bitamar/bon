import 'dotenv/config';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, vi } from 'vitest';

// Set consistent defaults for test env.
process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.GOOGLE_CLIENT_ID = 'client-id';
process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
process.env.URL = 'http://localhost:3000';
process.env.RATE_LIMIT_MAX = '100';
process.env.RATE_LIMIT_TIME_WINDOW = '1000';

// ── Provision a real PostgreSQL database for tests ──

async function provisionTestDatabase(): Promise<string> {
  // 1. Try testcontainers (requires a running Docker daemon)
  try {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:16').start();
    return container.getConnectionUri();
  } catch {
    // Docker unavailable — fall through to native PostgreSQL
  }

  // 2. Fall back to native PostgreSQL with a dedicated test database.
  //    The database is created once and reused across runs; resetDb() handles
  //    inter-test isolation via TRUNCATE.
  const adminUrl =
    process.env['TEST_PG_ADMIN_URL'] ?? 'postgres://postgres:postgres@localhost:5432/postgres';
  const dbName = 'bon_test';
  const adminClient = new pg.Client({ connectionString: adminUrl });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE "${dbName}"`).catch((err: { code?: string }) => {
    // 42P04 = database already exists — perfectly fine for reuse
    if (err.code !== '42P04') throw err;
  });
  await adminClient.end();

  const baseUrl = adminUrl.replace(/\/[^/]+$/, '');
  return `${baseUrl}/${dbName}`;
}

process.env.DATABASE_URL = await provisionTestDatabase();

// Apply Drizzle migrations so the schema is ready for tests.
const { db } = await import('../src/db/client.js');
const { migrate } = await import('drizzle-orm/node-postgres/migrator');
await migrate(db, { migrationsFolder: join(import.meta.dirname, '../drizzle') });

// Avoid hitting the real Google OIDC discovery endpoint during tests.
vi.mock('openid-client', () => {
  const discovery = vi.fn(async (_issuer: URL, clientId: string) => ({
    authorization_endpoint: 'https://example.com/oauth2/v2/auth',
    token_endpoint: 'https://example.com/oauth2/v2/token',
    issuer: 'https://example.com',
    jwks_uri: 'https://example.com/.well-known/jwks.json',
    response_types_supported: ['code'],
    id_token_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256'],
    client_id: clientId,
  }));

  const buildAuthorizationUrl = vi.fn(
    () => new URL('https://example.com/oauth2/v2/auth?state=state&nonce=nonce')
  );

  const authorizationCodeGrant = vi.fn(async () => ({
    claims: () => ({
      sub: 'google-user',
      email: 'tester@example.com',
      email_verified: true,
      name: 'Test User',
      picture: 'https://example.com/avatar.png',
    }),
  }));

  return {
    __esModule: true,
    discovery,
    buildAuthorizationUrl,
    authorizationCodeGrant,
    randomState: vi.fn(() => 'state'),
    randomNonce: vi.fn(() => 'nonce'),
    ClientSecretPost: vi.fn(() => ({ type: 'client_secret_post' })),
  };
});

afterAll(async () => {
  try {
    const { closeDb } = await import('../src/db/client.js');
    await closeDb();
  } catch {
    // Ignore: DB client was never initialised.
  }
});
