# T08-D — Frontend: Invoice Detail View + Routing

**Status**: 🔒 Blocked (T08-C must merge first)
**Phase**: 2 — Invoices
**Requires**: T08-C merged
**Blocks**: T09

---

## What & Why

The detail view is what the business owner sees after finalizing an invoice. It's a read-only page showing all invoice data, the status banner, and action button placeholders for future features (PDF download, email, payment, credit note).

This sub-ticket also adds routing guards: non-draft invoices on the edit route redirect to detail, and drafts on the detail route redirect to edit.

---

## Deliverables

### New Files (2 source + 1 test)

| File | Purpose |
|------|---------|
| `front/src/components/InvoicePreviewDocument.tsx` | Shared read-only invoice layout (customer, line items, totals) — used by both T08-C's preview modal and this detail page |
| `front/src/pages/InvoiceDetail.tsx` | Read-only invoice detail page |
| `front/src/test/pages/InvoiceDetail.test.tsx` | Tests |

### Modified Files (3)

| File | Change |
|------|--------|
| `front/src/App.tsx` | Register `/business/invoices/:invoiceId` route |
| `front/src/pages/InvoiceEdit.tsx` | Add redirect: non-draft on edit route → detail page |
| `front/src/components/InvoicePreviewModal.tsx` | Refactor to use shared `InvoicePreviewDocument` instead of duplicating the layout |

---

## Acceptance Criteria

### Detail View (`/business/invoices/:invoiceId`)

- [ ] Loading state: skeleton layout matching the final layout
- [ ] Error state: error card with retry button
- [ ] **All of these fields displayed**:
  - [ ] `documentNumber` — prominent, primary identifier
  - [ ] Document type label (Hebrew) using `DOCUMENT_TYPE_LABELS` from T08-A
  - [ ] `invoiceDate` (formatted as DD/MM/YYYY)
  - [ ] `issuedAt` (formatted with time: DD/MM/YYYY HH:mm)
  - [ ] `dueDate` (if set)
  - [ ] Customer section: `customerName`, `customerTaxId`, `customerAddress`, `customerEmail`
  - [ ] Line items table: description, quantity, unit price, discount %, line total, VAT amount
  - [ ] Totals: `subtotalMinorUnits`, `discountMinorUnits` (if > 0), `totalExclVatMinorUnits`, `vatMinorUnits` with rate label, `totalInclVatMinorUnits`
  - [ ] `vatExemptionReason` (if set, displayed prominently near totals)
  - [ ] `notes` (if set)
  - [ ] `allocationNumber` (if set, in a prominent box labeled "מספר הקצאה")
- [ ] **Status banner** covering all 7 statuses (using `INVOICE_STATUS_CONFIG` from T08-A):
  - `draft` → "טיוטה" (gray)
  - `finalized` → "הופקה" (blue)
  - `sent` → "נשלחה" (violet)
  - `paid` → "שולמה" (green)
  - `partially_paid` → "שולמה חלקית" (yellow)
  - `cancelled` → "בוטלה" (red)
  - `credited` → "זוכתה" (orange)
- [ ] **Action buttons** (all visible, disabled placeholders):
  - "הורד PDF" — disabled until T10
  - "שלח במייל" — disabled until T11
  - "סמן כשולם" — disabled until T15
  - "הפק חשבונית זיכוי" — disabled until T16; only shown for: `finalized`, `sent`, `paid`, `partially_paid`
- [ ] Finalized invoices show no edit affordances

### Routing

- [ ] Route registered: `/business/invoices/:invoiceId`
- [ ] Non-draft invoices on edit route (`/business/invoices/:id/edit`) redirect to detail page
- [ ] Drafts on detail route (`/business/invoices/:id`) redirect to edit page
- [ ] **Navbar "חשבוניות" link is NOT enabled** — deferred to T09 when the list page exists

### Component Tree

```
InvoiceDetail (page)
├── Container (size="lg")
│   ├── [loading] Skeleton layout
│   ├── [error] Error card with retry
│   └── [data] Stack
│       ├── Group (justify="space-between")
│       │   ├── Stack: documentNumber + document type + date
│       │   └── InvoiceStatusBadge (size="lg")
│       ├── InvoiceActionBar
│       │   └── Paper: Group of action buttons
│       │       "הורד PDF" | "שלח במייל" | "סמן כשולם" | "חשבונית זיכוי"
│       ├── [if allocationNumber] AllocationNumberBanner
│       │   └── Paper (bg="brand.0"): icon + number
│       ├── InvoicePreviewDocument (read-only component)
│       │   ├── Business identity + Document identity
│       │   ├── Customer section
│       │   ├── Line items table
│       │   ├── Totals section
│       │   ├── vatExemptionReason (if set)
│       │   └── Notes (if set)
│       └── InvoiceAuditTimeline
│           └── Paper: created → finalized → sent → paid timestamps
```

---

## Shared Component: `InvoicePreviewDocument`

The read-only invoice data layout (customer section, line items table, totals) is used in two places:
1. **T08-C**: `InvoicePreviewModal` — shows the same layout inside a modal before finalization
2. **T08-D**: `InvoiceDetail` page — shows the full read-only invoice

Extract the shared layout into `front/src/components/InvoicePreviewDocument.tsx`. Both T08-C's preview modal and T08-D's detail page import and render this component. This avoids duplicating the line items table, totals section, and customer section.

**Props**: `Readonly<{ invoice: InvoiceResponse; formatCurrency: (n: number) => string }>` — the component is purely presentational, no data fetching.

If T08-C ships before T08-D: T08-C can inline the layout. T08-D then extracts it into the shared component and refactors T08-C's modal to use it. The refactor is captured in the modified files list above.

---

## Audit Timeline Data Source

The `InvoiceAuditTimeline` component derives all events from **existing invoice fields** — there is no separate events/audit table:

| Event | Source field | Condition |
|---|---|---|
| נוצרה (created) | `createdAt` | Always present |
| הופקה (finalized) | `issuedAt` | Non-null (finalized invoices) |
| נשלחה (sent) | `sentAt` | Non-null (after T11 send action) |
| שולמה (paid) | `paidAt` | Non-null (after T15 payment recording) |

Display as a vertical Timeline (Mantine `Timeline` component) with timestamps formatted via `formatDateTime()` from `@bon/types/formatting`. Only show events with non-null timestamps. Always show at least the "נוצרה" event.

---

## Tests

- [ ] Detail page renders all required fields for a finalized invoice
- [ ] Correct status banner color/label for each status
- [ ] Draft on detail route redirects to edit page
- [ ] Audit timeline shows correct events based on non-null timestamps
- [ ] `InvoicePreviewDocument` renders customer, line items, totals correctly
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
