# Feature: Google Drive Attachments for Assignments (separate from existing uploads)

This turns the "Deferred: Classroom file attachment" note at the bottom of
[assignment-lesson-summary-ai-upload-prompt.md](assignment-lesson-summary-ai-upload-prompt.md)
into a full, standalone plan.

## Goal

Let a teacher attach a file by uploading it straight to **their own Google Drive**
(not Firebase), so that:

- The resulting file shows up as a **real Google Classroom attachment** (a `driveFile`
  material), not just a clickable link the way today's `links[]` are.
- The Drive link is included anywhere the assignment's existing links are already
  surfaced to students/parents (portal view, reminder content).
- This is a **brand-new, separate button and UI section** — the existing local-file
  "Add File" attachments (stored in Firebase) and the existing "Add Link" external URLs
  must keep working exactly as they do today, completely untouched, side by side with
  the new Drive section.

## Verified current state

Two existing, separate ways to attach something today — **do not merge the new feature
into either of these**:

1. **Local file upload → Firebase private storage**: `uploadAssignmentAttachments`
   middleware ([server/middleware/uploadAssignmentAttachments.js](server/middleware/uploadAssignmentAttachments.js), multer memory storage, 10MB/5 files,
   PDF/DOCX/PPTX/XLSX/images only) → `uploadAttachmentFiles()` in
   [server/controllers/assignmentController.js](server/controllers/assignmentController.js) → `assignment.attachments[]`
   (`fileName`, `mimeType`, `size`, `storageKey`, `url`) → downloaded via a Firebase
   signed URL (`getAssignmentAttachmentUrl`). Client:
   [AttachmentEditor.jsx](server/client/src/pages/assignments/AssignmentsPage/components/AttachmentEditor.jsx),
   `assignmentService.js` (`attachmentFiles` / `existingAttachments` / `removeAttachmentIds`).
2. **External URL links**: `assignment.links[]` (`type: 'external_url'`, `title`, `url`),
   edited via `LinkEditor.jsx`. These, plus a generated Google Form responder link,
   become Classroom **link materials** in `buildCourseWorkMaterials()`
   ([server/services/googleClassroomService.js](server/services/googleClassroomService.js)) — Classroom only ever gets a _link_
   today, never the uploaded file's bytes, because Classroom's real file attachment
   (`driveFile` material) needs a Google Drive file ID, and the app has never uploaded
   anything to Drive on a teacher's behalf.

Supporting facts:

- Google Drive OAuth **already exists, but read-only and Curriculum-only**:
  [server/services/googleDriveOAuthService.js](server/services/googleDriveOAuthService.js) requests `drive.readonly` only, wired
  solely into `CurriculumPage` for importing a Google Doc's text
  (`getGoogleDriveAuthUrl`/`getGoogleDriveStatus`/`disconnectGoogleDrive` in
  `curriculumService.js`, [server/routes/googleDriveAuthRoutes.js](server/routes/googleDriveAuthRoutes.js)). It cannot write files and must not
  be repurposed in place — Curriculum's call sites assume read-only scope.
- Token storage shape already exists on the user: `User.googleDriveTokens` with
  `hasGoogleDriveConnected()` / `googleDriveTokenNeedsRefresh()` /
  `updateGoogleDriveTokens()` / `clearGoogleDriveTokens()` helpers in
  [server/models/User.js](server/models/User.js) (~line 296+).
- Classroom coursework **materials cannot be edited after posting**
  (`coursework.patch` cannot touch `materials` — see the existing comments in
  [server/services/classroomPublishService.js](server/services/classroomPublishService.js)). Materials, including any new Drive
  attachment, can only be set at the moment Classroom coursework is created.
- `runClassroomSync()` in `assignmentController.js` is what actually calls into
  `classroomPublishService.js` on create/update/publish.

## Design

### 1. OAuth scope: `drive.file`, not `drive.readonly` or `drive`

`drive.file` only lets the app see/manage files it itself created — the correct
minimal-permission choice for "upload a file this app created on the teacher's behalf."

Two ways to add it — **decide explicitly, recommend (b)**:

- (a) Fold `drive.file` into the existing combined Classroom/Forms/Gmail suite consent
  (`GOOGLE_SUITE_SCOPES` in [server/config/googleSuiteOAuthScopes.js](server/config/googleSuiteOAuthScopes.js)) — simplest, but forces
  a new consent/re-auth on every teacher who already connected, and ties Drive's
  availability to whatever Classroom/Forms/Gmail state they're in.
- (b) **Recommended** — a separate, incremental consent step, mirroring how Calendar
  was bolted onto the Gmail token via a signed `calendarAccess` flag
  (see [inbox-calendar-plan.md](inbox-calendar-plan.md) section 5). The Assignments page gets its own
  "Connect Google Drive for attachments" button/banner, independent of Gmail/Classroom/
  Forms connection state.
- Either way, this is a **second, separate Drive connection** from the existing
  read-only Curriculum one (different scope, different purpose). Reuse the
  `User.googleDriveTokens` storage shape, but widen how `scope`/`grantedScopes` are
  checked so the two call sites (Curriculum import vs. assignment attach) don't
  silently assume the same scope is present — audit every `hasGoogleDriveConnected()`
  call site before changing the shape.

### 2. New model field — do not touch `attachments[]` or `links[]`

Add to [server/models/Assignment.js](server/models/Assignment.js):

```js
driveAttachments: [
  {
    fileId: { type: String, required: true, trim: true },
    fileName: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true, default: "" },
    size: { type: Number, default: 0 },
    webViewLink: { type: String, trim: true, default: "" },
    iconLink: { type: String, trim: true, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
];
```

Keeping this as its own array means the existing attachment/link code paths, Classroom
material-building for links, and every existing test never need to change.

### 3. New server endpoints

- `POST /assignments/:id/drive-attachments` — multer memory storage, **reuse the same
  allowed mimetypes/size caps** as `uploadAssignmentAttachments` for consistency → a new
  `googleDriveFileService.js` (a **sibling** module, do not extend
  `googleDriveOAuthService.js` in place) calling `drive.files.create` → store the
  returned `{ id, name, mimeType, size, webViewLink, iconLink }` into
  `assignment.driveAttachments[]`.
  - **Sharing**: immediately after upload, call `drive.permissions.create` with
    `{ role: 'reader', type: 'anyone' }` so students/parents clicking the link don't
    hit a Google sign-in wall. This is a real behavior/privacy change from the private
    Firebase attachments — **surface it explicitly in the UI copy** ("this file becomes
    viewable by anyone with the link") before the teacher uploads.
- `DELETE /assignments/:id/drive-attachments/:fileId` — `drive.files.delete` (or trash)
  - remove from the array, mirroring the existing `deleteAttachmentFiles()` pattern used
    for Firebase attachments.
- Both endpoints go through the same `verifyTeacherCanAccessAssignment` authorization
  check already used by every other assignment-mutating route.

### 4. Classroom integration

Add a new `driveFile` material for every row in `assignment.driveAttachments[]` inside
`buildCourseWorkMaterials()`:

```js
{ driveFile: { id: att.fileId, shareMode: 'VIEW' } }
```

Use `'VIEW'`, not `'STUDENT_COPY'`, for v1 — giving every student an individually
editable copy is a bigger, separate product decision. Keep it read-only to start.

Because materials can't be patched after creation: a Drive attachment added **after**
the assignment was already posted to Classroom will not retroactively appear there.
**Decide explicitly** how the UI handles this — recommended: once
`AssignmentClassroomLink` exists for the assignment, show a clear inline warning next to
the "Upload to Drive" button ("Won't appear in the already-posted Classroom post until
you re-post") rather than silently no-op-ing.

### 5. Email / reminder content

Before adding anything, confirm which of the existing assignment notification paths are
real emails vs. in-app/push only — `notificationService.sendAssignmentReminderNotification`
and the `notifyOnAssign` path currently produce `Notification` records (push/in-app), not
confirmed raw SMTP email bodies. Wherever the existing `links[]`/Google Form link text is
already rendered to students or parents (in whichever of those paths turns out to be an
actual email), append each `driveAttachments[].webViewLink` as an additional line,
formatted the same way the existing links are.

### 6. Client UI — new, separate component

- A new `DriveAttachmentEditor.jsx` (own file, own card/section labeled distinctly e.g.
  "Google Drive attachments"), **not** a modification of `AttachmentEditor.jsx`:
  - Its own "Connect Google Drive" banner/button when not yet connected, mirroring
    `CalendarBanner.jsx`'s pattern (banner only where relevant, disappears once connected).
  - Its own "Upload to Google Drive" button and file picker, separate from the existing
    "Add File" button.
  - A file list with per-file remove buttons and an "Open in Drive" link/icon using
    `webViewLink`.
  - The "viewable by anyone with the link" notice shown once, near the upload button.
- `AttachmentEditor.jsx` and `LinkEditor.jsx` stay **completely untouched** — different
  array, different endpoint, different button, visually a separate section in
  [CreateAssignmentForm.jsx](server/client/src/pages/assignments/AssignmentsPage/components/CreateAssignmentForm.jsx).

### 7. i18n

New `assignments:driveAttachments.*` keys (title, intro, connect button, upload button,
remove, the "viewable by anyone with the link" notice, the "won't appear in an
already-posted Classroom post" warning) in both `en`/`ar` `assignments.json`, mirroring
the existing `assignments:googleForms.*` / `assignments:form.addAttachment` key shapes.

## Edge cases

- Teacher never connects Drive → the new section just shows a connect banner; nothing
  else on the assignment changes, old attachments/links keep working exactly as before.
- Teacher disconnects Drive after attaching files → existing `driveAttachments[]`
  entries and their Classroom materials are unaffected (sharing was already set to
  "anyone with the link" at upload time); only _new_ uploads are blocked until reconnected.
- Assignment already posted to Classroom → adding a new Drive file does not retroactively
  show up there (see Design §4) — must show the warning, not silently no-op.
- File deleted from Drive directly by the teacher outside the app → `webViewLink` goes
  dead; no automatic detection planned for v1 — note this as a known gap, not a bug to fix now.
- Same size/mimetype limits as the existing Firebase attachments, enforced both
  client-side and in the new multer middleware — do not silently allow larger/different
  files just because the destination changed.

## Test checklist

- Connect Drive → upload a PDF → `assignment.driveAttachments` has one entry with a
  `webViewLink` that opens without a Google sign-in prompt in a logged-out browser.
- Publish/post to Classroom with a Drive attachment present at post time → Classroom
  coursework shows the file as a real attachment (`driveFile` material), not a link.
- Add a Drive attachment to an assignment already posted to Classroom → the app clearly
  warns the teacher it won't appear there without a new post.
- Remove a Drive attachment → file list updates, the Drive delete/trash call is made,
  and materials on an already-posted assignment are left untouched (materials can't be patched).
- Existing Firebase `attachments[]` and `links[]` continue to work with **zero** behavior
  change throughout all of the above — add/remove/view a regular attachment and a link
  on the same assignment that also has a Drive attachment, confirm no cross-talk between
  the three systems.
