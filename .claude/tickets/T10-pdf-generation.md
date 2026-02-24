# T10 — Invoice PDF Generation

**Status**: 🔒 Blocked (T08 must merge first)
**Phase**: 3 — PDF
**Requires**: T08 merged
**Blocks**: T11

Note: T09 does NOT block T10. They can be built in parallel after T08 merges.

---

## What & Why

The PDF is what customers see. It's often the only professional document a small business sends. A bad-looking invoice reflects badly on the business. The PDF must also be legally compliant — specific fields are required by ITA regulation.

RTL Hebrew PDFs are hard. Puppeteer (headless Chrome) is the chosen approach: generate HTML → print to PDF. The browser handles RTL natively.

**Deployment**: The PDF service runs as a **separate Railway service** (not inside the main API container). This avoids bloating the API image with Chromium (~400MB) and allows independent scaling. The main API proxies PDF requests to the PDF service via an internal URL.

---

## Recommended PR Split

This ticket must be split into two PRs:
- **PR 1 — Infrastructure**: `StorageService` interface + local filesystem implementation, Puppeteer manager, basic `GET /businesses/:businessId/invoices/:invoiceId/pdf` endpoint (synchronous Puppeteer, no caching), authentication, and tests
- **PR 2 — Template + Caching**: Full HTML invoice template with all ITA-required fields, draft watermark, caching logic, `PdfDownloadButton` frontend component, and tests

PR 2 cannot start until PR 1 is merged.

---

## Acceptance Criteria

### API Endpoint

- [ ] `GET /businesses/:businessId/invoices/:invoiceId/pdf` returns `application/pdf`
  - [ ] Requires authentication (`app.authenticate` + `app.requireBusinessAccess`)
  - [ ] Wrong invoice ID or wrong business → 404
- [ ] Response headers: `Content-Type: application/pdf`, `Content-Disposition: inline; filename="{documentNumber}.pdf"` for finalized, `filename="draft-{invoiceId}.pdf"` for drafts
- [ ] Draft invoices: watermark "טיוטה - לא בתוקף" diagonally (45°, red, ~20% opacity) across the full page; NOT cached
- [ ] Finalized invoices: cached after first generation, served from cache on subsequent requests

### StorageService Interface

- [ ] `StorageService` interface in `api/src/lib/storage.ts`:
  ```typescript
  interface StorageService {
    put(key: string, content: Buffer, contentType: string): Promise<void>
    get(key: string): Promise<Buffer | null>
    delete(key: string): Promise<void>
    exists(key: string): Promise<boolean>
  }
  ```
- [ ] `LocalFileStorage` implementation for MVP (stores in `.data/pdfs/`). Directory added to `.gitignore`.
- [ ] `PDF_STORAGE_DIR` env var (optional, defaults to `.data/pdfs`)

### Puppeteer Manager

- [ ] Singleton browser instance, started once, reused across requests
- [ ] New page created per PDF request, closed after use
- [ ] Max 3 concurrent pages (reject with 503 if exceeded)
- [ ] Network requests blocked during rendering (template is self-contained)
- [ ] Browser closed on Fastify `onClose` hook
- [ ] If browser crashes: log error, return 500, browser restarts on next request

### Invoice HTML Template

- [ ] Font: Heebo (Regular 400 + Bold 700), embedded as base64 data URIs in `<style>` block (no CDN fetch during rendering)
- [ ] Document direction: `<html dir="rtl" lang="he">`
- [ ] Number spans use `dir="ltr"` for: phone numbers, tax IDs, amounts, invoice number
- [ ] All currency amounts formatted as `₪1,234.56` using `Intl.NumberFormat('he-IL', ...)`

**Required fields per ITA regulation:**

- [ ] **Business section** (top):
  - Business name
  - Registration number with label ("ח.פ." for limited_company, "ע.מ." for licensed/exempt dealer)
  - VAT number (non-exempt only)
  - Address: street, city, postal code
  - Phone and email (if set)
  - Logo (if `logoUrl` set; omit section entirely if null)

- [ ] **Document identity section**:
  - Document type title: "חשבונית מס" / "חשבונית מס קבלה" / "קבלה" / "חשבונית מס זיכוי"
  - Invoice number: "מספר: {documentNumber}"
  - Invoice date: "תאריך: DD/MM/YYYY"
  - Issued-at: "תאריך הפקה: DD/MM/YYYY HH:mm"
  - Due date (if set): "תאריך פירעון: DD/MM/YYYY"

- [ ] **Customer section** ("לכבוד:"):
  - Customer name
  - Customer tax ID with generic label "מ.ז./ח.פ." (since `taxIdType` is not in snapshot). Omit row if null.
  - Customer address (if set)
  - Customer email (if set)

- [ ] **Line items table**:
  - Columns: #, תיאור, כמות, מחיר יחידה, הנחה %, סה"כ לפני מע"מ, מע"מ, סה"כ
  - Catalog number in secondary line under description if set
  - Long descriptions (>80 chars) wrap within cell
  - Multi-page invoices: table header repeats on each page (`display: table-header-group`)

- [ ] **Totals section** (right-aligned):
  - Subtotal: "סכום: ₪X"
  - Discount (if > 0): "הנחה: -₪X"
  - Total excl. VAT: "סכום לפני מע"מ: ₪X"
  - VAT with rate: "מע"מ {rate}%: ₪X" (derive rate from line items, don't hardcode 17%)
  - Grand total: "סה"כ לתשלום: ₪X" (bold, larger font)

- [ ] **VAT exemption reason** (if `vatExemptionReason` set): distinct box near totals

- [ ] **Allocation number** (if `allocationNumber` set): prominent bordered box "מספר הקצאה: {number}"

- [ ] **Notes** (if set): labeled "הערות:" with text wrapping

- [ ] **Footer** (bottom of every page):
  - "מסמך זה הופק על ידי BON"
  - ITA software registration number from env var `ITA_SOFTWARE_REGISTRATION_NUMBER` (omit if not set)
  - Page number on multi-page: "עמוד {n} מתוך {total}" (CSS `counter(page)` / `counter(pages)`)

### Cache Invalidation

- [ ] `invalidatePdfCache(businessId, invoiceId)` function exported from `pdf-service.ts`
  - Deletes cached PDF for the given invoice
  - Called by future tickets (T11/T15/T16/T17) when status changes — document this requirement
- [ ] Draft PDFs: never cached
- [ ] Cache test: second request for same finalized invoice hits storage, not Puppeteer (verify via spy)

### Frontend: PdfDownloadButton

- [ ] `PdfDownloadButton` component in `front/src/components/PdfDownloadButton.tsx`
  - Replaces the disabled "הורד PDF" placeholder in T08's `InvoiceActionBar`
  - `fetchInvoicePdf(businessId, invoiceId)` API function in `front/src/api/invoices.ts` (blob response)
  - On click: loading state → fetch blob → programmatic download via hidden `<a>` element → idle
  - On error: button shows error state (red, 3 seconds), toast notification
  - Loading > 2 seconds: tooltip "זה עשוי לקחת מספר שניות"
  - Enabled for drafts (watermarked PDF) and finalized invoices
  - Filename: `documentNumber.pdf` or "חשבונית.pdf" for drafts
- [ ] Test: successful download state sequence, error state on fetch failure

### General

- [ ] `npm run check` passes
- [ ] PDF endpoint tests: returns PDF for finalized, returns watermarked PDF for draft, 404 for wrong business, caching works
- [ ] Template test: `renderInvoiceHtml()` returns HTML containing invoice number and customer name
- [ ] PdfDownloadButton test: download success + error handling

---

## Architecture Notes

### Template Approach: React SSR

**Decision**: Use React `renderToStaticMarkup` for the HTML invoice template. The template is complex (6+ conditional sections, dynamic line items, mixed RTL/LTR), and React's automatic HTML escaping prevents XSS from user-provided strings (customer names, notes). The ~2MB dependency cost is negligible in a server context.

Add to the PDF service's `package.json`:
```json
{ "dependencies": { "react": "^19.x", "react-dom": "^19.x" } }
```

### Separate PDF Service on Railway

**Decision**: PDF generation runs as a separate service, not inside the main API process. This keeps Chromium (~400MB) out of the API container.

**Architecture**:
- New workspace: `pdf/` (Fastify micro-service, TypeScript)
- Single endpoint: `POST /render` — accepts invoice + business data as JSON, returns PDF buffer
- Uses `puppeteer-core` + system Chromium install (Dockerfile installs `chromium` from OS packages)
- The main API's `/businesses/:bid/invoices/:iid/pdf` route fetches invoice data, calls the PDF service, and returns the response
- Internal communication: `PDF_SERVICE_URL` env var on the API (Railway internal networking)
- The PDF service has no database access — it receives all data it needs in the request body

**Environment variables**:
- API: `PDF_SERVICE_URL` — internal URL of the PDF service (e.g. `http://pdf.railway.internal:3001`)
- PDF service: `PORT`, `ITA_SOFTWARE_REGISTRATION_NUMBER` (optional), `CHROMIUM_PATH` (defaults to `/usr/bin/chromium-browser`)

### Puppeteer Manager

File: `pdf/src/lib/puppeteer.ts` (in the PDF service workspace, not the API)

- Uses `puppeteer-core` (not `puppeteer`) — no bundled Chromium
- `executablePath` from `CHROMIUM_PATH` env var (defaults to `/usr/bin/chromium-browser`)
- Singleton `Browser` instance, created lazily on first request
- Max 3 concurrent pages; reject with 503 `pdf_generation_busy` if exceeded
- All network requests blocked during rendering (template self-contained)
- Browser closed on Fastify `onClose` hook
- Launch args: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
- PDF settings: A4, printBackground, margins 15mm top/bottom + 10mm left/right

### PdfService (API side)

File: `api/src/services/pdf-service.ts`

```
generateInvoicePdf(businessId, invoiceId): Promise<{ data: Buffer; filename: string }>
invalidatePdfCache(businessId, invoiceId): Promise<void>
```

Logic:
1. Load invoice + items via `getInvoice()`, load business via `findBusinessById()`
2. If finalized AND cached → return cached
3. POST invoice + business data to PDF service → receive PDF buffer
4. If finalized → cache it
5. Return buffer + filename

### PDF Render Service

File: `pdf/src/routes/render.ts`

```
POST /render
Body: { invoice, items, business, options: { watermark?: boolean } }
Response: application/pdf buffer
```

Logic:
1. Render HTML template from request data (React SSR)
2. Puppeteer: HTML → PDF
3. If `options.watermark`: add "טיוטה - לא בתוקף" watermark
4. Return PDF buffer

### Cache Strategy

Cache key: `invoices/{businessId}/{invoiceId}.pdf`

Simple approach: if cached file exists and invoice is finalized, serve it. `invalidatePdfCache()` deletes the file. Called by future status-change tickets.

### Concurrent Generation Protection

In-memory `Map<string, Promise<Buffer>>` keyed by `invoiceId` deduplicates concurrent requests for the same invoice. If generation is in progress, new requests await the same promise.

### Font Embedding

Download Heebo font files (woff2) at build time, store in `api/src/pdf/fonts/`. Read once on first use, base64-encode, cache in memory. Inlined in `<style>` block as `@font-face` data URIs.

### customerTaxId Label Gap

Invoice snapshot doesn't include `customerTaxIdType`. Use generic "מ.ז./ח.פ." label on PDF. Add `// TODO: add customerTaxIdType to snapshot` comment.

### Amount Formatting Helper

Already consolidated in `types/src/formatting.ts` by T08-A. The PDF service imports `formatMinorUnits` and `formatDate` from `@bon/types/formatting`.

### File Structure

```
pdf/                        — new workspace (separate Railway service)
  src/
    pdf/
      InvoiceTemplate.tsx   — React component
      template-styles.ts    — CSS string for PDF
      fonts/                — heebo-regular.woff2, heebo-bold.woff2
      font-loader.ts        — reads fonts, returns base64
    lib/
      puppeteer.ts          — browser manager (puppeteer-core)
    routes/
      render.ts             — POST /render endpoint
    app.ts                  — Fastify app
    env.ts                  — env validation
  Dockerfile                — Node 22 + system Chromium
  package.json
  tsconfig.json

api/src/lib/
  storage.ts              — StorageService interface + factory
  local-storage.ts        — LocalFileStorage

api/src/services/
  pdf-service.ts          — generateInvoicePdf (calls PDF service), invalidatePdfCache
```

### Testing Strategy

- **Template tests**: Assert HTML output contains required fields. No Puppeteer needed.
- **Route tests**: Mock Puppeteer (fake browser/page returning fixed Buffer). Verify 200, 404, Content-Type, Content-Disposition.
- **Visual QA**: Manual — generate sample PDF and inspect. Not automated in CI.

### Environment

Add to `api/src/env.ts`:
- `PDF_STORAGE_DIR` — optional, defaults to `.data/pdfs`
- `PDF_SERVICE_URL` — required, internal URL of the PDF service (e.g. `http://pdf.railway.internal:3001`)

Add to `pdf/src/env.ts`:
- `PORT` — defaults to `3001`
- `ITA_SOFTWARE_REGISTRATION_NUMBER` — optional, omitted from footer if not set
- `CHROMIUM_PATH` — optional, defaults to `/usr/bin/chromium-browser`

Add `.data/` to `.gitignore`.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
