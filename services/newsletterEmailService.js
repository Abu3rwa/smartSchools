import NewsletterIssue from "../models/NewsletterIssue.js";
import NewsletterSection from "../models/NewsletterSection.js";
import Student from "../models/Student.js";
import Notification from "../models/Notification.js";
import notificationService from "./notificationService.js";
import ClassModel from "../models/Class.js";
import School from "../models/School.js";
import { collectStudentFamilyEmails } from "../utils/newsletterRecipients.js";
import {
  computeIssueReadiness,
  getExpectedSubjectIdsForClass,
} from "./newsletterIssueService.js";

function formatClassLabel(cls) {
  if (!cls) return "Class";
  const grade = cls.grade ? `Grade ${cls.grade}` : "";
  const section = cls.section ? `${cls.section}` : "";
  return [cls.name, grade, section].filter(Boolean).join(" ");
}

function formatWeekLabel(weekStart, weekEnd) {
  const s = new Date(weekStart).toLocaleDateString();
  const e = new Date(weekEnd).toLocaleDateString();
  return `${s} – ${e}`;
}

function escapeHtml(str) {
  return (str || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildCombinedNewsletterHtml({
  classLabel,
  weekLabel,
  sections,
  schoolName = "School",
  branding = {},
}) {
  const logoUrl = (branding?.logoUrl || "").toString().trim();
  const primaryColor = (branding?.primaryColor || "#3b82f6").toString().trim();
  const secondaryColor = (branding?.secondaryColor || "#1e40af").toString().trim();

  const sectionsHtml = (sections || [])
    .map((s) => {
      const subjectName = escapeHtml(s.subject?.name || "Subject");
      const content = escapeHtml(s.content || "").replace(/\n/g, "<br/>");
      return `
        <div style="margin: 16px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;">${subjectName}</div>
          <div style="color: #374151; line-height: 1.5; font-size: 14px;">${content}</div>
        </div>
      `.trim();
    })
    .join("\n");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 16px; background: #ffffff;">
      <div style="padding: 14px; border-radius: 10px; background: linear-gradient(135deg, ${escapeHtml(primaryColor)} 0%, ${escapeHtml(secondaryColor)} 100%); border: 1px solid #e5e7eb;">
        <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between;">
          <div style="font-size: 18px; font-weight: 800; color: #ffffff;">Weekly Newsletter</div>
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(schoolName)} logo" style="height: 36px; max-width: 120px; object-fit: contain; background: #ffffff; padding: 4px; border-radius: 6px;" />` : ""}
        </div>
        <div style="margin-top: 4px; color: #374151; font-size: 13px;">
          <div><strong>School:</strong> ${escapeHtml(schoolName)}</div>
          <div><strong>Class:</strong> ${escapeHtml(classLabel)}</div>
          <div><strong>Week:</strong> ${escapeHtml(weekLabel)}</div>
        </div>
      </div>

      ${sectionsHtml || `<div style="margin-top: 16px; color: #6b7280;">No sections available.</div>`}

      <div style="margin-top: 18px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
        This email was sent by the school. If you have questions, please contact the school office.
      </div>
    </div>
  `.trim();
}

export function buildCombinedNewsletterText({ classLabel, weekLabel, sections }) {
  const lines = [];
  lines.push("Weekly Newsletter");
  lines.push(`Class: ${classLabel}`);
  lines.push(`Week: ${weekLabel}`);
  lines.push("");

  for (const s of sections || []) {
    lines.push(`${s.subject?.name || "Subject"}:`);
    lines.push((s.content || "").toString().trim());
    lines.push("");
  }

  return lines.join("\n").trim();
}

export async function prepareNewsletterIssueEmailContent({ issueId }) {
  const issue = await NewsletterIssue.findById(issueId).lean();
  if (!issue) throw new Error("Issue not found");

  const [cls, school] = await Promise.all([
    ClassModel.findById(issue.class).lean(),
    School.findById(issue.school).select("name settings.branding").lean(),
  ]);

  if (!cls) throw new Error("Class not found for issue");

  const sectionsAll = await NewsletterSection.find({ issue: issue._id })
    .populate("subject", "name code")
    .lean();

  const expectedSubjectIds = await getExpectedSubjectIdsForClass(cls._id);
  const readiness = computeIssueReadiness({
    expectedSubjectIds,
    sections: sectionsAll,
    excludedSubjectIds: issue.excludedSubjectIds || [],
  });

  const excluded = new Set((issue.excludedSubjectIds || []).map((x) => x.toString()));
  const sections = sectionsAll
    .filter((s) => s.status === "approved")
    .filter((s) => !excluded.has((s.subject?._id || s.subject).toString()))
    .sort((a, b) => (a.subject?.name || "").localeCompare(b.subject?.name || ""));

  const classLabel = formatClassLabel(cls);
  const weekLabel = formatWeekLabel(issue.weekStart, issue.weekEnd);
  const subjectLine = `Weekly Newsletter - ${classLabel} (${weekLabel})`;

  const htmlContent = buildCombinedNewsletterHtml({
    classLabel,
    weekLabel,
    sections,
    schoolName: school?.name || "School",
    branding: school?.settings?.branding || {},
  });
  const textContent = buildCombinedNewsletterText({ classLabel, weekLabel, sections });

  return {
    issue,
    cls,
    school,
    sectionsAll,
    sections,
    readiness,
    classLabel,
    weekLabel,
    subjectLine,
    htmlContent,
    textContent,
  };
}

/**
 * Send one combined newsletter email per student family (privacy-safe).
 * Returns per-student results + updates issue stats/status.
 */
export async function sendNewsletterIssueToParents({ issueId, adminUserId }) {
  const {
    issue,
    cls,
    readiness,
    subjectLine,
    htmlContent,
    textContent,
  } = await prepareNewsletterIssueEmailContent({ issueId });

  if (!readiness.isSendEnabled) {
    const msg = `Issue is not ready to send. Missing subjects: ${readiness.missingSubjectIds.length}`;
    throw new Error(msg);
  }

  const students = await Student.find({
    currentClass: cls._id,
    status: "active",
  })
    .select("firstName lastName parentInfo studentEmail email currentClass school")
    .lean();

  const results = [];
  let studentsCount = students.length;
  let familiesEmailedCount = 0;
  let recipientEmailsCount = 0;
  let successCount = 0;
  let failureCount = 0;

  for (const student of students) {
    const recipients = collectStudentFamilyEmails(student);
    if (recipients.length === 0) {
      results.push({
        studentId: student._id,
        success: false,
        skipped: true,
        reason: "No recipient emails found",
      });
      continue;
    }

    familiesEmailedCount += 1;
    recipientEmailsCount += recipients.length;

    const notification = await Notification.create({
      school: issue.school,
      recipientEmail: recipients.join(","),
      type: "announcement",
      subject: subjectLine,
      message: textContent,
      htmlContent,
      channels: ["email"],
      status: "pending",
      metadata: {
        newsletterIssueId: issue._id,
        classId: cls._id,
        weekStart: issue.weekStart,
        weekEnd: issue.weekEnd,
        studentId: student._id,
      },
      createdBy: adminUserId,
    });

    try {
      // Prefer sending from the admin's connected Gmail (OAuth).
      // If the admin hasn't connected Gmail, notificationService will fall back to SMTP.
      await notificationService.sendEmail(notification, adminUserId?.toString?.() || null);
      successCount += 1;
      results.push({ studentId: student._id, success: true, recipients });
    } catch (err) {
      failureCount += 1;
      results.push({
        studentId: student._id,
        success: false,
        recipients,
        error: err?.message || "Send failed",
      });
    }
  }

  const nextStatus = failureCount > 0 ? "draft" : "sent";
  const lastSendError = failureCount > 0 ? "Some emails failed to send" : "";

  await NewsletterIssue.findByIdAndUpdate(issue._id, {
    $set: {
      status: nextStatus,
      sentAt: nextStatus === "sent" ? new Date() : issue.sentAt,
      sentBy: nextStatus === "sent" ? adminUserId : issue.sentBy,
      lastSendError,
      emailStats: {
        studentsCount,
        familiesEmailedCount,
        recipientEmailsCount,
        successCount,
        failureCount,
      },
    },
  });

  return {
    issueId: issue._id,
    classId: cls._id,
    stats: {
      studentsCount,
      familiesEmailedCount,
      recipientEmailsCount,
      successCount,
      failureCount,
    },
    results,
  };
}
