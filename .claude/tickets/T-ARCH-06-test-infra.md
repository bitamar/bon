# T-ARCH-06 — Replace pg-mem with testcontainers

**Status**: ⬜ Not started
**Phase**: Cross-cutting (test infrastructure)
**Requires**: Nothing (independent)
**Blocks**: Nothing (can be done any time, but post-MVP is fine)
**Priority**: Low — post-MVP

---

## What & Why

`api/src/db/client.ts` has ~120 lines of monkey-patching (`patchPgMemQuery`, `patchPgMemPool`) to make pg-mem work with Drizzle's query patterns. This:

- Is fragile (any Drizzle, pg, or pg-mem version update could break it)
- Makes it unclear whether test failures are app bugs or pg-mem compatibility issues
- Mimics pg driver internals (row-mode conversion, type parser stripping)
- Cannot test `SELECT ... FOR UPDATE`, advisory locks, or other Postgres-specific features
- Cannot test race conditions (pg-mem is single-threaded)

---

## Design

Replace pg-mem with `@testcontainers/postgresql`:

1. Start a real PostgreSQL container once per test suite (`beforeAll`)
2. Apply migrations via Drizzle
3. Each test gets a fresh schema (or truncated tables)
4. Stop the container after all tests (`afterAll`)

```typescript
// api/tests/setup.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start();
  process.env.DATABASE_URL = container.getConnectionUri();
  // Apply migrations
}, 30_000);

afterAll(async () => {
  await container.stop();
});
```

---

## Acceptance Criteria

- [ ] All API tests run against a real PostgreSQL 16 container
- [ ] pg-mem dependency removed
- [ ] All monkey-patching code in `client.ts` removed (~120 lines)
- [ ] `client.ts` is under 20 lines (just `new Pool` + `drizzle(pool)`)
- [ ] `SELECT ... FOR UPDATE` tests actually test locking behavior
- [ ] Test runtime stays under 30 seconds (container startup cached)
- [ ] CI pipeline works (Docker-in-Docker or pre-pulled image)
- [ ] `npm run check` passes

---

## Risks

- CI environments may not support Docker — need to verify
- First test run is slower (container pull + startup ~5-10s)
- Requires Docker on developer machines

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
