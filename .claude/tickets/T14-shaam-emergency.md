# T14 — SHAAM Emergency Numbers & Error Handling

**Status**: 🔒 Blocked (T13 must merge first)
**Phase**: 4 — SHAAM Integration
**Requires**: T13 merged
**Blocks**: T15

---

## What & Why

SHAAM goes down. When it does, businesses still need to issue invoices. The ITA allows pre-acquired emergency allocation numbers — the business requests a pool of them in advance from ITA directly, then enters them into BON. When SHAAM is unavailable, BON draws from this pool.

This ticket also covers the full error taxonomy: each ITA error code needs a distinct response, not a generic "something went wrong."

---

## Acceptance Criteria

- [ ] `emergency_allocation_numbers` table: businessId, number, used, usedForInvoiceId, usedAt
- [ ] Settings page section: owner can enter emergency numbers, see pool status
- [ ] Alert shown when pool < 5 numbers remaining
- [ ] When SHAAM returns E099 (unavailable): use next available emergency number automatically
- [ ] Used emergency numbers reported to SHAAM when it recovers (bulk report job)
- [ ] ITA error code constants with Hebrew user-facing messages:
  - E001: Invalid VAT number → "מספר מע״מ לא תקין"
  - E002: Already allocated → idempotent (store returned number)
  - E003: Below threshold → don't request (shouldn't happen — logic error)
  - E010: Auth failure → trigger re-auth flow for business
  - E099: System unavailable → use emergency number
- [ ] All error states visible on invoice detail page with actionable next steps
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. how emergency number consumption is atomic (SELECT FOR UPDATE), how re-auth flow is surfaced to the business owner, how bulk reporting job is triggered -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
