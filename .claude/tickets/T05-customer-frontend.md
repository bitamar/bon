# T05 — Customer Frontend (List + Create + Edit)

**Status**: 🔄 Merged (PR #7) — needs T-API-01 fixes + production deploy to be ✅
**Phase**: 1 — Customers
**Requires**: T-API-01 (API hardening fixes)
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

**Guard**: All three pages must guard on `!activeBusiness` — show `StatusCard status="error"` and make no API calls when `activeBusiness` is null. Follow the `BusinessSettings`/`TeamManagement` pattern exactly.

**Search bar and filter — same row**:
- `Group justify="space-between"` wrapping the search input and the SegmentedControl
- Search: `TextInput` with `IconSearch` as left section, `style={{ flex: 1 }}`
- Placeholder: `"חיפוש לפי שם או מספר מזהה..."`
- Debounced 150ms using `useDebouncedValue` from `@mantine/hooks`
- Sends `?q=` to `GET /businesses/:businessId/customers`
- `SegmentedControl` right-aligned on the same row

**List rows** — each customer renders as an `UnstyledButton` wrapping a `Paper`:
- Use `<UnstyledButton component={Link} to={...}>` for proper semantics (focusable, keyboard-navigable, SPA navigation)
- **Name** (bold, primary text)
- **Tax ID** (formatted per type, dimmed) — or "ללא מספר מזהה" if none. See Tax ID Display Format below.
- **City** (dimmed, if present)
- **Badges** (in a `Group`, order: "עוסק מורשה" first, then "לא פעיל" if applicable):
  - **"עוסק מורשה"** `Badge` (color: blue, variant: light) — shown only when `isLicensedDealer === true`
  - **"לא פעיל"** `Badge` (color: gray, variant: light) — shown only when `isActive === false`
- Clicking anywhere on the row navigates to `/business/customers/:id`
- **No separate "ערוך" button** — clicking the row IS the action (simpler)
- Inactive customers: `style={{ opacity: 0.5 }}` on the row

**Tax ID Display Format** — varies by `taxIdType`:
- `company_id` (ח.פ.): `"XX-XXXXXXX"` (first 2, dash, remaining 7) — e.g. `"51-2345678"`
- `vat_number` (ע.מ.): `"XXXXXXXXX"` (no grouping)
- `personal_id` (ת.ז.): `"XXXXXXXXX"` (no grouping)
- `none` / no taxId: `"ללא מספר מזהה"`

Extract a `formatTaxId(taxId: string, taxIdType: TaxIdType): string` helper function in the API client file or a shared `format.ts` utility. Do not inline this logic in JSX.

**Active/inactive filter**:
- `SegmentedControl` with two options: `"פעילים"` (default) | `"הכל"`
- When "פעילים" is selected: **omit** the `active` parameter entirely (do not send `active=true`)
- When "הכל" is selected: send `?active=false` to the API (this means "include inactive", not "only inactive")

**Limit**: Pass `?limit=200` to the API to avoid the backend's default of 50. The plan says "no pagination at < 200 customers."

**Empty state** (no customers at all):
- Use `StatusCard` with `status="empty"`
- Title: `"עדיין אין לקוחות"`
- Description: `"הוסיפו לקוח ראשון כדי להתחיל ליצור חשבוניות"`
- Primary action: `"הוסף לקוח ראשון"` → navigates to `/business/customers/new`

**Empty search results**:
- Use `StatusCard` with `status="notFound"`
- Title: `"לא נמצאו לקוחות"`
- Description: `"נסו לחפש במילות מפתח אחרות"`

**Header action**: `Button` with `leftSection={<IconUserPlus size={18} />}`, label `"לקוח חדש"` (no `+` in text — use the icon per existing convention). Navigates to `/business/customers/new`.

**Loading state**: `StatusCard status="loading"` with title `"טוען לקוחות..."`

**Error state**: `StatusCard status="error"` with retry button.

### Page 2: Customer Create (`/business/customers/new`)

**Layout**: `Container size="sm"` with `PageTitle` + form card (`Paper component="form" withBorder radius="lg" p="lg"`).

**Guard**: `!activeBusiness` → `StatusCard status="error"`.

**Form uses `CustomerForm` shared component** (see Architecture section).

**Field order**:
1. **Name** — `TextInput`, required. Label is **dynamic** based on `taxIdType`:
   - `company_id` or `vat_number`: `"שם העסק"`
   - `personal_id`: `"שם מלא"`
   - `none` (default): `"שם הלקוח"`
   Error: `"שם נדרש"`
2. **Tax ID Type** — `Select` with options (note: `none` first — most common case for individuals):
   - `none`: `"ללא מספר מזהה"` (default)
   - `company_id`: `"מספר חברה (ח.פ.)"`
   - `vat_number`: `"מספר עוסק מורשה (ע.מ.)"`
   - `personal_id`: `"תעודת זהות (ת.ז.)"`
3. **Tax ID** — `TextInput`, shown only when `taxIdType !== 'none'`, `maxLength={9}`, `inputMode="numeric"`
   - Validation (in form `validate`, not just `maxLength`): 9 digits → `"מספר מזהה חייב להיות 9 ספרות"`
   - Checksum validation runs for **all** `taxIdType` values (not just `personal_id`):
     - `personal_id`: `"מספר ת.ז. לא תקין"`
     - `company_id` / `vat_number`: `"מספר מזהה לא תקין (ספרת ביקורת)"`
   - This matches the Zod `superRefine` in `createCustomerBodySchema` exactly.
4. **Is Licensed Dealer** — `Switch`, shown only when `taxIdType !== 'none'` AND `taxId` has a value
   - Label: `"עוסק מורשה"`
   - Description: `"לקוח זה הוא עוסק מורשה ונדרש מספר הקצאה על חשבוניות מעל הסף"`
   - **Auto-reset rule**: When `taxId` is cleared (value becomes empty string) OR `taxIdType` is changed to `none`, automatically set `isLicensedDealer` to `false`. This prevents the Zod refine error `"עוסק מורשה חייב מספר מזהה"`.
5. **Address** — `AddressAutocomplete` (reuse existing component, with `required={false}` — see Component Changes section)
6. **Contact Name** — `TextInput`, label: `"שם איש קשר"`
7. **Email** — `TextInput` type="email", label: `"אימייל"`
8. **Phone** — `TextInput`, label: `"טלפון"`, placeholder: `"05X-XXXXXXX"`
9. **Notes** — `Textarea`, label: `"הערות פנימיות"`, description: `"לא יופיע בחשבונית"`, styles: `{ input: { backgroundColor: 'var(--mantine-color-gray-0)' } }`

**Duplicate tax ID handling**:
- Use `errorToast: false` on the create mutation to suppress the generic toast
- On 409 with `error === 'duplicate_tax_id'`:
  - **If `details` present** (has `existingCustomerId` and `existingCustomerName`):
    - Show inline error on taxId field: `"מספר מזהה זה כבר קיים עבור {existingCustomerName}"`
    - Include a link using `<Anchor component={Link} to={...}>`: `"עבור ללקוח הקיים"` → navigates to `/business/customers/:existingCustomerId`
    - Use `form.setFieldError('taxId', <ReactNode>)` — Mantine form error prop accepts `ReactNode`, including JSX with `Anchor`.
  - **If `details` absent** (race condition — customer was deleted between constraint violation and lookup):
    - Show inline error: `"מספר מזהה זה כבר קשור ללקוח קיים"` (no link)
- **No toast** for this error — inline only
- For non-409 errors, manually call `showErrorNotification` with the extracted error message
- See Duplicate TaxId Error Handling section in Architecture Notes for the exact pattern.

**Success**: redirect to `/business/customers/:newId` with success toast: `"הלקוח נוצר בהצלחה"`

**Buttons**:
- `"שמור"` (primary, type submit, loading spinner during mutation)
- `"ביטול"` (subtle, navigates to `/business/customers` — use explicit `navigate('/business/customers')`, NOT `navigate(-1)`)

### Page 3: Customer Detail/Edit (`/business/customers/:id`)

**Layout**: `Container size="sm"` with `PageTitle` (customer name) + form card + invoice history placeholder + delete section.

**Guard**: `!activeBusiness` → `StatusCard status="error"`.

**Loading/error guards** (in order, before rendering form):
1. `customerQuery.isPending` → full-page `StatusCard status="loading"` with title `"טוען פרטי לקוח..."`
2. `customerQuery.error` → full-page `StatusCard status="error"` with retry button
3. `!activeBusiness` → full-page `StatusCard status="error"`

Only after data is ready: render `PageTitle` + form.

**Form**: Same `CustomerForm` component as create, pre-populated with fetched data. Always in edit mode (like BusinessSettings — no view/edit toggle for MVP).

**Edit mode initialization**: When the query resolves, the `CustomerForm` receives the customer's `taxIdType` as `initialValues.taxIdType` — this must be the actual value from the API (e.g., `'none'`), not empty string. The `Select` component initial value must be `'none'` (a valid option), not `''`.

**Duplicate taxId on edit**: The `updateCustomer` service also catches the 23505 constraint and returns the same 409. The same inline error handling from the create page applies here. Use `errorToast: false` on the update mutation too.

**Invoice history placeholder**:
- `Divider` with label `"היסטוריית חשבוניות"` and `labelPosition="center"`
- `Text c="dimmed"`: `"חשבוניות יוצגו כאן לאחר הוספת מודול חשבוניות"`

**Soft delete section**:
- `Divider` with label `"מחיקה"` (color: red, `labelPosition="center"`)
- `Button` variant="subtle" color="red": `"הסר לקוח"`
- On click: use `useDisclosure` + `Modal` (NOT `modals.openConfirmModal` — `@mantine/modals` is not installed). Follow the `TeamManagement.tsx` delete confirmation pattern exactly:
  ```
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  // ...
  <Modal opened={deleteOpened} onClose={closeDelete} title="הסרת לקוח" centered overlayProps={{ blur: 2 }}>
    <Text>האם להסיר את {customerName}? הלקוח לא יופיע ברשימה אך הנתונים יישמרו.</Text>
    <Group justify="flex-end" mt="md">
      <Button variant="default" onClick={closeDelete}>ביטול</Button>
      <Button color="red" loading={deleteMutation.isPending} onClick={...}>הסר</Button>
    </Group>
  </Modal>
  ```
- On confirm: `DELETE /businesses/:businessId/customers/:customerId` — response is `{ ok: true }` (parse with `okResponseSchema` from `@bon/types/common`)
- On success: navigate to `/business/customers` with toast: `"הלקוח הוסר בהצלחה"`
- **TODO (Phase 2)**: Once invoices exist, delete should be blocked if the customer has finalized invoices. Show count and explanation. Currently there are no invoices, so this is deferred. Add a code comment marking this as a Phase 2 update.

---

## Architecture Notes

### Component Changes (existing files)

**`AddressAutocomplete` needs a `required` prop.** The component currently hardcodes `required` on the city, street, and house number `TextInput` elements. For the customer form, address is optional — only `name` is required. Add a `required?: boolean` prop (default `true` for backward compatibility with `BusinessSettings`). When `false`, omit the `required` attribute on the inner `TextInput` elements so the browser-native required indicator is suppressed.

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
| `front/src/App.tsx` | Add 3 routes under the protected layout — register `/business/customers/new` BEFORE `/business/customers/:customerId` (static before dynamic) |
| `front/src/Navbar.tsx` | Add "לקוחות" nav link with `IconAddressBook`, `active={pathname.startsWith('/business/customers')}` |
| `front/src/components/AddressAutocomplete.tsx` | Add `required?: boolean` prop (default `true`), pass through to inner `TextInput` elements |

### API Client Pattern

Follow `front/src/api/businesses.ts` exactly:

```
// front/src/api/customers.ts
import { okResponseSchema } from '@bon/types/common';

export async function fetchCustomers(
  businessId: string,
  q?: string,
  active?: 'false',  // 'false' = include inactive; undefined = active only
  limit?: number
) { ... }

export async function fetchCustomer(businessId: string, customerId: string) { ... }
export async function createCustomer(businessId: string, data: CreateCustomerBody) { ... }
export async function updateCustomer(businessId: string, customerId: string, data: UpdateCustomerBody) { ... }
export async function deleteCustomer(businessId: string, customerId: string) { ... }
// deleteCustomer parses response with okResponseSchema (returns { ok: true })
```

All functions use `fetchJson` from `lib/http.ts` and parse responses with Zod schemas:

- `fetchCustomers` → `customerListResponseSchema`
- `fetchCustomer` → `customerResponseSchema`
- `createCustomer` → `customerResponseSchema`
- `updateCustomer` → `customerResponseSchema`
- `deleteCustomer` → `okResponseSchema` from `@bon/types/common`

### Duplicate TaxId Error Handling

The `createCustomer` and `updateCustomer` API client functions throw `HttpError` on failure. The page component catches the error in the `onError` callback of `useApiMutation`. The pattern:

```
const createMutation = useApiMutation({
  mutationFn: (data: CreateCustomerBody) => createCustomer(businessId, data),
  errorToast: false,  // suppress generic toast — we handle 409 inline
  onError: (error) => {
    if (error instanceof HttpError && error.status === 409) {
      const body = error.body as {
        error?: string;
        details?: { existingCustomerId?: string; existingCustomerName?: string };
      } | undefined;
      if (body?.error === 'duplicate_tax_id') {
        if (body.details?.existingCustomerId && body.details?.existingCustomerName) {
          form.setFieldError('taxId', (
            <>
              {`מספר מזהה זה כבר קיים עבור ${body.details.existingCustomerName} `}
              <Anchor component={Link} to={`/business/customers/${body.details.existingCustomerId}`} size="sm">
                עבור ללקוח הקיים
              </Anchor>
            </>
          ));
        } else {
          form.setFieldError('taxId', 'מספר מזהה זה כבר קשור ללקוח קיים');
        }
        return;
      }
    }
    // For non-409 errors, show generic toast manually
    showErrorNotification(extractErrorMessage(error, 'משהו לא עבד, נסו שוב'));
  },
  successToast: { message: 'הלקוח נוצר בהצלחה' },
  onSuccess: (data) => {
    navigate(`/business/customers/${data.customer.id}`);
  },
});
```

This same pattern applies to the update mutation on the detail page (different success message/navigation).

### Query Keys

```
customers: (businessId: string) => ['businesses', businessId, 'customers'] as const,
customer: (businessId: string, customerId: string) => ['businesses', businessId, 'customers', customerId] as const,
```

### Cache Invalidation

After **create**: invalidate `queryKeys.customers(businessId)` (the list) so the new customer appears.

After **update**: invalidate BOTH:
- `queryKeys.customer(businessId, customerId)` — the detail (server is authoritative)
- `queryKeys.customers(businessId)` — the list (name/taxId changes affect display)

After **delete**: invalidate BOTH:
- `queryKeys.customer(businessId, customerId)` — clear stale detail cache
- `queryKeys.customers(businessId)` — remove from list

### CustomerForm Component

Props:
- `initialValues` — partial customer data (empty for create, fetched for edit)
- `onSubmit` — callback with `CreateCustomerBody`-shaped values. The form always produces a complete object. For edit, clearing an optional field (e.g., email) produces `undefined` for that field (omitted from payload). To null out a field in the update API (e.g., clear taxId), the page component maps `undefined` → `null` before calling `updateCustomer`.
- `isPending` — loading state for submit button
- `submitLabel` — "שמור" (create) or "שמור שינויים" (edit)
- `cancelLabel` — "ביטול"
- `onCancel` — callback for cancel button navigation
- `initialCity` / `initialStreetAddress` — for AddressAutocomplete key. Compute from `customerQuery.data?.customer` after query resolves. Pass as `key={`addr-${initialCity}`}` to trigger re-initialization (same as `BusinessSettings.tsx`).

The form component owns all validation logic. The page components own the mutation and navigation.

### Tax ID Type Inference

When `taxIdType` changes:
- `none` → clear `taxId`, set `isLicensedDealer` to `false`, hide taxId field, hide licensed dealer toggle
- Any other → show taxId field, show licensed dealer toggle (only if taxId has value)

When `taxId` value is cleared (becomes empty string) while `taxIdType !== 'none'`:
- Set `isLicensedDealer` to `false` (prevents Zod validation error)

Checksum validation runs for all `taxIdType` values except `none`, using `validateIsraeliId` from `@bon/types/validation`. Error messages differ by type (see Field order item 3).

### Routing

```
<Route path="/business/customers" element={<CustomerList />} />
<Route path="/business/customers/new" element={<CustomerCreate />} />
<Route path="/business/customers/:customerId" element={<CustomerDetail />} />
```

Register `new` before `:customerId` so React Router matches the static segment first.

### Debounced Search

```
const [search, setSearch] = useState('');
const [debouncedSearch] = useDebouncedValue(search, 150);

const customersQuery = useQuery({
  queryKey: [...queryKeys.customers(businessId), { q: debouncedSearch, active: activeFilter }],
  queryFn: () => fetchCustomers(businessId, debouncedSearch || undefined, activeFilter, 200),
});
```

The search/filter params MUST be in the queryKey — otherwise TanStack Query returns stale results from a different search term. An empty search (no `q` param) returns all customers — do not set `enabled: false` when search is empty.

---

## Test Plan

### CustomerList tests (`front/src/test/pages/CustomerList.test.tsx`)
- Renders customer list with mocked data (name, taxId formatted per type, city, badge)
- Search input updates query (verify debounced behavior)
- Active/inactive SegmentedControl switches filter (verify query param changes)
- Empty state shows CTA button
- Loading state shows spinner
- Error state shows retry button
- Clicking a row navigates to detail page

### CustomerCreate tests (`front/src/test/pages/CustomerCreate.test.tsx`)
- Submit with name only → success → navigates to detail
- Submit with empty name → shows validation error
- Submit with invalid taxId (not 9 digits) → shows validation error
- Submit with invalid ת.ז. checksum → shows "מספר ת.ז. לא תקין"
- Submit with invalid ח.פ. checksum → shows "מספר מזהה לא תקין (ספרת ביקורת)"
- Duplicate taxId (with details) → shows inline error with link to existing customer
- Duplicate taxId (without details) → shows fallback inline error (no link)

### CustomerDetail tests (`front/src/test/pages/CustomerDetail.test.tsx`)
- Loads and displays customer data
- Edit and save → success toast
- Duplicate taxId on edit → shows inline error with link
- Soft delete → confirm modal → success → navigates to list

---

## Acceptance Criteria

- [ ] All three pages guard on `!activeBusiness` (show error StatusCard, no API calls)
- [ ] `/business/customers` — searchable list (name + taxId, debounced 150ms)
- [ ] Each row: name, taxId (formatted per type), city, badges ("עוסק מורשה", "לא פעיל")
- [ ] Clickable rows use `UnstyledButton` with `Link` for accessibility
- [ ] Active/inactive filter via SegmentedControl ("פעילים" omits param, "הכל" sends `active=false`)
- [ ] List passes `limit=200` to API
- [ ] Empty state has CTA: "הוסיפו לקוח ראשון כדי להתחיל ליצור חשבוניות"
- [ ] Empty search shows "לא נמצאו לקוחות"
- [ ] Clicking row navigates to detail page
- [ ] `/business/customers/new` — creation form
  - [ ] Name required with dynamic label per taxIdType
  - [ ] Tax ID type selector (Select, `none` first)
  - [ ] 9-digit taxId validation with `inputMode="numeric"`
  - [ ] Checksum validation for ALL taxIdType values (not just personal_id)
  - [ ] Duplicate taxId shows inline error with existing customer name and link (or fallback if no details)
  - [ ] `isLicensedDealer` toggle shown only when taxId present; auto-resets to false when taxId cleared
  - [ ] Address via `<AddressAutocomplete required={false}>`
  - [ ] Cancel uses explicit `navigate('/business/customers')`, not `navigate(-1)`
  - [ ] Success → redirect to detail page with toast
- [ ] `/business/customers/:id` — detail + edit
  - [ ] Pre-populated form with fetched data (always-edit mode)
  - [ ] `taxIdType` initial value is the actual API value (e.g., `'none'`), not empty string
  - [ ] Duplicate taxId on edit handled same as create (inline error)
  - [ ] Invoice history placeholder section with `Divider labelPosition="center"`
  - [ ] Soft delete with `useDisclosure` + `Modal` (not `modals.openConfirmModal`) → navigate to list
  - [ ] TODO comment for Phase 2: block delete if customer has finalized invoices
- [ ] Cache invalidation: create → list; update → list + detail; delete → list + detail
- [ ] Loading, error, and empty states on all data-fetching components
- [ ] "לקוחות" link in navbar with `active={pathname.startsWith('/business/customers')}`
- [ ] `AddressAutocomplete` updated with `required` prop (default `true`, pass `false` for customer form)
- [ ] Routes registered with `new` before `:customerId` in `App.tsx`
- [ ] All UI text in Hebrew
- [ ] `npm run check` passes

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
