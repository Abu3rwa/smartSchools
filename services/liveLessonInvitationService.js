import { buildPortalLink } from "../helpers/portalUrl.js";
import { sendTransactionalEmail } from "./transactionalEmailService.js";
import logger from "../utils/logger.js";

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export const normalizeLiveLessonMeetingUrl = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") return "";
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("Meeting link must be a valid HTTPS URL under 2048 characters.");
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(value.trim());
  } catch {
    throw new Error("Meeting link must be a valid HTTPS URL.");
  }
  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
    throw new Error("Meeting link must use HTTPS and cannot contain embedded credentials.");
  }
  return parsedUrl.toString();
};

export const buildLiveLessonInvitationEmail = ({
  lessonTitle,
  teacherName,
  className,
  scheduledAt,
  meetingUrl,
  sessionUrl,
  timeZone,
}) => {
  const safeTitle = String(lessonTitle || "Live lesson").replace(/[\r\n]+/g, " ").trim();
  const safeTeacher = String(teacherName || "Your teacher").replace(/[\r\n]+/g, " ").trim();
  const when = scheduledAt
    ? new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "short",
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(scheduledAt))
    : "The teacher will start this lesson shortly.";
  const meetingLine = meetingUrl ? `Join the online meeting: ${meetingUrl}` : "";
  const text = [
    `You are invited to ${safeTitle}.`,
    `Class: ${className || "your class"}`,
    `Teacher: ${safeTeacher}`,
    `When: ${when}`,
    `Open the Live Lesson: ${sessionUrl}`,
    meetingLine,
  ].filter(Boolean).join("\n");
  const meetingHtml = meetingUrl
    ? `<p><a href="${escapeHtml(meetingUrl)}" style="display:inline-block;padding:11px 18px;border-radius:7px;background:#167b78;color:#fff;text-decoration:none;font-weight:700;">Join online meeting</a></p>`
    : "";

  return {
    subject: `Live lesson invitation: ${safeTitle}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#203343;"><h2>${escapeHtml(safeTitle)}</h2><p>You are invited to a live lesson with ${escapeHtml(safeTeacher)}.</p><p><strong>Class:</strong> ${escapeHtml(className || "your class")}<br><strong>When:</strong> ${escapeHtml(when)}</p><p><a href="${escapeHtml(sessionUrl)}">Open the Live Lesson</a></p>${meetingHtml}<p style="color:#637582;font-size:13px;">If the meeting link is provided, it opens separately from the Live Lesson.</p></div>`,
  };
};

export const resolveLiveLessonInvitationRecipients = (roster = []) => {
  const seenEmails = new Set();
  const recipients = [];
  let skipped = 0;
  for (const student of roster) {
    const email = [
      student.studentEmail,
      student.email,
      student.user?.email,
    ].map((value) => String(value || "").trim().toLowerCase())
      .find((value) => value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
    if (!email) {
      skipped += 1;
      continue;
    }
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    recipients.push({ studentId: String(student.user?._id || ""), email });
  }
  return { recipients, skipped };
};

export const sendLiveLessonInvitationEmails = async ({
  session,
  roster,
  teacherName,
  className,
  sessionUrl = buildPortalLink(`/live-lessons/sessions/${session._id}`),
  timeZone,
}) => {
  const { recipients, skipped } = resolveLiveLessonInvitationRecipients(roster);

  const message = buildLiveLessonInvitationEmail({
    lessonTitle: session.lessonSnapshot?.title,
    teacherName,
    className,
    scheduledAt: session.scheduledAt,
    meetingUrl: session.meetingUrl,
    sessionUrl,
    timeZone,
  });
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < recipients.length; index += 5) {
    const batch = recipients.slice(index, index + 5);
    const results = await Promise.allSettled(batch.map(({ email }) => sendTransactionalEmail({
      to: email,
      ...message,
      schoolId: session.school,
    })));
    results.forEach((result, resultIndex) => {
      if (result.status === "fulfilled") {
        sent += 1;
        return;
      }
      failed += 1;
      logger.error("live_lesson_invitation_email_delivery_failed", {
        sessionId: String(session._id),
        studentId: batch[resultIndex].studentId,
        error: result.reason?.message || "Email delivery failed.",
      });
    });
  }

  return { requested: true, sent, failed, skipped };
};
