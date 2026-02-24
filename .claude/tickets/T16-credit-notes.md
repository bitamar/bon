# T16 — Credit Notes (חשבונית מס זיכוי)

**Status**: 📝 Needs spec work (Product + Architect + UI Designer pass required)
**Phase**: 5 — Invoice Lifecycle
**Requires**: T15 merged
**Blocks**: nothing directly (T17 absorbed into T-CRON-01)

---

## What & Why

A credit note is a legal document (type 330) that cancels or partially reverses an invoice. It gets its own sequential number in the `credit_note` sequence group. It must reference the original invoice. It may also require a SHAAM allocation number if above threshold.

**Paid invoices CAN be credited** — this is how refunds work. The status machine allows `paid → credited`.

---

## Recommended PR Split

- **PR 1 — Backend**: Credit note creation endpoint, service logic (full + partial credit, status transitions, sequence assignment), `creditedInvoiceId` enforcement, Zod schemas, route tests
- **PR 2 — Frontend**: Credit note modal on invoice detail page, partial credit UI, credit note display in list/detail, component tests

---

## Acceptance Criteria

### Backend

- [ ] `POST /businesses/:businessId/invoices/:invoiceId/credit` — create a credit note for an existing invoice
  - [ ] Body schema:
    ```typescript
    createCreditNoteBodySchema = z.object({
      // Full credit: omit items (copies all from original)
      // Partial credit: provide items with adjusted amounts
      items: z.array(z.object({
        description: z.string().trim().min(1).max(255),
        quantity: z.number().positive(),
        unitPriceMinorUnits: z.number().int().nonnegative(),
        discountPercent: z.number().min(0).max(100).default(0),
        vatRateBasisPoints: z.number().int().nonnegative(),
        catalogNumber: z.string().trim().max(50).optional(),
      })).optional(),                     // if omitted → full credit (copy all original items)
      notes: z.string().trim().max(2000).optional(),
      internalNotes: z.string().trim().max(2000).optional(),
    }).strict()
    ```
  - [ ] Validation:
    - Source invoice must be `finalized`, `sent`, `partially_paid`, or `paid` — return 422 `invalid_status`
    - Source invoice must NOT be `cancelled` or `credited` — return 422 `already_credited`
    - Credit note total must not exceed source invoice total — return 422 `credit_exceeds_original`
    - Credit note must have the same `businessId` as source invoice — enforced in service layer
  - [ ] Logic:
    1. Create new invoice record with:
       - `documentType = 'credit_note'`
       - `creditedInvoiceId = sourceInvoiceId`
       - `customerId` = source invoice's `customerId`
       - Customer snapshot copied from source invoice (not re-fetched — the credit references the original)
       - `invoiceDate = today`
       - `status = 'finalized'` (credit notes are created and immediately finalized — no draft state)
    2. If no `items` in body: copy all items from source invoice (full credit)
    3. If `items` provided: use provided items (partial credit — user adjusted amounts)
    4. Assign sequence number from `credit_note` sequence group (prefix "ז")
    5. Calculate totals via VAT engine (all amounts positive — sign applied at document level)
    6. Set `issuedAt = now()`
    7. Set source invoice `status → 'credited'`
    8. If `shouldRequestAllocation()` for credit note: enqueue SHAAM allocation job
    9. All in a single transaction
  - [ ] Returns 201 with the new credit note (full `InvoiceResponse`)

- [ ] `GET /businesses/:businessId/invoices/:invoiceId` — existing endpoint already works for credit notes
  - Credit note detail page shows link to source invoice (`creditedInvoiceId`)
  - Source invoice detail page shows link to credit note (query: find invoices where `creditedInvoiceId = thisInvoiceId`)

### Credit Note Properties

- [ ] **No draft state**: Credit notes are created and immediately finalized. No editing after creation.
- [ ] **Positive amounts**: Line items store positive amounts. The "this is a credit" semantics live on `documentType = credit_note`, not on amount signs. Display shows amounts with minus sign or "זיכוי" prefix.
- [ ] **Separate numbering**: Uses `credit_note` sequence group with prefix "ז" (e.g. "ז-0001")
- [ ] **Single credit per invoice**: An invoice can only be credited once. The `credited` status is terminal — no further credits on an already-credited invoice. For partial credits, the original invoice keeps its current status until the full credit is issued.

### Payments on Credited Invoices

- [ ] When an invoice is credited:
  - Existing payments remain in the payment history (they are historical records, not deleted)
  - The "remaining balance" concept no longer applies — the invoice is credited
  - No new payments can be recorded on the credited invoice (T15 already blocks this via `invalid_status`)
- [ ] If the credit results in a refund (customer already paid): the refund is handled outside BON (bank transfer, etc.) — not tracked in the system for MVP

### Partial Credits: What Can Be Changed?

- [ ] Partial credit items are a **new set of line items** for the credit note — not modifications to the original items
- [ ] The user provides new items with potentially different quantities, prices, or descriptions
- [ ] The only constraint: credit note total ≤ source invoice total
- [ ] Common partial credit scenarios:
  - Return of 2 out of 5 items → credit note has 2 items with original unit prices
  - Price adjustment → credit note has 1 item with the difference amount
  - Full credit minus restocking fee → credit note has all items minus one "restocking fee" line

### Frontend

- [ ] "הפק חשבונית זיכוי" button on invoice detail page (replaces disabled placeholder from T08-D)
  - Only shown for statuses: `finalized`, `sent`, `paid`, `partially_paid`
  - Not shown for: `draft`, `cancelled`, `credited`
- [ ] **Credit note modal** (size="lg"):
  - [ ] Header: "הפקת חשבונית זיכוי"
  - [ ] Body:
    - Source invoice reference: "חשבונית מקור: {documentNumber}"
    - **Two modes via SegmentedControl**: "זיכוי מלא" (default) / "זיכוי חלקי"
    - **Full credit mode**: shows all original line items read-only, with summary. Confirm button.
    - **Partial credit mode**: editable line items table (same as InvoiceLineItems from T7.5, pre-populated from original items). User can modify quantities, prices, remove items, add new items. Live totals recalculated.
    - Validation: total must not exceed original invoice total
    - `Textarea` for notes (optional)
  - [ ] Footer: "ביטול" + "הפק חשבונית זיכוי" (loading state, confirm with "האם אתה בטוח?" on click)
  - [ ] On success: close modal, navigate to credit note detail page, success toast
  - [ ] On error: inline error in modal

### Invoice List Display

- [ ] Credit notes appear in the invoice list with document type badge "חשבונית זיכוי"
- [ ] Display: amounts shown with ₪ (positive numbers — no minus sign in the list row, the document type badge makes it clear)
- [ ] Source invoice row shows "זוכתה" status badge after credit

### General

- [ ] `npm run check` passes
- [ ] Route tests: full credit, partial credit, credit exceeds original → 422, invalid status → 422, credited invoice cannot be credited again, sequence number assigned correctly
- [ ] Frontend tests: modal modes (full/partial), validation, submit

---

## Architecture Notes

**Sign convention** (decided in T06): Credit note line items store **positive amounts**. The sign is applied at the document level (display/reporting), not in the data. `calculateLine()` from `@bon/types/vat` works identically for credit notes and invoices. The "this is a credit" semantics live on `documentType = credit_note`.

**Eligible source invoices**: `finalized`, `sent`, `partially_paid`, or `paid`. Cancelled and credited invoices cannot be credited again.

**`creditedInvoiceId` constraint**: Must reference an invoice in the same `businessId`. Enforced in service layer (not DB FK — a composite FK would require an extra unique constraint).

**SHAAM for credit notes**: Credit notes above the SHAAM threshold also need allocation numbers. The same `shouldRequestAllocation()` logic applies. The document type code is 330.

---

## Open Questions (need Product decision)

| # | Question | Default if no answer |
|---|----------|---------------------|
| 1 | Can a partially_paid invoice be fully credited? What happens to already-recorded payments? | Yes. Payments remain as historical records. The refund (if needed) is handled outside BON. |
| 2 | Should the credit note reference appear on the source invoice's PDF? | Defer to post-MVP. The PDF is cached and regeneration would need to be triggered. |

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
