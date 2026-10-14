# Teacher Access Review

**Review date:** 2026-10-14  
**Scope:** Teacher-facing web navigation, route guards, role-to-permission defaults, related API authorization, and school-admin controls over teacher/student access and support preview.  
**Approach:** Initial review was read-only. The school-scoped page availability and audited support-preview work described below has since been implemented; no production settings or deployment changes were made.

## Summary

The app does not have one general teacher-permission switch: default teacher capabilities are spread across role-based permissions, route guards, feature gates, API middleware, and sidebar visibility. In several cases, teachers are authorized to use a feature but its only sidebar link is commented out. This makes the feature effectively undiscoverable, even though a direct URL can work.

The clearest functional permission gap is substitution self-service: teachers can view requests and respond to offers, but cannot initiate an absence or coverage request. Whether teachers should be able to request coverage for themselves is a school workflow decision; if so, it should be added with teacher-own-request scope rather than school-wide substitution management.

School-level page availability and platform-level feature availability should be treated separately. A school admin should be able to enable or temporarily lock supported pages/features for teachers and students in that admin's own school only. A super admin should retain platform-wide controls. For support, a school admin should be able to preview a student or teacher experience through a clearly labeled, read-only view-as mode with an audit trail; preview must not silently grant the admin the selected user's permissions or permit actions as that user.

## Findings

### 1. Teachers cannot create their own substitution or absence requests

**Priority: High, if teachers are expected to report their own absences/request coverage**

- The sidebar and page route let teachers open the substitutions list, but the page sets `canCreate` only for `admin` and `department_principal`.
- The create page is also restricted to those roles.
- The API restricts both `POST /api/substitutions` and `POST /api/substitutions/absences` to admins and department principals. Teachers can list requests and respond to requests assigned to them, but cannot initiate one.
- Evidence: [SubRequestsList hook](../client/src/pages/substitutions/SubRequestsList/hooks/useSubRequestsList.js), [App routes](../client/src/App.jsx), [substitution API routes](../routes/substitutionRoutes.js).

**Suggested access:** Allow a teacher to submit an absence/coverage request for themselves, subject to school policy and existing approval flow. Keep candidate selection, absence registration on behalf of another teacher, analytics, and cancellation restricted to authorized coordinators.

### 2. Curriculum maps are unavailable from teacher navigation

**Priority: Medium — access is hidden, not denied**

- The curriculum sidebar item is commented out.
- The curriculum page route allows teachers, and the default teacher permission set includes viewing maps, creating maps, editing their own maps, and exporting/printing.
- The backend additionally limits ordinary teachers to published maps or maps they created, so this is not evidence that teachers can edit everyone’s plans.
- Evidence: [Sidebar](../client/src/components/layout/Sidebar.jsx), [App routes](../client/src/App.jsx), [teacher default permissions](../config/permissions.js), [curriculum map scope](../services/curriculum/curriculumMapService.js).

**Suggested access:** Restore a teacher-facing curriculum link if curriculum planning is an active school feature; retain the current ownership and publication limits.

### 3. Intervention queue is unavailable from teacher navigation

**Priority: Medium — access is hidden, not denied**

- The teacher-capable sidebar item is commented out.
- The route and API authorize teachers; the frontend and backend also apply the intervention feature gate.
- Evidence: [Sidebar](../client/src/components/layout/Sidebar.jsx), [App routes](../client/src/App.jsx), [intervention API routes](../routes/interventionRoutes.js).

**Suggested access:** Show the link when `interventionTracking` is enabled and the teacher role is eligible.

### 4. Teacher academic-excellence view is unavailable from teacher navigation

**Priority: Medium — access is hidden, not denied**

- Its sidebar item is commented out.
- The route checks `view_academic_excellence_class`, which is included in the default teacher permissions, and the view is subject to the `academicIntelligence` feature gate.
- Evidence: [Sidebar](../client/src/components/layout/Sidebar.jsx), [App routes](../client/src/App.jsx), [teacher default permissions](../config/permissions.js).

**Suggested access:** Restore the teacher link when the school feature is enabled; preserve class-level data scope.

### 5. Reading text management is unavailable from teacher navigation

**Priority: Medium — access is hidden, not denied**

- The “Reading” teacher link is commented out.
- The route permits teachers, the page is feature-gated, and the reading API permits teachers to upload/manage texts, assign reading, and view relevant student reading data.
- Evidence: [Sidebar](../client/src/components/layout/Sidebar.jsx), [App routes](../client/src/App.jsx), [reading API routes](../routes/readingRoutes.js).

**Suggested access:** Restore the link when `readingAssistant` is enabled, assuming teacher-created/assigned reading remains an intended feature.

### 6. Social Studies module is unavailable from teacher navigation

**Priority: Medium — access is hidden, not denied**

- Its sidebar item is commented out.
- The nested route admits teachers, and the lesson API allows teachers to view, create, update, and delete lessons.
- Evidence: [Sidebar](../client/src/components/layout/Sidebar.jsx), [App routes](../client/src/App.jsx), [Social Studies lesson API routes](../routes/socialStudiesLessonRoutes.js).

**Suggested access:** Restore the link if the module is still supported. Confirm that write access is appropriately scoped to a teacher’s own lessons/classes before exposing it broadly.

### 7. Revision plans are unavailable from teacher navigation

**Priority: Low/Medium — access is hidden, not denied**

- The teacher/admin revision link is commented out.
- Revision list/create/detail routes and relevant APIs permit teachers, subject to the `revisionPlanning` feature gate.
- Evidence: [Sidebar](../client/src/components/layout/Sidebar.jsx), [App routes](../client/src/App.jsx), [revision API routes](../routes/revisionRoutes.js).

**Suggested access:** Restore the link if teachers are expected to create and manage student revision plans.

### 8. School-scoped page availability controls and support preview

**Status: Implemented in application code; production rollout and live-account verification remain**

- School admins now have a **Page access & previews** school-settings tab to independently enable or temporarily lock registered teacher/student page groups for their school. Unspecified settings default to available; school admins and super admins are not locked out by these teacher/student settings.
- Availability is stored on the school record, returned through authenticated school APIs, hidden from the affected role's sidebar, checked on direct page navigation, refreshed periodically, and enforced for mapped API areas. API denials return `423 SCHOOL_PAGE_LOCKED`.
- School admins can start a 30-minute, read-only preview of a specific same-school teacher or student account. The UI labels the preview and provides an exit action; the preview token resolves the target account and tenant, rejects non-read HTTP methods, and checks that both accounts remain active and in the same school.
- Preview start/end, administrator, target account/role, timestamps, expiry, and IP address are stored in a school-scoped audit record visible to school admins.
- Existing super-admin impersonation remains a separate flow. School-level page availability does not change other schools' settings or grant access to administrative pages.

**Suggested responsibility split:**

- **School admin:** Enable or temporarily lock supported pages/features for teachers and/or students in their own school. A school setting must not affect another school's users. Do not let this setting grant access to admin-only pages or override platform-wide disablement.
- **Super admin:** Control platform-wide feature availability, including emergency or maintenance disablement and global defaults. A school-level enablement must not override a super-admin platform disablement.
- **Support preview:** Offer a clearly labeled preview of a selected teacher/student experience. Keep the administrator authenticated as the administrator, read-only, and unable to submit, grade, edit, or otherwise mutate data as the viewed user. Record who previewed which role/user and when, with an explicit start/end or equivalent audit event.

**Remaining verification:** Run account-level tests in a non-production school for school isolation, locks/unlocks, normal feature gates and role checks, preview start/read-only denial/exit/expiry, and audit visibility. The access API registry covers named feature APIs; APIs shared by multiple screens need careful mapping so locking one page does not inadvertently break unrelated workflows.

## Existing teacher access that appears intentional

- Teachers have a teacher-specific attendance workflow and can take class-period attendance; the school-wide attendance dashboard, analytics, export, and locking remain limited to admins and department principals. See [attendance API routes](../routes/attendanceRoutes.js).
- Teachers can view school calendar events. Event creation/management is handled separately and requires the event-management capability; the page uses a read-only view for teachers without it. See [calendar API routes](../routes/calendarRoutes.js) and [calendar UI permission helper](../client/src/pages/admin/calendar/AdminSchoolCalendarPage/utils/calendarPresentation.js).
- Teachers can use Live Lessons through teacher-authorized lesson/session endpoints when Live Lessons is enabled. See [Live Lessons API routes](../routes/liveLessonRoutes.js).
- User administration, school settings, roster imports, and school-wide attendance controls are role-restricted and are not listed as gaps; they are normally administrative responsibilities.

## Recommended order

1. Verify page locks and read-only support previews with representative teacher and student accounts in a non-production school.
2. Decide whether teachers should self-submit absence/coverage requests. If yes, add teacher-own-request access with server-side ownership and approval checks.
3. Restore sidebar links for the teacher features the school currently supports: curriculum, interventions, academic excellence, reading, Social Studies, and revision plans.
4. Recheck page-to-API mappings when shared endpoints or teacher/student routes change.

## Limitations

The initial teacher-access review was static. The implementation has focused automated tests for registry alignment, default availability, role-scoped settings, and API path mapping, plus a successful client production build and changed-file lint. No end-to-end test with live accounts or production school configuration has been performed. Feature flags and subscription entitlements remain separate controls that may still limit a page.
