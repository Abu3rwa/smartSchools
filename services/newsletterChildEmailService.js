/**
 * Per-child newsletter email.
 *
 * Rendering is the only place a student's name is joined to a letter: content is
 * stored with {{student}} slots, and fillStudentToken swaps in the first name here.
 * Anatomy matches the approved preview: teal header, greeting, intro, personal
 * block (stat tiles + teacher note + test box), coloured coverage table,
 * "coming up next week" bullets, inline help-at-home, school footer.
 */

import NewsletterIssue from "../models/NewsletterIssue.js";
import NewsletterChildLetter from "../models/NewsletterChildLetter.js";
import Notification from "../models/Notification.js";
import notificationService from "./notificationService.js";
import ClassModel from "../models/Class.js";
import School from "../models/School.js";
import LessonPlan from "../models/LessonPlan.js";
import Subject from "../models/Subject.js";
import { collectStudentFamilyEmails } from "../utils/newsletterRecipients.js";
import { fillStudentToken } from "./newsletterPrivacy.js";

const TEAL = "#0f766e";
const TEAL_SOFT = "#ccfbf1";
const TEAL_LIGHT = "#f0fdfa";
const TEAL_BORDER = "#cdeae6";
const TEAL_DARK = "#134e4a";
const INK = "#334155";
const MUTED = "#64748b";

const SUBJECT_COLORS = ["#0f766e", "#1d4ed8", "#b45309", "#7e22ce", "#be185d", "#0369a1", "#4d7c0f", "#9333ea"];

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatClassLabel(cls) {
    if (!cls) return "Class";
    const grade = cls.grade ? `Grade ${cls.grade}` : "";
    const section = cls.section || "";
    return [cls.name, grade, section].filter(Boolean).join(" ");
}

export function formatPeriodLabel(periodStart, periodEnd) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const startText = start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    const endText = end.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return `${startText} – ${endText}`;
}

function formatTestDate(value) {
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return String(value || "");
    return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function paragraphsFor(letter, firstName) {
    const filled = fillStudentToken(letter.content || "", firstName);
    return filled
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => block.replace(/\n/g, " "));
}

/** At most three honest numbers from the facts the AI was given. Never scores. */
function statTiles(facts = {}) {
    const tiles = [];
    const classwork = Number(facts.classwork?.recorded) || 0;
    const lists = Number(facts.spelling?.listsCompleted) || 0;
    const mistakes = Number(facts.spelling?.mistakes) || 0;
    const reading = Number(facts.reading?.completed) || 0;
    const drafts = Number(facts.writing?.draftsSubmitted) || 0;

    if (classwork) tiles.push({ value: String(classwork), label: "classwork & homework records" });
    if (lists) tiles.push({ value: String(lists), label: "spelling lists practised" });
    if (lists) tiles.push({ value: String(mistakes), label: mistakes === 1 ? "spelling mistake to review" : "spelling mistakes to review" });
    if (!tiles.length && drafts) tiles.push({ value: String(drafts), label: "writing drafts submitted" });
    if (tiles.length < 3 && reading) tiles.push({ value: String(reading), label: "reading tasks completed" });
    return tiles.slice(0, 3);
}

function personalBlockHtml(tiles, firstName, facts, teacherNote = "") {
    const parts = [];

    if (tiles.length) {
        const width = Math.floor(100 / tiles.length);
        const cells = tiles
            .map(
                (tile) => `
          <td width="${width}%" align="center" style="background-color:#ffffff;border:1px solid ${TEAL_BORDER};border-radius:10px;padding:10px 6px;">
            <p style="margin:0;font-size:18px;line-height:1.2;font-weight:800;color:${TEAL};">${escapeHtml(tile.value)}</p>
            <p style="margin:2px 0 0;font-size:11px;line-height:1.4;color:${MUTED};">${escapeHtml(tile.label)}</p>
          </td>`
            )
            .join("");
        parts.push(`
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:${TEAL};letter-spacing:.9px;text-transform:uppercase;">${escapeHtml(firstName)} this week</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:6px 0;">
          <tr>${cells}</tr>
        </table>`);
    }

    const remark = teacherNote || facts.classwork?.remarks?.[0]?.text;
    if (remark) {
        parts.push(`
        <p style="margin:12px 0 6px;font-size:11px;font-weight:700;color:${TEAL};letter-spacing:.7px;text-transform:uppercase;">Teacher's note</p>
        <p style="margin:0;font-size:13px;line-height:1.65;color:${TEAL_DARK};">${escapeHtml(remark)}</p>`);
    }

    const next = (facts.upcoming || [])[0];
    if (next) {
        parts.push(`
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
          <tr><td style="padding:10px 12px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#78350f;"><span style="font-weight:800;">Formal spelling test:</span> ${escapeHtml(formatTestDate(next.date))}.</p>
          </td></tr>
        </table>`);
    }

    if (!parts.length) return "";
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${TEAL_LIGHT};border:1px solid ${TEAL_BORDER};border-radius:12px;">
        <tr><td style="padding:14px 16px;">${parts.join("")}
        </td></tr>
      </table>`;
}

function coverageHtml(classTopics = []) {
    const rows = classTopics
        .filter((row) => row?.subject && Array.isArray(row.topics) && row.topics.length)
        .map(
            (row, index) => `
        <tr>
          <td width="96" valign="top" style="padding:0 0 10px;font-size:13px;line-height:1.65;font-weight:700;color:${SUBJECT_COLORS[index % SUBJECT_COLORS.length]};">${escapeHtml(row.subject)}</td>
          <td valign="top" style="padding:0 0 10px;font-size:13px;line-height:1.65;color:${INK};">${escapeHtml(row.topics.slice(0, 4).join(" · "))}</td>
        </tr>`
        )
        .join("");

    if (!rows) return "";
    return `
      <p style="margin:22px 0 10px;font-size:11px;font-weight:700;color:${TEAL};letter-spacing:.9px;text-transform:uppercase;">What the class covered</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

function nextWeekHtml(topics = []) {
    const items = topics
        .filter((row) => row?.subject && Array.isArray(row.topics) && row.topics.length)
        .slice(0, 5);
    if (!items.length) return "";

    const bullets = items
        .map((row, index) => {
            const color = SUBJECT_COLORS[index % SUBJECT_COLORS.length];
            const label = row.topics.slice(0, 2).join(", ");
            return `
          <tr>
            <td width="14" valign="top" style="color:${color};font-weight:800;padding:0 0 6px;font-size:13px;">&#8226;</td>
            <td style="padding:0 0 6px;font-size:13px;line-height:1.6;color:${INK};"><span style="font-weight:700;">${escapeHtml(row.subject)}:</span> ${escapeHtml(label)}</td>
          </tr>`;
        })
        .join("");

    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin:18px 0 0;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:${TEAL};letter-spacing:.9px;text-transform:uppercase;">Coming up next week</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${bullets}
          </table>
        </td></tr>
      </table>`;
}

function helpInlineHtml(paragraph) {
    if (!paragraph) return "";
    return `
      <p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:${MUTED};"><span style="font-weight:700;color:${TEAL};">How to help at home:</span> ${escapeHtml(paragraph)}</p>`;
}

/**
 * Fetches next-week lesson plan titles grouped by subject for the "coming up"
 * section. Returns [] when no plans exist yet.
 */
export async function collectNextWeekTopics({ classId, periodEnd }) {
    const start = new Date(periodEnd);
    start.setDate(start.getDate() + 1);
    const end = new Date(periodEnd);
    end.setDate(end.getDate() + 8);

    const plans = await LessonPlan.find({ class: classId, date: { $gte: start, $lte: end } })
        .select("subject title")
        .sort({ date: 1 })
        .limit(30)
        .lean();

    if (!plans.length) return [];

    const subjectIds = Array.from(new Set(plans.map((p) => String(p.subject)).filter(Boolean)));
    const subjects = await Subject.find({ _id: { $in: subjectIds } }).select("name").lean();
    const nameById = new Map(subjects.map((s) => [String(s._id), s.name]));

    const bySubject = new Map();
    for (const plan of plans) {
        const key = String(plan.subject || "");
        if (!bySubject.has(key)) bySubject.set(key, []);
        const list = bySubject.get(key);
        if (list.length < 3 && plan.title) list.push(plan.title);
    }

    return Array.from(bySubject.entries())
        .filter(([, topics]) => topics.length)
        .map(([subjectId, topics]) => ({
            subject: nameById.get(subjectId) || "Subject",
            topics,
        }));
}

/**
 * One letter, fully rendered for one student. Table layout and inline styles so it
 * survives Gmail, Outlook and Apple Mail.
 */
export function renderChildLetterEmail({
    letter,
    student,
    cls,
    schoolName = "School",
    branding = {},
    nextWeekTopics = [],
}) {
    const firstName = String(student?.firstName || "").trim() || "your child";
    const periodLabel = formatPeriodLabel(letter.periodStart, letter.periodEnd);
    const classLabel = formatClassLabel(cls);
    const primaryColor = (branding?.primaryColor || TEAL).toString().trim();
    const logoUrl = (branding?.logoUrl || "").toString().trim();
    const facts = letter.facts || {};

    const paragraphs = paragraphsFor(letter, firstName);
    const intro = paragraphs[0] || "Your child had a good week in class.";
    const help = paragraphs[1] || "";
    const extra = paragraphs.slice(2);

    const introHtml = [intro, ...extra]
        .map((paragraph) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.75;color:${INK};">${escapeHtml(paragraph)}</p>`)
        .join("");

    const tiles = statTiles(facts);
    const teacherNoteFilled = letter?.teacherNote
        ? fillStudentToken(String(letter.teacherNote), firstName)
        : "";

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:8px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${TEAL_BORDER};border-radius:14px;overflow:hidden;font-family:Montserrat,Tajawal,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
      <tr>
        <td style="background-color:${escapeHtml(primaryColor)};padding:24px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${TEAL_SOFT};">${escapeHtml(schoolName)} · ${escapeHtml(classLabel)}</p>
          <h1 style="margin:0;font-size:23px;line-height:1.3;font-weight:800;color:#ffffff;">${escapeHtml(firstName)}'s week</h1>
          <p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:${TEAL_SOFT};">${escapeHtml(periodLabel)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 24px 6px;">
          <p style="margin:0 0 14px;font-size:14px;line-height:1.75;color:${INK};">Dear ${escapeHtml(firstName)}'s family,</p>
          ${introHtml}
          ${personalBlockHtml(tiles, firstName, facts, teacherNoteFilled)}
          ${coverageHtml(letter.classTopics)}
          ${nextWeekHtml(nextWeekTopics)}
          ${helpInlineHtml(help)}
          <p style="margin:10px 0 0;font-size:13px;line-height:1.7;color:${MUTED};">Thank you for your support. If anything about a subject is unclear, contact the subject teacher through the school.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 20px;border-top:1px solid #e2e8f0;text-align:center;">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(schoolName)}" style="height:28px;margin-bottom:6px;display:inline-block;" />` : ""}
          <p style="margin:0 0 2px;font-size:12px;font-weight:700;line-height:1.5;color:${TEAL};">${escapeHtml(schoolName)}</p>
          <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;">Weekly newsletter · ${escapeHtml(classLabel)} · for ${escapeHtml(firstName)}'s family</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`.trim();

    const text = [
        `${schoolName} — ${firstName}'s week`,
        `${classLabel} · ${periodLabel}`,
        "",
        `Dear ${firstName}'s family,`,
        "",
        intro,
        "",
        ...tiles.map((tile) => `${tile.value} ${tile.label}`),
        "",
        teacherNoteFilled || facts.classwork?.remarks?.[0]?.text
            ? `Teacher's note: ${teacherNoteFilled || facts.classwork.remarks[0].text}`
            : "",
        facts.upcoming?.[0] ? `Formal spelling test: ${formatTestDate(facts.upcoming[0].date)}.` : "",
        "",
        ...nextWeekTopics.slice(0, 5).map((row) => `Next week — ${row.subject}: ${row.topics.slice(0, 2).join(", ")}`),
        "",
        help ? `How to help at home: ${help}` : "",
        "",
        `Weekly newsletter · ${classLabel}`,
    ]
        .filter((line) => line !== "")
        .join("\n");

    return {
        subject: `${firstName}'s week — ${periodLabel}`,
        html,
        text,
        periodLabel,
        classLabel,
    };
}

export async function prepareChildLetterEmail({ letterId }) {
    const letter = await NewsletterChildLetter.findById(letterId)
        .populate("student", "firstName lastName")
        .lean();
    if (!letter) throw Object.assign(new Error("Letter not found"), { statusCode: 404 });

    const [cls, school, nextWeekTopics] = await Promise.all([
        ClassModel.findById(letter.class).select("name grade section").lean(),
        School.findById(letter.school).select("name settings.branding").lean(),
        collectNextWeekTopics({ classId: letter.class, periodEnd: letter.periodEnd }),
    ]);

    const rendered = renderChildLetterEmail({
        letter,
        student: letter.student,
        cls,
        schoolName: school?.name || "School",
        branding: school?.settings?.branding || {},
        nextWeekTopics,
    });

    return { letter, rendered };
}

/**
 * Sends each ready letter to that child's own family only. One Notification per
 * family, so the existing delivery log and retry behaviour apply unchanged.
 */
export async function sendChildLettersForIssue({ issueId, adminUserId }) {
    const issue = await NewsletterIssue.findById(issueId).lean();
    if (!issue) throw Object.assign(new Error("Issue not found"), { statusCode: 404 });

    const letters = await NewsletterChildLetter.find({ issue: issue._id, status: "approved", sentAt: null })
        .populate("student", "firstName lastName parentInfo studentEmail email")
        .lean();

    if (!letters.length) {
        throw Object.assign(new Error("No approved letters to send."), { statusCode: 400 });
    }

    const [cls, school, nextWeekTopics] = await Promise.all([
        ClassModel.findById(issue.class).select("name grade section").lean(),
        School.findById(issue.school).select("name settings.branding").lean(),
        collectNextWeekTopics({ classId: issue.class, periodEnd: letters[0].periodEnd }),
    ]);
    if (!cls) throw Object.assign(new Error("Class not found for issue"), { statusCode: 404 });

    const schoolName = school?.name || "School";
    const branding = school?.settings?.branding || {};

    let sentCount = 0;
    let skippedCount = 0;
    let failureCount = 0;

    for (const letter of letters) {
        const student = letter.student;
        const recipients = collectStudentFamilyEmails(student);
        if (!student || recipients.length === 0) {
            skippedCount += 1;
            await NewsletterChildLetter.updateOne(
                { _id: letter._id },
                { $set: { lastSendError: "No recipient emails found" } }
            );
            continue;
        }

        const rendered = renderChildLetterEmail({ letter, student, cls, schoolName, branding, nextWeekTopics });

        const notification = await Notification.create({
            school: letter.school,
            recipientEmail: recipients.join(","),
            type: "announcement",
            subject: rendered.subject,
            message: rendered.text,
            htmlContent: rendered.html,
            channels: ["email"],
            status: "pending",
            metadata: {
                newsletterIssueId: issue._id,
                newsletterChildLetterId: letter._id,
                classId: cls._id,
                studentId: student._id,
                periodStart: letter.periodStart,
                periodEnd: letter.periodEnd,
            },
            createdBy: adminUserId,
        });

        try {
            await notificationService.sendEmail(notification, adminUserId?.toString?.() || null);
            sentCount += 1;
            await NewsletterChildLetter.updateOne(
                { _id: letter._id },
                { $set: { sentAt: new Date(), lastSendError: "" } }
            );
        } catch (error) {
            failureCount += 1;
            await NewsletterChildLetter.updateOne(
                { _id: letter._id },
                { $set: { lastSendError: String(error?.message || "Send failed").slice(0, 300) } }
            );
        }
    }

    const stats = {
        lettersCount: letters.length,
        sentCount,
        skippedCount,
        failureCount,
    };

    await NewsletterIssue.updateOne(
        { _id: issue._id },
        {
            $set: {
                childLetterStats: stats,
                childLettersSentAt: failureCount === 0 ? new Date() : issue.childLettersSentAt || null,
                lastSendError: failureCount > 0 ? "Some child letters failed to send" : "",
            },
        }
    );

    return { issueId: issue._id, stats };
}