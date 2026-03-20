# TWA-01: Require Phone Number on User Profile

## Status: ⬜ Not started

## Summary

Make phone number a required field on the user profile (not the business). This phone number identifies the user for WhatsApp interactions — it's how BON knows *who* is texting, resolves their businesses and roles, and sends notifications.

## Why

The WhatsApp integration (TWA-02+) needs to map an inbound phone number to a **user**, not a business. A user may belong to multiple businesses with different roles. Tying the phone to the user gives us:
- **Identity**: we know who is acting (audit trail, `recordedByUserId`)
- **Role enforcement**: we can check their role before destructive operations
- **Multi-tenant**: one phone, multiple businesses — user picks which one

`users.phone` already exists in the schema (nullable text, no unique constraint). We need to make it required for new users and add a unique constraint.

## Scope

### Schema Changes

1. **`types/src/users.ts`** (or wherever user schemas live) — Add phone validation:
   - `israeliPhoneSchema` for phone format (`z.string().trim().min(9).max(10).regex(/^0[2-9]\d{7,8}$/)`)
   - Add `phone` as required in any user profile update schema

2. **`api/src/db/schema.ts`** — Add unique index on `users.phone` (where phone is not null):
   ```typescript
   uniqueIndex('users_phone_unique').on(users.phone).where(sql`phone IS NOT NULL`)
   ```
   This ensures no two users share a phone (required for unambiguous WhatsApp lookup) while allowing existing users without a phone to remain valid.

3. **Migration** — `npm run db:generate -w api` to create the migration.

### Backend Changes

4. **`api/src/routes/users.ts`** (or equivalent) — Add/verify a profile update endpoint that accepts phone:
   - Validate Israeli phone format
   - Reject duplicates (unique constraint will throw → catch and return 409)

### Frontend Changes

5. **Phone prompt on first WhatsApp-relevant action** — Rather than blocking onboarding, add a phone field to the user's profile/settings page:
   - `TextInput` with placeholder `05X-XXXXXXX` and `dir="ltr"`
   - Label: `טלפון נייד (WhatsApp)`
   - Helper text: `מספר זה ישמש לזיהוי שלך ב-WhatsApp`
   - Validation: inline error on invalid format or duplicate

6. **Optional**: If the user tries to use a WhatsApp-dependent feature in the web UI without a phone set, show a prompt to add one. Not blocking for this ticket.

### Tests

7. **API test**: profile update with valid phone → 200, phone stored
8. **API test**: profile update with duplicate phone → 409
9. **API test**: profile update with invalid format → 400
10. **Frontend test**: profile page shows phone field with validation

## Acceptance Criteria

- [ ] `users.phone` has a partial unique index (unique where not null)
- [ ] User can set their phone via profile update
- [ ] Duplicate phone is rejected with 409
- [ ] Phone field uses Israeli format validation and `dir="ltr"`
- [ ] Existing users without phone are unaffected
- [ ] Migration runs cleanly on existing data
- [ ] `npm run check` passes

## Size

~120 lines changed. Small ticket.

## Dependencies

None — can start immediately.
