# T08-B — Backend: Finalize Endpoint Extension

**Status**: 🔒 Blocked (T08-A must merge first)
**Phase**: 2 — Invoices
**Requires**: T08-A merged
**Blocks**: T08-C

---

## What & Why

The finalize endpoint (built in T07) needs a small extension to support `vatExemptionReason`. When a non-exempt business issues a 0% VAT invoice, Israeli law requires stating the exemption reason. This backend change must land before the frontend finalization flow (T08-C) can use it.

---

## Deliverables

### Modified Files (3–4)

| File | Change |
|------|--------|
| `types/src/invoices.ts` | Extend `finalizeInvoiceBodySchema` with `vatExemptionReason` field |
| `api/src/services/invoice-service.ts` | Add `vatExemptionReason` validation in `finalize()` |
| `api/src/routes/invoices.ts` | Pass `vatExemptionReason` through to service (if not already) |
| `api/tests/routes/invoices.test.ts` | Tests for new error code |

---

## Acceptance Criteria

- [ ] `finalizeInvoiceBodySchema` extended:
  ```typescript
  export const finalizeInvoiceBodySchema = z
    .object({
      invoiceDate: z.string().trim().date().optional(),
      vatExemptionReason: z.string().trim().min(1).max(500).optional(),
    })
    .strict();
  ```
- [ ] Validation in `finalize()`: when `vatMinorUnits === 0` AND `business.businessType !== 'exempt_dealer'`, require `vatExemptionReason` — throw 422 with code `missing_vat_exemption_reason` if absent
- [ ] `vatExemptionReason` persisted on the invoice record
- [ ] Tests:
  - [ ] Finalize with `vatExemptionReason` on 0% VAT invoice → 200
  - [ ] Finalize without `vatExemptionReason` on 0% VAT non-exempt invoice → 422 `missing_vat_exemption_reason`
  - [ ] Finalize with `vatExemptionReason` on normal 17% VAT invoice → 200 (field ignored/stored, not rejected)
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
