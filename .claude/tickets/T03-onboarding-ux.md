# T03 — Lightweight Business Onboarding

**Status**: 🔄 In Progress (`fix/onboarding-and-fixes`)
**Phase**: 0 — Foundation
**Requires**: T01
**Blocks**: T04, T05

---

## What & Why

The current 3-step wizard (type → legal identity → address+contact) collects ~10 fields before the user sees any value. Simplify to a single form with 3 fields. Address, VAT, phone, email move to settings and are gated at invoice finalization (see PLAN.md "Progressive Business Profile Collection").

---

## UI Spec

Single page, no stepper. A card with a type selector and 2 fields below it.

### Business type selector

Keep the existing `Radio.Card` group with descriptions:

| Value | Label | Description |
|-------|-------|-------------|
| `licensed_dealer` | עוסק מורשה | עסק יחיד או שותפות שגובה מע״מ. מחזור שנתי מעל ₪120,000 |
| `exempt_dealer` | עוסק פטור | עצמאי שמחזורו מתחת ל-₪120,000. פטור מגביית מע״מ |
| `limited_company` | חברה בע״מ | חברה פרטית הרשומה ברשם החברות (ח.פ.) |

### Fields (adapt labels by type)

**Name** — `TextInput`, required:

| Type | Label |
|------|-------|
| `exempt_dealer` | שם מלא (כפי שמופיע בתעודת הזהות) |
| `licensed_dealer` | שם העסק |
| `limited_company` | שם החברה |

Error: "שם נדרש"

**Registration number** — `TextInput`, required, `maxLength={9}`:

| Type | Label |
|------|-------|
| `exempt_dealer` | מספר תעודת זהות (ת.ז.) |
| `licensed_dealer` | מספר עוסק מורשה (ע.מ.) |
| `limited_company` | מספר חברה (ח.פ.) |

Validation:
- Must be exactly 9 digits → "מספר רישום חייב להיות 9 ספרות"
- For `exempt_dealer`: must pass Israeli ID checksum (`validateIsraeliId`) → "מספר ת.ז. לא תקין"
- Empty → "מספר רישום נדרש"

### Behavior
- Changing business type clears registration number only (name is preserved — label changes but content is still valid)
- On submit for `exempt_dealer`: set `defaultVatRate = 0` (exempt from VAT)
- On submit: POST to create business → redirect to `/business/settings` with toast: "העסק נוצר! השלם את הפרופיל כדי להנפיק חשבוניות."
- Duplicate registration number error: if API returns `duplicate_registration_number`, show inline error on the registrationNumber field

### Fields removed from onboarding
- VAT number
- Address (city, street, house number, postal code)
- Phone, email
- Invoice number prefix, starting invoice number

---

## Settings Page: Add VAT Number Field

`BusinessSettings.tsx` already has address, phone, email, and defaultVatRate — but no `vatNumber` field. Since we're removing it from onboarding, it must be editable in settings.

Add `vatNumber` field to the settings form:
- Location: after registration number (read-only) in the basic info section
- Label: same per-type logic as the old onboarding (see `getVatLabel` / `getVatDescription`)
  - `licensed_dealer`: "מספר רישום מע״מ" / description: "בדרך כלל זהה למספר הרישום"
  - `limited_company`: "מספר מע"מ" / description: "בדרך כלל זהה לח.פ."
  - `exempt_dealer`: hidden (not applicable)
- Validation: exactly 9 digits, same as registration number
- `updateBusinessBodySchema`: add `vatNumber` field — it's currently missing from the schema
- `BusinessSettings.tsx` useEffect: initialize `vatNumber` from the API response (currently not populated)

---

## Backend Changes

### `types/src/businesses.ts`
- `createBusinessBodySchema`: change `streetAddress` and `city` from required (`nonEmptyString`) to optional (`nonEmptyString.optional()`)
- `updateBusinessBodySchema`: add `vatNumber: z.union([registrationNumberSchema, z.literal(null)]).optional()`

### `api/src/services/business-service.ts`
- On create: if `businessType === 'exempt_dealer'`, enforce `defaultVatRate = 0` server-side (don't trust the client)

### `api/src/routes/business-routes.ts`
- No route changes needed — already accepts optional fields, just the schema gated them

### Existing tests
- Update any tests that pass `streetAddress`/`city` as required fields in business creation payloads
- Add a test: create business with only `name`, `businessType`, `registrationNumber` → 200 OK

---

## What to delete

- Steps 1 and 2 UI (address+contact step, VAT number field) from `Onboarding.tsx`
- Stepper component and step navigation logic
- `streetAddress`/`city` required validation in frontend form
- VAT number field and its auto-populate-from-registration-number logic
- Phone/email fields and their validation from the onboarding form
- Invoice prefix/starting number fields from onboarding

---

## Acceptance Criteria

- [ ] Single-page form: business type + name + registration number (no stepper)
- [ ] Labels adapt per business type (see tables above)
- [ ] Israeli ID checksum validation for ת.ז. (עוסק פטור)
- [ ] Registration number: 9-digit validation with correct error messages
- [ ] Changing type clears registration number only (name preserved)
- [ ] `exempt_dealer` submit sets `defaultVatRate = 0` (enforced server-side too)
- [ ] Duplicate registration number → inline error on field
- [ ] After submit: redirect to `/business/settings` with success toast
- [ ] Backend accepts business creation without address/VAT/phone/email
- [ ] Settings page: VAT number field added (hidden for exempt_dealer, per-type labels)
- [ ] Settings page: `vatNumber` initialized from API response
- [ ] `updateBusinessBodySchema` includes `vatNumber`
- [ ] Existing tests updated, new test for minimal creation payload
- [ ] `npm run check` passes

---

## Links

- Branch: `fix/onboarding-and-fixes`
- PR: —
- Deployed: ⬜
