# T-SEC-01 — Enforce Query Limits on List Endpoints

**Type:** Security hardening
**Priority:** Medium
**Found during:** T04 security review

## Problem

List endpoints (e.g. `GET /businesses/:businessId/customers`) accept a `limit` query parameter with no upper bound. An authenticated user can send `?limit=10000000` and force an unbounded database scan + massive JSON response in a single request. This bypasses rate limiting since the damage is done in one request within the rate window.

Currently affected:
- `GET /businesses/:businessId/customers` — `limit` param passed directly to `searchCustomers`

Future endpoints (invoices, payments, etc.) will have the same pattern and should be covered by this fix.

## Scope

1. **Cap `limit` in Zod schemas** — clamp to a reasonable max (e.g. 200) at the validation layer so oversized values never reach the service
2. **Audit all existing list endpoints** — check businesses, invitations, team members for the same issue
3. **Establish a pattern** — create a shared `paginationQuerySchema` in `types/` that all list endpoints reuse, so new endpoints get this for free
4. **Add a test** — verify that `?limit=999999` is clamped or rejected

## Notes

- The default of 50 is fine; only the ceiling is missing
- Prefer clamping (`Math.min(value, 200)`) over rejecting with 400 — less disruptive to clients
- Consider adding `offset` or cursor-based pagination in the same pass if it's cheap, but don't block on it
