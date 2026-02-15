# Improvement 3: Security & Compliance

**Category:** Security & Compliance  
**Priority:** P3 (High)  
**Effort:** Medium  

---

## Summary

Strengthen tenant isolation, add audit logging for sensitive actions, and improve API rate limiting to support security reviews and school procurement requirements.

---

## Current State

- Multi-tenant data scoping via `tenantIsolationPlugin` and `req.schoolId`
- `skipTenantFilter: true` used in some queries (e.g. attendance reminders, super_admin flows)
- No centralized audit log for sensitive actions
- Global rate limiters (auth: 20/15min, API: 200/15min, AI: 10/15min)
- No automated tests verifying cross-tenant access is denied

---

## Goals

1. Verify and strengthen tenant isolation
2. Add audit logging for sensitive operations
3. Harden rate limiting on high-risk endpoints
4. Provide evidence for security questionnaires (e.g. SOC 2 prep)

---

## Scope

### 1. Tenant Isolation Verification

**Actions:**
- Audit all `skipTenantFilter` usage; document each with justification
- Add automated tests that attempt cross-tenant access (e.g. School A user accessing School B data)
- Ensure super_admin operations have explicit, documented bypass policy
- Add middleware or helper to enforce tenant scope on all tenant-scoped routes

**High-Risk Areas:**
- Attendance (teacher, period, date)
- Grades
- Students
- Schedules / timetables

### 2. Audit Log Foundation

**Model:** `AuditLog`
- `school`, `userId`, `action`, `resource`, `resourceId`, `oldValue`, `newValue`, `ip`, `userAgent`, `timestamp`

**Actions to Log:**
- User role changes (admin promotes user to teacher, etc.)
- Student create/update/delete
- Grade bulk changes
- Login success/failure (optional, consider PII)
- Subscription/plan changes
- Sensitive settings changes (Gmail connect, etc.)

**Implementation:**
- Create `AuditLog` model and `auditLogService.log()` helper
- Call from controllers after sensitive mutations
- Expose audit log in admin UI (filterable by school, user, action, date)

### 3. Rate Limiting Improvements

**Current:**
- `authLimiter`: 20/15min (login, register)
- `apiLimiter`: 200/15min (all API)
- `aiLimiter`: 10/15min (AI endpoints)

**Proposed:**
- Stricter limit on login: 5/15min per IP
- Stricter limit on report generation: 5/15min per user
- Consider per-user limits for expensive operations
- Add rate limit headers in response (`X-RateLimit-Remaining`, etc.)

### 4. Security Headers & Config

- Verify Helmet configuration for production
- Ensure CORS only allows known origins
- Review JWT expiry and refresh flow
- Ensure no secrets in logs or error responses

---

## Implementation Notes

### Audit Log Helper

```javascript
// services/auditLogService.js
export async function log({ school, userId, action, resource, resourceId, oldValue, newValue, req }) {
  await AuditLog.create({
    school,
    userId,
    action,
    resource,
    resourceId,
    oldValue: oldValue ? sanitize(oldValue) : undefined,
    newValue: newValue ? sanitize(newValue) : undefined,
    ip: req?.ip,
    userAgent: req?.get?.("user-agent"),
  });
}
```

### Cross-Tenant Test Example

```javascript
// __tests__/tenantIsolation.test.js
it("denies teacher from school A access to school B student", async () => {
  const tokenA = await loginAsTeacher(schoolA);
  const res = await request(app)
    .get(`/api/students/${studentFromSchoolB._id}`)
    .set("Authorization", `Bearer ${tokenA}`);
  expect(res.status).toBe(404); // or 403
});
```

---

## Acceptance Criteria

- [ ] All `skipTenantFilter` usages documented with rationale
- [ ] At least 3 automated tests for cross-tenant access denial
- [ ] AuditLog model and service implemented
- [ ] At least 5 sensitive actions logged (role change, student delete, etc.)
- [ ] Audit log viewable in admin UI (filterable)
- [ ] Login endpoint has stricter rate limit (5/15min)
- [ ] Rate limit headers returned where applicable

---

## Dependencies

- Audit log: None
- Tenant tests: Test framework (see 01-testing-quality.md)

---

## References

- [NEXT_DEVELOPMENT_PLAN.md](../../NEXT_DEVELOPMENT_PLAN.md) – Workstream D
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [express-rate-limit](https://github.com/nfriedly/express-rate-limit)
