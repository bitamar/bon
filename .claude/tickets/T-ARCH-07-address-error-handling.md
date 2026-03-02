# T-ARCH-07 — Address API Error Handling

**Status**: ✅ Done
**Phase**: Cross-cutting (UX)
**Requires**: Nothing
**Blocks**: Nothing
**Priority**: Low — small fix, can be done any time

---

## What & Why

The address API module (`front/src/api/address.ts`) silently returns `[]` on fetch failure. Users see empty dropdowns with no error feedback — they can't distinguish "no results" from "API is down" (`data.gov.il` availability is not 100%).

---

## Fix

1. Return an `{ data, error }` object instead of just data
2. Show a subtle warning under the address fields when the API is unreachable
3. Allow manual text input as fallback when the API is down (address autocomplete degrades to free text)

---

## Acceptance Criteria

- [ ] When `data.gov.il` is unreachable, the city Combobox shows a warning message
- [ ] Users can still type an address manually when autocomplete is unavailable
- [ ] When the API recovers, autocomplete resumes working
- [ ] `npm run check` passes

---

## Scope

~2-3 files changed. Small fix.

---

## Links

- Branch: —
- PR: —
- Deployed: ⬜
