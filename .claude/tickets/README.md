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
| [T-CRON-01](./T-CRON-01-nightly-jobs.md) | pg-boss Job Queue Infrastructure | ✅ | main |
| [T-CRON-02](./T-CRON-02-scheduled-jobs.md) | Scheduled Maintenance Jobs (cleanup + overdue) | ✅ | main (PR #70) |

### Architecture Fixes (from deep review — execute before T08)

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T-ARCH-01](./T-ARCH-01-backend-type-safety.md) | Backend Type Safety & Data Layer Cleanup | ✅ | main |
| [T-ARCH-02](./T-ARCH-02-toctou-finalization.md) | Fix TOCTOU Race in Invoice Finalization | ✅ | main |
| [T-ARCH-03](./T-ARCH-03-frontend-routing.md) | Add businessId to Frontend Routes | ✅ | main |
| [T-ARCH-04](./T-ARCH-04-invoice-form-state.md) | Invoice Form: useForm + Autosave | ✅ | main |
| [T-ARCH-05](./T-ARCH-05-rbac-enforcement.md) | Enforce Role-Based Access Control | ✅ | main |
| [T-ARCH-06](./T-ARCH-06-test-infra.md) | Replace pg-mem with testcontainers | ✅ | main |
| [T-ARCH-07](./T-ARCH-07-address-error-handling.md) | Address API Error Handling | ✅ | main |
| [T-ARCH-08](./T-ARCH-08-idempotent-email-send.md) | Async Email Delivery via pg-boss (outbox pattern) | ⬜ | — |

### Ops / Registration Prerequisites

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T13.5](./T13.5-shaam-http-integration.md) | SHAAM HTTP Integration (real ITA API calls) | ⬜ | — |
| [T-OPS-01](./T-OPS-01-ita-simulator-validation.md) | ITA Simulator Validation (BKMV + PCN874) | ⬜ | — |
| [T-OPS-02](./T-OPS-02-retention-policy.md) | Data Retention Policy (7-year requirement) | ⬜ | — |
| [T-OPS-03](./T-OPS-03-user-manual.md) | User Manual / Software Documentation | ⬜ | — |
| [T-OPS-04](./T-OPS-04-monitoring-setup.md) | Production Monitoring Setup (Grafana + alerts) | ⬜ | — |

### Phase 1 — Customers

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T04](./T04-customer-backend.md) | Customer Backend (API + DB) | ✅ | main (PR #5) |
| [T05](./T05-customer-frontend.md) | Customer Frontend (list + create + edit) | ✅ | main (PR #7) |

### Phase 2 — Invoices (Core Product)

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T06](./T06-invoice-schema.md) | Invoice Data Model & VAT Engine | ✅ | main |
| [T07](./T07-invoice-create-ui.md) | Invoice API + Create/Edit (backend) | ✅ | main (PR #12) |
| [T7.5](./T7.5-invoice-edit-frontend.md) | Invoice Create/Edit Frontend (draft editor) | ✅ | main (PR #13) |
| [T08](./T08-invoice-finalization.md) | Invoice Finalization & Detail View (split into 4 sub-tickets) | ✅ | main |
| — [T08-A](./T08-A-shared-config.md) | Shared Invoice Config | ✅ | main (PR #18) |
| — [T08-B](./T08-B-finalize-backend.md) | Backend: Finalize Endpoint Extension | ✅ | main (PR #17) |
| — [T08-C](./T08-C-finalization-flow.md) | Frontend: Finalization Flow | ✅ | main (PR #22) |
| — [T08-D](./T08-D-detail-view.md) | Frontend: Detail View + Routing | ✅ | main (PR #22) |
| [T09](./T09-invoice-list.md) | Invoice List & Search | ✅ | main |
| — [T09-B](./T09-B-invoice-aggregates.md) | Invoice List Aggregates & Summary Row | ✅ | main (PR #43) |

### Phase 3 — PDF + Email

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T10](./T10-pdf-generation.md) | Invoice PDF Generation | ✅ | main (PR #45) |
| [T10.5](./T10.5-pdf-service-deploy.md) | Docker + Railway Deployment | ✅ | main (PRs #52-#54) |
| [T11](./T11-email-delivery.md) | Email Delivery | ✅ | main (included in T10) |

### Phase 4 — SHAAM Integration

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T12](./T12-shaam-abstraction.md) | SHAAM Abstraction & Token Management | ✅ | main (PR #61) |
| [T13](./T13-shaam-allocation.md) | SHAAM Allocation Requests | ✅ | main (PR #62) |
| [T14](./T14-shaam-emergency.md) | SHAAM Emergency Numbers & Error Handling | ✅ | main |

### Phase 5 — Invoice Lifecycle

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T15](./T15-payments.md) | Payment Recording | ✅ | main |
| [T16](./T16-credit-notes.md) | Credit Notes | ✅ | main (PR #66) |
| ~~[T17](./T17-overdue.md)~~ | ~~Overdue Detection (cron)~~ — absorbed into T-CRON-02 | ✅ | main (PR #70) |

### Phase 6 — Reporting

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T18](./T18-dashboard.md) | Business Dashboard | ✅ | main (PR #72) |
| [T19](./T19-pcn874.md) | PCN874 VAT Report | ✅ | main (PR #78) |
| [T20](./T20-uniform-file.md) | Uniform File Export (קובץ במבנה אחיד) | ✅ | main (PR #79) |

### Phase 7 — ITA Registration

| Ticket | Name | Status | Branch |
|--------|------|--------|--------|
| [T21](./T21-ita-registration.md) | ITA Software Registration | 🟡 | — |

---

## Current Focus

All feature tickets through T20 are merged. Remaining work:

1. **T21** — ITA Software Registration (administrative + code changes post-approval)
2. **T-LEGAL-01** — Accountant review (prerequisite for T21 application)
3. **T-ARCH-08** — Async email delivery (nice-to-have, not blocking T21)
4. **T13.5** — SHAAM HTTP integration with real ITA sandbox (prerequisite for production SHAAM)

---

## The Gate Rule

**Never start ticket N+1 until ticket N is merged to main.**

"Tests pass" is not done. **Merged to main** is done.
