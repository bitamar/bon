# BON — Ticket Board

## MVP Definition

The MVP is the minimum a business in Israel needs to legally issue invoices and get paid:

1. **Onboard** — create an account, set up a business profile
2. **Add customers** — the people/companies you invoice
3. **Create invoices** — line items, VAT, finalize, get a sequential number
4. **Generate PDFs** — send a real invoice document to customers
5. **SHAAM integration** — get allocation numbers for invoices above threshold

Everything beyond that (payment recording, credit notes, reporting, PCN874) is post-MVP but required for legal operation past the first few months.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Merged to main |
| 🔄 | In progress (branch open, not merged) |
| ⬜ | Not started |
| 🔒 | Blocked (waiting on a previous ticket) |

---

## Ticket Board

### Phase 0 — Foundation

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T00](./T00-auth.md) | Auth & Sessions | ✅ | main |
| [T01](./T01-business-management.md) | Business Management | ✅ | main |
| [T02](./T02-team-invitations.md) | Team Invitations | ✅ | main |
| [T03](./T03-onboarding-ux.md) | Business Onboarding UX | ✅ | main (PR #4) |

### Cross-Cutting

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T-API-01](./T-API-01-api-hardening.md) | API Hardening (8 fixes from full audit) | ✅ | main (PR #8) |
| [T-SEC-01](./T-SEC-01-query-limits.md) | Query Limits (subsumed by T-API-01 item 7) | ✅ | main (PR #8) |
| [T-LEGAL-01](./T-LEGAL-01-accountant-review.md) | Accountant Review (6 items before invoice launch) | ⬜ | — |
| [T-CRON-01](./T-CRON-01-nightly-jobs.md) | Nightly Jobs & pg-boss (absorbs T17) | 🔒 | — |

### Phase 1 — Customers

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T04](./T04-customer-backend.md) | Customer Backend (API + DB) | ✅ | main (PR #5) |
| [T05](./T05-customer-frontend.md) | Customer Frontend (list + create + edit) | ✅ | main (PR #7) |

### Phase 2 — Invoices (Core Product)

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T06](./T06-invoice-schema.md) | Invoice Data Model & VAT Engine | ⬜ | — (next up) |
| [T07](./T07-invoice-create-ui.md) | Invoice Create/Edit UI (draft) | 🔒 | — |
| [T08](./T08-invoice-finalization.md) | Invoice Finalization & Detail View | 🔒 | — |
| [T09](./T09-invoice-list.md) | Invoice List & Search | 🔒 | — |

### Phase 3 — PDF

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T10](./T10-pdf-generation.md) | Invoice PDF Generation | 🔒 | — |
| [T11](./T11-email-delivery.md) | Email Delivery | 🔒 | — |

### Phase 4 — SHAAM Integration

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T12](./T12-shaam-abstraction.md) | SHAAM Abstraction & Token Management | 🔒 | — |
| [T13](./T13-shaam-allocation.md) | SHAAM Allocation Requests | 🔒 | — |
| [T14](./T14-shaam-emergency.md) | SHAAM Emergency Numbers & Error Handling | 🔒 | — |

### Phase 5 — Invoice Lifecycle

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T15](./T15-payments.md) | Payment Recording | 🔒 | — |
| [T16](./T16-credit-notes.md) | Credit Notes | 🔒 | — |
| ~~[T17](./T17-overdue.md)~~ | ~~Overdue Detection (cron)~~ — absorbed into T-CRON-01 | — | — |

### Phase 6 — Reporting

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T18](./T18-dashboard.md) | Business Dashboard | 🔒 | — |
| [T19](./T19-pcn874.md) | PCN874 VAT Report | 🔒 | — |
| [T20](./T20-uniform-file.md) | Uniform File Export (קובץ במבנה אחיד) | 🔒 | — |

### Phase 7 — ITA Registration

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T21](./T21-ita-registration.md) | ITA Software Registration | 🔒 | — |

---

## The Gate Rule

**Never start ticket N+1 until ticket N is merged to main.**

"Tests pass" is not done. **Merged to main** is done.
