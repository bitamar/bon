# T05 — Customer Frontend (List + Create + Edit)

**Status**: 🔒 Blocked (T03 + T04 must deploy first)
**Phase**: 1 — Customers
**Requires**: T04 deployed
**Blocks**: T07 (invoice create needs customer search)

---

## What & Why

The customer list is a bookkeeper's daily tool. They open it constantly — to find a customer, to start a new invoice. It must be fast and keyboard-friendly. Search must feel instant.

The creation form needs to be smart: detect tax ID type from digit count, adapt labels, validate checksum, show duplicate conflicts with a link to the existing record.

---

## Acceptance Criteria

- [ ] `/business/customers` — searchable list (name + taxId, debounced 150ms)
- [ ] Each row: name, taxId (formatted), city, "עוסק מורשה" badge if applicable
- [ ] Empty state has a real call-to-action (not just "אין לקוחות")
- [ ] `/business/customers/new` — creation form
  - [ ] Name required; all other fields optional
  - [ ] 9-digit taxId checksum validation
  - [ ] Duplicate taxId shows conflict with link to existing customer
  - [ ] `isLicensedDealer` toggle shown only when taxId present
  - [ ] Address via `<AddressAutocomplete>`
- [ ] `/business/customers/:id` — detail + edit
  - [ ] All fields editable in place
  - [ ] Invoice history section (placeholder — header only, no data yet)
  - [ ] Soft delete with confirm modal
- [ ] Loading, error, and empty states on all data-fetching components
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. routing approach, form state management, how taxId type is inferred -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
