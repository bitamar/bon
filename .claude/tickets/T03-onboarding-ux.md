# T03 — Business Onboarding UX

**Status**: 🔄 In Progress (`onboarding-steps`)
**Phase**: 0 — Foundation
**Requires**: T01
**Blocks**: T04, T05

---

## What & Why

New users who just signed in with Google see a blank state. They need to create their first business. This wizard collects the legal identity data required for invoices — business type, registration number, VAT number, address, contact info.

Getting the UX right here sets the tone for the whole product. A painful onboarding predicts painful everything.

---

## Acceptance Criteria

- [ ] Step 1: choose business type (עוסק מורשה / עוסק פטור / חברה בע"מ)
- [ ] Step 2: legal identity — registrationNumber (ח.פ.), vatNumber, name. עוסק פטור hides VAT field and copies name from ID
- [ ] Step 3: address (via AddressAutocomplete), phone, email
- [ ] Israeli ID checksum validation for ת.ז.
- [ ] Going back to Step 1 and changing type resets Step 2 fields
- [ ] Submitted business visible in BusinessList immediately after
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. how step state is managed, validation approach, field adaptation per type -->

---

## Links

- Branch: `onboarding-steps`
- PR: —
- Deployed: ⬜
