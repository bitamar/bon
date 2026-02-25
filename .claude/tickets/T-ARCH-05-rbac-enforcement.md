# T-ARCH-05 — Enforce Role-Based Access Control

**Status**: ⬜ Not started
**Phase**: Cross-cutting (security)
**Requires**: T-ARCH-01 merged (clean data layer first)
**Blocks**: Nothing strictly, but should land before T08 (finalization is a destructive action)

---

## What & Why

The role infrastructure exists — `businessRoleEnum` (owner/admin/user), `requireBusinessRole()` decorator in `business-context.ts` — but it's never called. Every authenticated business member has identical permissions. A `user` role can finalize invoices, delete customers, and modify business settings.

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
| **Delete customers** | yes | yes | no |
| **Modify business settings** | yes | no | no |
| **Manage team members** | yes | no | no |
| **Delete business** | yes | no | no |

### Implementation

Add `preHandler: [app.requireBusinessRole('owner', 'admin')]` to destructive endpoints:

```typescript
// api/src/routes/invoices.ts — finalize
app.post('/businesses/:businessId/invoices/:invoiceId/finalize', {
  preHandler: [app.authenticate, app.requireBusinessAccess, app.requireBusinessRole('owner', 'admin')],
  // ...
});

// api/src/routes/customers.ts — delete (soft)
app.patch('/businesses/:businessId/customers/:customerId', {
  preHandler: [app.authenticate, app.requireBusinessAccess],
  // Check role in handler only for deactivation:
  // if (body.isActive === false) ensureRole(req, 'owner', 'admin');
});

// api/src/routes/businesses.ts — update settings
app.patch('/businesses/:businessId', {
  preHandler: [app.authenticate, app.requireBusinessAccess, app.requireBusinessRole('owner')],
  // ...
});
```

### Frontend

- Hide finalize button for `user` role (show "Requires admin or owner permissions")
- Hide business settings link for non-owners
- No new pages needed — just conditional rendering based on `activeBusiness.role`

---

## Deliverables

### Modified Files (~6-8)

| File | Change |
|------|--------|
| `api/src/routes/invoices.ts` | Add `requireBusinessRole` to finalize + delete |
| `api/src/routes/customers.ts` | Add role check for deactivation |
| `api/src/routes/businesses.ts` | Add `requireBusinessRole('owner')` to update |
| `api/tests/routes/invoices.test.ts` | Test: user role → 403 on finalize |
| `api/tests/routes/customers.test.ts` | Test: user role → 403 on deactivate |
| `api/tests/routes/businesses.test.ts` | Test: admin → 403 on settings update |
| `front/src/pages/InvoiceEdit.tsx` | Conditionally show finalize button |
| `front/src/pages/BusinessSettings.tsx` | Conditionally disable editing for non-owners |

---

## Acceptance Criteria

- [ ] `user` role cannot finalize invoices (API returns 403)
- [ ] `user` role cannot deactivate customers (API returns 403)
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
