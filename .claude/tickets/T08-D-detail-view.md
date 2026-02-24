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

### New Files (1 source + 1 test)

| File | Purpose |
|------|---------|
| `front/src/pages/InvoiceDetail.tsx` | Read-only invoice detail page |
| `front/src/test/pages/InvoiceDetail.test.tsx` | Tests |

### Modified Files (3)

| File | Change |
|------|--------|
| `front/src/App.tsx` | Register `/business/invoices/:invoiceId` route |
| `front/src/pages/InvoiceEdit.tsx` | Add redirect: non-draft on edit route → detail page |

---

## Acceptance Criteria

### Detail View (`/business/invoices/:invoiceId`)

- [ ] Loading state: skeleton layout matching the final layout
- [ ] Error state: error card with retry button
- [ ] **All of these fields displayed**:
  - [ ] `fullNumber` — prominent, primary identifier
  - [ ] Document type label (Hebrew) using `DOCUMENT_TYPE_LABELS` from T08-A
  - [ ] `invoiceDate` (formatted as DD/MM/YYYY)
  - [ ] `issuedAt` (formatted with time: DD/MM/YYYY HH:mm)
  - [ ] `dueDate` (if set)
  - [ ] Customer section: `customerName`, `customerTaxId`, `customerAddress`, `customerEmail`
  - [ ] Line items table: description, quantity, unit price, discount %, line total, VAT amount
  - [ ] Totals: `subtotalAgora`, `discountAgora` (if > 0), `totalExclVatAgora`, `vatAgora` with rate label, `totalInclVatAgora`
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
│       │   ├── Stack: fullNumber + document type + date
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

## Tests

- [ ] Detail page renders all required fields for a finalized invoice
- [ ] Correct status banner color/label for each status
- [ ] Draft on detail route redirects to edit page
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
