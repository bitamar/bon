# TWA-01: Require Phone Number on Business Onboarding

## Status: ⬜ Not started

## Summary

Make phone number a required field during business onboarding. This phone number will serve as the WhatsApp channel for the business owner to interact with BON (create invoices, receive notifications).

## Why

The WhatsApp integration (TWA-02+) requires a verified phone number per business. Collecting it at onboarding ensures every business is WhatsApp-ready from day one. Currently `phone` is optional on the business schema.

## Scope

### Schema Changes

1. **`types/src/businesses.ts`** — Add `phone` as required in `createBusinessBodySchema`:
   - Use `israeliPhoneSchema` (already exists: `z.string().trim().min(9).max(10).regex(/^0[2-9]\d{7,8}$/)`)
   - Keep it optional in `updateBusinessBodySchema` (can be changed later, but not removed)

2. **`api/src/db/schema.ts`** — No change needed. Column is already nullable text; we enforce at the Zod level, not the DB level (existing businesses without phone should still work).

### Backend Changes

3. **`api/src/services/business-service.ts`** — No changes needed (phone already passed through).

4. **`api/src/routes/businesses.ts`** — Verify phone is included in the create response. No route changes expected.

### Frontend Changes

5. **`front/src/pages/Onboarding.tsx`** — Add phone field to the onboarding form:
   - `TextInput` with placeholder `05X-XXXXXXX` and `dir="ltr"`
   - Position: after business name / registration number, before submit
   - Label: `טלפון נייד (WhatsApp)`
   - Validation: show inline error on invalid format
   - Helper text: `מספר זה ישמש לשליחת חשבוניות ועדכונים ב-WhatsApp`

### Tests

6. **API test**: business creation without phone → 400 validation error
7. **API test**: business creation with valid phone → 201 (already covered, just verify phone in response)
8. **Frontend test**: onboarding form shows phone field, submit without phone shows error

## Acceptance Criteria

- [ ] Phone is required on business creation (API returns 400 without it)
- [ ] Onboarding form has phone field with Israeli format validation
- [ ] Existing businesses without phone are unaffected (no migration needed)
- [ ] Phone field uses `dir="ltr"` for proper number display in RTL layout
- [ ] Helper text explains WhatsApp usage

## Size

~100 lines changed. Small ticket.

## Dependencies

None — can start immediately.
