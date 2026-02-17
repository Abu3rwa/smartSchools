# Roles & Permissions – Flexible Staff Assignments

**Status:** Design / Ready for Implementation  
**Last updated:** 2026-02-17  
**Priority:** High  
**Estimated effort:** 3-5 days (Option A) / 7-10 days (Option B)

---

## Executive Summary

This plan addresses the need for **granular staff responsibilities** beyond the current single-role model. We propose two approaches: adding predefined roles (quick win) or implementing a flexible permission system (scalable long-term). The recommendation is to start with Option A for immediate needs, with a clear migration path to Option B when complexity warrants it.

---

## The Problem

### Current State

- **Roles** are a single value per user: `super_admin`, `admin`, `department_principal`, `teacher`, `parent`, `student`.
- **Admins can already assign roles** to any user in their school (School Settings → Users & roles): admin, department_principal, teacher, parent, student.
- There is only one "assistant-like" role: **department_principal** (scoped to one department).
- **Authorization** is role-based: `authorize('admin', 'teacher')` middleware checks.

### Desired State

- **Multiple staff with different responsibilities**, not only "teacher" or "department principal". For example:
  - **Person A** – manages attendance reminders only (no teaching, no full admin).
  - **Person B** – reviews/checks lesson plans of other teachers (curriculum QA).
  - **Person C** – coordinates substitutions (similar to department_principal but for subs).
  - **Person D** – manages school events and calendar (event coordinator).
  - **Person E** – views reports only (data analyst, no editing).
- Admin should be able to **assign these responsibilities** to users (and change them over time) without creating a new "role" for every new task.
- **Audit trail**: Track who assigned what role/permission to whom and when.

### Gap Analysis

**Missing capabilities:**
- **Granular responsibilities** (who can do what) while keeping the model simple and admin-friendly.
- **Mixed responsibilities**: One person handling multiple specialized tasks.
- **Read-only access**: Staff who need visibility but not editing rights.
- **Department/scope constraints**: Limiting certain roles to specific departments or classes.
- **Temporary assignments**: Ability to assign roles for a limited time period.

---

## Two design directions

### Option A: Add more predefined roles

#### Proposed New Roles

1. **`attendance_manager`**
   - **Access:** Attendance reminders configuration, attendance reports (read-only or full)
   - **Scope:** School-wide
   - **Use case:** Administrative staff managing daily attendance tracking

2. **`lesson_plan_reviewer`**
   - **Access:** View all lesson plans, add review comments/approval status
   - **Scope:** School-wide or department-specific (optional)
   - **Use case:** Curriculum coordinators, instructional coaches

3. **`substitution_coordinator`**
   - **Access:** View teacher schedules, assign substitutes, manage substitute requests
   - **Scope:** School-wide or department-specific
   - **Use case:** Staff managing teacher absences and coverage

4. **`event_coordinator`**
   - **Access:** Create/edit school events, manage calendar, send event notifications
   - **Scope:** School-wide
   - **Use case:** Activities director, event planners

5. **`report_viewer`**
   - **Access:** Read-only access to all reports (attendance, grades, analytics)
   - **Scope:** School-wide
   - **Use case:** Data analysts, administrators who need visibility without editing

#### Technical Implementation

- **Database:** Extend `role` enum in User model/schema
- **Authorization:** Reuse existing `authorize('admin', 'attendance_manager')` pattern
- **Sidebar:** Role-based navigation (show relevant menu items per role)
- **Backward compatibility:** Existing roles continue to work unchanged

#### Pros & Cons

**Pros:**
- ✅ Simple implementation (1-2 days per role)
- ✅ No new concepts or architecture changes
- ✅ Reuses existing authorization middleware
- ✅ Easy to understand for admins
- ✅ Type-safe (enum-based)
- ✅ No migration complexity

**Cons:**
- ❌ Every new responsibility = new role
- ❌ Role list can grow (10+ roles)
- ❌ Can't mix responsibilities (one role per user)
- ❌ More `authorize(...)` lists to maintain
- ❌ Harder to create custom combinations

**Best for:** A small, fixed set of "job types" (3–7 assistant types) that won't change often and don't need to be combined.

---

### Option B: Base role + permissions (capabilities)

#### Architecture

**Base Roles** (describes user type):
- `super_admin` – full system access
- `admin` – full school access
- `staff` – school employee (non-teaching)
- `teacher` – teaching staff
- `student` – enrolled student
- `parent` – parent/guardian

**Permissions** (granular capabilities):
```typescript
type Permission = 
  | 'manage_attendance_reminders'
  | 'view_attendance_reports'
  | 'review_lesson_plans'
  | 'edit_lesson_plans'
  | 'manage_substitutions'
  | 'manage_events'
  | 'view_all_reports'
  | 'manage_users'
  | 'view_grades'
  | 'edit_grades'
  | 'send_notifications'
  | 'manage_departments';

interface User {
  role: BaseRole;
  permissions?: Permission[];
  permissionScopes?: {
    [key: Permission]: {
      departmentIds?: string[];
      classIds?: string[];
      expiresAt?: Date;
    }
  };
}
```

#### Authorization Strategy

**Middleware approach:**
```typescript
// New middleware
requirePermission('manage_attendance_reminders')

// Or combined
authorizeWithPermission(['admin'], ['manage_attendance_reminders'])

// Helper function
function hasPermission(user: User, permission: Permission): boolean {
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  return user.permissions?.includes(permission) ?? false;
}
```

#### Admin UI

**User Edit Screen:**
```
Role: [Staff ▼]

Permissions:
☑ Manage attendance reminders
☑ Review lesson plans
☐ Manage substitutions
☐ Manage events
☐ View all reports

Scopes (optional):
  Review lesson plans: [Math Department ▼] [Science Department ▼]
  
Expiration (optional):
  Review lesson plans: [2026-06-30]
```

#### Database Schema Changes

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN permissions TEXT[];
ALTER TABLE users ADD COLUMN permission_scopes JSONB;

-- Create audit table
CREATE TABLE permission_audit (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  changed_by INTEGER REFERENCES users(id),
  action VARCHAR(20), -- 'granted', 'revoked'
  permission VARCHAR(100),
  scope JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Pros & Cons

**Pros:**
- ✅ Extremely flexible (unlimited combinations)
- ✅ One place to define capabilities
- ✅ New responsibilities = new permission (no role changes)
- ✅ Supports mixed responsibilities (teacher + reviewer)
- ✅ Scoped permissions (department/class level)
- ✅ Temporary permissions (expiration dates)
- ✅ Better audit trail
- ✅ Scales to complex organizations

**Cons:**
- ❌ More complex implementation (7-10 days)
- ❌ New middleware and helpers needed
- ❌ More complex admin UI
- ❌ Each route needs permission checks
- ❌ Migration required for existing users
- ❌ More testing surface area
- ❌ Potential performance impact (array checks)

**Best for:** Many different combinations of responsibilities, future growth, complex organizational structures, or when you need scoped/temporary access.

---

## Recommendation

- **Short term (MVP):** Use **Option A** – add 2–3 roles that match real jobs you need now:
  - `attendance_manager` – access to attendance reminders (and optionally related attendance reports).
  - `lesson_plan_reviewer` – access to list/view/review lesson plans (read-only or with “review” action).
  - Optionally keep or rename department_principal / substitution coordinator as needed.
- **Why:** You get “admin assigns different kinds of assistants” quickly. No new model field, no new middleware. Just extend the role enum, add these roles to the right `authorize()` and sidebar, and in School Settings the admin can already assign them (once we add them to the allowed list and UI).
- **Later:** If you find yourself adding many more “assistant types” or need mixed combinations (e.g. “same person does attendance reminders and lesson plan review”), we can introduce **Option B** (permissions) and optionally migrate some of these roles to “staff + permissions”.

---

## Concrete next steps (Option A)

1. **Backend**
   - **User model:** Extend `role` enum with e.g. `attendance_manager`, `lesson_plan_reviewer` (and any other you want now).
   - **schoolRoutes (PATCH /me/users/:userId):** Add the new roles to `allowedRoles` so admin can assign them.
   - **Routes that should allow the new roles:**
     - Attendance reminders: `authorize('admin', 'attendance_manager')` (and keep super_admin if needed).
     - Lesson plans (list/view/review): add `lesson_plan_reviewer` where appropriate (read-only or review actions only).
   - **Middleware:** If a role needs a scope (e.g. department), reuse or extend the same pattern as `department_principal` (e.g. optional `department` for that role).

2. **Frontend**
   - **School Settings → Users & roles:** Add the new roles to the `ROLES` list (and any dropdown that shows role).
   - **Sidebar:** Show “Attendance Reminders” for `attendance_manager` (and admin); show “Lesson Plans” (or a “Review lesson plans” link) for `lesson_plan_reviewer` (and admin/teacher as you decide).

3. **Behaviour**
   - **attendance_manager:** Can manage attendance reminder configuration and run/send reminders; no need to be a teacher or admin.
   - **lesson_plan_reviewer:** Can see lesson plans (all or by department/school); can have a “review” or “approve” action if you add that later. Teachers still create/edit their own; this role is for oversight.

4. **Documentation**
   - In School Settings or help text, briefly describe each role (e.g. “Attendance manager: can manage attendance reminders for the school.”).

---

## Summary

- You already have **admin can assign roles**; the missing piece is **more granular staff roles** (or later, permissions).
- **Option A (new roles)** gets you “multiple assistants with different responsibilities” with minimal change.
- **Option B (permissions)** is the right long-term move if you expect many combinations or new responsibilities often.

If you tell me which option you prefer (and which 2–3 roles you want first), we can implement Option A step by step, or sketch the permission model and API for Option B.

---

## Detailed Implementation Guide (Option A)

### Phase 1: Database & Backend (Days 1-2)

#### Step 1.1: Extend User Role Enum

**File:** `a:\business\gb\server\models\User.js` (line 22)

**Current code:**
```javascript
role: {
    type: String,
    enum: ['super_admin', 'admin', 'department_principal', 'teacher', 'parent', 'student'],
    default: 'student'
}
```

**Updated code:**
```javascript
role: {
    type: String,
    enum: [
        'super_admin', 
        'admin', 
        'department_principal', 
        'teacher', 
        'parent', 
        'student',
        // New staff roles
        'attendance_manager',
        'lesson_plan_reviewer',
        'report_viewer',
        'event_coordinator',
        'behavior_manager',
        'transportation_coordinator',
        'cafeteria_manager',
        'library_manager',
        'it_support',
        'counselor',
        'nurse'
    ],
    default: 'student'
}
```

**Note:** Using MongoDB/Mongoose - no database migration needed for enum extension. Just update the schema and restart server.

#### Step 1.2: Create Role Configuration

**New file: `server/config/roles.ts`**
```typescript
export const ROLE_DEFINITIONS = {
  attendance_manager: {
    label: 'Attendance Manager',
    description: 'Manages attendance reminders and reports',
    category: 'staff',
    capabilities: ['view_attendance', 'manage_reminders', 'view_reports']
  },
  lesson_plan_reviewer: {
    label: 'Lesson Plan Reviewer',
    description: 'Reviews and approves lesson plans',
    category: 'staff',
    capabilities: ['view_all_lesson_plans', 'add_review_comments']
  },
  // ... other roles
} as const;
```

#### Step 1.3: Update School Routes

**File:** `a:\business\gb\server\routes\schoolRoutes.js` (line 96)

**Current code:**
```javascript
const allowedRoles = ['admin', 'department_principal', 'teacher', 'parent', 'student'];
```

**Updated code:**
```javascript
const allowedRoles = [
    'admin', 
    'department_principal', 
    'teacher', 
    'parent', 
    'student',
    // New staff roles
    'attendance_manager',
    'lesson_plan_reviewer',
    'report_viewer',
    'event_coordinator',
    'behavior_manager',
    'transportation_coordinator',
    'cafeteria_manager',
    'library_manager',
    'it_support',
    'counselor',
    'nurse'
];
```

**Location:** Inside the `PATCH /me/users/:userId` route handler (lines 81-119)

#### Step 1.4: Update Authorization on Protected Routes

**File:** `a:\business\gb\server\routes\attendanceTakingReminderRoutes.js`

**Current code (lines 13, 16):**
```javascript
router.post('/run', authorize('admin', 'super_admin', 'department_principal'), runReminderJob);
router.get('/', authorize('admin', 'super_admin', 'department_principal'), getReminders);
```

**Updated code:**
```javascript
router.post('/run', authorize('admin', 'super_admin', 'department_principal', 'attendance_manager'), runReminderJob);
router.get('/', authorize('admin', 'super_admin', 'department_principal', 'attendance_manager'), getReminders);
```

---

**File:** `a:\business\gb\server\routes\lessonPlanRoutes.js`

**NO CHANGES NEEDED** - GET routes (lines 26-27) already have no authorization:
```javascript
router.get('/', getLessonPlans);  // Controller handles scoping
router.get('/:id', getLessonPlanById);  // Controller handles scoping
```

The `lesson_plan_reviewer` role just needs sidebar access. Controllers will handle visibility logic.

---

**File:** `a:\business\gb\server\routes\reportRoutes.js` and `a:\business\gb\server\routes\advancedReportRoutes.js`

**Action needed:** Find all GET routes and add `'report_viewer'` to authorize calls.

Example pattern:
```javascript
// Before
router.get('/attendance', authorize('admin'), getAttendanceReport);

// After
router.get('/attendance', authorize('admin', 'report_viewer'), getAttendanceReport);
```

### Phase 2: Frontend (Days 2-3)

#### Step 2.1: Update Role Constants

**File: `client/src/constants/roles.ts`**
```typescript
export const ROLES = [
  { value: 'admin', label: 'Administrator', description: 'Full school access' },
  { value: 'teacher', label: 'Teacher', description: 'Teaching staff' },
  // ... existing roles
  { value: 'attendance_manager', label: 'Attendance Manager', 
    description: 'Manages attendance reminders and reports' },
  { value: 'lesson_plan_reviewer', label: 'Lesson Plan Reviewer', 
    description: 'Reviews lesson plans' },
  // ... other new roles
] as const;
```

#### Step 2.2: Update Sidebar Navigation

**File: `client/src/components/Sidebar.tsx`**
```typescript
const showAttendanceReminders = ['admin', 'attendance_manager'].includes(user.role);
const showLessonPlans = ['admin', 'teacher', 'lesson_plan_reviewer'].includes(user.role);
const showSubstitutions = ['admin', 'substitution_coordinator'].includes(user.role);
const showEvents = ['admin', 'event_coordinator'].includes(user.role);
const showReports = ['admin', 'report_viewer', 'attendance_manager'].includes(user.role);
```

#### Step 2.3: Update School Settings UI

**File: School Settings → Users & Roles page**

Add new roles to role selection dropdown with descriptions.

### Phase 3: Security & Validation (Day 3)

#### Step 3.1: Role Assignment Validation

**Prevent privilege escalation:**
```typescript
export function validateRoleAssignment(req, res, next) {
  const assignerRole = req.user.role;
  const targetRole = req.body.role;
  
  // Only super_admin can assign admin role
  if (targetRole === 'admin' && assignerRole !== 'super_admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  
  // Can't assign super_admin
  if (targetRole === 'super_admin') {
    return res.status(403).json({ error: 'Cannot assign super admin role' });
  }
  
  // Ensure same school
  if (req.user.schoolId !== req.targetUser.schoolId) {
    return res.status(403).json({ error: 'Cannot modify users from other schools' });
  }
  
  next();
}
```

#### Step 3.2: Audit Logging

**Create audit log for role changes:**
```typescript
export async function logRoleChange({ userId, changedBy, oldRole, newRole, schoolId }) {
  await db.auditLog.create({
    action: 'role_change',
    userId,
    changedBy,
    metadata: { oldRole, newRole },
    schoolId,
    timestamp: new Date()
  });
}
```

### Phase 4: Testing (Day 4)

#### Unit Tests
- Test authorization middleware with new roles
- Test role assignment validation
- Test privilege escalation prevention

#### Integration Tests
- Test role assignment API endpoints
- Test audit logging
- Test cross-school isolation

#### E2E Tests
- Test admin assigning new roles
- Test users with new roles accessing appropriate features
- Test sidebar shows correct items per role

### Phase 5: Documentation & Rollout (Day 5)

#### Documentation needed:
1. Admin guide: How to assign new roles
2. Role permissions matrix
3. Release notes
4. Help text in UI

#### Rollout strategy:
- **Week 1:** Deploy to 2-3 pilot schools, gather feedback
- **Week 2:** Deploy to 25% of schools, monitor metrics
- **Week 3:** Full rollout with announcement

---

## Security Considerations

### 1. Privilege Escalation Prevention

**Risk:** Admin tries to assign super_admin role
**Mitigation:** Validate role assignments, only super_admin can assign admin role

### 2. Cross-School Access

**Risk:** Admin from School A modifies users in School B
**Mitigation:** Always check `req.user.schoolId === targetUser.schoolId`

### 3. Role Scope Validation

**Risk:** User with department-scoped role accesses other departments
**Mitigation:** Add department checks in authorization middleware where needed

### 4. Audit Trail

**Risk:** No visibility into who changed what
**Mitigation:** Log all role changes with timestamp, actor, and old/new values

### 5. Session Invalidation

**Risk:** User's role changes but old session still has old permissions
**Mitigation:** Consider invalidating sessions on role change or check role on each request

---

## Testing Strategy

### Unit Tests (20+ tests)

```typescript
describe('Role Authorization', () => {
  test('attendance_manager can access attendance reminders');
  test('attendance_manager cannot access admin routes');
  test('lesson_plan_reviewer can view all lesson plans');
  test('lesson_plan_reviewer cannot edit lesson plans');
  test('report_viewer has read-only access');
  test('validateRoleAssignment prevents privilege escalation');
  test('validateRoleAssignment enforces school boundaries');
});
```

### Integration Tests (15+ tests)

```typescript
describe('Role Assignment API', () => {
  test('admin can assign new staff roles');
  test('admin cannot assign super_admin');
  test('admin cannot modify users from other schools');
  test('role changes are logged in audit table');
  test('role changes return updated user object');
});
```

### E2E Tests (10+ scenarios)

```typescript
test('admin assigns attendance_manager role and user sees correct sidebar');
test('lesson_plan_reviewer can view but not edit lesson plans');
test('report_viewer can access reports but not modify data');
test('role assignment shows validation errors for invalid roles');
```

### Performance Tests

- Measure authorization middleware overhead with new roles
- Test with 1000+ users with various roles
- Ensure no N+1 queries in role checks

---

## Migration Path to Option B (Future)

If you later need to migrate from Option A to Option B:

### Step 1: Add Permission Columns
```sql
ALTER TABLE users ADD COLUMN permissions TEXT[];
ALTER TABLE users ADD COLUMN permission_scopes JSONB;
```

### Step 2: Create Permission Mapping
```typescript
const roleToPermissions = {
  attendance_manager: ['manage_attendance_reminders', 'view_attendance_reports'],
  lesson_plan_reviewer: ['review_lesson_plans'],
  substitution_coordinator: ['manage_substitutions'],
  event_coordinator: ['manage_events'],
  report_viewer: ['view_all_reports']
};
```

### Step 3: Migrate Existing Users
```typescript
for (const user of usersWithStaffRoles) {
  user.permissions = roleToPermissions[user.role];
  user.role = 'staff'; // Convert to base role
  await user.save();
}
```

### Step 4: Update Authorization
```typescript
// Support both old and new style
function hasAccess(user, permission) {
  // Check role-based (backward compatibility)
  if (ROLE_PERMISSIONS[user.role]?.includes(permission)) return true;
  
  // Check permission-based (new style)
  if (user.permissions?.includes(permission)) return true;
  
  return false;
}
```

### Step 5: Gradual Deprecation
- Keep role-based checks for 2-3 releases
- Add deprecation warnings
- Migrate all users to permission-based
- Remove old role-based checks

---

## Success Metrics

### Adoption Metrics
- **Target:** 80% of schools use at least 1 new role within 3 months
- **Measure:** Count of users with new roles per school

### Usage Metrics
- **Track:** Which roles are most commonly assigned
- **Track:** Average number of staff roles per school
- **Track:** Feature usage by role (e.g., attendance reminders accessed by attendance_manager)

### Performance Metrics
- **Target:** Authorization checks < 5ms (p95)
- **Target:** Role assignment API < 200ms (p95)
- **Monitor:** No increase in 403 errors

### Support Metrics
- **Target:** < 5 support tickets per 100 schools in first month
- **Monitor:** Common confusion points or feature requests

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Privilege escalation bug | Low | Critical | Thorough testing, code review, audit logging |
| Performance degradation | Low | Medium | Load testing, monitoring, caching |
| User confusion | Medium | Low | Clear documentation, help text, training |
| Role proliferation | Medium | Medium | Start with 3-5 roles, evaluate before adding more |
| Migration complexity (to Option B) | Low | Medium | Clear migration path documented |

---

## Decision Framework

### When to add a new role (Option A):
✅ **Add if:**
- Clear, distinct job function
- Used by multiple schools
- Simple, school-wide scope
- No overlap with existing roles

❌ **Don't add if:**
- One-off request from single school
- Needs to be combined with other roles
- Requires complex scoping (department/class level)
- Would create 10+ total roles

### When to migrate to Option B:
✅ **Migrate if:**
- More than 8-10 roles needed
- Frequent requests for role combinations
- Need for scoped permissions (department-level)
- Temporary access requirements
- Complex organizational hierarchies

---

## Answers Based on Codebase Analysis

### 1. Department Scoping ✅ ANSWERED

**Current implementation:**
- `department_principal` has optional department scoping via `user.department` field
- `resolveDepartmentScope` middleware sets `req.departmentId` for scoped access
- If `department_principal` has no department, they get school-wide access

**Decision for new roles:**
- **`attendance_manager`**: School-wide only (no department scoping needed)
- **`lesson_plan_reviewer`**: School-wide initially, can add department scoping later if needed
- **`substitution_coordinator`**: Already handled by `department_principal` role - **DO NOT ADD** this role
- **`event_coordinator`**: School-wide only
- **`report_viewer`**: School-wide only

**Implementation:** Reuse existing `department` field and `resolveDepartmentScope` middleware. No new fields needed.

### 2. Read-only vs Full Access ✅ ANSWERED

**Current patterns from codebase:**
- Attendance reminders: Currently `admin`, `super_admin`, `department_principal` have full access
- Lesson plans: `teacher` and `admin` can create/edit; GET routes have no authorization (controller handles scoping)

**Decision:**
- **`attendance_manager`**: **Full access** (manage reminders, run jobs) - same as current `department_principal`
- **`lesson_plan_reviewer`**: **Read-only** for viewing all plans + ability to add review comments (new feature)
- **`report_viewer`**: **Read-only** for all reports

**Routes to update:**
```javascript
// Attendance reminders - ADD attendance_manager
router.post('/run', authorize('admin', 'super_admin', 'department_principal', 'attendance_manager'), ...);
router.get('/', authorize('admin', 'super_admin', 'department_principal', 'attendance_manager'), ...);

// Lesson plans - ADD lesson_plan_reviewer to GET only
router.get('/', getLessonPlans); // Already open, controller handles scoping
router.get('/:id', getLessonPlanById); // Already open, controller handles scoping
// DO NOT add lesson_plan_reviewer to POST/PUT/DELETE
```

### 3. Approval Workflows ✅ ANSWERED

**Current implementation:**
- Lesson plans have NO approval workflow currently
- Only CRUD operations exist

**Decision:**
- **Phase 1 (MVP)**: `lesson_plan_reviewer` gets **read-only access** only
- **Phase 2 (Future)**: Add review comments/approval feature later if needed
- Keep it simple for now - just visibility

### 4. Temporary Assignments ✅ ANSWERED

**Current implementation:**
- No expiration dates on roles
- No audit logging for role changes
- Role changes are permanent until manually changed

**Decision:**
- **Phase 1 (Option A)**: NO temporary assignments - keep it simple
- **Phase 2 (Option B)**: Add `permissionScopes.expiresAt` if migrating to permissions model
- For now, admins can manually change roles when needed

### 5. Role Combinations ✅ ANSWERED

**Current limitation:**
- `role` field is single enum value - **cannot combine roles**
- One user = one role only

**Decision:**
- **Phase 1 (Option A)**: Accept this limitation - one role per user
- If someone needs multiple responsibilities, assign the broader role (e.g., `admin`)
- **Phase 2 (Option B)**: Migrate to permissions model to support combinations
- This is a known trade-off of Option A

---

## Updated Roles to Implement

Based on codebase analysis and future needs, implement **11 NEW ROLES**:

### Core Staff Roles (Immediate Implementation)

### ✅ 1. `attendance_manager`
- **Access:** Full access to attendance reminders (same as `department_principal`)
- **Routes:** `attendanceTakingReminderRoutes.js` - add to existing authorize calls
- **Scope:** School-wide (no department scoping)

### ✅ 2. `lesson_plan_reviewer`  
- **Access:** Read-only access to all lesson plans
- **Routes:** `lessonPlanRoutes.js` - NO changes needed (GET routes already open)
- **Scope:** School-wide (controller handles scoping)
- **Note:** Just add role to sidebar to show lesson plans menu

### ✅ 3. `report_viewer`
- **Access:** Read-only access to reports
- **Routes:** `reportRoutes.js`, `advancedReportRoutes.js` - add to GET routes only
- **Scope:** School-wide

### Extended Staff Roles (Add to Schema Now, Implement Features Later)

### ✅ 4. `event_coordinator`
- **Access:** Create/edit school events, manage calendar, send event notifications
- **Routes:** Event/calendar routes (to be built)
- **Scope:** School-wide
- **Note:** Add to enum now, implement routes when event management features are built

### ✅ 5. `behavior_manager`
- **Access:** Manage student behavior tracking, discipline records, interventions
- **Routes:** Behavior routes (check if exists, otherwise to be built)
- **Scope:** School-wide or department-specific
- **Note:** May need access to student records

### ✅ 6. `transportation_coordinator`
- **Access:** Manage bus routes, transportation schedules, student assignments
- **Routes:** Transportation routes (to be built)
- **Scope:** School-wide
- **Note:** May need integration with student data

### ✅ 7. `cafeteria_manager`
- **Access:** Meal planning, cafeteria operations, dietary restrictions
- **Routes:** Cafeteria/meal routes (to be built)
- **Scope:** School-wide
- **Note:** May need student dietary information access

### ✅ 8. `library_manager`
- **Access:** Library resources, book checkouts, inventory management
- **Routes:** Library routes (to be built)
- **Scope:** School-wide
- **Note:** May need student checkout history

### ✅ 9. `it_support`
- **Access:** Technical support, user account management (limited), system settings
- **Routes:** Various routes (read-only access to troubleshoot)
- **Scope:** School-wide
- **Note:** Should NOT have full admin privileges, just diagnostic access

### ✅ 10. `counselor`
- **Access:** Student counseling records, guidance notes, college planning
- **Routes:** Counseling routes (to be built)
- **Scope:** School-wide or assigned students
- **Note:** Sensitive data - needs privacy controls

### ✅ 11. `nurse`
- **Access:** Health services, medical records, immunization tracking
- **Routes:** Health/medical routes (to be built)
- **Scope:** School-wide
- **Note:** HIPAA-sensitive - needs strict privacy controls

### ❌ DO NOT ADD: `substitution_coordinator`
**Reason:** This functionality is already handled by `department_principal` role. From `substitutionRoutes.js`:
- `department_principal` can create absences, substitutions, and manage requests
- They already have department scoping via `resolveDepartmentScope` middleware
- Adding a separate role would be redundant

---

## Implementation Checklist (Ready to Execute)

### Backend Changes (3-4 hours)

- [ ] **File:** `server/models/User.js` (line 22)
  - Add 11 new roles to enum: 
    - `'attendance_manager'`
    - `'lesson_plan_reviewer'`
    - `'report_viewer'`
    - `'event_coordinator'`
    - `'behavior_manager'`
    - `'transportation_coordinator'`
    - `'cafeteria_manager'`
    - `'library_manager'`
    - `'it_support'`
    - `'counselor'`
    - `'nurse'`

- [ ] **File:** `server/routes/schoolRoutes.js` (line 96)
  - Add all 11 new roles to `allowedRoles` array

- [ ] **File:** `server/routes/attendanceTakingReminderRoutes.js` (lines 13, 16)
  - Add `'attendance_manager'` to both authorize calls

- [ ] **File:** `server/routes/reportRoutes.js`
  - Add `'report_viewer'` to all GET route authorize calls

- [ ] **File:** `server/routes/advancedReportRoutes.js`
  - Add `'report_viewer'` to all GET route authorize calls

### Frontend Changes (2-3 hours)

- [ ] **File:** `client/src/constants/roles.js` (or create if doesn't exist)
  - Add role definitions with labels and descriptions

- [ ] **File:** `client/src/pages/admin/AdminUsersPage.jsx`
  - Update role dropdown to include new roles

- [ ] **File:** `client/src/components/Sidebar.jsx` (or navigation component)
  - Add `'attendance_manager'` to attendance reminders visibility check
  - Add `'lesson_plan_reviewer'` to lesson plans visibility check
  - Add `'report_viewer'` to reports visibility check

### Testing (2-3 hours)

- [ ] Test admin can assign all 11 new roles to users
- [ ] Test `attendance_manager` can access attendance reminders
- [ ] Test `lesson_plan_reviewer` can view lesson plans (but not edit)
- [ ] Test `report_viewer` can view reports (but not edit)
- [ ] Test all 8 extended roles appear in dropdowns and can be assigned
- [ ] Test cross-school isolation still works
- [ ] Test existing roles still work as before
- [ ] Test role switching works correctly
- [ ] Test unauthorized access is blocked for new roles

### Total Estimated Time: 8-10 hours

---

## What NOT to Do (Breaking Changes to Avoid)

❌ **DO NOT** add `substitution_coordinator` - already handled by `department_principal`  
❌ **DO NOT** change existing authorization on POST/PUT/DELETE routes for roles without features yet  
❌ **DO NOT** add database migrations - MongoDB schema changes don't need migrations  
❌ **DO NOT** add audit logging yet - keep it simple for MVP  
❌ **DO NOT** add permission scopes/expiration - that's Option B  
❌ **DO NOT** modify `department_principal` behavior - it works correctly  
❌ **DO NOT** change tenant isolation logic - it's working properly  
❌ **DO NOT** implement route authorization for roles where features don't exist yet (implement when building those features)

---

## Summary

**Plan is now complete and ready for implementation.** All questions answered based on actual codebase analysis:

✅ **11 new roles identified:**
   - **Core (3):** `attendance_manager`, `lesson_plan_reviewer`, `report_viewer`
   - **Extended (8):** `event_coordinator`, `behavior_manager`, `transportation_coordinator`, `cafeteria_manager`, `library_manager`, `it_support`, `counselor`, `nurse`

✅ **Exact files to modify:** 7 backend files, 3 frontend files  
✅ **No breaking changes:** All existing functionality preserved  
✅ **No database migrations needed:** MongoDB enum extension is schema-only  
✅ **Department scoping:** Reuse existing infrastructure, no new fields  
✅ **Access levels defined:** Full vs read-only per role  
✅ **Estimated time:** 8-10 hours total implementation

**Implementation Strategy:**
- Add all 11 roles to schema and admin UI now
- Implement authorization for 3 core roles immediately (have existing routes)
- Implement authorization for 8 extended roles when their features are built

**Ready to implement when you approve.**
