import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import Class from "../models/Class.js";
import Grade from "../models/Grade.js";
import GradebookColumn from "../models/GradebookColumn.js";
import LiveLesson from "../models/LiveLesson.js";
import LiveLessonFolder from "../models/LiveLessonFolder.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import School from "../models/School.js";
import Student from "../models/Student.js";
import Subject from "../models/Subject.js";
import Teacher from "../models/Teacher.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parseLiveLessonCsv } from "../services/liveLessonCsvService.js";
import { assertLiveLessonHtmlSafe } from "../services/liveLessonHtmlSafety.js";
import {
  appendLiveEvent,
  formatRoster,
  getSessionStudents,
  getStateForUser,
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
import { calculateLiveSessionMark } from "../services/liveSessionGradebookService.js";
import {
  activeLiveSessionDurationMs,
  getSessionPauseAccounting,
  resumeLiveSessionPause,
} from "../services/liveSessionTime.js";
import { buildLiveLessonPerformanceReport } from "../services/liveLessonPerformanceReportService.js";
import { generateLiveLessonReportPdf } from "../services/liveLessonReportPdfService.js";
import { normalizeLiveLessonMeetingUrl, sendLiveLessonInvitationEmails } from "../services/liveLessonInvitationService.js";
import { resolveRequestedAcademicYear } from "../utils/academicYear.js";
import { getSchoolTimeZone } from "../helpers/attendanceEligibility.js";
import { buildPortalLink } from "../helpers/portalUrl.js";
import { getTeacherClassIds, getTeacherSubjectIds } from "../helpers/teacherScoping.js";
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
  const query = { _id: classId, school: req.schoolId, isActive: { $ne: false } };
  if (req.user.role === "department_principal") {
    const departmentId = req.departmentId || req.user.department?._id || req.user.department;
    if (departmentId) query.department = departmentId;
  }
  if (req.user.role === "teacher") {
    const teacher = await Teacher.findOne({ user: req.user._id, school: req.schoolId })
      .select("_id")
      .lean();
    if (!teacher) return null;
    query.$or = [{ classTeacher: teacher._id }, { "subjects.teacher": teacher._id }];
  }
  return Class.findOne(query);
};

const normalizeSlides = (slides) =>
  slides.map((slide, index) => ({
    order: index,
    type: slide.type,
    title: String(slide.title || "").trim(),
    body: String(slide.body || "").trim(),
    html: slide.type === "html" ? String(slide.html || "") : "",
    examples: Array.isArray(slide.examples) ? slide.examples.map((value) => String(value)) : [],
    imageUrl: String(slide.imageUrl || "").trim(),
    speakerNotes: String(slide.speakerNotes || "").trim(),
    ...(slide.question ? { question: slide.question } : {}),
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
  if (!classId && !subjectId) return { classId: null, subjectId: null, subject: "" };
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
  return { classId: classDoc._id, subjectId: subject._id, subject: subject.name };
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
    if (slide.imageUrl && !/^https?:\/\/\S+$/i.test(String(slide.imageUrl))) {
      errors.push({ row, field: "image URL", message: "Image URL must start with http:// or https://." });
    }
    if (String(slide.imageUrl || "").length > 2048) {
      errors.push({ row, field: "image URL", message: "Image URL must be 2,048 characters or fewer." });
    }
    if (Array.isArray(slide.examples) && slide.examples.some((example) => String(example).length > 5000)) {
      errors.push({ row, field: "examples", message: "Each example must be 5,000 characters or fewer." });
    }
    if (slide.type === "question") {
      const question = slide.question;
      if (!question || !["mcq", "tf"].includes(question.kind) || !String(question.prompt || "").trim()) {
        errors.push({ row, field: "question", message: "Question slides need an MCQ or true/false prompt." });
        return;
      }
      if (String(question.prompt).length > 500 || String(question.explanation || "").length > 2000) {
        errors.push({ row, field: "question", message: "Question prompts are limited to 500 characters and explanations to 2,000." });
      }
      const options = Array.isArray(question.options) ? question.options : [];
      const ids = options.map((option) => String(option.id || ""));
      if ((question.kind === "mcq" && (options.length < 2 || options.length > 6)) ||
        (question.kind === "tf" && (options.length !== 2 || !ids.includes("true") || !ids.includes("false")))) {
        errors.push({ row, field: "options", message: "Question has an invalid number or shape of answer options." });
      }
      if (new Set(ids).size !== ids.length || options.some((option) => !String(option.text || "").trim())) {
        errors.push({ row, field: "options", message: "Answer options must have unique IDs and non-empty text." });
      }
      if (options.some((option) => String(option.id).length > 20 || String(option.text).length > 300)) {
        errors.push({ row, field: "options", message: "Option IDs are limited to 20 characters and option text to 300." });
      }
      if (!ids.includes(question.correctOptionId)) {
        errors.push({ row, field: "correct answer", message: "The correct answer must match an option." });
      }
    } else if (slide.question) {
      errors.push({ row, field: "question", message: "Only question slides can include question data." });
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

const schoolHtmlReviewEnabled = async (schoolId) => {
  const school = await School.findById(schoolId).select("settings.liveLessonHtmlReview.aiReviewEnabled").lean();
  return school?.settings?.liveLessonHtmlReview?.aiReviewEnabled === true;
};

export const getLiveLessonSettings = asyncHandler(async (req, res) => {
  return res.json({
    success: true,
    data: { aiHtmlReviewEnabled: await schoolHtmlReviewEnabled(req.schoolId) },
  });
});

export const updateLiveLessonSettings = asyncHandler(async (req, res) => {
  if (typeof req.body?.aiHtmlReviewEnabled !== "boolean") {
    return res.status(400).json({ success: false, message: "aiHtmlReviewEnabled must be true or false." });
  }
  const school = await School.findByIdAndUpdate(
    req.schoolId,
    { $set: { "settings.liveLessonHtmlReview.aiReviewEnabled": req.body.aiHtmlReviewEnabled } },
    { new: true, runValidators: true },
  ).select("settings.liveLessonHtmlReview.aiReviewEnabled");
  if (!school) return res.status(404).json({ success: false, message: "School not found." });
  return res.json({
    success: true,
    data: { aiHtmlReviewEnabled: school.settings?.liveLessonHtmlReview?.aiReviewEnabled === true },
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
  await assertLiveLessonHtmlSafe({
    slides: result.lesson.slides,
    aiReviewEnabled: await schoolHtmlReviewEnabled(req.schoolId),
  });
  const lesson = await LiveLesson.create({
    school: req.schoolId,
    ownerId: req.user._id,
    ...result.lesson,
    classId: assignment.classId,
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
  await assertLiveLessonHtmlSafe({
    slides,
    aiReviewEnabled: await schoolHtmlReviewEnabled(req.schoolId),
  });
  const lesson = await LiveLesson.create({
    school: req.schoolId,
    ownerId: req.user._id,
    classId: assignment.classId,
    subjectId: assignment.subjectId,
    source: "csv",
    title: String(title).trim(),
    description: String(description || "").trim(),
    subject: assignment.subject || String(req.body.subject || "").trim(),
    grade: String(req.body.grade || "").trim(),
    language: String(req.body.language || "en").trim(),
    slides: normalizeSlides(slides),
  });
  return res.status(201).json({ success: true, data: { lesson } });
});

export const listLiveLessons = asyncHandler(async (req, res) => {
  const lessons = await LiveLesson.find({ school: req.schoolId, ownerId: req.user._id })
    .sort({ updatedAt: -1 })
    .select("title description subject subjectId classId grade language isDone slides.order slides.type createdAt updatedAt")
    .populate("classId", "name")
    .populate("subjectId", "name")
    .lean();
  return res.json({ success: true, data: { lessons } });
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
  await assertLiveLessonHtmlSafe({
    slides: next.slides,
    aiReviewEnabled: await schoolHtmlReviewEnabled(req.schoolId),
  });
  lesson.title = String(next.title).trim();
  lesson.classId = assignment.classId;
  lesson.subjectId = assignment.subjectId;
  lesson.description = String(next.description || "").trim();
  lesson.subject = String(next.subject || "").trim();
  lesson.grade = String(next.grade || "").trim();
  lesson.language = String(next.language || "en").trim();
  if (slides !== undefined) lesson.slides = normalizeSlides(next.slides);
  await lesson.save();
  return res.json({ success: true, data: { lesson } });
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
    const teacher = await Teacher.findOne({ user: req.user._id, school: req.schoolId })
      .select("_id")
      .lean();
    if (!teacher) {
      return res.status(403).json({ success: false, message: "Teacher profile not found." });
    }
    const assignedClassIds = await getTeacherClassIds(teacher._id);
    filter.classId = {
      $in: await Class.find({
        _id: { $in: assignedClassIds },
        school: req.schoolId,
        isActive: { $ne: false },
      }).distinct("_id"),
    };
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

const buildLiveSessionReportData = async (req, session) => {
  const [students, responses, events, classDoc] = await Promise.all([
    getSessionStudents(session),
    LiveResponse.find({ sessionId: session._id, school: req.schoolId }).lean(),
    LiveSessionEvent.find({ sessionId: session._id, school: req.schoolId }).sort({ seq: 1 }).lean(),
    Class.findOne({ _id: session.classId, school: req.schoolId }).select("name grade section academicYear").lean(),
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
  const questionStateBySlide = new Map();
  for (const event of events) {
    if (event.payload?.slideId && ["question:opened", "question:closed", "results:revealed"].includes(event.type)) {
      questionStateBySlide.set(String(event.payload.slideId), event.type === "question:opened" ? "open" : "closed");
    }
  }
  const currentSlide = session.lessonSnapshot.slides[session.currentSlideIndex];
  const currentQuestionIsOpen = Boolean(session.status === "live" && session.questionOpen && currentSlide?.question);
  const presentedQuestionCount = questionSlides.filter((slide) => (
    questionStateBySlide.has(String(slide._id)) ||
    (currentQuestionIsOpen && String(currentSlide._id) === String(slide._id))
  )).length;
  const perQuestion = questionSlides.map((slide) => {
    const answers = responses.filter((response) => response.slideId === String(slide._id));
    const state = questionStateBySlide.get(String(slide._id));
    const isCurrentOpenQuestion = currentQuestionIsOpen && String(currentSlide._id) === String(slide._id);
    const isOpen = session.status === "live" && (state === "open" || (state === undefined && isCurrentOpenQuestion));
    const opened = state !== undefined || isCurrentOpenQuestion;
    const closed = state === "closed" || (session.status === "ended" && state === "open");
    return {
      slideId: String(slide._id),
      title: slide.title || "",
      prompt: slide.question.prompt,
      options: slide.question.options.map((option) => ({
        id: option.id,
        text: option.text,
        correct: option.id === slide.question.correctOptionId,
      })),
      answered: answers.length,
      correct: answers.filter((answer) => answer.isCorrect).length,
      wrong: answers.filter((answer) => !answer.isCorrect).length,
      unanswered: closed ? Math.max(0, students.length - answers.length) : null,
      pending: isOpen ? Math.max(0, students.length - answers.length) : 0,
      opened,
      closed,
      percentCorrect: answers.length
        ? Math.round((answers.filter((answer) => answer.isCorrect).length / answers.length) * 100)
        : 0,
      perOption: Object.fromEntries(
        slide.question.options.map((option) => [
          option.id,
          answers.filter((answer) => answer.selectedOptionId === option.id).length,
        ]),
      ),
    };
  });

  const endedAt = session.endedAt || new Date();
  const perStudent = students.map((student) => {
    const studentId = String(student.studentId);
    const answers = responses.filter((response) => String(response.studentId) === studentId);
    const studentEvents = events.filter((event) =>
      String(event.actor?.userId || event.payload?.studentId || "") === studentId,
    );
    const joinedEvent = studentEvents.find((event) => event.type === "presence:joined");
    const correct = answers.filter((answer) => answer.isCorrect).length;
    const answerDetails = questionSlides.map((slide, index) => {
      const response = responseByStudentSlide.get(`${studentId}:${String(slide._id)}`);
      const option = (optionId) => slide.question.options.find((item) => item.id === optionId);
      const state = questionStateBySlide.get(String(slide._id));
      const isCurrentOpenQuestion = currentQuestionIsOpen && String(currentSlide._id) === String(slide._id);
      const isOpen = session.status === "live" && (state === "open" || (state === undefined && isCurrentOpenQuestion));
      const closed = state === "closed" || (session.status === "ended" && state === "open");
      return {
        slideId: String(slide._id),
        questionNumber: index + 1,
        title: slide.title || "",
        prompt: slide.question.prompt,
        selectedOptionId: response?.selectedOptionId || null,
        selectedAnswer: response ? option(response.selectedOptionId)?.text || "" : "",
        correctOptionId: slide.question.correctOptionId,
        correctAnswer: option(slide.question.correctOptionId)?.text || "",
        isCorrect: response ? response.isCorrect : null,
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
    return {
      studentId,
      name: student.name,
      joined: Boolean(joinedEvent),
      joinedAt: joinedEvent?.at || null,
      answered: answers.length,
      correct,
      wrong: answers.length - correct,
      unanswered: answerDetails.filter((answer) => answer.status === "unanswered").length,
      pending: answerDetails.filter((answer) => answer.status === "pending").length,
      coveragePercent: presentedQuestionCount ? Math.round((answers.length / presentedQuestionCount) * 100) : 0,
      scorePercent: presentedQuestionCount ? Math.round((correct / presentedQuestionCount) * 100) : 0,
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
    const correct = questionSlides.filter((slide) => (
      responseByStudentSlide.get(`${userId}:${String(slide._id)}`)?.isCorrect === true
    )).length;
    const incidents = visibilityIncidents.get(userId) || 0;
    const score = calculateLiveSessionMark({
      correctAnswers: correct,
      questionCount: questionSlides.length,
      maxMarks: resolvedMaxMarks,
      visibilityIncidents: incidents,
      deductionPerIncident: resolvedDeduction,
    });
    return {
      studentId: String(student._id),
      userId,
      name: `${student.firstName || ""} ${student.lastName || ""}`.trim() || rosterStudent.name,
      correct,
      questionCount: questionSlides.length,
      answered: questionSlides.filter((slide) => responseByStudentSlide.has(`${userId}:${String(slide._id)}`)).length,
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
