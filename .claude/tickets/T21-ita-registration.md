# T21 — ITA Software Registration (רישום כבית תוכנה)

**Status**: 🔒 Blocked (T20 must deploy first)
**Phase**: 7 — ITA Registration
**Requires**: T20 deployed
**Blocks**: nothing — this is the finish line

---

## What & Why

To legally operate as invoicing software in Israel, BON must be registered with the ITA as a "בית תוכנה" (software house). This unlocks the ability to embed the registration number in SHAAM submissions, which is required for full compliance.

This is mostly an administrative process, not a code ticket — but there are code changes needed to embed the registration number everywhere it's required.

---

## Pre-Registration Checklist (must all be true before applying)

- [ ] Compliant invoices with all ITA-required fields generated (T10)
- [ ] Gap-free sequential numbering proven with audit log (T06)
- [ ] Finalized invoices are immutable — no edit API, no direct DB updates (T08)
- [ ] SHAAM integration working in production with real allocation numbers (T13)
- [ ] Uniform file export passes ITA simulator (T20)
- [ ] PCN874 report generation working (T19)
- [ ] 7-year retention policy in place (no hard delete of invoices)
- [ ] User manual / software documentation prepared
- [ ] יועץ מס or רו"ח has reviewed before submission

---

## Registration Steps

1. Register BON as בית תוכנה with ח.פ./ע.מ.
2. File digital registration form at ITA portal
3. Submit: software copy + professional docs + tech specs
4. ITA review ~90 days
5. Receive תעודת רישום → embed registration number (field 1006) in all SHAAM submissions
6. Embed certificate number in invoice footer
7. Attach certificate to all customer agreements

---

## Code Changes After Approval

- [ ] Add `SHAAM_REGISTRATION_NUMBER` env var
- [ ] Embed in all SHAAM API payloads (`AccountingSoftwareNumber` field)
- [ ] Update invoice PDF footer with registration number
- [ ] Update Terms of Service / customer agreements

---

## Architecture Notes

<!-- Your notes here — registration number received, certificate storage, any spec surprises from the ITA review process -->

---

## Links

- ITA portal: —
- Application submitted: —
- Certificate received: —
