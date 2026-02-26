# T-ARCH-05 — Enforce Role-Based Access Control

**Status**: ⬜ Not started
**Phase**: Cross-cutting (security)
**Requires**: None (RBAC enforcement is route-level preHandlers + frontend conditionals — no data-layer changes needed)
**Blocks**: Nothing strictly, but should ideally land before T08 so RBAC protects destructive actions (finalize, delete) from the start

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

// api/src/routes/invoices.ts — delete (same RBAC as finalize)
app.delete('/businesses/:businessId/invoices/:invoiceId', {
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

// api/src/routes/customers.ts — reactivate (same RBAC as deactivate)
app.post('/businesses/:businessId/customers/:customerId/reactivate', {
  preHandler: [app.authenticate, app.requireBusinessAccess, app.requireBusinessRole('owner', 'admin')],
  handler: async (req, reply) => {
    // Calls service to set isActive=true
  },
});

// api/src/routes/customers.ts — general PATCH remains open to all roles
app.patch('/businesses/:businessId/customers/:customerId', {
  preHandler: [app.authenticate, app.requireBusinessAccess],
  // All roles can edit customer fields. Status transitions are handled by the dedicated routes above.
  // The PATCH handler rejects any `isActive` field in the body (return 400 directing caller to
  // POST .../deactivate or POST .../reactivate).
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

**Design note — PATCH body rejection of `isActive`:** The PATCH handler rejects any request body containing `isActive` (whether `true` or `false`), returning 400 with a message directing the caller to `POST .../deactivate` or `POST .../reactivate`. This keeps role enforcement in the preHandler and avoids in-handler conditionals. The tradeoff is a potential surprise for API consumers who expect PATCH to handle all fields. If future sensitive fields emerge (e.g., credit limits, billing flags), evaluate whether the dedicated-endpoint pattern still scales or whether a field-level permissions mechanism is more appropriate post-MVP.

### Frontend

Behavior per action when the current role lacks permission:

| Action | Component | Behavior | Rationale |
|--------|-----------|----------|-----------|
| Finalize invoice | Finalize button in `InvoiceEdit.tsx` | **Disable** — render a disabled button with tooltip "Requires admin or owner permissions" | Users see the invoice and should understand that finalization exists but is restricted, not wonder where the button went |
| Business settings | Settings link in `Navbar.tsx` | **Hide** — do not render the nav link at all | Non-owners have no reason to see the settings entry; hiding avoids clutter |
| Delete invoice | Delete button in `InvoiceEdit.tsx` | **Disable** — render a disabled button with tooltip "Requires admin or owner permissions" | Same rationale as finalize |

All conditional rendering is based on `activeBusiness.role` from context. No new pages needed.

---

## Deliverables

### Modified Files (9)

| File | Change |
|------|--------|
| `api/src/routes/invoices.ts` | Add `requireBusinessRole('owner', 'admin')` to finalize + delete |
| `api/src/routes/customers.ts` | Add `POST .../deactivate` and `POST .../reactivate` routes with role preHandler; reject any `isActive` field in PATCH body |
| `api/src/routes/businesses.ts` | Tighten to `requireBusinessRole('owner')` (currently owner+admin) |
| `api/src/services/customer-service.ts` | Add `deactivateCustomer()` and `reactivateCustomer()` methods (extracted from update) |
| `api/tests/routes/invoices.test.ts` | Test: user role → 403 on finalize; user role → 403 on DELETE (invoice still exists after rejection) |
| `api/tests/routes/customers.test.ts` | Test: user role → 403 on deactivate; user role → 403 on reactivate; user can still PATCH fields; PATCH with `isActive` → 400 |
| `api/tests/routes/businesses.test.ts` | Test: admin → 403 on settings update |
| `front/src/pages/InvoiceEdit.tsx` | Disable finalize + delete buttons for `user` role (tooltip: "Requires admin or owner permissions") |
| `front/src/Navbar.tsx` | Hide business settings link for non-owners |

---

## Acceptance Criteria

- [ ] `user` role cannot finalize invoices (API returns 403)
- [ ] `user` role cannot delete invoices via DELETE (API returns 403; invoice still exists after rejection)
- [ ] `user` role cannot deactivate customers via `POST .../deactivate` (API returns 403)
- [ ] `user` role cannot reactivate customers via `POST .../reactivate` (API returns 403)
- [ ] `user` role CAN edit customer fields via PATCH (name, email, etc.)
- [ ] PATCH with `isActive` in body (whether `true` or `false`) returns 400 directing caller to `POST .../deactivate` or `POST .../reactivate`
- [ ] Only `owner` can modify business settings (API returns 403 for admin/user)
- [ ] Frontend: finalize and delete buttons are disabled (not hidden) for `user` role with tooltip "Requires admin or owner permissions"
- [ ] Frontend: business settings link is hidden (not rendered) for non-owners
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
