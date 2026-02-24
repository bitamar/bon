# T08 — Invoice Finalization & Detail View

**Status**: 🔄 In progress (T08-A merged, T08-B next)
**Phase**: 2 — Invoices
**Requires**: T7.5 merged
**Blocks**: T09, T10

---

## What & Why

Finalization is the legal act. The invoice becomes immutable, gets its sequential number, and the customer data is snapshotted. After this point no field can be changed — only a credit note can correct it.

The detail view is what the business owner sees after finalizing. It should feel like a "done" state — clean, read-only, with clear next steps (download, send, mark paid).

**This ticket is split into 4 sub-tickets (T08-A through T08-D).** Each is a single PR. They must be merged in order.

---

## Sub-Tickets

| Sub-ticket | Name | Scope | Depends on |
|---|---|---|---|
| [T08-A](./T08-A-shared-config.md) | Shared Invoice Config | Extract status/doc-type labels to shared modules | T7.5 merged |
| [T08-B](./T08-B-finalize-backend.md) | Backend: Finalize Endpoint Extension | `vatExemptionReason` schema + validation | T08-A merged |
| [T08-C](./T08-C-finalization-flow.md) | Frontend: Finalization Flow | Business profile gate, VAT exemption prompt, preview modal, confirm | T08-B merged |
| [T08-D](./T08-D-detail-view.md) | Frontend: Invoice Detail View + Routing | Read-only detail page, routing guards, action button placeholders | T08-C merged |

---

## Scope Boundaries

**Scope boundary with T07/T7.5**: T07 builds the finalize **API endpoint** (`POST /invoices/:id/finalize`). T7.5 builds the **frontend draft editor**. T08 builds the **frontend finalization flow** and the **invoice detail view page**.

**Scope boundary with T09**: Navbar "חשבוניות" link is **deferred to T09** (the link's destination page doesn't exist until T09 ships).

**Scope boundary with T10**: The preview modal in T08 is a **structured data preview** rendered with Mantine components — not the PDF template.

---

## Architecture Notes (shared across sub-tickets)

**Finalization transaction** (T07 backend — documented for frontend reference):
1. Validate: must be draft, has customer (active), has ≥1 line item
2. Lock + assign sequence number via `assignInvoiceNumber()` (SELECT FOR UPDATE)
3. Snapshot customer: `customerName`, `customerTaxId`, `customerAddress`, `customerEmail`
4. Recalculate all amounts server-side (discard client values)
5. Set `issuedAt = now()`, `status = 'finalized'`

**Sequence groups** (from T06): `tax_invoice` and `tax_invoice_receipt` share `tax_document` group. `credit_note` and `receipt` each have their own group. Lazy seeding on first finalization.

**Status machine** (defined in T06, enforced in T07 backend):
- `paid → credited` is allowed (refunds via credit note — legally required)
- `paid → cancelled` is forbidden (must issue credit note instead)

**VAT rate validation on finalize**: exempt_dealer → all rates must be 0. Non-exempt → rates must be 0 or 1700.

**No preview API endpoint needed**: The preview modal renders from client-side data using `calculateInvoiceTotals()` from `@bon/types/vat`. Same pure functions the server uses.

**`isOverdue` flag**: Always `false` until T-CRON-01. Do not compute overdue client-side on the detail page.

---

## Open Questions

1. **T-LEGAL-01 dependency**: The `vatExemptionReason` options listed in T08-C are placeholders pending accountant confirmation. Use a `Select` (not free text) so options can be updated without UI changes.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
