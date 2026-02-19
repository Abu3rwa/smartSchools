# Schedule Management System Review

This document provides a comprehensive review of the schedule management system in the application, including architecture, data flow, identified issues, and recommendations.

---

## 1. Architecture Overview

### Backend Components

| Component | Path | Purpose |
|-----------|------|---------|
| **Model** | `models/Schedule.js` | MongoDB schema for schedule entities |
| **Controller** | `controllers/scheduleController.js` | Request handlers for CRUD and calendar operations |
| **Routes** | `routes/scheduleRoutes.js` | API endpoint definitions |
| **Enhanced** | `controllers/scheduleControllerEnhanced.js`, `routes/scheduleRoutesEnhanced.js` | Alternative/enhanced implementations (appears unused in main app) |

### Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| **Admin Page** | `client/src/pages/admin/AdminSchedulePage.jsx` | Full schedule management (create, edit, delete, list, week view) |
| **Teacher Page** | `client/src/pages/teacher/TeacherSchedulePage.jsx` | Teacher's personal schedule (day/week/month view, record attendance) |
| **Service** | `client/src/services/scheduleService.js` | API client for schedule endpoints |

### Data Model Summary

The Schedule model includes:

- **Core**: title, description, type (class/meeting/event/exam/break), school
- **Relations**: class, subject, teacher, room
- **Time**: startTime, endTime
- **Recurrence**: isRecurring, recurrencePattern (daily/weekly/monthly)
- **Substitute**: substituteTeacher, substituteReason, substituteAssignedBy
- **Attendance**: requiresAttendance, attendanceDeadline
- **Status**: status (draft/scheduled/cancelled/completed), visibility, priority
- **Conflicts**: conflicts[] array (teacher_conflict, room_conflict, class_conflict)
- **Audit**: auditTrail[], createdBy, lastModifiedBy

---

## 2. Features

### Implemented Features

1. **CRUD operations** – Create, read, update, delete schedules
2. **Conflict detection** – Automatic detection of teacher, room, and class conflicts on save
3. **Room availability** – API to check which rooms are free for a given time range
4. **Calendar/date range views** – Fetch schedules by date range with role-based filtering
5. **Teacher schedule** – Dedicated endpoint for teacher schedules
6. **Quick schedule creation** – Admin UI with teacher/class/subject matrix
7. **List, Week, Calendar views** – Admin and teacher schedule views
8. **Room availability in create/edit** – Dropdown shows available vs occupied rooms
9. **Recurrence support** – Schema supports recurring schedules (UI/recurrence logic not fully wired)
10. **Template support** – Schema and `createFromTemplate` static for schedule templates

### Integration Points

- **Attendance** – Schedules link to `Attendance` records (separate model); teachers record attendance via `/attendance` API
- **Notifications** – `utils/notificationService.js` handles schedule_update, schedule_cancellation
- **Timetable** – Separate timetable/period system; schedules can exist alongside timetable-based assignments

---

## 3. Critical Issues

### 3.1 Controller–Model Mismatch (Backend)

The controller assumes Schedule has fields and methods that do not exist:

| Controller Reference | Model Reality | Impact |
|---------------------|---------------|--------|
| `schedule.location` | No `location` in schema | Create/update save `location`; it is dropped |
| `schedule.tags` | No `tags` in schema | Create/update save `tags`; they are dropped |
| `schedule.updatedBy` | Model has `lastModifiedBy` | Field never set; audit trail incomplete |
| `schedule.cancelledAt`, `cancelledBy`, `cancellationReason` | Not in schema | Cancel endpoint sets them; they are dropped |
| `schedule.attendance`, `schedule.attendanceRecorded`, `schedule.checkAttendance()` | Not in model; attendance is in `Attendance` model | `recordAttendance` and `getAttendanceStats` will fail or behave incorrectly |

**Recommendation**: Either add these fields to the Schedule model or remove/update controller logic to match the model. For attendance, use the `Attendance` model and compute `attendanceRecorded` from it.

### 3.2 Missing `Schedule.getStudentSchedule` Static Method

`scheduleController.js` calls `Schedule.getStudentSchedule(studentId, start, end)` at line 597, but this static method does not exist in `models/Schedule.js`. Only `getTeacherSchedule`, `getRoomSchedule`, and `getClassSchedule` exist.

**Impact**: `GET /api/schedules/student/:studentId` returns 500.

**Recommendation**: Implement `Schedule.getStudentSchedule` (e.g., by student → Student.currentClass → Schedule.find by class) or remove the endpoint if unused.

### 3.3 Student Schedule Filtering – `req.user.class`

For students, the controller uses `req.user.class` in queries (e.g., `{ class: req.user.class }`). The User model has no `class` field; `currentClass` lives on the Student model.

**Impact**: `req.user.class` is undefined. Student schedule queries may not return the correct schedules.

**Recommendation**: Resolve student class via `Student.findOne({ user: req.user._id })` and use `student.currentClass` in schedule queries.

### 3.4 `attendanceRecorded` Not Returned by Schedule API

`TeacherSchedulePage.jsx` uses `schedule.attendanceRecorded` for:

- Pending attendance count
- Checkmarks on schedule blocks
- "Record Attendance" button visibility

The schedule API does not populate or compute `attendanceRecorded`. That information is in the Attendance model.

**Impact**: Teacher UI always shows "Pending Attendance" and never shows recorded status correctly.

**Recommendation**: When returning schedules for teachers, join or lookup Attendance records and add `attendanceRecorded: true/false` per schedule.

### 3.5 Attendance Status Enum Mismatch

`TeacherSchedulePage` uses statuses: `present`, `absent`, `late`, `excused`.  
Attendance model enum: `present`, `absent`, `tardy`, `tardy_excused`, `absent_excused`.

**Impact**: Submitting `late` or `excused` may fail validation or be stored incorrectly.

**Recommendation**: Map `late` → `tardy` and `excused` → `absent_excused`/`tardy_excused` before sending to the API, or extend the Attendance schema to support these values.

### 3.6 `req.schoolId` vs `req.school._id` Inconsistency

In `scheduleController.js` `recordAttendance`, `isWorkingDayForSchool(req.schoolId, ...)` is used, but elsewhere the controller uses `req.school._id`. `req.schoolId` is set in auth as `user.school._id`, so it should work when school is present, but mixing conventions can lead to bugs (e.g., when `req.school` is missing).

**Recommendation**: Consistently use `req.schoolId` or `req.school._id` and ensure both are set where needed.

### 3.7 Student Schedule Date Range Query

In `getSchedulesByDateRange` for students:

```javascript
startTime: { $gte: start },
endTime: { $lte: end }
```

This excludes schedules that overlap the range (e.g., start before range but end inside). A typical calendar query uses:

```javascript
$or: [
  { startTime: { $lt: end }, endTime: { $gt: start } }
]
```

**Recommendation**: Use an overlap-based query for student (and possibly all) date-range fetches.

---

## 4. Moderate Issues

### 4.1 Search Query References Non-Existent Fields

In `getSchedules`, the search filter uses:

```javascript
{ room: { $regex: search } },
{ location: { $regex: search } }
```

`room` is an ObjectId ref, not a string. `location` is not in the Schedule schema.

**Impact**: Search by room/location will fail or not behave as intended.

### 4.2 Create Schedule: Student Participants

`createSchedule` looks up `Student.find({ currentClass: classId })` but the Student model uses `currentClass`, and the code pushes `student.user` into participants. Ensure `student.user` exists and is correct; some students may not have a linked user.

### 4.3 Cancel Endpoint Response

`cancelSchedule` sets `schedule.cancelledAt`, `cancelledBy`, `cancellationReason` and returns the schedule, but these fields are not persisted (not in schema). The response may suggest cancellation was recorded when it was not.

### 4.4 Calendar View Placeholder

`AdminSchedulePage` shows "Calendar view coming soon..." for the calendar view. The week view and list view work.

### 4.5 Duplicate Route Files

`scheduleControllerEnhanced.js` and `scheduleRoutesEnhanced.js` exist but appear unused. This adds maintenance overhead and potential confusion.

---

## 5. Strengths

1. **Conflict detection** – Automatic teacher/room/class conflict detection on save
2. **Room availability** – Proactive availability check during schedule creation
3. **Quick schedule UI** – Teacher/class/subject matrix for fast schedule creation
4. **Room dropdown** – Visual indication of available vs occupied rooms
5. **Role-based access** – Teacher and student filtering in list/calendar
6. **Indexes** – Appropriate indexes on school, teacher, room, class, startTime
7. **Audit trail** – Schema supports audit history (with some controller gaps)
8. **Flexible types** – class, meeting, event, exam, break

---

## 6. Recommendations Summary

### High Priority

1. **Fix `getStudentSchedule`** – Implement the missing static method or remove the endpoint.
2. **Fix student class resolution** – Use Student model to get `currentClass` instead of `req.user.class`.
3. **Add `attendanceRecorded` to schedule responses** – Compute from Attendance model when returning teacher schedules.
4. **Align controller with model** – Add missing schema fields (location, tags, cancelledAt, etc.) or remove controller usage of them.
5. **Fix recordAttendance/getAttendanceStats** – Use Attendance model instead of non-existent Schedule.attendance/checkAttendance.

### Medium Priority

6. Fix attendance status mapping (late→tardy, excused→absent_excused).
7. Fix date range query to use overlap logic for calendar views.
8. Fix search to avoid regex on ObjectId and non-existent fields.
9. Ensure `req.schoolId`/`req.school` usage is consistent.

### Low Priority

10. Complete calendar view in AdminSchedulePage.
11. Clean up or integrate scheduleControllerEnhanced and scheduleRoutesEnhanced.
12. Revisit recurrence and template features for full support.

---

## 7. File Reference

| File | Lines of Interest |
|------|-------------------|
| `models/Schedule.js` | Full schema; no location, tags, attendance, getStudentSchedule |
| `controllers/scheduleController.js` | 468–488 (student schedules), 455–475 (getSchedulesByDateRange), 465–506 (recordAttendance) |
| `client/src/pages/teacher/TeacherSchedulePage.jsx` | 255, 350, 520, 637 (attendanceRecorded) |
| `client/src/services/attendanceService.js` | createOrUpdateAttendance payload |
| `models/Attendance.js` | studentAttendance status enum |
