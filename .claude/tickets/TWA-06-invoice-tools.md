# TWA-06: Invoice Creation Tools

## Status: ⬜ Not started

## Summary

The first set of business tools for the WhatsApp LLM: find customers, create draft invoices, add line items, request confirmation, and finalize. This is the MVP user-facing feature — after this ticket, a business owner can create a real invoice by chatting.

## Why

Invoice creation is the core product action. If this works well via WhatsApp, every other feature follows the same pattern. This ticket proves the architecture end-to-end.

## Scope

### Tool Definitions

All tools registered in `api/src/services/whatsapp/tools/invoice-tools.ts` and added to the tool registry in the WhatsApp plugin.

1. **`find_customer`**
   - Description (Hebrew): `"חפש לקוח לפי שם או מספר מזהה"`
   - Input: `{ query: string }`
   - Implementation: Calls existing `searchCustomers(businessId, query)` from customer repository
   - Returns: JSON array of matches: `[{ id, name, taxId, city }]` (max 5 results)
   - Empty results: Returns `"לא נמצאו לקוחות. אפשר ליצור לקוח חדש עם הכלי create_customer."` (but `create_customer` is a future tool — for now just say no results)

2. **`create_draft_invoice`**
   - Description: `"צור טיוטת חשבונית חדשה"`
   - Input: `{ customerId: string, documentType?: 'tax_invoice' | 'tax_invoice_receipt' | 'receipt' }`
   - Default `documentType`: `'tax_invoice'`
   - Implementation: Calls `createDraft(businessId, { customerId, documentType })` from invoice service
   - Returns: `{ invoiceId: string, documentType: string }`
   - Error: Customer not found → return error string

3. **`add_line_item`**
   - Description: `"הוסף פריט לחשבונית"`
   - Input: `{ invoiceId: string, description: string, quantity: number, unitPrice: number, discountPercent?: number }`
   - `unitPrice` is in shekels (not minor units) — the tool converts: `Math.round(unitPrice * 100)`
   - Implementation: Calls `updateInvoiceDraft(businessId, invoiceId, { items: [...existingItems, newItem] })`
   - Loads existing items first, appends the new one
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
     a. Check `whatsapp_pending_actions` for a non-expired row with `actionType: 'finalize_invoice'` and matching `invoiceId` in payload
     b. If not found → return `"לא נמצא אישור תקף. יש לבקש אישור מחדש."`
     c. If found → call `finalize(businessId, invoiceId, {})` from invoice service
     d. Delete the pending action row
     e. Return: `"חשבונית {documentNumber} הופקה בהצלחה! ✓\nסכום: ₪{totalInclVat}"`
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

7. **`api/tests/services/whatsapp/tools/invoice-tools.test.ts`**:
   - `find_customer` — returns matches, handles empty results
   - `create_draft_invoice` — creates draft, returns ID
   - `add_line_item` — converts shekel to minor units, appends item
   - `request_confirmation` — inserts pending action, returns summary
   - `finalize_invoice` — with valid pending action → finalizes
   - `finalize_invoice` — without pending action → returns error
   - `finalize_invoice` — with expired pending action → returns error
   - All tests mock repositories/services (no DB, no real invoices)

8. **`api/tests/jobs/handlers/process-whatsapp-message.integration.test.ts`** — Full flow test (mocked Claude client):
   - Simulate Claude returning tool_use for find_customer → tool_use for create_draft → tool_use for add_line_item → tool_use for request_confirmation → text response
   - Verify all messages stored in correct order with correct `llmRole`
   - Verify `send-whatsapp-reply` job enqueued with final text

## Acceptance Criteria

- [ ] `find_customer` searches by name and tax ID
- [ ] `create_draft_invoice` creates a draft via the existing invoice service
- [ ] `add_line_item` converts shekel input to minor units correctly
- [ ] `request_confirmation` creates a pending action with 10-minute expiry
- [ ] `finalize_invoice` checks for valid pending action before executing
- [ ] `finalize_invoice` without confirmation returns error (not crash)
- [ ] Expired pending actions are rejected
- [ ] Full conversation flow works end-to-end (mocked LLM, real tool execution)
- [ ] All amounts formatted as ₪X,XXX in Hebrew responses
- [ ] `npm run check` passes

## Size

~400 lines production code + ~300 lines tests. Large ticket.

## Dependencies

- TWA-05 (tool loop and registry)
