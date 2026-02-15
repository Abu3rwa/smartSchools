# Improvement 5: Product & UX

**Category:** Product & UX  
**Priority:** P5 (High impact)  
**Effort:** Medium–High  

---

## Summary

Address product gaps that affect daily use: timezone handling for attendance and schedules, student lifecycle (archive/delete), attendance completion visibility, and CSV import robustness.

---

## Current State

- Attendance reminders and schedule logic use server time (`new Date()`)
- Student delete/archive flow incomplete (not fully wired in UI)
- No dashboard indicator for "missing attendance" per class/day
- CSV import may use naive parsing; limited error handling
- Grade categories (classwork, homework, test) may need better UI support

---

## Goals

1. Support per-school timezone for attendance and scheduling
2. Complete student archive/delete flow with guardrails
3. Surface attendance completion status on teacher/admin dashboards
4. Harden CSV import with robust parsing and error reporting
5. Improve grade category support in reports and filters

---

## Scope

### 1. Timezone Support

**Problem:** Server runs in UTC (or host timezone). Attendance dates and reminder windows can be wrong for schools in different timezones.

**Example:** School in California; server in UTC. At 11pm Sunday PST (7am Monday UTC), server may treat it as Monday and check wrong classes.

**Proposed:**
- Add `School.timezone` (e.g. `America/Los_Angeles` via IANA)
- When computing attendance dates, reminder windows, or schedule cutoffs, convert using school timezone
- Use `date-fns-tz` or native `Intl` for conversions
- Default to `UTC` or server timezone if not set (backward compatible)

**Affected Areas:**
- `attendanceTakingReminderController.js` – `candidate` date, `periodEnd` comparison
- Schedule/timetable date logic
- Report generation date ranges

### 2. Student Lifecycle – Archive/Delete

**Current:** Delete action not fully wired; may leave orphaned or inconsistent data.

**Proposed:**
- **Archive** – Soft delete: set `Student.isArchived = true`; hide from default lists; keep historical grades/attendance
- **Delete** – Hard delete only when no dependent records, or after archive period
- Add confirmation modal with impact summary (e.g. "X grades will be affected")
- Server-side guard: reject delete if dependent records exist; suggest archive
- Add "Archived" filter in student list; allow restore (un-archive)

**UI:**
- Archive button in student detail/list
- Delete button with confirmation and warnings
- "Show archived" toggle in student list

### 3. Attendance Completion Tracking

**Proposed:**
- Per class/day: indicator "Attendance recorded" vs "Missing"
- Teacher dashboard: list of today's classes with missing attendance
- Admin dashboard: school-wide view of missing attendance by teacher/class/date
- Optional: link to quick-attendance entry from dashboard

**Data:**
- Derive from timetable (TeacherPeriodAssignment) + Attendance records
- Or cache a "missing attendance" aggregation for performance

### 4. CSV Import Hardening

**Current:** May use simple `split(",")`; issues with quoted fields, newlines inside cells.

**Proposed:**
- Use robust parser: `papaparse`, `csv-parse`, or similar
- Handle: quoted commas, multi-line cells, BOM
- Duplicate detection: by `studentId`, `email`; report duplicates with row numbers
- Dry-run mode: validate without inserting; return error report
- Error report: downloadable CSV with row, field, error message
- Limit upload size and row count (e.g. 5000 rows)

### 5. Grade Category Enhancements

**Current:** Grade categories may exist in schema but need better UX.

**Proposed:**
- Support categories: `classwork`, `homework`, `test`, custom
- UI: category selector in grade entry form
- Reports: filter/summarize by category
- Validation: max marks per category if configured

---

## Implementation Notes

### Timezone Helper

```javascript
// utils/schoolTimezone.js
import { toZonedTime } from "date-fns-tz";

export function toSchoolDate(utcDate, schoolTimezone = "UTC") {
  return toZonedTime(utcDate, schoolTimezone);
}
```

### Student Archive Flow

1. `PATCH /api/students/:id` – add `isArchived: true`
2. `GET /api/students` – filter `isArchived: false` by default; query param `?archived=true` to include
3. Archive action: check dependencies; if any, require archive (not delete)

### CSV Import Flow

1. Parse with `papaparse` (or equivalent)
2. Validate each row: required fields, types, duplicates
3. If dry-run: return `{ valid: boolean, errors: [{ row, field, message }], duplicates: [...] }`
4. If import: insert in transaction/batch; rollback on critical error

---

## Acceptance Criteria

### Timezone
- [ ] School model has `timezone` field (IANA string)
- [ ] Attendance reminder uses school timezone when computing dates
- [ ] School settings UI allows timezone selection
- [ ] Default `UTC` when not set

### Student Lifecycle
- [ ] Archive sets `isArchived`; student hidden from default list
- [ ] Delete blocked when dependent records exist; clear error message
- [ ] Confirmation modal before archive/delete
- [ ] "Show archived" filter and restore action

### Attendance Completion
- [ ] Teacher dashboard shows today's classes with missing attendance
- [ ] At least one admin view of missing attendance across school
- [ ] Indicator is accurate (matches timetable + attendance data)

### CSV Import
- [ ] Parser handles quoted commas and multiline cells
- [ ] Duplicate detection by studentId/email with row numbers
- [ ] Dry-run returns validation errors without inserting
- [ ] Downloadable error report (CSV or JSON)

### Grade Categories
- [ ] Category selector in grade entry
- [ ] Reports filterable by category
- [ ] Category displayed in grade lists

---

## Dependencies

- Timezone: `date-fns-tz` or similar
- CSV: `papaparse` or `csv-parse`
- Others: None

---

## References

- [NEXT_DEVELOPMENT_PLAN.md](../../NEXT_DEVELOPMENT_PLAN.md) – Workstream A (core workflow)
- [date-fns-tz](https://github.com/marnusw/date-fns-tz)
- [PapaParse](https://www.papaparse.com/)
- [IANA Time Zone Database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)
