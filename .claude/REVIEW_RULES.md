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

## CodeRabbit Rules

### Prefer optional chaining over `&&` property access

When accessing a property that is guarded by a null check on the same object, use optional chaining (`?.`) instead of `&&`.

**Wrong:**
```ts
if (foo && foo.bar.length === 0) { ... }
const x = obj && obj.prop;
```

**Right:**
```ts
if (foo?.bar.length === 0) { ... }
const x = obj?.prop;
```

Note: when the falsy case needs a different value (not `undefined`), a ternary is still correct:
```ts
// ✅ ternary needed — we want 0, not undefined
const total = data ? Math.ceil(data.count / PAGE_SIZE) : 0;
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

## Error Handling Rules

### Wrap raw errors in AppError at system boundaries

Never rethrow raw filesystem, network, or third-party errors. Wrap them in `AppError` with a clear message and the original error as `cause`. This normalizes all errors to a consistent shape for the error handler.

**Wrong:**
```ts
} catch (err: unknown) {
  throw err;  // ❌ raw FS/network error leaks
}
```

**Right:**
```ts
} catch (err: unknown) {
  throw new AppError({
    statusCode: 500,
    code: 'storage_read_error',
    message: 'Failed to read storage file',
    cause: err,
  });
}
```

### Make cache reads and writes best-effort

Cache operations (both reads and writes) must not abort a successful or otherwise-valid request. Wrap `storage.get()` and `storage.put()` in try/catch so failures fall through to live generation or still return the generated result.

### Avoid interpolating user data into RegExp

Never use `new RegExp(variable)` where the variable may contain regex metacharacters. Use `String.prototype.includes()` / `expect(...).toContain(...)` or escape the string first.

**Wrong:**
```ts
expect(str).toMatch(new RegExp(`${userValue}.*\\.pdf"`));  // ❌ breaks if userValue has metacharacters
```

**Right:**
```ts
expect(str).toContain(`${userValue}.pdf"`);
```

### Use `String.raw` for regex-heavy strings in tests

When building test assertions or patterns that contain backslashes, prefer `String.raw` to avoid double-escaping.

### Timezone-consistent date/time formatting

When formatting both a date and a time from the same ISO datetime, derive **both** using the same timezone. Never extract the date portion by splitting on `T` (which gives UTC) and then format the time in a local timezone — near UTC midnight these will show different days.

### Fractional percentages: don't truncate with toFixed(0)

When converting basis points (e.g., 1750) to a percentage string, handle fractional percents. `(1750 / 100).toFixed(0)` produces `"18"` (wrong). Check `basisPoints % 100 === 0` and use integer or one-decimal formatting accordingly.

### Puppeteer errors must carry statusCode

Errors thrown in the PDF rendering pipeline must include a `statusCode` property so route handlers can map them to the correct HTTP status. Use `Object.assign(new Error('...'), { statusCode: 503 })` for capacity/availability errors.

### SSRF protection for Puppeteer rendering

When loading HTML content in Puppeteer that may contain user-provided URLs (e.g., `logoUrl` in `<img>`), enable request interception and block requests to internal IP ranges (`10.*`, `172.16-31.*`, `192.168.*`, `127.*`, `169.254.*`, `localhost`), metadata endpoints, and non-HTTPS/HTTP protocols (`file://`, `data://`, `ftp://`).

### Extract repeated mock setup into named helpers

When the same `vi.spyOn(...)` mock setup appears in multiple tests, extract it into a named helper at module scope. If some tests need the spy reference for assertions, the helper should return the spy.

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
