# BON — Production Build Plan

## Goal

A **registered, tax-compliant Israeli invoicing platform** that businesses actually love to use.
Approval means: ITA software registration (נספח ה' סעיף 36), SHAAM integration for allocation numbers,
legally compliant PDF invoices, gap-free sequential numbering, 7-year archiving.

**Quality bar**: Every feature should feel like the best B2B SaaS product you've used,
not like a government compliance tool. The tax compliance is non-negotiable, but the UX is how you win.

---

## Current SHAAM Allocation Thresholds

| Period | Threshold (excl. VAT) |
|--------|----------------------|
| Now (2025) | > ₪20,000 |
| Jan 2026 | > ₪10,000 |
| Jun 2026 | > ₪5,000 |

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

### Customer Backend (API only — T04)
- Customer CRUD with soft delete (isActive)
- Tax ID validation (9-digit, types: company_id/vat_number/personal_id/none)
- isLicensedDealer flag for future SHAAM trigger logic
- Searchable list endpoint (name + tax ID, `?q=` parameter)
- Duplicate taxId detection (409 response — needs patch to include existing customer info)
- **No frontend yet** — customer pages are T05

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

Add to `api/src/db/schema.ts`:

```
invoices table:
  id                  uuid PK
  businessId          uuid FK → businesses
  customerId          uuid FK → customers (nullable — customer may be deleted)

  -- Snapshot of customer at time of finalization (immutable copy)
  customerName        text NOT NULL
  customerTaxId       text
  customerAddress     text

  -- Document identity
  documentType        enum: tax_invoice(305), tax_receipt(320), receipt(400), credit_note(330)
  sequenceNumber      integer NOT NULL              — assigned on finalization
  fullNumber          text NOT NULL                 — prefix + formatted number, e.g. "INV-0042"

  -- Dates
  invoiceDate         date NOT NULL                 — user-selected (the "date" on the invoice)
  issuedAt            timestamp with tz             — system-set on finalization, immutable
  dueDate             date                          — optional payment due date

  -- Amounts (all in agora = 1/100 shekel, to avoid floating point)
  subtotalAgora       integer NOT NULL              — before discount, before VAT
  discountAgora       integer NOT NULL default 0    — total discount
  totalExclVatAgora   integer NOT NULL              — after discount, before VAT
  vatAgora            integer NOT NULL              — total VAT amount
  totalInclVatAgora   integer NOT NULL              — grand total

  -- Status
  status              enum: draft, finalized, sent, paid, partially_paid, cancelled

  -- SHAAM
  allocationNumber    text                          — 9-digit from SHAAM
  allocationStatus    enum: none, pending, approved, rejected, emergency
  allocationError     text                          — ITA error code if rejected

  -- Credit note
  creditedInvoiceId   uuid FK → invoices           — for credit notes only

  -- Metadata
  notes               text                          — appears on invoice
  internalNotes       text                          — internal only
  sentAt              timestamp with tz
  paidAt              timestamp with tz
  paidAmount          integer                       — for partial payments
  paymentMethod       text                          — מזומן, העברה, אשראי, etc.
  paymentReference    text                          — check number, transfer ref, etc.

  createdAt           timestamp with tz
  updatedAt           timestamp with tz

  UNIQUE (businessId, documentType, sequenceNumber)

invoice_items table:
  id              uuid PK
  invoiceId       uuid FK → invoices (cascade delete)
  position        integer NOT NULL                  — display order
  description     text NOT NULL
  quantity        numeric(12,4) NOT NULL            — supports partial units
  unitPrice       integer NOT NULL                  — in agora
  discountPct     numeric(5,2) default 0            — percentage, 0-100
  lineTotal       integer NOT NULL                  — after discount, before VAT
  vatRate         integer NOT NULL                  — basis points, e.g. 1700
  vatAmount       integer NOT NULL                  — calculated, rounded per line

  -- Catalog number (optional, for SHAAM)
  catalogNumber   text

invoice_sequences table:
  businessId      uuid FK → businesses
  documentType    enum (same as invoices)
  nextNumber      integer NOT NULL default 1

  PRIMARY KEY (businessId, documentType)
  -- Used with SELECT FOR UPDATE to prevent gaps
```

**Critical design note on amounts**: All agora. Never store decimals for money.
`unitPrice` for an item costing ₪100 is stored as `10000`. Display layer divides by 100.
VAT is calculated per line (`vatAmount = ROUND(lineTotal * vatRate / 10000)`), then summed.
This matches how accountants verify: they check each line, not the total.

### 2.2 Sequential Numbering (Race-Condition Safe)

This is a correctness requirement, not just a feature.

```
// In a transaction:
async function assignInvoiceNumber(
  tx: Transaction,
  businessId: string,
  documentType: DocumentType,
  prefix: string
): Promise<{ sequenceNumber: number; fullNumber: string }> {
  // Upsert with row-level lock
  const [row] = await tx
    .insert(invoiceSequences)
    .values({ businessId, documentType, nextNumber: 1 })
    .onConflictDoUpdate({
      target: [invoiceSequences.businessId, invoiceSequences.documentType],
      set: { nextNumber: sql`${invoiceSequences.nextNumber} + 1` },
    })
    .returning({ sequenceNumber: sql<number>`${invoiceSequences.nextNumber} - 1` });

  const sequenceNumber = row.sequenceNumber;
  const fullNumber = prefix
    ? `${prefix}-${String(sequenceNumber).padStart(4, '0')}`
    : String(sequenceNumber).padStart(4, '0');

  return { sequenceNumber, fullNumber };
}
```

This must be inside the same transaction that creates the invoice record.
If the transaction rolls back, the sequence number is burned (gap created) — this is acceptable.
What is NOT acceptable is two invoices with the same number.

Test: 50 concurrent finalization requests must produce 50 distinct sequential numbers.

### 2.3 VAT Calculation Engine

Pure function — easily testable:

```
interface LineItemInput {
  quantity: number;     // e.g. 2.5
  unitPriceAgora: number; // e.g. 10000 (= ₪100)
  discountPct: number;  // e.g. 10 (= 10%)
  vatRateBasisPoints: number; // e.g. 1700 (= 17%)
}

interface LineItemResult {
  lineTotalAgora: number;    // after discount, before VAT
  vatAmountAgora: number;    // rounded to nearest agora
  lineTotalInclVatAgora: number;
}

function calculateLine(item: LineItemInput): LineItemResult {
  const gross = Math.round(item.quantity * item.unitPriceAgora);
  const discount = Math.round(gross * item.discountPct / 100);
  const lineTotal = gross - discount;
  const vatAmount = Math.round(lineTotal * item.vatRateBasisPoints / 10000);
  return {
    lineTotalAgora: lineTotal,
    vatAmountAgora: vatAmount,
    lineTotalInclVatAgora: lineTotal + vatAmount,
  };
}
```

All amounts calculated in the browser for live preview, re-validated server-side on save.
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
Options ranked:
1. **Puppeteer/headless Chrome** (recommended): Generate HTML with Tailwind/CSS → print to PDF.
   RTL is handled by the browser. Logo, fonts, complex layout = trivial. Works in Node.js.
   Downside: ~200MB Docker image. Acceptable.
2. **PDFKit**: Node.js PDF library. RTL possible but requires careful font embedding.
   Less flexible for complex layouts.
3. **React → html-to-pdf (client-side)**: Avoid. Inconsistent across browsers.

**Chosen approach: Puppeteer with an HTML template.**
The template is a React component rendered server-side to HTML string, then printed by Puppeteer.

### 3.1 Invoice HTML Template

A React component (`api/src/pdf/InvoiceTemplate.tsx`) that receives all invoice data and
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
POST /businesses/:businessId/invoices/:invoiceId/pdf
Response: Content-Type: application/pdf
          Content-Disposition: attachment; filename="INV-0042.pdf"
```

Cache the PDF after first generation (S3 or local filesystem).
Invalidate cache when invoice status changes.
For drafts: generate but don't cache (watermark "טיוטה - לא בתוקף" across the page).

### 3.3 Email Delivery

```
POST /businesses/:businessId/invoices/:invoiceId/send
Body: { recipientEmail?: string }  // defaults to customer.email
```

Email sender (Resend or SES):
- Subject: `חשבונית מס INV-0042 מ-{businessName}`
- Body: clean Hebrew email with basic invoice summary + download link
- Attachment: the PDF
- Track: set `sentAt` timestamp on invoice

---

## Phase 4: SHAAM Integration

**This is the hardest phase technically and the most critical for legal compliance.**
Do it incrementally — start with sandbox, build the abstraction layer first,
wire real credentials last.

### 4.1 Design First: The SHAAM Abstraction Layer

Before writing any HTTP code, define the interface:

```typescript
interface ShaamService {
  // Request an allocation number for an invoice
  requestAllocationNumber(
    businessId: string,
    invoice: FinalizedInvoice,
    lineItems: InvoiceItem[]
  ): Promise<AllocationResult>;

  // Pre-acquire emergency allocation numbers
  acquireEmergencyNumbers(
    businessId: string,
    count: number
  ): Promise<EmergencyNumber[]>;

  // Report usage of emergency numbers (when SHAAM recovers)
  reportEmergencyUsage(
    businessId: string,
    usedNumbers: string[]
  ): Promise<void>;
}

type AllocationResult =
  | { status: 'approved'; allocationNumber: string }
  | { status: 'rejected'; errorCode: string; errorMessage: string }
  | { status: 'emergency'; emergencyNumber: string }
  | { status: 'deferred'; reason: string };
```

This interface is implemented by:
- `ShaamApiClient` (real) — calls ITA's OAuth2 + allocation API
- `ShaamSandboxClient` (test) — calls ITA sandbox
- `ShaamMockClient` (development) — returns fake numbers instantly

Toggle via environment variable: `SHAAM_MODE=mock|sandbox|production`

### 4.2 OAuth2 Token Management

Each business authorizes BON to submit on their behalf. Store per-business:

```
business_shaam_credentials table:
  businessId      uuid FK → businesses (unique)
  accessToken     text (encrypted at rest)
  refreshToken    text (encrypted at rest)
  tokenExpiresAt  timestamp with tz
  scope           text
  createdAt       timestamp with tz
  updatedAt       timestamp with tz
```

Token refresh logic: refresh 5 minutes before expiry. On refresh failure: mark business as
needing re-authorization, send email to owner, fall back to emergency numbers.

### 4.3 Allocation Number Request

The SHAAM API expects a JSON payload with ~26 fields. Map from invoice:

```
// Table 2.1 fields (from ITA spec):
{
  "AccountingDocType": documentTypeCode,     // 305 = חשבונית מס
  "AccountingSoftwareNumber": REGISTRATION_NUMBER,  // BON's ITA certificate
  "VatNumber": business.vatNumber,
  "DocumentNumber": invoice.fullNumber,
  "DocumentDate": invoice.invoiceDate,       // YYYY-MM-DD
  "DealAmount": invoice.totalExclVatAgora / 100,  // in shekels (decimal)
  "VatAmount": invoice.vatAgora / 100,
  "TotalAmount": invoice.totalInclVatAgora / 100,
  "ClientVatNumber": customer.taxId,        // required if isLicensedDealer
  // ...all other required fields
  "LineItems": lineItems.map(item => ({     // Table 2.2
    "Description": item.description,
    "Quantity": item.quantity,
    "UnitPrice": item.unitPriceAgora / 100,
    "LineTotal": item.lineTotalAgora / 100,
    // ...
  }))
}
```

Store the full request and response JSON in a `shaam_audit_log` table for debugging and ITA audits.

### 4.4 SHAAM Trigger Logic

An invoice requires an allocation number when:
```typescript
function requiresAllocationNumber(invoice: Invoice, customer: Customer, business: Business): boolean {
  if (invoice.vatAgora === 0) return false;          // no VAT = no SHAAM
  if (!customer.isLicensedDealer) return false;      // B2C = no SHAAM
  if (invoice.totalExclVatAgora < currentThreshold()) return false;  // below threshold
  return true;
}

// OR: business has opted in to voluntary allocation for all invoices
function shouldRequestAllocation(invoice, customer, business): boolean {
  return requiresAllocationNumber(invoice, customer, business)
    || business.alwaysRequestAllocation;
}
```

### 4.5 Emergency Numbers

Pre-acquire a pool (business owner requests from ITA directly, enters codes in our system):

```
emergency_allocation_numbers table:
  id          uuid PK
  businessId  uuid FK → businesses
  number      text UNIQUE            — the pre-acquired number
  used        boolean default false
  usedForInvoiceId  uuid FK → invoices nullable
  usedAt      timestamp with tz nullable
  acquiredAt  timestamp with tz
```

UI: settings page for owner to enter their emergency number pool.
Alert when pool < 5 numbers remaining.

### 4.6 Error Taxonomy

ITA returns specific error codes. Each must be handled distinctly:

| ITA Code | Meaning | Our Response |
|----------|---------|--------------|
| E001 | Invalid VAT number | Show to user: "מספר מע״מ לא תקין" |
| E002 | Invoice already allocated | Idempotent — store the returned number |
| E003 | Below threshold | Don't request (shouldn't happen — check before calling) |
| E010 | Authentication failure | Trigger re-auth flow for business |
| E099 | System unavailable | Use emergency number |

These must be defined as constants, not magic strings, with Hebrew user-facing messages.

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
  amountAgora     integer NOT NULL
  paidAt          date NOT NULL
  method          enum: cash, transfer, credit, check, other
  reference       text
  notes           text
  recordedByUserId uuid FK → users
  createdAt       timestamp with tz
```

### 5.2 Credit Notes (חשבונית מס זיכוי)

A credit note is a real invoice document (type 330) that references the original.
It gets its own sequential number in the 330 sequence.

Flow:
1. On a finalized invoice: "הפק חשבונית זיכוי"
2. Modal: full credit or partial (adjust amounts)
3. Credit note created as a new invoice record with `creditedInvoiceId` set
4. Original invoice status → `credited`
5. SHAAM: credit note may also need allocation number if above threshold

### 5.3 Overdue Detection

Background job (cron, daily at 6am):
- Find all invoices with `status = finalized` or `partially_paid`
  where `dueDate < NOW()` and `dueDate IS NOT NULL`
- Mark as `overdue` (add to status or a flag column)
- Send email notification to business owner (configurable frequency: daily digest or per-invoice)

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
- **Puppeteer** server-side. Run in a separate worker process to avoid blocking the Fastify event loop.
  Consider a queue (BullMQ or pg-boss) for PDF generation jobs — avoids timeout on large invoices.
- Store PDFs in **object storage** (S3-compatible). Never regenerate if cached.
- **Draft PDFs**: watermarked, not cached.

### Background Jobs
Use **pg-boss** (PostgreSQL-backed job queue) — already have Postgres, no new infrastructure.
Jobs needed:
- PDF generation
- SHAAM allocation number requests (async, non-blocking to invoice finalization)
- Overdue invoice detection (daily cron)
- SHAAM token refresh
- Email delivery

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
  T00–T03 all merged to main, awaiting production deploy

→ Phase 1: Customer Management
  🔄 T04: Customer schema + API (merged, needs patch — 12 issues from deep review)
    Blocking: PUT→PATCH+CORS, 409 response, repo tests, duplicate integration test
    Medium: partial unique index, checksum all ID types, deletedAt clearing,
            fragile 23505, search tests, name nullability
    Low: POST→201, list schema fields for Phase 2
  → T05: Customer frontend (list + create + edit) — fully specified, blocked on T04 patch + deploy

→ Phase 2: Invoice Creation          (~3 weeks)
  2.1 DB schema: invoices, invoice_items, sequences
  2.2 Sequential numbering (race-safe)
  2.3 VAT calculation engine (tested pure functions)
  2.4 Draft invoice create/edit UI
  2.5 Finalization flow with preview
  2.6 Invoice detail view
  2.7 Invoice list with filters

→ Phase 3: PDF Generation            (~1 week)
  3.1 HTML invoice template
  3.2 Puppeteer PDF generation
  3.3 PDF caching + storage
  3.4 Email delivery

→ Phase 4: SHAAM Integration         (~3 weeks)
  4.1 SHAAM abstraction interface
  4.2 OAuth2 per-business token management
  4.3 Allocation number request (sandbox)
  4.4 Emergency number pool
  4.5 Error handling + audit log
  4.6 Production SHAAM credentials

→ Phase 5: Invoice Lifecycle         (~1.5 weeks)
  5.1 Payment recording
  5.2 Credit notes
  5.3 Overdue detection (cron)
  5.4 Invoice search + pagination

→ Phase 6: Reporting                 (~2 weeks)
  6.1 PCN874 VAT report export
  6.2 Business dashboard
  6.3 Uniform file export

→ Phase 7: ITA Registration          (parallel with 6)
  Administrative + legal review
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
| Hebrew PDF rendering | Medium | Validate Puppeteer approach with sample invoice before committing |
| Concurrent numbering | High | Test with 50 concurrent requests before shipping to production |
| Legal review cost | Low | Budget ₪2,000-5,000 for יועץ מס review before ITA submission |
| Emergency number pool depletion | Medium | Alert at < 5 remaining; auto-notify business owner to replenish |
