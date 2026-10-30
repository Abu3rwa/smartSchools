import { asyncHandler } from "../middleware/errorHandler.js";
import { getTeacherAssignments, resolveTeacherProfile } from "../helpers/teacherScoping.js";
import NewsletterIssue from "../models/NewsletterIssue.js";
import NewsletterChildLetter from "../models/NewsletterChildLetter.js";
import NewsletterSection from "../models/NewsletterSection.js";
import Class from "../models/Class.js";
import Subject from "../models/Subject.js";
import Student from "../models/Student.js";
import { resolveNewsletterPeriod } from "../helpers/newsletterPeriod.js";
import { resolveRequestedAcademicYear } from "../utils/academicYear.js";
import { countWords } from "../services/newsletterAiService.js";
import { resolveRequestedLanguages } from "../utils/aiLanguageUtils.js";
import { collectClassWeekFacts, collectStudentFacts, hasEnoughMaterial, normalizeSources, STUDENT_SOURCES, DEFAULT_STUDENT_SOURCES } from "../services/newsletterFactsService.js";
import { generateChildLetter } from "../services/newsletterChildAiService.js";
import { fillStudentToken, inspectLetterText, personalIdentifiers, scrubPersonalText } from "../services/newsletterPrivacy.js";
import { isCreditError } from "../services/aiCreditService.js";
import { sendChildLettersForIssue, prepareChildLetterEmail } from "../services/newsletterChildEmailService.js";
import { renderChildLetterPdf, letterPdfFilename } from "../services/newsletterChildLetterPdfService.js";

const MAX_STUDENTS_PER_RUN = 30;
const AI_CONCURRENCY = 3;
const MAX_PERIOD_DAYS = 45;

function parseDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

/** Teacher picks the from→to window; defaults follow the school's newsletter cadence. */
export function resolveChildPeriod({ school, departmentId, periodStart, periodEnd, weekStart }) {
  const start = parseDateOrNull(periodStart) || parseDateOrNull(weekStart);
  const end = parseDateOrNull(periodEnd);
  if (start && end) {
    if (start > end) throw Object.assign(new Error("The period end must be after its start."), { statusCode: 400 });
    const days = Math.ceil((end - start) / 86400000);
    if (days > MAX_PERIOD_DAYS) {
      throw Object.assign(new Error(`A letter period can cover at most ${MAX_PERIOD_DAYS} days.`), { statusCode: 400 });
    }
    return { periodStart: start, periodEnd: end };
  }
  const resolved = resolveNewsletterPeriod({ school, departmentId, date: start || new Date() });
  return { periodStart: resolved.periodStart, periodEnd: resolved.periodEnd };
}

async function mapWithConcurrency(items, limit, run) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * One bad letter must not fail the batch, but a credit stop must: there is no
 * point paying for more calls once the balance is gone, and the teacher needs to
 * see the real reason instead of thirty identical failures.
 */
async function runGenerationBatch({ queue, locked, regenerate, collect }) {
  const report = { generated: 0, skipped: 0, failed: 0, failures: [], skippedReasons: [], creditError: "", creditCode: "" };

  try {
    await mapWithConcurrency(queue, AI_CONCURRENCY, async (student) => {
      const key = String(student._id);
      if (!regenerate && locked.has(key)) {
        report.skipped += 1;
        report.skippedReasons.push({ studentId: key, reason: `already ${locked.get(key)}` });
        return;
      }
      try {
        const outcome = await collect(student);
        if (outcome?.skip) {
          report.skipped += 1;
          report.skippedReasons.push({ studentId: key, reason: outcome.skip });
          return;
        }
        report.generated += 1;
      } catch (error) {
        if (isCreditError(error)) {
          report.creditError = error.message;
          report.creditCode = error.code;
          throw error;
        }
        report.failed += 1;
        report.failures.push({ studentId: key, reason: error?.message || "Generation failed" });
      }
    });
  } catch (error) {
    if (!isCreditError(error)) throw error;
  }

  return report;
}

async function ensureTeacherForClass(req, classId) {
  const profile = await resolveTeacherProfile(req);
  if (req.user.role !== "teacher" || !profile) return { error: "Teacher access required" };
  const assignments = await getTeacherAssignments(profile._id);
  const allowed = assignments.some((row) => String(row.classId) === String(classId));
  if (!allowed) return { error: "Not authorized for this class" };
  return { profile };
}

async function ensureIssue({ schoolId, classId, academicYear, periodStart, periodEnd, createdBy, frequency }) {
  return NewsletterIssue.findOneAndUpdate(
    { school: schoolId, class: classId, academicYear, weekStart: periodStart },
    {
      $setOnInsert: {
        school: schoolId,
        class: classId,
        academicYear,
        weekStart: periodStart,
        weekEnd: periodEnd,
        status: "draft",
        mode: "child",
        createdBy,
        ...(frequency ? { frequency } : {}),
      },
    },
    { new: true, upsert: true }
  );
}

/**
 * TEACHER: Draft one letter per student for a class period.
 * POST /api/newsletters/child-letters/generate
 */
export const generateChildLetters = asyncHandler(async (req, res) => {
  const {
    classId,
    academicYear,
    weekStart,
    periodStart,
    periodEnd,
    wordTarget = 90,
    sources = DEFAULT_STUDENT_SOURCES,
    subjectIds = [],
    customNote = "",
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language,
    studentIds = [],
    regenerate = false,
  } = req.body || {};

  if (!classId) return badRequest(res, "classId is required");

  const access = await ensureTeacherForClass(req, classId);
  if (access.error) return res.status(403).json({ success: false, message: access.error });

  const cls = await Class.findById(classId).select("name grade section department subjects").lean();
  if (!cls) return res.status(404).json({ success: false, message: "Class not found" });

  let period;
  try {
    period = resolveChildPeriod({
      school: req.school,
      departmentId: cls.department,
      periodStart,
      periodEnd,
      weekStart,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }

  const academicYearValue = resolveRequestedAcademicYear(academicYear, req.school);
  const issue = await ensureIssue({
    schoolId: req.schoolId,
    classId,
    academicYear: academicYearValue,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    createdBy: req.user._id,
  });

  const classSubjectIds = Array.from(new Set((cls.subjects || []).map((row) => String(row?.subject || "")).filter(Boolean)));
  const selectedSubjectIds = Array.isArray(subjectIds) && subjectIds.length
    ? subjectIds.map(String).filter((id) => classSubjectIds.includes(id))
    : classSubjectIds;

  const [subjects, classFacts] = await Promise.all([
    Subject.find({ _id: { $in: selectedSubjectIds } }).select("name").lean(),
    collectClassWeekFacts({
      classId,
      subjectIds: selectedSubjectIds,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    }),
  ]);

  const subjectNameById = new Map(subjects.map((row) => [String(row._id), row.name]));
  const classTopics = classFacts
    .map((row) => ({
      subject: subjectNameById.get(String(row.subjectId)) || "Subject",
      topics: [
        ...row.lessons.map((lesson) => lesson.title),
        ...row.liveLessons.map((lesson) => lesson.title),
      ].filter(Boolean).slice(0, 5),
    }))
    .filter((row) => row.topics.length);

  // The class-level newsletter for the same period, so each child letter stays
  // consistent with what the whole class was told. Teachers write these by hand,
  // so every classmate's name is stripped before the text can reach the AI.
  const [classSections, roster] = await Promise.all([
    NewsletterSection.find({
      school: req.schoolId,
      issue: issue._id,
      status: { $in: ["approved", "submitted"] },
    })
      .populate("subject", "name")
      .select("subject content")
      .lean(),
    Student.find({ currentClass: classId, status: "active" })
      .select("firstName lastName")
      .lean(),
  ]);

  const rosterNames = Array.from(
    new Set(
      roster
        .flatMap((row) => [row.firstName, row.lastName])
        .map((name) => String(name || "").trim())
        .filter((name) => name.length > 2)
    )
  );

  const classNewsletter = classSections
    .filter((row) => String(row.content || "").trim())
    .slice(0, 6)
    .map((row) => ({
      subject: row.subject?.name || "Subject",
      content: scrubPersonalText(String(row.content).trim().slice(0, 500), { names: rosterNames }, { caseSensitive: true }),
    }));

  const studentQuery = { currentClass: classId, status: "active" };
  if (Array.isArray(studentIds) && studentIds.length) studentQuery._id = { $in: studentIds };

  const students = await Student.find(studentQuery)
    .select("_id firstName lastName gender studentEmail email")
    .sort({ lastName: 1, firstName: 1 })
    .limit(MAX_STUDENTS_PER_RUN + 1)
    .lean();

  if (students.length === 0) return badRequest(res, "This class has no active students.");
  const queue = students.slice(0, MAX_STUDENTS_PER_RUN);
  const overCap = Math.max(0, students.length - MAX_STUDENTS_PER_RUN);

  const existing = await NewsletterChildLetter.find({ issue: issue._id })
    .select("student status")
    .lean();
  const locked = new Map(
    existing.filter((row) => row.status !== "draft").map((row) => [String(row.student), row.status])
  );

  const normalizedLanguages = resolveRequestedLanguages({
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language,
    subjectName: "newsletter",
    max: 2,
  });
  const cleanSources = normalizeSources(sources, STUDENT_SOURCES);
  const periodLabel = `${period.periodStart.toLocaleDateString()} – ${period.periodEnd.toLocaleDateString()}`;
  const note = String(customNote || "").trim().slice(0, 400);

  const outcomes = await runGenerationBatch({
    queue,
    locked,
    regenerate,
    collect: async (student) => {
      const identifiers = personalIdentifiers(student);
      const facts = await collectStudentFacts({
        studentId: student._id,
        classId,
        gender: student.gender,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        sources: cleanSources,
        identifiers,
      });

      if (!hasEnoughMaterial(facts)) return { skip: "no material this period" };

      const draft = await generateChildLetter({
        facts,
        classTopics,
        classNewsletter: classNewsletter.map((row) => ({
          subject: row.subject,
          content: scrubPersonalText(row.content, identifiers),
        })),
        periodLabel,
        wordTarget,
        requestedLanguages: normalizedLanguages,
        // The teacher's own note is scrubbed per child before it reaches the prompt.
        teacherNote: scrubPersonalText(
          scrubPersonalText(note, { names: rosterNames }, { caseSensitive: true }),
          identifiers
        ),
        forbiddenTerms: [...identifiers.names, ...identifiers.emails],
      });

      await NewsletterChildLetter.findOneAndUpdate(
        { school: req.schoolId, issue: issue._id, student: student._id },
        {
          $set: {
            class: classId,
            academicYear: academicYearValue,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            language: draft.language,
            requestedLanguages: draft.requestedLanguages,
            sources: cleanSources,
            facts,
            classTopics,
            content: draft.content,
            wordCount: draft.wordCount,
            status: "draft",
            submittedAt: null,
            adminReview: { notes: "" },
            aiUsage: draft.aiUsage,
            createdBy: req.user._id,
            teacherProfile: access.profile._id,
            sentAt: null,
            lastSendError: "",
          },
        },
        { new: true, upsert: true }
      );

      return { wordCount: draft.wordCount };
    },
  });

  if (outcomes.creditError) {
    return res.status(402).json({ success: false, message: outcomes.creditError, code: outcomes.creditCode });
  }

  res.json({
    success: true,
    data: {
      issueId: issue._id,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      generated: outcomes.generated,
      skipped: outcomes.skipped,
      failed: outcomes.failed,
      overCap,
      failures: outcomes.failures,
      skippedReasons: outcomes.skippedReasons,
    },
  });
});

/**
 * TEACHER/ADMIN: Active students of a class, for the per-child picker.
 * Names never leave this response to reach the AI; they are used for the picker only.
 * GET /api/newsletters/child-letters/students?classId=
 */
export const listChildLetterStudents = asyncHandler(async (req, res) => {
  const { classId } = req.query;
  if (!classId) return badRequest(res, "classId is required");

  const access = await ensureTeacherForClass(req, classId);
  if (access.error) return res.status(403).json({ success: false, message: access.error });

  const students = await Student.find({ currentClass: classId, status: "active" })
    .select("_id firstName lastName")
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  res.json({
    success: true,
    data: {
      students: students.map((student) => ({
        _id: student._id,
        name: [student.firstName, student.lastName].filter(Boolean).join(" "),
      })),
    },
  });
});

/**
 * TEACHER/ADMIN: Letters for one issue, with the name filled in for review only.
 * GET /api/newsletters/child-letters?issueId= OR ?classId=&weekStart=
 */
export const listChildLetters = asyncHandler(async (req, res) => {
  const { issueId, classId, weekStart, periodStart } = req.query;
  let issue = null;

  if (issueId) {
    issue = await NewsletterIssue.findById(issueId).lean();
  } else if (classId) {
    const academicYearValue = resolveRequestedAcademicYear(req.query.academicYear, req.school);
    // Generation keys the issue on the exact period start the teacher picked, so
    // a custom weekday must not be snapped back to the start of the week here.
    const chosenStart = parseDateOrNull(periodStart);
    const issueStart = chosenStart
      || resolveNewsletterPeriod({ school: req.school, date: parseDateOrNull(weekStart) || new Date() }).periodStart;
    issue = await NewsletterIssue.findOne({
      school: req.schoolId,
      class: classId,
      academicYear: academicYearValue,
      weekStart: issueStart,
    }).lean();
  }
  if (!issue) return res.json({ success: true, data: { letters: [] } });

  if (req.user.role === "teacher") {
    const access = await ensureTeacherForClass(req, issue.class);
    if (access.error) return res.status(403).json({ success: false, message: access.error });
  }

  const letters = await NewsletterChildLetter.find({ issue: issue._id })
    .populate("student", "firstName lastName")
    .sort({ createdAt: 1 })
    .lean();

  res.json({
    success: true,
    data: {
      issueId: issue._id,
      periodStart: issue.weekStart,
      periodEnd: issue.weekEnd,
      letters: letters.map((letter) => ({
        ...letter,
        studentName: `${letter.student?.firstName || ""} ${letter.student?.lastName || ""}`.trim(),
        previewContent: fillContentForReview(letter),
      })),
    },
  });
});

function fillContentForReview(letter) {
  return fillStudentToken(letter.content, letter.student?.firstName);
}

/**
 * TEACHER/ADMIN: Edit a letter. Teacher edits go back to draft for re-review.
 * PATCH /api/newsletters/child-letters/:id/content
 */
export const updateChildLetterContent = asyncHandler(async (req, res) => {
  const letter = await NewsletterChildLetter.findById(req.params.id).populate("student", "firstName lastName studentEmail email");
  if (!letter) return res.status(404).json({ success: false, message: "Letter not found" });

  const isTeacherOwner =
    req.user.role === "teacher" && String(letter.createdBy) === String(req.user._id);
  const isAdminReviewer = ["admin", "super_admin", "department_principal"].includes(req.user.role);
  if (!isTeacherOwner && !isAdminReviewer) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  if (letter.sentAt) {
    return badRequest(res, "This letter was already sent to the family. Generate a new letter instead.");
  }

  const content = String(req.body?.content || "").trim();
  if (!content) return badRequest(res, "content is required");

  const identifiers = personalIdentifiers(letter.student);
  const check = inspectLetterText(content, {
    forbiddenTerms: [...identifiers.names, ...identifiers.emails],
    maxTokens: 3,
  });
  if (!check.ok) {
    return res.status(422).json({
      success: false,
      message: check.reasons.includes("personal-name")
        ? "Write {{student}} instead of the student's name, so the letter stays private."
        : `This text cannot be stored (${check.reasons.join(", ")}).`,
      reasons: check.reasons,
    });
  }

  letter.content = content;
  letter.wordCount = countWords(content);
  letter.teacherNote = String(req.body?.teacherNote || "").trim().slice(0, 300);
  if (isTeacherOwner && letter.status !== "draft") {
    letter.status = "draft";
    letter.submittedAt = undefined;
    letter.adminReview = { notes: "" };
  }
  await letter.save();

  res.json({ success: true, data: { letter } });
});

/** TEACHER: Sign the letter off. Teachers do not need admin approval. */
export const submitChildLetter = asyncHandler(async (req, res) => {
  const letter = await NewsletterChildLetter.findById(req.params.id);
  if (!letter) return res.status(404).json({ success: false, message: "Letter not found" });
  if (req.user.role !== "teacher" || String(letter.createdBy) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  if (!String(letter.content || "").trim()) return badRequest(res, "Generate or write the letter first.");

  letter.status = "approved";
  letter.submittedAt = new Date();
  await letter.save();
  res.json({ success: true, data: { letter } });
});

/** ADMIN: Approve or reject one letter. */
export const reviewChildLetter = asyncHandler(async (req, res) => {
  const approve = req.body?.approve !== false;
  const letter = await NewsletterChildLetter.findById(req.params.id);
  if (!letter) return res.status(404).json({ success: false, message: "Letter not found" });

  letter.status = approve ? "approved" : "rejected";
  letter.adminReview = {
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
    notes: String(req.body?.notes || ""),
  };
  await letter.save();
  res.json({ success: true, data: { letter } });
});

/** ADMIN: Approve every submitted letter for one issue. */
export const approveSubmittedChildLetters = asyncHandler(async (req, res) => {
  const result = await NewsletterChildLetter.updateMany(
    { issue: req.params.id, status: "submitted" },
    {
      $set: {
        status: "approved",
        adminReview: {
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
          notes: String(req.body?.notes || ""),
        },
      },
    }
  );
  res.json({ success: true, data: { approvedCount: result.modifiedCount || 0 } });
});

/** ADMIN: Send every approved letter for an issue to its own family. */
export const sendChildLetters = asyncHandler(async (req, res) => {
  const result = await sendChildLettersForIssue({
    issueId: req.params.id,
    adminUserId: req.user._id,
  });
  res.json({ success: true, data: result });
});

/** TEACHER/ADMIN: Render one letter exactly as the family will receive it. */
export const previewChildLetter = asyncHandler(async (req, res) => {
  const { letter, rendered } = await prepareChildLetterEmail({ letterId: req.params.id });
  if (req.user.role === "teacher") {
    const access = await ensureTeacherForClass(req, letter.class);
    if (access.error) return res.status(403).json({ success: false, message: access.error });
  }
  res.json({
    success: true,
    data: {
      letterId: letter._id,
      subject: rendered.subject,
      htmlContent: rendered.html,
      textContent: rendered.text,
    },
  });
});

/** TEACHER/ADMIN: Download one letter as a print-quality PDF. */
export const downloadChildLetterPdf = asyncHandler(async (req, res) => {
  const existing = await NewsletterChildLetter.findById(req.params.id)
    .select("class")
    .lean();
  if (!existing) return res.status(404).json({ success: false, message: "Letter not found" });

  if (req.user.role === "teacher") {
    const access = await ensureTeacherForClass(req, existing.class);
    if (access.error) return res.status(403).json({ success: false, message: access.error });
  }

  const { pdf, letter, rendered } = await renderChildLetterPdf({ letterId: req.params.id });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${letterPdfFilename({ rendered, letter })}"`);
  res.send(pdf);
});

/* ------------------------------------------------------------------ */
/* Parent portal: only letters actually sent to this parent's children */
/* ------------------------------------------------------------------ */

function parentLinkedStudentQuery(req) {
  const parentEmail = (req.user?.email || "").toString().trim();
  if (!parentEmail) return null;
  const escaped = parentEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    school: req.schoolId,
    $or: [
      { "parentInfo.fatherEmail": new RegExp(`^${escaped}$`, "i") },
      { "parentInfo.motherEmail": new RegExp(`^${escaped}$`, "i") },
      { "parentInfo.guardianEmail": new RegExp(`^${escaped}$`, "i") },
    ],
  };
}

function classLabelOf(cls) {
  if (!cls) return "Class";
  return [cls.name, cls.grade ? `Grade ${cls.grade}` : "", cls.section || ""]
    .filter(Boolean)
    .join(" ");
}

/** PARENT: Letters already sent to this parent's own children. */
export const listParentChildLetters = asyncHandler(async (req, res) => {
  const linkedQuery = parentLinkedStudentQuery(req);
  if (!linkedQuery) return res.json({ success: true, data: { letters: [], children: [] } });

  const students = await Student.find(linkedQuery)
    .select("_id firstName lastName")
    .sort({ firstName: 1, lastName: 1 })
    .lean();
  if (!students.length) return res.json({ success: true, data: { letters: [], children: [] } });

  const childId = req.query.childId;
  const scoped = childId
    ? students.filter((student) => String(student._id) === String(childId))
    : students;

  const letters = scoped.length
    ? await NewsletterChildLetter.find({
        school: req.schoolId,
        student: { $in: scoped.map((student) => student._id) },
        status: "approved",
        sentAt: { $ne: null },
      })
        .populate("student", "firstName lastName")
        .populate("class", "name grade section")
        .sort({ sentAt: -1 })
        .limit(100)
        .lean()
    : [];

  res.json({
    success: true,
    data: {
      letters: letters.map((letter) => ({
        _id: letter._id,
        studentId: letter.student?._id,
        studentName: `${letter.student?.firstName || ""} ${letter.student?.lastName || ""}`.trim(),
        classLabel: classLabelOf(letter.class),
        periodStart: letter.periodStart,
        periodEnd: letter.periodEnd,
        sentAt: letter.sentAt,
        wordCount: letter.wordCount || 0,
      })),
      children: students.map((student) => ({
        id: student._id,
        name: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      })),
    },
  });
});

/** Loads one sent letter only if it belongs to this parent's own child. */
async function loadParentOwnedLetter(req) {
  const letter = await NewsletterChildLetter.findById(req.params.id)
    .populate("student", "firstName lastName")
    .lean();
  if (!letter || !letter.sentAt) return { error: 404 };
  if (!letter.student?._id) return { error: 403 };
  const linkedQuery = parentLinkedStudentQuery(req);
  if (!linkedQuery) return { error: 403 };
  const owns = await Student.exists({ ...linkedQuery, _id: letter.student._id });
  if (!owns) return { error: 403 };
  return { letter };
}

/** PARENT: One sent letter, rendered exactly as it was emailed. */
export const getParentChildLetter = asyncHandler(async (req, res) => {
  const { error } = await loadParentOwnedLetter(req);
  if (error === 404) return res.status(404).json({ success: false, message: "Letter not found" });
  if (error) return res.status(403).json({ success: false, message: "Access denied" });

  const { rendered } = await prepareChildLetterEmail({ letterId: req.params.id });
  res.json({
    success: true,
    data: { subject: rendered.subject, htmlContent: rendered.html },
  });
});

/** PARENT: Download one sent letter as a PDF. */
export const downloadParentChildLetterPdf = asyncHandler(async (req, res) => {
  const { error } = await loadParentOwnedLetter(req);
  if (error === 404) return res.status(404).json({ success: false, message: "Letter not found" });
  if (error) return res.status(403).json({ success: false, message: "Access denied" });

  const { pdf, letter, rendered } = await renderChildLetterPdf({ letterId: req.params.id });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${letterPdfFilename({ rendered, letter })}"`);
  res.send(pdf);
});
