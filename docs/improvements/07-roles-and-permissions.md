# Roles & Permissions – Flexible Staff Assignments

**Status:** Design / Thinking  
**Last updated:** 2026-02-15

---

## The problem

Today:

- **Roles** are a single value per user: `super_admin`, `admin`, `department_principal`, `teacher`, `parent`, `student`.
- **Admins can already assign roles** to any user in their school (School Settings → Users & roles): admin, department_principal, teacher, parent, student.
- There is only one “assistant-like” role: **department_principal** (scoped to one department).

What we want:

- **Multiple staff with different responsibilities**, not only “teacher” or “department principal”. For example:
  - **Person A** – manages attendance reminders only (no teaching, no full admin).
  - **Person B** – reviews/checks lesson plans of other teachers (curriculum QA).
  - **Person C** – coordinates substitutions (similar to department_principal but for subs).
- Admin should be able to **assign these responsibilities** to users (and change them over time) without creating a new “role” for every new task.

So the gap is: **granular responsibilities** (who can do what) while keeping the model simple and admin-friendly.

---

## Two design directions

### Option A: Add more predefined roles

- Extend the role enum with a few concrete roles, e.g.:
  - `attendance_manager` – can access attendance reminders, maybe attendance reports.
  - `lesson_plan_reviewer` – can view/list/review lesson plans (read or approve), possibly across teachers.
  - Keep `department_principal` for department-scoped stuff; maybe add `substitution_coordinator` if needed.
- **Pros:** Simple. No new concepts. Reuse existing `authorize('admin', 'attendance_manager')` pattern. Sidebar and routes stay role-based.
- **Cons:** Every new responsibility = new role and more `authorize(...)` lists. Role list can grow (e.g. 10+ roles).

**Best for:** A small, fixed set of “job types” (e.g. 3–5 assistant types) that won’t change often.

---

### Option B: Base role + permissions (capabilities)

- Keep a **base role** that describes “kind of user”: e.g. `admin`, `teacher`, `staff`, `student`, `parent`.
- Add a **permissions** array on `User`, e.g.:
  - `permissions: ['manage_attendance_reminders', 'review_lesson_plans', 'manage_substitutions']`
- “Staff” who don’t teach get role `staff` and only the permissions they need. Teachers can also have extra permissions (e.g. a teacher who also reviews lesson plans).
- **Authorization:** either role-based (admin can do everything) or permission-based: “allow if user has permission X”. e.g. new middleware `requirePermission('manage_attendance_reminders')` or a helper that checks `user.role === 'admin' || user.permissions?.includes('manage_attendance_reminders')`.
- **Admin UI:** “Edit user → Role: Staff. Permissions: ☑ Manage attendance reminders, ☑ Review lesson plans.”
- **Pros:** Very flexible. One place to define capabilities; new responsibilities = new permission, no new role. Fits “multiple assistants with different mixes” well.
- **Cons:** More code: permission constants, middleware or helpers, and each protected route must allow by role or by permission. UI must show and edit permissions.

**Best for:** Many different combinations of responsibilities and future growth (e.g. “event coordinator”, “report viewer”, etc.).

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
