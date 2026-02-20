# T04 — Customer Backend (API + DB)

**Status**: 🔄 In Progress (`onboarding-steps`)
**Phase**: 1 — Customers
**Requires**: T03 deployed
**Blocks**: T05

---

## What & Why

You can't create an invoice without a recipient. The customer record stores the tax identity information that must appear on every invoice by law. Getting the schema right now prevents broken invoices later — the `isLicensedDealer` flag in particular drives the SHAAM obligation in Phase 4.

---

## What Was Built (API only — no frontend yet)

- `customers` table in schema
- `customer-repository.ts`
- `customer-service.ts`
- `routes/customers.ts`: CRUD + search (`?q=`)
- Zod schemas in `types/`: `createCustomerBodySchema`, `updateCustomerBodySchema`, `customerSchema`
- Soft delete (`isActive`)
- Unique constraint: `(businessId, taxId)` where taxId is not null

---

## Acceptance Criteria

- [x] `POST /businesses/:id/customers` — create
- [x] `GET /businesses/:id/customers?q=` — search by name + taxId
- [x] `GET /businesses/:id/customers/:customerId` — detail
- [x] `PATCH /businesses/:id/customers/:customerId` — update
- [x] `DELETE /businesses/:id/customers/:customerId` — soft delete
- [x] Duplicate taxId within same business returns 409 with existing customer info
- [x] `npm run check` passes
- [ ] Deployed to production

---

## Architecture Notes

<!-- Your notes here — e.g. taxIdType enum values, isLicensedDealer purpose, soft delete approach -->

---

## Links

- Branch: `onboarding-steps`
- PR: —
- Deployed: ⬜
