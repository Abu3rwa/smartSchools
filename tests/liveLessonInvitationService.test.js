import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLiveLessonInvitationEmail,
  normalizeLiveLessonMeetingUrl,
  resolveLiveLessonInvitationRecipients,
} from "../services/liveLessonInvitationService.js";

test("meeting links are optional and normalized as HTTPS URLs", () => {
  assert.equal(normalizeLiveLessonMeetingUrl(""), "");
  assert.equal(
    normalizeLiveLessonMeetingUrl("  https://meet.google.com/abc-defg-hij  "),
    "https://meet.google.com/abc-defg-hij",
  );
});

test("meeting links reject insecure, malformed, credentialed, and oversized URLs", () => {
  for (const value of [
    "http://meet.google.com/abc",
    "javascript:alert(1)",
    "https://user:pass@example.com/meet",
    "not a url",
    `https://example.com/${"a".repeat(2048)}`,
  ]) {
    assert.throws(() => normalizeLiveLessonMeetingUrl(value), /HTTPS URL|embedded credentials/);
  }
});

test("invitations target student addresses only and avoid duplicate emails", () => {
  const result = resolveLiveLessonInvitationRecipients([
    {
      user: { _id: "student-1", email: "Login@school.test" },
      studentEmail: "student@school.test",
      parentInfo: { guardianEmail: "guardian@school.test" },
    },
    {
      user: { _id: "student-2", email: "STUDENT@school.test" },
    },
    {
      user: { _id: "student-3" },
      parentInfo: { guardianEmail: "guardian@school.test" },
    },
  ]);

  assert.deepEqual(result, {
    recipients: [{ studentId: "student-1", email: "student@school.test" }],
    skipped: 1,
  });
});

test("invitation messages include lesson/session information and escape HTML", () => {
  const message = buildLiveLessonInvitationEmail({
    lessonTitle: "<Fractions>",
    teacherName: "A & B",
    className: "Grade 5",
    scheduledAt: new Date("2030-05-01T09:30:00.000Z"),
    meetingUrl: "https://meet.google.com/abc?x=1&y=2",
    sessionUrl: "https://school.example/portal/live-lessons/sessions/session-1",
    timeZone: "UTC",
  });

  assert.match(message.subject, /<Fractions>/);
  assert.match(message.text, /Open the Live Lesson: https:\/\/school\.example/);
  assert.match(message.text, /Join the online meeting: https:\/\/meet\.google\.com/);
  assert.match(message.html, /&lt;Fractions&gt;/);
  assert.match(message.html, /A &amp; B/);
  assert.match(message.html, /x=1&amp;y=2/);
});
