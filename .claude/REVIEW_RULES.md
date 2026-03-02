# Review Rules — Learned from CRs

Rules learned from SonarQube, CodeRabbit, and manual code reviews. Read this file before writing or modifying tests to avoid repeating past mistakes.

## SonarQube Rules

### S2004: No functions inside functions (includes `describe` blocks)

**Never** define helper functions inside `describe`, `it`, or any other callback. SonarQube treats `describe(() => { ... })` as a function scope — any `function` or arrow function declared inside it triggers S2004.

**Wrong:**
```ts
describe('MyComponent', () => {
  function setupTest() { /* ... */ }       // ❌ inside describe
  async function doAction() { /* ... */ }  // ❌ inside describe

  it('works', () => { setupTest(); });
});
```

**Right:**
```ts
function setupTest() { /* ... */ }       // ✅ module scope
async function doAction() { /* ... */ }  // ✅ module scope

describe('MyComponent', () => {
  it('works', () => { setupTest(); });
});
```

If a helper references a variable like `vi.fn()`, move that variable to module scope too:
```ts
const mockFn = vi.fn();                   // ✅ module scope
function setupMocks() { mockFn(); }       // ✅ module scope

describe('...', () => {
  beforeEach(() => { vi.resetAllMocks(); });
});
```

### S1128: No duplicate imports

Merge all imports from the same module into a single import statement.

**Wrong:**
```ts
import { useLocation } from 'react-router-dom';
import { Route, Routes } from 'react-router-dom';
```

**Right:**
```ts
import { useLocation, Route, Routes } from 'react-router-dom';
```

## Test Quality Rules (from reviews)

### Assertions must verify behavior, not just render

- A navigation test must verify the destination (e.g., `findByText('target-page')` or check location), not just that the trigger button still exists.
- An error test must verify the error message content, not just that "something rendered".

### Use async queries for async components

- Use `screen.findByRole` / `screen.findByText` (async, retries) instead of `screen.getByRole` (synchronous) when the component fetches data or renders asynchronously.

### Prefer accessible queries over DOM class selectors

- Use `screen.getByRole('status')` over `document.querySelector('[class*="Loader"]')`.
- Add semantic roles (e.g., `role="status"` on loaders) to components when no accessible query exists.

### Negative assertions for branch coverage

- When testing that a branch is NOT taken, add an explicit negative assertion. E.g., when testing a label without city, assert `expect(text).not.toContain('—')` — don't rely solely on a permissive regex that would match both branches.
- When testing that a key (e.g., Tab) does NOT trigger an action, assert the side-effect didn't happen (e.g., location didn't change). A comment like `// should not trigger onClick` without an assertion is insufficient.

## Coverage Requirements

### Mandatory test coverage

- **Every new API route handler**: at least one test — happy path + one validation/error case.
- **Every new form component**: at least one test — successful submission + one field validation error.
- **Every new repository method**: at least one test.

### Test file structure

Test files must mirror the source tree:
- Frontend: `front/src/test/` mirrors `front/src/` (e.g., `src/pages/Foo.tsx` → `src/test/pages/Foo.test.tsx`)
- API: `api/tests/` mirrors `api/src/` (e.g., `src/routes/foo.ts` → `tests/routes/foo.test.ts`)

### Helper extraction rules

All shared test helpers **must** be defined at module scope (not inside `describe` or `it` — see S2004 above). This includes:

- Mock setup functions (e.g., `mockBusinessContext`, `setupDraftMocks`)
- Render wrappers (e.g., `renderWithLocation`, `renderEdit`)
- Multi-step UI interaction helpers (e.g., `selectCity`, `selectStreet`, `openInfoModal`)
- Assertion helpers (e.g., `expectMissingDescriptionValidation`)
- Variables used by helpers (e.g., `const switchBusiness = vi.fn()`)

Use `beforeEach(() => { vi.resetAllMocks(); })` inside `describe` to reset module-scoped mocks between tests.
