# T21 — ITA Software Registration (רישום כבית תוכנה)

**Status**: ⬜ Ready to start (all blocking tickets merged)
**Phase**: 7 — ITA Registration
**Requires**: T20 merged ✅
**Blocks**: nothing — this is the finish line

---

## What & Why

To legally operate as invoicing software in Israel, BON must be registered with the ITA as a "בית תוכנה" (software house). This unlocks the ability to embed the registration number in SHAAM submissions, which is required for full compliance.

This is mostly an administrative process, not a code ticket — but there are code changes needed to embed the registration number everywhere it's required, and a few compliance gaps must be closed first.

---

## Pre-Registration Checklist (must all be true before applying)

- [x] Compliant invoices with all ITA-required fields generated (T10) — `pdf/src/pdf/InvoiceTemplate.tsx`
- [x] Gap-free sequential numbering with atomic upsert + SELECT FOR UPDATE (T06) — `api/src/lib/invoice-sequences.ts`
- [x] Finalized invoices are immutable — only draft status allows edits (T08) — `api/src/services/invoice-service.ts`
- [x] SHAAM integration with mock/sandbox/production modes (T12/T13) — `api/src/services/shaam/`
- [x] Uniform file export (BKMV format: INI + BKMVDATA + README in ZIP) (T20) — `api/src/services/bkmv-service.ts`
- [x] PCN874 VAT report generation (Windows-1255 encoded) (T19) — `api/src/services/pcn874-service.ts`
- [x] Credit notes with line-by-line validation (T16) — `api/src/services/invoice-service.ts` `createCreditNote()`
- [x] Payment recording with status transitions (T15) — `api/src/routes/payments.ts`
- [ ] **7-year retention policy** — finalized invoices cannot be hard-deleted (draft-only deletion is enforced), but there is no explicit retention policy configuration or audit trail proving 7-year preservation. Needs: a documented policy statement + DB-level constraints or triggers preventing any future hard-delete path.
- [ ] **SHAAM production credentials tested** — SHAAM integration is wired for sandbox/production but real ITA sandbox end-to-end test has not been verified (T13.5 defines this).
- [ ] **Uniform file validated against ITA simulator** — export is implemented but not yet tested against the official ITA validation tool.
- [ ] **PCN874 validated against ITA simulator** — generation works but not yet validated against official tools.
- [ ] **User manual / software documentation prepared**
- [ ] **יועץ מס or רו"ח has reviewed** before submission (see T-LEGAL-01)

---

## Remaining Gaps Before Application

### 1. 7-Year Retention Policy (code + documentation)

Finalized invoices are already protected — only drafts can be deleted (`DELETE` route checks `status === 'draft'`). However, for ITA registration we need:

- A documented retention policy stating finalized invoices, credit notes, and payment records are retained for 7 years
- Consider adding a DB comment or CHECK constraint on the invoices table to formalize this
- Ensure no future cleanup job (like draft-cleanup in T-CRON-02) can accidentally touch finalized records
- The draft-cleanup job (`api/src/jobs/handlers/`) should be audited to confirm it only deletes drafts older than X days

### 2. SHAAM Registration Number Integration (code — post-approval)

After receiving the תעודת רישום, the registration number must be embedded in:

| Location | File | What to change |
|----------|------|----------------|
| Env config | `api/src/env.ts` | Add `SHAAM_REGISTRATION_NUMBER` (optional string, required when `SHAAM_MODE=production`) |
| ITA payload | `api/src/services/shaam/build-ita-payload.ts` | Add `AccountingSoftwareNumber` field (field 1006) to the payload |
| PDF footer | `pdf/src/pdf/InvoiceTemplate.tsx` | Add registration number to footer (currently: "מסמך זה הופק על ידי BON v1.0") |
| BKMV export | `api/src/services/bkmv-service.ts` | Include software registration number in the INI.TXT header record |
| PCN874 export | `api/src/services/pcn874-service.ts` | Include software registration number in the opening record if required by spec |

### 3. ITA Simulator Validation (manual testing)

- [ ] Run BKMV (uniform file) export through ITA's official simulator tool
- [ ] Run PCN874 export through ITA's official simulator tool
- [ ] Document any spec discrepancies and fix

### 4. Accountant / Tax Advisor Review (T-LEGAL-01)

- [ ] Schedule review with יועץ מס or רו"ח
- [ ] Review invoice template compliance
- [ ] Review BKMV and PCN874 output format
- [ ] Review SHAAM integration logic (threshold rules, trigger conditions)
- [ ] Budget: ₪2,000-5,000

---

## Registration Steps

1. Close all gaps listed above (retention policy, simulator validation, accountant review)
2. Register BON as בית תוכנה with ח.פ./ע.מ.
3. File digital registration form at ITA portal
4. Submit: software copy + professional docs + tech specs
5. ITA review ~90 days
6. Receive תעודת רישום → implement code changes (section 2 above)
7. Deploy registration number to production
8. Attach certificate to all customer agreements

---

## Code Changes After Approval

- [ ] Add `SHAAM_REGISTRATION_NUMBER` env var to `api/src/env.ts`
- [ ] Embed in ITA payload (`AccountingSoftwareNumber` field 1006) in `api/src/services/shaam/build-ita-payload.ts`
- [ ] Update PDF footer in `pdf/src/pdf/InvoiceTemplate.tsx` — change from "מסמך זה הופק על ידי BON v1.0" to include the registration number
- [ ] Update BKMV INI.TXT header in `api/src/services/bkmv-service.ts`
- [ ] Verify PCN874 opening record includes software ID in `api/src/services/pcn874-service.ts`
- [ ] Update Terms of Service / customer agreements

---

## Architecture Notes

**Current SHAAM env vars** (in `api/src/env.ts`):
- `SHAAM_MODE`: 'mock' | 'sandbox' | 'production' (default: 'mock')
- `SHAAM_ENCRYPTION_KEY`: Required 64-char hex when mode ≠ mock

**ITA payload builder** (`api/src/services/shaam/build-ita-payload.ts`):
- Currently builds ~26 fields for allocation requests
- `AccountingSoftwareNumber` (field 1006) is not yet included — add after registration

**PDF footer** (`pdf/src/pdf/InvoiceTemplate.tsx` lines 234-241):
- Current text: "מסמך זה הופק על ידי BON v1.0"
- Post-registration: "מסמך זה הופק על ידי BON v1.0 | רישום בית תוכנה מס' XXXXX"

**Invoice deletion safety**:
- `DELETE /businesses/:businessId/invoices/:invoiceId` only allows draft status
- Finalized invoices have no delete path — this is the de facto 7-year retention

---

## Links

- ITA portal: —
- Application submitted: —
- Certificate received: —
- T-LEGAL-01 (accountant review): `.claude/tickets/T-LEGAL-01-accountant-review.md`
- T13.5 (SHAAM HTTP integration): `.claude/tickets/` (pending — real ITA sandbox test)
