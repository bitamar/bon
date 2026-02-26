# T-ARCH-05 — Enforce Role-Based Access Control

**Status**: ⬜ Not started
**Phase**: Cross-cutting (security)
**Requires**: T-ARCH-01 merged (clean data layer first)
**Blocks**: Nothing strictly, but should land before T08 (finalization is a destructive action)

---

## What & Why

The role infrastructure exists — `businessRoleEnum` (owner/admin/user), `requireBusinessRole()` decorator in `business-context.ts`. It is already used on the business PATCH route (`businesses.ts:79`, restricted to owner+admin), but is NOT used on invoice or customer routes. A `user` role can finalize invoices, delete customers, and perform other destructive actions.

This is acceptable for single-user businesses but becomes a problem as soon as team features are used (T02 team invitations already exists).

---

## Design

### Permission Matrix

| Action | owner | admin | user |
|--------|-------|-------|------|
| View customers / invoices | yes | yes | yes |
| Create / edit draft invoices | yes | yes | yes |
| Create / edit customers | yes | yes | yes |
| **Finalize invoices** | yes | yes | no |
| **Delete invoice** | yes | yes | no |
| **Delete customers** | yes | yes | no |
| **Modify business settings** | yes | no | no |
| **Manage team members** | yes | no | no |
| **Delete business** | yes | no | no |

### Implementation

Add `preHandler: [app.requireBusinessRole(...)]` to destructive endpoints. All RBAC enforcement must be in the route's `preHandler` array — never as an in-handler conditional — for consistency and auditability.

```typescript
// api/src/routes/invoices.ts — finalize
app.post('/businesses/:businessId/invoices/:invoiceId/finalize', {
  preHandler: [app.authenticate, app.requireBusinessAccess, app.requireBusinessRole('owner', 'admin')],
  // ...
});

// api/src/routes/customers.ts — deactivate (separate route from general PATCH)
// Split deactivation into its own endpoint so the preHandler can enforce role
// without blocking normal field edits for 'user' role.
app.post('/businesses/:businessId/customers/:customerId/deactivate', {
  preHandler: [app.authenticate, app.requireBusinessAccess, app.requireBusinessRole('owner', 'admin')],
  handler: async (req, reply) => {
    // Calls service to set isActive=false
  },
});

// api/src/routes/customers.ts — general PATCH remains open to all roles
app.patch('/businesses/:businessId/customers/:customerId', {
  preHandler: [app.authenticate, app.requireBusinessAccess],
  // All roles can edit customer fields. Deactivation is handled by the dedicated route above.
  // The PATCH handler should reject `isActive: false` in the body (return 400 directing caller to use POST /deactivate).
});

// api/src/routes/businesses.ts — CURRENT: requireBusinessRole('owner', 'admin') at line 79
// CHANGE TO: requireBusinessRole('owner') — only owners should modify invoicing settings
// (VAT rate, invoice prefix, business details). Admins retain other privileges per the matrix.
app.patch('/businesses/:businessId', {
  preHandler: [app.authenticate, app.requireBusinessAccess, app.requireBusinessRole('owner')],
  // ...
});
```

**Why a separate route for deactivation:** The customer PATCH endpoint handles general field updates (name, email, address) which all roles should be able to do per the permission matrix. Putting `requireBusinessRole('owner', 'admin')` on the PATCH would block `user` role from editing any customer field. A dedicated `POST .../deactivate` endpoint lets the preHandler enforce the role cleanly without an in-handler conditional.

**Design note — PATCH body rejection of `isActive: false`:** The PATCH handler explicitly rejects `isActive: false` in the request body (returning 400 with a message directing the caller to `POST .../deactivate`). This keeps role enforcement in the preHandler and avoids in-handler conditionals. The tradeoff is a potential surprise for API consumers who expect PATCH to handle all fields. If future sensitive fields emerge (e.g., credit limits, billing flags), evaluate whether the dedicated-endpoint pattern still scales or whether a field-level permissions mechanism is more appropriate post-MVP.

### Frontend

- Hide finalize button for `user` role (show "Requires admin or owner permissions")
- Hide business settings link for non-owners
- No new pages needed — just conditional rendering based on `activeBusiness.role`

---

## Deliverables

### Modified Files (~7-9)

| File | Change |
|------|--------|
| `api/src/routes/invoices.ts` | Add `requireBusinessRole('owner', 'admin')` to finalize + delete |
| `api/src/routes/customers.ts` | Add `POST .../deactivate` route with role preHandler; reject `isActive: false` in PATCH body |
| `api/src/routes/businesses.ts` | Tighten to `requireBusinessRole('owner')` (currently owner+admin) |
| `api/src/services/customer-service.ts` | Add `deactivateCustomer()` method (extracted from update) |
| `api/tests/routes/invoices.test.ts` | Test: user role → 403 on finalize |
| `api/tests/routes/customers.test.ts` | Test: user role → 403 on deactivate; user can still PATCH fields |
| `api/tests/routes/businesses.test.ts` | Test: admin → 403 on settings update |
| `front/src/pages/InvoiceEdit.tsx` | Conditionally show finalize button |
| `front/src/pages/BusinessSettings.tsx` | Conditionally disable editing for non-owners |

---

## Acceptance Criteria

- [ ] `user` role cannot finalize invoices (API returns 403)
- [ ] `user` role cannot deactivate customers via `POST .../deactivate` (API returns 403)
- [ ] `user` role CAN edit customer fields via PATCH (name, email, etc.)
- [ ] PATCH with `isActive: false` in body returns 400 (directs to deactivate endpoint)
- [ ] Only `owner` can modify business settings (API returns 403 for admin/user)
- [ ] Frontend hides/disables actions the current role cannot perform
- [ ] Error response includes a clear message (e.g., "Requires owner or admin role")
- [ ] `npm run check` passes
- [ ] Tests cover each role/endpoint combination listed in the matrix

---

## Notes

- `requireBusinessRole` already exists in `api/src/plugins/business-context.ts` — just needs to be wired up
- This doesn't change the data model at all — roles are already stored
- Draft creation/editing remains available to all roles — the principle is "create freely, finalize carefully"

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
