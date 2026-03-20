# TWA-06: Invoice Creation Tools

## Status: ⬜ Not started

## Summary

The first set of business tools for the WhatsApp LLM: business selection, find customers, create draft invoices, add line items, request confirmation, and finalize. This is the MVP user-facing feature — after this ticket, a user can create a real invoice by chatting. Includes role-based access control: only owners and admins can finalize invoices.

## Why

Invoice creation is the core product action. If this works well via WhatsApp, every other feature follows the same pattern. This ticket proves the architecture end-to-end.

## Scope

### Tool Definitions

Tools split across two files:
- `api/src/services/whatsapp/tools/business-tools.ts` — `select_business` (shared, not invoice-specific)
- `api/src/services/whatsapp/tools/invoice-tools.ts` — all invoice tools

Both registered in the WhatsApp plugin's tool registry.

0. **`select_business`** (in `business-tools.ts`)
   - Description: `"בחר עסק פעיל (כשהמשתמש שייך ליותר מעסק אחד)"`
   - Input: `{ businessId: string }`
   - Implementation:
     a. Verify user is a member of this business (query `user_businesses` with `context.userId` + `input.businessId`)
     b. If not a member → return `"אין לך גישה לעסק זה."`
     c. Update `conversation.activeBusinessId` via `updateActiveBusiness(conversationId, businessId)`
     d. Return business name + role: `"עסק פעיל: {businessName} (תפקיד: {role})"`
   - The LLM calls this when the user has multiple businesses and `activeBusinessId` is null, or when the user says "עבור לעסק X"
   - **Also register a helper tool `list_businesses`**:
     - Description: `"הצג רשימת העסקים שלי"`
     - Input: `{}` (no input)
     - Implementation: Query `user_businesses` by `context.userId`, join with `businesses` to get names
     - Returns: Numbered list: `"1. עסק א (בעלים)\n2. עסק ב (מנהל)"`

**Business guard**: All tools below (1–6) check `context.businessId` at the start. If null (no active business selected), return `"יש לבחור עסק קודם. השתמשו בכלי select_business."` This prevents any business operation without an active business.

1. **`find_customer`**
   - Description (Hebrew): `"חפש לקוח לפי שם או מספר מזהה"`
   - Input: `{ query: string }`
   - Implementation: Calls existing `searchCustomers(businessId, query)` from customer repository
   - Returns: JSON array of matches: `[{ id, name, taxId, city }]` (max 5 results)
   - Empty results: Returns `"לא נמצאו לקוחות. נסו לחפש עם שם אחר, או צרו לקוח חדש דרך האפליקציה."` (no `create_customer` tool exists in this scope — don't reference it)

2. **`create_draft_invoice`**
   - Description: `"צור טיוטת חשבונית חדשה"`
   - Input: `{ customerId: string, documentType?: 'tax_invoice' | 'tax_invoice_receipt' | 'receipt' }`
   - Default `documentType`: `'tax_invoice'`
   - Implementation: Calls `createDraft(businessId, { customerId, documentType: input.documentType ?? 'tax_invoice' })` from invoice service. Note: `documentType` is required in `CreateDraftInput` — always pass it explicitly.
   - Returns: `{ invoiceId: string, documentType: string }`
   - Error: Customer not found → return error string

3. **`add_line_item`**
   - Description: `"הוסף פריט לחשבונית"`
   - Input: `{ invoiceId: string, description: string, quantity: number, unitPrice: number, discountPercent?: number }`
   - `unitPrice` is in shekels (not minor units) — the tool converts: `Math.round(unitPrice * 100)`
   - **Hidden fields the tool must auto-set** (NOT exposed to the LLM):
     - `vatRateBasisPoints` — Look up the business's `defaultVatRateBasisPoints` from the business record. Required by `lineItemInputSchema`.
     - `position` — Set to `existingItems.length` (0-indexed). Required by `lineItemInputSchema`.
   - Implementation: Calls `updateDraft(businessId, invoiceId, { items: [...existingItems, newItem] })`
   - **Critical**: `updateDraft` does FULL REPLACEMENT of line items — it deletes ALL existing items and inserts the new array. The tool MUST load existing items first (via `getInvoiceById` or equivalent), map them back to `LineItemInput` format, append the new one, and pass the complete array.
   - Returns: Updated totals: `"נוסף: {description} × {quantity} = ₪{total}\nסה\"כ כולל מע\"מ: ₪{totalInclVat}"`

4. **`get_draft_summary`**
   - Description: `"הצג סיכום טיוטת חשבונית"`
   - Input: `{ invoiceId: string }`
   - Implementation: Loads invoice + items from service
   - Returns: Formatted Hebrew summary with customer name, line items, totals

5. **`request_confirmation`**
   - Description: `"בקש אישור מהמשתמש לפני הפקת חשבונית"`
   - Input: `{ invoiceId: string }`
   - Implementation:
     a. Load invoice + items, format summary
     b. Insert into `whatsapp_pending_actions` with `actionType: 'finalize_invoice'`, `payload: { invoiceId }`, `expiresAt: now + 10 min`
     c. Return the formatted summary + `"\n\nלהפיק? (כן/לא)"`
   - The LLM should call this instead of directly finalizing. The system prompt instructs it to always confirm before irreversible actions.

6. **`finalize_invoice`**
   - Description: `"הפק חשבונית סופית (רק אחרי אישור המשתמש)"`
   - Input: `{ invoiceId: string }`
   - Implementation:
     a. **Role check**: If `context.userRole === 'user'` → return `"אין לך הרשאה להפיק חשבוניות. פנה לבעלים או מנהל העסק."` (only `owner` and `admin` can finalize, matching the web app's `requireBusinessRole('owner', 'admin')`)
     b. Check `whatsapp_pending_actions` for a non-expired row with `actionType: 'finalize_invoice'` and matching `invoiceId` in payload
     c. If not found → return `"לא נמצא אישור תקף. יש לבקש אישור מחדש."`
     d. If found → call `finalize(businessId, invoiceId, {})` from invoice service
     d. **SHAAM enqueuing**: `finalize()` returns `{ needsAllocation: boolean }` but does NOT enqueue the SHAAM job — that's the caller's responsibility (same pattern as the route handler in `invoices.ts`). If `result.needsAllocation && boss`:
        ```typescript
        enqueueShaamAllocation(boss, businessId, invoiceId, logger);
        ```
        The tool handler needs access to `boss` via `ToolContext` (extend `ToolContext` to include `boss?: PgBoss`).
     e. Delete the pending action row
     f. Return: `"חשבונית {documentNumber} הופקה בהצלחה! ✓\nסכום: ₪{totalInclVat}"`
   - **VAT exemption edge case**: If the invoice has zero VAT and the business is not an exempt dealer, `finalize()` throws `unprocessableEntity` with code `missing_vat_exemption_reason`. The tool should catch this specific error and return a Hebrew message asking the user for the reason: `"החשבונית ללא מע\"מ — נדרשת סיבת פטור. מה הסיבה?"` Then re-finalize with the reason in a follow-up call. Consider adding `vatExemptionReason?: string` to the tool input.
   - Error from finalize (validation, missing customer, etc.) → return error string in Hebrew

### Confirmation Flow (end-to-end)

```
User: "תעשה חשבונית לדוד לוי על 3 שעות ייעוץ ב-400 שקל"

Claude calls: find_customer({ query: "דוד לוי" })
Result: [{ id: "cust-1", name: "דוד לוי", taxId: "515303055", city: "תל אביב" }]

Claude calls: create_draft_invoice({ customerId: "cust-1" })
Result: { invoiceId: "inv-1", documentType: "tax_invoice" }

Claude calls: add_line_item({ invoiceId: "inv-1", description: "ייעוץ", quantity: 3, unitPrice: 400 })
Result: "נוסף: ייעוץ × 3 = ₪1,200\nסה\"כ כולל מע\"מ: ₪1,404"

Claude calls: request_confirmation({ invoiceId: "inv-1" })
Result: "חשבונית טיוטה:\nלקוח: דוד לוי\n• ייעוץ × 3 — ₪1,200\nמע\"מ 17%: ₪204\nסה\"כ: ₪1,404\n\nלהפיק? (כן/לא)"

Claude sends to user: [the summary above]

User: "כן"

Claude calls: finalize_invoice({ invoiceId: "inv-1" })
Result: "חשבונית INV-0001 הופקה בהצלחה! ✓\nסכום: ₪1,404"

Claude sends to user: "חשבונית INV-0001 הופקה בהצלחה! ✓ סכום: ₪1,404"
```

### Edge Cases

- **Multiple customers match**: Claude presents numbered list, waits for user to pick
- **User says "לא" after confirmation prompt**: Claude discards the pending action (or it expires), draft remains
- **User says "כן" after action expired**: `finalize_invoice` returns error, Claude explains and asks to confirm again
- **User provides ambiguous amounts** ("חמש מאות" vs "500"): Claude parses naturally — the LLM handles Hebrew number words
- **Invoice has no items**: `request_confirmation` returns error — at least one item required
- **User wants to change an item after adding**: They can say "תמחק את השורה הראשונה" — but `remove_line_item` is a future tool. For now Claude explains they can start over by creating a new draft.

### Tests

7. **`api/tests/services/whatsapp/tools/business-tools.test.ts`**:
   - `select_business` — valid member → updates activeBusinessId, returns name + role
   - `select_business` — non-member → returns error
   - `list_businesses` — returns formatted list with roles

8. **`api/tests/services/whatsapp/tools/invoice-tools.test.ts`**:
   - All tools with null businessId → returns "יש לבחור עסק קודם"
   - `find_customer` — returns matches, handles empty results
   - `create_draft_invoice` — creates draft, returns ID
   - `add_line_item` — converts shekel to minor units, auto-sets `vatRateBasisPoints` and `position`, appends item
   - `add_line_item` — loads existing items and sends full array (not just the new item)
   - `request_confirmation` — inserts pending action, returns summary
   - `finalize_invoice` — with valid pending action → finalizes + enqueues SHAAM if needed
   - `finalize_invoice` — without pending action → returns error
   - `finalize_invoice` — with expired pending action → returns error
   - `finalize_invoice` — zero-VAT invoice without exemption reason → returns Hebrew prompt for reason
   - All tests mock repositories/services (no DB, no real invoices)

9. **`api/tests/jobs/handlers/process-whatsapp-message.integration.test.ts`** — Full flow test (mocked Claude client):
   - Simulate Claude returning tool_use for find_customer → tool_use for create_draft → tool_use for add_line_item → tool_use for request_confirmation → text response
   - Verify all messages stored in correct order with correct `llmRole`
   - Verify `send-whatsapp-reply` job enqueued with final text

## Acceptance Criteria

- [ ] `select_business` lets multi-business users pick their active business
- [ ] `select_business` rejects businesses the user is not a member of
- [ ] `list_businesses` shows all user's businesses with roles
- [ ] All business tools reject calls when no active business is selected
- [ ] `finalize_invoice` rejects users with `role: 'user'` (only owner/admin can finalize)
- [ ] `find_customer` searches by name and tax ID
- [ ] `create_draft_invoice` creates a draft via the existing invoice service
- [ ] `add_line_item` converts shekel input to minor units correctly
- [ ] `add_line_item` auto-sets `vatRateBasisPoints` from business default and `position` from item count
- [ ] `add_line_item` loads existing items and sends full replacement array to `updateDraft`
- [ ] `request_confirmation` creates a pending action with 10-minute expiry
- [ ] `finalize_invoice` checks for valid pending action before executing
- [ ] `finalize_invoice` enqueues SHAAM allocation when `needsAllocation` is true
- [ ] `finalize_invoice` handles `missing_vat_exemption_reason` error with Hebrew prompt
- [ ] `finalize_invoice` without confirmation returns error (not crash)
- [ ] Expired pending actions are rejected
- [ ] Full conversation flow works end-to-end (mocked LLM, real tool execution)
- [ ] All amounts formatted as ₪X,XXX in Hebrew responses
- [ ] `npm run check` passes

## Size

~500 lines production code + ~400 lines tests. Large ticket (grew due to business selection + role checks).

## Dependencies

- TWA-05 (tool loop and registry)
