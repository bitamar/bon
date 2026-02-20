# T04 — Customer Backend (API + DB)

**Status**: 🔄 In Progress (`t4-customer-backend`)
**Phase**: 1 — Customers
**Requires**: T03 deployed
**Blocks**: T05

---

## What & Why

You can't create an invoice without a recipient. The customer record stores the tax identity information that must appear on every invoice by law. Getting the schema right now prevents broken invoices later — the `isLicensedDealer` flag in particular drives the SHAAM obligation in Phase 4.

---

## What Was Built (API only — no frontend yet)

- `customers` table in schema
- `customer-repository.ts`
- `customer-service.ts`
- `routes/customers.ts`: CRUD + search (`?q=`)
- Zod schemas in `types/`: `createCustomerBodySchema`, `updateCustomerBodySchema`, `customerSchema`
- Soft delete (`isActive`)
- Unique constraint: `(businessId, taxId)` — see patch item 5 below

---

## Acceptance Criteria

- [x] `POST /businesses/:id/customers` — create
- [x] `GET /businesses/:id/customers?q=` — search by name + taxId
- [x] `GET /businesses/:id/customers/:customerId` — detail
- [x] `PATCH /businesses/:id/customers/:customerId` — update
- [x] `DELETE /businesses/:id/customers/:customerId` — soft delete
- [x] Duplicate taxId within same business returns 409
- [x] `npm run check` passes
- [ ] Deployed to production

---

## T04 Patch — Required Before T05

Deep review (product + architect) found 10 issues ranging from blocking to medium. All should be fixed in a single patch before deploying and starting T05.

### Blocking (T05 cannot work without these)

**1. PUT → PATCH + CORS**
- `routes/customers.ts:76` uses `app.put()` but schema allows partial updates — wrong HTTP verb
- `app.ts:54` CORS `methods` array does not include `PATCH`
- Fix: change route to `app.patch()`, add `'PATCH'` to CORS methods

**2. 409 response missing existing customer info**
- `customer-service.ts:94` throws `conflict({ code: 'duplicate_tax_id' })` with no details
- T05 needs `existingCustomerId` and `existingCustomerName` to show a conflict link
- Fix: add `findCustomerByTaxId(businessId, taxId)` repository method, query existing customer on 23505 catch, include `{ existingCustomerId, existingCustomerName }` in error `details`
- The error serializer (`plugins/errors.ts:65`) already exposes `details` — no change needed there

**3. No repository tests**
- CLAUDE.md: "Every new repository method must have a test"
- Zero tests exist for `insertCustomer`, `findCustomerById`, `updateCustomer`, `searchCustomers`
- Fix: add `api/tests/repositories/customer-repository.test.ts`

**4. No integration test for duplicate detection**
- `customers.test.ts:94` mocks the service — the actual DB unique constraint is never exercised
- Fix: add integration test that creates two customers with same taxId and verifies 409 from the real constraint

### Medium (correctness and robustness)

**5. Unique constraint not partial**
- `schema.ts:216` uses plain `unique()` — accidentally works (PG treats NULLs as distinct) but doesn't match the plan's `WHERE taxId IS NOT NULL` spec
- Fix: change to `uniqueIndex('customers_business_id_tax_id_unique').on(table.businessId, table.taxId).where(isNotNull(table.taxId))`
- Requires new migration

**6. Checksum validation too narrow**
- `types/src/customers.ts:55` — `validateIsraeliId` only runs for `personal_id`
- Israeli ח.פ. and ע.מ. use the same 9-digit Luhn-variant checksum
- Invalid ח.פ. numbers will pass validation now and fail SHAAM in Phase 4
- Fix: apply checksum to all `taxIdType` values except `none`, in both `createCustomerBodySchema` and `updateCustomerBodySchema`

**7. `deletedAt` not cleared on re-activation**
- `customer-service.ts:120-123` sets `deletedAt` on soft delete but never clears it on re-activate
- Fix: set `deletedAt: null` when `isActive: true`

**8. Fragile 23505 error handling**
- `customer-service.ts:93` catches any 23505 as `duplicate_tax_id` — if another unique constraint is added, it gets misidentified
- Business service uses `extractConstraintName()` for this — customer service should too
- Fix: check constraint name before deciding error code; move `extractConstraintName` to a shared location if not already shared

**9. Missing search/filter tests**
- No test verifies search actually filters results (only checks `statusCode === 200`)
- No test for `?active=false` showing inactive customers
- Fix: add tests that create multiple customers and assert filtering

**10. `name: null` allowed in update schema**
- `types/src/customers.ts:62` uses `optionalNullableString` for `name`, but DB column is `NOT NULL`
- Sending `null` causes a DB error instead of a clean validation error
- Fix: change to `nonEmptyString.optional()` (nullable not appropriate for a required DB column)

### Low (fix opportunistically)

**11. POST returns 200, should be 201**
- `routes/customers.ts:49` — HTTP convention for resource creation

**12. List schema missing fields for Phase 2**
- `customerListItemSchema` lacks `streetAddress` and `email`
- Invoice creation needs customer address for snapshot; without it, a second detail API call is needed
- Cheap to add now, multi-file change if deferred

---

## Architecture Notes

### Patterns followed correctly
- Repository → service → route layering matches business-service pattern
- Multi-tenant isolation: every query scopes by `businessId`
- All routes authenticated with `preHandler: [app.authenticate, app.requireBusinessAccess]`
- Zod validates at API boundary, `satisfies` verifies return types in service
- Soft delete preserves data (no hard delete)

### Patterns diverged from
- Business service uses `extractConstraintName` for 23505 — customer service should too
- Business routes return proper status codes — customer POST should return 201
- `userBusinesses` table uses `uniqueIndex(...).where()` for partial unique — customer table should too

### Forward compatibility (Phase 2)
- Invoice schema needs `customerName`, `customerTaxId`, `customerAddress` snapshots — current customer schema has all source fields
- `customerAddress` will be composed from `streetAddress + city + postalCode` at invoice creation time
- `isLicensedDealer` correctly positioned to drive SHAAM trigger logic in Phase 4
- Customer search API (`?q=`) adequate for invoice creation combobox

---

## Links

- Branch: `main` (merged via PR #3)
- PR: #3
- Deployed: ⬜
