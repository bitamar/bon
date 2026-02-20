# T02 — Team Invitations

**Status**: ✅ Deployed
**Phase**: 0 — Foundation
**Requires**: T01
**Blocks**: T03

---

## What & Why

Businesses need multiple users. An accountant, an assistant, a business owner — each logs in separately but sees the same data. The invitation system is how users join a business after the owner creates it.

---

## What Was Built

- `invitations` table: token (7-day), email, role, businessId, status
- `POST /businesses/:id/invitations` — create invitation
- `GET /invitations/:token` — verify token
- `POST /invitations/:token/accept` — join business
- `DELETE /businesses/:id/members/:userId` — remove member
- `TeamManagement.tsx` page: list members, invite by email, remove
- `InvitationAccept.tsx` page: accept flow after clicking email link

---

## Architecture Notes

<!-- Your notes here -->

---

## Links

- PR: —
- Deployed: ✅
