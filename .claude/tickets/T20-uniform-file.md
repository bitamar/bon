# T20 — Uniform File Export (קובץ במבנה אחיד / BKMV)

**Status**: 🔒 Blocked (T19 must merge first)
**Phase**: 6 — Reporting
**Requires**: T19 merged, T15 (payments) merged, T16 (credit notes) merged
**Blocks**: T21

---

## What & Why

The Uniform File (קובץ במבנה אחיד, commonly called "BKMV") is **mandatory for ITA software registration** (Phase 7, נספח ה' סעיף 36). Without it, BON cannot be registered as approved bookkeeping software.

Since 2008, every registered computerized bookkeeping software must export all accounting data in ITA's standardized fixed-width format. ITA auditors use this file to verify compliance — it replaces the need to hand over a raw database backup. It is also used by accountants (רואי חשבון) to audit businesses and transfer data between systems.

This is **not** the same as PCN874 (T19). PCN874 is the monthly/bi-monthly VAT report. The Uniform File is a comprehensive export of **all** bookkeeping transactions for a requested period.

---

## Acceptance Criteria

### API
- [ ] `GET /businesses/:businessId/reports/uniform-file?year=2026` — returns a ZIP archive
- [ ] Response content-type: `application/zip`
- [ ] ZIP contains exactly 3 files: `INI.TXT`, `BKMVDATA.TXT`, `README.TXT`
- [ ] All files encoded in **Windows-1255** (ITA requirement — not UTF-8)
- [ ] Fixed-width format — no delimiters; fields defined by character positions per ITA spec
- [ ] Only includes finalized invoices (drafts and cancelled excluded from financial records)
- [ ] Credit notes (type 330) included with correct sign semantics
- [ ] Payments included where applicable (D120 records)

### Record Types in BKMVDATA.TXT
- [ ] **A100** — Header record: business info (ח.פ., VAT number, name, address), software info, date range, record counts per type
- [ ] **C100** — Document headers: one per finalized invoice/credit note/receipt, with subsection codes:
  - `305` — Tax invoice (חשבונית מס) and Tax invoice receipt (חשבונית מס קבלה)
  - `330` — Credit note (חשבונית זיכוי)
  - `400` — Receipt (קבלה)
- [ ] **D110** — Document line items: one per invoice line, with description, quantity, unit price, VAT rate, line total
- [ ] **D120** — Receipt/payment details: one per payment record (from `invoice_payments`)
- [ ] **B100** — Journal entry headers (one per accounting transaction — derived from invoices + payments)
- [ ] **B110** — Account balances (trial balance: opening balance, debit, credit, closing balance per account)
- [ ] **M100** — Inventory records (empty / zero-count — BON does not track inventory)
- [ ] **Z900** — Footer/summary: count per record type (must match INI.TXT counts exactly)

### INI.TXT
- [ ] Business registration number, name, address
- [ ] Software name and version ("BON v1.0")
- [ ] ITA software registration number (field 1006, once obtained in T21)
- [ ] Date range of export
- [ ] Record count per type (must match Z900 in BKMVDATA.TXT)
- [ ] Generation timestamp

### README.TXT
- [ ] Business name and registration number
- [ ] Date range
- [ ] Summary line per record type with count
- [ ] Software name, version, generation date/time

### Validation
- [ ] Passes ITA's official simulator at `https://www.misim.gov.il/TmbakmmsmlNew/frmCheckFiles.aspx` without errors
- [ ] Minimum 2,000 records accepted by simulator (use seed data for testing)
- [ ] Record counts in INI.TXT, Z900, and actual BKMVDATA.TXT all match

### Frontend
- [ ] "הורד קובץ במבנה אחיד" button in the reporting section
- [ ] Year picker (default: current year)
- [ ] Loading state while generating
- [ ] Error state if no finalized invoices exist for the period
- [ ] Downloaded file named `BKMV_{businessRegNumber}_{year}.zip`

### Testing
- [ ] Service unit tests: correct record generation for each type (C100, D110, D120, B100, B110)
- [ ] Service unit tests: Windows-1255 encoding output
- [ ] Service unit tests: record counts match between INI.TXT, Z900, and actual data
- [ ] Service unit tests: credit notes produce correct subsection code (330)
- [ ] Route test: happy path returns ZIP with correct content-type
- [ ] Route test: returns 400 for missing/invalid year parameter
- [ ] Route test: returns 404 or empty when no data for period
- [ ] `npm run check` passes

---

## Architecture Notes

### File Format — BKMV (קובץ במבנה אחיד)

**This is NOT the same as PCN874.** PCN874 is a VAT-only monthly report. BKMV is a comprehensive bookkeeping export covering all documents, journal entries, and account balances.

**Spec source:** The official ITA specification document is "הוראות להפקת קבצים במבנה אחיד" (horaot_131.pdf), published at:
- https://www.gov.il/blobFolder/service/itc-application-for-registration-software-computer-account-systems/he/IncomeTax_horaot_131.pdf
- Mirror: https://www.misim.gov.il/TmbakmmsmlNew/Files/horaot_131.pdf

**The Implementer MUST download and read this PDF before writing any code.** The field positions, widths, and data types are defined there — do not guess or infer from ERP vendor documentation.

### Encoding

**Windows-1255** (Hebrew), NOT UTF-8. The ITA simulator rejects UTF-8 files. Use `iconv-lite` or Node.js `TextEncoder` with Windows-1255 support. This is a common gotcha — test encoding before anything else.

### File Structure

The export produces a ZIP with 3 text files:

| File | Purpose |
|------|---------|
| `INI.TXT` | Metadata: business info, software info, record counts, generation timestamp |
| `BKMVDATA.TXT` | All data: fixed-width records, one per line, ordered by record type |
| `README.TXT` | Human-readable summary for the accountant |

### Record Type Mapping to BON Data

| BKMV Record | BON Source | Notes |
|-------------|-----------|-------|
| A100 | `businesses` table | One record. Business identity + software info |
| C100 | `invoices` (finalized) | One per invoice. Subsection: 305 (tax invoice), 330 (credit note), 400 (receipt) |
| D110 | `invoice_items` | One per line item. Linked to parent C100 by document number |
| D120 | `invoice_payments` | One per payment. Linked to parent C100 by document number |
| B100 | Derived from invoices + payments | Journal entry per financial event |
| B110 | Derived / aggregated | Account-level trial balance summary |
| M100 | N/A | BON doesn't track inventory — emit zero-count or omit per spec |
| Z900 | Computed | Footer with record counts — must match INI.TXT |

### C100 Subsection Codes

| Code | ITA Name | BON `documentType` |
|------|----------|-------------------|
| 305 | חשבונית מס / חשבונית מס קבלה | `tax_invoice`, `tax_invoice_receipt` |
| 330 | חשבונית זיכוי | `credit_note` |
| 400 | קבלה | `receipt` |

### B100/B110 — Journal Entries & Trial Balance

BON is a single-entry invoicing system, not a double-entry bookkeeping system. However, the BKMV format requires journal entries (B100) and a trial balance (B110). The Architect must decide how to derive these:

**Option A (recommended):** Generate synthetic journal entries from invoices and payments. Each finalized invoice becomes a JE: debit Accounts Receivable, credit Revenue + VAT Payable. Each payment becomes a JE: debit Cash/Bank, credit Accounts Receivable. This is a standard mapping that any accountant would recognize.

**Option B:** Omit B100/B110 if the ITA spec allows it for invoicing-only software (verify with the spec document). Some simplified bookkeeping software (הנהלת חשבונות חד-צדדית) may be exempt from double-entry journal export.

**Decision required from Architect before implementation.**

### Implementation Structure

```
api/src/services/bkmv/
├── bkmv-service.ts          — orchestrates file generation
├── ini-generator.ts         — generates INI.TXT content
├── bkmvdata-generator.ts    — generates BKMVDATA.TXT (all record types)
├── readme-generator.ts      — generates README.TXT
├── record-types/
│   ├── a100.ts              — A100 header record formatter
│   ├── b100.ts              — B100 journal entry formatter
│   ├── b110.ts              — B110 trial balance formatter
│   ├── c100.ts              — C100 document header formatter
│   ├── d110.ts              — D110 line item formatter
│   ├── d120.ts              — D120 payment detail formatter
│   └── z900.ts              — Z900 summary footer formatter
└── encoding.ts              — Windows-1255 encoding utility

api/src/routes/reports.ts    — new route file for reporting endpoints
types/src/reports.ts         — Zod schemas for report query params
```

### Shared Code with T19 (PCN874)

T19 and T20 both export invoice data in ITA formats, but the formats are completely different:
- **PCN874**: monthly VAT report, simpler, fewer fields, focused on VAT amounts
- **BKMV**: full bookkeeping export, all record types, fixed-width positional format

They share the same **data source** (finalized invoices, payments) but the **formatting logic** is entirely separate. Do not try to abstract a common "ITA file generator" — the formats are too different. What CAN be shared:
- Invoice query logic (date range filter on finalized invoices with items + payments)
- Amount formatting utilities (minor units → ITA format)
- Business info formatting
- Windows-1255 encoding utility

### Dependencies

This ticket requires data from:
- **T15 (Payments)**: D120 records come from `invoice_payments` table
- **T16 (Credit Notes)**: C100 subsection 330 records come from credit note invoices
- **T19 (PCN874)**: May share query utilities and encoding helpers (but NOT format logic)

### Simulator Testing

The ITA provides an online simulator at `https://www.misim.gov.il/TmbakmmsmlNew/frmCheckFiles.aspx` that validates file structure. It requires at least 2,000 records. Before shipping:
1. Generate a BKMV export from seed data with sufficient volume
2. Upload to the simulator
3. Fix any validation errors
4. Document the simulator pass in the PR

### Size Estimate

~600-800 lines of service code (record formatters are repetitive but simple), ~200 lines route + types, ~300 lines tests. Medium ticket — can be done in one PR if the spec is well understood.

---

## Open Questions

1. **B100/B110 requirement**: Does the ITA spec require journal entries and trial balance for invoicing-only software? Or can these be omitted for הנהלת חשבונות חד-צדדית? → Must verify with horaot_131.pdf
2. **M100 inventory**: Can this record type be omitted entirely, or must it appear with zero count? → Must verify with spec
3. **File size limit**: Some ITA systems reject files > 5MB. Should we split large files or warn the user? → Check simulator behavior
4. **Allocation number field**: Does the C100 record have a field for the SHAAM allocation number? → Must verify with spec

---

## Links

- ITA spec (horaot_131.pdf): https://www.gov.il/blobFolder/service/itc-application-for-registration-software-computer-account-systems/he/IncomeTax_horaot_131.pdf
- ITA file simulator: https://www.misim.gov.il/TmbakmmsmlNew/frmCheckFiles.aspx
- ITA simulator help: https://www.misim.gov.il/TmbakmmsmlNew/frmHelp.aspx?cur=5
- Branch: —
- PR: —
- Deployed: ⬜
