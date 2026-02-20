# BON Development Workflow

## Core Principle: One Ticket at a Time

**Never start the next ticket until the current one is deployed.**

"Done" means deployed to production and verified — not "tests pass locally."

---

## Ticket Lifecycle

```
Product → Architect + UI Designer (parallel) → Implementer → Reviewer → Deploy → Next Ticket
```

### 1. Product (before writing any code)
- Define user stories with concrete acceptance criteria
- List edge cases and error states
- Specify Israeli compliance requirements if relevant
- Output: requirements doc or PLAN.md section with checkboxes

### 2. Architect + UI Designer (parallel, before implementation)
- **Architect**: data model changes (Drizzle schema), API contracts (Zod in `types/`), service interfaces
- **UI Designer**: component tree, Mantine component choices, RTL layout, interactions
- These run in parallel to save time
- Implementation must NOT start until both are done

### 3. Implementer
- Follow Architect's design and UI Designer's specs exactly
- Write tests alongside code (not after)
- Run `npm run check` before declaring done
- Must pass: format + lint + type-check + test for ALL workspaces

### 4. Reviewer
- Verify against Product requirements (check off acceptance criteria)
- Verify against Architect design
- Verify against UI Designer specs
- Can make trivial fixes directly; send back for significant issues

### 5. Deploy
- Merge to main
- Deploy to production
- Verify in production (not just on localhost)

### 6. Only Then: Next Ticket

---

## What "Complete" Means

A ticket is complete when ALL of the following are true:

- [ ] All acceptance criteria checked off (from Product spec)
- [ ] `npm run check` passes (format + lint + type-check + test)
- [ ] Code reviewed and approved
- [ ] Merged to main
- [ ] **Deployed to production and verified**

Tests passing locally is necessary but not sufficient.

---

## Agent Work Rules

### Before Starting Work
1. Read `.claude/PLAN.md` to understand the build order and current status
2. Identify which ticket is currently in progress
3. If any ticket is not yet deployed, **complete it first** — do not jump ahead

### During Implementation
- Never implement ticket N+1 while ticket N is still in progress
- Run `npm run check` before reporting work as done
- After completing a step, **report back and wait for human confirmation** before proceeding to the next step
- Do not autonomously chain: "Implementer done → Reviewer done → move on"

### Reporting Progress
- Be specific: "X is implemented and all tests pass. Ready for review."
- Do not say "done" when you mean "tests pass locally"
- Flag blockers clearly; don't silently work around them

### Git Discipline
- **Always branch from an up-to-date `main`**: `git fetch origin && git checkout -b my-branch origin/main`
- One feature per branch; keep commits small and focused
- Never work on a branch that has diverged from main — rebase or start fresh before opening a PR
- Do not commit customer management code on an onboarding branch
- Do not commit onboarding fixes on a customer management branch

---

## Ticket Board

The full ticket list with status, acceptance criteria, and architecture notes is in `.claude/tickets/`.

Start with `.claude/tickets/README.md` for the overview and current status.

**Currently in progress**: T03 (Onboarding UX) + T04 (Customer Backend) on branch `onboarding-steps`

**Blocked until deployed**: T05 (Customer Frontend) and everything after it.
