# T20 — Uniform File Export (קובץ במבנה אחיד)

**Status**: 🔒 Blocked (T19 must merge first)
**Phase**: 6 — Reporting
**Requires**: T19 merged
**Blocks**: T21

---

## What & Why

The Uniform File is required for ITA software registration (Phase 7). It exports all bookkeeping data in ITA's defined column layout, covering all finalized invoices. ITA auditors use it to verify compliance during the registration review.

---

## Acceptance Criteria

- [ ] `GET /businesses/:businessId/reports/uniform-file?year=2026` — download uniform file
- [ ] Format: ITA "קובץ במבנה אחיד" spec (request official spec doc from ITA)
- [ ] Covers all finalized invoices in the requested year
- [ ] Includes all required column headers and record types per ITA spec
- [ ] Passes ITA's official simulator/validator without errors
- [ ] "הורד קובץ במבנה אחיד" option in reporting section
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. spec source, file encoding, whether the format differs from PCN874 or extends it -->

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
