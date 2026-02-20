# T07 — Invoice Create/Edit UI (Draft)

**Status**: 🔒 Blocked (T06 must deploy first)
**Phase**: 2 — Invoices
**Requires**: T06 deployed
**Blocks**: T08

---

## What & Why

This is the heart of the product. A user who knows what they're billing should be done in under 60 seconds. The draft is saved immediately on page load — the user never loses work.

The line items table must be keyboard-first: Tab moves between fields, Enter in the last field of a row adds a new row. Power users never need the mouse.

---

## Acceptance Criteria

- [ ] `POST /businesses/:id/invoices` creates a draft immediately on page load
- [ ] Customer search: combobox, shows name + taxId + city, instant search
- [ ] Document type selector with tooltip explanations (חשבונית מס, חשבונית מס קבלה, קבלה)
- [ ] Date picker (DatePickerInput, defaults to today)
- [ ] Line items table:
  - [ ] Tab navigation: description → quantity → unit price → discount → next row
  - [ ] Enter on last field of row adds new row
  - [ ] Backspace on empty description of last row deletes the row
  - [ ] VAT amount shown per line (calculated, not editable)
  - [ ] Live totals update as user types
- [ ] "שמור טיוטה" saves without finalizing
- [ ] Invoice persists on browser refresh (saved to DB as draft)
- [ ] "בטל טיוטה" confirm modal → deletes draft
- [ ] Loading, error, empty states on customer search
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. optimistic draft creation, autosave strategy, line item state management (local vs server), how VAT preview is computed -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
