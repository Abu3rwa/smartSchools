# Live Lesson Reporting and Gradebook Integration Plan

**Status:** Phases 1–4 implemented; focused regression validation is in progress.  
**Date:** 2026-10-14  
**Scope:** Active and completed live sessions, individual student answer reports, printable class reports, optional classwork grade creation, and an optional behavior deduction for leaving the lesson tab.
**Additional library UX scope:** Filter lessons and session history by class and subject, remember each teacher's selections, paginate both lists, and use tables instead of cards.
**Lesson collaboration scope:** Teachers and admins can share lessons with another active teacher or admin in the same school; the recipient can accept or decline, and acceptance adds an independent copy to their library for use.

## 1. Product goal

Make each live session a useful, auditable teaching record rather than only a slide replay and a small aggregate report. A teacher should be able to:

1. See a live session's current participation and answers while teaching, then see a finalized report after it ends.
2. Open a student-specific report showing every answer that student submitted in that session, with the question, chosen answer, correct answer, result, and timing.
3. Print/save that student's report as a PDF.
4. Print/save a detailed report for the whole class, including per-question and per-student detail.
5. Optionally use session evidence to create or update daily classwork gradebook entries and optionally apply a teacher-configured behavior deduction for focus-loss events.
6. See the live lesson's questions and answers alongside the linked daily classwork grade, not just a marks value with no explanation.

The report should be helpful for instruction and feedback, not present device focus signals as proof of misconduct.

## 2. Current implementation and constraints

### Live session data already available

- A session stores its class, teacher, lesson snapshot (including subject as lesson text), roster snapshot, status, start/end times, and presentation state in `models/LiveSession.js`.
- Student multiple-choice/true-false submissions are persisted in `models/LiveResponse.js`. Each response stores student, slide, selected option ID, correctness, submission timestamp, and response latency. A unique session/student/slide index currently allows one answer per question per student.
- An append-only `LiveSessionEvent` timeline records session controls, submitted-answer events, and student presence events. Answer events include selected option, correctness, and latency.
- The student client now reports presence transitions from `document.visibilitychange` only; window blur/focus and network disconnects are not behavior incidents. A hidden-document signal still cannot prove why a student left the lesson tab.
- The report endpoint and review page show question distributions, per-student answer ledgers and visibility events, refresh live reports, and provide browser print layouts.
- School admins and class-authorized teachers/department principals can open an active session as read-only observers; only its owning teacher can control it.
- Session history now supports class/subject filtering and pagination. New sessions resolve a canonical subject ID only when exactly one class subject matches the lesson's subject label; older/unmapped sessions remain in the unknown bucket and require explicit subject selection for grade conversion.

Relevant implementation: `controllers/liveLessonController.js`, `services/liveLessonService.js`, `models/LiveSession.js`, `models/LiveResponse.js`, `models/LiveSessionEvent.js`, `realtime/liveLessonsGateway.js`, and `client/src/pages/liveLessons/LiveLessonReviewPage.jsx`.

### Gradebook and classwork behavior

- Daily grade entry stores a student, subject, class, teacher, academic year, date, marks/max marks, title, remarks/notes, category/grade type, and an assessment group. See `models/Grade.js` and `controllers/gradebookController.js`.
- The grade entry page already supports classwork behavior rules; its modal calculates a bounded mark and puts selected rule explanations into remarks. Rules are currently teacher preferences, with local fallback and a best-effort profile copy.
- The implementation adds a nullable live-session link to `Grade`, a review-before-save classwork grade flow, and a gradebook-to-report link. Existing grades remain unchanged.
- Gradebook daily classwork summaries/emails select entries by classwork category and date. A grade marks/remarks alone will not provide a useful session answer detail view unless it is linked to the saved session report.

Relevant implementation: `models/Grade.js`, `controllers/gradebookController.js`, `client/src/pages/grades/GradeEntryPage/GradeEntryPage.jsx`, `client/src/components/grades/ClassworkBehaviorModal.jsx`, `client/src/components/grades/classworkBehaviorUtils.js`, and `client/src/pages/gradebook/GradebookPage/components/DailyClassworkEmailModal.jsx`.

## 3. Live lesson library and session history UX

The lesson and session tabs should work like a practical, searchable register on school Chromebooks and desktop PCs.

### Filters and saved selections

- Add class and subject filters to both **My lessons** and **Session history**, with **All classes**, **All subjects**, and a clear-filters action.
- Limit class choices to classes the current teacher can access. Update subject choices from the selected class's assigned subjects; changing class clears or revalidates the subject.
- On **My lessons**, class means the intended teaching/launch class: lessons are reusable and currently not class-owned. Make this explicit; filtering must not assign or restrict the lesson to that class.
- On **Session history**, filter records by captured class and canonical subject ID. Historical sessions without a canonical subject remain visible under **All subjects** and **Unknown / not set**.
- Persist each tab's selections independently per authenticated teacher and school. Revalidate restored IDs against current access; clear stale/inaccessible selections. Do not share saved preferences between teachers on the same browser.
- Keep filters, result counts, empty states, pagination, and navigation in one consistent query/state model.

### Pagination and table presentation

- Replace lesson/session cards with sortable, paginated tables; do not render an unbounded list.
- Lesson columns: title, subject, slide count, updated date, target class, and row actions (preview/edit/delete/start). Start must use the selected target class and be disabled with an explanation if none is selected.
- Session columns: title, class, subject, date/time, status, duration, and actions (open live session, report, replay, delete history).
- Use server-side filtering and pagination for session history, preserving teacher ownership and tenant checks. Client-side pagination is acceptable for a small reusable lesson library, with a migration path to server-side queries as it grows.
- Default to 25 rows; offer 10/25/50 page sizes, previous/next controls, total count, and “showing X–Y of Z”. Reset to page 1 when filters or page size change, and clamp pages if a filter reduces results.
- Sort lessons by most recently updated then title; sessions newest first. Where sorting is exposed, use stable tie-breakers and accessible sort labels.
- Optimize the layout for 1366×768 Chromebooks and desktop widths: compact filters, readable titles/dates, discoverable actions. At narrow widths, use horizontal table scrolling or an intentional responsive row layout without making text/controls unusable.
- Ensure keyboard navigation, visible focus, labelled filters/table headers, and announcements on result/page changes.

### Teacher-to-teacher lesson sharing

- Add a **Share** action to lessons a teacher or admin owns. The sender chooses an active teacher in the same school.
- Show incoming invitations in a **Shared with me** area with lesson title, sender, subject, slide count, and date. Recipients can accept or decline.
- Acceptance creates an independent copy owned by the recipient. They can launch it with their own target class and edit their copy without changing the sender's original or other copies.
- Track pending/accepted/declined/revoked state, sender, recipient, source lesson, timestamps, and school. Prevent duplicate pending invitations for the same lesson/recipient; permit a new share after a decision.
- Verify same-school active teacher roles, source ownership, and tenant scope on every create/list/accept/decline/revoke action. Never trust recipient IDs or ownership supplied by the client.
- Copy lesson content and safe lesson metadata only. Do not share session history, roster, student answers, grade links, or private notes. A recipient copy starts unassigned.
- Preserve origin/author attribution while identifying the current owner. Editing/deleting the source must not mutate/delete an accepted copy; revoking only cancels a pending invitation.
- Audit sharing state changes. Keep pending invitations separate from the recipient's owned lesson rows, while allowing accepted copies in the normal lesson filters and pagination.

Relevant touchpoints: `client/src/pages/liveLessons/LiveLessonsPage.jsx`, `LiveLessonsPage.css`, `controllers/liveLessonController.js` (`listLiveLessons`, `listLiveSessions`), `models/LiveSession.js`, teacher/class/subject selectors used by grade entry, and a new school-scoped lesson-share invitation model/service/routes.

## 4. Recommended report experience

### A. Session report available during and after the session

Keep the existing session report route and add a clearly structured report payload that works in both `live` and `ended` states:

- During a live session: show current roster, responses received so far, answered/unanswered counts, correctness, and focus-away periods so far. Refresh from the server periodically or subscribe to report updates through the existing WebSocket events.
- After a session ends: show the finalized report, final duration, all responses, participation timeline, and gradebook actions.
- Label an active report **Live report** and show “Updated at” time. Do not mark a student unanswered until the relevant question has closed or the report explicitly says the count is still in progress.
- Preserve the current report route's ownership and school-tenant checks. If a school administrator/principal needs access beyond the owning teacher, add it only through the existing role and class-assignment authorization rules.

### B. Student detail view

Selecting a student from the class table opens a student report panel/page with:

- Student name, class, subject (when resolved), lesson/session title, date, teacher, start/end/duration, and attendance/connection summary.
- Summary counts: submitted, correct, incorrect, unanswered questions, and accuracy. Clearly define accuracy as correct ÷ answered; separately display coverage as answered ÷ eligible questions.
- A chronological answer table with slide/question number and title, question prompt, answer options, student's selected answer, correct answer, correct/incorrect result, submitted time, and response time.
- Questions never opened, or questions the student did not answer, represented as “Not answered” only once that question is closed (or after the session ends).
- Optional teacher-only note area for instructional follow-up; do not let a note overwrite immutable response evidence.
- A **Print / Save as PDF** action. Use a print stylesheet and the browser's native print dialog (which supports “Save as PDF”) for the first implementation; avoid adding a PDF dependency until downloadable, server-generated PDFs are explicitly required.
- Respect lesson/session data retention: a deleted session removes its responses and events under current behavior, so a report/grade link must not imply that deleted session evidence is retained.

### C. Detailed class report

Provide a class-level report with:

- Session/class/subject/date/duration and report generation timestamp.
- Roster, joined/never-joined status, answered/correct/incorrect/coverage/accuracy, and away duration/away incidents per student.
- A question-by-question section with prompt, answer-option distribution, answered, correct, incorrect, unanswered, and correct percentage.
- A detailed answer ledger by student and question, including selected and correct answers.
- A presence timeline with joined/left/away/back events and total away duration.
- A **Print class report** button using the same print stylesheet; handle wide tables with repeated headers, page breaks, and student/question grouping.
- Filters for a single student and for question slides. Export should clearly state whether it includes one student or the whole class.

The report must distinguish **no response**, **not present/never joined**, and **not yet answered**. Do not collapse these into one “unanswered” state.

## 5. Answer record and report API design

`LiveResponse` is the authoritative response record. The teacher report joins each response against the immutable `lessonSnapshot.slides` question/options to produce display text; correct answers are not exposed through student APIs. The report endpoint returns class and student detail together, and the review page lets a teacher select a student for an individual view or printout.

Suggested report response shape:

```json
{
  "session": {
    "id": "...",
    "status": "live|ended",
    "title": "...",
    "class": { "id": "...", "name": "..." },
    "subject": { "id": "...", "name": "..." },
    "startedAt": "...",
    "endedAt": null,
    "updatedAt": "..."
  },
  "summary": {
    "rosterCount": 0,
    "joinedCount": 0,
    "questionCount": 0,
    "submittedAnswers": 0
  },
  "perQuestion": [],
  "perStudent": [],
  "answers": []
}
```

The frontend uses `LiveResponse` data for answer rows. Events remain the source for presence/session timelines. If answer revisions are later enabled, update the unique response model deliberately and define whether reports show latest answer or answer history; current behavior permits one final answer per question.

## 6. Subject identification prerequisite

The lesson's `subject` is a string snapshot, while grade entries require a `Subject` ObjectId. New sessions store a canonical subject ID only when exactly one subject assigned to the chosen class matches the lesson's subject label. Historical sessions without an ID require the teacher to choose a class subject before grade conversion; ambiguous text is never silently mapped.

Grade linking is unavailable until the class, selected/validated subject, academic year, and captured roster have been validated against the current school and teacher permissions.

## 7. Optional gradebook integration

The report provides **Add to daily classwork** through a preview/confirmation flow; opening or printing a report never creates grades.

### Implemented teacher workflow

1. Select/confirm a canonical class subject (preselected only from an unambiguous session subject), maximum mark, and behavior deduction rate. The session's date, class academic year, and semester configuration supply the grade metadata.
2. Calculate an initial mark from correct answers among questions that were actually opened, then show every roster student's answers, incidents, deduction, and proposed mark. Include absent/non-joined roster students as zero; allow the teacher to edit each mark.
3. Require explicit **Add reviewed grades to gradebook** confirmation. Do not send notifications.
4. Create one linked classwork/daily grade per session roster student and a gradebook column for the session so the entries also appear in spreadsheet view.
5. Make retry safe: a unique grade/session/student association and a unique session assessment group prevent duplicate entries on double click/retry. Existing linked entries return a conflict and are never overwritten.

### Grade model linkage

Add a nullable `liveSession` reference to `Grade` (with index) and make it available in gradebook APIs and report views. Enforce at most one linked classwork grade per `(school, liveSession, student)` using a partial unique index or an equivalent atomic upsert. If multiple grade entries per session/student are needed later, use a separately named assessment group/link model rather than silently weakening uniqueness.

Recommended metadata:

- `liveSession`: reference to source session.
- `gradingSource`: `live_session` identifies entries created from a session (without changing existing `manual` and `homework_submission` semantics).
- Stable session-specific grade title, e.g. lesson title + session date.
- A concise, human-readable remarks/notes summary; the detailed answer evidence stays in the live-session report, not copied into grade remarks.
- Preserve the standard grade fields (teacher, class, subject, year, date, category/gradeType, marks/maxMarks, semester/month derivation).

The gradebook row should display a session/details link or icon when `liveSession` is set. The daily classwork student detail/email/print views should offer an explicit **View session answers** link; existing summary emails should not embed confidential class answer ledgers by default.

### Authorization and atomicity

- Authorize against the current school, session teacher/role, class assignment, subject assignment, and every student in the captured roster.
- Validate IDs and mark/max-mark ranges server-side. Clamp only where the product explicitly specifies clamping; otherwise reject invalid teacher input and explain the error.
- Use a MongoDB transaction for the gradebook column and all student grade rows. If transactions are unavailable, surface the error rather than presenting a partial success.
- No broad catch or “success with zero grades” fallback.
- Do not notify students/parents automatically in the first release; adding grade rows can trigger grade notifications and should be a separate explicit option.

## 8. Behavior score and hidden-tab deduction

The live grade preview provides teacher-selectable **Off**, **-0.5**, or **-1 point per hidden-tab event**. Deductions are off by default, shown in the per-student preview, clamped so marks cannot become negative, and saved with the selected rate and incident count. Teachers can review and edit each proposed mark before saving.

Only new `presence:away` events with reason `visibility_hidden` are counted, and only during the session's started-to-ended interval. Blur/focus, heartbeat, disconnect, and legacy away events without a reason are not counted. This is still only a browser visibility signal: it does not establish intent or misconduct and can be affected by legitimate browser/device behavior.

## 9. Print and PDF behavior

First release:

- Print from the report view using a dedicated print layout and browser native print-to-PDF.
- Hide navigation, controls, filters, and interactive elements in print; include generation date, session identity, page numbers where supported, repeated table headers, and legible wrapping for long questions.
- Provide a student-only PDF/report path and a class report path. Do not rely on printing the replay player as the report.
- Print the timezone in use and use locale-aware timestamps; avoid ISO date truncation changing the day.
- Escape/sanitize question, answer, lesson, and student text rendered in HTML.

If schools later require a one-click downloaded PDF, evaluate a server-side PDF generator separately for deployment cost, Unicode/Arabic support, font embedding, and performance.

## 10. Data access, privacy, retention, and audit

- Session reports are student education records. Enforce tenant and class-level authorization on every report, answer detail, print payload, and grade-link API.
- A student can never query another student's answer detail. Student/parent access is out of scope unless a separate policy and endpoint are approved.
- Reuse the immutable roster snapshot so class membership changes after the lesson do not rewrite who was expected in the session. Validate active user/school identity for access, but report captured names consistently.
- Keep answer correctness hidden from students until existing session result-reveal policy allows it.
- Audit grade creation/update and behavior deductions: session ID, grade IDs, actor, timestamp, formula/configuration, previous/current marks where edited, and any override reason.
- Confirm data retention/deletion policy before adding long-lived grade references. If session deletion is blocked by linked grades, present a clear explanation and offer an authorized unlink/archive workflow rather than orphaning grade references.
- Prefer a session deletion policy that preserves grade integrity: prevent deletion while linked grades exist unless links are explicitly detached under audit, or archive the report snapshot if legal/product policy requires deleting raw session events.

## 11. Phased implementation

The original rollout was staged to reduce risk. Phases 1–4 were subsequently authorized together; grade writes remain explicitly previewed and teacher-confirmed.

### Phase 0 — Product rules implemented

These product choices are now implemented:

- Lesson class filter means the class to launch the reusable lesson with, not a permanent lesson assignment.
- First-use filter defaults are **All classes** and **All subjects**; remember selections separately for each teacher and school.
- Use 25 rows by default, with 10/25/50 options. Paginate session history on the server; lessons may be paginated in the client initially.
- Reports use browser Print / Save as PDF; no generated-PDF service in the initial scope.
- During a live session, report data refreshes periodically (recommend every 10 seconds) and clearly indicates it is still in progress.
- A hidden-tab signal is not proof of misconduct. Optional grade deductions are off by default and require teacher review.
- Lesson sharing is school-internal; acceptance creates an independent copy rather than shared co-editing. Show the source teacher for attribution.

**Exit gate:** The product defaults are recorded above; the report/list and gradebook work proceeded under them.

### Phase 1 — Improve lessons and session history lists (implemented)

Deliver the requested library UX independently of report and gradebook work:

1. Add class and subject filters on both tabs. Class changes update valid subjects and reset the page.
2. Save each tab's filters and page size per signed-in teacher and school; validate saved class/subject IDs against current access before restoring them.
3. Replace lesson/session cards with compact, responsive tables suitable for Chromebooks and desktop PCs.
4. Add pagination, accurate result counts, stable sorting, filter-aware empty states, and preserve row actions.
5. Make the lesson's selected class visibly the launch target. Keep existing session class as the actual class that hosted the session.
6. Add server-side session filters and pagination while preserving teacher ownership, school isolation, and class authorization. Keep lessons client-paginated until volume warrants server-side pagination.
7. Add same-school lesson sharing: send invitation, show recipient inbox, accept into an independent copy, decline, and revoke pending invitations.

**Tests and exit gate:** Verify class/subject filtering, stale preference cleanup, pagination boundaries and resets, stable sorting, action routing, and unauthorized cross-class/tenant requests. Sharing tests cover same-school authorization, ownership, duplicate invites, state transitions, copy/edit/delete independence, and excluding session/student data. Teachers can complete common actions using keyboard and mouse at 1366×768 without horizontal page-level scrolling; only the table container may scroll on smaller widths.

### Phase 2 — Student answers and printable reports (implemented)

Build the reporting feature without gradebook writes:

1. Extend the existing teacher report data with per-question option distributions and an answer ledger joined to the session's immutable lesson snapshot.
2. Add a student detail view for every roster member, including selected and correct answer, result, answer time, response time, and attendance/connection context.
3. Clearly distinguish a student who never joined, a question still open, and a closed question with no answer.
4. Add a detailed class report with question summaries, student summaries, and student-by-question answers.
5. Add Print / Save as PDF layouts for an individual student and the class; use browser printing and include session/class/date context.
6. For active sessions, refresh the report periodically and label provisional counts; ended sessions show finalized results.

**Tests and exit gate:** Report rows match persisted `LiveResponse` data; answer text and correct keys come from the session snapshot; authorization tests cover session ownership, tenant isolation, and student roster membership; print output is readable with long prompts and Arabic/RTL content. Opening or printing a report never changes a grade.

### Phase 3 — Optional classwork grade linking (implemented)

Grade linking is an explicit, teacher-confirmed action available from ended-session reports. It does not overwrite an existing linked entry and does not send family notifications.

1. Capture a canonical class subject ID on new sessions; require a teacher to choose/confirm subject for historical sessions where it is missing.
2. Add a session reference to classwork grades and a safe, explicit deletion/retention policy for linked sessions.
3. Add a preview screen showing included students, answer evidence, proposed marks, remarks, date, subject, and any existing grade that would be affected.
4. Default to teacher-entered/confirmed marks. Automatic participation or accuracy conversion is off until separately approved.
5. Save only after teacher confirmation, using idempotent writes and preventing accidental overwrite of existing manual grades. Do not send family notifications by default.
6. Show a link from the gradebook entry back to the source session report.

**Tests and exit gate:** Validate teacher/class/subject/student authorization, duplicate-submit retry, existing-grade conflict handling, mark ranges, audit metadata, and unchanged behavior for unrelated grade entries.

### Phase 4 — Teacher-configurable hidden-tab scoring (implemented)

Do not describe a visibility signal as proof of deliberate tab switching. The implemented options are Off, -0.5, or -1 point per recorded visibility-hidden event, chosen by the teacher for the session. The grade preview shows the deduction and allows per-student mark review before saving.

Treat the signal as **lesson tab hidden**, not misconduct; keep the feature off by default and never penalize ordinary network disconnects.

### Phase 5 — Scale and operational follow-up

Do this only when usage or school rollout requires it:

- Add indexes or pagination/streaming where measured report latency or session size requires them.
- Validate print output across supported browsers, keyboard/screen-reader use, and Arabic/RTL.
- Add operational metrics that avoid logging student answer text.
- Update teacher/admin documentation and release notes.

## 12. Acceptance criteria

### Implementation release (Phases 1–4)

- Lessons and session history filter by class and subject, restore teacher/school-specific choices, and use paginated, responsive tables.
- Lesson rows launch into the selected target class; session rows report the actual recorded class.
- Teachers and admins can share an owned lesson with an active same-school teacher; the recipient can accept or decline, and acceptance creates an independent copy usable with their own class without transferring session/student data.
- Teachers can see individual answers and detailed class results for live and ended sessions; live counts are marked provisional.
- Both report types print through the browser's Print / Save as PDF flow.
- Reports preserve tenant/class authorization; printing never writes grades. Grade writes occur only from the explicit preview-and-confirm flow.

### Gradebook integration (Phase 3)

- Grade linking is explicit, previewed, idempotent, auditable, and does not silently overwrite an existing manual grade.
- Gradebook entries navigate back to their session reports.

### Behavior controls (Phase 4)

- Hidden-tab deductions are optional, default off, selectable as 0, 0.5, or 1 point per event, visible in the preview, teacher-editable, and never described as proof of misconduct.

## 13. Main risks and mitigations

| Risk | Mitigation |
|---|---|
| A hidden-document event is mistaken for deliberate tab switching | Count only visibility events, keep deductions off by default, and require teacher review; never call the signal misconduct. |
| Incorrect or missing subject causes a grade to be posted to the wrong course | Resolve subject ID from class assignment; require confirmation for historical sessions; reject ambiguous mapping. |
| Double-click/retry creates duplicate grades | Transactionally create a gradebook column and session/student grade rows; enforce unique session/student linkage and return a conflict without overwriting. |
| Grade creation silently notifies families or changes averages | Preview effects; notifications opt-in only; preserve gradebook category/year/semester rules. |
| Long class reports become slow or unprintable | Paginate UI, aggregate server-side, optimize indexes, make print layout page-aware. |
| Session deletion leaves grade references broken or erases evidence unexpectedly | Block deletion of session/lesson history while linked grade entries exist. |
| Correct answers leak before reveal | Keep teacher report authorization separate from student session state and never reuse the teacher answer payload for student APIs. |
| Saved filters refer to a class the teacher can no longer access | Scope preferences by user and school, then revalidate restored IDs against authorized class/subject lists. |
| Reusable lessons are mistaken for class-assigned content | Label lesson class as a launch target; treat persistent lesson-to-class ownership as a separate product change. |
| Sharing exposes a lesson across schools or permits edits to the sender's source | Restrict recipients to active same-school teachers, verify owner and school on every action, and accept into a separate recipient-owned copy. |
| A copied lesson includes student data or changes when the source changes | Copy lesson content/metadata only; exclude sessions, rosters, answers, and grade links; keep accepted copies independent and attributed. |

## 14. Repository touchpoints for implementation

- Live report/API: `controllers/liveLessonController.js`, `routes/liveLessonRoutes.js`, `services/liveLessonService.js`.
- Lesson sharing: new school-scoped invitation model and routes/controller/service, plus sharing inbox/actions in `client/src/pages/liveLessons/LiveLessonsPage.jsx`.
- Live persistence and event semantics: `models/LiveSession.js`, `models/LiveResponse.js`, `models/LiveSessionEvent.js`, `realtime/liveLessonsGateway.js`, `client/src/hooks/useLiveLessonSocket.js`.
- Reports and printing: `client/src/pages/liveLessons/LiveLessonReviewPage.jsx`, `LiveLessonReviewPage.css`, `LiveLessonsPage.jsx`.
- Grade persistence and classwork behavior: `models/Grade.js`, `controllers/gradebookController.js`, `services/gradeService.js`, `client/src/pages/grades/GradeEntryPage/GradeEntryPage.jsx`, `client/src/components/grades/ClassworkBehaviorModal.jsx`, `client/src/components/grades/classworkBehaviorUtils.js`.
- Daily classwork display/communication: `client/src/pages/gradebook/GradebookPage/` and `client/src/pages/gradebook/GradebookPage/components/DailyClassworkEmailModal.jsx`.
- Existing live-session and grade access must be preserved; focused regression tests and authorization checks remain part of release validation.
