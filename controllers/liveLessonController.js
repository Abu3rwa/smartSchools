import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import Class from "../models/Class.js";
import Grade from "../models/Grade.js";
import GradebookColumn from "../models/GradebookColumn.js";
import LiveLesson from "../models/LiveLesson.js";
import LiveLessonFolder from "../models/LiveLessonFolder.js";
import LiveGroup from "../models/LiveGroup.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import School from "../models/School.js";
import Student from "../models/Student.js";
import Subject from "../models/Subject.js";
import Teacher from "../models/Teacher.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parseLiveLessonCsv, serializeLiveLessonCsv } from "../services/liveLessonCsvService.js";
import { assertLiveLessonHtmlSafe } from "../services/liveLessonHtmlSafety.js";
import {
  appendLiveEvent,
  formatRoster,
  getSessionStudents,
  getStateForUser,
  groupIdForStudent,
  groupIdsByStudent,
  isStudentEnrolled,
  listClassStudents,
  resolveLiveSessionSubjectId,
  sanitizeStudentReplayEvents,
  safeSlide,
} from "../services/liveLessonService.js";
import {
  broadcastLiveSessionState,
  closeLiveSessionConnections,
} from "../realtime/liveLessonsGateway.js";
import { resolveSemesterForDate } from "../services/gradebookConfigService.js";
import {
  calculateLiveSessionMark,
  liveAnswerCredit,
  liveAnswerState,
} from "../services/liveSessionGradebookService.js";
import {
  activeLiveSessionDurationMs,
  getSessionPauseAccounting,
  resumeLiveSessionPause,
} from "../services/liveSessionTime.js";
import { buildLiveLessonPerformanceReport } from "../services/liveLessonPerformanceReportService.js";
import liveLessonMarkDraftService, { MAX_DRAFT_ANSWERS } from "../services/liveLessonMarkDraftService.js";
import { generateLiveLessonReportPdf } from "../services/liveLessonReportPdfService.js";
import { normalizeLiveLessonMeetingUrl, sendLiveLessonInvitationEmails } from "../services/liveLessonInvitationService.js";
import { resolveRequestedAcademicYear } from "../utils/academicYear.js";
import { getSchoolTimeZone } from "../helpers/attendanceEligibility.js";
import { buildPortalLink } from "../helpers/portalUrl.js";
import { getTeacherSubjectIds } from "../helpers/teacherScoping.js";
import { staffClassQuery, staffClassesListQuery } from "../helpers/liveLessonAccess.js";
import {
  buildClassMovePatch,
  findBlockingLiveSession,
  lessonAcademicYear,
} from "../helpers/liveLessonYearMove.js";
import { slideImageUrlError } from "../utils/slideImageUrl.js";
import {
  describeLiveAnswerKey,
  describeLiveStudentAnswer,
  normalizeLiveQuestion,
  validateLiveQuestion,
} from "../services/liveLessonQuestionService.js";
import { liveQuestionKind } from "../constants/liveLessonQuestionKinds.js";
import logger from "../utils/logger.js";

const findOwnedSession = async (req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid session ID." });
    return null;
  }
  const session = await LiveSession.findOne({
    _id: req.params.id,
    school: req.schoolId,
  });
  if (!session) {
    res.status(404).json({ success: false, message: "Live session not found." });
    return null;
  }
  const ownsSession = String(session.teacherId) === String(req.user._id);
  if (!ownsSession && !["admin", "department_principal"].includes(req.user.role)) {
    res.status(403).json({ success: false, message: "Only authorized school staff can access this session." });
    return null;
  }
  if (!ownsSession && !(await findTeacherClass(req, session.classId))) {
    res.status(403).json({ success: false, message: "You are not authorized to access this class session." });
    return null;
  }
  return session;
};

const findTeacherClass = async (req, classId) => {
  const access = await staffClassQuery(req.user, req.schoolId, classId, {
    departmentId: req.departmentId || req.user.department?._id || req.user.department,
  });
  if (!access) return null;
  if (access.scope?.wholeSchool) {
    logger.warn("live_lesson_whole_school_principal_access", {
      userId: String(req.user._id),
      classId: String(classId),
      schoolId: String(req.schoolId),
    });
  }
  return Class.findOne(access.query);
};

const normalizeSlideQuestion = (question, salt) =>
  question ? normalizeLiveQuestion(question, { salt }) : undefined;

const normalizeSlides = (slides, saltBase = "lesson") =>
  slides.map((slide, index) => ({
    order: index,
    type: slide.type,
    title: String(slide.title || "").trim(),
    body: String(slide.body || "").trim(),
    html: slide.type === "html" ? String(slide.html || "") : "",
    examples: Array.isArray(slide.examples) ? slide.examples.map((value) => String(value)) : [],
    imageUrl: String(slide.imageUrl || "").trim(),
    speakerNotes: String(slide.speakerNotes || "").trim(),
    ...(slide.question ? { question: normalizeSlideQuestion(slide.question, `${saltBase}:${index}`) } : {}),
    ...(Array.isArray(slide.variants) && slide.variants.length
      ? {
        variants: slide.variants.map((variant, variantIndex) => ({
          groupId: variant.groupId,
          question: normalizeSlideQuestion(variant.question, `${saltBase}:${index}:v${variantIndex}`),
        })),
      }
      : {}),
  }));

const createJoinCode = () =>
  Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)]).join("");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

const deleteOwnedLiveLessonAndHistory = async ({ schoolId, ownerId, lessonId }) => {
  let sessionIds = [];
  let lessonFound = false;
  let liveSessionExists = false;
  let sessionGradesExist = false;
  const transaction = await mongoose.startSession();
  try {
    await transaction.withTransaction(async () => {
      sessionIds = [];
      lessonFound = false;
      liveSessionExists = false;
      sessionGradesExist = false;
      const lesson = await LiveLesson.findOne({
        _id: lessonId,
        school: schoolId,
        ownerId,
      }).session(transaction);
      if (!lesson) return;
      lessonFound = true;
      const sessions = await LiveSession.find({ school: schoolId, lessonId: lesson._id })
        .select("_id status")
        .session(transaction);
      if (sessions.some((session) => session.status === "live")) {
        liveSessionExists = true;
        return;
      }
      sessionIds = sessions.map((session) => session._id);
      if (sessionIds.length) {
        sessionGradesExist = Boolean(await Grade.exists({
          school: schoolId,
          liveSession: { $in: sessionIds },
        }).session(transaction));
        if (sessionGradesExist) return;
        await LiveResponse.deleteMany({ school: schoolId, sessionId: { $in: sessionIds } }, { session: transaction });
        await LiveSessionEvent.deleteMany({ school: schoolId, sessionId: { $in: sessionIds } }, { session: transaction });
        await LiveSession.deleteMany({ school: schoolId, _id: { $in: sessionIds } }, { session: transaction });
      }
      await LiveLessonFolder.updateMany(
        { school: schoolId, ownerId, lessonIds: lesson._id },
        { $pull: { lessonIds: lesson._id } },
        { session: transaction },
      );
      await lesson.deleteOne({ session: transaction });
    });
  } finally {
    await transaction.endSession();
  }

  if (!lessonFound) return { ok: false, statusCode: 404, message: "Lesson not found." };
  if (liveSessionExists) {
    return {
      ok: false,
      statusCode: 409,
      message: "End all live sessions for this lesson before deleting it and its history.",
    };
  }
  if (sessionGradesExist) {
    return {
      ok: false,
      statusCode: 409,
      message: "This lesson has session history linked to gradebook entries. Remove those gradebook entries first, or keep the lesson and session history.",
    };
  }
  sessionIds.forEach((sessionId) => closeLiveSessionConnections(sessionId));
  return { ok: true };
};

const resolveLessonAssignment = async (req, classId, subjectId) => {
  if (!classId && !subjectId) return { classId: null, subjectId: null, subject: "", academicYear: null };
  if (!validId(classId) || !validId(subjectId)) {
    return { error: "Choose both an assigned class and one of that class’s subjects." };
  }
  const classDoc = await findTeacherClass(req, classId);
  if (!classDoc) return { error: "You are not assigned to the selected class." };
  const hasSubject = (classDoc.subjects || []).some(
    (entry) => String(entry.subject?._id || entry.subject) === String(subjectId),
  );
  if (!hasSubject) return { error: "Choose a subject assigned to the selected class." };
  const subject = await Subject.findOne({ _id: subjectId, school: req.schoolId })
    .select("_id name")
    .lean();
  if (!subject) return { error: "The selected class subject was not found." };
  return {
    classId: classDoc._id,
    subjectId: subject._id,
    subject: subject.name,
    academicYear: lessonAcademicYear(classDoc),
  };
};

const validateLessonEdit = ({ title, description, subject, grade, language, slides }) => {
  const errors = [];
  if (!String(title || "").trim() || String(title).trim().length > 200) {
    errors.push({ field: "title", message: "Lesson title is required and must be 200 characters or fewer." });
  }
  if (String(description || "").length > 1000) {
    errors.push({ field: "description", message: "Description must be 1,000 characters or fewer." });
  }
  for (const [field, value, max] of [["subject", subject, 120], ["grade", grade, 80], ["language", language, 20]]) {
    if (String(value || "").length > max) errors.push({ field, message: `Must be ${max} characters or fewer.` });
  }
  if (!Array.isArray(slides) || slides.length < 1 || slides.length > 200) {
    errors.push({ field: "slides", message: "Lessons must contain 1–200 slides." });
    return errors;
  }
  const slideTypes = new Set(["opening", "goals", "content", "examples", "html", "question", "activity", "exit-ticket"]);
  slides.forEach((slide, index) => {
    const row = index + 1;
    if (!slideTypes.has(slide.type)) {
      errors.push({ row, field: "slide type", message: "Unsupported slide type." });
    }
    for (const [field, value, max] of [
      ["title", slide.title, 200],
      ["body", slide.body, 5000],
      ["html", slide.html, 100000],
      ["speaker notes", slide.speakerNotes, 2000],
    ]) {
      if (String(value || "").length > max) {
        errors.push({ row, field, message: `Must be ${max} characters or fewer.` });
      }
    }
    const imageUrlError = slideImageUrlError(slide.imageUrl);
    if (imageUrlError) errors.push({ row, field: "image URL", message: imageUrlError });
    if (Array.isArray(slide.examples) && slide.examples.some((example) => String(example).length > 5000)) {
      errors.push({ row, field: "examples", message: "Each example must be 5,000 characters or fewer." });
    }
    if (slide.type === "question") {
      if (!slide.question) {
        errors.push({ row, field: "question", message: "Question slides need a question." });
      } else {
        errors.push(...validateLiveQuestion(slide.question).map((error) => ({ row, ...error })));
      }
      const variants = Array.isArray(slide.variants) ? slide.variants : [];
      const seenGroups = new Set();
      variants.forEach((variant, variantIndex) => {
        const label = `level ${variantIndex + 1}`;
        if (!variant || !String(variant.groupId || "").trim() || !mongoose.Types.ObjectId.isValid(variant.groupId)) {
          errors.push({ row, field: label, message: "Each levelled question needs to name a group." });
        } else if (seenGroups.has(String(variant.groupId))) {
          errors.push({ row, field: label, message: "A group can only have one levelled question per slide." });
        } else {
          seenGroups.add(String(variant.groupId));
        }
        if (!variant?.question) {
          errors.push({ row, field: `${label} question`, message: "Each levelled question needs question content." });
          return;
        }
        errors.push(...validateLiveQuestion(variant.question, { fieldName: label }).map((error) => ({ row, ...error })));
      });
    } else if (slide.question) {
      errors.push({ row, field: "question", message: "Only question slides can include question data." });
    } else if (Array.isArray(slide.variants) && slide.variants.length) {
      errors.push({ row, field: "levels", message: "Only question slides can include levelled questions." });
    }
    if (slide.type === "html") {
      if (!String(slide.html || "").trim()) errors.push({ row, field: "html", message: "HTML slides need slide content." });
      if (slide.question) errors.push({ row, field: "question", message: "HTML slides cannot include question data." });
    } else if (slide.html) {
      errors.push({ row, field: "html", message: "Only HTML slides can include HTML content." });
    }
  });
  return errors;
};

/** Levelled questions may only target groups the teacher made for the lesson's own class. */
const validateLessonGroupOwnership = async (req, { classId, slides = [] }) => {
  const groupIds = [];
  slides.forEach((slide) => {
    (Array.isArray(slide.variants) ? slide.variants : []).forEach((variant) => {
      const id = String(variant?.groupId || "").trim();
      if (id && mongoose.Types.ObjectId.isValid(id) && !groupIds.includes(id)) groupIds.push(id);
    });
  });
  if (!groupIds.length) return [];
  if (!classId) return [{ field: "levels", message: "Assign the lesson to a class before adding levelled questions." }];
  const found = await LiveGroup.find({ _id: { $in: groupIds }, school: req.schoolId, classId })
    .select("_id")
    .lean();
  if (found.length === groupIds.length) return [];
  return [{ field: "levels", message: "One of the levelled groups does not belong to the selected class." }];
};

const schoolHtmlReviewEnabled = async (schoolId) => {
  const school = await School.findById(schoolId).select("settings.liveLessonHtmlReview.aiReviewEnabled").lean();
  return school?.settings?.liveLessonHtmlReview?.aiReviewEnabled === true;
};

/** An admin, never a teacher, decides whether this school gets suggested marks at all. */
const schoolMarkDraftingEnabled = async (schoolId) => {
  const school = await School.findById(schoolId).select("settings.liveLessonMarkDrafting.aiDraftEnabled").lean();
  return school?.settings?.liveLessonMarkDrafting?.aiDraftEnabled === true;
};

/**
 * A CSV names the group in words the teacher wrote, because a group id only means something inside
 * this school. Names become ids here, and only groups of the imported-to class are accepted.
 */
const resolveLessonVariantGroups = async (req, { classId, slides = [] }) => {
  const named = [];
  slides.forEach((slide, slideIndex) => {
    (Array.isArray(slide.variants) ? slide.variants : []).forEach((variant, variantIndex) => {
      const name = String(variant?.group ?? "").trim();
      if (name) named.push({ variant, name, label: `Slide ${slideIndex + 1}, level ${variantIndex + 1}` });
    });
  });
  if (!named.length) return [];
  if (!classId) return [{ field: "levels", message: "Assign the lesson to a class before adding levelled questions." }];
  const groups = await LiveGroup.find({ school: req.schoolId, classId }).select("_id name").lean();
  const idByName = new Map(groups.map((group) => [String(group.name).trim().toLowerCase(), String(group._id)]));
  const errors = [];
  named.forEach(({ variant, name, label }) => {
    const groupId = idByName.get(name.toLowerCase());
    if (!groupId) {
      errors.push({ field: "levels", message: `${label} names the group "${name}", which this class does not have.` });
      return;
    }
    delete variant.group;
    variant.groupId = groupId;
  });
  return errors;
};

const lessonVariantGroupNames = async (req, slides = []) => {
  const groupIds = slides.flatMap((slide) => (Array.isArray(slide.variants) ? slide.variants : [])
    .map((variant) => variant?.groupId)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id))));
  if (!groupIds.length) return {};
  const groups = await LiveGroup.find({ _id: { $in: groupIds }, school: req.schoolId }).select("_id name").lean();
  return Object.fromEntries(groups.map((group) => [String(group._id), group.name]));
};

export const getLiveLessonSettings = asyncHandler(async (req, res) => {
  return res.json({
    success: true,
    data: {
      aiHtmlReviewEnabled: await schoolHtmlReviewEnabled(req.schoolId),
      aiMarkDraftEnabled: await schoolMarkDraftingEnabled(req.schoolId),
    },
  });
});

export const updateLiveLessonSettings = asyncHandler(async (req, res) => {
  const updates = {};
  if (typeof req.body?.aiHtmlReviewEnabled === "boolean") {
    updates["settings.liveLessonHtmlReview.aiReviewEnabled"] = req.body.aiHtmlReviewEnabled;
  }
  if (typeof req.body?.aiMarkDraftEnabled === "boolean") {
    updates["settings.liveLessonMarkDrafting.aiDraftEnabled"] = req.body.aiMarkDraftEnabled;
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ success: false, message: "Send a live lesson setting to change." });
  }
  const school = await School.findByIdAndUpdate(
    req.schoolId,
    { $set: updates },
    { new: true, runValidators: true },
  ).select("settings.liveLessonHtmlReview.aiReviewEnabled settings.liveLessonMarkDrafting.aiDraftEnabled");
  if (!school) return res.status(404).json({ success: false, message: "School not found." });
  return res.json({
    success: true,
    data: {
      aiHtmlReviewEnabled: school.settings?.liveLessonHtmlReview?.aiReviewEnabled === true,
      aiMarkDraftEnabled: school.settings?.liveLessonMarkDrafting?.aiDraftEnabled === true,
    },
  });
});

export const importLiveLessonCsv = asyncHandler(async (req, res) => {
  const csv = typeof req.body === "string" ? req.body : req.body?.csv;
  const result = parseLiveLessonCsv(csv);
  if (!result.ok) {
    return res.status(400).json({
      success: false,
      message: "The CSV needs changes before it can be imported.",
      errors: result.errors,
    });
  }
  const assignment = await resolveLessonAssignment(req, req.body?.classId, req.body?.subjectId);
  if (assignment.error) return res.status(400).json({ success: false, message: assignment.error });
  if (!assignment.classId) {
    return res.status(400).json({ success: false, message: "Assign the lesson to a class and one of its subjects before importing it." });
  }
  const levelErrors = await resolveLessonVariantGroups(req, { classId: assignment.classId, slides: result.lesson.slides });
  if (levelErrors.length) {
    return res.status(400).json({
      success: false,
      message: "The CSV needs changes before it can be imported.",
      errors: levelErrors,
    });
  }
  await assertLiveLessonHtmlSafe({
    slides: result.lesson.slides,
    aiReviewEnabled: await schoolHtmlReviewEnabled(req.schoolId),
  });
  const lesson = await LiveLesson.create({
    school: req.schoolId,
    ownerId: req.user._id,
    ...result.lesson,
    classId: assignment.classId,
    academicYear: assignment.academicYear,
    subjectId: assignment.subjectId,
    subject: assignment.subject || result.lesson.subject,
    slides: normalizeSlides(result.lesson.slides),
  });
  return res.status(201).json({
    success: true,
    data: {
      lesson,
      matchedColumns: result.matchedColumns,
    },
  });
});

export const previewLiveLessonCsv = asyncHandler(async (req, res) => {
  const csv = typeof req.body === "string" ? req.body : req.body?.csv;
  const result = parseLiveLessonCsv(csv);
  if (!result.ok) {
    return res.status(400).json({
      success: false,
      message: "The CSV needs changes before it can be imported.",
      errors: result.errors,
    });
  }
  return res.json({
    success: true,
    data: { lesson: result.lesson, matchedColumns: result.matchedColumns },
  });
});

export const createLiveLesson = asyncHandler(async (req, res) => {
  const { title, description, subject, grade, language, slides, classId, subjectId } = req.body || {};
  const errors = validateLessonEdit({ title, description, subject, grade, language, slides });
  if (errors.length) {
    return res.status(400).json({ success: false, message: "Lesson changes are invalid.", errors });
  }
  const assignment = await resolveLessonAssignment(req, classId, subjectId);
  if (assignment.error) return res.status(400).json({ success: false, message: assignment.error });
  if (!assignment.classId) {
    return res.status(400).json({ success: false, message: "Assign the lesson to a class and one of its subjects before saving it." });
  }
  const groupErrors = await validateLessonGroupOwnership(req, { classId: assignment.classId, slides });
  if (groupErrors.length) {
    return res.status(400).json({ success: false, message: "Lesson changes are invalid.", errors: groupErrors });
  }
  await assertLiveLessonHtmlSafe({
    slides,
    aiReviewEnabled: await schoolHtmlReviewEnabled(req.schoolId),
  });
  const lesson = await LiveLesson.create({
    school: req.schoolId,
    ownerId: req.user._id,
    classId: assignment.classId,
    academicYear: assignment.academicYear,
    subjectId: assignment.subjectId,
    source: "csv",
    title: String(title).trim(),
    description: String(description || "").trim(),
    subject: assignment.subject || String(req.body.subject || "").trim(),
    grade: String(req.body.grade || "").trim(),
    language: String(req.body.language || "en").trim(),
    isDone: req.body.isDone === true,
    slides: normalizeSlides(slides, "csv"),
  });
  return res.status(201).json({ success: true, data: { lesson } });
});

export const exportLiveLessonCsv = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lesson ID." });
  const lesson = await LiveLesson.findOne({
    _id: req.params.id,
    school: req.schoolId,
    ownerId: req.user._id,
  })
    .populate("classId", "name")
    .populate("subjectId", "name")
    .lean();
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found." });

  const csv = serializeLiveLessonCsv(lesson, { groupNames: await lessonVariantGroupNames(req, lesson.slides) });
  const safeTitle = String(lesson.title || "lesson").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "lesson";
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="live-lesson-${safeTitle}.csv"`,
    "Cache-Control": "private, no-store, max-age=0",
  });
  return res.send(`\uFEFF${csv}`);
});

export const listLiveLessons = asyncHandler(async (req, res) => {
  // The library grid pages and filters on the client, so no limit means "the whole
  // library" exactly as before; callers that want a bounded page can ask for one.
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(1, requestedLimit))
    : null;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pipeline = [
    {
      $match: {
        school: new mongoose.Types.ObjectId(String(req.schoolId)),
        ownerId: new mongoose.Types.ObjectId(String(req.user._id)),
      },
    },
    { $sort: { updatedAt: -1 } },
    {
      $project: {
        title: 1,
        description: 1,
        subject: 1,
        subjectId: 1,
        classId: 1,
        academicYear: 1,
        grade: 1,
        language: 1,
        isDone: 1,
        createdAt: 1,
        updatedAt: 1,
        slideCount: { $size: { $ifNull: ["$slides", []] } },
      },
    },
  ];
  if (limit) pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });
  const rows = await LiveLesson.aggregate(pipeline);

  const classIds = [...new Set(rows.map((row) => String(row.classId || "")).filter(Boolean))];
  const subjectIds = [...new Set(rows.map((row) => String(row.subjectId || "")).filter(Boolean))];
  const [classes, subjects, total] = await Promise.all([
    classIds.length
      ? Class.find({ _id: { $in: classIds }, school: req.schoolId }).select("name academicYear").lean()
      : [],
    subjectIds.length
      ? Subject.find({ _id: { $in: subjectIds }, school: req.schoolId }).select("name").lean()
      : [],
    LiveLesson.countDocuments({ school: req.schoolId, ownerId: req.user._id }),
  ]);
  const classNames = new Map(classes.map((doc) => [String(doc._id), doc.name]));
  const classYears = new Map(classes.map((doc) => [String(doc._id), doc.academicYear || null]));
  const subjectNames = new Map(subjects.map((doc) => [String(doc._id), doc.name]));
  const reference = (id, names) =>
    id && names.has(String(id)) ? { _id: String(id), name: names.get(String(id)) || "" } : null;
  const lessons = rows.map((row) => ({
    ...row,
    _id: String(row._id),
    classId: reference(row.classId, classNames),
    subjectId: reference(row.subjectId, subjectNames),
    // Lessons written before academicYear existed inherit it from their class, so
    // the library can group by year without a migration touching every school.
    academicYear: row.academicYear || classYears.get(String(row.classId || "")) || null,
  }));

  return res.json({
    success: true,
    data: {
      lessons,
      pagination: limit
        ? { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
        : { page: 1, limit: total, total, pages: 1 },
    },
  });
});

export const listLiveLessonFolders = asyncHandler(async (req, res) => {
  const folders = await LiveLessonFolder.find({
    school: req.schoolId,
    ownerId: req.user._id,
  })
    .sort({ parentId: 1, sortOrder: 1, name: 1 })
    .lean();
  return res.json({ success: true, data: { folders } });
});

export const createLiveLessonFolder = asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const parentId = req.body?.parentId || null;
  if (!name || name.length > 100) {
    return res.status(400).json({ success: false, message: "Folder names must be between 1 and 100 characters." });
  }
  if (parentId && !validId(parentId)) {
    return res.status(400).json({ success: false, message: "Choose a valid parent folder." });
  }
  if (parentId && !await LiveLessonFolder.exists({
    _id: parentId,
    school: req.schoolId,
    ownerId: req.user._id,
  })) {
    return res.status(404).json({ success: false, message: "Parent folder not found." });
  }
  const sortOrder = await LiveLessonFolder.countDocuments({
    school: req.schoolId,
    ownerId: req.user._id,
    parentId,
  });
  const folder = await LiveLessonFolder.create({
    school: req.schoolId,
    ownerId: req.user._id,
    name,
    parentId,
    sortOrder,
  });
  return res.status(201).json({ success: true, data: { folder } });
});

export const updateLiveLessonFolder = asyncHandler(async (req, res) => {
  if (!validId(req.params.folderId)) {
    return res.status(400).json({ success: false, message: "Invalid folder ID." });
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 100) {
    return res.status(400).json({ success: false, message: "Folder names must be between 1 and 100 characters." });
  }
  const folder = await LiveLessonFolder.findOneAndUpdate(
    { _id: req.params.folderId, school: req.schoolId, ownerId: req.user._id },
    { $set: { name } },
    { new: true, runValidators: true },
  );
  if (!folder) return res.status(404).json({ success: false, message: "Folder not found." });
  return res.json({ success: true, data: { folder } });
});

export const deleteLiveLessonFolder = asyncHandler(async (req, res) => {
  if (!validId(req.params.folderId)) {
    return res.status(400).json({ success: false, message: "Invalid folder ID." });
  }
  const folder = await LiveLessonFolder.findOne({
    _id: req.params.folderId,
    school: req.schoolId,
    ownerId: req.user._id,
  });
  if (!folder) return res.status(404).json({ success: false, message: "Folder not found." });
  const hasChildren = await LiveLessonFolder.exists({
    school: req.schoolId,
    ownerId: req.user._id,
    parentId: folder._id,
  });
  if (hasChildren || folder.lessonIds.length) {
    return res.status(409).json({
      success: false,
      message: "Remove subfolders and lesson shortcuts before deleting this folder.",
    });
  }
  const deletion = await LiveLessonFolder.deleteOne({
    _id: folder._id,
    school: req.schoolId,
    ownerId: req.user._id,
    lessonIds: { $size: 0 },
  });
  if (!deletion.deletedCount) {
    return res.status(409).json({
      success: false,
      message: "Folder contents changed. Remove subfolders and lesson shortcuts before deleting it.",
    });
  }
  return res.json({ success: true, message: "Empty folder deleted." });
});

export const addLiveLessonFolderShortcut = asyncHandler(async (req, res) => {
  const { folderId, lessonId } = req.params;
  if (!validId(folderId) || !validId(lessonId)) {
    return res.status(400).json({ success: false, message: "Choose a valid folder and lesson." });
  }
  const [folder, lesson] = await Promise.all([
    LiveLessonFolder.findOne({ _id: folderId, school: req.schoolId, ownerId: req.user._id }),
    LiveLesson.findOne({ _id: lessonId, school: req.schoolId, ownerId: req.user._id }).select("_id"),
  ]);
  if (!folder) return res.status(404).json({ success: false, message: "Folder not found." });
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found." });
  await LiveLessonFolder.updateOne(
    { _id: folder._id, school: req.schoolId, ownerId: req.user._id },
    { $addToSet: { lessonIds: lesson._id } },
  );
  return res.json({ success: true, message: "Lesson shortcut added to folder." });
});

export const removeLiveLessonFolderShortcut = asyncHandler(async (req, res) => {
  const { folderId, lessonId } = req.params;
  if (!validId(folderId) || !validId(lessonId)) {
    return res.status(400).json({ success: false, message: "Choose a valid folder and lesson." });
  }
  const folder = await LiveLessonFolder.findOneAndUpdate(
    { _id: folderId, school: req.schoolId, ownerId: req.user._id },
    { $pull: { lessonIds: lessonId } },
    { new: true },
  ).select("_id");
  if (!folder) return res.status(404).json({ success: false, message: "Folder not found." });
  return res.json({ success: true, message: "Lesson shortcut removed. The lesson itself was not changed." });
});

export const reorderLiveLessonFolderShortcuts = asyncHandler(async (req, res) => {
  const { folderId } = req.params;
  const lessonIds = req.body?.lessonIds;
  if (!validId(folderId) || !Array.isArray(lessonIds) ||
    lessonIds.some((id) => typeof id !== "string" || !validId(id)) ||
    new Set(lessonIds).size !== lessonIds.length) {
    return res.status(400).json({ success: false, message: "Submit the unique lesson IDs in this folder's new order." });
  }
  const folder = await LiveLessonFolder.findOne({
    _id: folderId,
    school: req.schoolId,
    ownerId: req.user._id,
  });
  if (!folder) return res.status(404).json({ success: false, message: "Folder not found." });
  const currentIds = folder.lessonIds.map(String);
  if (lessonIds.length !== currentIds.length ||
    lessonIds.some((id) => !currentIds.includes(id))) {
    return res.status(400).json({ success: false, message: "Folder contents changed. Refresh and try reordering again." });
  }
  folder.lessonIds = lessonIds;
  await folder.save();
  return res.json({ success: true, message: "Folder lesson order saved." });
});

export const reorderLiveLessonFolders = asyncHandler(async (req, res) => {
  const parentId = req.body?.parentId || null;
  const folderIds = req.body?.folderIds;
  if ((parentId && !validId(parentId)) || !Array.isArray(folderIds) ||
    folderIds.some((id) => typeof id !== "string" || !validId(id)) ||
    new Set(folderIds).size !== folderIds.length) {
    return res.status(400).json({ success: false, message: "Submit the unique sibling folder IDs in their new order." });
  }
  if (parentId && !await LiveLessonFolder.exists({
    _id: parentId,
    school: req.schoolId,
    ownerId: req.user._id,
  })) {
    return res.status(404).json({ success: false, message: "Parent folder not found." });
  }
  const siblings = await LiveLessonFolder.find({
    school: req.schoolId,
    ownerId: req.user._id,
    parentId,
  }).select("_id").lean();
  const currentIds = siblings.map((folder) => String(folder._id));
  if (folderIds.length !== currentIds.length ||
    folderIds.some((id) => !currentIds.includes(id))) {
    return res.status(400).json({ success: false, message: "Folder structure changed. Refresh and try reordering again." });
  }
  await LiveLessonFolder.bulkWrite(folderIds.map((folderId, sortOrder) => ({
    updateOne: {
      filter: { _id: folderId, school: req.schoolId, ownerId: req.user._id },
      update: { $set: { sortOrder } },
    },
  })));
  return res.json({ success: true, message: "Folder order saved." });
});

export const getLiveLesson = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lesson ID." });
  const lesson = await LiveLesson.findOne({
    _id: req.params.id,
    school: req.schoolId,
    ownerId: req.user._id,
  });
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found." });
  return res.json({ success: true, data: { lesson } });
});

export const updateLiveLesson = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lesson ID." });
  const lesson = await LiveLesson.findOne({
    _id: req.params.id,
    school: req.schoolId,
    ownerId: req.user._id,
  });
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found." });
  const { title, description, subject, grade, language, slides } = req.body || {};
  const nextClassId = req.body?.classId === undefined
    ? lesson.classId
    : req.body.classId || null;
  const nextSubjectId = req.body?.subjectId === undefined
    ? lesson.subjectId
    : req.body.subjectId || null;
  const assignment = await resolveLessonAssignment(req, nextClassId, nextSubjectId);
  if (assignment.error) return res.status(400).json({ success: false, message: assignment.error });
  const next = {
    title: title === undefined ? lesson.title : title,
    description: description === undefined ? lesson.description : description,
    subject: assignment.classId ? assignment.subject : subject === undefined ? lesson.subject : subject,
    grade: grade === undefined ? lesson.grade : grade,
    language: language === undefined ? lesson.language : language,
    slides: slides === undefined ? lesson.slides : slides,
  };
  const errors = validateLessonEdit(next);
  if (errors.length) {
    return res.status(400).json({ success: false, message: "Lesson changes are invalid.", errors });
  }
  const groupErrors = await validateLessonGroupOwnership(req, { classId: assignment.classId, slides: next.slides });
  if (groupErrors.length) {
    return res.status(400).json({ success: false, message: "Lesson changes are invalid.", errors: groupErrors });
  }
  await assertLiveLessonHtmlSafe({
    slides: next.slides,
    aiReviewEnabled: await schoolHtmlReviewEnabled(req.schoolId),
  });
  lesson.title = String(next.title).trim();
  lesson.classId = assignment.classId;
  lesson.academicYear = assignment.academicYear;
  lesson.subjectId = assignment.subjectId;
  lesson.description = String(next.description || "").trim();
  lesson.subject = String(next.subject || "").trim();
  lesson.grade = String(next.grade || "").trim();
  lesson.language = String(next.language || "en").trim();
  if (slides !== undefined) lesson.slides = normalizeSlides(next.slides, String(lesson._id));
  await lesson.save();
  return res.json({ success: true, data: { lesson } });
});

// Offer the classes this user may move the lesson into, across every academic
// year. The portal's class list is filtered to the active year, which is exactly
// the year the teacher is leaving, so the move picker cannot use it.
export const listLiveLessonMoveTargets = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lesson ID." });
  const lesson = await LiveLesson.findOne({
    _id: req.params.id,
    school: req.schoolId,
    ownerId: req.user._id,
  });
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found." });
  const query = await staffClassesListQuery(req.user, req.schoolId, {
    departmentId: req.departmentId || req.user.department?._id || req.user.department,
  });
  if (!query) return res.status(403).json({ success: false, message: "You are not assigned to any class." });
  const classes = await Class.find(query)
    .select("name grade section academicYear subjects")
    .sort({ academicYear: -1, grade: 1, section: 1 })
    .lean();
  const currentClassId = String(lesson.classId || "");
  const currentClass = classes.find((classDoc) => String(classDoc._id) === currentClassId) || null;
  const targets = classes.map((classDoc) => ({
    _id: String(classDoc._id),
    name: classDoc.name,
    grade: classDoc.grade ?? null,
    section: classDoc.section || "",
    academicYear: classDoc.academicYear || null,
    isCurrentClass: String(classDoc._id) === currentClassId,
    subjectCleared: String(classDoc._id) === currentClassId
      ? false
      : buildClassMovePatch(lesson, classDoc).subjectCleared,
  }));
  const blocking = await findBlockingLiveSession(lesson._id);
  return res.json({
    success: true,
    data: {
      lesson: {
        _id: String(lesson._id),
        title: lesson.title,
        // Lessons filed before academicYear existed read their year off the class.
        academicYear: lesson.academicYear || currentClass?.academicYear || null,
        classId: currentClassId || null,
      },
      academicYears: [...new Set(targets.map((target) => target.academicYear).filter(Boolean))].sort().reverse(),
      targets,
      canMove: !blocking,
      blockingSessionStatus: blocking?.status || null,
    },
  });
});

// Move a lesson to another class, which is how a teacher carries it into the
// next academic year after rollover copies the classes. The lesson keeps its
// slides and history; only the class anchor and the year it is filed under move.
export const moveLiveLessonYear = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lesson ID." });
  const targetClassId = req.body?.classId;
  if (!validId(targetClassId)) {
    return res.status(400).json({ success: false, message: "Choose the class to move this lesson into." });
  }
  const lesson = await LiveLesson.findOne({
    _id: req.params.id,
    school: req.schoolId,
    ownerId: req.user._id,
  });
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found." });
  if (String(lesson.classId || "") === String(targetClassId)) {
    return res.status(400).json({ success: false, message: "This lesson is already assigned to that class." });
  }
  // A teacher can only move a lesson into a class they teach, which is the same
  // rule as assigning it in the editor. Freshly copied next-year classes have no
  // teachers yet, so the school assigns the teacher before the lesson can follow.
  const targetClass = await findTeacherClass(req, targetClassId);
  if (!targetClass) {
    return res.status(403).json({ success: false, message: "You are not assigned to that class." });
  }
  const blocking = await findBlockingLiveSession(lesson._id);
  if (blocking) {
    return res.status(409).json({
      success: false,
      message: "End or delete this lesson’s scheduled or live session before moving it to another year.",
    });
  }
  const { patch, subjectCleared } = buildClassMovePatch(lesson, targetClass);
  lesson.set(patch);
  await lesson.save();
  await lesson.populate("classId", "name academicYear");
  return res.json({
    success: true,
    message: subjectCleared
      ? `Lesson moved to ${targetClass.name}. Its subject link was cleared because that class does not teach the subject yet.`
      : `Lesson moved to ${targetClass.name}.`,
    data: { lesson, subjectCleared },
  });
});

export const setLiveLessonDone = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lesson ID." });
  if (typeof req.body?.isDone !== "boolean") {
    return res.status(400).json({ success: false, message: "isDone must be true or false." });
  }
  const lesson = await LiveLesson.findOneAndUpdate(
    { _id: req.params.id, school: req.schoolId, ownerId: req.user._id },
    { $set: { isDone: req.body.isDone } },
    { new: true, runValidators: true },
  ).select("_id isDone");
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found." });
  return res.json({ success: true, data: { lesson } });
});

export const deleteLiveLesson = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lesson ID." });
  const result = await deleteOwnedLiveLessonAndHistory({
    schoolId: req.schoolId,
    ownerId: req.user._id,
    lessonId: req.params.id,
  });
  if (!result.ok) return res.status(result.statusCode).json({ success: false, message: result.message });
  return res.json({ success: true, message: "Lesson and associated session history deleted." });
});

export const bulkDeleteLiveLessons = asyncHandler(async (req, res) => {
  const lessonIds = req.body?.lessonIds;
  if (!Array.isArray(lessonIds) || lessonIds.length < 1 || lessonIds.length > 100
    || lessonIds.some((id) => typeof id !== "string" || !validId(id))
    || new Set(lessonIds).size !== lessonIds.length) {
    return res.status(400).json({
      success: false,
      message: "Choose between 1 and 100 unique valid lessons to delete.",
    });
  }

  const deletedIds = [];
  const failures = [];
  for (const lessonId of lessonIds) {
    const result = await deleteOwnedLiveLessonAndHistory({
      schoolId: req.schoolId,
      ownerId: req.user._id,
      lessonId,
    });
    if (result.ok) deletedIds.push(lessonId);
    else failures.push({ lessonId, statusCode: result.statusCode, message: result.message });
  }
  return res.json({
    success: true,
    data: { deletedIds, failures },
    message: `${deletedIds.length} lesson${deletedIds.length === 1 ? "" : "s"} deleted; ${failures.length} could not be deleted.`,
  });
});

export const createLiveSession = asyncHandler(async (req, res) => {
  const {
    lessonId,
    classId,
    scheduledAt,
    timerDurationMinutes = 0,
    meetingUrl: requestedMeetingUrl = "",
    sendInvitationEmail = false,
  } = req.body || {};
  if (!validId(lessonId) || !validId(classId)) {
    return res.status(400).json({ success: false, message: "Choose a valid lesson and class." });
  }
  if (typeof sendInvitationEmail !== "boolean") {
    return res.status(400).json({ success: false, message: "Choose whether to email the student invitations." });
  }
  let meetingUrl;
  try {
    meetingUrl = normalizeLiveLessonMeetingUrl(requestedMeetingUrl);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  if (!Number.isInteger(timerDurationMinutes) || timerDurationMinutes < 0 || timerDurationMinutes > 240) {
    return res.status(400).json({ success: false, message: "Timer duration must be between 0 and 240 whole minutes." });
  }
  let scheduleDate;
  if (scheduledAt !== undefined && scheduledAt !== null && scheduledAt !== "") {
    scheduleDate = new Date(scheduledAt);
    if (Number.isNaN(scheduleDate.getTime()) || scheduleDate <= new Date()) {
      return res.status(400).json({ success: false, message: "Choose a scheduled time in the future." });
    }
  }
  const [lesson, classDoc] = await Promise.all([
    LiveLesson.findOne({ _id: lessonId, school: req.schoolId, ownerId: req.user._id }),
    findTeacherClass(req, classId),
  ]);
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found or not owned by you." });
  if (!classDoc) return res.status(403).json({ success: false, message: "You are not assigned to that class." });
  await classDoc.populate("subjects.subject", "name");
  const canonicalSubjectId = resolveLiveSessionSubjectId(lesson, classDoc.subjects || []);
  const rosterSnapshot = (await listClassStudents(classDoc._id)).map((student) => ({
    studentId: String(student.user?._id || ""),
    name: `${student.firstName} ${student.lastName}`.trim(),
  })).filter((student) => student.studentId);

  let joinCode;
  let exists = true;
  for (let attempt = 0; attempt < 8 && exists; attempt += 1) {
    joinCode = createJoinCode();
    exists = Boolean(await LiveSession.exists({ joinCode }));
  }
  if (exists) throw new Error("Unable to generate a unique lesson join code.");

  const session = await LiveSession.create({
    school: req.schoolId,
    lessonId: lesson._id,
    lessonSnapshot: {
      title: lesson.title,
      description: lesson.description,
      subject: lesson.subject || "",
      subjectId: canonicalSubjectId,
      grade: lesson.grade || "",
      language: lesson.language || "en",
      slides: lesson.slides.map((slide) => slide.toObject()),
    },
    rosterSnapshot,
    rosterCapturedAt: new Date(),
    classId: classDoc._id,
    teacherId: req.user._id,
    ...(scheduleDate ? { scheduledAt: scheduleDate } : {}),
    meetingUrl,
    timerDurationMinutes,
    joinCode,
  });
  await appendLiveEvent(session, "session:created", { role: req.user.role, userId: req.user._id });
  let invitationEmail;
  if (sendInvitationEmail) {
    const sessionUrl = buildPortalLink(`/live-lessons/sessions/${session._id}`);
    try {
      invitationEmail = await sendLiveLessonInvitationEmails({
        session,
        roster: await Student.find({
          school: req.schoolId,
          $or: [{ currentClass: classDoc._id }, { enrolledClasses: classDoc._id }],
        })
          .select("user email studentEmail")
          .populate("user", "_id email")
          .lean(),
        teacherName: req.user.name || req.user.firstName || "Your teacher",
        className: classDoc.name || "your class",
        sessionUrl,
        timeZone: await getSchoolTimeZone(req.schoolId),
      });
    } catch (error) {
      logger.error("live_lesson_invitation_email_failed", {
        sessionId: String(session._id),
        error: error.message,
      });
      invitationEmail = { requested: true, sent: 0, failed: 0, skipped: 0, error: "Invitation emails could not be prepared." };
    }
  }
  return res.status(201).json({
    success: true,
    data: {
      session: {
        _id: session._id,
        status: session.status,
        joinCode: session.joinCode,
        classId: session.classId,
        lessonTitle: lesson.title,
        scheduledAt: session.scheduledAt,
        meetingUrl: session.meetingUrl,
        timerDurationMinutes: session.timerDurationMinutes,
      },
      ...(invitationEmail ? { invitationEmail } : {}),
    },
  });
});

export const listLiveSessions = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const search = String(req.query.search || "").trim();
  if (search.length > 100) {
    return res.status(400).json({ success: false, message: "Session search must be 100 characters or fewer." });
  }
  const requestedStatus = String(req.query.status || "");
  if (requestedStatus && !["waiting", "live", "ended"].includes(requestedStatus)) {
    return res.status(400).json({ success: false, message: "Invalid session status filter." });
  }
  const isDateOnly = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dateFrom = req.query.dateFrom && isDateOnly(req.query.dateFrom)
    ? new Date(`${req.query.dateFrom}T00:00:00.000Z`)
    : null;
  const dateTo = req.query.dateTo && isDateOnly(req.query.dateTo)
    ? new Date(`${req.query.dateTo}T23:59:59.999Z`)
    : null;
  if ((dateFrom && Number.isNaN(dateFrom.getTime())) || (dateTo && Number.isNaN(dateTo.getTime()))) {
    return res.status(400).json({ success: false, message: "Enter valid session history dates." });
  }
  if ((req.query.dateFrom && !dateFrom) || (req.query.dateTo && !dateTo) ||
    (dateFrom && dateFrom.toISOString().slice(0, 10) !== req.query.dateFrom) ||
    (dateTo && dateTo.toISOString().slice(0, 10) !== req.query.dateTo)) {
    return res.status(400).json({ success: false, message: "Enter valid session history dates." });
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return res.status(400).json({ success: false, message: "The start date must not be after the end date." });
  }
  const filter = { school: req.schoolId };
  if (req.user.role === "teacher") {
    filter.teacherId = req.user._id;
  }
  if (req.user.role === "department_principal") {
    if (!req.departmentId) {
      return res.status(403).json({ success: false, message: "Department scope is required to view live sessions." });
    }
    filter.classId = { $in: await Class.find({
      school: req.schoolId,
      department: req.departmentId,
    }).distinct("_id") };
  }
  if (req.query.classId) {
    if (!validId(req.query.classId)) {
      return res.status(400).json({ success: false, message: "Invalid class filter." });
    }
    const authorizedClass = await findTeacherClass(req, req.query.classId);
    if (!authorizedClass) {
      return res.status(403).json({ success: false, message: "You are not assigned to that class." });
    }
    if (req.user.role === "department_principal" && !filter.classId.$in.some((id) => String(id) === String(authorizedClass._id))) {
      return res.status(403).json({ success: false, message: "You are not assigned to that class." });
    }
    filter.classId = authorizedClass._id;
  }
  if (req.query.subject === "__unknown__") {
    filter["lessonSnapshot.subjectId"] = { $in: ["", null] };
  } else if (req.query.subject) {
    const requestedSubject = String(req.query.subject).trim();
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ user: req.user._id, school: req.schoolId })
        .select("_id")
        .lean();
      const assignedSubjectIds = teacher ? await getTeacherSubjectIds(teacher._id) : [];
      const requestedSubjectId = validId(requestedSubject)
        ? requestedSubject
        : String((await Subject.findOne({
            school: req.schoolId,
            name: requestedSubject,
          }).select("_id").lean())?._id || "");
      if (!assignedSubjectIds.some((id) => String(id) === requestedSubjectId)) {
        return res.status(403).json({ success: false, message: "You are not assigned to that subject." });
      }
    }
    if (validId(requestedSubject)) {
      const subject = await Subject.findOne({ _id: requestedSubject, school: req.schoolId }).select("name").lean();
      if (!subject) return res.status(400).json({ success: false, message: "Invalid subject filter." });
      filter.$or = [
        { "lessonSnapshot.subjectId": requestedSubject },
        { "lessonSnapshot.subjectId": { $in: ["", null] }, "lessonSnapshot.subject": subject.name },
      ];
    } else {
      filter["lessonSnapshot.subject"] = requestedSubject;
    }
  }
  if (requestedStatus) filter.status = requestedStatus;
  if (dateFrom || dateTo) {
    const dateBoundary = {
      ...(dateFrom ? { $gte: dateFrom } : {}),
      ...(dateTo ? { $lte: dateTo } : {}),
    };
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { status: "waiting", scheduledAt: dateBoundary },
          { status: "waiting", scheduledAt: { $exists: false }, createdAt: dateBoundary },
          { status: { $in: ["live", "ended"] }, startedAt: dateBoundary },
          { status: { $in: ["live", "ended"] }, startedAt: { $exists: false }, createdAt: dateBoundary },
        ],
      },
    ];
  }
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchConditions = [
      { "lessonSnapshot.title": { $regex: escapedSearch, $options: "i" } },
      { "lessonSnapshot.subject": { $regex: escapedSearch, $options: "i" } },
      { joinCode: { $regex: escapedSearch, $options: "i" } },
    ];
    const accessibleClassFilter = filter.classId;
    const accessibleClassIds = accessibleClassFilter
      ? accessibleClassFilter.$in || [accessibleClassFilter]
      : undefined;
    const matchingClasses = await Class.find({
      school: req.schoolId,
      ...(accessibleClassIds ? { _id: { $in: accessibleClassIds } } : {}),
      name: { $regex: escapedSearch, $options: "i" },
    }).distinct("_id");
    if (matchingClasses.length) searchConditions.push({ classId: { $in: matchingClasses } });
    filter.$and = [...(filter.$and || []), { $or: searchConditions }];
  }
  const [sessions, total] = await Promise.all([
    LiveSession.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .select("lessonSnapshot.title lessonSnapshot.subject lessonSnapshot.subjectId classId teacherId status joinCode currentSlideIndex createdAt scheduledAt timerDurationMinutes startedAt endedAt paused pausedAt totalPausedMs")
    .populate("classId", "name grade section")
    .lean(),
    LiveSession.countDocuments(filter),
  ]);
  const pauseEvents = sessions.length
    ? await LiveSessionEvent.find({
      school: req.schoolId,
      sessionId: { $in: sessions.map((session) => session._id) },
      type: { $in: ["session:paused", "session:resumed", "session:ended"] },
    }).select("sessionId type at").sort({ at: 1 }).lean()
    : [];
  const pauseEventsBySession = new Map();
  for (const event of pauseEvents) {
    const sessionId = String(event.sessionId);
    const events = pauseEventsBySession.get(sessionId) || [];
    events.push(event);
    pauseEventsBySession.set(sessionId, events);
  }
  const sessionsWithPauseAccounting = sessions.map((session) => {
    const storedPausedMs = Number(session.totalPausedMs) || 0;
    if (storedPausedMs > 0 || session.pausedAt) return session;
    const accounting = getSessionPauseAccounting(pauseEventsBySession.get(String(session._id)));
    return {
      ...session,
      totalPausedMs: accounting.totalPausedMs,
      pausedAt: accounting.pausedAt,
    };
  });
  return res.json({
    success: true,
    data: { sessions: sessionsWithPauseAccounting, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
});

export const endLiveSession = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  if (String(session.teacherId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: "Only the session owner can end this live lesson." });
  }
  if (session.status !== "live") {
    return res.status(409).json({ success: false, message: "Only a live session can be ended." });
  }

  const endedSession = await LiveSession.findOneAndUpdate(
    {
      _id: session._id,
      school: req.schoolId,
      teacherId: req.user._id,
      status: "live",
    },
    {
      $set: {
        status: "ended",
        endedAt: new Date(),
        questionOpen: false,
        studentsFullscreen: false,
      },
    },
    { new: true },
  );
  if (!endedSession) {
    return res.status(409).json({ success: false, message: "This session has already ended." });
  }
  resumeLiveSessionPause(endedSession, endedSession.endedAt);
  await endedSession.save();

  await appendLiveEvent(endedSession, "session:ended", {
    role: req.user.role,
    userId: req.user._id,
  });
  await broadcastLiveSessionState(endedSession);
  return res.json({ success: true, data: { session: endedSession } });
});

export const listAvailableLiveSessions = asyncHandler(async (req, res) => {
  const student = await Student.findOne({
    school: req.schoolId,
    user: req.user._id,
  })
    .select("currentClass enrolledClasses")
    .lean();

  const classIds = [...new Set([
    student?.currentClass,
    ...(student?.enrolledClasses || []),
  ].filter(Boolean).map(String))];

  if (!classIds.length) {
    return res.json({ success: true, data: { sessions: [], replays: [] } });
  }

  const [sessions, replays] = await Promise.all([
    LiveSession.find({
      school: req.schoolId,
      classId: { $in: classIds },
      status: "live",
    })
      .sort({ startedAt: -1 })
      .select("lessonSnapshot.title lessonSnapshot.slides._id classId currentSlideIndex startedAt")
      .populate("classId", "name grade section")
      .lean(),
    LiveSession.find({
      school: req.schoolId,
      classId: { $in: classIds },
      status: "ended",
      replayAvailable: true,
    })
      .sort({ endedAt: -1, _id: -1 })
      .limit(50)
      .select("lessonSnapshot.title classId startedAt endedAt")
      .populate("classId", "name grade section")
      .lean(),
  ]);

  return res.json({
    success: true,
    data: {
      sessions: sessions.map((session) => ({
        _id: String(session._id),
        title: session.lessonSnapshot?.title || "Live lesson",
        classId: session.classId,
        currentSlideIndex: session.currentSlideIndex,
        totalSlides: session.lessonSnapshot?.slides?.length || 0,
        startedAt: session.startedAt,
      })),
      replays: replays.map((session) => ({
        _id: String(session._id),
        title: session.lessonSnapshot?.title || "Live lesson",
        classId: session.classId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      })),
    },
  });
});

export const joinLiveSessionById = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid session ID." });
  }
  const session = await LiveSession.findOne({
    _id: req.params.id,
    school: req.schoolId,
  }).select("_id classId status");
  if (!session) return res.status(404).json({ success: false, message: "Live session not found." });
  if (!(await isStudentEnrolled(session.classId, req.user._id))) {
    return res.status(403).json({ success: false, message: "You are not enrolled in this session's class." });
  }
  if (session.status !== "live") {
    return res.status(409).json({ success: false, message: "This lesson is not currently live." });
  }
  return res.json({ success: true, data: { sessionId: String(session._id) } });
});

export const joinLiveSession = asyncHandler(async (req, res) => {
  const joinCode = String(req.body?.joinCode || "").trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(joinCode)) {
    return res.status(400).json({ success: false, message: "Enter the six-character lesson code." });
  }
  const session = await LiveSession.findOne({ joinCode, school: req.schoolId });
  if (!session) return res.status(404).json({ success: false, message: "Lesson code not found." });
  if (session.status === "ended") return res.status(409).json({ success: false, message: "This lesson session has ended." });
  if (!(await isStudentEnrolled(session.classId, req.user._id))) {
    return res.status(403).json({ success: false, message: "You are not enrolled in this session's class." });
  }
  return res.json({ success: true, data: { sessionId: String(session._id) } });
});

export const getLiveSession = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid session ID." });
  const session = await LiveSession.findOne({ _id: req.params.id, school: req.schoolId });
  if (!session) return res.status(404).json({ success: false, message: "Live session not found." });
  const isOwner = String(session.teacherId) === String(req.user._id);
  const isStudent = req.user.role === "student" && await isStudentEnrolled(session.classId, req.user._id);
  const isAuthorizedStaff = !isStudent &&
    ["teacher", "admin", "department_principal"].includes(req.user.role) &&
    Boolean(await findTeacherClass(req, session.classId));
  if (!isOwner && !isStudent && !isAuthorizedStaff) {
    return res.status(403).json({ success: false, message: "You are not authorized to view this session." });
  }
  const state = await getStateForUser(session, req.user);
  const payload = {
    _id: String(session._id),
    isOwner,
    status: session.status,
    joinCode: isOwner ? session.joinCode : undefined,
    lessonTitle: session.lessonSnapshot.title,
    lessonSubject: session.lessonSnapshot.subject || "",
    lessonGrade: session.lessonSnapshot.grade || "",
    lessonLanguage: session.lessonSnapshot.language || "en",
    ...(isOwner ? { replayAvailable: session.replayAvailable === true } : {}),
    classId: String(session.classId),
    scheduledAt: session.scheduledAt,
    ...((isStudent && session.status !== "ended") || isAuthorizedStaff || isOwner
      ? { meetingUrl: session.meetingUrl || "" }
      : {}),
    timerDurationMinutes: session.timerDurationMinutes || 0,
    timeZone: await getSchoolTimeZone(req.schoolId),
    currentSlideIndex: session.currentSlideIndex,
    totalSlides: session.lessonSnapshot.slides.length,
    createdAt: session.createdAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    state,
  };
  if (isAuthorizedStaff || isOwner) payload.roster = formatRoster(await getSessionStudents(session));
  return res.json({ success: true, data: { session: payload } });
});

/**
 * A student reading their own replay: the question they were asked and only the mark and comment the
 * teacher released. An answer that is still in the queue reads as not shared yet, and no answer key,
 * another student's name or another group's variant ever reaches this payload.
 */
const studentReplayResults = async (session, studentId) => {
  const [responses, groupId] = await Promise.all([
    LiveResponse
      .find({ school: session.school, sessionId: session._id, studentId })
      .select("slideId grade submittedAt")
      .lean(),
    groupIdForStudent(session, studentId),
  ]);
  const responseBySlide = new Map(
    responses.map((response) => [String(response.slideId), response]),
  );
  return (session.lessonSnapshot.slides || [])
    .filter((slide) => slide.question)
    .map((slide, index) => {
      const variant = groupId
        ? (slide.variants || []).find((item) => String(item.groupId) === String(groupId))
        : null;
      const question = variant?.question || slide.question;
      const response = responseBySlide.get(String(slide._id));
      const grade = response?.grade;
      const released = Boolean(grade?.released) && grade?.marks != null;
      return {
        slideId: String(slide._id),
        questionNumber: index + 1,
        title: slide.title || "",
        prompt: question.prompt || "",
        submittedAt: response?.submittedAt || null,
        released,
        marks: released ? grade.marks : null,
        maxMarks: released ? grade.maxMarks ?? null : null,
        feedback: released ? grade.feedback || "" : "",
      };
    });
};

export const getLiveSessionReplay = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid session ID." });
  }
  const session = await LiveSession.findOne({
    _id: req.params.id,
    school: req.schoolId,
  });
  if (!session) return res.status(404).json({ success: false, message: "Live session not found." });
  const isStudent = req.user.role === "student";
  if (isStudent) {
    if (!(await isStudentEnrolled(session.classId, req.user._id))) {
      return res.status(403).json({ success: false, message: "You are not enrolled in this session's class." });
    }
    if (session.status !== "ended" || !session.replayAvailable) {
      return res.status(403).json({ success: false, message: "This session replay is not available to students." });
    }
  } else if (!await findOwnedSession(req, res)) {
    return;
  }
  const events = await LiveSessionEvent.find({ sessionId: session._id, school: req.schoolId })
    .sort({ seq: 1 })
    .lean();
  const students = isStudent ? [] : await getSessionStudents(session);
  const replayEvents = isStudent ? sanitizeStudentReplayEvents(events) : events;
  return res.json({
    success: true,
    data: {
      viewerRole: isStudent ? "student" : req.user.role,
      session: {
        id: String(session._id),
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationMs: session.startedAt
          ? Math.max(0, (session.endedAt || new Date()).getTime() - session.startedAt.getTime())
          : 0,
      },
      lesson: isStudent
        ? {
          ...session.lessonSnapshot,
          slides: (session.lessonSnapshot.slides || []).map((slide) => safeSlide(slide)),
        }
        : session.lessonSnapshot,
      students,
      events: replayEvents,
      myResults: isStudent ? await studentReplayResults(session, req.user._id) : [],
    },
  });
});

export const setLiveSessionReplayAvailability = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid session ID." });
  }
  if (typeof req.body?.available !== "boolean") {
    return res.status(400).json({ success: false, message: "Choose whether the replay should be available to students." });
  }
  const session = await LiveSession.findOne({
    _id: req.params.id,
    school: req.schoolId,
  });
  if (!session) return res.status(404).json({ success: false, message: "Live session not found." });
  if (String(session.teacherId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: "Only the session owner can change replay availability." });
  }
  if (session.status !== "ended") {
    return res.status(409).json({ success: false, message: "Only an ended session replay can be shared with students." });
  }
  session.replayAvailable = req.body.available;
  await session.save();
  return res.json({
    success: true,
    data: { replayAvailable: session.replayAvailable },
    message: session.replayAvailable
      ? "Replay is now available to students in this class."
      : "Replay is no longer available to students.",
  });
});

const awayDurationForStudent = (events, studentId, endAt) => {
  let awayAt = null;
  let total = 0;
  for (const event of events) {
    const actorId = String(event.actor?.userId || event.payload?.studentId || "");
    if (actorId !== studentId) continue;
    if (event.type === "presence:away" || event.type === "presence:left") awayAt = event.at;
    if ((event.type === "presence:back" || event.type === "presence:joined") && awayAt) {
      total += Math.max(0, new Date(event.at).getTime() - new Date(awayAt).getTime());
      awayAt = null;
    }
  }
  if (awayAt) total += Math.max(0, new Date(endAt).getTime() - new Date(awayAt).getTime());
  return Math.round(total / 1000);
};

const LIVE_OPTION_KINDS = ["mcq", "tf", "multi_select"];
// Students who are not in a listed group still answer the slide's own question, so the teacher
// marks that queue under this name.
const LIVE_BASE_LEVEL = "Class";
// An exit ticket is worth a small mark by default; the teacher can change it per question and the
// session keeps the choice.
const LIVE_DEFAULT_QUESTION_MARKS = 2;

const percentCredit = (rows) => {
  const graded = rows.filter((row) => row.credit !== null);
  if (!graded.length) return 0;
  return Math.round((graded.reduce((total, row) => total + row.credit, 0) / graded.length) * 100);
};

const levelCounts = (rows) => ({
  answered: rows.length,
  correct: rows.filter((row) => row.state === "correct").length,
  partial: rows.filter((row) => row.state === "partial").length,
  wrong: rows.filter((row) => row.state === "wrong").length,
  // Submitted answers with no verdict yet: a paragraph the teacher has not read, or an objective
  // answer the engines could not settle. It is never counted as wrong.
  pending: rows.filter((row) => row.state === "pending").length,
  percentCorrect: percentCredit(rows),
});

/** What a question asks, in a shape any kind fits: option kinds are the only ones with options. */
const liveQuestionView = (question) => {
  const kind = liveQuestionKind(question);
  const optionKind = LIVE_OPTION_KINDS.includes(kind);
  const correctIds = [question.correctOptionId, ...(question.correctOptionIds || [])].filter(Boolean);
  return {
    kind,
    prompt: question.prompt,
    key: describeLiveAnswerKey(question),
    options: optionKind
      ? (question.options || []).map((option) => ({
        id: option.id,
        text: option.text,
        correct: correctIds.includes(option.id),
      }))
      : [],
  };
};

const optionTally = (question, rows) => (LIVE_OPTION_KINDS.includes(liveQuestionKind(question))
  ? Object.fromEntries((question.options || []).map((option) => [
    option.id,
    rows.filter((row) => row.selectedOptionId === option.id).length,
  ]))
  : {});

const buildLiveSessionReportData = async (req, session) => {
  const [students, responses, events, classDoc, groups] = await Promise.all([
    getSessionStudents(session),
    LiveResponse.find({ sessionId: session._id, school: req.schoolId }).lean(),
    LiveSessionEvent.find({ sessionId: session._id, school: req.schoolId }).sort({ seq: 1 }).lean(),
    Class.findOne({ _id: session.classId, school: req.schoolId }).select("name grade section academicYear").lean(),
    LiveGroup.find({ school: req.schoolId, classId: session.classId }).select("_id name").lean(),
  ]);
  const questionSlides = session.lessonSnapshot.slides.filter((slide) => slide.question);
  const pauseAccounting = getSessionPauseAccounting(events);
  const durationSession = {
    ...session.toObject(),
    totalPausedMs: Number(session.totalPausedMs) || pauseAccounting.totalPausedMs,
    pausedAt: session.pausedAt || pauseAccounting.pausedAt,
    paused: Boolean(session.paused || (!session.endedAt && pauseAccounting.pausedAt)),
  };
  const responseByStudentSlide = new Map(
    responses.map((response) => [`${String(response.studentId)}:${response.slideId}`, response]),
  );
  const nameByStudent = new Map(students.map((student) => [String(student.studentId), student.name]));
  const groupNameById = new Map(groups.map((group) => [String(group._id), group.name]));
  const groupByStudent = await groupIdsByStudent(
    session,
    students.map((student) => String(student.studentId)),
  );
  const allocationBySlide = new Map(
    (session.questionMarks || []).map((entry) => [String(entry.slideId), Number(entry.maxMarks)]),
  );

  /**
   * A levelled slide asks each group something different, so the question a student answered, the
   * key it is marked against and the words that describe their answer all depend on who answered it.
   */
  const levelForStudent = (slide, studentId) => {
    const variants = slide.variants || [];
    if (!variants.length) return { question: slide.question, level: null, levelKey: "class" };
    const groupId = groupByStudent.get(String(studentId)) || null;
    const variant = groupId
      ? variants.find((item) => String(item.groupId) === String(groupId))
      : null;
    if (!variant) return { question: slide.question, level: LIVE_BASE_LEVEL, levelKey: "class" };
    return {
      question: variant.question,
      level: groupNameById.get(String(groupId)) || "Level",
      levelKey: String(groupId),
    };
  };

  const questionStateBySlide = new Map();
  for (const event of events) {
    if (event.payload?.slideId && ["question:opened", "question:closed", "results:revealed"].includes(event.type)) {
      questionStateBySlide.set(String(event.payload.slideId), event.type === "question:opened" ? "open" : "closed");
    }
  }
  const currentSlide = session.lessonSnapshot.slides[session.currentSlideIndex];
  const currentQuestionIsOpen = Boolean(session.status === "live" && session.questionOpen && currentSlide?.question);

  const openStateOf = (slide) => {
    const state = questionStateBySlide.get(String(slide._id));
    const isCurrentOpenQuestion = currentQuestionIsOpen && String(currentSlide?._id) === String(slide._id);
    return {
      isOpen: session.status === "live" && (state === "open" || (state === undefined && isCurrentOpenQuestion)),
      opened: state !== undefined || isCurrentOpenQuestion,
      closed: state === "closed" || (session.status === "ended" && state === "open"),
    };
  };

  const answerRows = (slide) => responses
    .filter((response) => response.slideId === String(slide._id))
    .map((response) => {
      const { question, level, levelKey } = levelForStudent(slide, response.studentId);
      return {
        studentId: String(response.studentId),
        name: nameByStudent.get(String(response.studentId)) || "Student",
        level,
        levelKey,
        kind: liveQuestionKind(question),
        selectedOptionId: response.selectedOptionId || null,
        answerText: describeLiveStudentAnswer(question, response),
        keyText: describeLiveAnswerKey(question),
        guidance: question.guidance || "",
        state: liveAnswerState(response),
        credit: liveAnswerCredit(response),
        marks: response.grade?.marks ?? null,
        maxMarks: response.grade?.maxMarks ?? null,
        feedback: response.grade?.feedback || "",
        released: Boolean(response.grade?.released),
        submittedAt: response.submittedAt || null,
        latencyMs: response.latencyMs ?? null,
      };
    })
    .sort((first, second) => first.name.localeCompare(second.name));

  const presentedQuestionCount = questionSlides.filter((slide) => (
    questionStateBySlide.has(String(slide._id)) ||
    (currentQuestionIsOpen && String(currentSlide?._id) === String(slide._id))
  )).length;
  const perQuestion = questionSlides.map((slide) => {
    const rows = answerRows(slide);
    const { isOpen, opened, closed } = openStateOf(slide);
    const variants = slide.variants || [];
    const rowsByLevel = (levelKey) => rows.filter((row) => row.levelKey === levelKey);
    const base = {
      slideId: String(slide._id),
      title: slide.title || "",
      // The whole question, every level, is marked against this one allocation.
      maxMarks: allocationBySlide.get(String(slide._id)) || LIVE_DEFAULT_QUESTION_MARKS,
      ...liveQuestionView(slide.question),
      ...levelCounts(rows),
      // Nobody has answered yet while the question is open, as opposed to `pending`, which is an
      // answer the teacher still has to mark.
      awaiting: isOpen ? Math.max(0, students.length - rows.length) : 0,
      unanswered: closed ? Math.max(0, students.length - rows.length) : null,
      perOption: optionTally(slide.question, rows),
      opened,
      closed,
      answers: rows,
    };
    if (!variants.length) return base;
    return {
      ...base,
      levels: [
        {
          level: LIVE_BASE_LEVEL,
          levelKey: "class",
          ...liveQuestionView(slide.question),
          ...levelCounts(rowsByLevel("class")),
          perOption: optionTally(slide.question, rowsByLevel("class")),
        },
        ...variants.map((variant) => {
          const levelRows = rowsByLevel(String(variant.groupId));
          return {
            level: groupNameById.get(String(variant.groupId)) || "Level",
            levelKey: String(variant.groupId),
            ...liveQuestionView(variant.question),
            ...levelCounts(levelRows),
            perOption: optionTally(variant.question, levelRows),
          };
        }),
      ],
    };
  });

  const answerRowByStudentSlide = new Map(
    perQuestion.flatMap((question) => question.answers.map((row) => [
      `${row.studentId}:${question.slideId}`,
      row,
    ])),
  );

  const endedAt = session.endedAt || new Date();
  const perStudent = students.map((student) => {
    const studentId = String(student.studentId);
    const answers = responses.filter((response) => String(response.studentId) === studentId);
    const studentEvents = events.filter((event) =>
      String(event.actor?.userId || event.payload?.studentId || "") === studentId,
    );
    const joinedEvent = studentEvents.find((event) => event.type === "presence:joined");
    const answerDetails = questionSlides.map((slide, index) => {
      const response = responseByStudentSlide.get(`${studentId}:${String(slide._id)}`);
      const row = answerRowByStudentSlide.get(`${studentId}:${String(slide._id)}`);
      const { question, level } = levelForStudent(slide, studentId);
      const { isOpen, closed } = openStateOf(slide);
      return {
        slideId: String(slide._id),
        questionNumber: index + 1,
        title: slide.title || "",
        kind: liveQuestionKind(question),
        level,
        prompt: question.prompt,
        selectedOptionId: response?.selectedOptionId || null,
        selectedAnswer: row?.answerText || "",
        correctAnswer: describeLiveAnswerKey(question),
        isCorrect: response ? response.isCorrect : null,
        result: row?.state || null,
        credit: row?.credit ?? null,
        marks: row?.marks ?? null,
        maxMarks: row?.maxMarks ?? null,
        feedback: row?.feedback || "",
        released: Boolean(row?.released),
        submittedAt: response?.submittedAt || null,
        latencyMs: response?.latencyMs ?? null,
        status: response
          ? "answered"
          : !joinedEvent
            ? "not_present"
            : closed
              ? "unanswered"
              : isOpen
                ? "pending"
                : "not_opened",
      };
    });
    const answered = answerDetails.filter((answer) => answer.status === "answered");
    const withVerdict = answered.filter((answer) => answer.credit !== null);
    return {
      studentId,
      name: student.name,
      joined: Boolean(joinedEvent),
      joinedAt: joinedEvent?.at || null,
      answered: answered.length,
      correct: answered.filter((answer) => answer.result === "correct").length,
      partial: answered.filter((answer) => answer.result === "partial").length,
      wrong: answered.filter((answer) => answer.result === "wrong").length,
      toMark: answered.filter((answer) => answer.result === "pending").length,
      unanswered: answerDetails.filter((answer) => answer.status === "unanswered").length,
      pending: answerDetails.filter((answer) => answer.status === "pending").length,
      coveragePercent: presentedQuestionCount ? Math.round((answers.length / presentedQuestionCount) * 100) : 0,
      scorePercent: withVerdict.length
        ? Math.round((withVerdict.reduce((total, answer) => total + answer.credit, 0) / withVerdict.length) * 100)
        : 0,
      totalAwaySeconds: awayDurationForStudent(events, studentId, endedAt),
      answerDetails,
      presenceEvents: studentEvents
        .filter((event) => event.type.startsWith("presence:"))
        .map((event) => ({ type: event.type, at: event.at, reason: event.payload?.reason || null })),
    };
  });
  const startedAt = session.startedAt || null;
  const reportEndedAt = session.endedAt || null;
  return {
    session: {
      id: String(session._id),
      title: session.lessonSnapshot.title,
      status: session.status,
      replayAvailable: session.replayAvailable === true,
      isOwner: String(session.teacherId) === String(req.user._id),
      class: classDoc,
      subject: session.lessonSnapshot.subject || "",
      subjectId: session.lessonSnapshot.subjectId || null,
      startedAt,
      endedAt: reportEndedAt,
      durationMs: activeLiveSessionDurationMs(durationSession),
      updatedAt: new Date(),
      questionOpen: Boolean(session.questionOpen),
    },
    summary: {
      rosterCount: students.length,
      joinedCount: perStudent.filter((student) => student.joined).length,
      questionCount: questionSlides.length,
      presentedQuestionCount,
      submittedAnswers: responses.length,
      // The teacher's queue: submitted answers with no verdict, so a paragraph no one has read
      // cannot be mistaken for a wrong one.
      awaitingMarks: perQuestion.reduce((total, question) => total + question.pending, 0),
    },
    perQuestion,
    perStudent,
  };
};

export const getLiveSessionReport = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  const data = await buildLiveSessionReportData(req, session);
  return res.json({ success: true, data });
});

/**
 * The mark sheet for one question, every level at once. A written answer has no key, so this is the
 * only thing that turns it into a mark, and releasing it is the only thing that lets the class read
 * it. A blank mark returns the answer to the queue instead of scoring it zero.
 */
export const updateLiveSessionQuestionMarks = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  const slideId = String(req.body?.slideId ?? "").trim();
  const slide = (session.lessonSnapshot.slides || []).find((item) => (
    item.question && String(item._id) === slideId
  ));
  if (!slide) {
    return res.status(400).json({ success: false, message: "Choose a question from this session." });
  }
  const entries = Array.isArray(req.body?.marks) ? req.body.marks : null;
  if (!entries || entries.length > 500) {
    return res.status(400).json({ success: false, message: "Send the marks for this question's answers." });
  }
  const storedAllocation = (session.questionMarks || [])
    .find((allocation) => String(allocation.slideId) === slideId)?.maxMarks;
  const maxMarks = Number(req.body?.maxMarks ?? storedAllocation ?? LIVE_DEFAULT_QUESTION_MARKS);
  if (!Number.isFinite(maxMarks) || maxMarks < 0.25 || maxMarks > 100) {
    return res.status(400).json({ success: false, message: "A question is worth between 0.25 and 100 marks." });
  }

  const answered = await LiveResponse
    .find({ school: req.schoolId, sessionId: session._id, slideId })
    .select("studentId")
    .lean();
  const answeredIds = new Set(answered.map((response) => String(response.studentId)));
  const seen = new Set();
  const updates = [];
  let gradedCount = 0;
  let releasedCount = 0;
  for (const entry of entries) {
    const studentId = String(entry?.studentId ?? "").trim();
    if (!validId(studentId) || seen.has(studentId)) {
      return res.status(400).json({ success: false, message: "Each mark needs one student, named once." });
    }
    seen.add(studentId);
    if (!answeredIds.has(studentId)) {
      return res.status(400).json({ success: false, message: "Only an answer that was submitted can be marked." });
    }
    const submitted = entry?.marks;
    const marks = submitted === null || submitted === undefined || submitted === ""
      ? null
      : Number(submitted);
    if (marks !== null && (!Number.isFinite(marks) || marks < 0 || marks > maxMarks)) {
      return res.status(400).json({ success: false, message: `Marks must be between 0 and ${maxMarks}.` });
    }
    const released = marks !== null && Boolean(entry?.released);
    if (marks !== null) gradedCount += 1;
    if (released) releasedCount += 1;
    updates.push({
      updateOne: {
        filter: { school: req.schoolId, sessionId: session._id, slideId, studentId },
        // Clearing a mark leaves isCorrect and score alone: an objective answer falls back to the
        // verdict the engine gave it, a written one to the queue.
        update: {
          $set: {
            "grade.status": marks === null ? "pending" : "graded",
            "grade.marks": marks,
            "grade.maxMarks": maxMarks,
            "grade.feedback": String(entry?.feedback ?? "").trim().slice(0, 2000),
            "grade.released": released,
            ...(marks === null
              ? {}
              : {
                // A full mark reads as correct everywhere else; part credit reads as a score, exactly
                // like an objective answer the engine only half awarded.
                "grade.source": "teacher",
                "grade.gradedBy": req.user._id,
                "grade.gradedAt": new Date(),
                isCorrect: marks >= maxMarks,
                score: Math.min(1, marks / maxMarks),
              }),
          },
        },
      },
    });
  }

  if (updates.length) await LiveResponse.bulkWrite(updates);
  if (Number(storedAllocation) !== maxMarks) {
    // One allocation per question, kept on the session so the mark sheet and the gradebook agree.
    await LiveSession.updateOne(
      { _id: session._id, school: req.schoolId },
      { $pull: { questionMarks: { slideId } } },
    );
    await LiveSession.updateOne(
      { _id: session._id, school: req.schoolId },
      { $push: { questionMarks: { slideId, maxMarks } } },
    );
  }
  return res.json({
    success: true,
    data: { slideId, maxMarks, marked: gradedCount, released: releasedCount },
  });
});

/**
 * A first mark and a comment for every answer on one question that is still waiting for the teacher,
 * all levels at once. Nothing here is saved: each suggestion lands on the mark sheet as an unsaved
 * value the teacher approves, and a suggestion that cannot be made leaves the queue as it was.
 */
export const draftLiveSessionQuestionMarks = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  if (!await schoolMarkDraftingEnabled(req.schoolId)) {
    return res.status(403).json({
      success: false,
      message: "Suggested marks are switched off for this school. An admin can turn them on in live lesson settings.",
    });
  }
  const slideId = String(req.body?.slideId ?? "").trim();
  const report = await buildLiveSessionReportData(req, session);
  const question = (report.perQuestion || []).find((item) => item.slideId === slideId);
  if (!question) {
    return res.status(400).json({ success: false, message: "Choose a question from this session." });
  }
  const maxMarks = Number(req.body?.maxMarks ?? question.maxMarks ?? LIVE_DEFAULT_QUESTION_MARKS);
  if (!Number.isFinite(maxMarks) || maxMarks < 0.25 || maxMarks > 100) {
    return res.status(400).json({ success: false, message: "A question is worth between 0.25 and 100 marks." });
  }
  // Only a teacher's queue is drafted: an answer the engine already settled keeps its verdict.
  const waiting = (question.answers || []).filter((answer) => answer.state === "pending");
  if (!waiting.length) {
    return res.json({ success: true, data: { slideId, maxMarks, pending: 0, drafts: [], unavailable: false, reason: "" } });
  }
  if (waiting.length > MAX_DRAFT_ANSWERS) {
    return res.status(400).json({
      success: false,
      message: `${waiting.length} answers wait on this question, and only ${MAX_DRAFT_ANSWERS} get a suggestion at a time. Mark the rest yourself.`,
    });
  }
  const questionFor = (answer) => (question.levels || []).find((level) => level.level === answer.level) || question;
  const entries = waiting.map((answer) => {
    // A levelled slide asks each group something different, so each answer is judged against the
    // words that group was given.
    const level = questionFor(answer);
    return {
      studentId: answer.studentId,
      level: answer.level,
      prompt: level.prompt,
      guidance: answer.guidance,
      expected: level.key,
      answer: answer.answerText,
    };
  });
  const result = await liveLessonMarkDraftService.draftMarks({
    maxMarks,
    entries,
    schoolId: req.schoolId,
    userId: req.user._id,
  });
  return res.json({
    success: true,
    data: {
      slideId,
      maxMarks,
      pending: waiting.length,
      drafts: result.drafts,
      unavailable: Boolean(result.unavailable),
      reason: result.reason || "",
    },
  });
});

const sendLiveLessonPdf = (res, pdfData, filename) => {
  const pdfBuffer = Buffer.from(pdfData);
  return res
    .status(200)
    .type("application/pdf")
    .set("Content-Disposition", `attachment; filename="${filename}"`)
    .set("Content-Length", String(pdfBuffer.length))
    .send(pdfBuffer);
};

const parseReportStudentIds = (value) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 150 || value.some((id) => !validId(id))) {
    const error = new Error("Select no more than 150 valid students for a batch PDF.");
    error.statusCode = 400;
    throw error;
  }
  return [...new Set(value.map(String))];
};

export const getLiveLessonPerformanceReport = asyncHandler(async (req, res) => {
  const data = await buildLiveLessonPerformanceReport({
    req,
    classId: req.query.classId,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    studentId: req.query.studentId,
    resolveClass: findTeacherClass,
    resolveStudents: getSessionStudents,
  });
  return res.json({ success: true, data });
});

export const exportLiveLessonPerformanceReportPdf = asyncHandler(async (req, res) => {
  const data = await buildLiveLessonPerformanceReport({
    req,
    classId: req.query.classId,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    resolveClass: findTeacherClass,
    resolveStudents: getSessionStudents,
  });
  const requestedStudentIds = req.query.studentIds
    ? String(req.query.studentIds).split(",").filter(Boolean)
    : undefined;
  const studentIds = parseReportStudentIds(requestedStudentIds);
  if (studentIds.length && studentIds.some((id) => !data.students.some((student) => student.studentId === id))) {
    return res.status(400).json({ success: false, message: "The selected students are not in this class report." });
  }
  const pdf = await generateLiveLessonReportPdf(data, { type: "performance", studentIds });
  return sendLiveLessonPdf(res, pdf, "class-live-performance-report.pdf");
});

export const exportLiveSessionReportPdf = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  const report = await buildLiveSessionReportData(req, session);
  const studentIds = parseReportStudentIds(req.body?.studentIds);
  if (studentIds.length && studentIds.some((id) => !report.perStudent.some((student) => student.studentId === id))) {
    return res.status(400).json({ success: false, message: "The selected students are not in this session report." });
  }
  const pdf = await generateLiveLessonReportPdf(report, { type: "session", studentIds });
  return sendLiveLessonPdf(res, pdf, "live-session-report.pdf");
});

const getSessionGradeContext = async (req, session) => {
  const classDoc = await findTeacherClass(req, session.classId);
  if (!classDoc) return null;
  await classDoc.populate("subjects.subject", "name code dailyMaxMarks");

  let teacherProfile = null;
  if (req.user.role === "teacher") {
    teacherProfile = await Teacher.findOne({
      user: req.user._id,
      school: req.schoolId,
      isActive: true,
    }).select("_id");
    if (!teacherProfile) return null;
  }

  const isClassTeacher = teacherProfile && String(classDoc.classTeacher) === String(teacherProfile._id);
  const subjectMap = new Map();
  for (const assignment of classDoc.subjects || []) {
    const subject = assignment.subject;
    if (!subject?._id) continue;
    if (teacherProfile && !isClassTeacher && String(assignment.teacher) !== String(teacherProfile._id)) continue;
    subjectMap.set(String(subject._id), {
      _id: String(subject._id),
      name: subject.name,
      code: subject.code || "",
      dailyMaxMarks: subject.dailyMaxMarks || 10,
    });
  }
  return { classDoc, subjects: [...subjectMap.values()] };
};

const buildSessionGradePreview = async ({ req, session, context, subjectId, maxMarks, behaviorDeduction }) => {
  if (session.status !== "ended") {
    return { statusCode: 409, message: "End the live session before adding it to the gradebook." };
  }
  if (!validId(subjectId) || !context.subjects.some((subject) => subject._id === String(subjectId))) {
    return { statusCode: 400, message: "Choose a subject assigned to this class." };
  }
  if (session.lessonSnapshot.subjectId && String(session.lessonSnapshot.subjectId) !== String(subjectId)) {
    return { statusCode: 400, message: "Choose the session's recorded class subject." };
  }
  const subject = await Subject.findOne({ _id: subjectId, school: req.schoolId }).select("_id name dailyMaxMarks").lean();
  if (!subject) return { statusCode: 400, message: "The selected class subject was not found." };

  const resolvedMaxMarks = Number(maxMarks ?? subject.dailyMaxMarks ?? 10);
  if (!Number.isFinite(resolvedMaxMarks) || resolvedMaxMarks < 1 || resolvedMaxMarks > 1000) {
    return { statusCode: 400, message: "Maximum marks must be between 1 and 1000." };
  }
  const resolvedDeduction = Number(behaviorDeduction ?? 0);
  if (![0, 0.5, 1].includes(resolvedDeduction)) {
    return { statusCode: 400, message: "Choose no behavior deduction, 0.5, or 1 point per hidden-tab event." };
  }

  const linkedGradeCount = await Grade.countDocuments({ school: req.schoolId, liveSession: session._id });
  const roster = await getSessionStudents(session);
  const rosterUserIds = [...new Set(roster.map((student) => String(student.studentId)).filter(validId))];
  if (!rosterUserIds.length) {
    return { statusCode: 409, message: "No students are available in the saved session roster." };
  }
  if (rosterUserIds.length !== roster.length) {
    return { statusCode: 409, message: "The saved session roster contains an invalid student account and cannot be graded." };
  }
  const [studentProfiles, responses, events] = await Promise.all([
    Student.find({ school: req.schoolId, user: { $in: rosterUserIds }, status: "active" })
      .select("_id user firstName lastName")
      .lean(),
    LiveResponse.find({ sessionId: session._id, school: req.schoolId }).lean(),
    LiveSessionEvent.find({ sessionId: session._id, school: req.schoolId }).sort({ seq: 1 }).lean(),
  ]);
  const profilesByUserId = new Map(studentProfiles.map((student) => [String(student.user), student]));
  if (rosterUserIds.some((id) => !profilesByUserId.has(id))) {
    return { statusCode: 409, message: "One or more students in the session roster no longer have an active student profile; no grades were added." };
  }

  const presentedSlideIds = new Set(
    events.filter((event) => event.type === "question:opened" && event.payload?.slideId)
      .map((event) => String(event.payload.slideId)),
  );
  for (const response of responses) presentedSlideIds.add(String(response.slideId));
  const questionSlides = (session.lessonSnapshot.slides || []).filter((slide) => (
    slide.question && presentedSlideIds.has(String(slide._id))
  ));
  if (!questionSlides.length) {
    return { statusCode: 400, message: "This lesson has no answerable questions to convert into classwork grades." };
  }
  const responseByStudentSlide = new Map(
    responses.map((response) => [`${String(response.studentId)}:${response.slideId}`, response]),
  );
  const visibilityIncidents = new Map();
  for (const event of events) {
    if (event.type !== "presence:away" || event.payload?.reason !== "visibility_hidden") continue;
    if (session.startedAt && new Date(event.at).getTime() < new Date(session.startedAt).getTime()) continue;
    if (session.endedAt && new Date(event.at).getTime() > new Date(session.endedAt).getTime()) continue;
    const studentId = String(event.actor?.userId || event.payload?.studentId || "");
    visibilityIncidents.set(studentId, (visibilityIncidents.get(studentId) || 0) + 1);
  }
  const students = roster.map((rosterStudent) => {
    const userId = String(rosterStudent.studentId);
    const student = profilesByUserId.get(userId);
    // Every presented question is on the sheet. A question the student left earns nothing and still
    // counts; an answer the teacher has not marked yet counts on neither side of the divide.
    const credits = questionSlides.map((slide) => {
      const response = responseByStudentSlide.get(`${userId}:${String(slide._id)}`);
      return response ? liveAnswerCredit(response) : 0;
    });
    const incidents = visibilityIncidents.get(userId) || 0;
    const score = calculateLiveSessionMark({
      credits,
      maxMarks: resolvedMaxMarks,
      visibilityIncidents: incidents,
      deductionPerIncident: resolvedDeduction,
    });
    return {
      studentId: String(student._id),
      userId,
      name: `${student.firstName || ""} ${student.lastName || ""}`.trim() || rosterStudent.name,
      correct: credits.filter((credit) => credit === 1).length,
      questionCount: score.countedQuestions,
      answered: questionSlides.filter((slide) => responseByStudentSlide.has(`${userId}:${String(slide._id)}`)).length,
      pendingMarks: score.pendingQuestions,
      baseMarks: score.baseMarks,
      visibilityIncidents: incidents,
      behaviorDeduction: score.behaviorDeduction,
      marks: score.marks,
    };
  });
  return {
    subject: { _id: String(subject._id), name: subject.name },
    maxMarks: resolvedMaxMarks,
    behaviorDeductionPerIncident: resolvedDeduction,
    linkedGradeCount,
    students,
    sessionDate: session.startedAt || session.createdAt,
    academicYear: context.classDoc.academicYear,
    semester: await resolveSemesterForDate(req.schoolId, session.startedAt || session.createdAt) || 1,
  };
};

export const getLiveSessionGradebookPreview = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  const context = await getSessionGradeContext(req, session);
  if (!context) {
    return res.status(403).json({ success: false, message: "You are not authorized to add this class to the gradebook." });
  }
  const baseData = {
    session: {
      id: String(session._id),
      title: session.lessonSnapshot.title,
      status: session.status,
      class: { id: String(session.classId), name: context.classDoc.name },
      subject: session.lessonSnapshot.subject || "",
    },
    subjects: context.subjects,
  };
  if (!req.query.subjectId) {
    return res.json({ success: true, data: { ...baseData, preview: null } });
  }
  const preview = await buildSessionGradePreview({
    req,
    session,
    context,
    subjectId: req.query.subjectId,
    maxMarks: req.query.maxMarks,
    behaviorDeduction: req.query.behaviorDeduction,
  });
  if (preview.statusCode) {
    return res.status(preview.statusCode).json({ success: false, message: preview.message });
  }
  return res.json({ success: true, data: { ...baseData, preview } });
});

export const createLiveSessionGradebookEntries = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  const context = await getSessionGradeContext(req, session);
  if (!context) {
    return res.status(403).json({ success: false, message: "You are not authorized to add this class to the gradebook." });
  }
  const preview = await buildSessionGradePreview({
    req,
    session,
    context,
    subjectId: req.body?.subjectId,
    maxMarks: req.body?.maxMarks,
    behaviorDeduction: req.body?.behaviorDeductionPerIncident,
  });
  if (preview.statusCode) {
    return res.status(preview.statusCode).json({ success: false, message: preview.message });
  }
  if (preview.linkedGradeCount) {
    return res.status(409).json({ success: false, message: "Gradebook entries already exist for this live session. They were not changed." });
  }
  if (!Array.isArray(req.body?.students) || req.body.students.length !== preview.students.length) {
    return res.status(400).json({ success: false, message: "Submit one reviewed grade for each student in the session roster." });
  }
  const entriesByStudent = new Map();
  for (const entry of req.body.students) {
    const studentId = String(entry?.studentId || "");
    const marks = Number(entry?.marks);
    if (
      !studentId ||
      entriesByStudent.has(studentId) ||
      (typeof entry?.marks === "string" && !entry.marks.trim()) ||
      !Number.isFinite(marks) ||
      marks < 0 ||
      marks > preview.maxMarks
    ) {
      return res.status(400).json({ success: false, message: "Each student grade must be unique and between zero and the maximum marks." });
    }
    entriesByStudent.set(studentId, marks);
  }
  if (preview.students.some((student) => !entriesByStudent.has(student.studentId))) {
    return res.status(400).json({ success: false, message: "The submitted grades do not match the session roster." });
  }
  const gradeDate = new Date(preview.sessionDate);
  const title = `Live lesson: ${String(session.lessonSnapshot.title || "Session").slice(0, 180)}`;
  const academicYear = preview.academicYear || resolveRequestedAcademicYear(undefined, req.school);
  const assessmentGroupId = `live-${session._id}`;
  const transaction = await mongoose.startSession();
  let savedGrades = [];
  let alreadyLinked = false;
  try {
    await transaction.withTransaction(async () => {
      const existingCount = await Grade.countDocuments({
        school: req.schoolId,
        liveSession: session._id,
      }).session(transaction);
      if (existingCount) {
        alreadyLinked = true;
        return;
      }
      const lastColumn = await GradebookColumn.find({
        school: req.schoolId,
        class: session.classId,
        subject: preview.subject._id,
        academicYear,
        semester: preview.semester,
      }).select("sortOrder").sort({ sortOrder: -1 }).limit(1).session(transaction).lean();
      const [column] = await GradebookColumn.create([{
        school: req.schoolId,
        class: session.classId,
        subject: preview.subject._id,
        academicYear,
        semester: preview.semester,
        name: title,
        category: "classwork",
        date: gradeDate,
        maxMarks: preview.maxMarks,
        sortOrder: (lastColumn[0]?.sortOrder || 0) + 1,
        assessmentGroupId,
        createdBy: req.user._id,
      }], { session: transaction });
      const gradeDocuments = preview.students.map((student) => ({
        school: req.schoolId,
        student: student.studentId,
        subject: preview.subject._id,
        class: session.classId,
        teacher: req.user._id,
        academicYear,
        gradeType: "daily",
        category: "classwork",
        gradingSource: "live_session",
        date: gradeDate,
        month: gradeDate.getUTCMonth() + 1,
        semester: preview.semester,
        marks: entriesByStudent.get(student.studentId),
        maxMarks: preview.maxMarks,
        title,
        remarks: "Classwork based on live session answers.",
        notes: `Session answers: ${student.correct}/${student.questionCount} correct; ${student.answered} answered.`,
        liveSession: session._id,
        liveSessionVisibilityIncidents: student.visibilityIncidents,
        liveSessionVisibilityDeductionPerIncident: preview.behaviorDeductionPerIncident,
        liveSessionMarksAdjusted: Math.abs(entriesByStudent.get(student.studentId) - student.marks) > 0.001,
        columnId: column._id,
        assessmentGroupId,
      }));
      savedGrades = await Grade.insertMany(gradeDocuments, { session: transaction, ordered: true });
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Gradebook entries already exist for this live session. They were not changed." });
    }
    throw error;
  } finally {
    await transaction.endSession();
  }
  if (alreadyLinked) {
      return res.status(409).json({ success: false, message: "Gradebook entries already exist for this live session. They were not changed." });
  }
  return res.status(201).json({
    success: true,
    message: `${savedGrades.length} live lesson grades added.`,
    data: { count: savedGrades.length, sessionId: String(session._id) },
  });
});

export const deleteLiveSession = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  if (session.status === "live") {
    return res.status(409).json({
      success: false,
      message: "End the live session before deleting it from history.",
    });
  }
  const transaction = await mongoose.startSession();
  try {
    await transaction.withTransaction(async () => {
      await Grade.updateMany(
        { school: req.schoolId, liveSession: session._id },
        { $unset: { liveSession: "" } },
        { session: transaction },
      );
      await LiveResponse.deleteMany(
        { sessionId: session._id, school: req.schoolId },
        { session: transaction },
      );
      await LiveSessionEvent.deleteMany(
        { sessionId: session._id, school: req.schoolId },
        { session: transaction },
      );
      await LiveSession.deleteOne(
        { _id: session._id, school: req.schoolId },
        { session: transaction },
      );
    });
  } finally {
    await transaction.endSession();
  }
  closeLiveSessionConnections(session._id);
  return res.json({
    success: true,
    message: "Session history deleted. Gradebook scores were kept and unlinked from the session.",
  });
});

export const deleteFinishedLiveSessions = asyncHandler(async (req, res) => {
  const transaction = await mongoose.startSession();
  let deletedSessionIds = [];
  let unlinkedGradebookCount = 0;
  try {
    await transaction.withTransaction(async () => {
      deletedSessionIds = [];
      unlinkedGradebookCount = 0;
      const finishedSessions = await LiveSession.find({
        school: req.schoolId,
        teacherId: req.user._id,
        status: "ended",
      }).select("_id").session(transaction);
      const sessionIds = finishedSessions.map((session) => session._id);
      if (!sessionIds.length) return;

      const linkedSessionIds = await Grade.distinct("liveSession", {
        school: req.schoolId,
        liveSession: { $in: sessionIds },
      }).session(transaction);
      deletedSessionIds = sessionIds;
      unlinkedGradebookCount = linkedSessionIds.length;
      if (linkedSessionIds.length) {
        await Grade.updateMany(
          { school: req.schoolId, liveSession: { $in: sessionIds } },
          { $unset: { liveSession: "" } },
          { session: transaction },
        );
      }

      await LiveResponse.deleteMany(
        { school: req.schoolId, sessionId: { $in: deletedSessionIds } },
        { session: transaction },
      );
      await LiveSessionEvent.deleteMany(
        { school: req.schoolId, sessionId: { $in: deletedSessionIds } },
        { session: transaction },
      );
      await LiveSession.deleteMany(
        { school: req.schoolId, _id: { $in: deletedSessionIds }, status: "ended" },
        { session: transaction },
      );
    });
  } finally {
    await transaction.endSession();
  }
  deletedSessionIds.forEach((sessionId) => closeLiveSessionConnections(sessionId));
  return res.json({
    success: true,
    data: {
      deletedCount: deletedSessionIds.length,
      unlinkedGradebookCount,
    },
  });
});
