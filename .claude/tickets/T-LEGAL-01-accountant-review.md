# T-LEGAL-01 — Accountant/Legal Review Before Invoice Launch

**Status**: ⬜ Not started
**Phase**: 2 — Invoices (cross-cutting)
**Requires**: Nothing (can start now)
**Blocks**: T06 deployment (soft block — schema can be built, but don't ship to production until these are confirmed)

---

## What & Why

Several design decisions in the invoice schema (T06) have legal/compliance implications that require confirmation from a יועץ מס or רו"ח before shipping to production. The schema is designed around our best understanding of Israeli invoicing regulations, but these specific items have ambiguity that only a tax professional can resolve.

**This is not a blocker for development** — T06 can be built and tested. But these items must be confirmed before the first real invoice is finalized in production.

---

## Items to Verify

### 1. Do חשבונית מס (305) and חשבונית מס קבלה (320) share a numbering sequence?

**Our assumption**: Yes — they share a single sequence. Both are "חשבוניות מס" under ITA rules, and all major Israeli software (Greeninvoice, iCount, Rivhit) uses shared numbering.

**Why it matters**: Our `invoice_sequences` table is keyed by `sequenceGroup` (not `documentType`). 305 and 320 both map to the `tax_document` group and share one counter. If they need separate sequences, we'd need to split the group.

**What to ask**: "האם חשבונית מס (305) וחשבונית מס קבלה (320) חייבות לשתף רצף מספור אחד, או שמותר רצף נפרד לכל סוג?"

### 2. Invoice backdating window

**Our assumption**: Allow up to 30 days in the past (with a warning), reject future dates beyond 7 days.

**Why it matters**: If a business closes a VAT reporting period, invoices backdated into that period create tax reporting complications. The exact window may depend on whether the business reports monthly or bi-monthly.

**What to ask**: "מה חלון הזמן המותר להוצאת חשבונית עם תאריך רטרואקטיבי? האם זה תלוי בסוג הדיווח (חודשי/דו-חודשי)? מה הדין לגבי חשבוניות שתאריכן נופל בתקופת דיווח שכבר נסגרה?"

### 3. Zero-amount invoices

**Our assumption**: Valid — used for pro-bono work, corrections, zero-value deliverables. No SHAAM allocation required (VAT = 0).

**Why it matters**: If zero-amount invoices are not valid, we need to add a validation rule rejecting them on finalization.

**What to ask**: "האם חשבונית מס בסכום 0 (עבודה ללא תשלום) היא מסמך חוקי? האם צריך לדווח אותה לשע״מ?"

### 4. VAT exemption reason codes

**Our assumption**: When a non-exempt business (עוסק מורשה / חברה בע"מ) issues a 0% VAT invoice, we require a `vatExemptionReason` text field explaining why. Common reasons include:
- ייצוא שירותים (§30(a)(5))
- עסקה בינלאומית
- מכירת נדל"ן (§31)
- עסקה פטורה אחרת

**Why it matters**: We need to know if there's a defined list of valid codes the ITA expects, or if free text is acceptable. Some accounting software uses coded values; others use free text.

**What to ask**: "כשעוסק מורשה מוציא חשבונית מס עם מע״מ 0% — האם יש רשימה סגורה של סיבות פטור שהמערכת חייבת להציג? או שמספיק שדה טקסט חופשי?"

### 5. Credit note numbering

**Our assumption**: Credit notes (חשבונית מס זיכוי, type 330) have their own separate numbering sequence with a fixed prefix "ז".

**Why it matters**: Some accountants argue credit notes should share the main invoice sequence (unified numbering). Others say separate is correct.

**What to ask**: "האם חשבונית מס זיכוי (330) חייבת רצף מספור נפרד מחשבוניות מס (305/320)? מה המקובל?"

### 6. Receipt (400) requirements

**Our assumption**: קבלה (type 400) is a simple payment acknowledgment with no VAT. Separate numbering sequence with prefix "ק".

**Why it matters**: Some Israeli businesses use tax_invoice_receipt (320) exclusively and never issue standalone receipts (400). We need to know if receipt support is actually needed for ITA registration, or if it's optional.

**What to ask**: "האם תמיכה בהפקת קבלות (400) היא חובה לצורך אישור נספח ה', או שמספיק לתמוך בחשבונית מס (305) וחשבונית מס קבלה (320)?"

---

## Process

1. Schedule a 30-minute call with יועץ מס or רו"ח
2. Walk through the 6 items above
3. Document answers in this ticket
4. Update T06 schema if any assumptions are wrong (before production deployment)

**Estimated cost**: ₪500–1,500 for a single consultation session.

---

## Answers (fill in after consultation)

### 1. 305+320 shared sequence
**Answer**: —
**Schema impact**: —

### 2. Backdating window
**Answer**: —
**Schema impact**: —

### 3. Zero-amount invoices
**Answer**: —
**Schema impact**: —

### 4. VAT exemption reasons
**Answer**: —
**Schema impact**: —

### 5. Credit note numbering
**Answer**: —
**Schema impact**: —

### 6. Receipt (400) requirements
**Answer**: —
**Schema impact**: —

---

## Links

- Related tickets: T06, T08
- Consultation scheduled: ⬜
- All items confirmed: ⬜
