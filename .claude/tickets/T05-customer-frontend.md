# T05 — Customer Frontend (List + Create + Edit)

**Status**: 🔒 Blocked (T03 + T04 must deploy first)
**Phase**: 1 — Customers
**Requires**: T04 deployed (+ T04 patch: duplicate taxId response must include existing customer info)
**Blocks**: T07 (invoice create needs customer search)

---

## What & Why

The customer list is a bookkeeper's daily tool. They open it constantly — to find a customer, to start a new invoice. It must be fast and keyboard-friendly. Search must feel instant.

The creation form needs to be smart: validate tax ID checksums, show duplicate conflicts with a link to the existing record, and conditionally show the licensed dealer toggle.

---

## Prerequisite: T04 Patch — Duplicate TaxId Response

The current `createCustomer` service throws `conflict({ code: 'duplicate_tax_id' })` — which serializes to `{ error: "duplicate_tax_id" }` with no customer info. The frontend needs the existing customer's ID and name to show a useful conflict message with a link.

**Required change** in `api/src/services/customer-service.ts`:
- On catching the `23505` unique constraint error, look up the existing customer by `(businessId, taxId)`
- Include `existingCustomerId` and `existingCustomerName` in the error details
- Example response: `{ error: "duplicate_tax_id", details: { existingCustomerId: "uuid", existingCustomerName: "שם" } }`

This is a small, focused patch — ≤3 files changed (service, test, possibly error factory).

---

## Product Requirements

### Page 1: Customer List (`/business/customers`)

**Layout**: `Container size="lg"` with `PageTitle` + search bar + list.

**Search bar**:
- `TextInput` with `IconSearch` as left section
- Placeholder: `"חיפוש לפי שם או מספר מזהה..."`
- Debounced 150ms using `useDebouncedValue` from `@mantine/hooks`
- Sends `?q=` to `GET /businesses/:businessId/customers`

**List rows** — each customer renders as a `Card` or `Paper` with:
- **Name** (bold, primary text)
- **Tax ID** (formatted with dash: `XX-XXXXXXX`, dimmed) — or "ללא מספר מזהה" if none
- **City** (dimmed, if present)
- **"עוסק מורשה"** `Badge` (color: blue, variant: light) — shown only when `isLicensedDealer === true`
- Clicking anywhere on the row navigates to `/business/customers/:id`
- **No separate "ערוך" button** — clicking the row IS the action (simpler)

**Active/inactive filter**:
- `SegmentedControl` with two options: `"פעילים"` (default) | `"הכל"`
- When "הכל" selected, pass `?active=false` to the API
- Inactive customers shown with reduced opacity and a dimmed "לא פעיל" badge

**Empty state** (no customers at all):
- Use `StatusCard` with `status="empty"`
- Title: `"עדיין אין לקוחות"`
- Description: `"הוסיפו לקוח ראשון כדי להתחיל ליצור חשבוניות"`
- Primary action: `"הוסף לקוח ראשון"` → navigates to `/business/customers/new`

**Empty search results**:
- Use `StatusCard` with `status="notFound"`
- Title: `"לא נמצאו לקוחות"`
- Description: `"נסו לחפש במילות מפתח אחרות"`

**Header action**: `Button` top-right: `"+ לקוח חדש"` → navigates to `/business/customers/new`

**Loading state**: `StatusCard status="loading"` with title `"טוען לקוחות..."`

**Error state**: `StatusCard status="error"` with retry button.

### Page 2: Customer Create (`/business/customers/new`)

**Layout**: `Container size="sm"` with `PageTitle` + form card.

**Form uses `CustomerForm` shared component** (see Architecture section).

**Field order**:
1. **Name** — `TextInput`, required. Label: `"שם הלקוח"`. Error: `"שם נדרש"`
2. **Tax ID Type** — `Select` with options:
   - `company_id`: `"מספר חברה (ח.פ.)"`
   - `vat_number`: `"מספר עוסק מורשה (ע.מ.)"`
   - `personal_id`: `"תעודת זהות (ת.ז.)"`
   - `none`: `"ללא מספר מזהה"` (default)
3. **Tax ID** — `TextInput`, shown only when `taxIdType !== 'none'`, `maxLength={9}`
   - Validation: 9 digits (`"מספר מזהה חייב להיות 9 ספרות"`)
   - When `taxIdType === 'personal_id'`: Israeli ID checksum (`"מספר ת.ז. לא תקין"`)
4. **Is Licensed Dealer** — `Switch`, shown only when `taxIdType !== 'none'` AND `taxId` has a value
   - Label: `"עוסק מורשה"`
   - Description: `"לקוח זה הוא עוסק מורשה ונדרש מספר הקצאה על חשבוניות מעל הסף"`
5. **Address** — `AddressAutocomplete` (reuse existing component)
6. **Contact Name** — `TextInput`, label: `"איש קשר"`
7. **Email** — `TextInput` type="email", label: `"אימייל"`
8. **Phone** — `TextInput`, label: `"טלפון"`, placeholder: `"05X-XXXXXXX"`
9. **Notes** — `Textarea`, label: `"הערות פנימיות"`, description: `"לא יופיע בחשבונית"`, styles: gray background

**Duplicate tax ID handling**:
- On 409 with `error === 'duplicate_tax_id'`: show inline error on the taxId field
- Message: `"מספר מזהה זה כבר קיים עבור {existingCustomerName}"` (from error response details)
- Include a link: `"עבור ללקוח הקיים"` → navigates to `/business/customers/:existingCustomerId`
- **No toast** for this error — inline only

**Success**: redirect to `/business/customers/:newId` with success toast: `"הלקוח נוצר בהצלחה"`

**Buttons**:
- `"שמור"` (primary, type submit, loading spinner during mutation)
- `"ביטול"` (subtle, navigates back to `/business/customers`)

### Page 3: Customer Detail/Edit (`/business/customers/:id`)

**Layout**: `Container size="sm"` with `PageTitle` (customer name) + form card + invoice history placeholder + delete section.

**Form**: Same `CustomerForm` component as create, pre-populated with fetched data. Always in edit mode (like BusinessSettings — no view/edit toggle for MVP).

**Invoice history placeholder**:
- `Divider` with label `"היסטוריית חשבוניות"`
- `Text c="dimmed"`: `"חשבוניות יוצגו כאן לאחר הוספת מודול חשבוניות"`

**Soft delete section**:
- `Divider` with label `"מחיקה"` (color: red)
- `Button` variant="subtle" color="red": `"הסר לקוח"`
- On click: open `modals.openConfirmModal` with:
  - Title: `"הסרת לקוח"`
  - Children: `"האם להסיר את {customerName}? הלקוח לא יופיע ברשימה אך הנתונים יישמרו."`
  - Confirm label: `"הסר"`
  - Cancel label: `"ביטול"`
  - Confirm color: red
- On confirm: `DELETE /businesses/:businessId/customers/:customerId`
- On success: navigate to `/business/customers` with toast: `"הלקוח הוסר בהצלחה"`

**Loading/error**: Same pattern as BusinessSettings — `StatusCard` for loading and error states.

---

## Architecture Notes

### New Files

| File | Purpose |
|------|---------|
| `front/src/api/customers.ts` | API client: fetchCustomers, fetchCustomer, createCustomer, updateCustomer, deleteCustomer |
| `front/src/components/CustomerForm.tsx` | Shared form component (used by create + edit pages) |
| `front/src/pages/CustomerList.tsx` | Customer list page |
| `front/src/pages/CustomerCreate.tsx` | Customer create page |
| `front/src/pages/CustomerDetail.tsx` | Customer detail/edit page |

### Edited Files

| File | Change |
|------|--------|
| `front/src/lib/queryKeys.ts` | Add `customers(businessId)` and `customer(businessId, customerId)` |
| `front/src/App.tsx` | Add 3 routes under the protected layout |
| `front/src/Navbar.tsx` | Add "לקוחות" nav link with `IconUsers` or `IconAddressBook` |

### API Client Pattern

Follow `front/src/api/businesses.ts` exactly:

```typescript
// front/src/api/customers.ts
export async function fetchCustomers(businessId: string, q?: string, active?: string) { ... }
export async function fetchCustomer(businessId: string, customerId: string) { ... }
export async function createCustomer(businessId: string, data: CreateCustomerBody) { ... }
export async function updateCustomer(businessId: string, customerId: string, data: UpdateCustomerBody) { ... }
export async function deleteCustomer(businessId: string, customerId: string) { ... }
```

All functions use `fetchJson` from `lib/http.ts` and parse responses with Zod schemas from `@bon/types/customers`.

### Query Keys

```typescript
customers: (businessId: string) => ['businesses', businessId, 'customers'] as const,
customer: (businessId: string, customerId: string) => ['businesses', businessId, 'customers', customerId] as const,
```

### CustomerForm Component

Props:
- `initialValues` — partial customer data (empty for create, fetched for edit)
- `onSubmit` — callback with form values
- `isPending` — loading state for submit button
- `submitLabel` — "שמור" (create) or "שמור שינויים" (edit)
- `initialCity` / `initialStreetAddress` — for AddressAutocomplete key

The form component owns all validation logic. The page components own the mutation and navigation.

### Tax ID Type Inference

When `taxIdType` changes:
- `none` → clear `taxId`, hide taxId field, hide licensed dealer toggle
- Any other → show taxId field, show licensed dealer toggle (only if taxId has value)

When `taxIdType === 'personal_id'` and taxId has 9 digits → run `validateIsraeliId` from `@bon/types/validation`.

### Routing

```tsx
<Route path="/business/customers" element={<CustomerList />} />
<Route path="/business/customers/new" element={<CustomerCreate />} />
<Route path="/business/customers/:customerId" element={<CustomerDetail />} />
```

### Debounced Search

```typescript
const [search, setSearch] = useState('');
const [debouncedSearch] = useDebouncedValue(search, 150);

const customersQuery = useQuery({
  queryKey: queryKeys.customers(businessId),
  queryFn: () => fetchCustomers(businessId, debouncedSearch || undefined, activeFilter),
  // re-fetch when debouncedSearch or activeFilter change
});
```

Note: the search query param should be part of the queryKey to avoid stale cache:
```typescript
queryKey: [...queryKeys.customers(businessId), { q: debouncedSearch, active: activeFilter }],
```

---

## Test Plan

### CustomerList tests (`front/src/test/pages/CustomerList.test.tsx`)
- Renders customer list with mocked data (name, taxId, city, badge)
- Search input updates query (verify debounced behavior)
- Empty state shows CTA button
- Loading state shows spinner
- Error state shows retry button
- Clicking a row navigates to detail page

### CustomerCreate tests (`front/src/test/pages/CustomerCreate.test.tsx`)
- Submit with name only → success → navigates to detail
- Submit with empty name → shows validation error
- Submit with invalid taxId (not 9 digits) → shows validation error
- Submit with invalid ת.ז. checksum → shows "מספר ת.ז. לא תקין"
- Duplicate taxId → shows inline error with link to existing customer

### CustomerDetail tests (`front/src/test/pages/CustomerDetail.test.tsx`)
- Loads and displays customer data
- Edit and save → success toast
- Soft delete → confirm modal → success → navigates to list

---

## Acceptance Criteria

- [ ] `/business/customers` — searchable list (name + taxId, debounced 150ms)
- [ ] Each row: name, taxId (formatted), city, "עוסק מורשה" badge if applicable
- [ ] Active/inactive filter via SegmentedControl
- [ ] Empty state has CTA: "הוסיפו לקוח ראשון כדי להתחיל ליצור חשבוניות"
- [ ] Empty search shows "לא נמצאו לקוחות"
- [ ] Clicking row navigates to detail page
- [ ] `/business/customers/new` — creation form
  - [ ] Name required; all other fields optional
  - [ ] Tax ID type selector (Select component)
  - [ ] 9-digit taxId validation; Israeli ID checksum for ת.ז.
  - [ ] Duplicate taxId shows inline error with existing customer name and link
  - [ ] `isLicensedDealer` toggle shown only when taxId present
  - [ ] Address via `<AddressAutocomplete>`
  - [ ] Success → redirect to detail page with toast
- [ ] `/business/customers/:id` — detail + edit
  - [ ] Pre-populated form with fetched data (always-edit mode)
  - [ ] Invoice history placeholder section
  - [ ] Soft delete with confirm modal → navigate to list
- [ ] Loading, error, and empty states on all data-fetching components
- [ ] "לקוחות" link in navbar
- [ ] All UI text in Hebrew
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
