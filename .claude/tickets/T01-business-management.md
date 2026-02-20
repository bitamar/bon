# T01 — Business Management

**Status**: ✅ Deployed
**Phase**: 0 — Foundation
**Requires**: T00
**Blocks**: T02, T03

---

## What & Why

Businesses are the tenants. Every piece of data (customers, invoices) hangs off a `businessId`. Getting the data model right here prevents painful migrations later.

---

## What Was Built

- `businesses` table: name, registrationNumber, vatNumber, businessType, address, invoiceSettings (prefix, startNumber), defaultVatRate, logoUrl
- Business types: עוסק מורשה, עוסק פטור, חברה בע"מ
- `user_businesses` join table with roles: owner, admin, user
- CRUD routes: `POST /businesses`, `GET /businesses/:id`, `PATCH /businesses/:id`
- Business settings page (`BusinessSettings.tsx`)
- Business list page (`BusinessList.tsx`) — tenant switcher

---

## Architecture Notes

<!-- Your notes here — e.g. decisions about how VAT rate is stored (basis points), address structure, etc. -->

---

## Links

- PR: —
- Deployed: ✅
