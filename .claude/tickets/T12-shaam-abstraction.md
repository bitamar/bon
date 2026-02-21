# T12 — SHAAM Abstraction & Token Management

**Status**: 🔒 Blocked (T11 must merge first)
**Phase**: 4 — SHAAM Integration
**Requires**: T11 merged
**Blocks**: T13

---

## What & Why

SHAAM is Israel's Tax Authority system for electronic invoice allocation numbers. Invoices above a threshold (currently ₪10,000 excl. VAT, dropping to ₪5,000 in June 2026) issued to licensed dealers must have an allocation number before they are legally valid.

This ticket builds the abstraction layer + OAuth2 token management. No real SHAAM calls yet — that's T13. The point is to define the interface cleanly so the real client, sandbox client, and mock client are all swappable.

---

## Acceptance Criteria

- [ ] `ShaamService` interface defined with:
  - `requestAllocationNumber(businessId, invoice, lineItems): Promise<AllocationResult>`
  - `acquireEmergencyNumbers(businessId, count): Promise<EmergencyNumber[]>`
  - `reportEmergencyUsage(businessId, usedNumbers[]): Promise<void>`
- [ ] Three implementations: `ShaamApiClient`, `ShaamSandboxClient`, `ShaamMockClient`
- [ ] Toggle via `SHAAM_MODE=mock|sandbox|production` env var
- [ ] `business_shaam_credentials` table:
  - accessToken, refreshToken (encrypted at rest, AES-256-GCM)
  - tokenExpiresAt, scope
- [ ] Token refresh logic: refresh 5 minutes before expiry
- [ ] On refresh failure: mark business as needing re-auth, notify owner
- [ ] `requiresAllocationNumber(invoice, customer, business): boolean` pure function
- [ ] Unit tests for the trigger logic (threshold checks, isLicensedDealer, VAT=0 bypass)
- [ ] `npm run check` passes

---

## Architecture Notes

<!-- Your notes here — e.g. encryption key management, token refresh job design, how SHAAM_MODE is injected, interface vs class decision -->

---

## Threshold Schedule

| From | Threshold (excl. VAT) |
|------|----------------------|
| Now (2025) | > ₪20,000 |
| Jan 2026 | > ₪10,000 |
| Jun 2026 | > ₪5,000 |

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
