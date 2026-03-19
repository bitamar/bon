# T-OPS-03 — User Manual / Software Documentation

**Status**: ⬜ Not started
**Phase**: 7 — ITA Registration
**Type**: Documentation (manual)
**Requires**: All features implemented
**Blocks**: T21 (ITA registration requires a user manual)

---

## What & Why

The ITA Appendix H (נספח ה') registration requires submitting a user manual that describes:
1. How the software works
2. How invoices are created, numbered, and finalized
3. How the software integrates with SHAAM
4. What reports are available (PCN874, BKMV)
5. Security and access control

This is a **written document**, not code. It should be in Hebrew and describe the system from a business user's perspective.

---

## Sections to write

### 1. System overview
- What BON is and who it's for
- Multi-tenant architecture (each business is isolated)
- Supported document types (305, 320, 330, 400)

### 2. Getting started
- Google sign-in
- Creating a business profile
- Adding team members and roles

### 3. Customer management
- Adding customers
- Required fields (name, taxId for businesses)
- Address autocomplete

### 4. Invoice creation
- Creating a draft invoice
- Adding line items
- VAT calculation (17% standard, 0% exempt)
- Autosave behavior
- Finalizing an invoice (sequential numbering, irreversible)

### 5. Invoice lifecycle
- Payment recording
- Credit notes (partial/full)
- Overdue detection

### 6. PDF generation and email
- Generating PDF
- Sending via email
- PDF content and layout

### 7. SHAAM integration
- When allocation numbers are required
- How allocation works (automatic via background job)
- Emergency numbers (when SHAAM is unavailable)

### 8. Reports
- Business dashboard
- PCN874 VAT report export
- Uniform file (BKMV) export

### 9. Security
- Authentication (Google OAuth2)
- Role-based access (admin, member, viewer)
- Data isolation between businesses

### 10. Data retention
- 7-year retention policy
- Backup procedures
- Export capabilities

---

## Format

- Hebrew language
- PDF format for ITA submission
- Screenshots of key workflows
- ~20-30 pages estimated

---

## Links

- ITA Appendix H requirements: (reference from T21)
