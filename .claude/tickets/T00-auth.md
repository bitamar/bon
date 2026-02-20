# T00 — Auth & Sessions

**Status**: ✅ Deployed
**Phase**: 0 — Foundation
**Blocks**: everything

---

## What & Why

Google OAuth2 login (OIDC), session management with database-backed sessions, secure cookies. The prerequisite for everything else — without auth there is no tenant isolation.

---

## What Was Built

- Google OAuth2 / OIDC flow (state + nonce verification)
- Session table in DB, cookie-based auth
- `users` table, `auth-session` cookie
- `/auth/google`, `/auth/callback`, `/auth/logout`, `/auth/me` routes
- Auth plugin: `requireAuth` decorator on Fastify
- User repo + service

---

## Architecture Notes

<!-- Your notes here -->

---

## Links

- PR: —
- Deployed: ✅
