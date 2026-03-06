# BON — Production Build Plan

## Goal

A **registered, tax-compliant Israeli invoicing platform** that businesses actually love to use.
Approval means: ITA software registration (נספח ה' סעיף 36), SHAAM integration for allocation numbers,
legally compliant PDF invoices, gap-free sequential numbering, 7-year archiving.

**Quality bar**: Every feature should feel like the best B2B SaaS product you've used,
not like a government compliance tool. The tax compliance is non-negotiable, but the UX is how you win.

---

## SHAAM Allocation Thresholds (Effective Dates)

| Period | Threshold (excl. VAT) |
|--------|----------------------|
| Until 2025-12-31 | > ₪20,000 |
| 2026-01-01 to 2026-05-31 | > ₪10,000 |
| From 2026-06-01 | > ₪5,000 |

Allocation numbers can be requested voluntarily for any amount.

---

## What's Done ✓

### Auth & Multi-Tenancy
- Google OAuth2 login with OIDC (state/nonce verification, secure cookies)
- User-to-business associations with roles: owner, admin, user
- Session management with database-backed sessions
- Multi-tenant data isolation enforced at repository level

### Business Management
- Business creation with registration number, VAT number, address, invoice settings
- Business types: עוסק מורשה, עוסק פטור, חברה בע"מ
- Default VAT rate per business (basis points: 1700 = 17%, 0 = exempt)
- Invoice number prefix + starting number configuration
- Logo URL storage

### Team Management
- Invite users via email (7-day token, unique per business+email)
- Role assignment on invite
- Remove members (owner can remove admin/user, admin cannot remove admin)
- Accept/decline invitation flow

### Onboarding UX (simplified — T03)
- Single-page form: business type + name + registration number (no stepper)
- Per-type field adaptation (labels, validation, עוסק פטור auto-sets VAT=0)
- Israeli ID checksum validation for ת.ז.
- VAT number moved to settings page
- Address autocomplete via data.gov.il (city → street, cascading, free-text fallback)

### Customer Backend (T04)
- Customer CRUD with soft delete (isActive)
- Tax ID validation (9-digit, types: company_id/vat_number/personal_id/none)
- isLicensedDealer flag for future SHAAM trigger logic
- Searchable list endpoint (name + tax ID, `?q=` parameter)
- Duplicate taxId detection (409 response with existing customer info)

### Customer Frontend (T05)
- Customer list with search, badges, empty states
- Customer create form with tax ID validation, address autocomplete, licensed dealer toggle
- Customer detail/edit page with soft delete

### API Hardening (T-API-01)
- Business creation wrapped in transaction
- PUT → PATCH on business update, POST → 201
- LIKE pattern injection fixed (escapeLikePattern utility)
- Soft-deleted customers don't block new customers with same taxId
- Query limits capped at 200

### Architecture Fixes (T-ARCH-01 through T-ARCH-07)
- Backend type safety & data layer cleanup (T-ARCH-01)
- TOCTOU race fix in invoice finalization (T-ARCH-02)
- businessId added to frontend routes (T-ARCH-03)
- Invoice form useForm + autosave (T-ARCH-04)
- Role-based access control enforcement (T-ARCH-05)
- pg-mem replaced with testcontainers (T-ARCH-06)
- Address API error handling with fallback to manual entry (T-ARCH-07)

### Invoice Data Model & VAT Engine (T06)
- invoices, invoice_items, invoice_sequences tables
- All amounts in minor units (integer, never floats)
- Customer snapshot on finalization (immutable copy)
- Status enum: draft, finalized, sent, paid, partially_paid, cancelled, credited
- VAT calculation engine (pure functions in types/src/vat.ts)
- Sequential numbering with SELECT FOR UPDATE (race-condition safe)

### Invoice API & Create/Edit Backend (T07)
- Draft invoice CRUD endpoints
- Line items management
- VAT recalculation on save

### Invoice Create/Edit Frontend (T7.5)
- Draft editor with autosave
- Line items UX (tab through fields, add/remove rows)
- Customer search combobox
- Document type selector
- Live VAT calculation preview

### Invoice Finalization & Detail View (T08)
- Shared invoice config (T08-A)
- Finalize endpoint with VAT exemption reason validation (T08-B)
- Frontend finalization flow with preview modal (T08-C)
- Invoice detail view with status banner and actions (T08-D)

### Invoice List & Search (T09)
- Server-side filtered/paginated invoice list
- Filter chips: all, drafts, awaiting payment, paid, cancelled
- Customer, date range, and text search filters
- Invoice list aggregates and summary row (T09-B)

### Invoice PDF Generation (T10)
- Separate PDF microservice (`pdf/` workspace) deployed on Railway
- Puppeteer-based HTML→PDF with React SSR templates
- Heebo font embedded as base64 data URIs (no CDN fetch)
- Full ITA-compliant invoice template (business info, customer, line items, totals, footer)
- Draft watermark ("טיוטה - לא בתוקף"), finalized PDF caching via StorageService
- PdfDownloadButton component on invoice detail page
- SSRF guard on logo URL fetch (blocks internal IPs, metadata endpoints, non-HTTPS)
- `computeVatLabel` and `formatDateTime` moved to shared `types/` package

### Deployment & Infrastructure (T10.5)
- Docker containerization for API and PDF services (Dockerfile + railway.json)
- PDF service deployed as separate Railway service with Chromium
- `PDF_SERVICE_URL` configured for internal Railway networking

---

## Phase 1: Customer Management

**Why first**: You can't create an invoice without a customer. Every invoice must have a named recipient
with their tax ID. Getting customers right from the start prevents rework when Phase 2 lands.

**What makes it great**: Think about a bookkeeper who manages 50 recurring customers.
They need to find any customer in under 2 keystrokes, not scroll through a list.
The creation form should feel smart — not ask questions the system could answer.

### 1.1 Customer Data Model

Add to `api/src/db/schema.ts`:

```
customers table:
  id            uuid PK
  businessId    uuid FK → businesses (cascade delete)
  name          text NOT NULL                    — display name for invoices
  taxId         text                             — ח.פ./ע.מ./ת.ז., 9 digits, optional (individuals may not have one)
  taxIdType     enum: company_id, vat_number, personal_id, none
  isLicensedDealer  boolean default false        — עוסק מורשה = triggers SHAAM obligation
  email         text
  phone         text
  streetAddress text
  city          text
  postalCode    text
  contactName   text                             — specific contact person
  notes         text                             — internal notes (not on invoice)
  isActive      boolean default true             — soft delete
  createdAt     timestamp with tz
  updatedAt     timestamp with tz

  UNIQUE (businessId, taxId) WHERE taxId IS NOT NULL
```

Zod schema in `types/src/customers.ts`:
- `createCustomerBodySchema` — required: name; optional: all else
- `updateCustomerBodySchema` — all optional
- `customerSchema` — full object
- `customerListItemSchema` — id, name, taxId, isLicensedDealer (for dropdown use)

### 1.2 Customer Creation Form

**The form must be smart, not dumb.**

- **Tax ID field first** (if user starts with ח.פ.): format as user types (auto-group `XX-XXXXXXX`
  for visual readability, but store raw digits). On blur: validate 9-digit checksum.

  Future enhancement (not MVP): call Israeli Business Registry API to auto-fill company name —
  but design the UX hook now so it's easy to add. Show a "חפש ברשם החברות" button that calls
  an API endpoint we can wire up later.

- **Name field**: prominent, required. Label changes based on tax ID type detected:
  "שם העסק" for 9-digit ח.פ., "שם מלא" for personal ID, "שם / כינוי" if no ID.

- **Is Licensed Dealer toggle**: shown only when taxId is present.
  Label: "עוסק מורשה — נדרש מספר הקצאה על חשבוניות מעל הסף"
  This flag drives SHAAM logic in Phase 4.

- **Address**: use `AddressAutocomplete` component (already built).

- **Contact details**: email + phone. Keep them together, visually lightweight.

- **Notes**: textarea, "הערות פנימיות (לא יופיע בחשבונית)". Gray background to signal internal.

**Error states that must be handled**:
- Duplicate tax ID for same business → show existing customer name with link to edit
- Invalid tax ID checksum → inline error with explanation
- Missing name on submit → inline error

**Acceptance criteria**:
- [ ] Customer created with name only (minimal case)
- [ ] Customer with full tax ID passes 9-digit validation
- [ ] Duplicate tax ID within same business shows conflict with link to existing
- [ ] `isLicensedDealer` defaults to false, toggleable
- [ ] Address autocomplete works same as onboarding

### 1.3 Customer List

**Not a table. A searchable, scannable list with smart defaults.**

- Default sort: most recently invoiced (when invoices exist), else by name
- Search: unified search box, searches name + tax ID simultaneously, instant (debounced 150ms)
  using a single `?q=` query parameter
- Each row shows: name, tax ID (formatted), city, "עוסק מורשה" badge if applicable,
  quick actions: "חשבונית חדשה" (once invoices exist), "ערוך"
- Empty state: not just "אין לקוחות" — a real call to action explaining WHY to add customers first
- No pagination at < 200 customers — just render all with a virtual list if needed

**API**: `GET /businesses/:businessId/customers?q=&active=true&limit=50`

**Acceptance criteria**:
- [ ] Search by partial name returns results in < 200ms
- [ ] Search by partial tax ID works
- [ ] Inactive customers hidden by default, toggle to show
- [ ] Empty state has clear CTA

### 1.4 Customer Edit / Detail View

- Single page at `/business/customers/:customerId`
- Shows all fields, editable in place
- Shows invoice history (placeholder for now — just the section header, no data)
- Soft delete: "הסר לקוח" → confirm modal → sets isActive=false
  Blocked if customer has finalized invoices (show count, explain why)

---

## Phase 2: Invoice Creation — The Core Product

**Why this is hard**: An invoice is a legal document. Every field has a meaning defined by law.
The UI must guide users to fill them correctly without making them feel like they're filing a tax form.
The experience should feel like writing a message to your customer, not filling out a government form.

**What makes it great**: The best invoice software (FreshBooks, Bonsai) makes invoice creation
feel effortless. You pick a customer, add your work, and send. The tax math is invisible.
In Israel it's harder because the law requires more — but we can still hide the complexity.

### 2.1 Invoice Data Model

Full schema definition is in the T06 ticket. Key design decisions:

- All amounts in **minor units** (integer, 1/100 of the currency unit). Never floats for money.
- **Customer snapshot** on finalization: `customerName`, `customerTaxId`, `customerAddress`, `customerEmail` — immutable copy.
- **`customerId` FK**: `ON DELETE SET NULL` — customer data survives in snapshot fields.
- **Status enum**: `draft, finalized, sent, paid, partially_paid, cancelled, credited` — `credited` included from day one.
- **Credit notes**: line items store **positive amounts**; sign semantics come from `documentType`, not amounts.
- **`numeric` columns** (`quantity`, `discountPercent`): Drizzle returns strings; service layer converts to `Number()` for API responses.
- Fields `paymentMethod`, `paymentReference`, `paidAmount` removed — live on `invoice_payments` table (T15).
- Fields added: `customerEmail`, `isOverdue`, `currency`, `vatExemptionReason`, `credited` status.

VAT calculated per line (`vatAmount = ROUND(lineTotal * vatRate / 10000)`), then summed.
This matches how accountants verify: they check each line, not the total.

### 2.2 Sequential Numbering (Race-Condition Safe)

This is a correctness requirement, not just a feature.

**Approach**: SELECT FOR UPDATE + UPDATE RETURNING inside the finalization transaction.
**Sequence model**: `sequenceGroup` enum (`tax_document`, `credit_note`, `receipt`).
Both 305 and 320 map to `tax_document` and share one counter.
PK is `(businessId, sequenceGroup)`.

**Seeding**: Lazy, on first finalization. `tax_document` seeds from `business.startingInvoiceNumber`,
others seed from 1. No rows created at business creation time.

**Format**: `{prefix}-{padded}` with minimum 4-digit padding (`padStart(4, '0')`), grows naturally past 9999.

See T06 ticket for full implementation details.

This must be inside the same transaction that creates the invoice record.
If the transaction rolls back, the sequence number is burned (gap created) — this is acceptable.
What is NOT acceptable is two invoices with the same number.

Test: 50 concurrent finalization requests must produce 50 distinct sequential numbers (real Postgres, not pg-mem).

### 2.3 VAT Calculation Engine

Pure functions in `types/src/vat.ts` — Zod schemas with inferred TS types.
Works in browser (live preview) and server (authoritative recalculation on finalization).

Key decisions:
- Types defined as **Zod schemas** (not plain interfaces), following `types/` convention.
- Engine does **not** enforce valid VAT rates — calculates for any rate. Rate validation is the service layer's job (T07).
- **Credit notes**: positive amounts, same `calculateLine()` — sign applied at document level.
- **Zero amounts allowed**: `unitPriceMinorUnits = 0` and `discountPercent = 100` are valid. Validation is the service layer's concern.
- **Rounding order**: round gross first, then round discount, then round VAT. Two rounding ops before lineTotal — intentional, matches per-line accountant verification.
- **Mixed VAT rates**: no structured breakdown in totals. Per-line VAT is in `invoice_items` — derivable when needed (T12/T09).

Server is authoritative — client values are discarded and recalculated on finalization.

### 2.4 Invoice Creation UI — The Happy Path

The goal: a user who knows what they're billing should be done in under 60 seconds.

**Route**: `POST /business/invoices/new` → `/business/invoices/:id/edit`
The invoice is created as a draft immediately on page load (optimistic), so the user never
loses work. Browser close = draft saved. Explicit "discard" to delete.

**Form structure — single page, not steps**:

```
┌─────────────────────────────────────────────────────┐
│ חשבונית מס                          [טיוטה]  ₪0.00  │
│                                                     │
│ לקוח: [חיפוש לקוח...]              [+ לקוח חדש]   │
│ תאריך: [היום ▼]          מסמך: [חשבונית מס ▼]      │
│ ─────────────────────────────────────────────────── │
│                                                     │
│  תיאור              כמות    מחיר   הנחה%  סה"כ      │
│ ┌──────────────┐   ┌────┐  ┌────┐  ┌───┐  ┌──────┐ │
│ │              │   │ 1  │  │    │  │ 0 │  │  0   │ │
│ └──────────────┘   └────┘  └────┘  └───┘  └──────┘ │
│ [+ הוסף שורה]                                       │
│                                                     │
│ ─────────────────────────────────────────────────── │
│                              סכום:      ₪0.00       │
│                              מע"מ 17%:  ₪0.00       │
│                              סה"כ לתשלום: ₪0.00     │
│                                                     │
│ הערות: [________________________________________]   │
│                                                     │
│ [שמור טיוטה]  [תצוגה מקדימה]  [הפק חשבונית →]     │
└─────────────────────────────────────────────────────┘
```

**Line items UX**:
- Tab through fields: description → quantity → unit price → discount → next row
- Enter in last field of a row = add new row
- Backspace on empty description of last row = delete row
- Description field: typeahead from previous invoice descriptions (cached, searchable)
- Unit price: formatted as currency as you type (₪ prefix, comma separators)
- VAT column: shown as calculated amount, not editable (business VAT rate is the default)
- Keyboard-first design: power users never need the mouse

**Customer search**:
- Combobox with instant search (same pattern as address autocomplete)
- Shows: name, tax ID, city
- First option: "לקוח חדש" → opens inline quick-create modal (name + tax ID only, rest later)

**Document type selector**:
- Not just a dropdown — each option has a brief tooltip explanation:
  - חשבונית מס: "לעסקות שגביתם תשלום בנפרד"
  - חשבונית מס קבלה: "גביתם תשלום מיד — מסמך אחד"
  - קבלה: "אישור תשלום בלבד, ללא מע״מ"

**Finalize flow**:
1. Click "הפק חשבונית"
2. Validation runs: customer required, at least one line item, all amounts > 0
3. Preview modal with the invoice as it will appear (read-only)
4. Confirm → API call to finalize → number assigned → PDF available → redirect to invoice detail
5. If SHAAM required: initiate allocation number request in background (non-blocking)

**Error states**:
- Customer not found / deleted → show warning, prompt to re-select
- Sequence number conflict (rare race) → show error, offer to retry (will get next number)
- SHAAM allocation failure → invoice is still finalized, show SHAAM error banner with retry option

### 2.5 Invoice Detail Page

After finalization, a clean read-only view:
- Status banner (draft / finalized / sent / paid)
- Actions bar: "הורד PDF", "שלח במייל", "סמן כשולם", "חשבונית זיכוי"
- Allocation number prominent (if obtained): labeled "מספר הקצאה", rightmost 9 digits
- All invoice fields displayed as they'll appear on the PDF
- Audit timeline: created, finalized, sent, paid (with timestamps and who)

### 2.6 Invoice List

**The inbox for accountants.**

- Default view: unpaid/outstanding invoices, sorted by due date (oldest first)
- Filter chips (not a dropdown): כל החשבוניות | טיוטות | ממתינות לתשלום | שולמו | בוטלו
- Secondary filters: date range, customer (typeahead), amount range
- Each row: number, customer, date, amount incl. VAT, status badge, days overdue (red if > 30)
- Bulk actions: mark as sent, export PDF zip
- Summary row at bottom: total outstanding, total this period

---

## Phase 3: Invoice PDF Generation

**Why this matters more than you think**: The PDF is what customers see.
A bad-looking invoice reflects badly on the business. A well-designed invoice template
builds trust. Many Israeli businesses use these invoices as their only professional document.

**Technical constraint**: RTL Hebrew PDFs are hard. Most PDF libraries have poor RTL support.

**Chosen approach: Puppeteer in a separate Railway service.**
The template is a React component rendered server-side to HTML string via `renderToStaticMarkup`,
then printed to PDF by Puppeteer (headless Chrome). The PDF service (`pdf/` workspace) runs as a
separate Railway service to keep Chromium (~400MB) out of the main API container. The API proxies
requests via `PDF_SERVICE_URL`.

### 3.1 Invoice HTML Template

A React component (`pdf/src/pdf/InvoiceTemplate.tsx`) that receives all invoice data and
renders the complete invoice layout. It is NOT a client-side React component — it runs on the server.

**Required layout elements** (per ITA regulations):

```
Header:
  [Logo]    שם העסק
            מספר ח.פ./ע.מ.: XXXXXXXXX
            מספר מע"מ: XXXXXXXXX
            כתובת, עיר, מיקוד
            טלפון | אימייל

Document identity (right-aligned):
  חשבונית מס מספר: INV-0042
  תאריך: 19 בפברואר 2026
  תאריך הפקה: 19.02.2026 12:34

Customer section:
  לכבוד:
  שם הלקוח
  ח.פ.: XXXXXXXXX
  כתובת

Line items table:
  | # | תיאור | כמות | מחיר יחידה | הנחה% | סה"כ |
  | 1 | ...   |  2  |   ₪100.00  |  0%   | ₪200.00 |

Totals:
  סכום לפני מע"מ:  ₪200.00
  מע"מ 17%:        ₪34.00
  סה"כ לתשלום:    ₪234.00

Allocation number (if present):
  [prominent box] מספר הקצאה: 123456789

Footer:
  [software registration number once obtained]
  "מסמך זה הופק על ידי BON v1.0"
```

**Typography**:
- Font: Heebo or Assistant (Google Fonts, Hebrew-optimized, free)
- Numbers: use `dir="ltr"` on number spans inside RTL context (phone, tax ID, amounts)
- Amounts: formatted as `₪1,234.56` — always with shekel sign, comma separator, 2 decimal places

### 3.2 PDF API Endpoint

```
GET /businesses/:businessId/invoices/:invoiceId/pdf
Response: Content-Type: application/pdf
          Content-Disposition: inline; filename="INV-0042.pdf"
```

The API route fetches invoice data, calls the PDF service (`POST /render`), and returns the result.
Cache finalized PDFs after first generation (local filesystem via `StorageService` for MVP).
Invalidate cache when invoice status changes via `invalidatePdfCache()`.
For drafts: generate but don't cache (watermark "טיוטה - לא בתוקף" across the page).

### 3.3 Email Delivery (T11 — delivered, T-ARCH-08 — async upgrade pending)

Email delivery is implemented alongside T10 in this PR:
- `POST /businesses/:businessId/invoices/:invoiceId/send` — sends finalized invoice to customer
- Email sender (Resend, with console fallback in dev) with PDF attachment
- `sentAt` timestamp tracking and status update to `sent`

**Async upgrade (T-ARCH-08)**: Currently synchronous — email is sent inline during the HTTP request. T-ARCH-08 moves this to a pg-boss background job using the outbox pattern (transaction → enqueue → worker → status update). Adds `'sending'` transitional status for UI feedback. This is the first on-demand job and proves the pattern reused by SHAAM (T13, T14).

---

## Phase 4: SHAAM Integration

**This is the hardest phase technically and the most critical for legal compliance.**
Do it incrementally — start with sandbox, build the abstraction layer first,
wire real credentials last.

All SHAAM work depends on pg-boss infrastructure (T-CRON-01). Token refresh runs as a cron job. Allocation requests and emergency reporting run as on-demand jobs using the outbox pattern (transaction → enqueue → worker → status update), the same pattern proven by T-ARCH-08 (async email).

### 4.1 SHAAM Abstraction Layer (T12)

Define the interface first, then implement:

```typescript
interface ShaamService {
  requestAllocationNumber(request: AllocationRequest): Promise<AllocationResult>;
  // Emergency methods added in T14 when the interface is extended
}

type AllocationResult =
  | { status: 'approved'; allocationNumber: string }
  | { status: 'rejected'; errorCode: string; errorMessage: string }
  | { status: 'emergency'; emergencyNumber: string }
  | { status: 'deferred'; reason: string };
```

Two implementations (not three — sandbox and production are the same HTTP client with different base URLs):
- `ShaamHttpClient` — single class, configurable `baseUrl` (sandbox vs production)
- `ShaamMockClient` — returns fake numbers for dev/test

Toggle via environment variable: `SHAAM_MODE=mock|sandbox|production`

### 4.2 OAuth2 Token Management (T12)

Each business authorizes BON to submit on their behalf. Store per-business:

```text
business_shaam_credentials table:
  businessId              uuid FK → businesses (unique, cascade)
  encryptedAccessToken    text NOT NULL  — AES-256-GCM encrypted
  encryptedRefreshToken   text NOT NULL  — AES-256-GCM encrypted
  tokenExpiresAt          timestamp with tz NOT NULL
  scope                   text
  needsReauth             boolean default false
```

Token refresh runs as a **pg-boss cron job** (`shaam-token-refresh`, every 15 min, registered in `api/src/plugins/shaam.ts`). Finds credentials expiring within 20 minutes (buffer exceeds the 15-min interval). On refresh failure: set `needsReauth = true`.

### 4.3 Allocation Number Request (T13 — via pg-boss)

Allocation requests run as **background jobs** using the outbox pattern:

1. Invoice finalized → inside the finalization transaction:
   - Evaluate `shouldRequestAllocation()` (threshold + isLicensedDealer + VAT check)
   - If true: set `allocationStatus = 'pending'`, enqueue `shaam-allocation-request` job via `boss.send()` with `singletonKey: invoiceId`
2. pg-boss worker picks up job → calls `ShaamService.requestAllocationNumber()` with ~26 ITA fields
3. Full request + response stored in `shaam_audit_log` table
4. On approved: store `allocationNumber`, set `allocationStatus = 'approved'`
5. On deferred/transient error: pg-boss retries with exponential backoff
6. On E099 (SHAAM unavailable): use emergency number (T14)

The invoice is legally valid the moment it's finalized — the allocation number is an async compliance step that must not block the user.

### 4.4 SHAAM Trigger Logic (T12 — pure functions)

```typescript
function requiresAllocationNumber(
  invoice: { totalExclVatMinorUnits: number; vatMinorUnits: number },
  customer: { isLicensedDealer: boolean },
  asOfDate?: Date
): boolean {
  if (invoice.vatMinorUnits === 0) return false;          // no VAT = no SHAAM
  if (!customer.isLicensedDealer) return false;            // B2C = no SHAAM
  if (invoice.totalExclVatMinorUnits <= currentThreshold(asOfDate) * 100) return false;
  return true;
}
```

### 4.5 Emergency Numbers (T14)

Pre-acquire a pool (business owner requests from ITA directly, enters codes in BON):

```text
emergency_allocation_numbers table:
  id          uuid PK
  businessId  uuid FK → businesses
  number      text UNIQUE
  used        boolean default false
  usedForInvoiceId  uuid FK → invoices nullable
  usedAt      timestamp with tz nullable
  reported    boolean default false
  reportedAt  timestamp with tz nullable
  acquiredAt  timestamp with tz
```

When SHAAM recovers after an outage, BON enqueues a `shaam-emergency-report` job (via `boss.send()` with `singletonKey: businessId`) to batch-report used emergency numbers back to ITA.

UI: settings page for owner to enter their emergency number pool.
Alert when pool < 5 numbers remaining.

### 4.6 Error Taxonomy (T14)

ITA returns specific error codes. Each must be handled distinctly:

| ITA Code | Meaning | Our Response |
|----------|---------|--------------|
| E001 | Invalid VAT number | Show to user: "מספר מע״מ לא תקין" |
| E002 | Invoice already allocated | Idempotent — store the returned number |
| E003 | Below threshold | Don't request (shouldn't happen — check before calling) |
| E010 | Authentication failure | Set `needsReauth = true`, show re-auth prompt |
| E099 | System unavailable | Use emergency number via pg-boss job |

These must be defined as constants in `types/src/shaam.ts`, not magic strings, with Hebrew user-facing messages.

---

## Phase 5: Invoice Lifecycle

### 5.1 Payment Recording

When a payment arrives:
- "סמן כשולם" button → modal asking: amount, date, method (מזומן/העברה/אשראי/שיק), reference
- Partial payment: sets status to `partially_paid`, shows remaining balance
- Full payment: sets status to `paid`
- Payment history: multiple payments per invoice (the `invoice_payments` table)

```
invoice_payments table:
  id              uuid PK
  invoiceId       uuid FK → invoices
  amountMinorUnits integer NOT NULL
  paidAt          date NOT NULL
  method          enum: cash, transfer, credit, check, other
  reference       text
  notes           text
  recordedByUserId uuid FK → users
  createdAt       timestamp with tz
```

### 5.2 Credit Notes (חשבונית מס זיכוי)

A credit note is a real invoice document (type 330) that references the original.
It gets its own sequential number in the `credit_note` sequence group.

**Paid invoices CAN be credited** — this is how refunds work in Israeli invoicing.
The status machine includes `paid → credited`.

Flow:
1. On a finalized/sent/paid invoice: "הפק חשבונית זיכוי"
2. Modal: full credit or partial (adjust amounts)
3. Credit note created as a new invoice record with `creditedInvoiceId` set
4. Credit note line items store **positive amounts** — sign applied at document level
5. Original invoice status → `credited`
6. SHAAM: credit note may also need allocation number if above threshold

### 5.3 Overdue Detection (moved to T-CRON-02)

Implemented as a pg-boss cron job in T-CRON-02 (daily at 6am Israel time).
Batch-marks invoices as overdue (`isOverdue` flag), resets flag when paid.
Future: sends digest email to business owners.

### 5.4 Invoice Search & Filtering

The list must handle businesses with thousands of invoices.
Server-side filtering and pagination from the start:

```
GET /businesses/:businessId/invoices
  ?status=finalized,sent,paid
  &customerId=uuid
  &dateFrom=2026-01-01
  &dateTo=2026-01-31
  &minAmount=0
  &maxAmount=50000
  &q=search_term          — searches customer name + invoice number + notes
  &sort=date:desc
  &page=1
  &limit=20
```

Response includes aggregate totals for the filtered set (for the summary row in UI).

---

## Phase 6: Reporting & Compliance

### 6.1 PCN874 — Detailed VAT Report

Israeli VAT-registered businesses submit monthly or bi-monthly VAT reports.
The PCN874 format is ITA's machine-readable format for these reports.

This is a **file export** — not a dashboard. The user downloads it and submits to ITA
(or their accountant does). Eventually we might submit directly via API.

Format details: request from ITA or derive from "קבצי הנהלת חשבונות ממוחשבת" spec.
Build a parser/generator strictly per ITA spec. Validate against ITA's own simulator.

Fields per record: document type code, date, invoice number, customer VAT number,
total amount, VAT amount, allocation number (if any).

### 6.2 Business Dashboard

**Not a vanity dashboard — a working tool.**

Metrics that matter to a small business owner:

```
┌─────────────────────────────────────────────────────┐
│  הכנסות החודש    ₪34,200   ↑12% vs. החודש שעבר     │
│  ממתין לתשלום   ₪18,500   (8 חשבוניות)             │
│  פגות מועד      ₪4,200    (2 חשבוניות — RED!)       │
│                                                     │
│  [פעילות אחרונה]                                    │
│  INV-0042 — נשלח לדוד לוי — ₪4,680                 │
│  INV-0041 — שולם — כרמל בניה — ₪11,700             │
│  ...                                                │
│                                                     │
│  [SHAAM סטטוס]                                      │
│  3 חשבוניות ממתינות לאישור SHAAM                    │
│  1 נדחתה — [לפרטים]                                 │
└─────────────────────────────────────────────────────┘
```

All numbers are links to the filtered invoice list.
The dashboard should load in under 1 second (single aggregated query, not 5 separate calls).

### 6.3 Uniform File (קובץ במבנה אחיד)

Required for ITA software registration audit. Exports all bookkeeping data in ITA format.
Implement once Phase 2 and 4 are done. This is essentially a structured export of
all finalized invoices in ITA's defined column layout.

---

## Phase 7: ITA Registration

Administrative process, can be done in parallel with Phase 6.

### Pre-Registration Checklist
- [ ] Compliant invoices with all required fields generated
- [ ] Gap-free sequential numbering proven (audit log)
- [ ] Finalized invoices are immutable (no edit API, no DB-level update)
- [ ] SHAAM integration working in production with real allocation numbers
- [ ] Uniform file export passes ITA simulator
- [ ] PCN874 report generation working
- [ ] 7-year retention policy configured (no hard delete of invoices)
- [ ] Software documentation prepared (user manual)
- [ ] Get יועץ מס or רו"ח to review before submission

### Registration Steps
1. Register BON as בית תוכנה (software house) with ח.פ./ע.מ.
2. File digital registration form at ITA portal
3. Submit: software copy + professional docs + tech specs
4. ITA review ~90 days
5. Receive תעודת רישום → embed registration number (field 1006) in all SHAAM submissions
6. Attach certificate to all customer agreements

---

## Architecture Decisions for Next Phases

### PDF Generation
- **Puppeteer** in a **separate Railway service** (`pdf/` workspace). Keeps Chromium (~400MB) out of the main API container. The API proxies via `PDF_SERVICE_URL`.
- PDF service uses `puppeteer-core` + system Chromium (installed in Dockerfile). Max 3 concurrent pages; 503 if exceeded.
- Template: React `renderToStaticMarkup` → HTML → Puppeteer → PDF. Fonts (Heebo) embedded as base64 data URIs.
- Store PDFs on **local filesystem** via `StorageService` interface for MVP (`.data/pdfs/`). Upgrade to S3 (Cloudflare R2) without interface change when needed.
- **Draft PDFs**: watermarked "טיוטה - לא בתוקף", never cached.

### Background Jobs — pg-boss Architecture

Use **pg-boss** (PostgreSQL-backed job queue) — already have Postgres, no new infrastructure.

**Infrastructure** (T-CRON-01): Fastify plugin that starts pg-boss, decorates `app.boss`, handles graceful shutdown. Type-safe `JobPayloads` map ensures every job name has a typed payload. No handlers in the infra ticket — each feature registers its own.

**On-demand jobs** (enqueued by features, outbox pattern):

| Job | Ticket | Trigger | External Call | Idempotency |
|-----|--------|---------|---------------|-------------|
| `send-invoice-email` | T-ARCH-08 | User clicks "Send" | Resend API | `singletonKey: invoiceId` |
| `shaam-allocation-request` | T13 | Invoice finalized + threshold met | ITA SHAAM API | `singletonKey: invoiceId` |
| `shaam-emergency-report` | T14 | SHAAM recovers after outage | ITA SHAAM API | `singletonKey: businessId` |

All on-demand jobs follow the same **outbox pattern**:
1. BEGIN transaction
2. Update entity to transitional status (`'sending'`, `allocationStatus: 'pending'`)
3. `boss.send(jobName, payload, { singletonKey })` — inside transaction
4. COMMIT → return 202 Accepted
5. Worker picks up job, calls external service, updates final status
6. On exhaustion: revert to safe state, log error

pg-boss stores jobs in PostgreSQL, so `boss.send()` inside a Drizzle transaction participates in that transaction. If the transaction rolls back, the job is never enqueued. This IS the outbox — no separate outbox table needed.

**Cron jobs** (scheduled maintenance):

| Job | Ticket | Schedule | Timezone |
|-----|--------|----------|----------|
| `draft-cleanup` | T-CRON-02 | `0 3 * * *` (3am daily) | Asia/Jerusalem |
| `session-cleanup` | T-CRON-02 | `0 4 * * *` (4am daily) | Asia/Jerusalem |
| `overdue-detection` | T-CRON-02 | `0 6 * * *` (6am daily) | Asia/Jerusalem |
| `shaam-token-refresh` | T12 | `*/15 * * * *` (every 15min) | Asia/Jerusalem |

**Build order for jobs:**
```text
T-CRON-01 (pg-boss infra)           ← ~150 lines, small
    ├── T-ARCH-08 (async email)      ← ~300 lines, medium (first on-demand job, proves outbox pattern)
    ├── T-CRON-02 (cron jobs)        ← ~200 lines, small (3 simple handlers)
    └── T12 (SHAAM abstraction)      ← ~800 lines, large (interface + encryption + token refresh + trigger logic)
            └── T13 (allocation)     ← ~600 lines, large (ITA payload mapping + audit log + job handler)
                    └── T14 (emergency) ← ~500 lines, medium (pool mgmt + recovery reporting)
```

### Email
Use **Resend** (developer-friendly, good Hebrew support, reliable deliverability).
All emails are RTL Hebrew. Templates stored in `api/src/email/templates/`.

### File Storage
For MVP: local filesystem + symlinks (easy). For production: S3 (Cloudflare R2 is cheaper).
Abstract behind a `StorageService` interface from day one.

### Security Considerations
- SHAAM tokens encrypted at rest (AES-256-GCM, key in env var)
- Invoice PDFs served via signed URLs (not public S3 paths)
- All invoice amounts validated server-side (never trust client calculations)
- Rate limit invoice creation endpoint (prevent abuse of SHAAM API)
- Audit log for every invoice state change (who, when, what)

---

## Build Order

```
✓ Phase 0: Foundation (auth, business mgmt, team, onboarding)
  T00–T03 all merged to main

✓ Phase 1: Customer Management
  T04: Customer schema + API (PR #5)
  T05: Customer frontend (PR #7)
  T-API-01: API hardening (PR #8)

✓ Phase 2: Invoice Creation
  T06: Invoice schema + VAT engine (PR #10/#11)
  T07: Invoice API + create/edit backend (PR #12)
  T7.5: Invoice create/edit frontend (PR #13)
  T08-A: Shared invoice config (PR #18)
  T08-B: Finalize backend (PR #17)
  T08-C: Finalization flow frontend (PR #22)
  T08-D: Detail view + routing (PR #22)
  T09: Invoice list + search (PR #41)
  T09-B: Invoice list aggregates (PR #43)
  T-ARCH-01 through T-ARCH-07: Architecture fixes (all merged)

✓ Phase 3: PDF Generation + Email Delivery
  T10: PDF service + template + caching (PR #45)
  T10.5: Docker + Railway deployment (PRs #52-#54)
  T11: Email delivery (delivered with T10)

→ Phase 3.5: Job Queue Infrastructure
  T-CRON-01: pg-boss infrastructure (plugin, typed job registry, graceful shutdown)
  T-ARCH-08: Async email delivery (first on-demand job, proves outbox pattern)
  T-CRON-02: Scheduled maintenance jobs (draft cleanup, session cleanup, overdue detection)

→ Phase 4: SHAAM Integration
  T12: SHAAM abstraction + token management + token refresh cron job
  T13: Allocation requests via pg-boss job queue (outbox pattern)
  T14: Emergency numbers + recovery reporting job

→ Phase 5: Invoice Lifecycle
  T15: Payment recording
  T16: Credit notes

→ Phase 6: Reporting
  T18: Business dashboard
  T19: PCN874 VAT report export
  T20: Uniform file export (קובץ במבנה אחיד)

→ Phase 7: ITA Registration          (parallel with 6)
  T21: Administrative + legal review
```

---

## What's NOT in MVP

- Multi-currency (USD/EUR) — ILS only
- Recurring invoices / subscriptions
- Client portal (customers viewing their invoices online)
- Payment gateway integration (Paybox, Tranzila)
- Full bookkeeping (הנהלת חשבונות כפולה)
- Estimates/quotes (הצעות מחיר) — not a tax document
- Payroll
- Inventory
- Mobile app
- White-label
- Multi-language (Hebrew only)
- Bulk invoice import

---

## Open Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| ITA sandbox access | High | Apply early; may require pre-registration as software house |
| SHAAM API changes | Medium | Abstract behind interface; monitor ITA developer portal |
| Uniform file spec | Medium | Request official spec document from ITA; test against simulator early |
| Hebrew PDF rendering | ~~Medium~~ Resolved | Puppeteer + React SSR working in production (T10 merged). |
| Concurrent numbering | High | SELECT FOR UPDATE pattern implemented; 50-concurrent test passes with real PostgreSQL (T-ARCH-06). |
| Legal review cost | Low | Budget ₪2,000-5,000 for יועץ מס review before ITA submission |
| Emergency number pool depletion | Medium | Alert at < 5 remaining; auto-notify business owner to replenish |
