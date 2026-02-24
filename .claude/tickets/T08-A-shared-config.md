# T08-A — Shared Invoice Config

**Status**: 🔒 Blocked (T7.5 must merge first)
**Phase**: 2 — Invoices
**Requires**: T7.5 merged
**Blocks**: T08-B

---

## What & Why

Extract shared invoice status config and document type labels into reusable modules. This unblocks both the finalization flow (T08-C) and detail view (T08-D), and fixes `RecentInvoicesTable` which currently only covers 4 of 7 statuses.

Also consolidate `formatAgora` from `front/src/lib/format.ts` into `types/src/formatting.ts` so it's shared between frontend and API (needed by T10 for PDF generation).

---

## Deliverables

### New Files (2)

| File | Purpose |
|------|---------|
| `front/src/lib/invoiceStatus.ts` | `INVOICE_STATUS_CONFIG` — all 7 statuses with Hebrew label + Mantine color |
| `types/src/formatting.ts` | `formatAgora(agora, currency?)` + `formatDate(isoDate)` shared formatters |

### Modified Files (3)

| File | Change |
|------|--------|
| `types/src/invoices.ts` | Add `DOCUMENT_TYPE_LABELS` constant |
| `front/src/components/RecentInvoicesTable.tsx` | Import from shared `invoiceStatus.ts` instead of local config |
| `front/src/pages/InvoiceEdit.tsx` | Import `formatAgora` from `@bon/types/formatting` instead of `../lib/format` |

### Deleted Files (1)

| File | Reason |
|------|--------|
| `front/src/lib/format.ts` | Replaced by `types/src/formatting.ts` |

---

## Acceptance Criteria

- [ ] `INVOICE_STATUS_CONFIG` covers all 7 statuses: `draft` (gray), `finalized` (blue), `sent` (violet), `paid` (green), `partially_paid` (yellow), `cancelled` (red), `credited` (orange)
- [ ] Each status entry has: `label` (Hebrew), `color` (Mantine color name)
- [ ] `DOCUMENT_TYPE_LABELS` in `types/src/invoices.ts`:
  ```typescript
  export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
    tax_invoice: 'חשבונית מס',
    tax_invoice_receipt: 'חשבונית מס קבלה',
    receipt: 'קבלה',
    credit_note: 'חשבונית מס זיכוי',
  };
  ```
- [ ] `formatAgora(agora: number, currency?: string)` in `types/src/formatting.ts` — defaults to `'ILS'`
- [ ] `formatDate(isoDate: string)` in `types/src/formatting.ts` — returns `DD/MM/YYYY` format
- [ ] `front/src/lib/format.ts` deleted; all importers updated
- [ ] `RecentInvoicesTable` uses shared config
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
