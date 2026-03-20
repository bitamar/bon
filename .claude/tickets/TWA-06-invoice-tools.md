# TWA-06: Invoice Creation Tools

## Status: ⬜ Not started

## Summary

The first set of business tools for the WhatsApp LLM: find customers, create draft invoices, add/remove line items, request confirmation, and finalize. This is the MVP user-facing feature — after this ticket, a user can create a real invoice by chatting. Includes role-based access control: only owners and admins can finalize invoices.

Note: `select_business` and `list_businesses` were moved to TWA-05 (they're needed as soon as the LLM is live for multi-business users).

## Why

Invoice creation is the core product action. If this works well via WhatsApp, every other feature follows the same pattern. This ticket proves the architecture end-to-end.

## Scope

### Tool Definitions

All tools in `api/src/services/whatsapp/tools/invoice-tools.ts`, registered in the WhatsApp plugin's tool registry.

**Business guard**: All tools check `context.businessId` at the start. If null (no active business selected), return `"יש לבחור עסק קודם. השתמשו בכלי select_business."` This prevents any business operation without an active business.

1. **`find_customer`**
   - Description (Hebrew): `"חפש לקוח לפי שם או מספר מזהה"`
   - Input: `{ query: string }`
   - Implementation: Calls existing customer search from customer repository. Verify the actual method name and signature before implementing — the repository likely has `findByBusinessId` with a search parameter or a separate search method.
   - Returns: JSON array of matches: `[{ id, name, taxId, city }]` (max 5 results)
   - Empty results: Returns `"לא נמצאו לקוחות. נסו לחפש עם שם אחר, או צרו לקוח חדש דרך האפליקציה."`

2. **`create_draft_invoice`**
   - Description: `"צור טיוטת חשבונית חדשה"`
   - Input: `{ customerId: string, documentType?: 'tax_invoice' | 'tax_invoice_receipt' | 'receipt' }`
   - Default `documentType`: `'tax_invoice'`
   - Implementation: Calls `createDraft(businessId, { customerId, documentType: input.documentType ?? 'tax_invoice' })` from invoice service. `documentType` is required in `CreateDraftInput` — always pass it explicitly. Check `CreateDraftInput` for any other required fields and set sensible defaults (e.g., `issuedDate: new Date()`, currency, etc.).
   - Returns: `{ invoiceId: string, documentType: string }`
   - Error: Customer not found → return error string

3. **`add_line_item`**
   - Description: `"הוסף פריט לחשבונית"`
   - Input: `{ invoiceId: string, description: string, quantity: number, unitPrice: number, discountPercent?: number }`
   - `unitPrice` is in shekels (not minor units) — convert safely: `Math.round(unitPrice * 100 + Number.EPSILON)` (avoids floating-point rounding issues like `Math.round(1.005 * 100) → 100`)
   - **Hidden fields the tool must auto-set** (NOT exposed to the LLM):
     - `vatRateBasisPoints` — Look up the business's `defaultVatRateBasisPoints` from the business record. Required by `lineItemInputSchema`.
     - `position` — Set to `existingItems.length` (0-indexed). Required by `lineItemInputSchema`.
   - Implementation: Calls `updateDraft(businessId, invoiceId, { items: [...existingItems, newItem] })`
   - **Critical**: `updateDraft` does FULL REPLACEMENT of line items — it deletes ALL existing items and inserts the new array. The tool MUST load existing items first (via `getInvoiceById` or equivalent), map them back to `LineItemInput` format, append the new one, and pass the complete array.
   - Returns: Updated totals: `"נוסף: {description} × {quantity} = ₪{total}\nסה\"כ כולל מע\"מ: ₪{totalInclVat}"`

4. **`remove_line_item`**
   - Description: `"הסר פריט מחשבונית"`
   - Input: `{ invoiceId: string, position: number }`
   - Implementation: Load existing items, filter out the item at `position`, re-index remaining items' positions, call `updateDraft` with the filtered array.
   - Returns: `"הוסר: {description}\nסה\"כ כולל מע\"מ: ₪{totalInclVat}"` or error if position is out of bounds.
   - Without this tool, users would need to start over to fix a mistake — unacceptable UX.

5. **`get_draft_summary`**
   - Description: `"הצג סיכום טיוטת חשבונית"`
   - Input: `{ invoiceId: string }`
   - Implementation: Loads invoice + items from service
   - Returns: Formatted Hebrew summary with customer name, line items (numbered with positions for easy removal), totals

6. **`request_confirmation`**
   - Description: `"בקש אישור מהמשתמש לפני הפקת חשבונית"`
   - Input: `{ invoiceId: string }`
   - Implementation:
     a. Load invoice + items, format summary
     b. Upsert into `whatsapp_pending_actions` with `actionType: 'finalize_invoice'`, `payload: { invoiceId }`, `expiresAt: now + 10 min` (upsert replaces any previous pending action for the same type, per the unique constraint on `(conversationId, actionType)`)
     c. Return the formatted summary + `"\n\nלהפיק? (כן/לא)"`
   - The LLM should call this instead of directly finalizing. The system prompt instructs it to always confirm before irreversible actions.

7. **`finalize_invoice`**
   - Description: `"הפק חשבונית סופית (רק אחרי אישור המשתמש)"`
   - Input: `{ invoiceId: string, vatExemptionReason?: string }`
   - `vatExemptionReason` is required when the invoice has zero VAT and the business is not an exempt dealer. The tool always includes it in the input schema so the LLM can provide it in a follow-up call.
   - Implementation:
     a. **Role check**: If `context.userRole === 'user'` → return `"אין לך הרשאה להפיק חשבוניות. פנה לבעלים או מנהל העסק."` (only `owner` and `admin` can finalize, matching the web app's `requireBusinessRole('owner', 'admin')`)
     b. Check `whatsapp_pending_actions` for a non-expired row with `actionType: 'finalize_invoice'` and matching `invoiceId` in payload **and matching `conversationId`** (prevents cross-conversation action hijacking)
     c. If not found → return `"לא נמצא אישור תקף. יש לבקש אישור מחדש."`
     d. If found → call `finalize(businessId, invoiceId, { vatExemptionReason })` from invoice service
     e. **SHAAM enqueuing**: `finalize()` returns `{ needsAllocation: boolean }` but does NOT enqueue the SHAAM job — that's the caller's responsibility (same pattern as the route handler in `invoices.ts`). If `result.needsAllocation && context.boss`:
        ```typescript
        enqueueShaamAllocation(context.boss, businessId, invoiceId, context.logger);
        ```
     f. Delete the pending action row
     g. Return: `"חשבונית {documentNumber} הופקה בהצלחה! ✓\nסכום: ₪{totalInclVat}"`
   - **VAT exemption handling**: If `finalize()` throws `unprocessableEntity` with code `missing_vat_exemption_reason`, catch it and return: `"החשבונית ללא מע\"מ — נדרשת סיבת פטור. מה הסיבה?"`. The LLM will ask the user, then call `finalize_invoice` again with `vatExemptionReason` set.
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
Result: "חשבונית טיוטה:\nלקוח: דוד לוי\n1. ייעוץ × 3 — ₪1,200\nמע\"מ 17%: ₪204\nסה\"כ: ₪1,404\n\nלהפיק? (כן/לא)"

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
- **User wants to remove an item**: Says "תמחק את השורה הראשונה" → Claude calls `remove_line_item({ invoiceId, position: 0 })`
- **Zero-VAT without reason**: `finalize_invoice` catches the error and asks for the reason; LLM collects it and retries

### Tests

8. **`api/tests/services/whatsapp/tools/invoice-tools.test.ts`**:
   - All tools with null businessId → returns "יש לבחור עסק קודם"
   - `find_customer` — returns matches, handles empty results
   - `create_draft_invoice` — creates draft with correct defaults, returns ID
   - `add_line_item` — converts shekel to minor units safely (test `1.005 * 100`), auto-sets `vatRateBasisPoints` and `position`, appends item
   - `add_line_item` — loads existing items and sends full array (not just the new item)
   - `remove_line_item` — removes correct item, re-indexes positions
   - `remove_line_item` — out of bounds position → returns error
   - `get_draft_summary` — returns formatted summary with numbered items
   - `request_confirmation` — upserts pending action, returns summary
   - `request_confirmation` — replaces existing pending action (same type, same conversation)
   - `finalize_invoice` — with valid pending action → finalizes + enqueues SHAAM if needed
   - `finalize_invoice` — without pending action → returns error
   - `finalize_invoice` — with expired pending action → returns error
   - `finalize_invoice` — pending action from different conversation → returns error
   - `finalize_invoice` — with `role: 'user'` → returns permission error
   - `finalize_invoice` — zero-VAT without exemption reason → returns Hebrew prompt
   - `finalize_invoice` — zero-VAT with exemption reason → succeeds
   - All tests mock repositories/services (no DB, no real invoices)

9. **`api/tests/jobs/handlers/process-whatsapp-message.integration.test.ts`** — Full flow test (mocked Claude client):
   - Simulate Claude returning tool_use for find_customer → create_draft → add_line_item → request_confirmation → text response
   - Verify all messages stored in correct order with correct `llmRole`
   - Verify `send-whatsapp-reply` job enqueued with final text

## Acceptance Criteria

- [ ] All invoice tools reject calls when no active business is selected
- [ ] `finalize_invoice` rejects users with `role: 'user'` (only owner/admin can finalize)
- [ ] `find_customer` searches existing customer repository
- [ ] `create_draft_invoice` creates a draft with all required fields set to sensible defaults
- [ ] `add_line_item` converts shekel input to minor units safely (no floating-point bugs)
- [ ] `add_line_item` auto-sets `vatRateBasisPoints` from business default and `position` from item count
- [ ] `add_line_item` loads existing items and sends full replacement array to `updateDraft`
- [ ] `remove_line_item` removes the correct item and re-indexes positions
- [ ] `request_confirmation` upserts a pending action with 10-minute expiry
- [ ] `finalize_invoice` checks for valid pending action with matching `conversationId` before executing
- [ ] `finalize_invoice` enqueues SHAAM allocation when `needsAllocation` is true
- [ ] `finalize_invoice` accepts `vatExemptionReason` and passes it to `finalize()`
- [ ] `finalize_invoice` without confirmation returns error (not crash)
- [ ] Expired pending actions are rejected
- [ ] Full conversation flow works end-to-end (mocked LLM, real tool execution)
- [ ] All amounts formatted as ₪X,XXX in Hebrew responses
- [ ] `npm run check` passes

## Size

~450 lines production code + ~400 lines tests. Large ticket.

## Dependencies

- TWA-05 (tool loop, registry, and business selection tools)
