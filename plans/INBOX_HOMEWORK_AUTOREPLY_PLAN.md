# Feature: "What's Due / What's the Homework?" Auto-Reply

Companion to [inbox-newsletter-autoreply-prompt.md](inbox-newsletter-autoreply-prompt.md).
Lower risk than the attendance idea because the data is **class-level** (what's assigned
to the whole class), not one specific student's private record — still needs a sender
check, but a lighter one.

## ⚠️ Implementation status (read this first)

Partial backend work has already been written and **must not be deleted** — pick up from
here rather than starting over:

- ✅ Done — [server/models/InboxAssistantSettings.js](server/models/InboxAssistantSettings.js):
  `homeworkAutoReply` sub-schema added (`enabled`, `confirmedRisk`, `scope`, `daysAhead`,
  `deliveryMode`).
- ✅ Done — [server/models/InboxEmail.js](server/models/InboxEmail.js): added
  `homeworkAutoReplySentAt` (claim field for idempotency, mirrors `InboxDeadline.autoReplySentAt`).
  Note: this project does **not** have an `InboxEmail.intent` enum (the "Design" section
  below describing `intent: 'homework_inquiry'` was aspirational/not yet true of the
  codebase) — the implementation instead detects candidate emails with a conservative
  keyword regex (`looksLikeHomeworkInquiry` in the service below), not an AI-classified
  intent field. A future pass could replace this with real classification.
- ✅ Done — [server/constants/notificationTypes.js](server/constants/notificationTypes.js):
  added `INBOX_HOMEWORK_AUTOREPLY_SENT`.
- ✅ Done — `server/services/inbox/inboxHomeworkSettings.js` (new file): defaults/normalize
  helper mirroring `inboxNewsletterSettings.js`, including a hardcoded
  `HOMEWORK_SEND_ENABLED = false` rollout gate (same pattern as
  `NEWSLETTER_SEND_ENABLED`) so delivery is always `draft_only` server-side regardless of
  the teacher's chosen `deliveryMode`, until proven safe.
- ✅ Done — `server/services/inbox/inboxHomeworkAutoReplyService.js` (new file): exports
  `runHomeworkAutoReplyForUser(user, settings, { now, pushSender })`. Resolves sender →
  student(s)/class via `Student.parentInfo.*Email` or the student's own `email`, queries
  published `Assignment`s for the window, composes the reply, and creates an
  `InboxReplyDraft(source: 'auto')` + saves to Gmail Drafts (send path exists but is
  gated off by `HOMEWORK_SEND_ENABLED`). Claims each `InboxEmail` atomically via
  `homeworkAutoReplySentAt` before doing any work.
- ✅ Done — `server/jobs/inboxHomeworkAutoReplyJob.js` (new file): queries
  `InboxAssistantSettings` for `optedIn && homeworkAutoReply.enabled && homeworkAutoReply.confirmedRisk`
  and runs the service per teacher. Respects `RUN_INBOX_HOMEWORK_AUTOREPLY_JOB=false`.

### ⛔ Not done yet — remaining work for the next agent

1. **Wire the scheduler in [server/server.js](server/server.js)** — import
   `runInboxHomeworkAutoReplyJob` from `./jobs/inboxHomeworkAutoReplyJob.js` (mirror the
   `runInboxNewsletterAutoReplyJob` import a few lines above it) and add a staggered
   `setTimeout` + `setInterval` block right after the existing
   `RUN_INBOX_NEWSLETTER_AUTOREPLY_JOB` block (same `activeIntervals.push(...)` pattern,
   same re-entrancy guard flag, e.g. every 15 minutes, first run ~8 minutes after startup
   to stay staggered from the other jobs).
2. **Controller** — extend
   [server/controllers/inboxAssistantController.js](server/controllers/inboxAssistantController.js):
   - Import `normalizeHomeworkAutoReply`, `effectiveHomeworkDeliveryMode`,
     `HOMEWORK_SEND_ENABLED` from the new `inboxHomeworkSettings.js`.
   - Add `homeworkAutoReply: normalizeHomeworkAutoReply(null)` to `defaultsFor(...)`.
   - Add `homeworkAutoReply: { ...normalizeHomeworkAutoReply(settings.homeworkAutoReply), sendAvailable: HOMEWORK_SEND_ENABLED }`
     to `shapeSettings(...)` (mirror the `newsletterAutoReply` entry exactly).
   - Add a `homeworkPatch(incoming, current)` function mirroring `newsletterPatch` almost
     exactly: validate `enabled`/`confirmedRisk` booleans with the same
     "confirmedRisk required to enable, withdrawing confirmedRisk force-disables" rule;
     validate `scope` is one of `['own_subject', 'whole_class']`; validate `daysAhead` is
     an integer 1-14; validate `deliveryMode` is `'send'`/`'draft_only'` and run it through
     `effectiveHomeworkDeliveryMode`.
   - Call `homeworkPatch(body.homeworkAutoReply, current)` and merge into `patch.homeworkAutoReply`
     the same way `newsletterPatch`'s result is merged, right next to that block.
3. **UI** — [SettingsPanel.jsx](server/client/src/pages/teacher/inbox/InboxAssistantPage/components/SettingsPanel.jsx):
   add a new `<fieldset>` "Homework / what's due auto-reply", copy-pasted from the
   `newsletterAutoReply` fieldset and adapted: enable toggle (disabled until risk
   checkbox ticked), risk checkbox, `deliveryMode` radio (draft vs. send), `daysAhead`
   numeric input (1-14), and a `scope` radio/select ("only my own assignments" vs. "whole
   class across subjects", default `own_subject`). Save via
   `onSave({ homeworkAutoReply: {...} })` exactly like the newsletter fieldset's `onSave`
   calls.
4. **i18n** — add `inboxAssistant:settings.homeworkAutoReply.*` keys to both
   `server/client/src/i18n/locales/en/inboxAssistant.json` and `.../ar/inboxAssistant.json`,
   mirroring the `settings.newsletterAutoReply.*` key shape exactly (title, intro, risk
   copy, enabled/enabledLocked, deliveryMode/deliveryDraft/deliverySend, plus new keys for
   `daysAhead` and `scope` choices).
5. **Tests** — add `server/tests/inboxHomeworkAutoReply.test.js` mirroring
   `server/tests/inboxNewsletterAutoReply.test.js`'s structure/mocking approach, covering
   the "Test checklist" at the bottom of this doc.
6. Double-check `resolveAssignments` in the new service against the "Edge cases" section
   below (selected_students exclusion, due-today inclusion) once the UI/controller exist
   end-to-end, with a real teacher/class/assignment fixture.

**Do not re-create the files listed as ✅ Done above — extend them.**

## Goal

A parent or student emails something like "what's the homework this week?" or "what's due
for [subject]?". Auto-reply with the real list of currently published, not-yet-due
`Assignment`s for that class (and optionally that subject), pulled straight from the
Assignments module — never invented.

## Verified current state

- [server/models/Assignment.js](server/models/Assignment.js): `status` (`published` is
  the one that matters here), `dueDate`, `title`, `instructions`, `class`, `subject`,
  `scope` (`class` vs `selected_students` — for `selected_students` scope, skip entirely
  unless the asking parent's child is actually one of the `studentIds`, same identity
  caution as the attendance idea).
- Reuses `getTeacherSubjectIds`/class-resolution helpers only indirectly — this one is
  keyed off the **student's class**, not the teacher's subjects, since the parent is
  asking about their child's workload across every subject, not just this one teacher's
  subject. Resolve the student's current class via `Student.currentClass`.
- Query: `Assignment.find({ school, class: studentClassId, status: 'published', dueDate: { $gte: now, $lte: now + 7 days } }).sort({ dueDate: 1 })`.

## ⚠️ Identity note (lighter than the attendance feature, still required)

This only needs to confirm the sender is a registered parent/guardian of **a** student in
the class being asked about — not necessarily resolving to exactly one child, since the
answer (a published assignment list) is the same for every student in that class and
carries no other student's private information. Still require the sender-to-student
link check (same `Student.parentInfo` lookup as the attendance idea) before replying, to
avoid handing out a class's assignment list to a stranger who merely emailed the teacher.
If the sender is a **student** account directly (role `student`), that's even simpler —
just use their own `currentClass`.

## Design

1. **Classification**: add `intent: 'homework_inquiry'` to the same `InboxEmail.intent`
   enum proposed in the attendance prompt (one shared field, multiple possible intents —
   implement both at once if building these together, it's the same schema change).
2. **New service** `server/services/inbox/inboxHomeworkAutoReplyService.js`:
   - Resolve sender → student(s) they're linked to (parent) or themselves (student role).
   - If the sender is linked to more than one child **in different classes**, and the
     email doesn't specify which, fall back to the manual flow — same ambiguity rule as
     attendance. If their children are in the same class (e.g. twins), proceed normally.
   - Query published assignments due in the next 7 days (configurable) for that class.
   - If zero results, **do not auto-reply** with "nothing is due" as a blanket claim
     unless you're confident the query is airtight (empty due to a date-window edge case
     looks identical to "genuinely nothing assigned") — recommend replying only when
     there's at least one assignment to list, otherwise fall back to manual, at least for
     v1.
   - Compose a plain list, grouped by subject, each line "{subjectName}: {title}, due
     {dueDate formatted}" — optionally include a one-line trimmed `instructions` excerpt.
     No AI summarization needed for the list itself (it's already short, factual data);
     only use `connectAi` if you want a friendlier framing sentence on top, same spirit as
     the newsletter's persona template.
3. **Template** (reuse the same persona wording style the teacher already asked for in
   the newsletter feature, for consistency across all these auto-replies):

   ```
   Hello {senderFirstName},

   This is {teacherFirstName}'s Assistant. Here is what's currently assigned and due in
   the next week for {className}:

   - {subject}: {title} — due {dueDate}
   - {subject}: {title} — due {dueDate}

   {teacherFirstName} will follow up personally if anything changes.

   — {teacherFirstName}'s Assistant
   ```

4. **Settings + send + log**: same `homeworkAutoReply: { enabled, confirmedRisk, deliveryMode }` pattern, same `InboxReplyDraft(source: 'auto')` logging, same scheduler tick as
   the other two features (one shared interval calling into each enabled feature's
   service per teacher, rather than three separate `setInterval`s).

## Teacher on/off toggle (required before this ever runs for anyone)

This feature must default to **off** and only ever run for a teacher who explicitly
opted in, mirroring the newsletter feature's Stage 4/5 pattern exactly:

- **Model** — add to [server/models/InboxAssistantSettings.js](server/models/InboxAssistantSettings.js):
  ```js
  homeworkAutoReply: {
      enabled: { type: Boolean, default: false },
      confirmedRisk: { type: Boolean, default: false }, // "I understand" checkbox
      scope: { type: String, enum: ['own_subject', 'whole_class'], default: 'own_subject' },
      daysAhead: { type: Number, default: 7, min: 1, max: 14 },
      deliveryMode: { type: String, enum: ['send', 'draft_only'], default: 'draft_only' },
  },
  ```
  `enabled` is the master on/off switch; the scheduler job (and the manual "run now" path,
  if one exists) must check `homeworkAutoReply.enabled && homeworkAutoReply.confirmedRisk`
  before doing anything — same guard as `newsletterAutoReply`.
- **Controller** — extend the existing settings handler in
  [server/controllers/inboxAssistantController.js](server/controllers/inboxAssistantController.js)
  (same function that already validates `newsletterAutoReply`) to accept/validate
  `homeworkAutoReply`, rejecting `enabled: true` without `confirmedRisk: true` with a 400,
  server-side — never trust a client-only checkbox.
- **Scheduler** — in the shared interval (or
  [server/jobs/inboxNewsletterAutoReplyJob.js](server/jobs/inboxNewsletterAutoReplyJob.js)-style
  job file, e.g. `inboxHomeworkAutoReplyJob.js`), query only
  `InboxAssistantSettings.find({ optedIn: true, 'homeworkAutoReply.enabled': true, 'homeworkAutoReply.confirmedRisk': true })`
  — a teacher who never enabled it is never touched.
- **UI** — in
  [SettingsPanel.jsx](server/client/src/pages/teacher/inbox/InboxAssistantPage/components/SettingsPanel.jsx),
  add a "Homework / what's due auto-reply" `<fieldset>` mirroring the `newsletterAutoReply`
  one: enable toggle (disabled until the risk checkbox is ticked), the risk checkbox,
  `deliveryMode` radio (draft vs. send), `daysAhead` numeric input, and a `scope` choice
  ("only assignments I created" vs. "whole class across subjects" — default to the safer
  "own_subject" per the "Edge cases" section below).
- **i18n** — add `inboxAssistant:settings.homeworkAutoReply.*` keys to both the `en` and
  `ar` `inboxAssistant.json` locale files, mirroring the `settings.newsletterAutoReply.*`
  key shape exactly.
- Turning it off (`enabled: false`) at any time must take effect on the very next
  scheduler tick with no further sends/drafts — no separate "pause" vs. "disable" state
  needed, a single boolean is sufficient since there's no in-flight multi-step process to
  interrupt (each tick is a fresh, self-contained check).

## Edge cases

- An assignment with `scope: 'selected_students'` that does not include this specific
  parent's child → exclude it from the list even if the class matches.
- A due date that's today but already passed (e.g. due at 9am, email read at 2pm) →
  decide whether "due today" still counts as upcoming for the reply; recommend including
  it with a note ("due today") rather than silently dropping it.
- Multiple teachers teach different subjects to the same class → this reply is naturally
  scoped per teacher (whoever's inbox is being scanned only sees assignments they can
  access per existing `verifyTeacherCanAccessAssignment`/`isTeacherAuthorizedForClassSubject`
  checks) — reuse those existing authorization helpers rather than querying all
  assignments for the class unfiltered, so a teacher's auto-reply never lists another
  teacher's assignment by mistake if that's not desired. **Decide this explicitly**:
  either (a) only ever list assignments created by _this_ teacher, or (b) list the whole
  class's assignments across all subjects — pick (a) for v1, it's safer and matches "a
  teacher replying about their own class/subject."

## Test checklist

- Parent of a single child, class has 2 published assignments due within 7 days → reply
  lists both, correctly grouped by subject.
- Assignment scoped to `selected_students` not including this parent's child → excluded.
- No assignments due in the window → no auto-reply (falls back to manual).
- Sender not linked to any student in the class → no auto-reply, no data disclosed.
