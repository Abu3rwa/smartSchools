# Improvement 1: Testing & Quality

**Category:** Testing & Quality  
**Priority:** P1 (High)  
**Effort:** Medium  

---

## Summary

The codebase currently has no automated test suite (no Jest, Vitest, or similar). Testing relies on manual scripts and ad-hoc verification. This improvement establishes automated tests and CI quality gates.

---

## Current State

- No `*.test.js`, `*.spec.js`, or similar test files
- No Jest, Vitest, Mocha, or other test runner in `package.json`
- Manual scripts exist (e.g. `scripts/test-attendance-reminder.js`, `scripts/diagnose-missing-reminders.js`)
- No CI pipeline (GitHub Actions, etc.) in the repository

---

## Goals

1. Add automated tests for critical backend flows
2. Add automated tests for critical frontend flows
3. Set up a CI pipeline that runs on every push/PR
4. Achieve baseline coverage for high-risk areas (auth, grades, attendance, notifications)

---

## Scope

### Backend Tests

| Area | Scope | Tool |
|------|-------|------|
| Auth | Login, register, JWT validation, token refresh | Jest + Supertest |
| Grades | Create, update, list, permission checks | Jest + Supertest |
| Attendance | Record attendance, reminders, tenant isolation | Jest + Supertest |
| Notifications | Send email flow, Gmail fallback behavior | Jest (with mocks) |
| Controllers | `attendanceTakingReminderController`, `notificationService` helpers | Jest |

### Frontend Tests

| Area | Scope | Tool |
|------|-------|------|
| Auth | Login flow, protected routes, role-based UI | Vitest + React Testing Library |
| Critical pages | Gradebook, Attendance, Dashboard (smoke tests) | Vitest + React Testing Library |

### CI Pipeline

- Run on: `push` to main, `pull_request` to main
- Steps: `npm ci`, lint, backend tests, frontend tests, build
- Block merge if tests or lint fail

---

## Implementation Notes

### Backend

```bash
# Add to package.json (root)
npm install --save-dev jest supertest
```

- Use `jest.config.js` with `"type": "module"` / `testEnvironment: "node"`
- Use `--experimental-vm-modules` if needed for ESM
- Create `__tests__/` or `tests/` directory
- Use a test database (e.g. `MONGODB_URI` with `-test` suffix) or in-memory MongoDB

### Frontend

```bash
# Add to client/package.json
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

- Vitest is already Vite-native; configure in `vite.config.js`
- Add `"test": "vitest"` and `"test:run": "vitest run"` scripts

### CI (GitHub Actions)

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: cd client && npm ci && npm run build
```

---

## Acceptance Criteria

- [ ] At least 3 backend integration tests for auth (login success, login failure, protected route)
- [ ] At least 2 backend integration tests for grades (create, list with tenant scope)
- [ ] At least 1 backend test for attendance reminder logic
- [ ] At least 2 frontend tests for auth flow (login form, redirect when authenticated)
- [ ] CI workflow runs on every PR; failing tests block merge
- [ ] README or CONTRIBUTING mentions how to run tests

---

## Dependencies

- None (can start independently)

---

## References

- [NEXT_DEVELOPMENT_PLAN.md](../../NEXT_DEVELOPMENT_PLAN.md) – Workstream D (quality gates)
- [Jest ESM support](https://jestjs.io/docs/ecmascript-modules)
- [Vitest](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
