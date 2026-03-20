# TWA-01: Add WhatsApp Phone Field to User Profile

## Status: ⬜ Not started

## Summary

Add an optional phone number field to the user profile for WhatsApp identity. This phone number identifies the user for WhatsApp interactions — it's how BON knows *who* is texting, resolves their businesses and roles, and sends notifications.

**Two separate phone fields, two separate purposes:**
- `users.phone` — WhatsApp identity (E.164, unique, used for inbound message resolution)
- `businesses.phone` — display-only, printed on invoice PDFs (local format, not unique, no WhatsApp role)

## Why

The WhatsApp integration (TWA-02+) needs to map an inbound phone number to a **user**, not a business. A user may belong to multiple businesses with different roles. Tying the phone to the user gives us:
- **Identity**: we know who is acting (audit trail, `recordedByUserId`)
- **Role enforcement**: we can check their role before destructive operations
- **Multi-tenant**: one phone, multiple businesses — user picks which one

`users.phone` already exists in the schema (nullable text, no unique constraint). We need to add a unique constraint and normalize to E.164 format. `businesses.phone` stays as-is — it's only for invoice display and has no interaction with WhatsApp.

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
   - **Israeli-only for now.** All validation and normalization assumes Israeli numbers (`+972`). International support would require country-code detection and a library like `libphonenumber-js` — out of scope for WhatsApp MVP.

3. **`api/src/db/schema.ts`**:
   - Add partial unique index on `users.phone` (where phone is not null):
     ```typescript
     uniqueIndex('users_phone_unique').on(users.phone).where(sql`phone IS NOT NULL`)
     ```
   - Add `whatsappEnabled` boolean column (default `true`)
   - **`businesses.phone` stays unchanged** — it's display-only for invoice PDFs, no schema changes needed
   - **`users.phone` storage format**: E.164 (`+972521234567`) — no format conversion needed for WhatsApp lookup

4. **Migration** — `npm run db:generate -w api` to create the migration.
   - **Pre-migration safety**: The migration must check for existing duplicate non-null `users.phone` values before creating the unique index. If duplicates exist, null them out (or log and fail) so the index creation doesn't error. Add a `DO $$` block that sets duplicate phones to `NULL` before `CREATE UNIQUE INDEX`.

### Backend Changes

5. **`api/src/routes/users.ts`** — Add/verify a profile update endpoint that accepts phone:
   - Accept any reasonable Israeli format, normalize to E.164 before storing
   - Reject duplicates (unique constraint will throw → catch and return 409 with a generic message like `"מספר טלפון זה כבר בשימוש"` — do not echo the phone number in the response)
   - Accept `whatsappEnabled` boolean
   - **PII handling**: Phone numbers are PII. Never log full phone numbers — mask as `+9725****567` or log only the `userId`. Ensure unique-constraint error handlers don't leak the conflicting phone in error payloads.

6. **Clarify `businesses.phone` as invoice-display-only** — no schema or backend changes needed (column, types, PDF rendering, and service serialization all stay as-is). Only the frontend label needs a tweak:

   **Frontend:**
   - `front/src/pages/BusinessSettings.tsx` — update the phone `TextInput` (~line 109):
     - Label: `טלפון לחשבונית` (instead of plain `טלפון`)
     - Add tooltip (Mantine `Tooltip` wrapping an info icon): `"מספר זה מוצג על גבי החשבונית בלבד ואינו קשור ל-WhatsApp"`
     - Keep existing validation and save logic unchanged

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
13. **API test**: partial unique index allows multiple users with `phone = NULL` (no constraint violation)
14. **API test**: 409 response for duplicate phone contains generic message, not the phone number
15. **Frontend test**: profile page shows phone field with validation

## Acceptance Criteria

- [ ] `users.phone` has a partial unique index (unique where not null)
- [ ] `users.phone` stores E.164 format (`+972521234567`)
- [ ] `businesses.phone` remains unchanged — display-only for invoice PDFs
- [ ] Business settings phone field labeled `טלפון לחשבונית` with tooltip clarifying it's for invoices only
- [ ] User can set their phone via profile update (accepts formatted input, normalizes)
- [ ] Duplicate phone is rejected with 409 (generic message, phone not echoed in response)
- [ ] Phone field uses Israeli format validation and `dir="ltr"`
- [ ] `whatsappEnabled` boolean exists on user profile
- [ ] Existing users without phone are unaffected
- [ ] Migration runs cleanly on existing data
- [ ] `npm run check` passes

## Size

~180 lines changed. Small-medium ticket.

## Dependencies

None — can start immediately.
