# T-ARCH-03 — Add businessId to Frontend Routes

**Status**: ⬜ Not started
**Phase**: Cross-cutting (architecture)
**Requires**: T7.5 merged
**Blocks**: T08-C, T08-D (all new pages should use the correct routing pattern from the start)

---

## What & Why

Frontend routes are `/business/customers` instead of `/businesses/:businessId/customers`. The active business lives in localStorage + React context, invisible in the URL. The API properly scopes everything under `/businesses/:businessId/`.

**Consequences of current design:**
- Deep links impossible — can't share a link to a specific business's customer list
- Browser back/forward shows wrong data after switching businesses
- Two tabs for different businesses interfere via shared localStorage
- No bookmarking of business-specific pages

**Why now:** With ~10 pages this is a manageable refactor. After T08-D and T09 add more pages, the migration doubles in scope. Every new page built with the old pattern is wasted work.

---

## Design

### URL Structure

| Current | New |
|---------|-----|
| `/business/customers` | `/businesses/:businessId/customers` |
| `/business/customers/new` | `/businesses/:businessId/customers/new` |
| `/business/customers/:id` | `/businesses/:businessId/customers/:customerId` |
| `/business/settings` | `/businesses/:businessId/settings` |
| `/business/invoices/new` | `/businesses/:businessId/invoices/new` |
| `/business/invoices/:id/edit` | `/businesses/:businessId/invoices/:invoiceId/edit` |
| `/businesses` | `/businesses` (no change — this is the switcher) |

### Legacy Route Redirects

All old paths must redirect to their canonical equivalents so existing bookmarks and any hardcoded links (in tests, docs, or browser history) continue to work. Redirects are **client-side only** (React Router `<Navigate>` with `replace`), since the frontend is a SPA with no server-side routing.

| Legacy Path | Redirect Target |
|-------------|----------------|
| `/business/customers` | `/businesses/:activeBusinessId/customers` |
| `/business/customers/new` | `/businesses/:activeBusinessId/customers/new` |
| `/business/customers/:id` | `/businesses/:activeBusinessId/customers/:customerId` |
| `/business/settings` | `/businesses/:activeBusinessId/settings` |
| `/business/invoices/new` | `/businesses/:activeBusinessId/invoices/new` |
| `/business/invoices/:id/edit` | `/businesses/:activeBusinessId/invoices/:invoiceId/edit` |

Where `:activeBusinessId` is resolved from localStorage (last active business). If no active business exists, redirect to `/businesses` (the switcher).

Implementation: A single `<LegacyRedirect>` component registered on `/business/*` that reads the active business ID from localStorage and navigates to the equivalent canonical URL with `replace: true`.

### BusinessContext Changes

1. `activeBusiness` derived from URL param `:businessId` instead of localStorage
2. `switchBusiness(id)` navigates to `/businesses/${id}/...` (current route with new businessId)
3. localStorage remains as a **fallback only** — for the initial redirect from `/` to `/businesses/:lastUsed/...`
4. **Scoped query invalidation**: `switchBusiness` invalidates only queries with `['business', oldId]` prefix, not all queries

### Route Guard

A new `<BusinessRoute>` layout component that:
1. Reads `:businessId` from URL params
2. Verifies user has access to that business (from the businesses list query)
3. Sets it as the active business in context
4. Shows 404 if business not found or user not a member

---

## Deliverables

### Modified Files (~8-10)

| File | Change |
|------|--------|
| `front/src/App.tsx` | Restructure routes under `/businesses/:businessId/` |
| `front/src/contexts/BusinessContext.tsx` | Derive from URL param; scope invalidation |
| `front/src/Navbar.tsx` | Update nav links to include businessId |
| `front/src/pages/CustomerList.tsx` | Use `useParams().businessId` |
| `front/src/pages/CustomerCreate.tsx` | Use `useParams().businessId` |
| `front/src/pages/CustomerDetail.tsx` | Use `useParams().businessId` |
| `front/src/pages/BusinessSettings.tsx` | Use `useParams().businessId` |
| `front/src/pages/InvoiceNew.tsx` | Use `useParams().businessId` |
| `front/src/pages/InvoiceEdit.tsx` | Use `useParams().businessId` |
| `front/src/pages/Dashboard.tsx` | Use `useParams().businessId` |
| `front/src/components/QuickActions.tsx` | Update links |
| Tests (~10 files) | Update route paths in test setup |

### New Component

`front/src/components/BusinessRoute.tsx` — layout component that reads `:businessId` from URL and provides it to children via context.

---

## Acceptance Criteria

- [ ] All business-scoped routes include `:businessId` in the URL
- [ ] Navigating to `/businesses/:id/customers` works and loads that business's customers
- [ ] Switching businesses in the TenantSwitcher navigates to the new business's equivalent page
- [ ] Deep links work — pasting a URL loads the correct business and page
- [ ] `switchBusiness` only invalidates business-scoped queries, not user profile or businesses list
- [ ] Invalid businessId in URL shows appropriate error (not blank page)
- [ ] Default route (`/`) redirects to `/businesses/:lastUsed/` using localStorage fallback
- [ ] Legacy routes (`/business/*`) redirect to canonical routes (`/businesses/:businessId/*`) using `<Navigate replace>`
- [ ] Each legacy URL in the table above resolves to the correct canonical URL (test per route)
- [ ] If no active business in localStorage, legacy routes redirect to `/businesses`
- [ ] All existing tests updated and passing
- [ ] `npm run check` passes

---

## Notes

- The `useBusiness()` hook signature should remain the same externally — the `activeBusiness` value still comes from context, but the context now derives from the URL instead of localStorage.
- The TenantSwitcher component needs to navigate rather than just set state.
- This is a refactor, not a feature. No new capabilities. The user experience should be identical except URLs are now shareable.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
