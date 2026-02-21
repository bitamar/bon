# T-API-01 — API Hardening

**Type:** Bug fixes + security hardening
**Priority:** High — do before T05 deploy
**Found during:** Full API audit (2026-02-21)
**Status:** ⬜ Not started

---

## Context

A full audit of the API against the production plan surfaced issues across businesses, customers, and cross-cutting infrastructure. Most T04 patch items have been fixed, but several remain and new cross-cutting issues were found. These should all be fixed in one pass before the customer frontend (T05) goes to production.

---

## Issues — Ordered by Priority

### 1. Business creation is not transactional [data integrity]

**File:** `api/src/services/business-service.ts:91-132`

`insertBusiness()` and `insertUserBusiness()` are two separate DB calls. If the second fails (crash, connection drop), the database has an orphaned business with no owner. No one can access or delete it.

**Fix:** Wrap both operations in a single Drizzle transaction:
```
await db.transaction(async (tx) => {
  const business = await tx.insert(businesses).values(...).returning();
  await tx.insert(userBusinesses).values({ ..., businessId: business[0].id });
  return business[0];
});
```

Requires passing `tx` through the repository layer. Establish the transaction pattern now — invoice creation (Phase 2) will need it for sequence number assignment.

**Test:** Mock a failure on `insertUserBusiness` and verify no business row exists.

---

### 2. `PUT /businesses/:businessId` should be `PATCH` [HTTP semantics]

**File:** `api/src/routes/businesses.ts:74`

The update schema (`updateBusinessBodySchema`) has all-optional fields — this is PATCH semantics. Customer routes already use PATCH correctly. Business routes are inconsistent.

**Fix:** Change `app.put()` to `app.patch()` on the business update route. CORS already includes PATCH in the methods list.

**Impact:** Any existing frontend code calling `PUT` must switch to `PATCH`. Since T05 hasn't shipped, this is free to change now.

---

### 3. `POST /businesses` returns 200 instead of 201 [HTTP semantics]

**File:** `api/src/routes/businesses.ts:28-30`

Customer creation correctly returns 201. Business creation returns 200.

**Fix:** Change response schema key from `200` to `201`, add `reply.status(201).send(result)` like the customer route does.

---

### 4. Fragile 23505 error handling in customer service [correctness]

**File:** `api/src/services/customer-service.ts:110`

```typescript
if (isErrorWithCode(err, '23505')) {
  await throwDuplicateTaxIdConflict(businessId, input.taxId ?? null);
}
```

Any unique constraint violation (23505) is assumed to be a duplicate taxId. If a second unique constraint is ever added to the customers table, it would be misidentified. The business service already uses `extractConstraintName()` for this exact reason.

**Fix:** Use `extractConstraintName(err) === 'customers_business_id_tax_id_unique'` before throwing the duplicate_tax_id error. Fall through to generic conflict for any other constraint.

Apply the same fix in both `createCustomer` and `updateCustomerById`.

---

### 5. LIKE pattern injection in customer search [security]

**File:** `api/src/repositories/customer-repository.ts:55-58`

```typescript
ilike(customers.name, `%${query}%`)
```

The `query` is interpolated into a LIKE pattern without escaping. LIKE wildcards `%` and `_` in user input would match unintended rows. Searching for `%` matches everything. Searching for `_` matches any single character.

This isn't SQL injection (Drizzle parameterizes the value), but it's LIKE pattern injection that produces wrong results.

**Fix:** Escape LIKE special characters before interpolation:
```typescript
function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}
// then:
ilike(customers.name, `%${escapeLikePattern(query)}%`)
```

Put `escapeLikePattern` in a shared utility (e.g., `api/src/lib/query-utils.ts`) — every future search endpoint needs this.

**Test:** Search for a query containing `%` and verify it doesn't match all customers.

---

### 6. `findCustomerByTaxId` matches soft-deleted customers [UX bug]

**File:** `api/src/repositories/customer-repository.ts:34-39`

When checking for duplicate taxId (on create or update), the query doesn't filter by `isActive`. A user who deletes a customer and then creates a new one with the same taxId gets a 409 conflict showing the deleted customer's name.

The DB unique index is `WHERE tax_id IS NOT NULL` but doesn't filter by `isActive` either — so this is consistent but wrong. Two options:

**Option A (simpler):** Add `eq(customers.isActive, true)` to `findCustomerByTaxId`. The DB constraint still prevents the insert (because deleted rows with that taxId exist), so the error is correct, but the message should say "a previously deleted customer has this tax ID" or offer to reactivate.

**Option B (correct):** Change the unique index to `WHERE tax_id IS NOT NULL AND is_active = true`. This allows reusing a taxId after deletion. Requires a migration. This is the better long-term answer.

**Recommendation:** Option B — a deleted customer should not block creating a new one with the same taxId. Add a migration to update the index.

---

### 7. No upper bound on query limit [security — overlaps T-SEC-01]

**File:** `types/src/customers.ts:132-136`

The `limit` query param accepts any positive integer. `?limit=999999999` would try to return the entire table.

**Fix:** Add `.pipe(z.number().int().min(1).max(200))` after the transform. This is the same fix described in T-SEC-01 — implement it here as part of this pass.

Also add limits to other list endpoints that have none: `GET /businesses` (no limit at all), `GET /businesses/:id/team` (no limit), `GET /businesses/:id/invitations` (no limit). These are smaller tables but the principle of bounded responses should be universal.

---

### 8. No rate limit differentiation [security]

**File:** `api/src/app.ts:61-71`

One global rate limit (default 100 req/min) for all endpoints. Health checks, auth, and CRUD share the same bucket. A monitoring system hitting `/health` 100 times would lock a user out of real operations.

**Fix:** Apply per-route rate limits on sensitive endpoints:
- Auth endpoints: stricter limit (e.g., 10/min for `/auth/google`)
- Write endpoints (POST/PATCH/DELETE): moderate limit (e.g., 30/min)
- Health check: exclude from rate limiting entirely
- Read endpoints: keep the global default

Fastify rate-limit supports `routeConfig` and per-route `config.rateLimit` overrides.

---

## Out of Scope (tracked, not blocking)

These are real issues but don't block T05 and can be fixed later:

| Issue | Why defer |
|-------|-----------|
| `nextInvoiceNumber` on businesses table will conflict with Phase 2 `invoice_sequences` table | Phase 2 will replace it — no point touching it now |
| Session cleanup cron (expired sessions accumulate) | Low urgency — sessions are checked on access, stale rows waste space but don't cause bugs |
| `isActive` + `deletedAt` redundancy | Cosmetic, code keeps them in sync, refactor is invasive for no functional gain |
| Invitation token in URL path (leaks via referrer/logs) | Correct but low risk for internal invitations; address when building public-facing flows |
| Idempotency keys on POST endpoints | Important for production reliability but not blocking customer frontend |

---

## Acceptance Criteria

- [ ] Business creation wrapped in a transaction
- [ ] `PUT /businesses/:businessId` changed to `PATCH`
- [ ] `POST /businesses` returns 201
- [ ] Customer service uses `extractConstraintName` for 23505 errors
- [ ] LIKE special chars escaped in customer search
- [ ] Soft-deleted customers don't block new customers with same taxId (index migration)
- [ ] Query limit capped at 200 on all list endpoints
- [ ] Rate limiting: `/health` excluded, auth endpoints have stricter limits
- [ ] `npm run check` passes
- [ ] Existing tests still pass
- [ ] New tests for: transaction rollback, LIKE escaping, reactivated taxId

---

## Files Expected to Change

| File | Change |
|------|--------|
| `api/src/routes/businesses.ts` | PUT → PATCH, 200 → 201 |
| `api/src/services/business-service.ts` | Wrap creation in transaction |
| `api/src/services/customer-service.ts` | Use extractConstraintName |
| `api/src/repositories/customer-repository.ts` | Escape LIKE, filter findCustomerByTaxId |
| `api/src/lib/query-utils.ts` | **New:** escapeLikePattern utility |
| `api/src/app.ts` | Per-route rate limit config |
| `api/src/db/schema.ts` | Update unique index to filter by isActive |
| `types/src/customers.ts` | Cap limit at 200 |
| `api/drizzle/0003_*.sql` | **New migration:** update unique index |
| `api/tests/services/business-service.test.ts` | Transaction rollback test |
| `api/tests/repositories/customer-repository.test.ts` | LIKE escape test, taxId reuse test |
| `api/tests/routes/customers.test.ts` | Limit cap test |
| `api/tests/routes/businesses.test.ts` | PATCH method, 201 status |
