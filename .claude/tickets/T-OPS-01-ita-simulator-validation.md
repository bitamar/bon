# T-OPS-01 — ITA Simulator Validation

**Status**: ⬜ Not started
**Phase**: 7 — ITA Registration
**Type**: Manual testing
**Requires**: T19 ✅, T20 ✅
**Blocks**: T21 (ITA registration application)

---

## What & Why

Before applying for ITA software house registration (T21), both export formats must be validated against the ITA's official simulator tools. The code generates the files correctly per our reading of the spec, but the ITA may have undocumented requirements or edge cases that only the simulator catches.

---

## Tasks

### 1. BKMV (Uniform File) validation

- [ ] Generate a BKMV export from the app with representative test data (multiple invoice types, credit notes, payments)
- [ ] Download and run the ITA BKMV validator tool (available from ITA website)
- [ ] Feed the generated ZIP (INI.TXT + BKMVDATA.TXT + README.TXT) into the validator
- [ ] Document any errors or warnings
- [ ] Fix any spec discrepancies found (create code tickets as needed)
- [ ] Re-validate until clean pass

### 2. PCN874 (VAT Report) validation

- [ ] Generate a PCN874 export with representative test data
- [ ] Run through the ITA PCN874 validator
- [ ] Document any errors or warnings
- [ ] Fix any spec discrepancies (create code tickets as needed)
- [ ] Re-validate until clean pass

### 3. Documentation

- [ ] Save successful validation screenshots/logs as evidence for T21 application
- [ ] Note the validator version used

---

## Test data requirements

- At least 2 tax invoices (305) with line items and payments
- 1 tax invoice receipt (320)
- 1 credit note (330) linked to an invoice
- Mixed VAT rates (17% standard + 0% exempt)
- At least 1 invoice above SHAAM threshold
- Multiple payment methods (cash, transfer, credit card)

---

## Links

- BKMV service: `api/src/services/bkmv-service.ts`
- PCN874 service: `api/src/services/pcn874-service.ts`
- ITA validator tools: (download from ITA portal)
