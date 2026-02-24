# T14 — SHAAM Emergency Numbers & Error Handling

**Status**: 📝 Needs spec work (Product + Architect + UI Designer pass required)
**Phase**: 4 — SHAAM Integration
**Requires**: T13 merged
**Blocks**: nothing (T15 no longer depends on T14 — corrected)

---

## What & Why

SHAAM goes down. When it does, businesses still need to issue invoices. The ITA allows pre-acquired emergency allocation numbers — the business requests a pool of them in advance from ITA directly, then enters them into BON. When SHAAM is unavailable, BON draws from this pool.

This ticket also covers the full error taxonomy: each ITA error code needs a distinct response, not a generic "something went wrong."

---

## Recommended PR Split

- **PR 1 — Backend**: `emergency_allocation_numbers` table + migration, repository (with SELECT FOR UPDATE for atomic consumption), emergency number consumption logic in ShaamService, ITA error code constants, error handling in allocation flow, tests
- **PR 2 — Frontend**: Settings page section for emergency number management, low-pool warning banner, error display on invoice detail, tests

---

## Acceptance Criteria

### Emergency Number Pool

- [ ] Migration creates `emergency_allocation_numbers` table:
  ```
  id                uuid PK
  businessId        uuid FK → businesses NOT NULL
  number            text NOT NULL
  used              boolean NOT NULL DEFAULT false
  usedForInvoiceId  uuid FK → invoices (nullable)
  usedAt            timestamp with tz (nullable)
  acquiredAt        timestamp with tz NOT NULL DEFAULT now()

  UNIQUE (businessId, number)
  INDEX (businessId, used) WHERE used = false    — for fast lookup of available numbers
  ```
- [ ] Drizzle schema in `api/src/db/schema.ts`
- [ ] Repository in `api/src/repositories/emergency-numbers-repository.ts`:
  - `addNumbers(businessId, numbers: string[]): Promise<void>` — bulk insert, ignore duplicates
  - `consumeNext(businessId, invoiceId, txOrDb?): Promise<string | null>` — SELECT FOR UPDATE the first unused number, mark as used, return the number. Returns null if pool is empty.
  - `countAvailable(businessId): Promise<number>`
  - `listAll(businessId): Promise<EmergencyNumber[]>` — for settings page display
  - `deleteUnused(businessId, numberId): Promise<boolean>` — only delete if not used

### Atomic Consumption (Race-Safe)

- [ ] `consumeNext()` uses `SELECT ... FOR UPDATE` inside a transaction to prevent two concurrent requests from consuming the same number
- [ ] Pattern:
  ```typescript
  async function consumeNext(businessId: string, invoiceId: string, tx: TxOrDb): Promise<string | null> {
    const [available] = await tx
      .select()
      .from(emergencyAllocationNumbers)
      .where(and(
        eq(emergencyAllocationNumbers.businessId, businessId),
        eq(emergencyAllocationNumbers.used, false),
      ))
      .orderBy(emergencyAllocationNumbers.acquiredAt)
      .limit(1)
      .for('update');

    if (!available) return null;

    await tx
      .update(emergencyAllocationNumbers)
      .set({ used: true, usedForInvoiceId: invoiceId, usedAt: new Date() })
      .where(eq(emergencyAllocationNumbers.id, available.id));

    return available.number;
  }
  ```

### Integration with Allocation Flow (T13)

- [ ] When `ShaamService.requestAllocationNumber()` returns `{ status: 'emergency' }` or SHAAM returns E099 (system unavailable):
  1. Call `consumeNext(businessId, invoiceId)`
  2. If number available: store as `allocationNumber`, set `allocationStatus = 'emergency'`
  3. If pool empty: set `allocationStatus = 'deferred'`, log critical warning
- [ ] Emergency numbers are reported back to SHAAM when it recovers (bulk report job)

### Emergency Number Reporting (when SHAAM recovers)

- [ ] `reportEmergencyUsage(businessId, usedNumbers[])` on ShaamService — sends used emergency numbers to ITA
- [ ] Triggered manually from settings page ("דווח מספרים שנוצלו") or automatically when the next successful allocation request completes
- [ ] On report success: log confirmation
- [ ] On report failure: retry on next attempt, do not block normal operations

### ITA Error Code Constants

- [ ] Error constants defined in `api/src/lib/shaam/error-codes.ts`:
  ```typescript
  export const SHAAM_ERRORS = {
    E001: { code: 'E001', hebrewMessage: 'מספר מע"מ לא תקין', action: 'show_to_user' },
    E002: { code: 'E002', hebrewMessage: 'החשבונית כבר קיבלה מספר הקצאה', action: 'idempotent' },
    E003: { code: 'E003', hebrewMessage: 'מתחת לסף — אין צורך בהקצאה', action: 'logic_error' },
    E010: { code: 'E010', hebrewMessage: 'שגיאת אימות — נדרשת הרשאה מחדש', action: 'reauth' },
    E099: { code: 'E099', hebrewMessage: 'מערכת שע"מ אינה זמינה', action: 'use_emergency' },
  } as const;
  ```
- [ ] Error handling per action type:
  - `show_to_user`: Display Hebrew message on invoice detail, set `allocationStatus = 'rejected'`
  - `idempotent`: Store the returned number (SHAAM returns it even for duplicates), set `allocationStatus = 'approved'`
  - `logic_error`: Log as critical — this means our trigger logic has a bug (shouldn't be requesting for below-threshold)
  - `reauth`: Set `needsReauth = true` on credentials, set `allocationStatus = 'deferred'`
  - `use_emergency`: Consume emergency number from pool

### Settings Page: Emergency Number Management

- [ ] New section in business settings page: "מספרי הקצאה לחירום"
- [ ] **Add numbers**: `Textarea` for bulk entry (one number per line), "הוסף" button
  - Validates: non-empty, strips whitespace, deduplicates
  - API: `POST /businesses/:businessId/emergency-numbers` with `{ numbers: string[] }`
- [ ] **Pool display**: Table showing all numbers with status (available / used for invoice #X)
- [ ] **Delete unused**: ActionIcon on unused numbers only
  - API: `DELETE /businesses/:businessId/emergency-numbers/:numberId`
- [ ] **Pool count badge**: "X מספרים זמינים"
- [ ] **Low pool warning**: When available count < 5, show Alert (color="red"): "נותרו רק {count} מספרי חירום. מומלץ להוסיף עוד מספרים."
- [ ] **Report button**: "דווח מספרים שנוצלו" — calls `POST /businesses/:businessId/emergency-numbers/report`

### Frontend: Error Display on Invoice Detail

- [ ] All error states visible on invoice detail page with actionable next steps:
  - `allocationStatus = 'rejected'` + `allocationError`: Red banner with Hebrew error message from `SHAAM_ERRORS`
  - `allocationStatus = 'emergency'`: Yellow banner "הונפק עם מספר חירום {number}" + "דווח לשע"מ" link to settings
  - `allocationStatus = 'deferred'`: Gray banner "ממתין לשע"מ — ייעשה ניסיון חוזר" with retry button

### General

- [ ] `npm run check` passes
- [ ] Tests: emergency number consumption (race-safe test with concurrent calls), error code handling, pool count, settings page CRUD

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
