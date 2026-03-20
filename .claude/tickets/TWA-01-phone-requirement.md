# TWA-01: Add WhatsApp Phone Field to User Profile

## Status: ⬜ Not started

## Summary

Add an optional phone number field to the user profile for WhatsApp identity. Phone lives **only on users** — the `businesses.phone` column is removed entirely. This phone number identifies the user for WhatsApp interactions — it's how BON knows *who* is texting, resolves their businesses and roles, and sends notifications.

## Why

The WhatsApp integration (TWA-02+) needs to map an inbound phone number to a **user**, not a business. A user may belong to multiple businesses with different roles. Tying the phone to the user gives us:
- **Identity**: we know who is acting (audit trail, `recordedByUserId`)
- **Role enforcement**: we can check their role before destructive operations
- **Multi-tenant**: one phone, multiple businesses — user picks which one

`users.phone` already exists in the schema (nullable text, no unique constraint). We need to add a unique constraint, normalize to E.164 format, and remove the business-level phone column.

## Scope

### Schema Changes

1. **`types/src/users.ts`** — Add phone validation:
   - `israeliPhoneSchema` — accepts formatted input (`052-123-4567`, `052 1234567`, `0521234567`), strips non-digits, validates the result matches `^0[2-9]\d{7,8}$`
   - Add `phone` as optional in user profile update schema
   - Add `whatsappEnabled` boolean (default `true`) — user-level opt-out for WhatsApp

2. **`types/src/phone.ts`** — Pure validation + normalization (shared between API and frontend):
   - `normalizeIsraeliPhone(input: string): string` — strips spaces/hyphens/dots, validates Israeli mobile format
   - `toE164(localPhone: string): string` — `'0521234567'` → `'+972521234567'`
   - `fromE164(e164Phone: string): string` — `'+972521234567'` → `'0521234567'` (for display only)

3. **`api/src/db/schema.ts`**:
   - Add partial unique index on `users.phone` (where phone is not null):
     ```typescript
     uniqueIndex('users_phone_unique').on(users.phone).where(sql`phone IS NOT NULL`)
     ```
   - Add `whatsappEnabled` boolean column (default `true`)
   - **Remove `businesses.phone` column** — phone only exists on users
   - **Storage format**: E.164 (`+972521234567`) — no format conversion needed for WhatsApp lookup

4. **Migration** — `npm run db:generate -w api` to create the migration.

### Backend Changes

5. **`api/src/routes/users.ts`** — Add/verify a profile update endpoint that accepts phone:
   - Accept any reasonable Israeli format, normalize to E.164 before storing
   - Reject duplicates (unique constraint will throw → catch and return 409)
   - Accept `whatsappEnabled` boolean

6. **Remove `businesses.phone`** — the column is referenced in multiple layers. All must be updated:

   **Schema & types:**
   - `api/src/db/schema.ts` — drop `phone` column from `businesses` table
   - `types/src/businesses.ts` — remove `phone` from `businessSchema` (`phone: nullableString`), `createBusinessBodySchema` (`israeliPhoneSchema.optional()`), and `updateBusinessBodySchema` (`z.union([israeliPhoneSchema, z.literal(null)]).optional()`)

   **PDF generation** (phone currently renders in invoice headers):
   - `types/src/pdf.ts` — remove `phone` from `pdfBusinessDataSchema` (`phone: z.string().nullable()`)
   - `api/src/services/pdf-service.ts` — remove `phone: business.phone ?? null` from the `PdfBusinessData` construction (~line 114)
   - `pdf/src/pdf/InvoiceTemplate.tsx` — remove the conditional phone block in the business header (`{business.phone && (<div>טל: <span dir="ltr">{business.phone}</span></div>)}` around lines 80–84)
   - `pdf/tests/fixtures.ts` — remove `phone: '0501234567'` from `makeBusiness()` fixture

   **Frontend:**
   - `front/src/pages/BusinessSettings.tsx` — remove the phone `TextInput` field (~line 109 loads `phone: business.phone ?? ''`, line 160 saves it, and there's a TextInput with label "טלפון")

   **Business service:**
   - `api/src/services/business-service.ts` — remove phone from serialization (~lines 40, 53, 71, 96, 165)

### Frontend Changes

7. **Phone field on user profile/settings page**:
   - `TextInput` with placeholder `05X-XXXXXXX` and `dir="ltr"`
   - Label: `טלפון נייד (WhatsApp)`
   - Helper text: `מספר זה ישמש לזיהוי שלך ב-WhatsApp`
   - Validation: inline error on invalid format or duplicate
   - Display normalized format after blur (`052-1234567`)

8. **WhatsApp toggle on settings page**:
   - `Switch` component, label: `קבלת הודעות WhatsApp`
   - Default: enabled

### Tests

9. **API test**: profile update with valid phone (various formats) → 200, phone stored as E.164
10. **API test**: profile update with duplicate phone → 409
11. **API test**: profile update with invalid format → 400
12. **API test**: profile update with `whatsappEnabled: false` → 200
13. **Frontend test**: profile page shows phone field with validation

## Acceptance Criteria

- [ ] `users.phone` has a partial unique index (unique where not null)
- [ ] `users.phone` stores E.164 format (`+972521234567`)
- [ ] `businesses.phone` column is removed from schema, routes, frontend, and PDF generation
- [ ] Invoice PDF renders without phone (no blank line or broken layout)
- [ ] User can set their phone via profile update (accepts formatted input, normalizes)
- [ ] Duplicate phone is rejected with 409
- [ ] Phone field uses Israeli format validation and `dir="ltr"`
- [ ] `whatsappEnabled` boolean exists on user profile
- [ ] Existing users without phone are unaffected
- [ ] Migration runs cleanly on existing data
- [ ] `npm run check` passes

## Size

~250 lines changed. Medium ticket (larger due to business phone removal across schema, PDF, frontend, and services).

## Dependencies

None — can start immediately.
