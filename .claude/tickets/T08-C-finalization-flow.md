# T08-C — Frontend: Finalization Flow

**Status**: 🔒 Blocked (T08-B must merge first)
**Phase**: 2 — Invoices
**Requires**: T08-B merged
**Blocks**: T08-D

---

## What & Why

This is the most complex part of T08. It replaces the basic finalize behavior with a full multi-step flow: business profile completeness gate, VAT exemption reason prompt, structured preview modal, and confirmation with error handling.

---

## Deliverables

### New Files (4 source + 3 test)

| File | Purpose |
|------|---------|
| `front/src/hooks/useFinalizationFlow.ts` | State machine managing the 4-step finalization flow |
| `front/src/components/BusinessProfileGateModal.tsx` | Checks missing business fields, saves via PATCH |
| `front/src/components/VatExemptionReasonModal.tsx` | Select with 5 exemption reason options |
| `front/src/components/InvoicePreviewModal.tsx` | Read-only structured preview before confirm |
| `front/src/test/components/BusinessProfileGateModal.test.tsx` | Tests |
| `front/src/test/components/VatExemptionReasonModal.test.tsx` | Tests |
| `front/src/test/hooks/useFinalizationFlow.test.tsx` | Tests |

### Modified Files (2)

| File | Change |
|------|--------|
| `front/src/pages/InvoiceEdit.tsx` | Add "הפק חשבונית" button triggering `useFinalizationFlow` |
| `front/src/api/invoices.ts` | Add `finalizeInvoice(businessId, invoiceId, body)` API function |

---

## Acceptance Criteria

### Finalization Flow

- [ ] "הפק חשבונית" button appears in the edit page action bar
- [ ] **Step 0: Client-side validation** (no modal):
  - [ ] Customer required (non-null `customerId`) — show inline Alert if missing
  - [ ] At least 1 non-empty line item — show inline Alert if missing
  - [ ] `invoiceDate` must not be > 7 days in the future — show inline error
  - [ ] Do NOT validate amounts client-side (zero amounts are valid)
- [ ] **Step 1: BusinessProfileGateModal** (if profile incomplete):
  - [ ] Required fields checked: `name`, `streetAddress`, `city`, and `vatNumber` (non-exempt only)
  - [ ] Do NOT gate on `registrationNumber` — it is set at creation
  - [ ] If any missing, show modal with only the missing fields (not full settings page)
  - [ ] Fields use same Mantine components as `BusinessSettings.tsx`
  - [ ] On save: `PATCH /businesses/:businessId` with only missing fields
  - [ ] If PATCH fails: inline error in modal, do not proceed
  - [ ] On save success: modal closes, preview modal opens immediately (no second click)
  - [ ] Drafts are never gated — only finalization
- [ ] **Step 2: VatExemptionReasonModal** (if `totalVatAgora === 0` AND `businessType !== 'exempt_dealer'`):
  - [ ] Select with 5 options:
    - "ייצוא שירותים §30(א)(5)"
    - "ייצוא טובין §30(א)(1)"
    - "עסקה עם גוף מדינה"
    - "מוסד ללא כוונת רווח — §30(א)(2)"
    - "אחר — פרט בהערות"
  - [ ] When "אחר" selected: validate invoice `notes` field is non-empty; show inline error if empty
  - [ ] The selected value is sent in the finalize body
  - [ ] **Note**: These options are placeholders pending T-LEGAL-01 accountant review
- [ ] **Step 3: InvoicePreviewModal** (structured Mantine layout):
  - [ ] Shows: document type label, `invoiceDate`, customer info, all line items with amounts, totals, `notes`, `vatExemptionReason`
  - [ ] Invoice number shows: "מספר יוקצה בהפקה"
  - [ ] All values read-only
  - [ ] Disclaimer: "הסכומות יחושבו מחדש בשרת בעת ההפקה"
  - [ ] "אשר והפק" button disabled after first click (prevent double-submission)
- [ ] Confirm → `POST /businesses/:businessId/invoices/:invoiceId/finalize`
- [ ] On success: navigate to `/business/invoices/:invoiceId` (detail page — built in T08-D; if T08-D hasn't shipped yet, this will redirect to dashboard via the catch-all route, which is acceptable)
- [ ] **Error handling**:
  - [ ] `customer_inactive` → "הלקוח שנבחר אינו פעיל. חזור לטיוטה ובחר לקוח אחר"
  - [ ] Sequence number conflict → show retry option
  - [ ] `missing_vat_exemption_reason` → re-open VatExemptionReasonModal
  - [ ] Any other API error → toast with error message

### State Machine

```
idle → checking_profile → [complete] → checking_vat_exemption → [not needed | provided] → previewing → confirming → finalizing → done
                        → [incomplete] → show_profile_modal → (save) → checking_vat_exemption
```

### Component Tree

```
InvoiceEdit (existing page)
└── FinalizeButton ("הפק חשבונית")
    └── useFinalizationFlow() — hook managing step state machine
        │
        ├── STEP 0: Client-side validation (no modal)
        │   On failure → inline Alert in the form
        │
        ├── STEP 1: BusinessProfileGateModal (if profile incomplete)
        │   Modal (size="md", centered, closeOnClickOutside=false)
        │   ├── Header: "נדרש להשלים פרטי עסק"
        │   ├── Body: Alert (color="yellow") + Stack of only missing fields
        │   └── Footer: "ביטול" (subtle) + "שמור והמשך" (loading on save)
        │
        ├── STEP 2: VatExemptionReasonModal (if vatAgora===0 AND non-exempt)
        │   Modal (size="sm")
        │   ├── Header: "סיבת פטור ממע"מ"
        │   ├── Body: Select (required, 5 options)
        │   └── Footer: "ביטול" + "המשך"
        │
        ├── STEP 3: InvoicePreviewModal
        │   Modal (size="xl", fullScreen on mobile)
        │   ├── Header: "תצוגה מקדימה — לפני הפקה"
        │   ├── Body: read-only Paper with invoice data
        │   └── Footer: "חזרה לעריכה" + "הפק חשבונית סופית ←" (loading)
        │
        └── STEP 4: Error handling via notifications
```

---

## Tests

- [ ] `BusinessProfileGateModal`: submit success (modal closes), PATCH failure (inline error shown)
- [ ] `VatExemptionReasonModal`: selection works, "אחר" with empty notes shows error
- [ ] `useFinalizationFlow`: flow skips steps when not needed (e.g., profile complete → skip step 1)
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
