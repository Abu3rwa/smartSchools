import mongoose from "mongoose";
import Student from "../models/Student.js";
import School from "../models/School.js";
import WritingAssessment from "../models/WritingAssessment.js";
import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import logger from "../utils/logger.js";
import { renderTemplate } from "../emailTemplates/templateLoader.js";
import { sendTransactionalEmail } from "./transactionalEmailService.js";
import { essayParagraphs } from "../client/src/pages/student/writing/WritingWorkspacePage/draftEssay.js";
import {
  draftHtml,
  draftText,
  comparisonHtml,
  comparisonText,
  languageHtml,
  languageTextLines,
  //
  prepareDraftRows,
  rubricHtml,
  rubricText,
} from "./writingFeedbackEmailBlocks.js";
import { fillStudentTokensDeep, toPlain } from "./aiPromptSafety.js";
import { marksModeOf } from "../client/src/utils/writingRubric.js";
import {
  buildOptOutUrl,
  optedOutEmails,
} from "./writingEmailOptOutService.js";

/**
 * The one email the writing module sends: feedback was published for a draft.
 * It carries the draft exactly as it was sent, the teacher's note under the line
 * each note is about, and the rubric as words — never points or totals.
 */

const CONTACT_TYPES = new Set(["father", "mother", "guardian"]);
const DATE_LOCALES = { en: "en-GB", ar: "ar-EG-u-nu-latn" };

// Student records can hold a compound name in firstName; greetings use one name.
const firstWord = (value) => String(value || "").trim().split(/\s+/)[0] || "";

const TYPE_LABELS = {
  en: {
    essay: "Essay",
    paragraph: "Paragraph",
    story: "Story",
    letter: "Letter",
    report: "Report",
    description: "Description",
    review: "Review",
    custom: "Writing task",
  },
  ar: {
    essay: "مقال",
    paragraph: "فقرة",
    story: "قصة",
    letter: "رسالة",
    report: "تقرير",
    description: "وصف",
    review: "مراجعة",
    custom: "مهمة كتابة",
  },
};

const COPY = {
  en: {
    studentHeadline: "Your feedback on draft {{n}} is ready",
    parentHeadline: "I have read {{firstName}}'s draft {{n}}",
    studentGreeting: "Hello {{firstName}},",
    parentGreeting: "Dear parent or guardian,",
    studentIntro:
      "I have added feedback on your draft {{n}}. Each comment below points at one exact line of your writing — read it before you start draft {{next}}.",
    parentIntro:
      "I have read {{firstName}}'s draft {{n}} and written my note under the lines I commented on. Below is the writing exactly as {{firstName}} sent it.",
    studentResendIntro:
      "Here is the feedback I published on your draft {{n}} again.",
    parentResendIntro:
      "Here is the feedback I published on {{firstName}}’s draft {{n}} again.",
    studentQuoteLabel: "What I said",
    parentQuoteLabel: "What I told {{firstName}}",
    studentListLabel: "Do these next",
    parentListLabel: "What I asked {{firstName}} to do next",
    studentDraftLabel: "Your writing, with the comments under each line",
    parentDraftLabel:
      "{{firstName}}'s draft, with my note under each marked line",
    rubricLabel: "How the draft is going",
    rubricLevel: { strong: "Strong", near: "Nearly there", needs: "Needs work" },
    draftTruncated: "The rest of your draft is in the app.",
    parentDraftTruncated: "The rest of the draft is in the app.",
    languageTitle: "Language corrections",
    languageHint: "Use these corrections when you revise this paragraph.",
    languageParentHint:
      "These are the language corrections to review with your child.",
    languageOriginal: "Original",
    languageChange: "Change to",
    languageWhy: "Why",
    languageRemove: "Remove this",
    languageNumber: "Correction {{n}}",
    languageCategory: {
      grammar: "Grammar",
      verb_tense: "Verb tense",
      punctuation: "Punctuation",
      spelling: "Spelling",
      legacy: "Language",
    },
    languageNone: "No language corrections were suggested for this paragraph.",
    languagePartial:
      "This language check is incomplete. Some parts may need another review.",
    languageUnavailable:
      "Language corrections are not available for this feedback.",
    languageSourceNotShown:
      "This correction refers to text not shown in this email.",
    languageExcerpt: "The rest of your draft is in the app.",
    languageParentExcerpt:
      "This email contains an excerpt. Ask the teacher for the remaining feedback.",
    sectionsLabel: "Feedback by part",
    workedLabel: "What worked",
    tryThisLabel: "Try this",
    improveLabel: "What to improve",
    nextStepLabel: "One next step",
    whyLabel: "Why this matters",
    comparisonLabel: "What changed from draft {{from}} to draft {{to}}",
    comparisonWordsUnit: "words",
    comparisonImproved: "Stronger now",
    comparisonUnresolved: "Still to work on",
    comparisonNewIssues: "Watch out for",
    comparisonSections: "Part by part",
    comparisonKind: { changed: "Changed", added: "New part", removed: "Removed part" },
    comparisonWinsLabel: "Spelling words you used",
    parentComparisonWinsLabel: "Spelling words from the list found in the draft",
    studentButton: "Open my writing",
    statusSteps: ["Sent", "Feedback", "Revising", "Notebook", "Done"],
    statusLabel: "Where the piece is now",
    statusNow: "Now: writing draft {{n}}",
    meta: "Draft {{n}} · {{words}} words",
    due: " · due {{date}}",
    footer: "{{schoolName}}",
    optOut: "Stop these emails",
  },
  ar: {
    studentHeadline: "ملاحظاتك على المسودة {{n}} جاهزة",
    parentHeadline: "ملاحظاتي على مسودة {{firstName}} {{n}}",
    studentGreeting: "مرحبا {{firstName}}،",
    parentGreeting: "ولي أمر عزيز،",
    studentIntro:
      "أضفتُ ملاحظات على مسودتك {{n}}. كل ملاحظة في الأسفل تشير إلى سطر واحد بالضبط من كتابتك — راجعها قبل أن تكتب المسودة {{next}}.",
    parentIntro:
      "قرأتُ مسودة {{firstName}} {{n}} وكتبتُ ملاحظتي تحت كل سطر علّقتُ عليه. النص في الأسفل هو ما أرسله {{firstName}} بالضبط.",
    studentResendIntro:
      "إليك مرة أخرى ملاحظاتي المنشورة على مسودتك {{n}}.",
    parentResendIntro:
      "إليكم مرة أخرى ملاحظاتي المنشورة على مسودة {{firstName}} {{n}}.",
    studentQuoteLabel: "ما قلته",
    parentQuoteLabel: "ما قلتُه لـ{{firstName}}",
    studentListLabel: "افعل هذا بعد ذلك",
    parentListLabel: "ما طلبتُه من {{firstName}} بعد ذلك",
    studentDraftLabel: "كتابتك، مع الملاحظات تحت كل سطر",
    parentDraftLabel: "مسودة {{firstName}}، مع ملاحظتي تحت كل سطر مُعلَّم",
    rubricLabel: "كيف تسير المسودة",
    rubricLevel: {
      strong: "قوي",
      near: "قريب من المطلوب",
      needs: "يحتاج إلى عمل",
    },
    draftTruncated: "بقية المسودة في التطبيق.",
    parentDraftTruncated: "بقية المسودة في التطبيق.",
    languageTitle: "تصحيحات لغوية",
    languageHint: "استفد من هذه التصحيحات عند مراجعة هذه الفقرة.",
    languageParentHint: "هذه تصحيحات لغوية يمكن مراجعتها مع طفلك.",
    languageOriginal: "النص الأصلي",
    languageChange: "التعديل المقترح",
    languageWhy: "السبب",
    languageRemove: "احذف هذا",
    languageNumber: "التصحيح {{n}}",
    languageCategory: {
      grammar: "القواعد",
      verb_tense: "زمن الفعل",
      punctuation: "علامات الترقيم",
      spelling: "الإملاء",
      legacy: "اللغة",
    },
    languageNone: "لم تُقترح تصحيحات لغوية لهذه الفقرة.",
    languagePartial:
      "هذا التدقيق اللغوي غير مكتمل. قد تحتاج بعض الأجزاء إلى مراجعة أخرى.",
    languageUnavailable: "التصحيحات اللغوية غير متاحة ضمن هذه الملاحظات.",
    languageSourceNotShown: "يشير هذا التصحيح إلى نص غير معروض في هذه الرسالة.",
    languageExcerpt: "بقية المسودة في التطبيق.",
    languageParentExcerpt:
      "تحتوي هذه الرسالة على مقتطف. اطلب من المعلم بقية الملاحظات.",
    sectionsLabel: "ملاحظات على كل جزء",
    workedLabel: "ما نجح",
    tryThisLabel: "جرّب هذا",
    improveLabel: "ما يحتاج تحسينًا",
    nextStepLabel: "الخطوة التالية",
    whyLabel: "لماذا هذا مهم",
    comparisonLabel: "ما تغيّر من المسودة {{from}} إلى المسودة {{to}}",
    comparisonWordsUnit: "كلمة",
    comparisonImproved: "أصبح أقوى",
    comparisonUnresolved: "ما زال يحتاج عملًا",
    comparisonNewIssues: "انتبه إلى",
    comparisonSections: "جزءًا بجزء",
    comparisonKind: { changed: "تغيّر", added: "جزء جديد", removed: "جزء محذوف" },
    comparisonWinsLabel: "كلمات التهجئة التي استخدمتها",
    parentComparisonWinsLabel: "كلمات التهجئة من القائمة التي ظهرت في المسودة",
    studentButton: "عرض كتابتي",
    statusSteps: ["أُرسلت", "الملاحظات", "المراجعة", "الكراس", "انتهى"],
    statusLabel: "أين وصلت المسودة",
    statusNow: "الآن: كتابة المسودة {{n}}",
    meta: "المسودة {{n}} · {{words}} كلمة",
    due: " · التسليم {{date}}",
    footer: "{{schoolName}}",
    optOut: "إيقاف هذه الرسائل",
  },
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fill = (template, values = {}) =>
  String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key] ?? "")
      : "",
  );

const languageOf = (value) =>
  String(value || "").toLowerCase() === "ar" ? "ar" : "en";

// First-strong isolate: keeps an English title inside an Arabic sentence from
// flipping its question mark to the wrong end.
const iso = (value) => (value ? `\u2068${value}\u2069` : "");

const uniqueEmails = (values = []) => [
  ...new Set(
    values
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  ),
];

/** Which channels the school has switched on. Off unless the deploy says otherwise. */
export const emailChannels = (env = process.env) => {
  const mode = String(env.WRITING_EMAIL_DELIVERY || "off")
    .trim()
    .toLowerCase();
  return {
    students: mode === "students" || mode === "both",
    parents: mode === "parents" || mode === "both",
  };
};

/** A teacher may switch a channel off for one send, never on past what the school allows. */
export const publishChannels = (channels = {}, notify = {}) => ({
  students: Boolean(channels.students) && notify?.student !== false,
  parents: Boolean(channels.parents) && notify?.parents !== false,
});

const GUARDIAN_FIELDS = [
  ["fatherEmail", "father"],
  ["motherEmail", "mother"],
  ["guardianEmail", "guardian"],
];

/**
 * A lean read loses the Student model method, so the same fields are read
 * directly; both paths feed one recipient list.
 */
const contactEntries = (student) => {
  if (typeof student?.getAllContactEmailEntries === "function") {
    return student.getAllContactEmailEntries();
  }
  const entries = [];
  for (const [field, type] of GUARDIAN_FIELDS) {
    if (student?.parentInfo?.[field]) {
      entries.push({ type, email: student.parentInfo[field] });
    }
  }
  for (const email of [student?.studentEmail, student?.email, student?.user?.email]) {
    if (email) entries.push({ type: "student", email });
  }
  return entries;
};

/**
 * Student and guardian addresses for one project. A guardian address that is also
 * the student's own address is dropped so that family gets one email, not two.
 */
export const resolveRecipients = ({ student, channels = {} } = {}) => {
  const entries = contactEntries(student);

  const studentEmails = channels.students
    ? uniqueEmails([
        student?.email,
        student?.user?.email,
        ...entries
          .filter((entry) => entry.type === "student")
          .map((entry) => entry.email),
      ])
    : [];

  const parentEmails = channels.parents
    ? uniqueEmails(
        entries
          .filter((entry) => CONTACT_TYPES.has(entry.type))
          .map((entry) => entry.email),
      ).filter((email) => !studentEmails.includes(email))
    : [];

  return { studentEmails, parentEmails };
};

/** 0 sent · 1 feedback · 2 revising · 3 notebook · 4 done */
export const statusIndex = (stage = "") => {
  if (stage === "completed") return 4;
  if (stage === "ready_for_notebook" || stage === "awaiting_notebook_check")
    return 3;
  if (stage === "feedback_published" || stage === "compared") return 2;
  return 1;
};

export const formatDueDate = (value, language) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(DATE_LOCALES[languageOf(language)], {
      day: "2-digit",
      month: "short",
    }).format(date);
  } catch {
    return "";
  }
};

const statusHtml = ({ language, stage, nextDraft }) => {
  const copy = COPY[language];
  const current = statusIndex(stage);
  const bar = copy.statusSteps
    .map((_, index) => {
      const background =
        index < current ? "#0f766e" : index === current ? "#14b8a6" : "#e2e8f0";
      return `<td width="20%" style="background-color:${background};height:6px;border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>`;
    })
    .join("");
  const labels = copy.statusSteps
    .map((label, index) => {
      const color = index <= current ? "#0f766e" : "#64748b";
      const weight = index <= current ? "700" : "400";
      return `<td style="padding:8px 2px 0;font-size:12px;line-height:1.4;color:${color};font-weight:${weight};">${escapeHtml(label)}</td>`;
    })
    .join("");

  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:2px 0;">',
    `<tr>${bar}</tr>`,
    `<tr>${labels}</tr>`,
    "</table>",
    nextDraft
      ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#64748b;">${escapeHtml(fill(copy.statusNow, { n: nextDraft }))}</p>`
      : "",
  ].join("");
};

const prioritiesHtml = (priorities, language) => {
  if (!priorities.length) return "";
  const rows = priorities
    .map((item, index) =>
      [
        "<tr>",
        '<td width="34" valign="top" style="padding:0 0 10px;">',
        `<span style="display:inline-block;width:24px;height:24px;border-radius:12px;background-color:#0f766e;color:#ffffff;font-size:12px;font-weight:800;text-align:center;line-height:24px;">${index + 1}</span>`,
        "</td>",
        `<td valign="top" style="padding:2px 0 10px;font-size:14px;line-height:${language === "ar" ? "1.7" : "1.5"};color:#0f172a;">${escapeHtml(item)}</td>`,
        "</tr>",
      ].join(""),
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
};

// Per-part coaching, used when the draft itself cannot be shown. Points stay out
// on purpose — a student reads words, never a score.
const normalizeSections = (sections) =>
  (Array.isArray(sections) ? sections : [])
    .map((section) => ({
      label: String(section?.label || "").trim(),
      strengths: (section?.strengths || [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
      improvements: (section?.improvements || [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
      nextStep: String(section?.nextStep || "").trim(),
      why: String(section?.why || "").trim(),
      // Stored as published: the fallback card must not lose corrections just
      // because the draft text itself could not be shown.
      mechanics: Array.isArray(section?.mechanics) ? section.mechanics : [],
      mechanicsReview: section?.mechanicsReview || null,
    }))
    .filter(
      (section) =>
        section.label ||
        section.strengths.length ||
        section.improvements.length ||
        section.nextStep ||
        section.why ||
        section.mechanics.length,
    );

const sectionFieldHtml = (label, value, language) =>
  `<p style="margin:8px 0 0;font-size:13px;line-height:${language === "ar" ? "1.7" : "1.5"};color:#334155;">` +
  `<span style="font-weight:700;color:#0f766e;">${escapeHtml(label)}:</span> ${escapeHtml(value)}</p>`;

const sectionListHtml = (label, items, language) => {
  if (!items.length) return "";
  const tag = language === "ar" ? "padding-right" : "padding-left";
  const list = items
    .map((item) => `<li style="margin:0 0 3px;">${escapeHtml(item)}</li>`)
    .join("");
  return [
    `<h3 style="margin:8px 0 0;font-size:12px;font-weight:700;color:#0f766e;${language === "ar" ? "" : "letter-spacing:.6px;text-transform:uppercase;"}">${escapeHtml(label)}</h3>`,
    `<ul style="margin:3px 0 0;${tag}:18px;font-size:13px;line-height:${language === "ar" ? "1.7" : "1.5"};color:#334155;">${list}</ul>`,
  ].join("");
};

const sectionsHtml = (sections, language, copy, showCorrections = true) => {
  if (!sections.length) return "";
  const cards = sections
    .map((section) => {
      const body = [
        section.label
          ? `<h3 dir="auto" style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(section.label)}</h3>`
          : "",
        sectionListHtml(copy.workedLabel, section.strengths, language),
        sectionListHtml(copy.improveLabel, section.improvements, language),
        section.nextStep
          ? sectionFieldHtml(copy.nextStepLabel, section.nextStep, language)
          : "",
        section.why
          ? sectionFieldHtml(copy.whyLabel, section.why, language)
          : "",
        // When the draft block already listed the omitted parts, the cards do
        // not repeat their corrections.
        showCorrections
          ? languageHtml({
              mechanicsList: section.mechanics,
              mechanicsReview: section.mechanicsReview,
              inline: new Set(),
              copy,
              language,
            })
          : "",
      ].join("");
      return [
        "<tr>",
        `<td style="padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background-color:#ffffff;">${body}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 8px;">${cards}</table>`;
};

const buttonHtml = ({ url, label }) => {
  if (!url) return "";
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 4px;">',
    '<tr><td style="background-color:#0f766e;border-radius:10px;">',
    `<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>`,
    "</td></tr>",
    "</table>",
  ].join("");
};

const labelHtml = (text, language) =>
  text
    ? `<h2 style="margin:20px 0 8px;font-size:12px;font-weight:700;color:#0f766e;${language === "ar" ? "" : "letter-spacing:.8px;text-transform:uppercase;"}">${escapeHtml(text)}</h2>`
    : "";

const summaryHtml = ({ summary, language }) => {
  if (!summary) return "";
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border-${language === "ar" ? "right" : "left"}:3px solid #0f766e;border-radius:${language === "ar" ? "10px 0 0 10px" : "0 10px 10px 0"};">`,
    `<tr><td style="padding:12px 14px;font-size:14px;line-height:${language === "ar" ? "1.8" : "1.6"};color:#334155;">${escapeHtml(summary)}</td></tr>`,
    "</table>",
  ].join("");
};

/**
 * One message, ready to hand to a transport. Pure: no database, no network.
 */
export const buildFeedbackEmail = ({
  role = "student",
  language = "en",
  studentFirstName = "",
  studentName = "",
  schoolName = "",
  assignment = {},
  project = {},
  draft = {},
  assessment: rawAssessment = {},
  comparison: rawComparison = null,
  url = "",
  // L7: one signed link per address; the footer carries the address's own.
  optOutUrl = "",
  resend = false,
  marks = "words",
} = {}) => {
  // A name slot can arrive after the AI run — a teacher edit, or a reply stored
  // before filling moved here — so it is filled again at the point of sending.
  const name = String(studentName || studentFirstName || "").trim();
  const assessment = fillStudentTokensDeep(toPlain(rawAssessment), name);
  const comparison = fillStudentTokensDeep(toPlain(rawComparison), name);
  const lang = languageOf(language);
  const base = COPY[lang];
  const isParent = role === "parent";
  // A guardian is not addressed as "you": the two strings below are written for
  // the student's own copy of the email.
  const copy = isParent
    ? {
        ...base,
        draftTruncated: base.parentDraftTruncated,
        comparisonWinsLabel: base.parentComparisonWinsLabel,
        languageHint: base.languageParentHint,
        languageExcerpt: base.languageParentExcerpt,
      }
    : base;
  const intro = resend
    ? isParent
      ? copy.parentResendIntro
      : copy.studentResendIntro
    : isParent
      ? copy.parentIntro
      : copy.studentIntro;
  const draftNumber =
    Number(
      draft?.number ??
        project.latestDraft?.number ??
        project.draftCount ??
        assessment.draftNumber ??
        1,
    ) || 1;
  const nextDraft = draftNumber + 1;
  const summary = String(assessment.overall?.summary || "").trim();
  const priorities = (assessment.overall?.nextPriorities || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const sections = normalizeSections(assessment.sections);
  const { rows: draftRows, truncated, omitted } = prepareDraftRows({
    paragraphs: essayParagraphs({ assignment, sections: draft?.sections }),
    notes: assessment.sections,
    languageSections: assessment.sections,
  });
  const hasDraft = draftRows.length > 0;
  // A criterion outside what the class was taught is not shown to a family (A7).
  const rubricScores = (assessment.scores || []).filter(
    (row) => !row.focusExcluded,
  );

  // The draft and the rubric enrich a message; they are never a reason to send one.
  if (!summary && priorities.length === 0 && sections.length === 0) return null;

  const typeLabel =
    TYPE_LABELS[lang][assignment.writingType] || TYPE_LABELS[lang].custom;
  const topic = String(assignment.topic || assignment.title || "").trim();
  const words =
    Number(
      draft?.totalWords ??
        project.latestDraft?.totalWords ??
        project.wordCount ??
        0,
    ) || 0;
  const due = formatDueDate(assignment.dueDate, lang);

  const values = {
    firstName: studentFirstName,
    n: draftNumber,
    next: nextDraft,
  };

  const rubricBody = rubricHtml({ scores: rubricScores, language: lang, copy, marks });
  const comparisonBody = comparisonHtml({ comparison, language: lang, copy });
  const draftBody = draftHtml({
    rows: draftRows,
    language: lang,
    copy,
    truncated,
    omitted,
  });
  const draftLabel = fill(
    isParent ? copy.parentDraftLabel : copy.studentDraftLabel,
    values,
  );

  const html = renderTemplate(
    lang === "ar" ? "writingFeedback_ar" : "writingFeedback",
    {
      schoolLabel: schoolName
        ? `${schoolName} · ${lang === "ar" ? "الكتابة" : "Writing"}`
        : lang === "ar"
          ? "الكتابة"
          : "Writing",
      headline: fill(
        isParent ? copy.parentHeadline : copy.studentHeadline,
        values,
      ),
      subhead: topic ? `${typeLabel} · ${iso(topic)}` : typeLabel,
      greeting: fill(
        isParent ? copy.parentGreeting : copy.studentGreeting,
        values,
      ),
      intro: fill(intro, values),
      typeLabel,
      pieceTitle: iso(topic) || typeLabel,
      pieceMeta: `${fill(copy.meta, { n: draftNumber, words })}${due ? fill(copy.due, { date: due }) : ""}`,
      statusLabel: copy.statusLabel,
      footer: fill(copy.footer, { schoolName }),
      optOutHtml: optOutUrl
        ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.6;"><a href="${escapeHtml(optOutUrl)}" style="color:#0f766e;text-decoration:underline;">${escapeHtml(copy.optOut)}</a></p>`
        : "",
      statusHtml: statusHtml({
        language: lang,
        stage: project.stage,
        nextDraft: resend ? null : nextDraft,
      }),
      summaryBlock: summary
        ? labelHtml(
            fill(
              isParent ? copy.parentQuoteLabel : copy.studentQuoteLabel,
              values,
            ),
            lang,
          ) + summaryHtml({ summary, language: lang })
        : "",
      rubricBlock: rubricBody
        ? labelHtml(copy.rubricLabel, lang) + rubricBody
        : "",
      prioritiesBlock: priorities.length
        ? labelHtml(
            fill(
              isParent ? copy.parentListLabel : copy.studentListLabel,
              values,
            ),
            lang,
          ) + prioritiesHtml(priorities, lang)
        : "",
      comparisonBlock: comparisonBody
        ? labelHtml(
            copy.comparisonLabel
              .replace("{{from}}", draftNumber - 1)
              .replace("{{to}}", draftNumber),
            lang,
          ) + comparisonBody
        : "",
      draftBlock: draftBody ? labelHtml(draftLabel, lang) + draftBody : "",
      // The per-part cards are the fallback for a draft we cannot show (older
      // data, or sections the assignment no longer defines).
      sectionsBlock:
        !hasDraft && sections.length
          ? labelHtml(copy.sectionsLabel, lang) +
            sectionsHtml(sections, lang, copy, omitted.length === 0)
          : "",
      // No parent button: there is no parent writing page, and the email already
      // carries the draft and every note. A link no role can open is worse than none.
      buttonHtml: isParent
        ? ""
        : buttonHtml({ url, label: copy.studentButton }),
    },
  );

  const subject =
    lang === "ar"
      ? isParent
        ? `ملاحظات الكتابة: ${assignment.title || ""} — المسودة ${draftNumber}`
        : `ملاحظاتك على المسودة ${draftNumber}: ${assignment.title || ""}`
      : isParent
        ? `Writing feedback: ${assignment.title || ""} — draft ${draftNumber}`
        : `Your feedback on draft ${draftNumber}: ${assignment.title || ""}`;

  const text = [
    fill(isParent ? copy.parentGreeting : copy.studentGreeting, values),
    "",
    fill(intro, values),
    "",
    `${fill(copy.meta, { n: draftNumber, words })}${due ? fill(copy.due, { date: due }) : ""}`,
    summary
      ? `\n${fill(isParent ? copy.parentQuoteLabel : copy.studentQuoteLabel, values)}\n${summary}`
      : "",
    rubricBody
      ? `\n${copy.rubricLabel}\n${rubricText({ scores: rubricScores, language: lang, copy, marks })}`
      : "",
    priorities.length
      ? `\n${fill(isParent ? copy.parentListLabel : copy.studentListLabel, values)}\n${priorities.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
      : "",
    comparisonBody
      ? `\n${comparisonText({
          comparison,
          copy,
          fromNumber: draftNumber - 1,
          toNumber: draftNumber,
        })}`
      : "",
    draftBody
      ? `\n${draftLabel}\n${draftText({ rows: draftRows, language: lang, copy, truncated, omitted })}`
      : "",
    !hasDraft && sections.length
      ? `\n${copy.sectionsLabel}\n${sections
          .map((section) => {
            const lines = [];
            if (section.label) lines.push(`- ${section.label}`);
            section.strengths.forEach((item) =>
              lines.push(`    ${copy.workedLabel}: ${item}`),
            );
            section.improvements.forEach((item) =>
              lines.push(`    ${copy.improveLabel}: ${item}`),
            );
            if (section.nextStep)
              lines.push(`    ${copy.nextStepLabel}: ${section.nextStep}`);
            if (section.why) lines.push(`    ${copy.whyLabel}: ${section.why}`);
            if (omitted.length === 0) {
              for (const line of languageTextLines({
                mechanicsList: section.mechanics,
                mechanicsReview: section.mechanicsReview,
                copy,
              })) {
                lines.push(`    ${line}`);
              }
            }
            return lines.join("\n");
          })
          .join("\n")}`
      : "",
    url ? `\n${url}` : "",
    optOutUrl ? `\n${copy.optOut}: ${optOutUrl}` : "",
    "",
    fill(copy.footer, { schoolName }),
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject: subject.trim(), html, text };
};

const prepareFeedbackDelivery = async ({
  schoolId,
  project,
  assignment,
  draft,
  assessment,
  notify = {},
  env = process.env,
  resend = false,
}) => {
  if (!assessment || assessment.kind !== "feedback")
    return { skipped: "not-feedback" };
  const channels = publishChannels(emailChannels(env), notify);
  if (!channels.students && !channels.parents) return { skipped: "off" };

  const [student, school] = await Promise.all([
    Student.findOne({ school: schoolId, _id: project.student }).populate(
      "user",
      "email",
    ),
    School.findOne({ _id: schoolId })
      .select("name settings.writingFeedback.marksMode")
      .lean(),
  ]);
  if (!student) return { skipped: "no-student" };

  const recipients = resolveRecipients({ student, channels });
  const available = resolveRecipients({
    student,
    channels: { students: false, parents: true },
  });
  const missing = [];
  if (channels.students && !recipients.studentEmails.length)
    missing.push("student");
  if (channels.parents && !available.parentEmails.length)
    missing.push("parents");
  if (!recipients.studentEmails.length && !recipients.parentEmails.length) {
    return { skipped: "no-addresses" };
  }

  // L7: a family that stopped these emails is recorded on the publish event and
  // never built a message, so neither this send nor any later resend can reach them.
  const stopped = await optedOutEmails({
    schoolId,
    emails: [...recipients.studentEmails, ...recipients.parentEmails],
  });
  const suppressed = [
    ...recipients.studentEmails
      .filter((email) => stopped.has(email))
      .map((email) => ({ email, role: "student" })),
    ...recipients.parentEmails
      .filter((email) => stopped.has(email))
      .map((email) => ({ email, role: "parent" })),
  ];
  const addressesFor = (emails) => emails.filter((email) => !stopped.has(email));

  const language = languageOf(assessment.language);
  // The published draft-to-draft comparison for the same draft, when the teacher
  // has already published one, rides along in the same email.
  const comparison =
    project?._id && assessment.draft
      ? await WritingAssessment.findOne({
          school: schoolId,
          project: project._id,
          draft: assessment.draft,
          kind: "comparison",
          "publish.state": "published",
        })
          .select("-aiOriginal")
          .sort({ "publish.publishedAt": -1, createdAt: -1 })
          .lean()
      : null;
  const base = String(env.CLIENT_URL || env.FRONTEND_URL || "").replace(
    /\/+$/,
    "",
  );
  const context = {
    language,
    resend,
    schoolName: String(school?.name || "").trim(),
    studentFirstName: firstWord(student.firstName),
    studentName: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
    assignment: assignment || {},
    project,
    draft,
    assessment,
    comparison,
    marks: marksModeOf(school?.settings?.writingFeedback?.marksMode),
    url:
      base && project._id
        ? `${base}/portal/writing/project/${project._id}`
        : "",
  };

  // L2: an address that already holds this feedback is never sent it again; the
  // row stays visible in the preview and is reported as skipped.
  const sentBefore = new Set(
    (assessment.publish?.email?.deliveries || [])
      .filter((row) => row.status === "sent")
      .map((row) => String(row.email || "").toLowerCase()),
  );
  const apiBase =
    String(env.API_URL || env.API_BASE_URL || "").replace(/\/+$/, "") ||
    `http://localhost:${env.PORT || 5000}`;
  const messages = [];
  for (const [role, emails] of [
    ["student", addressesFor(recipients.studentEmails)],
    ["parent", addressesFor(recipients.parentEmails)],
  ]) {
    for (const email of emails) {
      const message = buildFeedbackEmail({
        ...context,
        role,
        optOutUrl: buildOptOutUrl({ baseUrl: apiBase, schoolId, email }),
      });
      if (message) {
        messages.push({
          role,
          email,
          alreadySent: sentBefore.has(email),
          message,
        });
      }
    }
  }
  if (!messages.length) {
    return suppressed.length
      ? { skipped: "suppressed", suppressed }
      : { skipped: "empty" };
  }
  return { messages, suppressed, missing };
};

const sendFeedbackDelivery = async (
  { messages, suppressed = [], missing = [] },
  schoolId,
  senderUserId = null,
) => {
  const results = [];
  const alreadySent = [];
  for (const { role, email, alreadySent: hasCopy, message } of messages) {
    if (hasCopy) {
      alreadySent.push({ email, role });
      continue;
    }
    try {
      await sendTransactionalEmail({
        to: email,
        ...message,
        schoolId,
        preferredUserId: senderUserId,
        // Feedback is the teacher's own words; it must not leave from the
        // school's shared SMTP account.
        allowAdminFallback: false,
        allowSmtp: false,
      });
      results.push({ email, role, status: "sent" });
    } catch (error) {
      logger.warn("writing_feedback_email_failed", {
        email,
        error: error?.message,
      });
      results.push({ email, role, status: "failed" });
    }
  }
  return { results, alreadySent, suppressed, missing };
};

/**
 * Publish answers before the mail leaves, so what happened to the family email
 * has to be written down. `pending` goes in before any await: a send that dies
 * mid-flight must look recorded-and-unfinished, not never-attempted.
 */
export const beginEmailDelivery = async ({ schoolId, assessmentId, notify }) => {
  if (!mongoose.isValidObjectId(String(assessmentId || ""))) return;
  const set = {
    "publish.email.status": "pending",
    "publish.email.lastAttemptAt": new Date(),
  };
  if (notify && (notify.student || notify.parents)) {
    set["publish.email.channels.student"] = Boolean(notify.student);
    set["publish.email.channels.parents"] = Boolean(notify.parents);
  }
  await WritingAssessment.updateOne(
    { school: schoolId, _id: assessmentId },
    { $inc: { "publish.email.attempts": 1 }, $set: set },
  ).catch((error) =>
    logger.warn("writing_feedback_email_record_failed", {
      error: error?.message,
    }),
  );
};

/**
 * Writes the address rows the send is about to act on: one queued row per
 * message, one suppressed row per opted-out address. Rows for the same address
 * are replaced, so a retried failed row becomes queued again while a sent row
 * (excluded from `messages` planning) is left untouched.
 */
const queueEmailDeliveries = async ({
  schoolId,
  assessmentId,
  messages = [],
  suppressed = [],
}) => {
  const now = new Date();
  const planned = [
    ...messages
      .filter((row) => !row.alreadySent)
      .map((row) => ({
        email: row.email,
        role: row.role,
        status: "queued",
        attempts: 0,
        lastAttemptAt: now,
      })),
    ...suppressed.map((row) => ({
      email: row.email,
      role: row.role,
      status: "suppressed",
      attempts: 0,
      suppressedReason: "opted-out",
      lastAttemptAt: now,
    })),
  ];
  if (!planned.length) return;
  const scope = { school: schoolId, _id: assessmentId };
  await WritingAssessment.updateOne(scope, {
    $pull: {
      "publish.email.deliveries": {
        email: { $in: planned.map((row) => row.email) },
      },
    },
  }).catch((error) =>
    logger.warn("writing_feedback_email_record_failed", {
      error: error?.message,
    }),
  );
  await WritingAssessment.updateOne(scope, {
    $push: { "publish.email.deliveries": { $each: planned } },
  }).catch((error) =>
    logger.warn("writing_feedback_email_record_failed", {
      error: error?.message,
    }),
  );
};

const deliveryOutcome = (result) => {
  if (!result) return { status: "failed", lastError: "no result" };
  if (result.skipped) {
    return result.skipped === "error"
      ? { status: "failed", lastError: "send failed" }
      : { status: "skipped", skippedReason: result.skipped };
  }
  const results = result.results || [];
  const sentNow = results.filter((row) => row.status === "sent").length;
  const failed = results.filter((row) => row.status === "failed").length;
  const alreadySent = (result.alreadySent || []).length;
  const suppressed = (result.suppressed || []).length;
  const reached = sentNow + alreadySent;
  if (failed && !reached)
    return {
      status: "failed",
      lastError: "every recipient failed",
      recipients: results.length,
    };
  if (failed)
    return {
      status: "partial",
      lastError: "some recipients failed",
      recipients: results.length + alreadySent,
    };
  if (!reached)
    return {
      status: "skipped",
      skippedReason: suppressed ? "suppressed" : "empty",
    };
  return { status: "sent", recipients: reached };
};

export const recordEmailDelivery = async ({ schoolId, assessmentId, result }) => {
  if (!mongoose.isValidObjectId(String(assessmentId || ""))) return;
  const outcome = deliveryOutcome(result);
  const set = {
    "publish.email.status": outcome.status,
    "publish.email.lastError": outcome.lastError || "",
    "publish.email.skippedReason": outcome.skippedReason || "",
  };
  if (outcome.recipients !== undefined)
    set["publish.email.recipients"] = outcome.recipients;
  // sentAt is the last delivery that worked; a later failed resend must not
  // erase the fact that the family already has a copy.
  if (outcome.status === "sent" || outcome.status === "partial")
    set["publish.email.sentAt"] = new Date();
  await WritingAssessment.updateOne(
    { school: schoolId, _id: assessmentId },
    { $set: set },
  ).catch((error) =>
    logger.warn("writing_feedback_email_record_failed", {
      error: error?.message,
    }),
  );
  // L2: the per-address result, so the panel can name who has the feedback.
  const now = new Date();
  for (const row of result?.results || []) {
    if (!row.email) continue;
    const update = {
      "publish.email.deliveries.$.status": row.status,
      "publish.email.deliveries.$.lastAttemptAt": now,
    };
    if (row.status === "sent") {
      update["publish.email.deliveries.$.sentAt"] = now;
      update["publish.email.deliveries.$.lastError"] = "";
    } else {
      update["publish.email.deliveries.$.lastError"] = "send failed";
    }
    await WritingAssessment.updateOne(
      {
        school: schoolId,
        _id: assessmentId,
        "publish.email.deliveries.email": row.email,
      },
      {
        $set: update,
        $inc: { "publish.email.deliveries.$.attempts": 1 },
      },
    ).catch((error) =>
      logger.warn("writing_feedback_email_record_failed", {
        error: error?.message,
      }),
    );
  }
};

export const notifyFeedbackPublished = async (context) => {
  const delivery = {
    schoolId: context.schoolId,
    assessmentId: context.assessment?._id,
  };
  await beginEmailDelivery({ ...delivery, notify: context.notify });
  let result;
  try {
    const prepared = await prepareFeedbackDelivery(context);
    if (prepared.skipped) {
      result = prepared;
    } else {
      await queueEmailDeliveries({ ...delivery, ...prepared });
      result = await sendFeedbackDelivery(
        prepared,
        context.schoolId,
        context.userId,
      );
    }
  } catch (error) {
    logger.error("writing_feedback_email_error", { error: error?.message });
    result = { skipped: "error" };
  }
  await recordEmailDelivery({ ...delivery, result });
  return result;
};

const emailError = (message, statusCode, code) =>
  Object.assign(new Error(message), { statusCode, code });

const preparePublishedFeedback = async ({
  schoolId,
  assessmentId,
  userId,
  isAdmin = false,
  notify,
  env = process.env,
}) => {
  if (!mongoose.isValidObjectId(String(assessmentId || ""))) {
    throw emailError(
      "Published feedback not found.",
      404,
      "WRITING_EMAIL_NOT_FOUND",
    );
  }
  const assessment = await WritingAssessment.findOne({
    school: schoolId,
    _id: assessmentId,
  })
    .select("-aiOriginal")
    .lean();
  if (!assessment)
    throw emailError(
      "Published feedback not found.",
      404,
      "WRITING_EMAIL_NOT_FOUND",
    );
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: assessment.assignment,
  }).lean();
  if (!assignment)
    throw emailError("Writing task not found.", 404, "WRITING_EMAIL_NOT_FOUND");
  if (!isAdmin && String(assignment.assignedBy) !== String(userId)) {
    throw emailError(
      "Only the teacher who created this task or a school admin can resend its feedback.",
      403,
      "WRITING_EMAIL_FORBIDDEN",
    );
  }
  if (
    assessment.kind !== "feedback" ||
    assessment.aiStatus !== "done" ||
    assessment.publish?.state !== "published"
  ) {
    throw emailError(
      "Only published draft feedback can be emailed again.",
      409,
      "WRITING_EMAIL_NOT_PUBLISHED",
    );
  }
  if (
    !notify ||
    typeof notify.student !== "boolean" ||
    typeof notify.parents !== "boolean" ||
    (!notify.student && !notify.parents)
  ) {
    throw emailError(
      "Choose the student, parents, or both.",
      400,
      "WRITING_EMAIL_RECIPIENTS_REQUIRED",
    );
  }
  const allowed = emailChannels(env);
  if (
    (notify.student && !allowed.students) ||
    (notify.parents && !allowed.parents)
  ) {
    throw emailError(
      "Email delivery is not enabled for the selected recipients.",
      409,
      "WRITING_EMAIL_DISABLED",
    );
  }
  const [project, draft] = await Promise.all([
    WritingProject.findOne({
      school: schoolId,
      _id: assessment.project,
      assignment: assignment._id,
      student: assessment.student,
    }).lean(),
    WritingDraft.findOne({
      school: schoolId,
      _id: assessment.draft,
      project: assessment.project,
      assignment: assignment._id,
      student: assessment.student,
    }).lean(),
  ]);
  if (!project || !draft)
    throw emailError(
      "Writing draft not found.",
      404,
      "WRITING_EMAIL_NOT_FOUND",
    );
  const prepared = await prepareFeedbackDelivery({
    schoolId,
    project,
    assignment,
    draft,
    assessment,
    notify,
    env,
    resend: true,
  });
  if (prepared.skipped) {
    if (prepared.skipped === "empty") {
      throw emailError(
        "This published feedback has no email content.",
        422,
        "WRITING_EMAIL_EMPTY",
      );
    }
    if (prepared.skipped === "suppressed") {
      throw emailError(
        "Everyone with a saved address has stopped writing feedback emails.",
        409,
        "WRITING_EMAIL_SUPPRESSED",
      );
    }
    throw emailError(
      "No email addresses are available for the selected recipients.",
      422,
      "WRITING_EMAIL_NO_ADDRESSES",
    );
  }
  return prepared;
};

export const previewPublishedFeedbackEmail = async (context) => {
  const { messages, suppressed, missing } = await preparePublishedFeedback(context);
  const previews = [];
  for (const [role, addressRole] of [
    ["student", "student"],
    ["parents", "parent"],
  ]) {
    const rows = messages.filter((row) => row.role === addressRole);
    if (!rows.length) continue;
    previews.push({
      role,
      recipients: rows.length,
      sent: rows.filter((row) => row.alreadySent).length,
      subject: rows[0].message.subject,
      html: rows[0].message.html,
    });
  }
  return { previews, suppressed: suppressed.length, missing };
};

export const resendPublishedFeedbackEmail = async (context) => {
  const prepared = await preparePublishedFeedback(context);
  const delivery = {
    schoolId: context.schoolId,
    assessmentId: context.assessmentId,
  };
  // A resend is a new attempt on the same record: the review screen must show
  // "sent" or "failed" from the attempt that actually ran, not from publish day.
  await beginEmailDelivery({ ...delivery, notify: context.notify });
  await queueEmailDeliveries({ ...delivery, ...prepared });
  const sent = await sendFeedbackDelivery(
    prepared,
    context.schoolId,
    context.userId,
  );
  await recordEmailDelivery({ ...delivery, result: sent });
  return {
    sent: sent.results.filter((row) => row.status === "sent").length,
    failed: sent.results.filter((row) => row.status === "failed").length,
    // L2: addresses that already hold this feedback were not emailed again.
    skipped: sent.alreadySent.length,
    suppressed: sent.suppressed.length,
    missing: sent.missing,
  };
};
