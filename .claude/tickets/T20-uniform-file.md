# T20 — Uniform File Export (קובץ במבנה אחיד)

**Status**: 📝 Needs spec work — **BLOCKED on obtaining ITA spec document**
**Phase**: 6 — Reporting
**Requires**: T19 merged + ITA "קובץ במבנה אחיד" format specification obtained
**Blocks**: T21

---

## What & Why

The Uniform File is required for ITA software registration (Phase 7). It exports all bookkeeping data in ITA's defined column layout, covering all finalized invoices. ITA auditors use it to verify compliance during the registration review.

---

## PREREQUISITE: Obtain ITA Spec

**This ticket cannot be implemented without the official ITA uniform file specification.** This is a different format from PCN874 — it is the "קובץ במבנה אחיד" (Uniform File) required for software house registration under Annex ה (נספח ה').

**Action items before implementation:**
1. Request the official "קובץ במבנה אחיד — מבנה הקובץ" document from ITA
2. The spec may be available in the "בית תוכנה" registration application package
3. Determine file encoding and delimiter format
4. Determine which record types are required (header, transaction details, summary)
5. Obtain access to ITA's uniform file validator
6. Document findings in this ticket's Architecture Notes section

**Responsible**: Product owner or legal contact. This is an administrative task, not a coding task. Can be requested at the same time as the PCN874 spec (T19 prerequisite).

---

## Recommended PR Split

- **PR 1 — Backend**: Uniform file generator service, `GET .../reports/uniform-file` endpoint, field mapping, route tests
- **PR 2 — Frontend**: Report download UI (may be combined with T19's reporting section)

---

## Acceptance Criteria

- [ ] `GET /businesses/:businessId/reports/uniform-file?year=2026` — download uniform file
- [ ] Format: ITA "קובץ במבנה אחיד" spec
- [ ] Covers all finalized invoices in the requested year
- [ ] Includes all required column headers and record types per ITA spec
- [ ] Passes ITA's official simulator/validator without errors
- [ ] "הורד קובץ במבנה אחיד" option in reporting section
- [ ] `npm run check` passes

---

## Architecture Notes

**TO BE FILLED after ITA spec is obtained.** Expected contents:
- Exact record format and field layout
- Differences from PCN874 format
- File encoding requirements
- Which invoice data must be included (line items? payments? credit notes?)
- Validation rules per field
- Sample file from ITA validator

---

## Links

- Branch: —
- PR: —
- ITA spec obtained: ⬜
- Deployed: ⬜
