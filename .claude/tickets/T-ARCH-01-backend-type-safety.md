# T-ARCH-01 — Backend Type Safety & Data Layer Cleanup

**Status**: ✅ Done
**Phase**: Cross-cutting (architecture)
**Requires**: T7.5 merged
**Blocks**: T08 (prevents latent bugs from propagating into finalization and beyond)

---

## What & Why

Architecture review found several type safety and data-layer consistency issues that create latent bug risk. Individually small, collectively they form a pattern of "type safety holes at the service-repository boundary." Fixing them before T08 (which adds finalization, the most correctness-critical flow) prevents compounding debt.

---

## Items

### 1. Replace `Record<string, unknown>` with typed partials

**Files**: `api/src/services/customer-service.ts:128`, `api/src/services/invoice-service.ts:234`

Both services build update objects as `Record<string, unknown>` then cast with `as Parameters<typeof ...>[2]`. A field name typo compiles fine but fails silently.

**Fix**: Build a properly typed `Partial<CustomerInsert>` / `Partial<InvoiceInsert>` directly using conditional spreading:

```typescript
// BEFORE (unsafe)
const updates: Record<string, unknown> = { updatedAt: now };
if (input.name != null) updates['name'] = input.name;
// ... cast at the end

// AFTER (type-safe)
const updates: Partial<CustomerInsert> = {
  updatedAt: now,
  ...(input.name != null && { name: input.name }),
  ...(input.email !== undefined && { email: input.email }),
  // ...
};
```

### 2. Make txOrDb consistent across all repositories

**Files**: `api/src/repositories/invoice-repository.ts` (has txOrDb on all 7 functions), `api/src/repositories/customer-repository.ts` (does NOT have txOrDb on any function), `api/src/repositories/business-repository.ts` (does NOT have txOrDb on any function)

Invoice repository accepts optional `txOrDb` parameter on all functions (verified). Customer repository and business repository do not accept `txOrDb` on any function (verified). This means `findCustomerById` and `findBusinessById` called during finalization run outside the transaction — a correctness gap that T-ARCH-02 depends on fixing.

**Fix**: Add optional `txOrDb: DbOrTx = db` parameter to all customer-repository and business-repository functions. Extract the `DbOrTx` type to a shared location (e.g., `api/src/db/types.ts`).

### 3. Numeric column type safety

**Files**: `api/src/db/schema.ts:276-278`, `api/src/services/invoice-service.ts:78-80`

Drizzle `numeric(12, 4)` columns (`quantity`, `discountPercent`) are returned as **strings** by the pg driver. The service layer manually calls `Number()`. If a new numeric column is added and the conversion is forgotten, the API returns strings where Zod expects numbers — runtime error only.

**Fix**: Create a `toNumber()` helper in `api/src/lib/` that both converts and validates. Use it consistently in all serialization functions. Consider a `numericAsNumber` custom Drizzle column type if Drizzle supports it.

### 4. Drizzle enum / Zod enum sync

**Files**: `api/src/db/schema.ts` (pgEnum), `types/src/*.ts` (z.enum)

Drizzle enums and Zod enums are defined separately with no shared constant. Adding a value to one and forgetting the other surfaces only at runtime.

**Fix**: Define the enum values as a `const` array in `types/`, then use that array in both Drizzle's `pgEnum()` and Zod's `z.enum()`. Example:

```typescript
// types/src/invoices.ts
export const DOCUMENT_TYPES = ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'credit_note'] as const;
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

// api/src/db/schema.ts
import { DOCUMENT_TYPES } from '@bon/types/invoices';
export const documentTypeEnum = pgEnum('document_type', DOCUMENT_TYPES);
```

### 5. Soft delete consistency

**Files**: `api/src/db/schema.ts` (customers + businesses use `isActive` + `deletedAt`)

Both `isActive: boolean` and `deletedAt: timestamp` exist for soft delete. The dual-flag pattern is redundant — `deletedAt IS NOT NULL` could replace `isActive = false`.

**Fix**: Pick one pattern. Recommended: keep `deletedAt` only, derive `isActive` as `deletedAt IS NULL` via a computed/virtual column or a query helper. Update the partial unique index to use `WHERE deleted_at IS NULL`. Update all queries that check `isActive`.

**Alternative (smaller scope)**: Keep both but add a DB-level CHECK constraint enforcing `(isActive = true AND deletedAt IS NULL) OR (isActive = false AND deletedAt IS NOT NULL)`.

---

## Acceptance Criteria

- [x] No `Record<string, unknown>` in service update builders — all typed as `Partial<*Insert>`
- [x] All repository functions in customer-repository and business-repository accept optional `txOrDb` parameter (matching invoice-repository pattern)
- [x] Numeric column conversions use a shared helper
- [x] At least one enum (documentType or invoiceStatus) uses shared const array between Drizzle and Zod
- [x] Soft delete pattern is consistent (either single-flag or constrained dual-flag)
- [x] `npm run check` passes
- [x] Existing tests still pass (no behavior change)

---

## Scope

Target: ~8–12 files changed. No new features, no new endpoints. Pure refactor.

---

## Links

- Branch: `claude/implement-arch-tickets-PORUw`
- PR: `#29`
- Deployed: ⬜
