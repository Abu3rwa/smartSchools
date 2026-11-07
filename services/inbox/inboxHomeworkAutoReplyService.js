/**
 * "What's due / what's the homework?" auto-reply: lower risk than the
 * attendance idea because the data is class-level, not one student's private
 * record. Still gated behind the teacher's own enabled + confirmedRisk opt-in,
 * and every email is claimed atomically before any work so a tick overlap or
 * failure can never produce a second reply.
 */
import Assignment from "../../models/Assignment.js";
import InboxEmail from "../../models/InboxEmail.js";
import InboxReplyDraft from "../../models/InboxReplyDraft.js";
import Notification from "../../models/Notification.js";
import Student from "../../models/Student.js";
import gmailOAuthService from "../gmailOAuthService.js";
import { sendPushToUsers } from "../pushNotificationService.js";
import { NOTIFICATION_TYPES } from "../../constants/notificationTypes.js";
import { buildPortalLink } from "../../helpers/portalUrl.js";
import { getTeacherProfile } from "../../helpers/teacherScoping.js";
import {
  getDatePartsInTimeZone,
  resolveTimeZone,
  ymdKey,
  zonedDateTimeToUtc,
} from "../../utils/schoolTimezone.js";
import logger from "../../utils/logger.js";
import { buildSendMailOptions } from "./inboxSendService.js";
import { saveToGmailDraft } from "./inboxDraftService.js";
import {
  effectiveHomeworkDeliveryMode,
  normalizeHomeworkAutoReply,
} from "./inboxHomeworkSettings.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// Only consider recent, still-open emails — an old thread re-surfacing isn't "ask and auto-reply".
const RECENT_EMAIL_WINDOW_MS = 48 * 60 * 60 * 1000;
// Conservative: only match clear questions about what's due, not bare mentions of "assignment" or "homework".
// Matches: "what's the homework", "what homework is due", "what's due?", "any assignments due", "due this week/today"
const HOMEWORK_KEYWORDS =
  /\b(what('?s|\s+is|\s+are)\s+(the\s+)?(homework|assignment|classwork)|what('?s|\s+is)\s+due|(any|is\s+there)\s+(homework|assignments|classwork)|(homework|assignments|classwork)\s+(is\s+)?due|due\s+(this\s+week|today|tomorrow|date))\b/i;
// Arabic: only clear questions like "ما هو الواجب" (what is the homework), "ما الواجبات" (what are the assignments)
// Avoid bare terms that match statements like "I submitted the homework"
const HOMEWORK_KEYWORDS_AR =
  /(ما\s+هو\s+الواجب|ما\s+الواجبات|ما\s+هي\s+الواجبات)/;

export const senderFirstNameOf = (email) => {
  const named = String(email?.fromName || "")
    .trim()
    .split(/\s+/)[0];
  if (named) return named;
  const local = String(email?.fromEmail || "")
    .split("@")[0]
    .split(/[._-]+/)[0];
  if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  return "there";
};

/** A rough, conservative signal — real intent classification can replace this later. */
const looksLikeHomeworkInquiry = (email) => {
  const text = `${email.subject || ""} ${email.bodyText || ""}`;
  return HOMEWORK_KEYWORDS.test(text) || HOMEWORK_KEYWORDS_AR.test(text);
};

/** Exported for testing: check if text matches homework inquiry patterns. */
export const isHomeworkInquiryText = (text) => {
  return HOMEWORK_KEYWORDS.test(text) || HOMEWORK_KEYWORDS_AR.test(text);
};

/** The sender's linked student(s) — only proceeds when they all share one class. */
const resolveRecipientContext = async (user, email) => {
  const fromEmail = String(email.fromEmail || "").toLowerCase();
  if (!fromEmail) return null;

  const query =
    email.senderRole === "student"
      ? { school: user.school, email: fromEmail }
      : {
          school: user.school,
          $or: [
            { "parentInfo.fatherEmail": fromEmail },
            { "parentInfo.motherEmail": fromEmail },
            { "parentInfo.guardianEmail": fromEmail },
          ],
        };

  const students = await Student.find(query).select("_id currentClass").lean();
  if (!students.length) return null;

  const classIds = [
    ...new Set(students.map((student) => String(student.currentClass || ""))),
  ].filter(Boolean);
  if (classIds.length !== 1) return null; // no class on file, or linked children in different classes

  return {
    classId: students[0].currentClass,
    studentIds: students.map((student) => student._id),
  };
};

const formatDueDate = (due, timeZone) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(due);

const resolveAssignments = async ({
  school,
  classId,
  studentIds,
  teacherProfile,
  cfg,
  now,
  timeZone,
}) => {
  const todayParts = getDatePartsInTimeZone(now, timeZone);
  const startOfToday = zonedDateTimeToUtc(
    { ...todayParts, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
  const windowEnd = new Date(now.getTime() + cfg.daysAhead * DAY_MS);

  const query = {
    school,
    class: classId,
    status: "published",
    dueDate: { $gte: startOfToday, $lte: windowEnd },
    $or: [
      { scope: "class" },
      { scope: "selected_students", studentIds: { $in: studentIds } },
    ],
  };
  if (cfg.scope === "own_subject" && teacherProfile)
    query.teacher = teacherProfile._id;

  return Assignment.find(query)
    .populate("subject", "name")
    .sort({ dueDate: 1 })
    .lean();
};

const composeHomeworkReplyBody = ({
  senderFirstName,
  teacherFirstName,
  className,
  lines,
  language,
}) => {
  if (language === "ar") {
    return [
      `مرحبًا ${senderFirstName}،`,
      `إليك الواجبات المطلوبة حاليًا ومواعيد تسليمها لصف ${className}:`,
      lines,
      `سأخبرك إذا طرأ أي تغيير.`,
      `تحياتي،\n${teacherFirstName}`,
    ].join("\n\n");
  }
  return [
    `Hello ${senderFirstName},`,
    `Here is what's currently assigned and due soon for ${className}:`,
    lines,
    `I'll let you know if anything changes.`,
    `Best,\n${teacherFirstName}`,
  ].join("\n\n");
};

const replySubject = (original) => {
  const subject = String(original || "").trim();
  if (!subject) return "What's due";
  return /^(re|رد)\s*:/i.test(subject) ? subject : `Re: ${subject}`;
};

const NOTICE_COPY = {
  sent: {
    en: (ctx) => ({
      subject: "Homework auto-reply sent",
      message: `Your assistant replied to ${ctx.sender} ("${ctx.subject}") with the current assignment list.\n\n${ctx.preview}`,
    }),
    ar: (ctx) => ({
      subject: "أُرسل ردّ الواجبات تلقائيًا",
      message: `ردّ مساعدك على ${ctx.sender} («${ctx.subject}») بقائمة الواجبات الحالية.\n\n${ctx.preview}`,
    }),
  },
  drafted: {
    en: (ctx) => ({
      subject: "Homework auto-reply saved to Gmail Drafts",
      message: `A reply to ${ctx.sender} ("${ctx.subject}") with the current assignment list is waiting in your Gmail Drafts. Review it and send it yourself.`,
    }),
    ar: (ctx) => ({
      subject: "حُفظ ردّ الواجبات في مسودات Gmail",
      message: `ردّ على ${ctx.sender} («${ctx.subject}») بقائمة الواجبات الحالية بانتظارك في مسودات Gmail. راجعه وأرسله بنفسك.`,
    }),
  },
  failed: {
    en: (ctx) => ({
      subject: "Automatic homework reply failed",
      message: `The assistant could not reply to ${ctx.sender} ("${ctx.subject}") automatically. It will not try again — reply yourself.`,
    }),
    ar: (ctx) => ({
      subject: "فشل الردّ التلقائي على سؤال الواجبات",
      message: `لم يتمكن المساعد من الردّ على ${ctx.sender} («${ctx.subject}») تلقائيًا. لن يعيد المحاولة — ردّ بنفسك.`,
    }),
  },
  reauth: {
    en: () => ({
      subject: "Reconnect Google for homework replies",
      message:
        "Your Google access expired, so the assistant could not handle a homework question. Connect Google again in Inbox Assistant, then reply yourself.",
    }),
    ar: () => ({
      subject: "أعد ربط Google لردود الواجبات",
      message:
        "انتهت صلاحية وصولك إلى Google، لذلك لم يتمكن المساعد من الردّ على سؤال الواجبات. أعد ربط Google في مساعد البريد الوارد، ثم ردّ بنفسك.",
    }),
  },
};

const notifyTeacher = async ({
  user,
  kind,
  ctx,
  language,
  emailId,
  pushSender,
}) => {
  if (!user.email) return;
  const copy = (NOTICE_COPY[kind][language] || NOTICE_COPY[kind].en)(ctx);
  const link = buildPortalLink("/inbox");
  try {
    await Notification.create({
      school: user.school,
      recipient: user._id,
      recipientEmail: user.email,
      type: NOTIFICATION_TYPES.INBOX_HOMEWORK_AUTOREPLY_SENT,
      subject: copy.subject,
      message: copy.message,
      channels: ["push"],
      priority: "normal",
      metadata: { emailId: String(emailId), link },
    });
    await pushSender({
      schoolId: user.school,
      userIds: [user._id],
      title: copy.subject,
      body: copy.message,
      data: { type: "inbox_homework_autoreply", link },
      collapseKey: "inbox_homework_autoreply",
    });
  } catch (error) {
    logger.warn("inbox_homework_autoreply_notice_failed", {
      user: String(user._id),
      email: String(emailId),
      error: error?.message,
    });
  }
};

export const runHomeworkAutoReplyForUser = async (
  user,
  settings,
  { now = new Date(), pushSender = sendPushToUsers } = {},
) => {
  const result = { sent: 0, drafted: 0, skipped: 0, failed: 0 };
  const cfg = normalizeHomeworkAutoReply(settings?.homeworkAutoReply);
  if (!cfg.enabled || !cfg.confirmedRisk) return result;

  const candidates = await InboxEmail.find({
    school: user.school,
    user: user._id,
    status: "open",
    priority: { $ne: "ignore" },
    homeworkAutoReplySentAt: null,
    receivedAt: { $gte: new Date(now.getTime() - RECENT_EMAIL_WINDOW_MS) },
  })
    .sort({ receivedAt: 1 })
    .lean();

  const eligible = candidates.filter(looksLikeHomeworkInquiry);
  if (!eligible.length) return result;

  const teacherProfile = await getTeacherProfile(user._id);
  // Fail closed: under own_subject, a missing profile would remove the teacher
  // filter and return every published assignment for the class. Skip entirely.
  if (cfg.scope === "own_subject" && !teacherProfile) {
    logger.warn("homework_auto_reply_skipped_missing_teacher_profile", {
      userId: String(user._id),
      schoolId: String(user.school),
    });
    result.skipped += eligible.length;
    return result;
  }
  const teacherFirstName =
    user.firstName ||
    String(user.fullName || "")
      .trim()
      .split(/\s+/)[0] ||
    "Teacher";
  const deliveryMode = effectiveHomeworkDeliveryMode(cfg.deliveryMode);
  const timeZone = resolveTimeZone(process.env.DEFAULT_SCHOOL_TIMEZONE);

  // Sequential: avoids racing Gmail if two eligible emails are in the same thread.
  for (const email of eligible) {
    const claimed = await InboxEmail.findOneAndUpdate(
      {
        _id: email._id,
        school: user.school,
        user: user._id,
        homeworkAutoReplySentAt: null,
      },
      { $set: { homeworkAutoReplySentAt: now } },
      { new: true },
    ).lean();
    if (!claimed) continue;

    const language = email.language === "ar" ? "ar" : "en";
    const ctx = {
      sender: email.fromName || email.fromEmail,
      subject: email.subject || "",
    };
    const notice = (kind, extra = {}) =>
      notifyTeacher({
        user,
        kind,
        ctx: { ...ctx, ...extra },
        language,
        emailId: email._id,
        pushSender,
      });

    try {
      const existing = await InboxReplyDraft.findOne({
        school: user.school,
        user: user._id,
        email: email._id,
        status: "draft",
      })
        .select("_id")
        .lean();
      if (existing) {
        result.skipped += 1;
        continue;
      }

      const recipientContext = await resolveRecipientContext(user, email);
      if (!recipientContext) {
        result.skipped += 1;
        continue;
      }

      const assignments = await resolveAssignments({
        school: user.school,
        classId: recipientContext.classId,
        studentIds: recipientContext.studentIds,
        teacherProfile,
        cfg,
        now,
        timeZone,
      });
      // Nothing to report is not the same as "confirmed nothing is due" — fall back to manual.
      if (!assignments.length) {
        result.skipped += 1;
        continue;
      }

      const todayKey = ymdKey(getDatePartsInTimeZone(now, timeZone));
      const lines = assignments
        .map((assignment) => {
          const due = new Date(assignment.dueDate);
          const dueKey = ymdKey(getDatePartsInTimeZone(due, timeZone));
          const dueLabel =
            dueKey === todayKey ? "today" : formatDueDate(due, timeZone);
          const subjectName = assignment.subject?.name || "Subject";
          return `- ${subjectName}: ${assignment.title} — due ${dueLabel}`;
        })
        .join("\n");

      const classDoc = await Assignment.db
        .model("Class")
        .findById(recipientContext.classId)
        .select("name")
        .lean();
      const body = composeHomeworkReplyBody({
        senderFirstName: senderFirstNameOf(email),
        teacherFirstName,
        className: classDoc?.name || "the class",
        lines,
        language,
      });
      const subject = replySubject(email.subject);
      const recipients = { to: [email.fromEmail], cc: [] };
      const draftFields = {
        school: user.school,
        user: user._id,
        email: email._id,
        replyType: "homework_auto",
        tone: "professional",
        language,
        subject,
        body,
        to: recipients.to,
        cc: [],
        source: "auto",
      };

      if (deliveryMode === "draft_only") {
        const row = await InboxReplyDraft.create({
          ...draftFields,
          status: "draft",
        });
        await saveToGmailDraft(user, row._id);
        await notice("drafted");
        result.drafted += 1;
        continue;
      }

      const mailOptions = buildSendMailOptions(
        { subject, body, language },
        email,
        recipients,
      );
      const sent = await gmailOAuthService.sendEmail(user._id, mailOptions);
      await InboxReplyDraft.create({
        ...draftFields,
        status: "sent",
        sentAt: now,
        sentMessageId: sent?.messageId || null,
        threadId: sent?.threadId || email.threadId || null,
      });
      await InboxEmail.updateOne(
        { _id: email._id, school: user.school, user: user._id },
        { $set: { status: "replied", repliedDetectedAt: now } },
      );
      await notice("sent", {
        preview: body.replace(/\s+/g, " ").trim().slice(0, 200),
      });
      result.sent += 1;
    } catch (error) {
      logger.error("inbox_homework_autoreply_failed", {
        user: String(user._id),
        email: String(email._id),
        code: error?.code,
        error: error?.message,
      });
      await notice(
        error?.code === "GMAIL_REAUTH_REQUIRED" ? "reauth" : "failed",
      );
      result.failed += 1;
    }
  }

  return result;
};

export default {
  runHomeworkAutoReplyForUser,
  composeHomeworkReplyBody,
  senderFirstNameOf,
};
