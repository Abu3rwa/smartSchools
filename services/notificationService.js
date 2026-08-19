import nodemailer from "nodemailer";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";
import Notification from "../models/Notification.js";
import ParentSetting from "../models/ParentSetting.js";
import School from "../models/School.js";
import Student from "../models/Student.js";
import User from "../models/User.js";
import gradeService from "./gradeService.js";
import gmailOAuthService from "./gmailOAuthService.js";
import { sendPushToUsers } from "./pushNotificationService.js";
import { renderTemplate } from "../emailTemplates/templateLoader.js";
import { buildPortalLink, getClientUrl } from "../helpers/portalUrl.js";
import { getSignedUrl } from "./firebaseStorageService.js";
import logger from "../utils/logger.js";

/**
 * Sanitize email subject to plain ASCII (remove emojis and special characters)
 */
const sanitizeSubject = (subject) => {
  if (!subject) return "Notification";
  // Remove emojis and non-ASCII characters, keep only basic ASCII
  return subject.replace(/[^\x00-\x7F]/g, "").trim();
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getGradeObservation = (grade) =>
  [grade?.notes, grade?.remarks]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" | ");

const buildSubjectNotesSummary = (grades = []) => {
  const summary = {};

  for (const grade of grades) {
    const observation = getGradeObservation(grade);
    if (!observation) continue;

    const subjectId = String(grade?.subject?._id || grade?.subject || "").trim();
    if (!subjectId) continue;

    if (!summary[subjectId]) {
      summary[subjectId] = { count: 0, samples: [] };
    }

    summary[subjectId].count += 1;
    if (!summary[subjectId].samples.includes(observation) && summary[subjectId].samples.length < 2) {
      summary[subjectId].samples.push(observation);
    }
  }

  return summary;
};

const formatDateForNotice = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() === 0) return "";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const addSchoolNameToMailContent = (mailOptions, schoolName) => {
  const normalizedSchoolName = String(schoolName || "").trim();
  if (!normalizedSchoolName) return mailOptions;

  const nextMailOptions = { ...mailOptions };
  const lowerSchoolName = normalizedSchoolName.toLowerCase();

  const textBody = String(nextMailOptions.text || "");
  if (!textBody.toLowerCase().includes(lowerSchoolName)) {
    nextMailOptions.text = `${textBody}${textBody ? "\n\n" : ""}School: ${normalizedSchoolName}`;
  }

  // Inject school name into the styled template's {{SCHOOL_NAME}} placeholder
  const htmlBody = String(nextMailOptions.html || "");
  if (htmlBody.includes("{{SCHOOL_NAME}}")) {
    nextMailOptions.html = htmlBody.replace(/\{\{SCHOOL_NAME\}\}/g, escapeHtml(normalizedSchoolName));
  } else if (!htmlBody.toLowerCase().includes(lowerSchoolName)) {
    const footer = `<p style="margin-top:16px;font-size:12px;color:#334155;">School: ${escapeHtml(normalizedSchoolName)}</p>`;
    if (/<\/body>/i.test(htmlBody)) {
      nextMailOptions.html = htmlBody.replace(/<\/body>/i, `${footer}</body>`);
    } else {
      nextMailOptions.html = `${htmlBody}${footer}`;
    }
  }

  return nextMailOptions;
};

/**
 * Wrap email body content in a professional styled HTML email template.
 * Uses {{SCHOOL_NAME}} placeholder which addSchoolNameToMailContent replaces.
 */
const wrapEmailHtml = ({ preheader = "", bodyHtml, accentColor = "#0d9488" }) => {
  return [
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    "<style>",
    "body{margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%}",
    ".wrapper{width:100%;background:#f1f5f9;padding:32px 0}",
    ".card{max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)}",
    `.header{background:${accentColor};padding:20px 28px}`,
    ".header h1{margin:0;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:0.3px}",
    ".body-content{padding:24px 28px}",
    ".body-content p{margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155}",
    ".body-content .label{font-weight:600;color:#1e293b}",
    ".detail-row{margin:0 0 8px;font-size:14px;line-height:1.6;color:#334155}",
    `.btn{display:inline-block;margin:16px 0 4px;padding:10px 24px;background:${accentColor};color:#ffffff !important;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px}`,
    ".footer{padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center}",
    ".footer p{margin:0;font-size:12px;color:#94a3b8}",
    "</style></head><body>",
    preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>` : "",
    '<div class="wrapper"><div class="card">',
    '<div class="header"><h1>{{SCHOOL_NAME}}</h1></div>',
    `<div class="body-content">${bodyHtml}</div>`,
    '<div class="footer"><p>This is an automated notification from {{SCHOOL_NAME}}.</p></div>',
    "</div></div></body></html>",
  ].join("");
};

class NotificationService {
  constructor() {
    this._smtpTransport = null;
    this._initSmtp();
  }

  _initSmtp() {
    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    if (!host || !user || !pass) return;
    const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
    this._smtpTransport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this._smtpFrom = process.env.FROM_EMAIL || user;
    this._smtpFromName = process.env.FROM_NAME || 'Classhope';
    logger.info('SMTP transport configured', { host, user });
  }

  /** Resolve teacher first name from userId (shared helper). */
  async _resolveTeacherName(userId) {
    if (!userId) return "Unknown Teacher";
    try {
      const user = await User.findById(userId).select("firstName lastName");
      return user?.firstName || "Unknown Teacher";
    } catch {
      return "Unknown Teacher";
    }
  }

  /** Resolve teacher first name + email from userId (shared helper). */
  async _resolveTeacherInfo(userId) {
    if (!userId) return { firstName: "", email: "" };
    try {
      const user = await User.findById(userId).select("firstName lastName email");
      return user || { firstName: "", email: "" };
    } catch {
      return { firstName: "", email: "" };
    }
  }

  /** Resolve school display name from schoolId. */
  async _resolveSchoolName(schoolId) {
    if (!schoolId) return "School";
    try {
      const school = await School.findById(schoolId).select("name").lean();
      return school?.name || "School";
    } catch {
      return "School";
    }
  }

  _normalizeRecipientEmails(emailValues = []) {
    const normalized = new Set();
    for (const rawValue of emailValues || []) {
      const value = String(rawValue || "").trim().toLowerCase();
      if (value) normalized.add(value);
    }
    return [...normalized];
  }

  _resolvePushBodyText(message) {
    const normalized = String(message || "").replace(/\s+/g, " ").trim();
    if (!normalized) return "You have a new update.";
    if (normalized.length <= 180) return normalized;
    return `${normalized.slice(0, 177)}...`;
  }

  async _resolveParentUserIdsFromEmails(schoolId, emails = []) {
    const normalizedEmails = this._normalizeRecipientEmails(emails);
    if (!schoolId || normalizedEmails.length === 0) return [];

    const parentUsers = await User.find({
      school: schoolId,
      role: "parent",
      isActive: true,
      email: { $in: normalizedEmails },
    })
      .select("_id")
      .lean();

    return [...new Set(parentUsers.map((user) => String(user._id || "")).filter(Boolean))];
  }

  async _dispatchParentUpdatePush({
    notification,
    student = null,
    recipientEmails = [],
    preferredUserIds = [],
  }) {
    try {
      if (!notification?._id || !notification?.school) return;

      const normalizedPreferredUserIds = [
        ...new Set(
          (preferredUserIds || [])
            .map((userId) => String(userId || "").trim())
            .filter(Boolean),
        ),
      ];

      const notificationRecipientEmails = String(notification.recipientEmail || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const usersFromEmails = await this._resolveParentUserIdsFromEmails(
        notification.school,
        [...recipientEmails, ...notificationRecipientEmails],
      );
      const targetUserIds = [
        ...new Set([...normalizedPreferredUserIds, ...usersFromEmails]),
      ];
      if (targetUserIds.length === 0) return;

      const resolvedStudentId =
        student?._id != null
          ? String(student._id)
          : notification.student
            ? String(notification.student)
            : "";

      await sendPushToUsers({
        schoolId: notification.school,
        userIds: targetUserIds,
        title: String(notification.subject || "School update").trim() || "School update",
        body: this._resolvePushBodyText(notification.message),
        data: {
          type: "update",
          updateId: String(notification._id),
          notificationType: String(notification.type || ""),
          studentId: resolvedStudentId,
        },
        collapseKey: `update_${String(notification._id)}`,
      });
    } catch (error) {
      logger.error("update_push_dispatch_failed", {
        notificationId: notification?._id ? String(notification._id) : "",
        type: notification?.type || "",
        error: error?.message || String(error),
      });
    }
  }

  /**
   * Send push notification directly to a student's user account.
   */
  async _dispatchStudentPush({ notification, student }) {
    try {
      const studentUserId = student?.user
        ? String(student.user?._id || student.user)
        : null;
      if (!studentUserId || !notification?._id || !notification?.school) return;

      await sendPushToUsers({
        schoolId: notification.school,
        userIds: [studentUserId],
        title: String(notification.subject || "School update").trim() || "School update",
        body: this._resolvePushBodyText(notification.message),
        data: {
          type: "update",
          updateId: String(notification._id),
          notificationType: String(notification.type || ""),
          studentId: String(student._id || ""),
        },
        collapseKey: `update_${String(notification._id)}`,
      });
    } catch (error) {
      logger.error("student_push_dispatch_failed", {
        notificationId: notification?._id ? String(notification._id) : "",
        type: notification?.type || "",
        error: error?.message || String(error),
      });
    }
  }

  /**
   * Load school-level notification toggles (cached per call).
   */
  async _getSchoolNotificationSettings(schoolId) {
    if (!schoolId) return {};
    try {
      const school = await School.findById(schoolId)
        .select("settings.notifications")
        .lean();
      return school?.settings?.notifications || {};
    } catch {
      return {};
    }
  }

  async _resolveHomeworkAudience(student) {
    if (!student?.school) {
      return {
        parentRecipients: [],
        fallbackEmails: [],
      };
    }

    const recipientEmails = this._normalizeRecipientEmails(
      typeof student.getAllContactEmails === "function"
        ? student.getAllContactEmails()
        : [],
    );
    if (recipientEmails.length === 0) {
      return {
        parentRecipients: [],
        fallbackEmails: [],
      };
    }

    const parentUsers = await User.find({
      school: student.school,
      role: "parent",
      isActive: true,
      email: { $in: recipientEmails },
    })
      .select("_id email")
      .lean();

    const userIds = [...new Set(parentUsers.map((row) => String(row._id || "")).filter(Boolean))];
    const settingsRows =
      userIds.length > 0
        ? await ParentSetting.find({
          school: student.school,
          user: { $in: userIds },
        })
          .select("user notifications")
          .lean()
        : [];
    const settingsMap = new Map(
      settingsRows.map((row) => [String(row.user || ""), row.notifications || {}]),
    );

    const emailToParent = new Map(
      parentUsers.map((row) => [String(row.email || "").trim().toLowerCase(), row]),
    );
    const parentRecipients = [];
    const fallbackEmails = [];

    for (const email of recipientEmails) {
      const parent = emailToParent.get(email);
      if (!parent?._id) {
        fallbackEmails.push(email);
        continue;
      }

      const notifications = settingsMap.get(String(parent._id)) || {};
      const homeworkEnabled = notifications.homework !== false;
      if (!homeworkEnabled) continue;

      parentRecipients.push({
        userId: String(parent._id),
        email,
        pushEnabled: notifications.push !== false,
        emailEnabled: notifications.email !== false,
      });
    }

    return {
      parentRecipients,
      fallbackEmails,
    };
  }

  async _resolveAssignmentAudience(student) {
    if (!student?.school) {
      return {
        parentRecipients: [],
        fallbackEmails: [],
      };
    }

    const recipientEmails = this._normalizeRecipientEmails(
      typeof student.getAllContactEmails === "function"
        ? student.getAllContactEmails()
        : [],
    );
    if (recipientEmails.length === 0) {
      return {
        parentRecipients: [],
        fallbackEmails: [],
      };
    }

    const parentUsers = await User.find({
      school: student.school,
      role: "parent",
      isActive: true,
      email: { $in: recipientEmails },
    })
      .select("_id email")
      .lean();

    const userIds = [...new Set(parentUsers.map((row) => String(row._id || "")).filter(Boolean))];
    const settingsRows =
      userIds.length > 0
        ? await ParentSetting.find({
          school: student.school,
          user: { $in: userIds },
        })
          .select("user notifications")
          .lean()
        : [];
    const settingsMap = new Map(
      settingsRows.map((row) => [String(row.user || ""), row.notifications || {}]),
    );

    const emailToParent = new Map(
      parentUsers.map((row) => [String(row.email || "").trim().toLowerCase(), row]),
    );
    const parentRecipients = [];
    const fallbackEmails = [];

    for (const email of recipientEmails) {
      const parent = emailToParent.get(email);
      if (!parent?._id) {
        fallbackEmails.push(email);
        continue;
      }

      const notifications = settingsMap.get(String(parent._id)) || {};
      const assignmentsEnabled = notifications.assignments !== undefined
        ? notifications.assignments !== false
        : notifications.homework !== false;
      if (!assignmentsEnabled) continue;

      parentRecipients.push({
        userId: String(parent._id),
        email,
        pushEnabled: notifications.push !== false,
        emailEnabled: notifications.email !== false,
      });
    }

    return {
      parentRecipients,
      fallbackEmails,
    };
  }

  async _buildAssignmentPostedContent({ student, assignment }) {
    const studentName = student?.fullName || "Student";
    const typeName = String(assignment?.assignmentTypeName || "Assignment").trim() || "Assignment";
    const title = String(assignment?.title || "Assignment").trim() || "Assignment";
    const dueDate = formatDateForNotice(assignment?.dueDate);
    const instructions = String(assignment?.instructions || "").trim();
    const trimmedInstructions =
      instructions.length > 450 ? `${instructions.slice(0, 447)}...` : instructions;
    const assignmentUrl = assignment?._id
      ? buildPortalLink(`/assignments/${assignment._id}`)
      : "";

    const subject = `New ${typeName}: ${title}`;
    const messageLines = [
      `A new ${typeName.toLowerCase()} has been posted for ${studentName}.`,
      `Title: ${title}`,
      dueDate ? `Due date: ${dueDate}` : "",
      trimmedInstructions ? `Instructions: ${trimmedInstructions}` : "",
      assignmentUrl ? `View: ${assignmentUrl}` : "Please review it in the app.",
    ].filter(Boolean);

    const detailRows = [
      `<p class="detail-row"><span class="label">Student:</span> ${escapeHtml(studentName)}</p>`,
      `<p class="detail-row"><span class="label">Title:</span> ${escapeHtml(title)}</p>`,
      `<p class="detail-row"><span class="label">Type:</span> ${escapeHtml(typeName)}</p>`,
      dueDate ? `<p class="detail-row"><span class="label">Due date:</span> ${escapeHtml(dueDate)}</p>` : "",
      trimmedInstructions
        ? `<p class="detail-row"><span class="label">Instructions:</span><br/>${escapeHtml(trimmedInstructions).replace(/\n/g, "<br/>")}</p>`
        : "",
    ].filter(Boolean).join("");

    // Build links section (external URLs, assessments, practice objectives)
    let linksHtml = "";
    const assignmentLinks = assignment?.links || [];
    if (assignmentLinks.length > 0) {
      const linkItems = assignmentLinks.map((link) => {
        const linkTitle = escapeHtml(link.title || link.type || "Link");
        const linkUrl = link.url || "";
        if (linkUrl) {
          return `<li><a href="${escapeHtml(linkUrl)}" style="color:#0d9488;text-decoration:underline;">${linkTitle}</a></li>`;
        }
        return `<li>${linkTitle}</li>`;
      }).join("");
      linksHtml = `<p class="detail-row"><span class="label">Links:</span></p><ul style="margin:4px 0 12px 20px;padding:0;">${linkItems}</ul>`;
    }

    // Build attachments section with signed Firebase URLs
    let attachmentsHtml = "";
    const assignmentAttachments = assignment?.attachments || [];
    if (assignmentAttachments.length > 0) {
      const attachmentItems = [];
      for (const att of assignmentAttachments) {
        const fileName = escapeHtml(att.fileName || "File");
        let downloadUrl = "";
        try {
          if (att.storageKey) {
            downloadUrl = await getSignedUrl(att.storageKey);
          } else if (att.url) {
            downloadUrl = att.url;
          }
        } catch {
          // If signed URL fails, skip the link
        }
        if (downloadUrl) {
          attachmentItems.push(`<li><a href="${escapeHtml(downloadUrl)}" style="color:#0d9488;text-decoration:underline;">${fileName}</a></li>`);
        } else {
          attachmentItems.push(`<li>${fileName}</li>`);
        }
      }
      attachmentsHtml = `<p class="detail-row"><span class="label">Attachments:</span></p><ul style="margin:4px 0 12px 20px;padding:0;">${attachmentItems.join("")}</ul>`;
    }

    const ctaHtml = assignmentUrl
      ? `<p><a href="${escapeHtml(assignmentUrl)}" class="btn">View ${escapeHtml(typeName)}</a></p>`
      : "<p>Open the app to review details.</p>";

    const bodyHtml = `<p>A new <strong>${escapeHtml(typeName.toLowerCase())}</strong> has been posted for <strong>${escapeHtml(studentName)}</strong>.</p>${detailRows}${linksHtml}${attachmentsHtml}${ctaHtml}`;

    return {
      subject,
      message: messageLines.join("\n"),
      htmlContent: wrapEmailHtml({ preheader: `New ${typeName}: ${title}`, bodyHtml }),
    };
  }

  _buildAssignmentGradedContent({ student, assignment, grade }) {
    const studentName = student?.fullName || "Student";
    const typeName = String(assignment?.assignmentTypeName || "Assignment").trim() || "Assignment";
    const title = String(assignment?.title || "Assignment").trim() || "Assignment";
    const marks = Number(grade?.marks ?? 0);
    const maxMarks = Number(grade?.maxMarks ?? assignment?.maxMarks ?? 0);
    const remarks = String(grade?.remarks || "").trim();
    const assignmentUrl = assignment?._id
      ? buildPortalLink(`/assignments/${assignment._id}`)
      : "";

    const hasScore = Number.isFinite(marks) && Number.isFinite(maxMarks) && maxMarks > 0;
    const subject = `${typeName} graded: ${title}`;
    const messageLines = [
      `${studentName}'s ${typeName.toLowerCase()} has been graded.`,
      `Title: ${title}`,
      hasScore ? `Score: ${marks}/${maxMarks}` : "",
      remarks ? `Remarks: ${remarks}` : "",
      assignmentUrl ? `View: ${assignmentUrl}` : "Open the app to review details.",
    ].filter(Boolean);

    const detailRows = [
      `<p class="detail-row"><span class="label">Student:</span> ${escapeHtml(studentName)}</p>`,
      `<p class="detail-row"><span class="label">Title:</span> ${escapeHtml(title)}</p>`,
      `<p class="detail-row"><span class="label">Type:</span> ${escapeHtml(typeName)}</p>`,
      hasScore ? `<p class="detail-row"><span class="label">Score:</span> ${escapeHtml(`${marks}/${maxMarks}`)}</p>` : "",
      remarks ? `<p class="detail-row"><span class="label">Remarks:</span> ${escapeHtml(remarks)}</p>` : "",
    ].filter(Boolean).join("");

    const ctaHtml = assignmentUrl
      ? `<p><a href="${escapeHtml(assignmentUrl)}" class="btn">View Grade</a></p>`
      : "<p>Open the app to review details.</p>";

    const bodyHtml = `<p><strong>${escapeHtml(studentName)}</strong>'s <strong>${escapeHtml(typeName.toLowerCase())}</strong> has been graded.</p>${detailRows}${ctaHtml}`;

    return {
      subject,
      message: messageLines.join("\n"),
      htmlContent: wrapEmailHtml({ preheader: `${typeName} graded: ${title}`, bodyHtml }),
    };
  }

  _buildHomeworkPostedContent({ student, assignment }) {
    const studentName = student?.fullName || "Student";
    const title = String(assignment?.title || "Homework").trim() || "Homework";
    const dueDate = formatDateForNotice(assignment?.dueDate);
    const instructions = String(assignment?.instructions || "").trim();
    const trimmedInstructions =
      instructions.length > 450 ? `${instructions.slice(0, 447)}...` : instructions;
    const assignmentUrl = assignment?._id
      ? buildPortalLink(`/homework/${assignment._id}`)
      : "";

    const subject = `New Homework: ${title}`;
    const messageLines = [
      `A new homework has been posted for ${studentName}.`,
      `Title: ${title}`,
      dueDate ? `Due date: ${dueDate}` : "",
      trimmedInstructions ? `Instructions: ${trimmedInstructions}` : "",
      assignmentUrl ? `View: ${assignmentUrl}` : "Please review it in the app.",
    ].filter(Boolean);

    const detailRows = [
      `<p class="detail-row"><span class="label">Student:</span> ${escapeHtml(studentName)}</p>`,
      `<p class="detail-row"><span class="label">Title:</span> ${escapeHtml(title)}</p>`,
      dueDate ? `<p class="detail-row"><span class="label">Due date:</span> ${escapeHtml(dueDate)}</p>` : "",
      trimmedInstructions
        ? `<p class="detail-row"><span class="label">Instructions:</span><br/>${escapeHtml(trimmedInstructions).replace(/\n/g, "<br/>")}</p>`
        : "",
    ].filter(Boolean).join("");

    const ctaHtml = assignmentUrl
      ? `<p><a href="${escapeHtml(assignmentUrl)}" class="btn">View Homework</a></p>`
      : "<p>Open the app to review details.</p>";

    const bodyHtml = `<p>A new homework has been posted for <strong>${escapeHtml(studentName)}</strong>.</p>${detailRows}${ctaHtml}`;

    return {
      subject,
      message: messageLines.join("\n"),
      htmlContent: wrapEmailHtml({ preheader: `New Homework: ${title}`, bodyHtml }),
    };
  }

  _buildHomeworkGradedContent({ student, assignment, grade }) {
    const studentName = student?.fullName || "Student";
    const title = String(assignment?.title || "Homework").trim() || "Homework";
    const marks = Number(grade?.marks ?? 0);
    const maxMarks = Number(grade?.maxMarks ?? assignment?.maxMarks ?? 0);
    const remarks = String(grade?.remarks || "").trim();
    const assignmentUrl = assignment?._id
      ? buildPortalLink(`/homework/${assignment._id}`)
      : "";

    const hasScore = Number.isFinite(marks) && Number.isFinite(maxMarks) && maxMarks > 0;
    const subject = `Homework graded: ${title}`;
    const messageLines = [
      `${studentName}'s homework has been graded.`,
      `Title: ${title}`,
      hasScore ? `Score: ${marks}/${maxMarks}` : "",
      remarks ? `Remarks: ${remarks}` : "",
      assignmentUrl ? `View: ${assignmentUrl}` : "Open the app to review details.",
    ].filter(Boolean);

    const detailRows = [
      `<p class="detail-row"><span class="label">Student:</span> ${escapeHtml(studentName)}</p>`,
      `<p class="detail-row"><span class="label">Title:</span> ${escapeHtml(title)}</p>`,
      hasScore ? `<p class="detail-row"><span class="label">Score:</span> ${escapeHtml(`${marks}/${maxMarks}`)}</p>` : "",
      remarks ? `<p class="detail-row"><span class="label">Remarks:</span> ${escapeHtml(remarks)}</p>` : "",
    ].filter(Boolean).join("");

    const ctaHtml = assignmentUrl
      ? `<p><a href="${escapeHtml(assignmentUrl)}" class="btn">View Grade</a></p>`
      : "<p>Open the app to review details.</p>";

    const bodyHtml = `<p><strong>${escapeHtml(studentName)}</strong>'s homework has been graded.</p>${detailRows}${ctaHtml}`;

    return {
      subject,
      message: messageLines.join("\n"),
      htmlContent: wrapEmailHtml({ preheader: `Homework graded: ${title}`, bodyHtml }),
    };
  }

  async sendHomeworkPostedNotification({
    studentId,
    assignment,
    createdBy = null,
  }) {
    if (!studentId || !assignment?._id) return [];

    const student = await Student.findById(studentId);
    if (!student) return [];

    const audience = await this._resolveHomeworkAudience(student);
    if (
      audience.parentRecipients.length === 0 &&
      audience.fallbackEmails.length === 0
    ) {
      return [];
    }

    const content = this._buildHomeworkPostedContent({ student, assignment });
    const metadata = {
      homeworkAssignmentId: String(assignment._id),
      dueDate: assignment?.dueDate || null,
    };

    const createdNotifications = [];

    for (const recipient of audience.parentRecipients) {
      const channels = [];
      if (recipient.pushEnabled) channels.push("push");
      if (recipient.emailEnabled) channels.push("email");

      const notification = new Notification({
        school: student.school,
        recipient: recipient.userId,
        recipientEmail: recipient.email,
        student: student._id,
        type: "homework_posted",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels,
        metadata,
        createdBy,
      });

      await notification.save();
      createdNotifications.push(notification);

      if (recipient.pushEnabled) {
        try {
          await this._dispatchParentUpdatePush({
            notification,
            student,
            recipientEmails: [recipient.email],
            preferredUserIds: [recipient.userId],
          });
        } catch (error) {
          logger.error("homework_posted_push_failed", {
            notificationId: String(notification._id || ""),
            userId: recipient.userId,
            error: error?.message || String(error),
          });
        }
      }

      if (recipient.emailEnabled) {
        try {
          await this.sendEmail(notification, createdBy);
        } catch (error) {
          logger.error("homework_posted_email_failed", {
            notificationId: String(notification._id || ""),
            recipientEmail: recipient.email,
            error: error?.message || String(error),
          });
        }
      }
    }

    for (const email of audience.fallbackEmails) {
      const notification = new Notification({
        school: student.school,
        recipientEmail: email,
        student: student._id,
        type: "homework_posted",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels: ["email"],
        metadata,
        createdBy,
      });
      await notification.save();
      createdNotifications.push(notification);

      try {
        await this.sendEmail(notification, createdBy);
      } catch (error) {
        logger.error("homework_posted_email_fallback_failed", {
          notificationId: String(notification._id || ""),
          recipientEmail: email,
          error: error?.message || String(error),
        });
      }
    }

    return createdNotifications;
  }

  async sendHomeworkGradedNotification({
    studentId,
    assignment,
    grade,
    submission = null,
    createdBy = null,
  }) {
    if (!studentId || !assignment?._id || !grade?._id) return [];

    const student = await Student.findById(studentId);
    if (!student) return [];

    const audience = await this._resolveHomeworkAudience(student);
    if (
      audience.parentRecipients.length === 0 &&
      audience.fallbackEmails.length === 0
    ) {
      return [];
    }

    const content = this._buildHomeworkGradedContent({ student, assignment, grade });
    const metadata = {
      homeworkAssignmentId: String(assignment._id),
      homeworkSubmissionId: submission?._id ? String(submission._id) : "",
      gradeId: String(grade._id),
      marks: Number(grade?.marks ?? 0),
      maxMarks: Number(grade?.maxMarks ?? assignment?.maxMarks ?? 0),
    };

    const createdNotifications = [];

    for (const recipient of audience.parentRecipients) {
      const channels = [];
      if (recipient.pushEnabled) channels.push("push");
      if (recipient.emailEnabled) channels.push("email");

      const notification = new Notification({
        school: student.school,
        recipient: recipient.userId,
        recipientEmail: recipient.email,
        student: student._id,
        type: "homework_graded",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels,
        metadata,
        createdBy,
      });

      await notification.save();
      createdNotifications.push(notification);

      if (recipient.pushEnabled) {
        try {
          await this._dispatchParentUpdatePush({
            notification,
            student,
            recipientEmails: [recipient.email],
            preferredUserIds: [recipient.userId],
          });
        } catch (error) {
          logger.error("homework_graded_push_failed", {
            notificationId: String(notification._id || ""),
            userId: recipient.userId,
            error: error?.message || String(error),
          });
        }
      }

      if (recipient.emailEnabled) {
        try {
          await this.sendEmail(notification, createdBy);
        } catch (error) {
          logger.error("homework_graded_email_failed", {
            notificationId: String(notification._id || ""),
            recipientEmail: recipient.email,
            error: error?.message || String(error),
          });
        }
      }
    }

    for (const email of audience.fallbackEmails) {
      const notification = new Notification({
        school: student.school,
        recipientEmail: email,
        student: student._id,
        type: "homework_graded",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels: ["email"],
        metadata,
        createdBy,
      });
      await notification.save();
      createdNotifications.push(notification);

      try {
        await this.sendEmail(notification, createdBy);
      } catch (error) {
        logger.error("homework_graded_email_fallback_failed", {
          notificationId: String(notification._id || ""),
          recipientEmail: email,
          error: error?.message || String(error),
        });
      }
    }

    return createdNotifications;
  }

  async sendAssignmentPostedNotification({
    studentId,
    assignment,
    createdBy = null,
  }) {
    if (!studentId || !assignment?._id) return [];

    const student = await Student.findById(studentId);
    if (!student) return [];

    const audience = await this._resolveAssignmentAudience(student);
    if (
      audience.parentRecipients.length === 0 &&
      audience.fallbackEmails.length === 0
    ) {
      return [];
    }

    const content = await this._buildAssignmentPostedContent({ student, assignment });
    const metadata = {
      assignmentId: String(assignment._id),
      assignmentTypeKey: String(assignment?.assignmentTypeKey || ""),
      dueDate: assignment?.dueDate || null,
    };
    const createdNotifications = [];

    for (const recipient of audience.parentRecipients) {
      const channels = [];
      if (recipient.pushEnabled) channels.push("push");
      if (recipient.emailEnabled) channels.push("email");

      const notification = new Notification({
        school: student.school,
        recipient: recipient.userId,
        recipientEmail: recipient.email,
        student: student._id,
        type: "assignment_posted",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels,
        metadata,
        createdBy,
      });
      await notification.save();
      createdNotifications.push(notification);

      if (recipient.pushEnabled) {
        try {
          await this._dispatchParentUpdatePush({
            notification,
            student,
            recipientEmails: [recipient.email],
            preferredUserIds: [recipient.userId],
          });
        } catch (error) {
          logger.error("assignment_posted_push_failed", {
            notificationId: String(notification._id || ""),
            userId: recipient.userId,
            error: error?.message || String(error),
          });
        }
      }

      if (recipient.emailEnabled) {
        try {
          await this.sendEmail(notification, createdBy);
        } catch (error) {
          logger.error("assignment_posted_email_failed", {
            notificationId: String(notification._id || ""),
            recipientEmail: recipient.email,
            error: error?.message || String(error),
          });
        }
      }
    }

    for (const email of audience.fallbackEmails) {
      const notification = new Notification({
        school: student.school,
        recipientEmail: email,
        student: student._id,
        type: "assignment_posted",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels: ["email"],
        metadata,
        createdBy,
      });
      await notification.save();
      createdNotifications.push(notification);
      try {
        await this.sendEmail(notification, createdBy);
      } catch (error) {
        logger.error("assignment_posted_email_fallback_failed", {
          notificationId: String(notification._id || ""),
          recipientEmail: email,
          error: error?.message || String(error),
        });
      }
    }

    return createdNotifications;
  }

  /**
   * Send an AI-generated reminder to parents about an assignment.
   * @param {Object} params
   * @param {string} params.studentId
   * @param {Object} params.assignment - Assignment document
   * @param {string} params.subject - Email subject
   * @param {string} params.reminderText - AI-generated reminder body
   * @param {string} [params.createdBy]
   * @returns {Promise<Array>} created notifications
   */
  async sendAssignmentReminderNotification({
    studentId,
    assignment,
    subject,
    reminderText,
    createdBy = null,
  }) {
    if (!studentId || !assignment?._id) return [];

    const student = await Student.findById(studentId);
    if (!student) return [];

    const audience = await this._resolveAssignmentAudience(student);
    if (audience.parentRecipients.length === 0 && audience.fallbackEmails.length === 0) {
      logger.info("assignment_reminder_no_parent_audience", {
        studentId: String(studentId),
        studentName: student.fullName || "Unknown",
        hasParentEmails: !!(student.parentInfo?.fatherEmail || student.parentInfo?.motherEmail || student.parentInfo?.guardianEmail),
      });
      return [];
    }

    const typeName = String(assignment.assignmentTypeName || "Assignment").trim();
    const title = String(assignment.title || "Assignment").trim();
    const dueDate = formatDateForNotice(assignment.dueDate);
    const assignmentUrl = assignment._id ? buildPortalLink(`/assignments/${assignment._id}`) : "";

    const detailRows = [
      `<p class="detail-row"><span class="label">Student:</span> ${escapeHtml(student.fullName || "Student")}</p>`,
      `<p class="detail-row"><span class="label">Title:</span> ${escapeHtml(title)}</p>`,
      `<p class="detail-row"><span class="label">Type:</span> ${escapeHtml(typeName)}</p>`,
      dueDate ? `<p class="detail-row"><span class="label">Due date:</span> ${escapeHtml(dueDate)}</p>` : "",
    ].filter(Boolean).join("");

    const ctaHtml = assignmentUrl
      ? `<p><a href="${escapeHtml(assignmentUrl)}" class="btn">View ${escapeHtml(typeName)}</a></p>`
      : "<p>Open the app to review details.</p>";

    const bodyHtml = `<p>${escapeHtml(reminderText)}</p>${detailRows}${ctaHtml}`;
    const htmlContent = wrapEmailHtml({ preheader: subject, bodyHtml, accentColor: "#d97706" });

    const metadata = {
      assignmentId: String(assignment._id),
      assignmentTypeKey: String(assignment.assignmentTypeKey || ""),
      dueDate: assignment.dueDate || null,
      isReminder: true,
    };

    const createdNotifications = [];

    for (const recipient of audience.parentRecipients) {
      const channels = [];
      if (recipient.pushEnabled) channels.push("push");
      if (recipient.emailEnabled) channels.push("email");

      const notification = new Notification({
        school: student.school,
        recipient: recipient.userId,
        recipientEmail: recipient.email,
        student: student._id,
        type: "assignment_reminder",
        subject,
        message: reminderText,
        htmlContent,
        channels,
        metadata,
        createdBy,
      });
      await notification.save();
      createdNotifications.push(notification);

      if (recipient.pushEnabled) {
        try {
          await this._dispatchParentUpdatePush({ notification, student, recipientEmails: [recipient.email], preferredUserIds: [recipient.userId] });
        } catch (error) {
          logger.error("assignment_reminder_push_failed", { notificationId: String(notification._id || ""), error: error?.message || String(error) });
        }
      }
      if (recipient.emailEnabled) {
        try {
          await this.sendEmail(notification, createdBy);
        } catch (error) {
          logger.error("assignment_reminder_email_failed", { notificationId: String(notification._id || ""), error: error?.message || String(error) });
        }
      }
    }

    for (const email of audience.fallbackEmails) {
      const notification = new Notification({
        school: student.school,
        recipientEmail: email,
        student: student._id,
        type: "assignment_reminder",
        subject,
        message: reminderText,
        htmlContent,
        channels: ["email"],
        metadata,
        createdBy,
      });
      await notification.save();
      createdNotifications.push(notification);
      try {
        await this.sendEmail(notification, createdBy);
      } catch (error) {
        logger.error("assignment_reminder_email_fallback_failed", { notificationId: String(notification._id || ""), error: error?.message || String(error) });
      }
    }

    return createdNotifications;
  }

  /**
   * Send an AI-generated reminder directly to a student.
   */
  async sendStudentAssignmentReminderNotification({
    studentId,
    assignment,
    subject,
    reminderText,
    createdBy = null,
  }) {
    if (!studentId || !assignment?._id) return null;

    const student = await Student.findById(studentId);
    if (!student?.user || !student?.school) {
      logger.info("student_reminder_skipped_no_user", {
        studentId: String(studentId),
        hasUser: !!student?.user,
        hasSchool: !!student?.school,
      });
      return null;
    }

    const typeName = String(assignment.assignmentTypeName || "Assignment").trim();
    const title = String(assignment.title || "Assignment").trim();
    const dueDate = formatDateForNotice(assignment.dueDate);
    const assignmentUrl = assignment._id ? buildPortalLink(`/assignments/${assignment._id}`) : "";

    const detailRows = [
      `<p class="detail-row"><span class="label">Title:</span> ${escapeHtml(title)}</p>`,
      `<p class="detail-row"><span class="label">Type:</span> ${escapeHtml(typeName)}</p>`,
      dueDate ? `<p class="detail-row"><span class="label">Due date:</span> ${escapeHtml(dueDate)}</p>` : "",
    ].filter(Boolean).join("");

    const ctaHtml = assignmentUrl
      ? `<p><a href="${escapeHtml(assignmentUrl)}" class="btn">View ${escapeHtml(typeName)}</a></p>`
      : "<p>Open the app to review details.</p>";

    const bodyHtml = `<p>${escapeHtml(reminderText)}</p>${detailRows}${ctaHtml}`;
    const htmlContent = wrapEmailHtml({ preheader: subject, bodyHtml, accentColor: "#d97706" });

    const metadata = {
      assignmentId: String(assignment._id),
      assignmentTypeKey: String(assignment.assignmentTypeKey || ""),
      dueDate: assignment.dueDate || null,
      isReminder: true,
    };

    const studentUserId = String(student.user?._id || student.user);
    const studentUser = await User.findById(studentUserId).select("email").lean();
    const studentEmail = studentUser?.email || "";

    const notification = new Notification({
      school: student.school,
      recipient: studentUserId,
      recipientEmail: studentEmail,
      student: student._id,
      type: "assignment_reminder",
      subject,
      message: reminderText,
      htmlContent,
      channels: ["push", ...(studentEmail ? ["email"] : [])],
      metadata,
      createdBy,
    });
    await notification.save();

    try {
      await this._dispatchStudentPush({ notification, student });
    } catch (error) {
      logger.error("student_assignment_reminder_push_failed", {
        notificationId: String(notification._id || ""),
        studentId: String(student._id),
        error: error?.message || String(error),
      });
    }

    if (studentEmail) {
      try {
        await this.sendEmail(notification, createdBy);
      } catch (error) {
        logger.error("student_assignment_reminder_email_failed", {
          notificationId: String(notification._id || ""),
          studentEmail,
          error: error?.message || String(error),
        });
      }
    }

    return notification;
  }

  /**
   * Notify the student directly when an assignment is posted.
   * Respects school-level settings.notifications.studentNotifications.onAssignmentPosted.
   */
  async sendStudentAssignmentPostedNotification({
    studentId,
    assignment,
    createdBy = null,
  }) {
    if (!studentId || !assignment?._id) return null;

    const student = await Student.findById(studentId);
    if (!student?.user || !student?.school) return null;

    const schoolSettings = await this._getSchoolNotificationSettings(student.school);
    if (schoolSettings?.studentNotifications?.onAssignmentPosted === false) return null;

    const content = await this._buildAssignmentPostedContent({ student, assignment });
    const metadata = {
      assignmentId: String(assignment._id),
      assignmentTypeKey: String(assignment?.assignmentTypeKey || ""),
      dueDate: assignment?.dueDate || null,
    };

    const studentUserId = String(student.user?._id || student.user);
    const studentUser = await User.findById(studentUserId).select("email").lean();
    const studentEmail = studentUser?.email || "";

    const notification = new Notification({
      school: student.school,
      recipient: studentUserId,
      recipientEmail: studentEmail,
      student: student._id,
      type: "assignment_posted",
      subject: content.subject,
      message: content.message,
      htmlContent: content.htmlContent,
      channels: ["push", ...(studentEmail ? ["email"] : [])],
      metadata,
      createdBy,
    });
    await notification.save();

    try {
      await this._dispatchStudentPush({ notification, student });
    } catch (error) {
      logger.error("student_assignment_posted_push_failed", {
        notificationId: String(notification._id || ""),
        studentId: String(student._id),
        error: error?.message || String(error),
      });
    }

    if (studentEmail) {
      try {
        await this.sendEmail(notification, createdBy);
      } catch (error) {
        logger.error("student_assignment_posted_email_failed", {
          notificationId: String(notification._id || ""),
          studentEmail,
          error: error?.message || String(error),
        });
      }
    }

    return notification;
  }

  async sendAssignmentGradedNotification({
    studentId,
    assignment,
    grade,
    createdBy = null,
  }) {
    if (!studentId || !assignment?._id || !grade?._id) return [];

    const student = await Student.findById(studentId);
    if (!student) return [];

    const audience = await this._resolveAssignmentAudience(student);
    if (
      audience.parentRecipients.length === 0 &&
      audience.fallbackEmails.length === 0
    ) {
      return [];
    }

    const content = this._buildAssignmentGradedContent({ student, assignment, grade });
    const metadata = {
      assignmentId: String(assignment._id),
      assignmentTypeKey: String(assignment?.assignmentTypeKey || ""),
      gradeId: String(grade._id),
      marks: Number(grade?.marks ?? 0),
      maxMarks: Number(grade?.maxMarks ?? assignment?.maxMarks ?? 0),
    };
    const createdNotifications = [];

    for (const recipient of audience.parentRecipients) {
      const channels = [];
      if (recipient.pushEnabled) channels.push("push");
      if (recipient.emailEnabled) channels.push("email");

      const notification = new Notification({
        school: student.school,
        recipient: recipient.userId,
        recipientEmail: recipient.email,
        student: student._id,
        type: "assignment_graded",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels,
        metadata,
        createdBy,
      });
      await notification.save();
      createdNotifications.push(notification);

      if (recipient.pushEnabled) {
        try {
          await this._dispatchParentUpdatePush({
            notification,
            student,
            recipientEmails: [recipient.email],
            preferredUserIds: [recipient.userId],
          });
        } catch (error) {
          logger.error("assignment_graded_push_failed", {
            notificationId: String(notification._id || ""),
            userId: recipient.userId,
            error: error?.message || String(error),
          });
        }
      }

      if (recipient.emailEnabled) {
        try {
          await this.sendEmail(notification, createdBy);
        } catch (error) {
          logger.error("assignment_graded_email_failed", {
            notificationId: String(notification._id || ""),
            recipientEmail: recipient.email,
            error: error?.message || String(error),
          });
        }
      }
    }

    for (const email of audience.fallbackEmails) {
      const notification = new Notification({
        school: student.school,
        recipientEmail: email,
        student: student._id,
        type: "assignment_graded",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels: ["email"],
        metadata,
        createdBy,
      });
      await notification.save();
      createdNotifications.push(notification);
      try {
        await this.sendEmail(notification, createdBy);
      } catch (error) {
        logger.error("assignment_graded_email_fallback_failed", {
          notificationId: String(notification._id || ""),
          recipientEmail: email,
          error: error?.message || String(error),
        });
      }
    }

    return createdNotifications;
  }

  /**
   * Notify parents when a student completes a standard assignment (assessment/practice).
   */
  async sendStandardAssignmentCompletedNotification({
    studentId,
    assignment,
    score = null,
    maxScore = null,
  }) {
    if (!studentId || !assignment?._id) return [];

    const student = await Student.findById(studentId);
    if (!student) return [];

    const audience = await this._resolveAssignmentAudience(student);
    if (audience.parentRecipients.length === 0 && audience.fallbackEmails.length === 0) {
      return [];
    }

    const studentName = student?.fullName || "Student";
    const title = String(assignment?.title || "Standards Practice").trim();
    const sessionType = assignment?.practiceConfig?.sessionType || "practice";
    const typeName = sessionType === "assessment" ? "Assessment" : "Standards Practice";
    const scoreText = Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0
      ? `Score: ${score}/${maxScore}`
      : "";

    const subject = `${typeName} completed: ${title}`;
    const messageLines = [
      `${studentName} has completed a ${typeName.toLowerCase()}.`,
      `Title: ${title}`,
      scoreText,
      "Open the app to review details.",
    ].filter(Boolean);

    const htmlParts = [
      `<p><strong>${escapeHtml(studentName)}</strong> has completed a ${escapeHtml(typeName.toLowerCase())}.</p>`,
      `<p><strong>Title:</strong> ${escapeHtml(title)}</p>`,
      scoreText ? `<p><strong>${escapeHtml(scoreText)}</strong></p>` : "",
      "<p>Open the app to review details.</p>",
    ].filter(Boolean);

    const content = {
      subject,
      message: messageLines.join("\n"),
      htmlContent: htmlParts.join(""),
    };

    const metadata = {
      assignmentId: String(assignment._id),
      assignmentTypeKey: "standard_assignment",
      event: "completed",
    };

    const createdNotifications = [];

    for (const recipient of audience.parentRecipients) {
      const channels = [];
      if (recipient.pushEnabled) channels.push("push");
      if (recipient.emailEnabled) channels.push("email");

      const notification = new Notification({
        school: student.school,
        recipient: recipient.userId,
        recipientEmail: recipient.email,
        student: student._id,
        type: "assignment_completed",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels,
        metadata,
      });
      await notification.save();
      createdNotifications.push(notification);

      if (recipient.pushEnabled) {
        try {
          await this._dispatchParentUpdatePush({
            notification,
            student,
            recipientEmails: [recipient.email],
            preferredUserIds: [recipient.userId],
          });
        } catch (error) {
          logger.error("assignment_completed_push_failed", {
            notificationId: String(notification._id || ""),
            error: error?.message || String(error),
          });
        }
      }

      if (recipient.emailEnabled) {
        try {
          await this.sendEmail(notification);
        } catch (error) {
          logger.error("assignment_completed_email_failed", {
            notificationId: String(notification._id || ""),
            error: error?.message || String(error),
          });
        }
      }
    }

    for (const email of audience.fallbackEmails) {
      const notification = new Notification({
        school: student.school,
        recipientEmail: email,
        student: student._id,
        type: "assignment_completed",
        subject: content.subject,
        message: content.message,
        htmlContent: content.htmlContent,
        channels: ["email"],
        metadata,
      });
      await notification.save();
      createdNotifications.push(notification);
      try {
        await this.sendEmail(notification);
      } catch (error) {
        logger.error("assignment_completed_email_fallback_failed", {
          notificationId: String(notification._id || ""),
          error: error?.message || String(error),
        });
      }
    }

    return createdNotifications;
  }

  /**
   * Notify the student directly when an assignment is graded.
   * Respects school-level settings.notifications.studentNotifications.onAssignmentGraded.
   */
  async sendStudentAssignmentGradedNotification({
    studentId,
    assignment,
    grade,
    createdBy = null,
  }) {
    if (!studentId || !assignment?._id || !grade?._id) return null;

    const student = await Student.findById(studentId);
    if (!student?.user || !student?.school) return null;

    const schoolSettings = await this._getSchoolNotificationSettings(student.school);
    if (schoolSettings?.studentNotifications?.onAssignmentGraded === false) return null;

    const content = this._buildAssignmentGradedContent({ student, assignment, grade });
    const metadata = {
      assignmentId: String(assignment._id),
      assignmentTypeKey: String(assignment?.assignmentTypeKey || ""),
      gradeId: String(grade._id),
      marks: Number(grade?.marks ?? 0),
      maxMarks: Number(grade?.maxMarks ?? assignment?.maxMarks ?? 0),
    };

    const studentUserId = String(student.user?._id || student.user);
    const studentUser = await User.findById(studentUserId).select("email").lean();
    const studentEmail = studentUser?.email || "";

    const notification = new Notification({
      school: student.school,
      recipient: studentUserId,
      recipientEmail: studentEmail,
      student: student._id,
      type: "assignment_graded",
      subject: content.subject,
      message: content.message,
      htmlContent: content.htmlContent,
      channels: ["push", ...(studentEmail ? ["email"] : [])],
      metadata,
      createdBy,
    });
    await notification.save();

    try {
      await this._dispatchStudentPush({ notification, student });
    } catch (error) {
      logger.error("student_assignment_graded_push_failed", {
        notificationId: String(notification._id || ""),
        studentId: String(student._id),
        error: error?.message || String(error),
      });
    }

    if (studentEmail) {
      try {
        await this.sendEmail(notification, createdBy);
      } catch (error) {
        logger.error("student_assignment_graded_email_failed", {
          notificationId: String(notification._id || ""),
          studentEmail,
          error: error?.message || String(error),
        });
      }
    }

    return notification;
  }

  /**
   * Send grade update notification to parent(s) and student
   */
  async sendGradeUpdateNotification(studentId, gradeData, createdBy) {
    const student = await Student.findById(studentId);
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) {
      logger.info("No parent or student email found for student:", studentId);
      return null;
    }

    const contact = student.getPrimaryContact();

    const subject = `Grade Update for ${student.fullName}`;
    const message = this.formatGradeUpdateMessage(student, gradeData);
    const htmlContent = await this.formatGradeUpdateHtml(
      student,
      gradeData,
      createdBy,
    );

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      recipientPhone: contact?.phone,
      student: studentId,
      type: "grade_update",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      createdBy,
    });

    await notification.save();
    await this._dispatchParentUpdatePush({
      notification,
      student,
      recipientEmails: recipients,
    });
    await this.sendEmail(notification, createdBy);

    return notification;
  }

  /**
   * Send daily report for a student to all contact emails
   */
  async sendDailyReport(studentId, date, createdBy) {
    const student = await Student.findById(studentId)
      .populate("currentClass")
      .populate("user", "email");
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) return null;

    // Get today's grades
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const grades = await gradeService.getStudentGrades(studentId, {
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    if (grades.length === 0) return null;

    const subject = `Daily Report for ${student.fullName} - ${date.toLocaleDateString()}`;
    const message = this.formatDailyReportMessage(student, grades, date);
    const htmlContent = await this.formatDailyReportHtml(
      student,
      grades,
      date,
      createdBy,
    );

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      student: studentId,
      type: "daily_report",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      createdBy,
    });

    await notification.save();
    await this._dispatchParentUpdatePush({
      notification,
      student,
      recipientEmails: recipients,
    });
    await this.sendEmail(notification, createdBy);

    return notification;
  }

  /**
   * Send daily classwork update - cumulative monthly report
   * Includes all classwork grades from the 1st of the month to today
   */
  async sendDailyClassworkUpdate(studentId, date, createdBy, filters = {}) {
    const student = await Student.findById(studentId)
      .populate("currentClass")
      .populate("user", "email");
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) return null;

    const normalizedFilters = {
      subject: String(filters.subject ?? "").trim() || undefined,
      category:
        String(filters.category ?? "").trim().toLowerCase() || undefined,
    };

    // Get all classwork grades for the current month up to today, with optional filters
    let grades = await gradeService.getMonthlyClassworkGrades(
      studentId,
      date,
      {
        subject: normalizedFilters.subject,
        category: normalizedFilters.category,
      },
    );

    if (grades.length === 0) return null;

    const monthName = date.toLocaleString("default", { month: "long" });
    const dayName = date.toLocaleString("default", { weekday: "long" });
    const todayDate = date.getDate();
    const year = date.getFullYear();
    const today = `${dayName}, ${monthName} ${todayDate}, ${year}`;
    logger.info("Daily classwork update date", { today });
    const todayFormatted = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Customize subject line based on filters
    let reportTitle = "Class Update";
    if (normalizedFilters.category && normalizedFilters.category.toLowerCase() !== "all") {
      // Capitalize first letter
      const categoryTitle =
        normalizedFilters.category.charAt(0).toUpperCase() +
        normalizedFilters.category.slice(1);
      reportTitle = `${categoryTitle} Report`;
    }

    const subject = `${reportTitle} - ${student.fullName} (${today})`;
    const message = await this.formatDailyClassworkUpdateMessage(
      student,
      grades,
      date,
      monthName,
      year,
      reportTitle,
      createdBy,
    );
    const htmlContent = await this.formatDailyClassworkUpdateHtml(
      student,
      grades,
      date,
      monthName,
      year,
      reportTitle,
      createdBy,
    );

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      student: studentId,
      type: "daily_classwork_update",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      metadata: {
        month: date.getMonth() + 1,
        year,
        gradesCount: grades.length,
        filterCategory: normalizedFilters.category,
      },
      createdBy,
    });

    await notification.save();
    await this._dispatchParentUpdatePush({
      notification,
      student,
      recipientEmails: recipients,
    });
    await this.sendEmail(notification, createdBy);

    return notification;
  }

  /**
   * Send gradebook summary update - cumulative monthly report
   * Includes all grade categories for the selected month, with optional subject/category filters
   */
  async sendGradebookSummaryUpdate(studentId, date, createdBy, filters = {}) {
    const student = await Student.findById(studentId)
      .populate("currentClass")
      .populate("user", "email");
    if (!student) throw new Error("Student not found");

    const contactEntries = student.getAllContactEmailEntries();
    const recipientSet = new Set();
    contactEntries.forEach((entry) => {
      if (!entry?.email) return;
      recipientSet.add(String(entry.email).trim().toLowerCase());
    });

    // Ensure student also receives the message when a linked user email exists.
    const directStudentEmails = [student.studentEmail, student.email, student?.user?.email]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    directStudentEmails.forEach((email) => recipientSet.add(email));

    const recipients = Array.from(recipientSet);
    if (recipients.length === 0) return null;

    const normalizeCategoryFilter = (value) => {
      const normalized = String(value ?? "").trim().toLowerCase();
      if (!normalized) return undefined;
      if (normalized === "all") return undefined;
      if (normalized === "all categories") return undefined;
      if (normalized.startsWith("all ")) return undefined;
      return normalized;
    };

    const normalizedFilters = {
      subject: String(filters.subject ?? "").trim() || undefined,
      category: normalizeCategoryFilter(filters.category),
    };

    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const buildGradeFilters = (includeNarrowFilters = true) => ({
      startDate: startOfMonth,
      endDate: endOfMonth,
      ...(includeNarrowFilters && normalizedFilters.subject
        ? { subject: normalizedFilters.subject }
        : {}),
      ...(includeNarrowFilters && normalizedFilters.category
        ? { category: normalizedFilters.category }
        : {}),
    });

    let grades = await gradeService.getStudentGrades(
      studentId,
      buildGradeFilters(true),
    );

    if (grades.length === 0) return null;

    const monthName = date.toLocaleString("default", { month: "long" });
    const dayName = date.toLocaleString("default", { weekday: "long" });
    const todayDate = date.getDate();
    const year = date.getFullYear();
    const today = `${dayName}, ${monthName} ${todayDate}, ${year}`;

    let reportTitle = "Monthly Gradebook Summary";
    if (normalizedFilters.category && normalizedFilters.category.toLowerCase() !== "all") {
      const categoryTitle =
        normalizedFilters.category.charAt(0).toUpperCase() +
        normalizedFilters.category.slice(1);
      reportTitle = `${categoryTitle} Summary`;
    }

    const subject = `${reportTitle} - ${student.fullName} (${today})`;
    const message = await this.formatGradebookSummaryMessage(
      student,
      grades,
      date,
      monthName,
      year,
      reportTitle,
      createdBy,
    );
    const htmlContent = await this.formatGradebookSummaryHtml(
      student,
      grades,
      date,
      monthName,
      year,
      reportTitle,
      createdBy,
    );

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      student: studentId,
      type: NOTIFICATION_TYPES.GRADEBOOK_SUMMARY,
      subject,
      message,
      htmlContent,
      channels: ["email"],
      metadata: {
        month: date.getMonth() + 1,
        year,
        gradesCount: grades.length,
        filterCategory: normalizedFilters.category,
        filterSubject: normalizedFilters.subject,
        source: "gradebook_summary",
      },
      createdBy,
    });

    await notification.save();
    await this._dispatchParentUpdatePush({
      notification,
      student,
      recipientEmails: recipients,
    });
    await this.sendEmail(notification, createdBy);

    return notification;
  }

  /**
   * Send monthly report to all contact emails
   */
  async sendMonthlyReport(studentId, month, academicYear, createdBy) {
    const student = await Student.findById(studentId)
      .populate("currentClass")
      .populate("user", "email");
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) return null;

    const report = await gradeService.getStudentGradeReport(
      studentId,
      academicYear,
    );
    const monthlyGrades = await gradeService.getStudentGrades(studentId, {
      month,
      academicYear,
    });
    const subjectNotesSummary = buildSubjectNotesSummary(monthlyGrades);
    const monthName = new Date(2024, month - 1).toLocaleString("default", {
      month: "long",
    });

    const subject = `Monthly Report for ${student.fullName} - ${monthName} ${academicYear}`;
    const message = this.formatMonthlyReportMessage(
      student,
      report,
      month,
      monthName,
      subjectNotesSummary,
    );
    const htmlContent = await this.formatMonthlyReportHtml(
      student,
      report,
      month,
      monthName,
      createdBy,
      subjectNotesSummary,
    );

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      student: studentId,
      type: "monthly_report",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      metadata: { month, academicYear },
      createdBy,
    });

    await notification.save();
    await this._dispatchParentUpdatePush({
      notification,
      student,
      recipientEmails: recipients,
    });
    await this.sendEmail(notification, createdBy);

    return notification;
  }

  /**
   * Send AI-generated report to parent
   * @param {String} studentId - Student ID
   * @param {String} reportContent - HTML content of the AI report
   * @param {String} period - Period covered by the report
   * @param {String} userId - User ID of the sender
   * @returns {Promise<Object>} Notification document
   */
  async sendAIReportToParent(studentId, reportContent, period, userId) {
    const student = await Student.findById(studentId)
      .populate("currentClass")
      .populate("user", "email");
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) {
      throw new Error("No student-related contact email found for this student");
    }

    const subject = `Progress Report for ${student.fullName} - ${period}`;

    // Extract text content from HTML for plain text version
    const plainText = reportContent
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      student: studentId,
      type: "ai_report",
      subject,
      message: plainText,
      htmlContent: reportContent,
      channels: ["email"],
      metadata: {
        period,
        reportType: "ai_generated",
      },
      createdBy: userId,
    });

    await notification.save();
    await this._dispatchParentUpdatePush({
      notification,
      student,
      recipientEmails: recipients,
    });
    await this.sendEmail(notification, userId);

    return notification;
  }

  /**
   * Send email using Gmail OAuth.
   * If userId is provided, tries that user's Gmail first.
   * If userId is null or that user has no Gmail, finds any admin in the same
   * school with a connected Gmail account to send on behalf of the school.
   *
   * @param {Object} notification - Notification document
   * @param {string} userId - User ID for Gmail OAuth (optional)
   */
  async sendEmail(notification, userId = null) {
    const baseMailOptions = {
      to: notification.recipientEmail,
      subject: sanitizeSubject(notification.subject),
      text: notification.message,
      html: notification.htmlContent || notification.message,
    };
    const schoolName = await this._resolveSchoolName(notification.school);
    const mailOptions = addSchoolNameToMailContent(baseMailOptions, schoolName);

    // 1. Try the provided userId (Gmail OAuth — primary transport)
    if (userId) {
      try {
        const hasGmail = await gmailOAuthService.hasValidTokens(userId);
        if (hasGmail) {
          const result = await gmailOAuthService.sendEmail(userId, mailOptions);
          await notification.markAsSent("email");
          logger.info("Email sent via Gmail OAuth", {
            to: notification.recipientEmail,
            messageId: result.messageId,
          });
          return;
        }
      } catch (error) {
        logger.error("Gmail OAuth send failed for provided user:", error.message);
        // Fall through to admin fallback
      }
    }

    // 2. Fallback: find an admin in the school with Gmail connected
    const schoolId = notification.school;
    if (schoolId) {
      try {
        const adminsWithGmail = await User.find({
          school: schoolId,
          role: "admin",
          isActive: true,
          "gmailTokens.refreshToken": { $exists: true, $ne: null },
        })
          .select("_id")
          .setOptions({ skipTenantFilter: true })
          .lean();

        for (const admin of adminsWithGmail) {
          try {
            const hasGmail = await gmailOAuthService.hasValidTokens(admin._id);
            if (hasGmail) {
              const result = await gmailOAuthService.sendEmail(
                admin._id.toString(),
                mailOptions,
              );
              await notification.markAsSent("email");
              logger.info("Email sent via admin Gmail fallback", {
                to: notification.recipientEmail,
                messageId: result.messageId,
              });
              return;
            }
          } catch (innerErr) {
            logger.error(`Admin ${admin._id} Gmail send failed:`, innerErr.message);
            // Try next admin
          }
        }
      } catch (error) {
        logger.error("Error finding admin Gmail sender:", error.message);
      }
    }

    // 3. SMTP fallback (last resort)
    if (this._smtpTransport) {
      try {
        const info = await this._smtpTransport.sendMail({
          from: `"${this._smtpFromName}" <${this._smtpFrom}>`,
          ...mailOptions,
        });
        await notification.markAsSent("email");
        logger.info("Email sent via SMTP fallback", {
          to: notification.recipientEmail,
          messageId: info.messageId,
        });
        return;
      } catch (smtpErr) {
        logger.warn("SMTP fallback also failed", {
          to: notification.recipientEmail,
          error: smtpErr?.message,
        });
      }
    }

    // 4. No sender available
    const errorMsg =
      "No email transport available. Connect Gmail in Settings > Gmail Integration, or configure SMTP_HOST/SMTP_USER/SMTP_PASS in .env as fallback.";
    logger.error(errorMsg);
    notification.status = "failed";
    notification.lastError = errorMsg;
    await notification.save();
    throw new Error(errorMsg);
  }

  // Message formatters
  formatGradeUpdateMessage(student, gradeData) {
    const observation = getGradeObservation(gradeData);
    return `
Dear ${student.firstName}'s Parent,

This is to inform you that ${student.fullName} received a grade update:

Subject: ${gradeData.subjectName}
Type: ${gradeData.gradeType}
Marks: ${gradeData.marks}/${gradeData.maxMarks}
Date: ${new Date(gradeData.date).toLocaleDateString()}
${observation ? `Notes: ${observation}` : ""}

Best regards,
    `.trim();
  }

  async formatGradeUpdateHtml(student, gradeData, createdBy = null) {
    const percentage = ((gradeData.marks / gradeData.maxMarks) * 100).toFixed(1);
    const teacherName = await this._resolveTeacherName(createdBy);
    const schoolName = await this._resolveSchoolName(student?.school);

    const observation = getGradeObservation(gradeData);
    const remarksSection = observation
      ? renderTemplate("gradeUpdateRemarks", { remarks: observation })
      : "";

    return renderTemplate("gradeUpdate", {
      studentFullName: student.fullName,
      studentFirstName: student.firstName,
      teacherName,
      schoolName,
      subjectName: gradeData.subjectName,
      gradeType: gradeData.gradeType,
      gradeDate: new Date(gradeData.date).toLocaleDateString(),
      marks: gradeData.marks,
      maxMarks: gradeData.maxMarks,
      percentage,
      remarksSection,
      clientUrl: getClientUrl(),
      year: new Date().getFullYear(),
    });
  }

  formatDailyReportMessage(student, grades, date) {
    const prettyDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    let message = `Daily Report for ${student.fullName}\n`;
    message += `Date: ${prettyDate}\n\n`;

    grades.forEach((grade) => {
      const percentage = ((grade.marks / grade.maxMarks) * 100).toFixed(1);
      message += `${grade.subject.name}: ${grade.marks}/${grade.maxMarks} (${percentage}%)\n`;
      const observation = getGradeObservation(grade);
      if (observation) {
        message += `  Notes: ${observation}\n`;
      }
    });

    return message.trim();
  }

  async formatDailyReportHtml(student, grades, date, createdBy = null) {
    const prettyDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const teacherName = await this._resolveTeacherName(createdBy);
    const schoolName = await this._resolveSchoolName(student?.school);

    const gradesRows = grades
      .map((grade) => {
        const observation = getGradeObservation(grade);
        const notesLine = observation
          ? `<div class="meta-line">Notes: ${escapeHtml(observation)}</div>`
          : "";
        return `<div class="row-item">
          <div class="row-left">${grade.subject.name}${notesLine}</div>
          <div class="row-right"><span class="badge">${grade.marks} / ${grade.maxMarks}</span></div>
        </div>`;
      })
      .join("");

    return renderTemplate("dailyReport", {
      prettyDate,
      studentFirstName: student.firstName,
      studentFullName: student.fullName,
      teacherName,
      schoolName,
      gradesRows,
    });
  }

  formatMonthlyReportMessage(student, report, month, monthName, subjectNotesSummary = {}) {
    let message = `Monthly Report for ${student.fullName} - ${monthName}\n\n`;

    report.subjects.forEach((subject) => {
      const monthData = subject.monthlyAverages[month];
      if (monthData) {
        message += `${subject.subjectName}: ${monthData.average}% (based on ${monthData.entries} entries)\n`;
        const subjectId = String(subject.subjectId || "").trim();
        const noteSummary = subjectNotesSummary[subjectId];
        if (noteSummary?.count) {
          message += `  Notes (${noteSummary.count}): ${noteSummary.samples.join(" | ")}\n`;
        }
      }
    });

    message += `\nOverall Average: ${report.overallAverage}%`;
    return message.trim();
  }

  async formatMonthlyReportHtml(
    student,
    report,
    month,
    monthName,
    createdBy = null,
    subjectNotesSummary = {},
  ) {
    const teacherName = await this._resolveTeacherName(createdBy);
    const schoolName = await this._resolveSchoolName(student?.school);

    const subjectsRows = report.subjects
      .map((subject) => {
        const monthData = subject.monthlyAverages[month];
        const avg = monthData?.average || "N/A";
        const entries = monthData?.entries || 0;
        const subjectId = String(subject.subjectId || "").trim();
        const noteSummary = subjectNotesSummary[subjectId];
        const notesLine = noteSummary?.count
          ? `<div class="meta-line">Notes (${noteSummary.count}): ${escapeHtml(noteSummary.samples.join(" | "))}</div>`
          : "";
        const numericAvg = Number(avg);
        const hasNumericAvg = Number.isFinite(numericAvg);
        const label = hasNumericAvg ? `${numericAvg.toFixed(1)}%` : "N/A";
        return `<div class="row-item">
          <div class="row-left">
            <div>${subject.subjectName}</div>
            <div class="meta-line">${entries} entr${entries === 1 ? "y" : "ies"}</div>
            ${notesLine}
          </div>
          <div class="row-right"><span class="badge">${label}</span></div>
        </div>`;
      })
      .join("");

    return renderTemplate("monthlyReport", {
      monthName,
      studentFullName: student.fullName,
      teacherName,
      schoolName,
      subjectsRows,
      overallAverage: report.overallAverage,
    });
  }

  // Daily Classwork Update formatters
  async formatDailyClassworkUpdateMessage(
    student,
    grades,
    date,
    monthName,
    year,
    title = "Class Update",
    createdBy = null,
    summaryLabel = "Classwork Summary",
  ) {
    const todayStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Fetch the authenticated user (teacher) who is sending the notification
    let authenticatedTeacherName = "Unknown Teacher";
    if (createdBy) {
      try {
        const authenticatedUser =
          await User.findById(createdBy).select("firstName lastName");
        if (authenticatedUser) {
          authenticatedTeacherName = authenticatedUser.firstName;
        }
      } catch (error) {
        logger.error("Error fetching authenticated user:", error);
      }
    }

    let message = `${title} for ${student.fullName}\n`;
    message += `Report Date: ${todayStr}\n`;
    message += `Month: ${monthName} ${year}\n\n`;
    message += `${summaryLabel} (${grades.length} entries this month) by ${authenticatedTeacherName}:\n`;
    message += "─".repeat(50) + "\n";

    // Group grades by subject and category
    const grouped = {};
    grades.forEach((grade) => {
      const subjectName = grade.subject?.name || "Unknown Subject";
      const category = grade.category || grade.gradeType || "Classwork";
      if (!grouped[subjectName]) {
        grouped[subjectName] = {};
      }
      if (!grouped[subjectName][category]) {
        grouped[subjectName][category] = [];
      }
      grouped[subjectName][category].push(grade);
    });

    Object.entries(grouped).forEach(([subjectName, categories]) => {
      message += `\n${subjectName}\n`;
      Object.entries(categories).forEach(([category, subjectGrades]) => {
        message += `  ${category}:\n`;
        subjectGrades.forEach((grade) => {
          const gradeDate = new Date(grade.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const percentage = ((grade.marks / grade.maxMarks) * 100).toFixed(0);
          message += `    ${gradeDate} | ${grade.marks}/${grade.maxMarks} (${percentage}%)`;
          const observation = getGradeObservation(grade);
          if (observation) {
            message += ` | ${observation}`;
          }
          message += "\n";
        });
      });
      message += "─".repeat(50) + "\n";
    });

    const totalMarks = grades.reduce((sum, g) => sum + g.marks, 0);
    const totalMaxMarks = grades.reduce((sum, g) => sum + g.maxMarks, 0);
    const overallPercentage =
      totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(1) : 0;

    message += "─".repeat(50) + "\n";
    message += `Monthly Average: ${overallPercentage}%\n\n`;
    message += "Best regards,\n" + authenticatedTeacherName;

    return message;
  }

  async formatDailyClassworkUpdateHtml(
    student,
    grades,
    date,
    monthName,
    year,
    title = "Class Update",
    createdBy = null,
  ) {
    const todayStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const teacherInfo = await this._resolveTeacherInfo(createdBy);
    const teacherName = teacherInfo.firstName || "Unknown Teacher";
    const schoolName = await this._resolveSchoolName(student?.school);

    // Group grades by subject and category
    const grouped = {};
    grades.forEach((grade) => {
      const subjectName = grade.subject?.name || "Unknown Subject";
      const category = grade.category || grade.gradeType || "Classwork";
      if (!grouped[subjectName]) {
        grouped[subjectName] = { teacher: teacherName, categories: {} };
      }
      if (!grouped[subjectName].categories[category]) {
        grouped[subjectName].categories[category] = [];
      }
      grouped[subjectName].categories[category].push(grade);
    });

    // Build grouped HTML using partial templates
    const groupedSectionsHtml = Object.entries(grouped)
      .map(([subjectName, subjectData]) => {
        const { teacher, categories } = subjectData;

        const categorySections = Object.entries(categories)
          .map(([category, subjectGrades]) => {
            const catTotal = subjectGrades.reduce((s, g) => s + g.marks, 0);
            const catMax = subjectGrades.reduce((s, g) => s + g.maxMarks, 0);
            const categoryAverage = catMax > 0 ? ((catTotal / catMax) * 10).toFixed(1) : 0;

            const gradeRows = subjectGrades
              .map((grade) => {
                const gradeDate = new Date(grade.date).toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                });

                const notesText = getGradeObservation(grade);
                const notesLine = notesText
                  ? `<div class="row-notes">${escapeHtml(notesText)}</div>`
                  : "";

                return renderTemplate("classworkGradeRow", {
                  gradeDate,
                  scoreClass: "",
                  marks: grade.marks, maxMarks: grade.maxMarks,
                  notesLine,
                });
              })
              .join("");

            return renderTemplate("classworkCategorySection", {
              categoryName: category.charAt(0).toUpperCase() + category.slice(1),
              gradeRows,
              categoryAverage,
            });
          })
          .join("");

        return renderTemplate("classworkSubjectSection", {
          subjectName, teacher, categorySections,
        });
      })
      .join("");

    return renderTemplate("dailyClassworkUpdate", {
      title,
      todayStr,
      groupedSectionsHtml,
      teacherFirstName: teacherInfo.firstName,
      teacherEmail: teacherInfo.email,
      schoolName,
    });
  }

  async formatGradebookSummaryMessage(
    student,
    grades,
    date,
    monthName,
    year,
    title = "Monthly Gradebook Summary",
    createdBy = null,
  ) {
    const todayStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    let authenticatedTeacherName = "Unknown Teacher";
    if (createdBy) {
      try {
        const authenticatedUser =
          await User.findById(createdBy).select("firstName lastName");
        if (authenticatedUser) {
          authenticatedTeacherName = authenticatedUser.firstName;
        }
      } catch (error) {
        logger.error("Error fetching authenticated user:", error);
      }
    }

    let message = `${title} for ${student.fullName}\n`;
    message += `Report Date: ${todayStr}\n`;
    message += `Month: ${monthName} ${year}\n\n`;
    message += `Gradebook Summary (${grades.length} entries this month) by ${authenticatedTeacherName}:\n`;
    message += "─".repeat(50) + "\n";

    const grouped = {};
    grades.forEach((grade) => {
      const subjectName = grade.subject?.name || "Unknown Subject";
      const category = grade.category || grade.gradeType || "Classwork";
      if (!grouped[subjectName]) {
        grouped[subjectName] = {};
      }
      if (!grouped[subjectName][category]) {
        grouped[subjectName][category] = [];
      }
      grouped[subjectName][category].push(grade);
    });

    Object.entries(grouped).forEach(([subjectName, categories]) => {
      message += `\n${subjectName}\n`;
      Object.entries(categories).forEach(([category, subjectGrades]) => {
        message += `  ${category}:\n`;
        subjectGrades.forEach((grade) => {
          const gradeDate = new Date(grade.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const percentage = ((grade.marks / grade.maxMarks) * 100).toFixed(0);
          message += `    ${gradeDate} | ${grade.marks}/${grade.maxMarks} (${percentage}%)`;
          const observation = getGradeObservation(grade);
          if (observation) {
            message += ` | ${observation}`;
          }
          message += "\n";
        });
      });
      message += "─".repeat(50) + "\n";
    });

    const totalMarks = grades.reduce((sum, g) => sum + g.marks, 0);
    const totalMaxMarks = grades.reduce((sum, g) => sum + g.maxMarks, 0);
    const overallPercentage =
      totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(1) : 0;

    message += "─".repeat(50) + "\n";
    message += `Monthly Average: ${overallPercentage}%\n\n`;
    message += "Best regards,\n" + authenticatedTeacherName;

    return message;
  }

  async formatGradebookSummaryHtml(
    student,
    grades,
    date,
    monthName,
    year,
    title = "Monthly Gradebook Summary",
    createdBy = null,
  ) {
    const todayStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const teacherInfo = await this._resolveTeacherInfo(createdBy);
    const teacherName = teacherInfo.firstName || "Unknown Teacher";
    const schoolName = await this._resolveSchoolName(student?.school);

    const grouped = {};
    grades.forEach((grade) => {
      const subjectName = grade.subject?.name || "Unknown Subject";
      const category = grade.category || grade.gradeType || "Classwork";
      if (!grouped[subjectName]) {
        grouped[subjectName] = { teacher: teacherName, categories: {} };
      }
      if (!grouped[subjectName].categories[category]) {
        grouped[subjectName].categories[category] = [];
      }
      grouped[subjectName].categories[category].push(grade);
    });

    const groupedSectionsHtml = Object.entries(grouped)
      .map(([subjectName, subjectData]) => {
        const { teacher, categories } = subjectData;

        const categorySections = Object.entries(categories)
          .map(([category, subjectGrades]) => {
            const catTotal = subjectGrades.reduce((s, g) => s + g.marks, 0);
            const catMax = subjectGrades.reduce((s, g) => s + g.maxMarks, 0);
            const categoryAverage = catMax > 0 ? ((catTotal / catMax) * 10).toFixed(1) : 0;

            const gradeRows = subjectGrades
              .map((grade) => {
                const gradeDate = new Date(grade.date).toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                });

                const notesText = getGradeObservation(grade);
                const notesLine = notesText
                  ? `<div class="row-notes">${escapeHtml(notesText)}</div>`
                  : "";

                return renderTemplate("gradebookGradeRow", {
                  gradeDate,
                  scoreClass: "",
                  marks: grade.marks, maxMarks: grade.maxMarks,
                  notesLine,
                });
              })
              .join("");

            return renderTemplate("gradebookCategorySection", {
              categoryName: category.charAt(0).toUpperCase() + category.slice(1),
              gradeRows,
              categoryAverage,
            });
          })
          .join("");

        return renderTemplate("gradebookSubjectSection", {
          subjectName, teacher, categorySections,
        });
      })
      .join("");

    return renderTemplate("gradebookSummary", {
      title,
      todayStr,
      groupedSectionsHtml,
      teacherFirstName: teacherInfo.firstName,
      teacherEmail: teacherInfo.email,
      schoolName,
    });
  }

  /**
   * Notify principals (admins + department principals) of a new attendance request.
   * @param {Object} request - AttendanceRequest document (with populated requestType)
   * @param {Array} principalUsers - Array of User documents to notify
   * @param {string} createdBy - User id (for Gmail OAuth sender, optional)
   */
  async sendAttendanceRequestNewToPrincipals(request, principalUsers, createdBy = null) {
    const typeLabel = request.requestType?.labelEn || request.requestType?.labelAr || "Attendance Request";
    const subject = `New attendance request from ${request.requesterName} - ${typeLabel}`;
    const message = `A new attendance request has been submitted.\n\nRequester: ${request.requesterName}\nEmail: ${request.requesterEmail}\nType: ${typeLabel}\nNotes: ${request.notes || "(none)"}`;
    const notesSection = request.notes
      ? `<div class="section"><h3 class="section-title">Notes</h3><div class="row-list"><div class="row-item"><div class="row-left muted">${escapeHtml(request.notes)}</div></div></div></div>`
      : "";
    const htmlContent = renderTemplate("attendanceRequestNew", {
      requesterName: escapeHtml(request.requesterName),
      requesterEmail: escapeHtml(request.requesterEmail),
      typeLabel: escapeHtml(typeLabel),
      notesSection,
      schoolName: escapeHtml(await this._resolveSchoolName(request?.school)),
    });
    for (const principal of principalUsers) {
      const notification = new Notification({
        school: request.school,
        recipient: principal._id,
        recipientEmail: principal.email,
        student: request.student || null,
        type: "attendance_request",
        subject,
        message,
        htmlContent,
        channels: ["email"],
        metadata: { attendanceRequest: request._id },
        createdBy: createdBy || request.requester,
      });
      await notification.save();
      await this.sendEmail(notification, principal._id.toString());
    }
  }

  /**
   * Notify requester that their attendance request was approved or rejected.
   * @param {Object} request - AttendanceRequest document (with populated requestType, reviewedBy)
   * @param {string} createdBy - User id of the reviewer (for Gmail OAuth sender)
   */
  async sendAttendanceRequestStatusToRequester(request, createdBy) {
    const typeLabel = request.requestType?.labelEn || request.requestType?.labelAr || "Attendance Request";
    const statusLabel = request.status === "approved" ? "Approved" : "Rejected";
    const subject = `Attendance request ${statusLabel} - ${typeLabel}`;
    const message = `Your attendance request (${typeLabel}) has been ${statusLabel.toLowerCase()}.\n\n${request.reviewNote ? `Review note: ${request.reviewNote}` : ""}`;
    const reviewNoteSection = request.reviewNote
      ? `<div class="section"><h3 class="section-title">Review Note</h3><div class="row-list"><div class="row-item"><div class="row-left muted">${escapeHtml(request.reviewNote)}</div></div></div></div>`
      : "";
    const htmlContent = renderTemplate("attendanceRequestStatus", {
      statusLabel: escapeHtml(statusLabel),
      typeLabel: escapeHtml(typeLabel),
      reviewNoteSection,
      schoolName: escapeHtml(await this._resolveSchoolName(request?.school)),
    });
    const notification = new Notification({
      school: request.school,
      recipient: request.requester,
      recipientEmail: request.requesterEmail,
      student: request.student || null,
      type: "attendance_request_status",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      metadata: { attendanceRequest: request._id, status: request.status },
      createdBy,
    });
    await notification.save();
    await this._dispatchParentUpdatePush({
      notification,
      student: request.student ? { _id: request.student } : null,
      recipientEmails: [request.requesterEmail],
      preferredUserIds: [request.requester],
    });
    await this.sendEmail(notification, createdBy);
    return notification;
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(filters = {}, page = 1, limit = 20) {
    const query = {};
    if (filters.student) query.student = filters.student;
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.createdBy) query.createdBy = filters.createdBy;
    if (filters.recipient) query.recipient = filters.recipient;
    if (filters.recipientEmailRegex) query.recipientEmail = filters.recipientEmailRegex;
    if (Array.isArray(filters.or) && filters.or.length > 0) {
      query.$or = filters.or;
    }

    const notifications = await Notification.find(query)
      .populate("student", "firstName lastName studentId")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Notification.countDocuments(query);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

export default new NotificationService();
