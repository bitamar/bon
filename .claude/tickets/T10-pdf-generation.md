# T10 — Invoice PDF Generation

**Status**: 🔒 Blocked (T08 must merge first)
**Phase**: 3 — PDF
**Requires**: T08 merged
**Blocks**: T11

---

## What & Why

The PDF is what customers see. It's often the only professional document a small business sends. A bad-looking invoice reflects badly on the business. The PDF must also be legally compliant — specific fields are required by ITA regulation.

RTL Hebrew PDFs are hard. Puppeteer (headless Chrome) is the chosen approach: generate HTML → print to PDF. The browser handles RTL natively.

---

## Acceptance Criteria

- [ ] `GET /businesses/:businessId/invoices/:invoiceId/pdf` returns `application/pdf`
- [ ] Draft invoices: watermark "טיוטה - לא בתוקף" across the page, not cached
- [ ] Finalized invoices: cached after first generation, invalidated on status change
- [ ] Invoice HTML template includes all ITA-required fields:
  - [ ] Business name, ח.פ./ע.מ., VAT number, address, phone, email
  - [ ] Document type and number (e.g. "חשבונית מס מספר: INV-0042")
  - [ ] Invoice date + issued-at timestamp
  - [ ] Customer name, ח.פ., address
  - [ ] Line items table with quantity, unit price, discount, total per line
  - [ ] Subtotal, VAT amount (with rate %), grand total
  - [ ] Allocation number (if present), prominently labeled
  - [ ] Footer with software info
- [ ] Font: Heebo or Assistant (Hebrew-optimized)
- [ ] Number spans use `dir="ltr"` inside RTL context
- [ ] Puppeteer runs in a separate worker to avoid blocking event loop
- [ ] PDF filename: `INV-0042.pdf`
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. Puppeteer worker design, caching strategy (local filesystem vs S3), template rendering approach (React SSR to HTML string), storage abstraction interface -->

---

## Key Design Decisions

- **Rendering**: React component on server → HTML string → Puppeteer → PDF
- **Caching**: `StorageService` interface from day one; local filesystem for MVP, S3 later
- **Worker**: Puppeteer in child process or worker thread to avoid event loop blocking

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
