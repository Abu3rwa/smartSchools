# Tenant Isolation — How It Works

This document explains how GradeBook Pro ensures **one school’s data is never visible to another school’s users** (admins, teachers). It lives in `server/scripts/` so you have a single place to read the full picture.

---

## The problem we solve

- The app is **multi-tenant**: many schools use the same API and database.
- Every important document (Student, Class, Teacher, Grade, etc.) has a `school` field pointing to that school.
- **Risk:** If a query doesn’t filter by `school`, it can return data from *all* schools. An admin of School A could then see School B’s students, grades, etc.
- **Goal:** For every request from an admin or teacher, *all* Mongoose queries must be limited to that user’s school, without relying on each controller to remember to add `school: req.schoolId`.

---

## High-level flow

1. User logs in → JWT is issued, and the **user document** has a `school` field (their school).
2. On each API request, the **auth middleware** (`protect`) runs:
   - Verifies the JWT and loads the user (with `school` populated).
   - Sets `req.schoolId = user.school._id` and `req.school = user.school`.
3. For **non–super_admin** users who have a school, auth then runs the rest of the request **inside a tenant context**:  
   `runInTenantContext(req.schoolId, next)`.
4. Inside that context, **every** Mongoose query (find, findOne, countDocuments, updates, deletes) goes through the **tenant isolation plugin**. The plugin reads the current request’s `schoolId` from that context and adds `{ school: schoolId }` to the query.
5. Result: admins and teachers only ever read/update/delete data for **their** school. Super admins are not run in a tenant context, so they can still use `skipTenantFilter` when they need to work across schools.

---

## Main pieces

### 1. `tenantStore` (AsyncLocalStorage)

**File:** `server/middleware/tenantIsolation.js`

```js
import { AsyncLocalStorage } from 'async_hooks';
export const tenantStore = new AsyncLocalStorage();
```

- **AsyncLocalStorage** is a Node.js API that gives you a **per–request (per–async-flow) storage**.
- When we call `tenantStore.run({ schoolId }, next)`, everything that runs during `next()` (including async code) can call `tenantStore.getStore()` and get `{ schoolId }`.
- Other requests have their own “run” and their own store, so there’s no cross-request leakage.

So: **tenantStore** is the place we attach “current school for this request.”

---

### 2. `runInTenantContext(schoolId, next)`

**File:** `server/middleware/tenantIsolation.js`

```js
export function runInTenantContext(schoolId, next) {
    if (!schoolId) return next();
    tenantStore.run({ schoolId }, next);
}
```

- If there’s no `schoolId`, we just call `next()` and do nothing else.
- Otherwise we run `next()` inside `tenantStore.run({ schoolId }, next)`, so for the rest of this request, `tenantStore.getStore()` returns `{ schoolId }`.

**Who calls it:** Auth middleware (`server/middleware/auth.js`), after setting `req.user` and `req.schoolId`:

```js
if (req.user.role !== 'super_admin' && req.schoolId) {
    return runInTenantContext(req.schoolId, next);
}
next();
```

So every protected request for an admin or teacher (with a school) runs inside this tenant context.

---

### 3. Tenant isolation plugin (Mongoose)

**File:** `server/middleware/tenantIsolation.js`

The plugin is applied to the schemas that are school-scoped (Student, Class, Teacher, Grade, Subject, etc.). It hooks into:

- **Reads:** `find`, `findOne`, `countDocuments`
- **Writes:** `findOneAndUpdate`, `updateOne`, `updateMany`
- **Deletes:** `findOneAndDelete`, `deleteOne`, `deleteMany`

For each of these, it calls `addSchoolFilter(query)`:

```js
function addSchoolFilter(query) {
    if (query.getOptions().skipTenantFilter) return;
    if (query.getQuery().school) return;

    const store = tenantStore.getStore();
    const schoolId = store?.schoolId ?? query.getOptions().schoolId;
    if (schoolId) {
        query.where({ school: schoolId });
    }
}
```

- If the query already has `skipTenantFilter` or already has a `school` condition, we don’t add another one.
- Otherwise we take `schoolId` from:
  1. **Request context:** `tenantStore.getStore()?.schoolId` (set by `runInTenantContext`), or
  2. **Query options:** `query.getOptions().schoolId` (if a controller passed it).
- If we have a `schoolId`, we add `query.where({ school: schoolId })`.

So: **as long as the request was run in tenant context, every such query is automatically limited to that school.** Controllers don’t have to add `school` themselves (but they can still pass `schoolId` in options if they want).

---

## End-to-end example

1. Admin of **School A** logs in. Their user document has `school: <School A _id>`.
2. They call `GET /api/students`. Request hits `protect`:
   - User is loaded, `req.schoolId = School A _id`.
   - Because they’re not super_admin and have a school, auth calls `runInTenantContext(req.schoolId, next)`.
3. The route handler runs inside that context and does `Student.find({})`.
4. Before the query hits the DB, the plugin runs:
   - `tenantStore.getStore()` → `{ schoolId: School A _id }`.
   - Plugin adds `query.where({ school: School A _id })`.
5. The database only sees students for School A. School B’s students are never returned.

So **one school’s admin cannot see another school’s data**, even if a controller forgets to pass `school`.

---

## When to skip the filter (super_admin)

Platform/super_admin code sometimes needs to work across schools (e.g. list all schools, or manage a specific school by ID). To skip the automatic filter for a single query:

```js
Model.find({ ... }).setOptions({ skipTenantFilter: true });
```

Use this only in code that runs for **super_admin** or in scripts that explicitly pass a school. Never use it in normal admin/teacher flows.

---

## Summary table

| Who runs the request | Tenant context? | Queries auto-scoped to |
|----------------------|------------------|-------------------------|
| Admin / Teacher (has school) | Yes (`runInTenantContext`) | Their school only |
| Super admin             | No  | No auto scope; use `skipTenantFilter` or explicit `schoolId` when needed |
| No school on user       | No  | No auto scope (edge case) |

---

## Files to look at

- **`server/middleware/tenantIsolation.js`** — `tenantStore`, `runInTenantContext`, plugin, `addSchoolFilter`, and other tenant helpers.
- **`server/middleware/auth.js`** — Where `runInTenantContext(req.schoolId, next)` is called after `protect`.
- **Models** (e.g. `Student.js`, `Class.js`) — They use `tenantIsolationPlugin` so their queries are scoped.

If you add a new school-scoped model, give it a `school` field and apply the same plugin so it’s automatically isolated.
