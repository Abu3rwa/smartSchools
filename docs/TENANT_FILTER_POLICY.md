# Tenant Filter Policy – skipTenantFilter Usage

**Last updated:** 2026-02-15  
**Purpose:** Document all uses of `skipTenantFilter: true` in Mongoose queries for security audit and maintenance.

---

## Overview

The tenant isolation plugin automatically scopes queries by `school` when `req.schoolId` is set. Using `skipTenantFilter: true` bypasses this scope. Every use must be justified and documented.

---

## Documented Usages

### Auth & User Lookup (Pre-Tenant Context)

| File | Location | Reason | Acceptable |
|------|----------|--------|------------|
| `middleware/auth.js` | ~line 27 | User lookup by JWT `id` happens before tenant context; `User` has no school filter for auth | Yes |
| `controllers/authController.js` | ~lines 26, 84, 353 | Login/register: find user by email across all schools (email is globally unique for login) | Yes |
| `controllers/teacherController.js` | ~line 123 | Find teacher by email (assignment creation); email may be used across contexts | Yes |
| `controllers/studentController.js` | ~line 586 | Duplicate email check on student creation; must check globally | Yes |
| `routes/schoolRoutes.js` | ~lines 85, 112, 172 | School admin lookup; super_admin or cross-school operations | Yes |
| `routes/userRoutes.js` | ~line 22 | User lookup for platform admin or cross-tenant operations | Yes |

### Cross-Tenant by Design (Background Jobs)

| File | Location | Reason | Acceptable |
|------|----------|--------|------------|
| `controllers/attendanceTakingReminderController.js` | ~lines 87, 130, 142, 341, 349 | Attendance reminder job runs without request context; must query all schools' assignments and attendance | Yes |
| `services/newsletterScheduler.js` | ~line 13 | Newsletter issue creation runs as background job; no tenant context | Yes |
| `services/substitutionExpiryService.js` | ~line 22 | Expire stale substitution requests across all schools | Yes |
| `services/substitutionWorkflowService.js` | ~lines 201, 274, 332 | Substitution workflow needs to look up teachers/requests across tenant boundary | Yes |
| `services/substitutionTokenService.js` | ~lines 58, 100 | Token validation by hash; token is tenant-agnostic identifier | Yes |
| `services/substitutionCandidateService.js` | ~lines 149, 155 | Candidate lookup for substitution; may cross tenant when matching substitutes | Yes |
| `services/substitutionNotificationService.js` | ~line 103 | Notification sending for substitution; finds admins/senders | Yes |

### Admin Fallback & Cross-School Operations

| File | Location | Reason | Acceptable |
|------|----------|--------|------------|
| `services/notificationService.js` | ~line 372 | Find admin with Gmail in same school; `schoolId` is explicit in query, filter bypass needed for plugin | Yes |
| `controllers/substitutionController.js` | ~lines 27, 33, 67 | Teacher/substitute lookup across schools for substitution flow | Yes |
| `controllers/attendanceRequestController.js` | ~lines 21, 38, 47, 147, 167 | Attendance request flow; principals, students, teachers may span context | Yes |
| `controllers/timetableController.js` | ~line 158 | Teacher user lookup for timetable; teacher may be referenced before tenant scope | Yes |

### Scripts (Dev/Test Only)

| File | Location | Reason | Acceptable |
|------|----------|--------|------------|
| `scripts/*.js` | Various | Test and diagnostic scripts run outside request context; need full DB access | Yes (scripts only) |
| `seeds/seedData.js` | ~line 24 | Seed runs without request context | Yes |

### Model Implementation

| File | Location | Reason | Acceptable |
|------|----------|--------|------------|
| `models/User.js` | ~line 147 | Plugin logic: when `skipTenantFilter` is set, do not add tenant scope | Yes (implementation) |
| `middleware/tenantIsolation.js` | ~lines 29, 50, 54 | Documentation and logic for when to skip | Yes (implementation) |

---

## Summary

- **Acceptable:** All documented usages are justified (auth, background jobs, cross-tenant workflows, scripts).
- **No refactor needed** for current usages.
- **When adding new `skipTenantFilter`:** Add entry to this document with file, approximate line, reason, and acceptability.

---

## References

- [scripts/TENANT_ISOLATION_EXPLAINED.md](../scripts/TENANT_ISOLATION_EXPLAINED.md)
- [docs/improvements/03-security-compliance.md](improvements/03-security-compliance.md)
