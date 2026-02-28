# T-ARCH-04 — Invoice Form: useForm + Autosave

**Status**: ✅ Complete
**Phase**: Cross-cutting (UX)
**Requires**: T-ARCH-03 merged (routing must be stable before form changes)
**Blocks**: T08-C (finalization flow needs proper form validation/dirty tracking)

---

## What & Why

`InvoiceEdit.tsx` manages form state with raw `useState` and manual `setForm({...form, field: value})` spreading. The project depends on `@mantine/form` but doesn't use it here.

**Current problems:**
1. No per-field validation — only checked at save time in `handleSave()`
2. No dirty tracking — can't warn on unsaved changes
3. No `touched` state — no progressive validation UX
4. No autosave — PLAN.md says "Browser close = draft saved" but this isn't implemented. Users lose work on accidental close.
5. Manual state spreading is error-prone and hard to maintain

---

## Design

### 1. Migrate to `useForm` from `@mantine/form`

Replace the `useState<InvoiceFormValues>` pattern with `useForm()`:

```typescript
const form = useForm<InvoiceFormValues>({
  initialValues: {
    documentType: 'tax_invoice',
    customerId: null,
    invoiceDate: null,
    dueDate: null,
    notes: '',
    internalNotes: '',
    items: [makeEmptyRow(defaultVatRate)],
  },
  validate: {
    items: {
      description: (value, _values, path) => {
        // Only validate if the row has a price (partial row check)
        const index = Number(path.split('.')[1]);
        const item = form.values.items[index];
        return item?.unitPrice > 0 && !value.trim() ? 'נדרש תיאור' : null;
      },
    },
  },
});
```

### 2. Add autosave with debounce and hydration guard

Debounced save (2 seconds after last edit), with an explicit hydration flag to prevent autosave on initial load:

```typescript
// Hydration guard — prevents autosave when form is first populated from server data
const hasHydrated = useRef(false);

// After initial form population (in the query onSuccess or useEffect that sets initial values):
// form.setValues(serverData);
// form.resetDirty();          // marks current values as the "clean" baseline
// hasHydrated.current = true; // only now should autosave be armed

const debouncedSave = useDebouncedCallback(() => {
  if (form.isDirty()) {
    saveMutation.mutate(buildPayload(form.values));
  }
}, 2000);

// Trigger on any form change — only after hydration
useEffect(() => {
  if (hasHydrated.current && form.isDirty()) {
    debouncedSave();
  }
}, [form.values]);
```

**Why the guard is necessary:** Without `hasHydrated`, the `useEffect` on `form.values` fires immediately when the form is first populated from the server (via `form.setValues()`), because `setValues` changes `form.values` and makes the form "dirty" until `resetDirty()` is called. Even with `resetDirty()` in the same tick, React may batch the state updates and fire the effect with the intermediate dirty state. The `hasHydrated` ref ensures the effect is a no-op until the initial population is fully complete.

### 3. Add beforeunload handler

Warn users about unsaved changes:

```typescript
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    if (form.isDirty() && !saveMutation.isPending) {
      e.preventDefault();
    }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [form.isDirty(), saveMutation.isPending]);
```

### 4. Save indicator

Replace the explicit "Save Draft" button with a status indicator:
- "Saved" (green dot) — all changes persisted
- "Saving..." (spinning) — autosave in progress
- "Unsaved changes" (yellow dot) — pending autosave

Keep the explicit save button as well (for users who want certainty), but make it secondary.

---

## Deliverables

### Modified Files (3-4)

| File | Change |
|------|--------|
| `front/src/pages/InvoiceEdit.tsx` | Migrate to `useForm`, add autosave + beforeunload |
| `front/src/test/pages/InvoiceEdit.test.tsx` | Update tests for new form behavior |
| `front/src/components/InvoiceLineItems.tsx` | Accept form props instead of raw arrays |
| `front/src/test/components/InvoiceLineItems.test.tsx` | Update tests |

### Possible New File

| File | Purpose |
|------|---------|
| `front/src/components/SaveIndicator.tsx` | Saved/Saving/Unsaved status component |

---

## Acceptance Criteria

- [x] InvoiceEdit uses `@mantine/form` `useForm()` for state management
- [x] Per-field validation errors display inline (not only at save time)
- [x] Autosave triggers 2 seconds after last edit (only after hydration)
- [x] Autosave does NOT fire on initial form population from server data
- [x] Test: initial load with server data does not trigger a save mutation
- [x] Test: editing a field after hydration triggers autosave after 2s debounce
- [x] `beforeunload` warns about unsaved changes
- [x] Save indicator shows current save status
- [x] Explicit "Save Draft" button still available
- [x] VAT lock logic still works (receipts + exempt dealers → 0% forced)
- [x] All existing InvoiceEdit tests updated and passing
- [x] `npm run check` passes

---

## Notes

- The autosave must NOT fire on initial load — enforced by the `hasHydrated` ref guard (see Design section 2)
- After `form.setValues(serverData)`, call `form.resetDirty()` then set `hasHydrated.current = true` — in that order
- Reset dirty state after successful save (call `form.resetDirty()` in the mutation's `onSuccess`)
- If autosave fails, show error notification and keep the dirty state (user can retry)
- The `beforeunload` event is best-effort — modern browsers limit what you can do. The autosave is the real safety net.

---

## Links

- Branch: `claude/implement-tarch04-q2fKb`
- PR: —
- Deployed: ⬜
