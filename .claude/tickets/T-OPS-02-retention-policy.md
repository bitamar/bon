# T-OPS-02 — Data Retention Policy (7-Year Requirement)

**Status**: ⬜ Not started
**Phase**: 7 — ITA Registration
**Type**: Infrastructure / Policy
**Requires**: Nothing
**Blocks**: T21 (ITA registration — must demonstrate compliance)

---

## What & Why

Israeli tax law requires businesses to retain financial records for 7 years. As invoicing software, BON must:
1. Ensure invoice data is never deleted (only soft-deleted at most)
2. Have a documented backup and retention policy
3. Demonstrate this to the ITA during Appendix H (נספח ה') registration

---

## Tasks

### 1. Audit current data handling

- [ ] Verify that finalized invoices cannot be deleted (only cancelled via credit notes)
- [ ] Verify that `deletedAt` soft-delete on customers doesn't cascade to their invoices
- [ ] Verify that the draft cleanup job (T-CRON-02) only deletes drafts, never finalized documents
- [ ] Document findings

### 2. Database backup policy

- [ ] Configure automated daily backups on Railway PostgreSQL (or document how to)
- [ ] Set backup retention period to at least 7 years (or document the retention period)
- [ ] Test backup restore procedure
- [ ] Document recovery time objective (RTO) and recovery point objective (RPO)

### 3. Written retention policy document

- [ ] Draft a data retention policy document (Hebrew + English) covering:
  - What data is retained (invoices, credit notes, payments, customers, audit logs)
  - Retention period (7 years from document date)
  - How data is protected (encryption at rest, backups)
  - How data can be exported (BKMV, PCN874)
  - Deletion policy (what can be deleted, what cannot)
- [ ] This document is required for ITA registration

---

## Acceptance criteria

- [ ] No code path can delete a finalized invoice
- [ ] Backup policy documented and tested
- [ ] Retention policy document ready for ITA submission

---

## Links

- Draft cleanup job: `api/src/jobs/handlers/draft-cleanup.ts`
- Invoice routes (delete endpoint, if any): `api/src/routes/invoices.ts`
