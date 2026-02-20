# T06 — Invoice Data Model & VAT Engine

**Status**: 🔒 Blocked (T05 must deploy first)
**Phase**: 2 — Invoices
**Requires**: T05 deployed
**Blocks**: T07, T08, T09

---

## What & Why

The schema defines the legal structure of an invoice. Every design decision here has a compliance consequence:
- All amounts stored as agora (integer) — never floats for money
- VAT calculated per line then summed — matches how accountants verify
- Sequential numbering uses `SELECT FOR UPDATE` to prevent gaps or duplicates
- Customer data snapshot on finalization — the invoice must reflect who it was issued to, even if the customer record changes later

The VAT engine is a pure function — easy to test, runs in browser for live preview, recalculated server-side on finalization (client values are discarded).

---

## Acceptance Criteria

- [ ] `invoices` table with all fields per PLAN.md §2.1
- [ ] `invoice_items` table
- [ ] `invoice_sequences` table
- [ ] `assignInvoiceNumber()` transaction function — race-condition safe
- [ ] 50 concurrent finalization requests produce 50 distinct sequential numbers (load test)
- [ ] `calculateLine()` pure function in `types/` or `api/src/lib/`
- [ ] Unit tests for VAT engine covering: whole amounts, fractional quantities, discount combos, 0% VAT
- [ ] Drizzle migration generated and tested
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. agora vs decimal decision, per-line vs total VAT rounding, sequence locking strategy, snapshot fields on invoices -->

---

## Schema Decisions to Document

- **Money storage**: agora (1/100 shekel) as integer. ₪100 = 10000 agora.
- **VAT rounding**: per line (`ROUND(lineTotal * vatRate / 10000)`), then sum
- **Sequence safety**: upsert with `nextNumber + 1`, return previous value in same statement
- **Customer snapshot**: `customerName`, `customerTaxId`, `customerAddress` copied at finalization

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
