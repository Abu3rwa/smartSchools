# Feature: AI Lesson Summary Assignment (Upload File → Draft Title/Instructions → Ungraded)

## Goal
Let a teacher upload one file (PDF or photo) for a lesson. AI drafts a `title` and
`instructions` (a student/parent-facing summary) from it. The teacher reviews/edits the
draft, then saves it as an **ungraded** assignment: it never creates `Grade` documents,
never appears in the gradebook, and never sends a "graded" notification. It still follows
the normal assign/publish/notify and Google Classroom text-sync flow that other
assignments use today.

Google Classroom file attachments are explicitly **out of scope** for this feature (see
"Deferred: Classroom file attachment" at the end) — the uploaded file stays in the app's
own storage, same as existing assignment attachments.

## Verified current state (facts, not assumptions)
- `Assignment` schema ([server/models/Assignment.js](server/models/Assignment.js)): `maxMarks` is `required, min: 1`. There is no "ungraded" concept today.
- `AssignmentType` schema ([server/models/AssignmentType.js](server/models/AssignmentType.js)): `defaults.maxMarks` is `min: 1`.
- Default types are seeded in `ensureDefaultAssignmentTypes` in [server/controllers/assignmentTypeController.js](server/controllers/assignmentTypeController.js) (`DEFAULT_ASSIGNMENT_TYPES` array, upserted via `$setOnInsert` — raw `defaults` objects, not passed through `normalizeDefaults`, so seeding with `maxMarks: 0` is safe without touching that function).
- `normalizeDefaults`/`toPositiveNumber` in the same file rejects `<= 0` → falls back to `10`. This path only runs for admin-edited custom types (`createAssignmentType`/`updateAssignmentType`), not for seeding.
- Grading flow: `gradeAssignment` (assignmentController.js ~line 1287) is the **only** place `Grade` documents are created/updated for an assignment, triggered by `POST /assignments/:id/grades`. There is no automatic grade creation elsewhere.
- `getAssignmentGradebook` (~line 1184) builds the student/marks view for the Gradebook tab.
- `mapAssignmentSummary` (~line 142) is the single serializer used by create/update/list/publish responses — add any new field here once.
- `createAssignment` (~line 746) sets `maxMarks: parsePositiveNumber(body.maxMarks, Number(type.defaults?.maxMarks || 10))`. `parsePositiveNumber` (~line 113) falls back when value `<= 0`, so passing `0` directly won't work through it — must bypass it for ungraded assignments.
- `updateAssignment` (~line 1423) mirrors the same type/metadata resolution pattern as create.
- Existing AI-drafting precedent to mirror: `draftAssignmentQuestions` controller + `uploadAssignmentDraftSource` middleware (multer memory storage, PDF/JPEG/PNG/WebP, 10MB limit, field name `materialFile`) + `extractDocumentText` ([server/services/documentTextExtraction.js](server/services/documentTextExtraction.js)) + `assignmentQuestionAiService.js` (prompt building, `connectAi`, strict JSON parsing with retry, `logger.warn` on bad JSON). This whole pipeline is ephemeral — the uploaded buffer is never persisted, only used in-request.
- Route wiring lives in [server/routes/assignmentRoutes.js](server/routes/assignmentRoutes.js): `POST /assignments/ai/draft-questions` uses `authorize('teacher','admin')`, `requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS)`, `aiFeatureRateLimiter`, `uploadAssignmentDraftSource`.
- Client pattern to mirror: `AssignmentQuestionDrafter.jsx` (file picker → `assignmentService.draftQuestions` → `onDrafted(...)` callback that fills form state) and `assignmentService.draftQuestions` in [server/client/src/services/assignmentService.js](server/client/src/services/assignmentService.js) (FormData when a file is attached).
- `AssignmentRowActions.jsx` computes `canGrade = assignment.status === 'published' || assignment.status === 'closed'` (line 68) to show the "Enter Grades" menu item.

## Design decision
Implement as a **new dedicated Assignment Type** (`key: 'lesson_summary'`, name "Lesson
Summary"), always ungraded, rather than a toggle on every type. This keeps the gradebook
logic simple (`isGraded` is still added as a real column for safety/future-proofing, but in
practice only this type sets it to `false`) and gives teachers a clear, separate entry
point in the "Assignment Type" dropdown.

---

## 1. Data model changes

### [server/models/Assignment.js](server/models/Assignment.js)
- Change `maxMarks: { type: Number, required: true, min: 1, default: 10 }` → `min: 0`.
- Add new field:
  ```js
  isGraded: {
      type: Boolean,
      default: true
  },
  ```

### [server/models/AssignmentType.js](server/models/AssignmentType.js)
- Change `defaults.maxMarks` → `min: 0` (so a `lesson_summary` type with `maxMarks: 0` seeds without a schema validation error).

---

## 2. Seed the new Assignment Type

### [server/controllers/assignmentTypeController.js](server/controllers/assignmentTypeController.js)
Add an entry to `DEFAULT_ASSIGNMENT_TYPES` (e.g. `sortOrder: 15`, right after `homework`):
```js
{
    key: 'lesson_summary',
    name: 'Lesson Summary',
    sortOrder: 15,
    defaults: { maxMarks: 0, allowLateSubmission: false, notifyOnAssign: true, notifyOnGrade: false }
}
```
No other change needed here — seeding bypasses `normalizeDefaults`.

---

## 3. New AI drafting service

### Create `server/services/lessonSummaryAiService.js`
Mirror `assignmentQuestionAiService.js`'s structure (prompt builder → `connectAi` → strict
JSON parse with one retry → normalize/validate output). Export:
```js
export const draftLessonSummaryFromText = async ({ sourceText, usage }) => { ... }
```
- Prompt instructs the model: "You write a short teacher-authored title and a
  student/parent-facing summary of this lesson. This is informational only — it is never
  graded. Never invent facts not in the source. Reply as one JSON object:
  `{ "title": "...", "instructions": "..." }`."
- Cap `title` to 200 chars (schema `maxlength: 200`) and `instructions` to 5000 chars
  (schema `maxlength: 5000`) when normalizing the model's reply; trim whitespace.
- Reuse the same `parseJsonObject`-style helper (either export the one in
  `assignmentQuestionAiService.js` and import it, or duplicate the ~15 lines — prefer
  exporting/importing to avoid drift).
- Throw the same shape of `draftError(message, code, statusCode)` on invalid/empty output
  (e.g. `LESSON_SUMMARY_RESPONSE_INVALID`, `LESSON_SUMMARY_SOURCE_EMPTY`).

---

## 4. Backend controller + route

### [server/controllers/assignmentController.js](server/controllers/assignmentController.js)
1. Import `draftLessonSummaryFromText` from the new service.
2. Add a new controller, modeled directly on `draftAssignmentQuestions` but simpler (no
   Google Forms check, no lesson-plan source option — file is required):
   ```js
   export const draftAssignmentSummary = asyncHandler(async (req, res) => {
       if (!req.file) {
           return res.status(400).json({ success: false, code: 'DRAFT_SOURCE_REQUIRED', message: 'Upload a PDF or photo of the lesson.' });
       }
       const usage = { feature: 'assignment_lesson_summary_draft' };
       const extracted = await extractDocumentText({ buffer: req.file.buffer, mimeType: req.file.mimetype, usage });
       const result = await draftLessonSummaryFromText({ sourceText: extracted.text, usage });
       return res.json({
           success: true,
           data: {
               title: result.title,
               instructions: result.instructions,
               source: { kind: extracted.sourceType, characters: extracted.text.length, truncated: extracted.truncated }
           }
       });
   });
   ```
   (No `classId`/`subjectId` requirement needed here since nothing is saved — keep it
   minimal. If you want authorization parity with `draftAssignmentQuestions`, optionally
   still require/validate `classId`/`subjectId` + teacher-authorized check before calling
   the AI, for consistent rate-limit/permission behavior.)

3. In `createAssignment` (~line 896, where `maxMarks` is set):
   - Compute `const isGraded = type.key !== 'lesson_summary';`
   - Replace the `maxMarks` line with:
     ```js
     maxMarks: isGraded ? parsePositiveNumber(body.maxMarks, Number(type.defaults?.maxMarks || 10)) : 0,
     isGraded,
     notifyOnGrade: !isGraded ? false : (body.notifyOnGrade === undefined
         ? type.defaults?.notifyOnGrade !== false
         : parseBoolean(body.notifyOnGrade, true)),
     ```
   - Leave `notifyOnAssign` logic untouched (lesson summaries still notify on assign/publish, per the type's `defaults.notifyOnAssign: true`).

4. In `updateAssignment` (~line 1423 onward): find where `maxMarks`/`isGraded`-equivalent
   fields get applied to the document before `assignment.save()`. Apply the same rule:
   if the (possibly newly resolved) `type.key === 'lesson_summary'`, force
   `assignment.maxMarks = 0`, `assignment.isGraded = false`, `assignment.notifyOnGrade = false`,
   regardless of what the client sent. If an assignment is changed **away** from
   `lesson_summary` to another type, restore `isGraded = true` and apply the normal
   `maxMarks` resolution (`parsePositiveNumber`).
   - **Guard**: if the assignment already has `Grade` documents (shouldn't happen for a
     `lesson_summary` since grading is blocked, but check anyway) or if switching the type
     away from `lesson_summary`, no special guard is strictly needed since no grades could
     exist yet — but do NOT allow switching an assignment *into* `lesson_summary` once
     `Grade` documents already exist for it (query `Grade.exists({ assignment: assignment._id })`); return 400 "This assignment has grades and cannot become ungraded."

5. In `gradeAssignment` (~line 1287), right after the existing status check, add:
   ```js
   if (assignment.isGraded === false) {
       return res.status(400).json({ success: false, message: 'This assignment is not graded.' });
   }
   ```

6. In `getAssignmentGradebook` (~line 1184), include `isGraded: assignment.isGraded !== false`
   in the JSON response so the client can hide the marks UI entirely instead of showing an
   empty gradebook.

7. In `mapAssignmentSummary` (~line 142), add `isGraded: assignment.isGraded !== false,` to
   the returned object so every list/detail/create/update response carries it.

### [server/routes/assignmentRoutes.js](server/routes/assignmentRoutes.js)
- Import `draftAssignmentSummary` from the controller.
- Add a new route next to `ai/draft-questions`, reusing the same ephemeral-upload
  middleware (`uploadAssignmentDraftSource`, field `materialFile`) and rate limiter:
  ```js
  router.post(
      '/ai/draft-summary',
      authorize('teacher', 'admin'),
      requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
      aiFeatureRateLimiter,
      uploadAssignmentDraftSource,
      draftAssignmentSummary
  );
  ```

---

## 5. Client changes

### [server/client/src/services/assignmentService.js](server/client/src/services/assignmentService.js)
Add, mirroring `draftQuestions`:
```js
draftSummary: async (file) => {
    const formData = new FormData();
    formData.append('materialFile', file);
    const response = await api.post('/assignments/ai/draft-summary', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
}
```

### New component `server/client/src/pages/assignments/AssignmentsPage/components/LessonSummaryDrafter.jsx`
Mirror `AssignmentQuestionDrafter.jsx`'s file-picker + loading/error state, but simpler:
single file input (PDF/JPEG/PNG/WebP, 10MB client-side check same as the existing
component's `ACCEPTED_TYPES`/`MAX_FILE_BYTES`), one "Draft with AI" button, calls
`assignmentService.draftSummary(file)`, and on success calls
`onDrafted({ title, instructions })` so the parent form fills both fields. Reuse the same
`ERROR_KEYS` error-code → translation-key mapping style (map the new
`LESSON_SUMMARY_*` / `DOCUMENT_*` codes to i18n keys under a new
`assignments:lessonSummary.drafter.*` namespace).

### [CreateAssignmentForm.jsx](server/client/src/pages/assignments/AssignmentsPage/components/CreateAssignmentForm.jsx)
- When the selected assignment type's `key === 'lesson_summary'`:
  - Render `<LessonSummaryDrafter onDrafted={({ title, instructions }) => setForm(prev => ({ ...prev, title, instructions }))} />` above the title/instructions inputs.
  - Hide (or disable + grey out) the `maxMarks` input entirely; it's not sent/used.
  - Hide the "Notify on grade" toggle (always false server-side anyway).
  - Keep the normal attachments picker available — teachers can optionally also attach the
    same original file as a downloadable attachment (separate upload, same existing
    `attachments` field/flow — no backend change needed for this, it's just UX guidance:
    the teacher can pick the same file again in the attachments control).
- No new form field is required for `isGraded` — it's fully derived server-side from
  `assignmentTypeKey === 'lesson_summary'`.

### [AssignmentRowActions.jsx](server/client/src/pages/assignments/AssignmentsPage/components/AssignmentRowActions.jsx)
- Line 68: change
  ```js
  const canGrade = assignment.status === 'published' || assignment.status === 'closed';
  ```
  to
  ```js
  const canGrade = (assignment.status === 'published' || assignment.status === 'closed') && assignment.isGraded !== false;
  ```

### List/row display (wherever assignment rows render the type/marks badge — check `AssignmentsPage.jsx` / row component)
- Add a small "Not graded" / "Lesson Summary" badge when `assignment.isGraded === false`,
  and hide any "avg marks" column contribution for these rows (likely already naturally
  empty since no `Grade` rows will ever exist).

### i18n
Add new keys (both `en` and `ar` under `server/client/src/i18n/locales/{en,ar}/assignments.json`):
- `assignments:types.lessonSummary` (or rely on the server-seeded `name` "Lesson Summary" if the UI already renders `type.name` directly rather than a translated label — check existing pattern first; `googleForm` type likely already follows one of these two approaches, mirror it).
- `assignments:lessonSummary.drafter.*` (title, help text, button label, error messages — mirror the existing `assignments:googleForms.drafter.*` key shapes).
- `assignments:lessonSummary.notGradedBadge`.

---

## 6. Edge cases & validation checklist
- Uploading a file with no extractable text → `extractDocumentText` already throws
  `DOCUMENT_NO_TEXT`/`DOCUMENT_PDF_UNREADABLE`; the new controller just lets these
  propagate (same as `draftAssignmentQuestions` does).
- Teacher edits the AI draft before saving — nothing to enforce server-side, the save
  uses whatever `title`/`instructions` the client sends, same as any other assignment.
- Switching assignment type *into* `lesson_summary` on an assignment that already has
  grades must be rejected (see step 4's guard).
- `POST /assignments/:id/grades` on a `lesson_summary` assignment must return 400, not
  silently succeed.
- `getAssignmentGradebook` on a `lesson_summary` assignment should still respond 200 (so
  the UI doesn't hit an error state), just with `isGraded: false` so the client can swap
  in a "This assignment is not graded" message instead of the marks grid.
- Classroom sync (`syncAssignmentToClassroom`) needs no changes — it already ignores
  `maxMarks`-driven grading concepts and just posts title/description/links; double-check
  `maxPoints: Number(assignment.maxMarks || 0)` in `buildCourseWorkPayload`/`buildCourseWorkPatch`
  in [server/services/googleClassroomService.js](server/services/googleClassroomService.js) — `0` is a valid Classroom `maxPoints` (ungraded coursework), so no change required there either.
- Rate limiting: reuse `aiFeatureRateLimiter` so this doesn't bypass existing AI-cost
  controls.
- AI usage metering: pass `usage: { feature: 'assignment_lesson_summary_draft' }` through
  to `connectAi` so token spend is attributed separately from question-drafting, same
  pattern as `draftAssignmentQuestions`.

## 7. Test checklist
- Backend: create a `lesson_summary` assignment → `maxMarks === 0`, `isGraded === false`,
  `notifyOnGrade === false` in the saved doc and in the API response.
- Backend: `POST /assignments/:id/grades` on that assignment → 400.
- Backend: `GET /assignments/:id/gradebook` on that assignment → 200 with `isGraded: false`.
- Backend: `POST /assignments/ai/draft-summary` with a PDF → returns `{ title, instructions }`;
  with no file → 400 `DRAFT_SOURCE_REQUIRED`; with an unsupported mimetype → 400 from the
  multer `fileFilter` (same as today's `draftAssignmentQuestions` upload).
  with an unsupported mimetype → 400 from the multer `fileFilter` (same as today's `draftAssignmentQuestions` upload).
- Client: selecting "Lesson Summary" type shows the drafter, hides marks input; after
  drafting, title/instructions populate; "Enter Grades" action is absent/disabled for
  these rows in the assignments list.
- Regression: existing assignment types (`homework`, `quiz`, etc.) still require
  `maxMarks >= 1` and behave exactly as before (the `min: 0` schema relaxation must not
  let a graded type silently save with `maxMarks: 0` — keep `parsePositiveNumber`'s `<= 0`
  fallback-to-default behavior for all `isGraded === true` paths, which it already does).

---

## Deferred: Classroom file attachment
Per the earlier discussion in this conversation: today, Google Classroom sync
(`classroomPublishService.js` / `googleClassroomService.js`) only posts title,
description, due date, and `external_url`/Google Form links as coursework "materials" —
it never uploads the actual file bytes. The separate Google Drive OAuth integration
([server/services/googleDriveOAuthService.js](server/services/googleDriveOAuthService.js)) is read-only (`drive.readonly`) and is only wired into Curriculum's
Google Doc import, not assignments.

To make an uploaded lesson file show up as a real Classroom attachment (not just a link),
a **separate, larger follow-up** would be needed:
1. Add a `drive.file` OAuth scope (either folded into the existing Classroom/Forms/Gmail
   combined consent in `googleSuiteOAuthScopes.js`, or a new incremental-auth prompt).
2. On publish, upload the attachment buffer to the posting teacher's Drive via
   `drive.files.create`, capture the resulting `fileId`.
3. Add it to `buildCourseWorkMaterials`/`buildCourseWorkPayload` as a `driveFile` material
   (`{ driveFile: { id, shareMode: 'STUDENT_COPY' | 'VIEW' } }`).
4. Handle Classroom's patch limitation (materials can't be changed via `coursework.patch`
   — already noted in the existing code comments) by only setting materials at creation
   time, same as today's link-based materials.

This is intentionally **not** part of this prompt's scope — flagging it so it's a
deliberate decision to implement later, not an oversight.
