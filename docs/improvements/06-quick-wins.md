# Improvement 6: Quick Wins

**Category:** Quick Wins  
**Priority:** P0 (Start here)  
**Effort:** Low  

---

## Summary

Low-effort, high-impact improvements that can be completed in a few hours. Ideal for bootstrapping quality and reducing technical debt with minimal risk.

---

## List of Quick Wins

### 1. Replace `console.*` with Logger in Production Paths

**Effort:** 1–2 hours  
**Impact:** Consistent, searchable logs; easier debugging in production

**Action:** Replace `console.log`, `console.error`, `console.warn` with `logger.info`, `logger.error`, `logger.warn` in server-side code (exclude scripts used only for local dev).

**Files to prioritize:**
- `services/notificationService.js`
- `services/gmailOAuthService.js`
- `controllers/` (auth, grade, attendance, etc.)

---

### 2. Add `RUN_SUBSTITUTION_EXPIRY_JOB` to Env Validation

**Effort:** 15 minutes  
**Impact:** Consistency; avoids surprise if job is disabled

**Action:** Add `RUN_SUBSTITUTION_EXPIRY_JOB` to `optionalEnvVars` in `config/validateEnv.js` (if not already present). Add to `.env.example` with comment.

---

### 3. Add README with Setup Instructions

**Effort:** 30–60 minutes  
**Impact:** Faster onboarding for new developers

**Action:** Create or expand root `README.md`:
- Project description
- Prerequisites (Node 18+, MongoDB)
- Steps: clone, install, `.env` setup, run dev
- Link to `.env.example`
- Optional: run tests, run seed

---

### 4. Extend `.env.example` with Job Flags

**Effort:** 10 minutes  
**Impact:** Clear documentation of runtime behavior

**Action:** Add to `.env.example`:
```
# Background job toggles (set to "false" to disable)
RUN_ATTENDANCE_REMINDER_JOB=true
RUN_NEWSLETTER_ISSUE_SCHEDULER=true
RUN_SUBSTITUTION_EXPIRY_JOB=true
```

---

### 5. Add Health Check Readiness Endpoint

**Effort:** 20–30 minutes  
**Impact:** Load balancers and orchestrators can route traffic correctly

**Action:** Add `/api/health/ready` that checks MongoDB connection and returns 200/503. Keep existing `/api/health` as liveness or alias.

---

### 6. Add ESLint Rule to Disallow `console.*` in Server Code

**Effort:** 15 minutes  
**Impact:** Prevents regression; enforces use of logger

**Action:** In root ESLint config, add rule for `no-console` for `server/**`, `controllers/**`, `services/**`, etc. Allow in `scripts/` if needed.

---

### 7. Document `skipTenantFilter` Usage

**Effort:** 30–45 minutes  
**Impact:** Security clarity; easier audit

**Action:** Create `docs/TENANT_FILTER_POLICY.md` listing each use of `skipTenantFilter` with:
- File and line (or approximate location)
- Reason (e.g. "super_admin listing all schools", "attendance reminder crosses tenant for lookup")
- Whether it's acceptable or needs refactor

---

### 8. Add Basic Integration Test for Login

**Effort:** 1 hour  
**Impact:** First automated test; foundation for CI

**Action:** Add Jest + Supertest. Write one test: `POST /api/auth/login` with valid credentials returns 200 and token. Run with `npm test`.

---

## Suggested Order

| Order | Item | Cumulative Time |
|-------|------|-----------------|
| 1 | Extend `.env.example` (#4) | 10 min |
| 2 | Add `RUN_SUBSTITUTION_EXPIRY_JOB` to validateEnv (#2) | 15 min |
| 3 | Add health readiness endpoint (#5) | 30 min |
| 4 | Add README (#3) | 45 min |
| 5 | Replace console with logger in 2–3 key files (#1) | 1 hr |
| 6 | ESLint no-console rule (#6) | 15 min |
| 7 | Document skipTenantFilter (#7) | 45 min |
| 8 | Basic login test (#8) | 1 hr |

**Total:** ~4–5 hours for all items.

---

## Acceptance Criteria (Per Item)

- [ ] #1: No `console.*` in `services/notificationService.js`, `gmailOAuthService.js`
- [ ] #2: `RUN_SUBSTITUTION_EXPIRY_JOB` in validateEnv optional list
- [ ] #3: README exists with clone, install, run steps
- [ ] #4: `.env.example` includes all three job flags
- [ ] #5: `/api/health/ready` returns 200 when DB connected, 503 otherwise
- [ ] #6: ESLint config includes no-console for server paths
- [ ] #7: `TENANT_FILTER_POLICY.md` exists with at least 5 usages documented
- [ ] #8: Login integration test passes with `npm test`

---

## References

- [IMPROVEMENTS.md](../IMPROVEMENTS.md) – Main index
- [01-testing-quality.md](./01-testing-quality.md) – Full testing plan
- [02-reliability-operations.md](./02-reliability-operations.md) – Logging, health checks
- [03-security-compliance.md](./03-security-compliance.md) – Tenant isolation
