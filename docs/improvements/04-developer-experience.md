# Improvement 4: Developer Experience

**Category:** Developer Experience  
**Priority:** P4 (Medium)  
**Effort:** Low–Medium  

---

## Summary

Improve onboarding, documentation, and consistency for developers working on the GradeBook codebase. Focus on environment setup, API documentation, and subscription model alignment.

---

## Current State

- No root README with setup instructions
- `.env.example` exists but may not cover all variables (e.g. `RUN_SUBSTITUTION_EXPIRY_JOB`)
- No OpenAPI/Swagger or similar API documentation
- Subscription plan naming inconsistency:
  - `School.subscription.plan`: `starter | growth | enterprise`
  - `Subscription.plan`: `starter | professional | enterprise`
- `config/validateEnv.js` validates required vars; optional vars only produce warnings

---

## Goals

1. Provide clear setup and run instructions
2. Document public API endpoints
3. Unify subscription plan names and add migration path
4. Improve env validation and developer feedback

---

## Scope

### 1. README & Setup

**Root README.md (create or expand):**
- Project description
- Prerequisites (Node 18+, MongoDB)
- Clone, install, `.env` setup
- How to run dev server (backend + client)
- How to run tests (once added)
- How to run seed data
- Link to `.env.example` and docs

### 2. Environment Validation

**Extend `config/validateEnv.js`:**
- Add `RUN_SUBSTITUTION_EXPIRY_JOB` to optional vars (if used)
- Consider validating `CLIENT_URL` format when set
- Print friendly message when required vars are missing (e.g. "Set MONGODB_URI in .env")

**Extend `.env.example`:**
- Add `RUN_ATTENDANCE_REMINDER_JOB`
- Add `RUN_NEWSLETTER_ISSUE_SCHEDULER`
- Add `RUN_SUBSTITUTION_EXPIRY_JOB`
- Add comments for production vs development

### 3. API Documentation

**Options:**
- **OpenAPI 3.x** – Define spec manually or generate from routes
- **Swagger UI** – Serve interactive docs at `/api/docs`
- **JSDoc + TypeDoc** – Generate from existing comments

**Recommended:** Add `swagger-jsdoc` + `swagger-ui-express`:
- Annotate routes with JSDoc OpenAPI tags
- Serve UI at `/api/docs`
- Include auth (Bearer token) in UI for testing

**Priority endpoints to document:**
- Auth: login, register, refresh
- Grades: CRUD, bulk
- Attendance: record, list
- Students: CRUD
- Notifications: run reminder, get reminders

### 4. Subscription Model Unification

**Problem:** `School.subscription.plan` vs `Subscription.plan` use different values.

**Approach:**
1. Define canonical plan set: `starter`, `growth`, `professional`, `enterprise`
2. Create mapping for legacy values (`professional` ↔ `growth` if they mean the same)
3. Migration script: update existing records to canonical values
4. Add compatibility layer during transition: when reading `School.subscription.plan`, map legacy → canonical
5. Update UI to use canonical names only

**Document in:** `docs/SUBSCRIPTION_PLANS.md`

---

## Implementation Notes

### README Structure

```markdown
# GradeBook Pro
Student Grade Management System

## Prerequisites
- Node.js 18+
- MongoDB 6+

## Quick Start
1. Clone, cd into repo
2. cp .env.example .env
3. Edit .env (MONGODB_URI, JWT_SECRET, etc.)
4. npm install
5. npm run dev
6. cd client && npm install && npm run dev

## API
See [API Documentation](./docs/API.md) or run server and visit /api/docs
```

### Swagger Setup

```javascript
// In server.js or routes/apiDocsRoute.js
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
const spec = swaggerJsdoc(options);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
```

---

## Acceptance Criteria

- [ ] Root README.md exists with setup and run instructions
- [ ] `.env.example` includes all job flags and key production vars
- [ ] `validateEnv` fails fast with clear message when required vars missing
- [ ] OpenAPI/Swagger docs available at `/api/docs` with at least 5 endpoints documented
- [ ] `SUBSCRIPTION_PLANS.md` documents canonical plans and migration path
- [ ] Migration script runnable to normalize existing plan values

---

## Dependencies

- README: None
- Swagger: `swagger-jsdoc`, `swagger-ui-express`
- Migration: None (custom script)

---

## References

- [Swagger JSDoc](https://github.com/Surnet/swagger-jsdoc)
- [Swagger UI Express](https://github.com/scottie1984/swagger-ui-express)
- [NEXT_DEVELOPMENT_PLAN.md](../../NEXT_DEVELOPMENT_PLAN.md) – Workstream C (billing)
