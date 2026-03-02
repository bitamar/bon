# BON - Israeli Invoicing Platform

## Project Plan
The build plan is in `.claude/PLAN.md`. All agents should read it for context on feature scope and build order.

The full development workflow (ticket lifecycle, deployment gates, agent rules) is in `.claude/WORKFLOW.md`. Read it before starting any task.

Rules learned from SonarQube, CodeRabbit, and human code reviews are in `.claude/REVIEW_RULES.md`. **Read it before writing or modifying tests.** When a reviewer flags a new pattern, add it to that file so it never recurs.

## One Ticket at a Time — Merge Gate

**This is the most important rule in this file.**

Never start work on ticket N+1 until ticket N is merged to main.

"Tests pass" is not done. **Merged to main** is done.

If you see in-progress work on a feature that hasn't shipped yet, complete it first. Do not autonomously move on to the next phase. After finishing a step, report what you did and wait for confirmation before proceeding.

## Project Vision

BON is a B2B2C invoicing platform for the Israeli market. Businesses (B2B) use BON to create, manage, and send tax-compliant invoices to their customers (B2C). The platform integrates with Israel's SHAAM (שע"מ) system for tax authority compliance and supports all Israeli invoicing regulations.

The name "bon" means receipt/invoice.

## Architecture

### Monorepo Structure

```
bon/
├── api/          # Fastify 5 backend (Node.js, TypeScript)
├── front/        # React 19 frontend (Vite, Mantine 8)
├── types/        # Shared Zod schemas and TypeScript types
└── package.json  # npm workspaces root
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Fastify 5, TypeScript 5.9, Node 22 |
| Frontend | React 19, Vite 7, Mantine 8, TanStack Query |
| Database | PostgreSQL 16, Drizzle ORM |
| Auth | Google OAuth2/OIDC (openid-client, jose) |
| Validation | Zod 4 (shared between API and frontend) |
| Testing | Vitest, pg-mem (in-memory PG for API tests), jsdom (frontend) |
| Code Quality | ESLint 9 (flat config), Prettier |

### Key Architectural Patterns

- **Repository Pattern**: Data access through repository classes (e.g., `api/src/repositories/user-repository.ts`)
- **Service Layer**: Business logic in service classes (e.g., `api/src/services/user-service.ts`)
- **Fastify Plugins**: Cross-cutting concerns as plugins (`api/src/plugins/`)
- **Zod at Boundaries**: All API request/response validation uses Zod schemas from the `types` package
- **React Query for Server State**: All API data fetched/cached via TanStack Query
- **Auth Context**: Authentication state managed via React Context (`front/src/auth/AuthContext.tsx`)

## Domain Context: Israeli Invoicing

### SHAAM (שע"מ) Integration
- SHAAM is Israel Tax Authority's electronic invoicing system
- Invoices above certain thresholds must be reported to SHAAM for allocation numbers
- The platform must validate invoice data against SHAAM requirements before submission

### Israeli Tax Rules
- VAT rate: 17% (standard), 0% (exempt transactions)
- Invoice types: חשבונית מס (Tax Invoice), חשבונית מס קבלה (Tax Invoice Receipt), קבלה (Receipt)
- Required fields: Business registration number (ח.פ./ע.מ.), invoice sequential number, date, VAT breakdown
- Currency: ILS (₪) primary, USD/EUR supported
- RTL layout support is already configured (stylis-plugin-rtl)

### Multi-Tenant Model
- Each business is a tenant
- Users can belong to multiple businesses
- Data isolation between tenants at the database level

## Development

### Prerequisites
- Node.js >= 22.12.0
- PostgreSQL 16 running locally (port 5433 for dev, 5432 for test)

### Commands

```bash
# Root
npm run check          # Full CI check (format, lint, type-check, test for all workspaces)
npm run format         # Format all code

# API
npm run dev -w api     # Start dev server (watch mode)
npm run test -w api    # Run tests
npm run db:generate -w api  # Generate Drizzle migrations
npm run db:migrate -w api   # Apply migrations

# Frontend
npm run dev -w front   # Start Vite dev server (port 5173)
npm run test -w front  # Run tests
npm run build -w front # Build for production
```

### Database
- Dev: `postgres://postgres:postgres@localhost:5433/bon_dev`
- Test: Uses pg-mem (in-memory) — no external DB needed for tests
- Migrations: `api/drizzle/` directory, managed by Drizzle Kit
- Schema: `api/src/db/schema.ts`

### Environment Variables
- API: `api/.env` (PORT, DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_ORIGIN)
- Frontend: `front/.env` (VITE_API_BASE_URL)

## Coding Standards

### Refactoring Philosophy

**There is no backward compatibility requirement.** This is a greenfield product with no external consumers. Rename, restructure, move, or delete anything freely if it makes the code clearer. Prefer the boldest simplification over the most cautious addition.

**Never avoid a refactor because it's large.** The only thing that matters is ending up with the best design. "Deeply embedded," "too many files," or "major change" is never a valid reason to keep a suboptimal pattern. Always propose and execute the best design, regardless of scope.

**When an approach changes, remove the old approach completely — in the same change.** Never leave supporting code from a superseded approach behind. Before writing new code, explicitly ask: *what did the old approach require that the new one does not?* Then remove it:
- Helper functions and utilities added for the old behaviour
- Tests that exercise behaviour that no longer exists in the UI
- Comments and JSDoc that describe the old rationale
- Constants, types, or state variables that only the old approach used

If you added code to work around a limitation (e.g. a filter heuristic for a UI pattern you later replaced with a separate input field), the workaround must be deleted when the limitation disappears — not left as dead code.

**Simple and clear always beats clever and complete.** Three obvious lines beat an abstraction. Delete code you don't need. If a comment is needed to explain *why* something exists, make sure that reason is still true.

### General
- TypeScript strict mode everywhere
- Zod for all validation — define schemas in `types/` package for shared ones
- No `any` types — use `unknown` and narrow with Zod
- ESLint max warnings: 0 (all warnings are errors in CI)
- Prettier: single quotes, trailing commas, 100 char line width
- Code is scanned by SonarQube. Conform to these rules:
  - Use `.some()` for boolean existence checks — never `.find()` when the result is only used as a boolean
  - Mark React component props as `Readonly<>` — always wrap the props type at the usage site, whether it is an inline object type (`Readonly<{ label: string }>`) or a named type/interface (`Readonly<MyProps>`). For class components wrap the first generic: `Component<Readonly<MyProps>, State>`. Never pass a bare type as props.
  - Avoid negated conditions in ternaries — prefer `(cond ? valueIfTrue : valueIfFalse)` over `(!cond ? valueIfFalse : valueIfTrue)`
  - Never use `Math.random()` — use `crypto.randomInt()` or `crypto.randomUUID()` from `node:crypto` instead

### API Conventions
- Routes in `api/src/routes/` — register on the Fastify instance
- Business logic in `api/src/services/` — never in route handlers
- Database access in `api/src/repositories/` — never in services directly via Drizzle
- Errors: throw `AppError` instances (`api/src/lib/app-error.ts`)
- Environment config: validated via Zod in `api/src/env.ts`
- New routes must be registered in `api/src/app.ts`

### Frontend Conventions
- Pages in `front/src/pages/`
- Reusable components in `front/src/components/`
- API calls in dedicated `api.ts` files next to the feature
- Use `useApiMutation` hook for mutations (auto toast + error handling)
- Query keys defined in `front/src/lib/queryKeys.ts`
- Use Mantine components — do not add other UI libraries

### Testing (Non-Negotiable)
- API: Test files in `api/tests/` mirroring `src/` structure
- Frontend: Test files in `front/src/test/` mirroring `src/` structure
- Use `renderWithProviders()` helper for frontend component tests
- API tests use pg-mem — no real database needed
- Always run `npm run check` before considering work complete
- **Every new API route handler must have at least one test**: happy path + one validation/error case
- **Every new form component must have at least one test**: successful submission + one field validation error
- **Every new repository method must have a test**
- Tests are not optional. A PR without tests for new code is incomplete and must be rejected.

### Test DRY — No Duplicated Setup Blocks

SonarQube enforces a duplication threshold. Repeated blocks in tests **will fail the quality gate**.

**Rules:**
- If the same 3+ lines appear in more than one test, extract a named helper function at the top of the `describe` block
- Mock setup that every test in a `describe` needs goes in `beforeEach`, not repeated per test
- Multi-step UI interactions (e.g. select city → select street) must be extracted as named async helpers

**Patterns to extract:**

| Pattern | Extract as |
|---|---|
| `vi.mocked(useBusiness).mockReturnValue(...)` in every test | `beforeEach` default, override per test only when different |
| Route helper: `injectAuthed(app, sessionId, { method, url, payload })` repeated per suite | `async function postThing(sessionId, id, payload)` inside `describe` |
| Multi-step navigation: click type → click next → wait for field | `async function goToStep1(user, type)` |
| City → street selection in autocomplete tests | `async function selectCity(user, name)` + `selectStreet(user, name)` |
| Auth + business setup for non-member scenario | `async function setupNonMember()` returning `{ sessionId, business }` |

**Where to put helpers:** Inside the `describe` block, above the `it` blocks, clearly separated with a comment (`// ── helpers ──`).

### UI Component Patterns
Never use a plain `<input>` or Mantine `TextInput` where a smarter component exists:

| Field type | Mantine component |
|---|---|
| Address (street + city + zip) | Address autocomplete — see pattern below |
| Country | `Select` with a country list |
| Status / category | `Select` or `SegmentedControl` — never free text |
| Date | `DatePickerInput` from `@mantine/dates` — never `TextInput` |
| Phone number | `TextInput` with Israeli format placeholder (`05X-XXXXXXX`) |
| Currency amount | `NumberInput` with `prefix="₪"` and `decimalScale={2}` |
| Search with suggestions | `Autocomplete` or async `Select` with `searchable` |
| Tax ID (ח.פ.) | `TextInput` with `maxLength={9}` and numeric validation |
| Document type | `Select` — never free text |
| Percentage | `NumberInput` with `suffix="%"` and `min`/`max` bounds |

Every interactive component must handle three states explicitly: **loading**, **error**, and **empty**.

### Address Entry Pattern

**Never** render individual free-text inputs for street, city, and zip. Always use `<AddressAutocomplete>` (`front/src/components/AddressAutocomplete.tsx`).

**How it works:**
- Cities (all ~1300) are bulk-fetched once at startup and cached forever. Filtering is instant and client-side.
- Streets for the selected city are bulk-fetched when the city is confirmed and cached for 24 h. Filtering is instant and client-side.
- The API is Israel's open government data: `https://data.gov.il/api/3/action/datastore_search`. No key required. The `q` parameter uses full-text search and cannot match prefixes — **do not use it for filtering**. Always bulk-fetch and filter client-side.

**Field layout (in order):**
1. **עיר / ישוב** — Combobox autocomplete. Street fields are disabled until a city is selected from the dropdown (not just typed).
2. **רחוב** — Combobox autocomplete (same row as מספר בית). Enabled after city selected.
3. **מספר בית** — Short text input on the same row as רחוב. Typed separately so it never interferes with the street dropdown.
4. **דירה / כניסה / קומה** — Optional free-text for apartment, entrance, floor.
5. **מיקוד** — Optional 7-digit postal code.

All five values roll up into the three form fields `city`, `streetAddress`, and `postalCode` that `AddressFormAdapter` exposes. `streetAddress` is `"${streetName} ${houseNumber}, ${aptDetails}"` (parts omitted when blank).

## PR Scope

Each PR must be **small and focused**:
- One feature or one bug fix per PR — not a bundle of related things
- Target: ≤ 10 changed files (excluding generated migrations and test files)
- If a Product requirement is too large for one PR, the Implementer must split it and implement sequentially
- A PR that adds a form must include: the form component + its API hook + at least one test. Nothing more, nothing less.

## Definition of Done

Before a PR is considered complete, **all of these must be true**:

- [ ] `npm run check` passes (zero errors, zero warnings)
- [ ] Every new API route has a test (happy path + one error case)
- [ ] Every new form component has a test (submit + one validation error)
- [ ] All inputs use the correct Mantine component per the UI Component Patterns table
- [ ] All interactive components show loading, error, and empty states
- [ ] No `TextInput` is used where `Autocomplete`, `Select`, `NumberInput`, or `DatePickerInput` is appropriate
- [ ] No business logic in route handlers; no DB calls in services directly
- [ ] Types are defined in `types/` if shared between API and frontend

The **Reviewer** must check every item above and reject the PR if any are missing. The Reviewer may fix trivial issues (formatting, a missing `min` prop) directly but must **not** write missing tests or missing loading states — those must come back to the Implementer.

## Agent Team Roles

Pipeline: **Product → Architect + UI Designer (parallel) → Implementer → Reviewer**

- **Product** (sonnet): Define user stories, edge cases, validation rules, UX flows. Consider Israeli invoicing regulations and SHAAM requirements. Keep scope tight — one feature at a time. Output: detailed requirements with acceptance criteria.
- **Architect** (opus): Design data models (Drizzle schema), API contracts (Zod schemas in `types/`), integration points. Can run `db:generate` for migrations. Output: schema definitions, route signatures, service interfaces.
- **UI Designer** (sonnet): Design component layouts using the UI Component Patterns table. Specify the exact Mantine component for every field — never leave the choice to the Implementer. Specify loading/error/empty state behavior explicitly. Runs in parallel with Architect. Output: component tree specs for the Implementer.
- **Implementer** (sonnet): Build features following the Architect's design and UI Designer's specs exactly. Write tests (mandatory, see Definition of Done). Follow existing code style. Must pass `npm run check`. If the scope is too large for one PR, stop and ask before proceeding.
- **Reviewer** (sonnet): Use the Definition of Done checklist to gate every PR. Run `npm run check`. Fix only trivial issues (a missing prop, formatting). Reject the PR with specific feedback if tests are missing, wrong input components are used, or loading/error/empty states are absent.
