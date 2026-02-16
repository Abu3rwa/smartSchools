# Teacher Scope Security Fixes

**Date:** 2026-02-15  
**Issue:** Teachers could see all subjects and classes not assigned to them.

---

## Summary

Teachers must only see and access classes and subjects they are assigned to teach. Several gaps were identified and fixed.

---

## Fixes Applied

### 1. Subject Controller – getSubjects (list)

**Problem:** When a teacher had no Teacher profile (`resolveTeacherProfile` returned null), the code did not add any filter. The query ran without `_id: { $in: subjectIds }`, returning all subjects.

**Fix:** When role is teacher, require a Teacher profile. If missing, return 403. Otherwise always apply `query._id = { $in: subjectIds }`.

### 2. Subject Controller – getSubject (single)

**Problem:** No teacher check. Any authenticated user (including teachers) could GET any subject by ID.

**Fix:** For teachers, resolve profile, get assigned subject IDs, and verify the requested subject is in that list. Return 403 if not.

### 3. Subject Controller – getSubjectsByGrade

**Problem:** No teacher restriction. Teachers could get all subjects for a grade.

**Fix:** For teachers, restrict to assigned subjects via `query._id = { $in: subjectIds }`.

### 4. Subject Routes – requireSchoolContext

**Problem:** Subject routes did not use `requireSchoolContext`, unlike class and other school-scoped routes.

**Fix:** Added `requireSchoolContext` middleware to subject routes.

---

## Teacher Scoping Sources

Teachers are considered "assigned" to classes/subjects via:

- **Class.subjects.teacher** – Subject teacher in class
- **Class.classTeacher** – Class teacher
- **Teacher.assignedClasses** – Direct assignments on Teacher

`getTeacherClassIds` and `getTeacherSubjectIds` in `helpers/teacherScoping.js` use these sources.

---

## Existing Protections (Verified)

- **Class controller** – getClasses and getClass already filter by teacher assignment.
- **Grade, student, attendance** – Use teacher scoping helpers.
- **Lesson plans** – Filter by teacher.
- **Department principals** – Use `resolveDepartmentScope` for department filtering.

---

## Recommendations for Further Hardening

1. **Lesson plan create/update** – Verify teacher is assigned to the selected class+subject before save.
2. **Grade entry** – Confirm teacher-scoped checks cover all grade write paths.
3. **TeacherPeriodAssignment** – Consider including timetable-based assignments in `getTeacherClassIds` and `getTeacherSubjectIds` if your school uses timetables as the main assignment source.

---

## Files Modified

- `controllers/subjectController.js` – Teacher checks for getSubjects, getSubject, getSubjectsByGrade
- `routes/subjectRoutes.js` – requireSchoolContext
