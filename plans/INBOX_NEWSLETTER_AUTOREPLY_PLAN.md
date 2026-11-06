   # Feature: Newsletter-Deadline Auto-Reply (Lesson Summaries, Scheduled, Auto-Sent)

Read `inbox-assistant-plan.md` and `inbox-assistant-prompt.md` first — this feature is an
**extension of the existing Inbox Assistant**, not a new app. It reuses its models,
Gmail connection, AI credit metering, and scan pipeline.

## ⚠️ Read this before anything else: a deliberate rule exception

The existing Inbox Assistant has a hard rule (see `inbox-assistant-prompt.md`):
*"Never auto-send, never auto-delete, never auto-archive, never label."* Every reply
today requires the teacher to click Send and confirm.

This new feature **intentionally breaks that rule, narrowly and only for one case**:
newsletter-submission deadline emails, only when the teacher has explicitly turned this
exact capability on, only inside a configurable pre-deadline window, and only once per
deadline. This is a real risk (an email leaves the teacher's name without him reading it
first), so the design below leans hard on:
- a **separate, explicit opt-in** (not bundled into the general "optedIn" flag),
- a **second confirmation checkbox** in the UI ("I understand this will send an email
  automatically, in my name, without me reviewing it first"),
- **idempotency** so a deadline can never be auto-replied to twice,
- a **notification to the teacher** every time an auto-reply goes out, with the full text,
- a **kill switch** (the toggle) that takes effect on the very next scheduler tick,
- everything logged to the existing Sent history so it's auditable and visible.

If, after reading this, auto-send still feels too risky, the fallback is to generate the
reply and **save it to Gmail Drafts** instead of sending — flag this as an option to the
teacher (see Stage 4) rather than silently deciding for them.

---

## Goal (restated precisely)

On a teacher-configured schedule (morning / evening / midnight presets, and/or fully
custom times), the system:
1. Scans the teacher's inbox for newsletter-submission-deadline emails (an email asking
   the teacher to submit content, by a date, for a newsletter).
2. For each such deadline that is due **today** and whose due time is within the next
   **N hours** (default 3, configurable 0–24), and that has not already been auto-replied
   to:
3. Reads the teacher's own `LessonPlan` records from the **last 14 days**, grouped by
   **subject**, but only for subjects this teacher actually teaches.
4. Writes a 60–70 word AI summary per subject ("Over the past two weeks, we covered …").
5. Composes one reply, in the original Gmail thread, to the original sender, using the
   exact persona wording the teacher asked for (template in Stage 3).
6. Sends it automatically (per the opt-in above) and tells the teacher it happened.

---

## Verified current state (facts gathered from the codebase)

- **Scheduler pattern to copy**: every background job in this app is a `setInterval` wired
  in [server/server.js](server/server.js) (~lines 480-700), gated by an `process.env.RUN_..._JOB !== "false"` flag, with a `setTimeout` first run and a `logger.info`/`logger.error` wrapper. The existing Inbox Assistant job (`runInboxAssistantJob`, ~line 692) already runs **hourly** but only purges old bodies and sends deadline reminders — it does **not** scan inboxes or send replies. This new feature needs its **own** interval (e.g. every 15 minutes, matching the tightest existing scheduler granularity) so the "N hours before deadline" window is caught promptly.
- **Scan entry point**: `runScan(user, { scanSize, mode, reanalyze })` is exported from [server/services/inbox/inboxScanService.js](server/services/inbox/inboxScanService.js) (line 316, default-exported too). It takes a `user` object (needs at least `_id`, `school`, `email` — same shape as `req.user` elsewhere) — it can be called from a scheduled job with a plain `User` doc, no HTTP request needed.
- **Deadline extraction**: `inboxAiService.classifyBatch` ([server/services/inbox/inboxAiService.js](server/services/inbox/inboxAiService.js)) already asks the model for `deadlines: [{ title, dueDate, dueTime, quote, dateExplicit, conflictingDates }]` per email (prompt ~line 120-137). There is **no `category`/`kind` field today** — deadlines are generic ("a date by which the teacher must do something"). This must be extended (Stage 1) to also guess whether the email is a newsletter-submission request.
- **Deadline storage**: [server/models/InboxDeadline.js](server/models/InboxDeadline.js) — `title`, `dueAt`, `dueDateOnly`, `timeZone`, `quote`, `state` (`proposed`/`confirmed`/`done`/`dismissed`), `remindAt`, `reminderSentAt`, `source` (`ai`/`manual`), linked to one `InboxEmail` via `email`. No `category` field yet.
- **Email storage**: [server/models/InboxEmail.js](server/models/InboxEmail.js) has `threadId`, `messageIdHeader`, `referencesHeader`, `fromName`, `fromEmail`, `replyToEmail`, `subject`, `bodyText` (purged after retention window) — everything needed to build an in-thread reply.
- **Sending mechanics to copy exactly**: [server/services/inbox/inboxSendService.js](server/services/inbox/inboxSendService.js) — `buildReplyHtml(body, language)` and `buildSendMailOptions(draft, email, recipients)` build the exact `{ to, cc, subject, text, html, inReplyTo, references, threadId }` shape that `gmailOAuthService.sendEmail(userId, mailOptions)` ([server/services/gmailOAuthService.js](server/services/gmailOAuthService.js) line 338) expects. Reuse both functions; do not re-derive this logic.
- **Reply draft model**: `InboxReplyDraft` (status `draft`/`sending`/`sent`/`discarded`) is how sent replies show up in the app's Sent history today. The new auto-reply should create one of these directly in `status: 'sent'` (with a new `source: 'auto'` field) so it appears in the existing Sent list with zero new UI — **do not** build a parallel history screen.
- **Subjects a teacher actually teaches**: `getTeacherSubjectIds(teacherId)` in [server/helpers/teacherScoping.js](server/helpers/teacherScoping.js) (~line 48) returns exactly this, from `Teacher.assignedClasses` + `Class.subjects` fallback. `getTeacherProfile(userId)` (same file, line 10) resolves the `Teacher` doc from a `User` id.
- **Lesson plan fields available for summarization**: [server/models/LessonPlan.js](server/models/LessonPlan.js) — `class`, `subject`, `teacher`, `date`, `title`, `summary`, `topic`, plus objectives/activities/stages (see the rich `buildLessonSourceText` extraction already written for a similar purpose in [server/services/assignmentQuestionAiService.js](server/services/assignmentQuestionAiService.js) lines ~48-90 — reuse this function directly, it already turns an array of lesson plans into one clean text block per lesson, capped at `MAX_SOURCE_CHARS`).
- **AI call pattern to copy**: `connectAi(prompt, { usage })` via [server/utils/connectAi.js](server/utils/connectAi.js), metered through the existing credit system exactly like `assignmentQuestionAiService.js`/`lessonSummaryAiService.js` (strict JSON reply, one retry on bad JSON, `logger.warn` not `console`).
- **Teacher's display name**: `teacher.firstName`/`teacher.lastName` (same fields used throughout `emailService.js`).
- **Settings home**: [server/models/InboxAssistantSettings.js](server/models/InboxAssistantSettings.js) is the one row per teacher where all Inbox Assistant preferences already live (`tone`, `scanSize`, `calendar: {...}`, etc.) — add the new settings here as a nested object, not a new model.
- **Naming collision to avoid**: this app already has an unrelated "Newsletter" feature for parent communication (`ensureCurrentWeekIssuesForAllClasses`, `RUN_NEWSLETTER_ISSUE_SCHEDULER` in server.js, `ClassNewsletter`-style models). This feature is about **external emails asking the teacher for newsletter content**, not that system. Name everything `inboxNewsletterAutoReply*` / `newsletterAutoReply` to keep them visually distinct in code search.

---

## Stage 1 — Classify "newsletter deadline" emails

### [server/models/InboxDeadline.js](server/models/InboxDeadline.js)
Add:
```js
category: { type: String, enum: ['newsletter', 'other'], default: 'other' },
autoReplySentAt: { type: Date, default: null },
```
Add an index: `inboxDeadlineSchema.index({ category: 1, state: 1, dueAt: 1, autoReplySentAt: 1 });`

### [server/services/inbox/inboxAiService.js](server/services/inbox/inboxAiService.js)
Extend the deadlines prompt instruction (~line 120) to also ask for a category per
deadline:
```
- For each deadline, also decide "category": "newsletter" if the email is asking the
  teacher to submit content, articles, photos, or a summary for a school or class
  newsletter by that date; otherwise "other". Only use "newsletter" when the email
  clearly asks for newsletter content — do not guess.
```
Update the JSON shape example (line 130) to include `"category": "newsletter" or "other"`,
and the normalizer (~line 162-170, where `title`/`quote`/`dateExplicit` are built) to read
and pass through `deadline.category === 'newsletter' ? 'newsletter' : 'other'`.

### `saveItemsForEmail` (in [server/services/inbox/inboxScanCalendar.js](server/services/inbox/inboxScanCalendar.js) or wherever `InboxDeadline` documents are actually created from `classification.deadlines` — trace this from `inboxScanService.js` line ~494)
Persist `category` onto the new `InboxDeadline` document.

**Done when**: a scan of a mailbox containing a clear "please send your newsletter
section by Friday 3pm" email produces an `InboxDeadline` with `category: 'newsletter'`.

---

## Stage 2 — Per-subject lesson summaries (the content of the reply)

### Create `server/services/inbox/inboxNewsletterSummaryService.js`
```js
export const buildSubjectSummaries = async ({ teacherId, schoolId, now = new Date() }) => { ... }
```
- `subjectIds = await getTeacherSubjectIds(teacherId)`.
- `LessonPlan.find({ school: schoolId, teacher: teacherId, subject: { $in: subjectIds }, date: { $gte: now - 14 days, $lte: now } })`, populate `subject` for its name.
- Group by subject id.
- For each subject with at least one lesson plan: build source text with the existing
  `buildLessonSourceText([...plans])` from `assignmentQuestionAiService.js` (import and
  reuse — don't duplicate), then one `connectAi` call per subject (or one call for all
  subjects with a shaped JSON reply, mirroring `assignmentQuestionAiService.js`'s
  `requestDrafts` pattern) with a prompt such as:
  ```
  Write a 60-70 word summary in English of what this class covered in the subject
  "{subjectName}" over the last two weeks, based only on the lesson material below.
  Start with "Over the past two weeks, we covered...". Never invent anything not in
  the material. Reply with plain text only, no markdown, 60-70 words.
  ```
- Subjects with **no** lesson plans in the window are skipped entirely (never invent a
  summary for a subject with nothing taught — same "never invent" rule as everywhere
  else in this codebase).
- Return `[{ subjectId, subjectName, summary, wordCount }]`.
- Meter this under a new usage feature name: `inbox_newsletter_summary`.

**Done when**: given a teacher with lesson plans in 2 of their 4 subjects over the last
two weeks, this returns exactly 2 summaries, each 60-70 words, in the subject's own
content only.

---

## Stage 3 — Compose and send the reply

### Create `server/services/inbox/inboxNewsletterAutoReplyService.js`

Export `runNewsletterAutoReplyForUser(user, settings, { now = new Date() } = {})`:

1. Find eligible deadlines:
   ```js
   InboxDeadline.find({
       school: user.school, user: user._id,
       category: 'newsletter',
       state: { $in: ['proposed', 'confirmed'] },
       autoReplySentAt: null
   }).populate('email')
   ```
2. For each deadline, compute in `deadline.timeZone` (fallback to school timezone via
   `resolveTimeZone`):
   - `isDueToday` — `dueAt` falls on today's calendar date in that timezone.
   - `hoursUntilDue` — `(dueAt - now) / 3600000`.
   - Eligible only when `isDueToday && hoursUntilDue >= 0 && hoursUntilDue <= settings.newsletterAutoReply.hoursBeforeDeadline`.
   - Skip (do not send) if `hoursUntilDue < 0` (already past — do not send a stale reply;
     let the existing reminder system / teacher handle it manually).
3. **Claim it first, atomically**, to survive overlapping ticks — exactly like
   `sendDueReminders` already does in `inboxAssistantJob.js` (`findOneAndUpdate` with the
   same `autoReplySentAt: null` filter plus `$set: { autoReplySentAt: now }`, checking the
   result is non-null before continuing). This is the idempotency guarantee.
4. Build the subject summaries via Stage 2's `buildSubjectSummaries`. If it returns an
   empty list (no lesson plans at all in the window), **do not send** — instead notify the
   teacher "A newsletter deadline for [sender] is coming up but there are no recent lesson
   plans to summarize; reply yourself" and stop for this deadline (leave
   `autoReplySentAt` set so it isn't retried every 15 minutes — this is a terminal
   outcome for this deadline either way).
5. Resolve the teacher's display name (`teacher.firstName`) and the sender's first name
   from `deadline.email.fromName` (fallback to the local part of `fromEmail`, title-cased,
   if `fromName` is blank).
6. Compose the body from the exact template the teacher specified:
   ```
   Hello {senderFirstName},

   This is {teacherFirstName}'s Assistant. {teacherFirstName} hasn't seen this email yet,
   but based on his lesson plans, here are the subject summaries you can use in your
   newsletter sections until he has a chance to review your message himself:

   {subjectName}: {summary}
   {subjectName}: {summary}
   ...

   I'm also emailing {teacherFirstName} directly as his assistant to remind him about
   your message.

   — {teacherFirstName}'s Assistant
   ```
   Keep this as a small template function with clear placeholders so wording tweaks don't
   require touching the sending logic; support `en`/`ar` using `deadline.email.language`
   the same way `buildReplyHtml`/drafts already branch on language elsewhere.
7. Build mail options with `inboxSendService.buildSendMailOptions`-equivalent (reuse the
   actual function — construct a `draft`-shaped object `{ subject, body, language }` and a
   `recipients` object `{ to: [deadline.email.fromEmail], cc: [] }`, matching what
   `buildSendMailOptions` expects) so threading headers (`inReplyTo`, `references`,
   `threadId`) are identical to the existing manual-send path.
8. Send via `gmailOAuthService.sendEmail(user._id, mailOptions)`.
9. On success:
   - Create an `InboxReplyDraft` with `status: 'sent'`, `source: 'auto'` (new field — add
     `source: { type: String, enum: ['manual', 'auto'], default: 'manual' }` to
     `InboxReplyDraft`'s schema), the composed `subject`/`body`, `sentAt: now`, linked to
     the email/thread — so it shows up in the existing Sent tab with no new UI work.
   - Mark `deadline.state = 'done'`.
   - Create a `Notification` to the teacher (reuse `NOTIFICATION_TYPES`, add
     `INBOX_NEWSLETTER_AUTOREPLY_SENT`) with the sender name, subject, and a truncated
     preview of what was sent, and a link to the Sent tab (`buildPortalLink('/inbox')`
     pattern already used in `inboxAssistantJob.js`).
10. On failure (Gmail send throws): log it (`logger.error`, ids/counts only — no body
    text, per the existing "do not log email bodies" rule), leave `deadline.autoReplySentAt`
    set (already claimed in step 3) so it is **not** retried automatically (avoids
    double-sends/loops on a flaky Gmail call), and send the teacher a notification saying
    the automatic reply failed and he should reply himself.

**Done when**: a dry-run against a test fixture (one newsletter deadline due in 2 hours,
two subjects with lesson plans in the last 14 days) produces exactly one sent
`InboxReplyDraft`, one `Notification`, and the deadline is never reprocessed on the next
tick.

---

## Stage 4 — Settings (schedule, window, opt-in, confirmation)

### [server/models/InboxAssistantSettings.js](server/models/InboxAssistantSettings.js)
Add a nested object:
```js
newsletterAutoReply: {
    enabled: { type: Boolean, default: false },
    confirmedRisk: { type: Boolean, default: false }, // the second "I understand" checkbox
    hoursBeforeDeadline: { type: Number, default: 3, min: 0, max: 24 },
    deliveryMode: { type: String, enum: ['send', 'draft_only'], default: 'draft_only' },
    checkTimes: { type: [String], default: ['07:00', '18:00', '00:00'] }, // "HH:MM", teacher's own timezone
},
```
- `deliveryMode: 'draft_only'` as the **default** is the safer rollout choice: it runs the
  whole pipeline and saves the composed reply to Gmail Drafts (via the existing
  `saveToGmailDraft` logic in `inboxDraftService.js`) instead of sending, until the
  teacher explicitly flips to `'send'`. Surface this clearly in the UI (Stage 5) as the
  recommended starting point.
- `checkTimes` is informational/UX for "when do you want this checked" (morning/evening/
  midnight presets map to `07:00`/`18:00`/`00:00`, editable, teacher can add custom
  entries) — but because the real guarantee against duplicate/late sends is the
  `hoursBeforeDeadline` window + `autoReplySentAt` idempotency (Stage 3), the scheduler
  itself does **not** need to match these times exactly; it runs on a fixed short interval
  (Stage 6) and `checkTimes` only filters *which ticks actually do the newsletter check*
  for that teacher, saving AI/API calls outside the teacher's preferred windows. Implement
  this by: on each scheduler tick, for each opted-in teacher, only proceed if the current
  time (in the teacher's timezone) is within ±10 minutes of one of their `checkTimes`
  entries (interval cadence vs. tolerance must be kept in sync — a 15-minute interval
  needs at least a ±8-10 minute tolerance or ticks can be missed).

### Routes/controller
Extend the existing settings endpoints in [server/controllers/inboxAssistantController.js](server/controllers/inboxAssistantController.js) (find the existing
`updateSettings`-style handler) to accept/validate the new `newsletterAutoReply` object.
Reject enabling (`enabled: true`) unless `confirmedRisk: true` is sent in the same
request — enforce this server-side, not just in the UI.

**Done when**: `PUT /inbox/settings` (or whatever the existing route path is) accepts and
persists `newsletterAutoReply`, and rejects `enabled: true` without `confirmedRisk: true`
with a clear 400 message.

---

## Stage 5 — Client UI

### [SettingsPanel.jsx](server/client/src/pages/teacher/inbox/InboxAssistantPage/components/SettingsPanel.jsx)
Add a new `<fieldset>` "Newsletter auto-reply" (mirror the existing `calendar` fieldset
pattern in the same file) with:
- An enable toggle, disabled until the risk checkbox is ticked.
- The risk checkbox with the exact warning copy from the top of this document.
- `deliveryMode` radio: "Save to Gmail Drafts (recommended)" vs. "Send automatically".
- `hoursBeforeDeadline` numeric input (0-24).
- `checkTimes` as chips (Morning 07:00 / Evening 18:00 / Midnight 00:00, each removable)
  plus an "Add custom time" control — mirror `CalendarChips.jsx`'s chip-list UI pattern.

### i18n
Add `inboxAssistant:settings.newsletterAutoReply.*` keys to both
[en/inboxAssistant locale file] and [ar/inboxAssistant locale file] (find the exact paths
alongside the existing `settings.calendar.*` keys) — title, help text, the risk-checkbox
copy, delivery-mode labels, hours label, chip labels. Mirror the existing key depth/shape
exactly (`settings.calendar.title` → `settings.newsletterAutoReply.title`, etc.).

### Sent list / notifications
No new screens needed — auto-sent replies appear in the existing `SentList.jsx` (they're
just `InboxReplyDraft` rows with `source: 'auto'`); add a small "Auto-sent" badge there
when `source === 'auto'` so the teacher can tell them apart from ones he sent himself.

**Done when**: the settings panel round-trips through the API, and a manually-created
auto-sent test row shows the "Auto-sent" badge in the Sent tab.

---

## Stage 6 — Scheduler wiring

### [server/jobs/inboxNewsletterAutoReplyJob.js](server/jobs/inboxNewsletterAutoReplyJob.js) (new file)
```js
export const runInboxNewsletterAutoReplyJob = async (now = new Date()) => {
    const settingsRows = await InboxAssistantSettings.find({
        optedIn: true,
        'newsletterAutoReply.enabled': true,
        'newsletterAutoReply.confirmedRisk': true
    }).lean();
    for (const settings of settingsRows) {
        // resolve User doc, check checkTimes tolerance window in the user's timezone,
        // then call runNewsletterAutoReplyForUser(user, settings, { now })
        // one teacher's failure must not stop the loop — wrap in try/catch per teacher,
        // logger.error with ids only.
    }
};
```

### [server/server.js](server/server.js)
Add, next to the existing `RUN_INBOX_ASSISTANT_JOB` block (~line 692):
```js
if (process.env.RUN_INBOX_NEWSLETTER_AUTOREPLY_JOB !== "false") {
    const INBOX_NEWSLETTER_AUTOREPLY_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
    let newsletterAutoReplyRunning = false;
    const runInboxNewsletterAutoReply = async () => {
        if (newsletterAutoReplyRunning) return;
        newsletterAutoReplyRunning = true;
        try {
            await runInboxNewsletterAutoReplyJob();
        } catch (err) {
            logger.error("Inbox newsletter auto-reply job error:", err?.message || err);
        } finally {
            newsletterAutoReplyRunning = false;
        }
    };
    setTimeout(runInboxNewsletterAutoReply, 7 * 60 * 1000);
    activeIntervals.push(setInterval(runInboxNewsletterAutoReply, INBOX_NEWSLETTER_AUTOREPLY_INTERVAL_MS));
}
```
(Stagger the first-run `setTimeout` away from the existing inbox job's 6-minute delay so
they don't both hit the DB at once on cold start.)

**Done when**: starting the server with `RUN_INBOX_NEWSLETTER_AUTOREPLY_JOB=false` skips
the interval entirely (confirms the kill switch works at the process level too, for ops).

---

## Edge cases & guardrails checklist
- A teacher with the feature on but Gmail disconnected/revoked → `gmailOAuthService` already
  throws a typed re-auth error on other paths; catch it the same way, skip, notify the
  teacher to reconnect, do not crash the loop.
- A deadline whose `dueAt` has no explicit time (`dueDateOnly: true`) → treat "due time"
  as end-of-day in that timezone for the `hoursBeforeDeadline` math, consistent with how
  `defaultRemindAt` in `inboxDeadlinesService.js` already handles date-only deadlines.
- Two deadlines in the same thread (rare) → each is claimed/processed independently; a
  reply already sent for one does not block the other, but both still go to the same
  thread, so compose/send sequentially per deadline, not in parallel, to avoid threading
  race conditions on a single Gmail thread.
- A subject appears in multiple classes for the same teacher → dedupe by subject id, not
  by class, before summarizing (per the request: "each subject", not "each class").
- Credit/usage: both the summary AI calls (Stage 2) and the scan this may trigger (if the
  teacher's inbox hasn't been scanned recently — decide whether this job also calls
  `runScan` first, or only ever acts on deadlines a normal scan already found; **recommend
  the latter to start** — don't make this job also drive scanning, keep it acting only on
  already-known `category: 'newsletter'` deadlines, so a newsletter email is only ever
  acted on after the teacher's own scan cadence has picked it up).
- Never let this job touch a deadline belonging to another teacher — every query is
  scoped by `user: user._id` and `school: user.school`, per the existing tenant-isolation
  rule.

## Test checklist
- Stage 1: scan a fixture inbox with one clear newsletter-deadline email → resulting
  `InboxDeadline.category === 'newsletter'`; a generic deadline email stays `'other'`.
- Stage 2: teacher with lesson plans in 2 of 4 taught subjects in the last 14 days →
  exactly 2 summaries, 60-70 words each, no invented subjects.
- Stage 3: deadline due in 2 hours, window set to 3 hours → sends; same deadline due in 5
  hours → does not send yet; same deadline already past due → does not send; re-running
  the job immediately after a successful send does not send again (idempotency).
- Stage 3: zero lesson plans in window → no send, teacher notified instead, deadline
  marked so it isn't retried forever.
- Stage 4: `enabled: true` without `confirmedRisk: true` → 400.
- Stage 6: `RUN_INBOX_NEWSLETTER_AUTOREPLY_JOB=false` → interval never starts (check via
  the same pattern other jobs already use for this env flag).

## Recommended rollout order
1. Ship Stages 1-4 and 6 with `deliveryMode` **forced** to `draft_only` (ignore any
   `'send'` value server-side) for an initial period, so the teacher can see exactly what
   *would* have been sent, with zero risk.
2. Only after the teacher (and ideally a few others) confirm the drafts look right across
   a handful of real newsletter deadlines, enable the `'send'` delivery mode server-side.
