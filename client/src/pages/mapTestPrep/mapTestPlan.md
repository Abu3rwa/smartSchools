## Implementation Direction: Upgrade the Existing Feature

This plan updates the existing **MAP Test Prep** feature in place. Do not create a second MAP Practice feature, sidebar entry, or parallel frontend route. Keep the existing `/portal/map-test-prep` teacher entry and `/portal/map-test-prep/student` student entry, and evolve their screens and `map-test-prep` API surface to deliver this CSV-based workflow.

The current `MapTestRecord` / `MapPrep*` collections support the legacy MAP Growth evidence-analysis and AI-generated quiz workflow. Do not destructively reshape or delete those records. Add the CSV practice data structures needed by this plan, use them from the existing MAP Test Prep pages/routes, and preserve legacy data compatibility. The new CSV import, practice, and grading workflow must make no AI or external API calls; automatic grading is deterministic, and short-text items that do not match accepted answers go to teacher review. Any retained legacy AI actions must not be part of the new CSV practice flow.

The app already handles student data and teaching operations. The goal is to upgrade the existing MAP Test Prep feature without breaking unrelated features.

## Verified App Audit and Upgrade Plan

Audit date: 2026-09-29. This section records the current codebase facts and the implementation boundary so the CSV workflow is added to the existing feature rather than launched as a parallel feature.

### Existing app conventions

- Authentication is Express `protect` middleware validating a Bearer JWT. It loads `req.user`, `req.schoolId`, `req.school`, and academic-year context, then applies Mongoose tenant context. Firebase is in the stack for storage, but the current MAP feature authenticates through the app's JWT, not Firebase Auth.
- User roles are read from `req.user.role`. Teacher-to-class access should use `resolveTeacherProfile` and `getTeacherClassIds` from `helpers/teacherScoping.js`; admins remain school-scoped. Student access must resolve `Student` by both `{ user: req.user._id, school: req.schoolId }` and never trust a student ID sent by the browser for self-service endpoints.
- `Student.studentId` is required and has a unique compound index with `school`. The schema does not enforce a single global format, although school IDs commonly look like `S-000253`. Import matching must trim and exactly match the supplied ID inside the authenticated school; do not use a global lookup or fuzzy ID matching. Student login ownership is the `Student.user` reference.
- The existing student and class records are `models/Student.js` and `models/Class.js`. PLP goals exist (`PlpGoal` and related PLP models), so optional goal linking can be added after the core practice workflow without creating a competing goal system.
- The existing MAP feature is mounted at `/api/map-test-prep` by `server.js` through `routes/mapPrepRoutes.js`. The existing frontend entry points are `/portal/map-test-prep` and `/portal/map-test-prep/student`; the sidebar already has one MAP Test Prep entry for teachers/admins and students. Keep these routes and the feature gate; rename the existing navigation label to “MAP Practice” rather than adding a second entry.
- The current MAP frontend uses React, Axios, local component state, and page-specific CSS. The wider app uses React Router, Redux, MUI, and the existing theme. New MAP components should follow the current MAP page's styling while using shared app controls where practical.
- Current CSV/file upload uses Multer memory storage (`middleware/uploadMapPdf.js`), but it accepts one file per request and the current `parseMapCsv` service extracts MAP Growth evidence; it is not an RFC 4180 question-file parser. The new batch importer needs its own memory-only multi-file middleware and robust parser. Do not write uploads to Render's local disk.
- Existing `MapTestRecord` and `MapPrepPlan`, `MapPrepRound`, `MapPrepAnalysis`, `MapPrepQuestionSet`, `MapPrepQuiz`, and `MapPrepAttempt` implement the older MAP Growth evidence/AI-generated quiz flow. `MapPrepPlan.mapTestRecord` is required and unique; its question set lacks `multi_select` and the requested assignment/attempt model. Reusing or reshaping these schemas would risk existing records and behavior. Keep them intact and use separately named `MapPractice*` collections for CSV plans.
- The current MAP page already has teacher class/student selection, MAP import/review/generation, student quiz entry, and school feature gating. The CSV workflows will replace/evolve the visible MAP experience at these same entry points; no new top-level page, nav entry, or server mount is planned. Legacy records remain stored and the legacy APIs remain isolated from the new CSV flow. The new CSV workflow must never invoke the existing MAP AI services.
- No RFC 4180 CSV parser is currently declared in `server/package.json`; use `csv-parse` (or an equivalent maintained parser) for CSV quoting, BOM, CRLF, and embedded line breaks.

### Existing files to reuse or edit

Reuse without schema changes: `models/Student.js`, `models/Class.js`, `models/Teacher.js`, `middleware/auth.js`, `middleware/tenantIsolation.js`, `helpers/teacherScoping.js`, `middleware/featureGate.js`, the existing `mapPrepRoutes.js` feature gate, current Axios/auth client setup, current academic-year selector, and the existing Map Test Prep route/nav entries.

Edit only these existing files:

- `server/routes/mapPrepRoutes.js`: mount the new practice API router beneath the existing MAP API namespace and preserve the existing auth, school context, and feature gate.
- `server/client/src/pages/mapTestPrep/MapTestPrepPage.jsx` and `MapTestPrepPage.css`: replace/evolve the teacher screen into the specified Class overview, Review queue, Students, Import, and Settings tabs at the existing route.
- `server/client/src/pages/student/mapTestPrep/StudentMapTestPrepPage.jsx` and `StudentMapTestPrepPage.css`: replace/evolve the current quiz screen into My practice, player, results, and progress at the existing student route.
- `server/client/src/i18n/locales/en/layout.sidebar.json` and `server/client/src/i18n/locales/ar/layout.sidebar.json`: rename the existing sidebar label, without adding a new item.
- `server/package.json` and `server/package-lock.json`: add the maintained CSV parser dependency.
- `server/README.md`: add the requested CSV/import/feedback-mode reference.

No edit is planned for `server/server.js`, `server/routes/index.js`, or `client/src/App.jsx`: the current server mount and both React routes already exist. Existing `MapPrep*` models and legacy AI controllers are not to be destructively reshaped. Remove/hide legacy AI actions from the updated user flow; do not call them from the CSV practice import, grading, or student routes.

### New files planned

Backend models, all with `school` scoping and tenant isolation:

- `server/models/MapPracticeSkill.js`
- `server/models/MapPracticePlan.js`
- `server/models/MapPracticePlanSkill.js`
- `server/models/MapPracticeSet.js`
- `server/models/MapPracticeQuestion.js`
- `server/models/MapPracticeAssignment.js`
- `server/models/MapPracticeAttempt.js`
- `server/models/MapPracticeImportBatch.js`
- `server/models/MapPracticeSettings.js`

Backend request handling and services:

- `server/routes/mapPracticeRoutes.js`
- `server/controllers/mapPracticeImportController.js`
- `server/controllers/mapPracticeController.js`
- `server/controllers/mapPracticeAttemptController.js`
- `server/controllers/mapPracticeReviewController.js`
- `server/middleware/uploadMapPracticeCsv.js`
- `server/validators/mapPracticeValidators.js`
- `server/services/mapPracticeCsvService.js`
- `server/services/mapPracticeImportService.js`
- `server/services/mapPracticeAccessService.js`
- `server/services/mapPracticeService.js`
- `server/services/mapPracticeGradingService.js`
- `server/services/mapPracticeStatsService.js`

Frontend modules under the existing pages:

- `server/client/src/pages/mapTestPrep/components/` for teacher tabs, per-student detail, assignment/review dialogs, import file cards, and reusable question/skill views.
- `server/client/src/pages/mapTestPrep/utils/` for safe inline-markup rendering and teacher presentation helpers.
- `server/client/src/pages/student/mapTestPrep/components/` for student home, accessible player, review/submit flow, results, and progress.
- `server/client/src/pages/student/mapTestPrep/hooks/` for student practice data, autosave/resume, speech, and persisted text-size preference.

Tests, fixtures, and downloadable files:

- `server/tests/mapPracticeCsvService.test.js`
- `server/tests/mapPracticeImportService.test.js`
- `server/tests/mapPracticeGradingService.test.js`
- `server/tests/mapPracticeAccess.test.js`
- `server/client/public/map_practice_template.csv`
- `server/client/public/map_practice_example_student_1.csv`
- `server/client/public/map_practice_example_student_2.csv`

Sample CSVs will use clearly identified example IDs. To import into a real school, replace them with that school's actual IDs or select the intended student in the manual-match step; never fabricate a match to a production student.

### Decisions that make the specification implementable

- New records are namespaced as `MapPractice*`; skill codes are unique per school (`school + code`), not shared across unrelated school tenants. A plan is upserted by school, student, and stable normalized plan key derived from `plan_title` (or the filename when blank). A question is upserted by school, plan, and `question_id`; a set by school, plan, and `set_id`.
- A file must have the specified headers, one consistent student ID value across its nonblank rows, unique question IDs, and consistent passage content. Resolution order is: valid CSV `student_id`; otherwise a valid ID parsed from the filename; otherwise teacher selection. A recognized CSV/filename ID that conflicts with a manual selection is a blocking error, not an override.
- Preview is read-only for curriculum/plans/questions/assignments. The server returns per-file validation and match results with a short-lived signed token containing file hashes, school/user, resolved student, and expiry. Commit re-uploads the selected files, verifies hashes/token/authorization, and writes a `MapImportBatch` only after explicit confirmation. No temporary question data is persisted to local disk or to student-visible collections during preview.
- Commit atomicity is per file. In stop-on-error mode, an invalid file writes nothing; other valid files can commit only if the teacher confirms the batch and the UI clearly shows which files will commit. In skip-errors mode, valid rows are upserted and skipped rows are recorded in the batch/error CSV.
- Missing questions on re-import are never deleted. They are reported as “Not in new file”; teacher archive is a separate soft action. Attempts retain question/answer-key snapshots so edits never rewrite history.
- Student API responses use explicit serializers. In after-submit and after-review modes, answer keys/explanations are not included before the permitted feedback moment. Short-text unmatched responses remain pending teacher review. Teacher/admin endpoints verify class scope server-side on every request.
- Examples are templates rather than hard-coded production students. Acceptance testing substitutes two enrolled test students' exact `studentId` values or uses the explicit manual picker.

### Implementation order and gates

1. Add models, validators, in-memory multi-file upload, CSV parser, preview hash token, and isolated CSV service tests. Gate: malformed quoting, BOM/CRLF, embedded newlines, Unicode, passage mismatch, student matching, and all specified row errors are covered before commit exists.
2. Add authorized preview/commit, skill matching, plan/set/question upsert, archiving, import batch/error report, and import tests. Gate: stop mode has no partial writes for an invalid file; repeat imports are idempotent; two students' plans remain isolated.
3. Add deterministic grading, attempt snapshots/autosave, student-only selectors, settings, teacher review/override, assignments, and per-skill statistics. Gate: key secrecy is verified via API tests for every feedback mode and a student cannot access another student's IDs.
4. Update the existing teacher/student pages into the specified tabs/player/detail/review experiences and retain the current feature route/nav. Add keyboard, tablet, text-size, read-aloud, reduced-motion, and safe-markup behavior.
5. Add two 15-row example files and the README reference. Run focused CSV/grading/access tests, client lint, relevant existing MAP tests, and smoke checks for old Map Test Prep records/routes. Do not run a production build unless explicitly requested.

=====================================================
1. WHAT WE ARE BUILDING
=====================================================
Every student has their own personalized MAP practice file. I create one CSV per student, based on that student's own MAP Growth results, so each student has DIFFERENT skills, questions, and difficulty. I import the CSVs. Students answer the questions inside the app. The system grades what it can. The teacher reviews each student's results and follows up.

Key consequences (design everything around these):
- A student's skills come from THEIR file. There is no fixed class-wide skill list and no class-wide question bank.
- Students never see other students' skills, scores, or files.
- The teacher's main unit of work is the individual student. Class views are rosters and summaries, not shared-column grids.

=====================================================
2. STEP 0 – AUDIT BEFORE CODING (do not skip)
=====================================================
1. Read the codebase and report: how auth and roles work (student/teacher/admin, and whether Firebase Auth or another method is used), the existing models for students, classes, and goals, API and route conventions, frontend routing, state management, the UI component library and theme, and how file uploads are handled today.
2. List which existing files/models you will REUSE and which NEW files you will create. Prefer new files (models, routes, controllers, pages, components). Only touch existing files for minimal wiring (register routes, add nav links). List every existing file you plan to edit and why.
3. Find out how students are identified (the student ID format, for example "S-000253") and how a student maps to a login account. The import must match files to students by this ID.
4. Proceed without waiting unless you find a conflict.

=====================================================
3. CSV FORMAT – ONE FILE PER STUDENT
=====================================================
UTF-8 with or without BOM, header row required, standard RFC 4180 quoting (commas, quotes, and line breaks inside cells are allowed). File name convention (recommended, not required): STUDENTID_shortname.csv, for example S-000253_fall-map-01.csv.

Columns (one row per question):
student_id, plan_title, set_id, set_title, set_order, question_id, order, subject, strand, skill_code, skill_name, rit_band, passage_id, passage_title, passage_text, question_type, stem, option_a, option_b, option_c, option_d, correct_answer, explanation, distractor_note, points

Rules:
- student_id: required on every row and identical within a file. Must match an existing student. This is how the file identifies its owner.
- plan_title: optional, for example "Fall 2026–27 MAP focus". Groups the file's sets into one plan. Default: file name.
- set_id and set_title: group questions into sets. set_order controls the order of sets in the plan.
- question_id: unique WITHIN this student's plan (not globally). The same ID in another student's file is a different question.
- skill_code: an uppercase slug such as VOC-CONTEXT or MECH-COMMA-APPOSITIVE. skill_name: the readable name ("Context clues"). Skills are created on import if they don't exist yet (see section 5). The same code always means the same skill for every student, so results can be compared later if I want.
- rit_band: text such as "201-210", used for display and filtering.
- passage_id, passage_title, passage_text: optional, and repeated on every row that uses the passage. The importer de-duplicates by passage_id within the file and shows an error if two rows have the same passage_id with different text.
- question_type: mcq | multi_select | short_text.
- correct_answer: a letter for mcq ("B"); pipe-separated letters for multi_select ("A|C"); pipe-separated accepted answers for short_text ("well-known|well known").
- Blank option cells mean "no such option" (support 2 to 4 options).
- Limited, sanitized inline markup in stem, options, explanation, and passage_text: *italic*, __underline__, **bold**, and line breaks. This is needed for titles of works. No raw HTML. Sanitize on render.
- points: default 1.
Provide a downloadable blank template and a downloadable example CSV.

=====================================================
4. DATA MODEL (new collections; adapt naming to my conventions)
=====================================================
- MapSkill: code (unique), name, subject, strand, description, createdFromBatch. Global, so the same skill is named consistently across students.
- MapPlan: student (ref), title, season/label, status (active | archived), skills used (derived), createdFromBatch, timestamps. A student can have several plans over time; one is active.
- MapPlanSkill: plan, student, skill, status (active | improving | mastered), targetAccuracy (default 80), teacherNote. Created automatically from the skills present in the imported file.
- MapSet: plan, student, setId, title, order, question count, estimated minutes, status.
- MapQuestion: plan, student, questionId (unique per plan), set, skill (ref), ritBand, passage (embedded or ref), questionType, stem, options [{key, text}], correctAnswer, explanation, distractorNote, points, order, active, contentHash.
- MapAssignment: student, set(s), assignedBy, dueDate (optional), status, createdAt. Importing a plan creates the sets as "available" but does NOT assign them; the teacher chooses what to assign (and can bulk assign at import time).
- MapAttempt: student, set, assignment (optional), startedAt, submittedAt, timeSpentSeconds, status (in_progress | submitted | reviewed), score, maxScore, answers [{question, response, isCorrect (null = pending review), autoGraded, teacherOverride, teacherComment, timeSpentSeconds, flagged}]. Snapshot the question text and correct answer into the attempt at submit time so later edits never rewrite history.
- MapImportBatch: importedBy, files [{name, studentId, rows, created, updated, skipped, errors}], newSkills created, timestamp.
Indexes: (student, set), (student, skill), (plan, questionId) unique, attempts by (student, submittedAt).

=====================================================
5. IMPORT FEATURE (teacher/admin only)
=====================================================
Page: "Import student practice files".

Behavior:
- Accept ONE OR MANY CSV files at once (drag and drop or file picker). Each file is processed independently and shown as its own card.
- Matching: read student_id from the file. If missing or unmatched, fall back to the student ID found in the file name. If still unmatched, the card shows a student picker (searchable dropdown) so the teacher can choose the student; this choice is applied to all rows in that file.
- Server-side parsing with a robust CSV library; handle BOM, CRLF, embedded commas/quotes/newlines, Arabic and other non-Latin text.
- TWO STEPS: (1) dry-run validation and preview, (2) explicit "Import" confirmation. Nothing is written in step 1.
- Validation per file: required fields; student exists; question_type valid; mcq has exactly one correct answer; correct_answer keys exist among the options; no duplicate question_id within the file; passage consistency; points is numeric; skill_code format valid (uppercase letters, digits, hyphens).
- New skills: any skill_code not yet in the database is listed in a "New skills" panel (code, name, number of questions) with a checkbox "Create these skills" (default on). If a new code looks very similar to an existing one (for example MECH-COMMA-APOS vs MECH-COMMA-APPOSITIVE, or same name with a different code), show a warning "Looks like an existing skill" with a "Use existing skill" option.
- Upsert: re-importing a file updates questions by (plan, question_id) instead of duplicating. Never delete questions missing from the new file; instead, list them as "Not in new file" and offer "Archive" (soft-remove from student view). Editing a question that already has answers does not change stored attempts.
- Error mode toggle per import: "Stop if any row has an error" (default) or "Import valid rows and skip errors".
- Downloadable error report (CSV) with file, row, column, problem, and how to fix it.
- Optional at import: "Assign first set to the student now" with a due date.
- Record a MapImportBatch. Handle up to 30 files and 2,000 rows per file. Parse in memory or stream (no local disk persistence on Render).

=====================================================
6. STUDENT EXPERIENCE (UI/UX – be specific, follow the existing app's theme)
=====================================================
Audience: Grade 5 students (about 10 years old), many on tablets or shared classroom computers. Language: plain, friendly, encouraging, sentence case, active verbs. Never shame: use "not yet" and "look again", not "wrong" or "failed".
Accessibility for all student pages: keyboard navigation, visible focus, screen-reader labels, color is never the only signal (pair with an icon or text), tap targets at least 44px, text-size control (small/medium/large) that persists, and a "Read aloud" button for the passage and the question (use the browser SpeechSynthesis API when available; hide the button if unsupported). Respect reduced-motion.

6.1 "My practice" (student home)
- Top: "Hi <first name>" and one line such as "You have 2 sets to finish this week."
- Section "To do": cards for assigned sets, sorted by due date. Each card: set title, subject and skill chips, question count and estimated minutes, due date badge (neutral, "Due soon" amber, "Overdue" red plus icon), progress bar with "3 of 10 answered", and one primary button ("Start" or "Continue").
- Section "My focus skills": ONLY this student's skills, shown as compact rows: skill name, a progress bar, accuracy %, and a small text label (Getting started / Improving / Strong). Show "Not enough answers yet" when fewer than 3 answers. Tapping a skill filters "Practice more" to that skill.
- Section "Practice more": available (unassigned) sets from this student's own plan, grouped by skill, marked "Optional". Hide the section if the teacher turned self-practice off.
- Section "Finished": last 5 finished sets with score and a "Reviewed" badge when the teacher has reviewed it.
- Empty state (nothing assigned): "Nothing assigned right now. Pick an optional set below or ask your teacher."

6.2 Practice player
- Layout on wide screens: the passage on the left (sticky, scrollable) and the question on the right. On phones/tablets in portrait, the passage sits above the question in a collapsible panel ("Show passage / Hide passage"). No passage → single centered column.
- Header: set title, "Question 4 of 10", a segmented progress bar (one segment per question; states: answered, flagged, current, empty; clicking a segment jumps to that question), and a "Save and exit" link.
- Question card: stem, a small hint line ("Choose one answer" / "Choose all that apply" / "Type your answer"), large answer buttons for mcq/multi_select (radio/checkbox semantics, letter badge + text), a text input for short_text.
- Underlined or italic words in the stem (from the markup) must render clearly.
- Actions: "Flag for later" (toggle), "Back", and "Next". On the last question "Next" becomes "Review answers".
- Autosave on every change (debounced); a subtle "Saved" indicator; offline/failed save shows "Not saved yet. Trying again" and retries. Resume exactly where the student left off.
- Optional per-set timer (teacher setting): show a calm elapsed-time display, never a countdown that causes stress unless the set is configured as timed.
- Review screen before submit: a grid of question numbers with status (answered, skipped, flagged); "Go to question" links; "Submit set" is disabled until the student confirms in a dialog: "You answered 9 of 10. Submit anyway?"
- Feedback modes (teacher setting per set): (a) instant, "Check answer" after each question shows correct/not yet plus the explanation; (b) after submit; (c) after teacher review. In modes (b) and (c), NEVER send correctAnswer or explanation to the client before the allowed moment.
- Correct feedback: green check icon + "Correct" + explanation. Incorrect: blue-amber "Not quite" + explanation + "Try to remember this rule" line (use the explanation); never red X icons.

6.3 Results page (after submit)
- Header: set title, score as "9 of 12", a simple bar, and a status badge (Submitted, Reviewed).
- If some answers await teacher review: "2 answers are waiting for your teacher."
- Teacher comment card (when present).
- "Look again" list: each missed question with the student's answer, the best answer, the explanation, and the skill chip. Filter by skill.
- Buttons: "Practice this skill" (opens an optional set for that skill if one exists) and "Back to my practice".

6.4 "My progress" (student)
- Per-skill accuracy trend lines or bars for only this student's skills, over time. Plain-language summary at the top ("You improved most in Context clues"). Do not show percentile comparisons with classmates.

=====================================================
7. GRADING
=====================================================
- mcq and multi_select: auto-grade at submit (multi_select needs an exact match; partial credit is a teacher setting, default off).
- short_text: normalize (trim, lowercase, collapse spaces, normalize curly/straight quotes and dash types, strip trailing punctuation) and compare with accepted answers. No match → isCorrect = null and the item goes to the teacher review queue (never auto-marked wrong).
- Teachers can override any item, add a comment, and mark an attempt as reviewed. Overrides never change the answer key.

=====================================================
8. TEACHER EXPERIENCE (UI/UX – be specific)
=====================================================
Audience: a busy teacher on a laptop, sometimes on a tablet. Priorities: see who needs help within 10 seconds, and act in 2 clicks. Use tables that sort and filter, keep headings short, and show counts on tabs.

Navigation: MAP Practice → tabs: "Class overview", "Review queue (count)", "Students", "Import", "Settings".

8.1 Class overview (roster, NOT a shared-skill grid)
- Filter bar: class/group, "Needs follow-up only" toggle, search by name.
- Roster table, one row per student. Columns: Student (avatar + name), Active plan (title), Focus skills (up to 3 chips showing that student's weakest skills, with "+2 more"), This week (assigned/finished, for example "1 of 2"), Accuracy (last 20 answers, with a small colored dot + number), Last practice (relative date), Status chip (On track / Needs follow-up / No activity in 7 days / Not started), and a "Open" button.
- Sorting on every column. Default sort: Needs follow-up first.
- Row expansion (chevron) shows the student's skills as small bars for a quick look without leaving the page.
- Summary cards above the table: "Sets finished this week", "Waiting for your review", "Need follow-up". Each card is clickable and applies the matching filter.
- Empty state (no plans imported): illustration-free message "No practice files imported yet." with a button "Import student files".
- A "Skill view" toggle switches the roster to show, for a chosen skill, ONLY the students who have that skill in their plan, with their accuracy. Students without that skill are not shown (no empty cells). This is the only cross-student skill view.

8.2 Student detail page (the teacher's main working page)
- Header: name, class, active plan title, MAP context line if available ("Reading RIT 211, Language RIT 209" from the optional student MAP profile; show nothing if not entered), and actions: "Assign a set", "Import/replace file", "Print progress".
- Left column: "Skills in this plan". Each skill card: name, accuracy %, number of answers, status control (Active / Improving / Mastered; teacher can change), target accuracy, a sparkline of the last attempts, and a private teacher note field (autosave). Skills with fewer than 3 answers show "Not enough answers yet" instead of a percentage.
- Right column tabs: "Sets", "Missed questions", "Timeline".
  - Sets: table of the plan's sets with status (Not assigned, Assigned, In progress, Submitted, Reviewed), score, date, and row actions (Assign, Review, View attempt, Reassign for another try).
  - Missed questions: filter by skill and set. Each row: skill chip, question (truncated, expandable), student's answer, correct answer, attempt count, and a "Pin for follow-up" toggle.
  - Timeline: a chronological feed (assigned, started, submitted, reviewed, comment added) with dates.
- Bottom action bar: "Assign targeted practice" opens a dialog: choose skill(s) → the app suggests unseen sets or questions from THIS student's plan for that skill; choose due date; choose feedback mode; "Assign".
- Empty state for a student with no plan: "No practice file for <name> yet." + "Import file" button.

8.3 Attempt review page
- Top: student, set, score, time spent, status.
- One card per question in order: passage (collapsible), stem, student's response, correct answer, explanation, auto-graded result. Controls per item: "Mark correct" / "Mark not yet correct" (override), and a comment box. Pending short_text items are highlighted at the top.
- A "Next pending" button jumps to the next item needing review.
- Footer: overall comment box, "Save draft", and "Mark as reviewed" (which notifies the student in-app if the app has notifications).

8.4 Review queue
- Table of all short_text answers waiting for review across students: student, set, skill, question, student's answer, accepted answers, and quick buttons "Correct" / "Not yet" / "Open". Keyboard shortcuts: C, N, and arrow keys to move. Bulk actions on selected rows.

8.5 Import page (UI details)
- A large drop zone: "Drop student files here or choose files". Below it, file cards appear, each with: file name, detected student (with an avatar and ID) or a student picker, rows found, and a status chip (Ready, Needs attention, Has errors).
- Each card expands to: the list of sets found (title and count), the skills found (chips with counts), a "New skills" area with checkboxes and similar-skill warnings, and an errors table (row, column, problem, how to fix).
- A sticky bottom bar: totals ("6 files ready, 1 with errors"), the error-mode toggle, an optional "Assign first set now" control, and the primary button "Import 6 files" (disabled while there are blocking errors in "stop" mode).
- After import: a success summary listing what was created or updated per student, with links to each student detail page, and a "Download error report" if rows were skipped.
- Also provide "Download blank template" and "Download example file" links.

8.6 Settings
- Defaults: feedback mode, self-practice on/off, show timer on/off, low-accuracy threshold for "Needs follow-up" (default 60%), minimum answers before showing a skill accuracy (default 3), "no activity" days (default 7).

=====================================================
9. OPTIONAL INTEGRATION WITH THE EXISTING GOALS/PLP FEATURE
=====================================================
Only if that feature exists in the code (check in Step 0). From a student's skill card, add "Create goal from this skill" that pre-fills a short-term goal and sub-goals linked to specific sets. Attempt results should update progress on the linked sub-goal and appear on the student's evidence page. Do not add new AI calls unless one already exists.

=====================================================
10. NON-FUNCTIONAL REQUIREMENTS
=====================================================
- Do not change existing behavior, schemas, or routes except for minimal wiring. Any change to an existing model must be additive and backward compatible.
- Role-based authorization on EVERY new endpoint, enforced on the server: a student can read only their own plan, sets, attempts, and results; a teacher can read only students in their classes (follow the app's existing rules); only teachers/admins can import.
- For in-progress attempts, never send correctAnswer or explanation to the client unless the feedback mode allows it.
- Paginate list endpoints; do not include long passages in list responses.
- Consistent validation and error responses following the app's conventions. Show friendly, specific error messages in the UI; log details on the server.
- Performance: roster loads in under 2 seconds for 100 students; use aggregation or precomputed per-skill stats updated at submit time.
- Responsive from 360px wide; the player and student pages work on tablets in portrait and landscape.
- Use the app's existing design tokens and components. Support the app's dark mode if it has one.
- Privacy: do not log student answers or personal data to third parties. Do not add any AI/external API calls in this module.

=====================================================
11. DELIVERABLES
=====================================================
1. A short plan listing new and edited files (from Step 0), and confirmation of how the student ID matching works in this codebase.
2. Backend: models, routes, controllers, services (CSV parsing and validation, matching, skill creation, grading, per-skill statistics) and tests.
3. Frontend: student pages (6.1 to 6.4), teacher pages (8.1 to 8.6), and shared components, in the existing app's style.
4. Two sample CSV files for two different sample students with DIFFERENT skills (for example one with vocabulary word-part and context-clue skills and one with comma and hyphen skills). Each file: about 15 rows, all three question types, at least one passage-linked question, one question using italic/quotation-mark title markup, and one short_text question. They must import cleanly.
5. Tests: CSV validator, student matching (column, file name, manual pick), skill creation and similar-skill warning, grading (including short_text normalization), and authorization (a student cannot read another student's data).
6. A README section: CSV column reference, file naming, how to import, how to add or merge skills, and how each feedback mode behaves.

=====================================================
12. ACCEPTANCE CHECKS (verify and report each)
=====================================================
- Two sample files for two different students import in one batch, each attached to the right student, each with its own skills; neither student can see the other's data.
- Re-importing a file updates its questions instead of duplicating them; removed questions are listed as "Not in new file".
- A file with an unknown student, a duplicate question_id, a wrong correct_answer letter, and a bad skill_code shows four clear row-level errors and, in "stop" mode, imports nothing.
- A new skill_code close to an existing one triggers the "Looks like an existing skill" warning.
- A student can start, leave, resume, and submit a set, and cannot obtain the answer key early through the API.
- A short_text answer that doesn't match goes to the review queue rather than being marked wrong.
- The roster shows per-student focus skills; "Skill view" lists only students who have that skill.
- The teacher can assign targeted practice from a student's skill card, review an attempt, override an item, and mark it reviewed; the student sees the result and comment.
- All pre-existing features still work (run the existing tests and smoke-test the main flows).