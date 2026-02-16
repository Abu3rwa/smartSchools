# Improvement 8: Department Scoping Implementation Plan

**Category:** Product + Access Control  
**Priority:** P1 (High)  
**Status:** Implemented  
**Last updated:** 2026-02-15

---

## 1. Current State

### Summary
Department scoping exists today, but it is inconsistent and mostly module-specific. Tenant scoping (school-level) is broadly enforced, while department-level scoping is only applied in selected controllers.

### Where department scoping works today

| Area | Current behavior | Notes |
|---|---|---|
| Teachers | `req.departmentId` is set by `scopeDepartmentPrincipal` and used by `teacherController` to filter CRUD and class assignment actions | This is the only route group that consistently sets `req.departmentId` via middleware |
| Substitutions | Partial role-based scoping in `substitutionController` using `user.department` and request `department` field | `list` uses `(department == user.department) OR (department == null)`; candidate selection service is school-wide |
| Attendance requests | Partial role-based scoping in `attendanceRequestController` using `request.department` and `user.department` checks | Also uses `(department == user.department) OR (department == null)` in list for department principals |

### Where department scoping is missing or inconsistent

| Area | Gap |
|---|---|
| Classes | No department-principal scoping logic in `classController`; no shared `req.departmentId` use |
| Students | No department-principal scoping logic in `studentController`; only teacher class-based scope |
| Attendance reminders | API route is admin/super_admin-only and does not filter by department; sidebar currently shows this page for `department_principal` |
| Lesson plans | Teacher-only ownership filter exists; no department-level scope for principal-style reviewers |
| Departments | `department_principal` can currently list/get departments without own-department restriction in controller |
| Middleware scope propagation | `req.departmentId` is set only on teacher routes; other route groups do not receive consistent scope context |
| Role management policy | School user-role patch endpoint currently requires `department_principal` to always have a department, which blocks whole-school principal mode |

### Additional technical inconsistency
- Teacher department is stored on `Teacher.department`, while some substitution logic reads `User.department` for teachers.
- This can produce incorrect department behavior if those values diverge.

---

## 2. Scoping Rule (Canonical Policy)

### Core rule
Apply a department filter only when the request has an active department scope (`req.departmentId` is set). Never auto-apply a department filter for `admin` and `super_admin`.

### Role-to-scope matrix

| Role | Department assigned on user? | Effective scope |
|---|---|---|
| `super_admin` | N/A | No department filter (cross-school or selected school context as applicable) |
| `admin` | Optional/ignored | No department filter (school-wide) |
| `department_principal` | Yes | Filter to that department only |
| `department_principal` | No | No department filter (whole-school principal mode) |
| `teacher` | Optional | Keep existing teacher ownership rules first; department filter is not primary access control |
| `parent` / `student` | Optional | Keep ownership/relationship scope; no default department scoping |

### Optional vs required department
- `department_principal` department assignment must become optional.
- If assigned, principal is department-scoped.
- If not assigned, principal is whole-school scoped for routes that allow that role.

### Mutation rule (create/update)
For department-scoped requests (`req.departmentId` set):
- Server enforces department boundary (incoming `department` cannot target another department).
- For department-bearing resources, server sets/overrides department from scope where appropriate.

### Unassigned department policy (first-class, global)

**Single global rule — apply everywhere (substitutions, attendance requests, departments listing, classes, students, lesson plans via class, reminders via assignment→class):**

1. **Visibility**
   - **Unassigned resources** (resource.`department == null` or missing) are visible to: **admin + whole-school principal only**.
   - **Department-scoped principals never see unassigned** unless a route explicitly opts in with a documented reason (none in this plan).

2. **Writes**
   - When creating department-bearing resources under a **scoped request** (`req.departmentId` set), the server **always sets** `department` from scope (override or set when not provided). Incoming `department` cannot target another department.

3. **No ad-hoc exceptions**
   - Do not reintroduce “department-scoped principal can see null” per module. Standardize on the rule above so edge cases stay consistent.

| Viewer | Unassigned (department null) |
|--------|-----------------------------|
| `admin` / `super_admin` | Can see and manage. |
| `department_principal` (whole-school, no dept) | Can see and manage. |
| `department_principal` (scoped, with dept) | **Never** see or manage. |

---

## 3. Middleware and request context

### Objective
Scope is computed once as **auth scope** and carried on the request. It is never conflated with optional UI/admin filters.

### Two distinct concepts (request context)

| Concept | Purpose | Set by | Used for |
|--------|---------|--------|----------|
| **`req.authScope`** | Authorization: who can see what | `resolveDepartmentScope` | All list/get/write decisions; never treat as “optional filter.” |
| **`req.queryFilter`** | Optional admin dropdown filter | Optional: parse from `req.query` only for admin/whole-school principal | Extra filter on lists only; **never** for authorization. |

- **`req.authScope`** shape: `{ schoolId, departmentId: ObjectId | null, mode: 'scoped' | 'unscoped', role }`. When `departmentId` is set, the request is department-scoped.
- **`req.queryFilter`**: e.g. `{ departmentId?: ObjectId }` — only when the user is admin or whole-school principal and explicitly selected a department in the UI. Controllers **must not** treat `queryFilter` as authorization; it is an additional filter for convenience only.
- Backward compatibility: keep `req.departmentId` (same as `req.authScope.departmentId`) and `req.departmentScope` so existing controller code keeps working; populate `req.authScope` from the same resolution.

### Standard route stack (mandatory for department-relevant modules)

Use the same stack everywhere to avoid missing routes:

```
protect → requireSchoolContext → resolveDepartmentScope → [authorize(...)] → controller
```

- **School context required:** Every module that returns or mutates department-bearing resources must use `requireSchoolContext`. If a route group does not use it today, add it so behavior is consistent.
- **Middleware placement:** Apply `resolveDepartmentScope` to all route groups that query department-relevant entities. Do not rely on “we added it to most routes”; use the standard stack so no router is forgotten.

### Scope resolution (resolveDepartmentScope)

1. Middleware computes and attaches:
   - `req.authScope = { schoolId: req.schoolId, departmentId, mode: departmentId ? 'scoped' : 'unscoped', role: req.user.role }`
   - `req.departmentId` = `req.authScope.departmentId` (ObjectId or `null`)
   - `req.departmentScope` = metadata (role, scoped/unscoped, source) for backward compatibility
2. Behavior:
   - `admin` and `super_admin` → `departmentId = null`
   - `department_principal` with department → `departmentId = user.department`
   - `department_principal` without department → `departmentId = null` (whole-school principal)
   - Other roles → `departmentId = null`
3. **Admin/super_admin exclusion:** Controllers must never force department filtering for `admin`/`super_admin`. Optional admin filter comes only from `req.queryFilter`, not from auth scope.

### Query and write helpers (reduce controller drift)

Avoid sprinkling department filters by hand in every controller. Use a small helper layer (e.g. `helpers/departmentScope.js` or service layer):

- **`applyDepartmentScope(query, req.departmentId)`**  
  When `req.departmentId` is set, add `query.department = req.departmentId` (or the correct field for that model). When null, do nothing. Use for all list/find queries on department-bearing resources.

- **`enforceDepartmentOnWrite(payload, req.departmentId)`**  
  When `req.departmentId` is set, set or override `payload.department` from scope; reject if payload attempts to set a different department. Use on create/update.

Even without a full repository pattern, these helpers give one place to enforce the rule and reduce “forgot to filter” regressions.

### ID-based access (GET /:id and relations)

- **Standard pattern:** For any `GET /:id`, do **not** fetch by id alone. Fetch by `{ _id: id, school: req.schoolId, ...(req.departmentId && { department: req.departmentId }) }` (or the correct department field for that resource). If the resource is missing or has a different department, return 404 or 403.
- **Relations:** For resources scoped via relation (e.g. lesson plan → class → department), after loading the resource, validate that the related entity’s department is in scope (e.g. load class and check `class.department === req.departmentId`). This is where “department principal reads another department by ID” bugs appear if not enforced.

### Whole-school principal: view vs mutate

Whole-school principal (`department_principal` with no department) has **school-wide visibility** but is **not** admin. Explicitly define what they can mutate vs only view so they are not accidentally given admin-like powers.

| Module | List/Get (whole-school principal) | Create | Update | Delete |
|--------|-----------------------------------|--------|--------|--------|
| Teachers | All school | ✓ (same as dept-scoped) | ✓ | ✓ (within allowed scope) |
| Classes | All school | ✗ (admin only) | ✗ | ✗ |
| Students | All school | ✗ | ✗ | ✗ |
| Departments | All school | ✗ | ✗ | ✗ |
| Substitutions | All school | ✓ | — | ✓ (cancel own/scope) |
| Attendance requests | All school | ✓ (as requester) | — | —; review ✓ |
| Attendance reminders | All school | — | — | —; run job ✓ |
| Lesson plans | All school (view) | ✗ (teacher/admin) | ✗ | ✗ |

Where “✓” is allowed and “✗” is admin-only (or as noted). Review per route: whole-school principal can approve/reject attendance requests and run reminder job school-wide; they do **not** create departments, classes, or students. Keep this table updated as new modules are added.

---

## 4. Backend Checklist by Area

## Teachers
- **Routes/Controllers:** `routes/teacherRoutes.js`, `controllers/teacherController.js`
- **Plan:**
  - Keep current department filtering behavior.
  - Move from teacher-route-only scoping dependency to shared scope middleware.
  - Ensure `admin` remains unfiltered.
  - Support `department_principal` without department as whole-school mode.
- **Special cases:**
  - Department-scoped principal cannot move teachers across departments.

## Classes
- **Routes/Controllers:** `routes/classRoutes.js`, `controllers/classController.js`, `controllers/classAnaliticsController.js`
- **Plan:**
  - Add department filter when `req.departmentId` is set (`class.department == req.departmentId`).
  - Keep no filter for `admin`.
  - Preserve teacher own-class restrictions.
- **Special cases:**
  - If class has no department, apply null-department policy (§2): visible to admin/whole-school principal only; department-scoped principal does not see it.

## Students
- **Routes/Controllers:** `routes/studentRoutes.js`, `controllers/studentController.js`
- **Plan:**
  - Apply `student.department == req.departmentId` when scoped.
  - For class-based endpoints, validate class department against scope.
  - Keep teacher access limited to assigned classes.
- **Special cases:**
  - During create/enroll/import/transfer, set student department from class when class is provided.
  - If student has no department, apply null-department policy (§2): visible only to admin/whole-school principal.

## Attendance reminders
- **Routes/Controllers:** `routes/attendanceTakingReminderRoutes.js`, `controllers/attendanceTakingReminderController.js`
- **Product decision:** Department principal **is** allowed to access (list and run job); scope to own department only.
- **Plan:**
  - Allow `department_principal` on reminder routes; filter list and run-job candidates by department when `req.departmentId` is set.
  - Scope derivation path: `assignment.class.department` (or legacy `schedule.class.department`).
  - Schedules/classes with no department: per null-department policy (§2), excluded from department-scoped principal view.
- **Special cases:**
  - Admin always sees all reminders.
  - Department-scoped principal only sees reminders from their department.

## Lesson plans
- **Routes/Controllers:** `routes/lessonPlanRoutes.js`, `controllers/lessonPlanController.js`
- **Plan:**
  - Keep teacher-own access for teacher role.
  - Add optional principal/reviewer listing scope by class department when principal role is allowed.
  - Validate class access for AI helper endpoints when scoped.
- **Special cases:**
  - If lesson plan class has no department, apply null-department policy (§2): admin/whole-school principal only.

## Substitutions
- **Routes/Controllers/Services:**
  - `routes/substitutionRoutes.js`
  - `controllers/substitutionController.js`
  - `services/substitutionCandidateService.js`
  - `services/substitutionWorkflowService.js`
- **Plan:**
  - Standardize on `req.departmentId` scope behavior.
  - Remove broad `(department == null)` expansion for department-scoped principal reads.
  - Filter candidate search and absence registration to scoped department when active.
  - Use canonical teacher department source (`Teacher.department`) for teacher-based department logic.
- **Special cases:**
  - Whole-school principal (no department) can operate school-wide.
  - Admin always school-wide.

## Attendance requests
- **Routes/Controllers:** `routes/attendanceRequestRoutes.js`, `controllers/attendanceRequestController.js`
- **Plan:**
  - On list/get/review, apply strict department filter when `req.departmentId` is set.
  - Keep no filter for admin and whole-school principal.
  - Normalize department assignment during create based on requester/student/teacher context.
- **Special cases:**
  - Requests with `department = null`: apply null-department policy (§2) — visible to admin and whole-school principal only; department-scoped principal does not see them.

## Departments
- **Routes/Controllers:** `routes/departmentRoutes.js`, `controllers/departmentController.js`
- **Plan:**
  - For `department_principal` with assigned department, restrict `GET /departments` and `GET /departments/:id` to own department.
  - For `department_principal` without assigned department, allow school-wide list/get.
  - Admin behavior unchanged.
- **Special cases:**
  - Keep create/update/delete restricted to admin.

## Other relevant modules (recommended follow-up)
- **Attendance records & analytics:** `routes/attendanceRoutes.js`, `controllers/attendanceController.js`
  - When principal-role access is enabled, scope by `attendance.class -> class.department`; apply null-department policy for classes with no department.
- **Grades/gradebook dashboards:** `routes/gradeRoutes.js`, `controllers/gradeController.js`
  - When principal-role access is enabled, scope by `grade.class -> class.department`; same null-department policy.
- **Schedule / timetable:** `routes/scheduleRoutes.js`, `routes/timetableRoutes.js`, related controllers
  - Scope list/read by `schedule.class -> Class.department` when principal access exists; not in core checklist — add when principal timetable views are required.
- **Reports and exports:** Any report or CSV/PDF export that aggregates by department or shows cross-department data must respect the same scope (filter by `req.departmentId` when set).

---

## 5. Data Model Plan

### Resources with direct department field (already present)
- `User.department` (currently used for department principal)
- `Teacher.department`
- `Student.department`
- `Class.department`
- `SubstitutionRequest.department`
- `AttendanceRequest.department`

### Resources without direct department field (scope via relation)
- `LessonPlan` -> scope through `LessonPlan.class -> Class.department`
- `AttendanceTakingReminder` -> scope through `assignment.class` (or legacy `schedule.class`) -> `Class.department`
- `TeacherPeriodAssignment` -> scope through `class -> Class.department`
- `Attendance` -> scope through `class -> Class.department`
- `Grade` -> scope through `class -> Class.department` (or student fallback)
- `Schedule` -> scope through `class -> Class.department` for class-type schedules

### Recommended model improvements (phase-based)

1. **Canonical source (hard rule — prevent divergence):**
   - **Principals:** `User.department` is the single source of truth for department_principal scope.
   - **Teachers:** `Teacher.department` is the **only** source for teacher department. Do **not** use `User.department` for teachers: keep it null for teacher users, or ignore it for teacher-based logic. All substitution, candidate, and teacher-scope logic must resolve teacher department via the **Teacher** model only.
   - This avoids data-model drift and “which field do I use?” bugs.
2. **Performance and indexing (two phases):**
   - **Phase 1 (correctness):** Use relational checks (e.g. LessonPlan → Class.department, Reminder → assignment.class.department) for all list/get. No denormalization yet.
   - **Phase 2 (if needed):** For list-heavy endpoints that prove slow, add a `department` field to the document, backfill from the relation, add compound index (school + department + date/status), and use the field in queries. Decide per endpoint based on measurement.
3. **Indexing:**
   - Ensure compound indexes for school + department + date/status on list-heavy collections, especially after Phase 2 denormalization.

### Data cleanup/backfill tasks
- Audit rows where `department` is null on department-relevant resources (Class, Student, Teacher, AttendanceRequest, SubstitutionRequest).
- Backfill from class/teacher relationships where deterministic (e.g. student from primary class, class from first assigned teacher).
- Produce report of unresolved records for manual admin cleanup.
- **Canonical source:** Use `Teacher.department` for all teacher-based department logic; do not rely on `User.department` for teachers. Optionally sync or backfill `User.department` from `Teacher.department` for teacher users if both are kept; document which source is authoritative per role.

---

## 6. Frontend Plan

### Role and scope UX
1. **School admin (`admin`)**
   - Sees all data.
   - Can optionally use a department filter dropdown on list pages (Classes, Students, Requests, Reminders, Lesson Plans where applicable).
2. **Department principal with department assigned**
   - Hide department selector (scope fixed).
   - Show scope badge (for example: "Department: Middle School").
3. **Department principal with no department (whole-school principal)**
   - Same data visibility as school-wide principal mode.
   - Optional department dropdown can be shown for convenience filtering.

### UI updates
- Update School Settings role editor copy and validation:
  - Remove "Department Principal requires a department" hard validation.
  - Replace with guidance: "Department optional. If empty, user is whole-school principal."
- Onboarding/settings: Document or surface in UI that a department_principal with no department has whole-school visibility (so admins can configure intentionally).
- Align sidebar menu permissions with backend authorization for:
  - Attendance reminders
  - Classes/Students/Lesson plan review pages if principal access is added
- **Backend as source of truth:** Any admin UI filter (e.g. department dropdown) must never change auth scope. It only sends an optional query param; the backend ignores it for authorization and uses `req.authScope` only. List pages pass department filter param only when user is admin or whole-school principal and the user **explicitly** selected one (`req.queryFilter`-style).
- **Whole-school principal badge:** Show a clear badge for whole-school principal mode (e.g. “Whole-school principal” or “All departments”) so principals do not think they are restricted and misreport bugs. Same prominence as the department-scoped badge (“Department: Middle School”).

---

## 7. Suggested Implementation Order

1. **Define policy and shared scope middleware**
   - Establish one source of truth before touching module logic.
2. **Role-management policy update**
   - Allow `department_principal` without department (whole-school principal).
3. **Migrate existing teacher scoping to shared middleware**
   - Keeps current behavior while proving middleware compatibility.
4. **Apply to core academic modules (Classes, Students)**
   - Highest impact for daily operations and data visibility.
5. **Apply to workflow modules (Substitutions, Attendance Requests)**
   - Existing partial logic needs normalization.
6. **Apply to operational modules (Attendance Reminders, Lesson Plans)**
   - Complete principal-facing workflow consistency.
7. **Handle secondary modules (Attendance analytics, Grades) as follow-up**
   - Extend coverage to reporting views.
8. **Frontend alignment and UX cleanup**
   - Expose proper filters and remove contradictory validation text.
9. **Data cleanup/backfill + index tuning**
   - Improve correctness and query performance.
10. **Final regression/UAT pass and rollout**
   - Verify role matrix and no admin regressions.

**Global audit (after middleware is in place):** Run this checklist to catch “forgot to attach middleware” or “forgot to scope query” bugs:

- [ ] Identify **every route** that returns or mutates department-bearing resources (Classes, Students, Teachers, Departments, SubstitutionRequest, AttendanceRequest, LessonPlan, AttendanceTakingReminder, etc.).
- [ ] For each such route: confirm **resolveDepartmentScope** (and **requireSchoolContext** where applicable) is applied in the route stack.
- [ ] Confirm the controller uses the **scoped query shape** (e.g. `applyDepartmentScope(query, req.departmentId)` or equivalent) for list/find.
- [ ] Confirm **writes** (create/update) override or validate department when scoped (`enforceDepartmentOnWrite` or equivalent).

**Rollback:** Feature is middleware + per-controller filters; rollback = revert middleware and controller changes. No schema migrations required for core scope; if denormalized `department` fields are added later, treat as optional and backward-compatible.

---

## 8. Testing and Acceptance Plan

### Test personas
- School Admin (`admin`)
- Department Principal with department assigned
- Department Principal with no department assigned (whole-school principal)
- Teacher (control persona for existing own-data rules)

### Acceptance matrix (must pass)

| Scenario | Admin expected | Dept principal (with dept) expected | Dept principal (no dept) expected |
|---|---|---|---|
| List classes | Sees all school classes | Sees only classes in own department | Sees all school classes |
| List students | Sees all school students | Sees only students in own department | Sees all school students |
| Teacher list | Sees all teachers | Sees only own department teachers | Sees all teachers |
| Substitution list | Sees all requests | Sees only own department requests | Sees all requests |
| Attendance request list | Sees all requests | Sees only own department requests | Sees all requests |
| Attendance reminders list/run | Sees all | Sees/runs only own department (if role allowed) | Sees/runs all (if role allowed) |
| Lesson plans list (principal mode) | Sees all | Sees only own department lesson plans | Sees all |

### Unassigned department (high-risk regression)

| Scenario | Dept principal (scoped) expected | Admin / whole-school principal expected |
|----------|----------------------------------|----------------------------------------|
| List classes where some have `department == null` | Does **not** see null-department classes | See all (including null) |
| List students with `department == null` | Does **not** see them | See all |
| List attendance requests with `department == null` | Does **not** see them | See all |
| GET /classes/:id for a class with `department == null` | 403 (or 404) | 200 |
| GET /students/:id for student with null department | 403 (or 404) | 200 |

### GET by ID (high-risk regression)

| Scenario | Dept principal (scoped) expected |
|----------|----------------------------------|
| GET /classes/:id for a class in **another** department | 403 or 404 (must not return the class) |
| GET /students/:id for student in another department | 403 or 404 |
| GET /attendance-requests/:id for request in another department | 403 |
| GET /lesson-plans/:id for plan whose class is in another department | 403 |
| Fetch must use scoped shape: e.g. `{ _id, school, department }` when scoped, not id-only. | Enforced |

### Negative tests
- Department-scoped principal cannot read/update records from another department by ID.
- Department-scoped principal cannot create records in another department by payload tampering.
- Admin is never unintentionally filtered by department.
- Controllers never use `req.queryFilter` (or query param department) for authorization—only `req.authScope` / `req.departmentId`.

### Regression checks
- Teacher ownership logic (own classes/grades/attendance) still works.
- Parent/student ownership views remain unchanged.
- School tenant isolation remains intact.

### Completion criteria
- Department scoping behaves consistently across targeted modules.
- Admin visibility remains school-wide in all scoped modules.
- Whole-school principal mode works without department assignment.
- UI and backend rules are aligned (no contradictory access/validation behavior).
- Null-department policy (§2) is applied consistently (department-scoped principal never sees null-department records).

### Automated testing
- Add unit/integration tests for `resolveDepartmentScope` middleware (role → `req.departmentId`).
- Add integration tests for at least one scoped module (e.g. Classes) covering: admin sees all, dept principal sees own, dept principal cannot access other department by ID, null-department records hidden from dept principal.
- Reuse test personas in E2E or API tests where feasible.

---

## 9. Limitations, out of scope, and risks

### Out of scope for this plan
- **Timeline and effort:** No fixed dates or story-point estimate; implement in order of §7 and track separately.
- **API versioning / backward compatibility:** Existing API consumers (e.g. mobile or integrations) are assumed to respect same auth; no versioned endpoints or compatibility layer in this plan.
- **Audit logging:** Who-saw-what or who-changed-what by department is not in scope; add later if required for compliance.
- **Notification targeting:** Who receives notifications (e.g. reminder emails, request approvals) is unchanged; scope only affects list/read/write and run-job visibility.
- **Multi-department assignments:** Plan assumes one department per Class, Student, Teacher; shared or cross-department assignments are not designed for.
- **Master data (rooms, subjects, etc.):** Remain school-wide; no department scoping for these entities.

### Deferred (follow-up)
- **Attendance analytics and Grades:** In "Other relevant modules" (§4); implement when principal access to those areas is enabled; apply same scope and null-department policy.
- **Schedule/timetable routes:** Explicit checklist deferred until principal timetable views are required.
- **Denormalization:** Adding `department` to LessonPlan, AttendanceTakingReminder, etc. is optional and only if list query performance demands it; measure before adding.
- **Bulk operations and imports:** Student/class import and bulk transfer must enforce department boundary when scoped; detailed rules (e.g. CSV column for department) are follow-up.

### Risks and mitigations
| Risk | Mitigation |
|------|------------|
| Many null-department records | Null-department policy is explicit (§2); backfill and reporting in §5; admin can assign department before principals need visibility. |
| User.department vs Teacher.department drift | Use only `Teacher.department` for teacher scope; document canonical source; optional sync/backfill in data cleanup. |
| Regression for teachers or parents | Regression checks in §8; teacher ownership and parent/student scope unchanged. |
| Principal UX confusion (whole-school vs dept) | UI guidance and scope badge (§6); optional onboarding note. |
