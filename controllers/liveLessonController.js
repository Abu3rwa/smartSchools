import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import Class from "../models/Class.js";
import LiveLesson from "../models/LiveLesson.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import Teacher from "../models/Teacher.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parseLiveLessonCsv } from "../services/liveLessonCsvService.js";
import {
  appendLiveEvent,
  formatRoster,
  getSessionStudents,
  getStateForUser,
  isStudentEnrolled,
  listClassStudents,
} from "../services/liveLessonService.js";

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
  if (!ownsSession) {
    res.status(403).json({ success: false, message: "Only the session teacher can access this." });
    return null;
  }
  return session;
};

const findTeacherClass = async (req, classId) => {
  const query = { _id: classId, school: req.schoolId, isActive: { $ne: false } };
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
    examples: Array.isArray(slide.examples) ? slide.examples.map((value) => String(value)) : [],
    imageUrl: String(slide.imageUrl || "").trim(),
    speakerNotes: String(slide.speakerNotes || "").trim(),
    ...(slide.question ? { question: slide.question } : {}),
  }));

const createJoinCode = () =>
  Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)]).join("");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

const validateLessonEdit = ({ title, description, slides }) => {
  const errors = [];
  if (!String(title || "").trim() || String(title).trim().length > 200) {
    errors.push({ field: "title", message: "Lesson title is required and must be 200 characters or fewer." });
  }
  if (String(description || "").length > 1000) {
    errors.push({ field: "description", message: "Description must be 1,000 characters or fewer." });
  }
  if (!Array.isArray(slides) || slides.length < 1 || slides.length > 200) {
    errors.push({ field: "slides", message: "Lessons must contain 1–200 slides." });
    return errors;
  }
  const slideTypes = new Set(["opening", "goals", "content", "examples", "question", "activity", "exit-ticket"]);
  slides.forEach((slide, index) => {
    const row = index + 1;
    if (!slideTypes.has(slide.type)) {
      errors.push({ row, field: "slide type", message: "Unsupported slide type." });
    }
    for (const [field, value, max] of [
      ["title", slide.title, 200],
      ["body", slide.body, 5000],
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
  });
  return errors;
};

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
  const lesson = await LiveLesson.create({
    school: req.schoolId,
    ownerId: req.user._id,
    ...result.lesson,
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
  const { title, description, slides } = req.body || {};
  const errors = validateLessonEdit({ title, description, slides });
  if (errors.length) {
    return res.status(400).json({ success: false, message: "Lesson changes are invalid.", errors });
  }
  const lesson = await LiveLesson.create({
    school: req.schoolId,
    ownerId: req.user._id,
    source: "csv",
    title: String(title).trim(),
    description: String(description || "").trim(),
    slides: normalizeSlides(slides),
  });
  return res.status(201).json({ success: true, data: { lesson } });
});

export const listLiveLessons = asyncHandler(async (req, res) => {
  const lessons = await LiveLesson.find({ school: req.schoolId, ownerId: req.user._id })
    .sort({ updatedAt: -1 })
    .select("title description slides.order slides.type createdAt updatedAt")
    .lean();
  return res.json({ success: true, data: { lessons } });
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
  const { title, description, slides } = req.body || {};
  const next = {
    title: title === undefined ? lesson.title : title,
    description: description === undefined ? lesson.description : description,
    slides: slides === undefined ? lesson.slides : slides,
  };
  const errors = validateLessonEdit(next);
  if (errors.length) {
    return res.status(400).json({ success: false, message: "Lesson changes are invalid.", errors });
  }
  lesson.title = String(next.title).trim();
  lesson.description = String(next.description || "").trim();
  if (slides !== undefined) lesson.slides = normalizeSlides(next.slides);
  await lesson.save();
  return res.json({ success: true, data: { lesson } });
});

export const deleteLiveLesson = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid lesson ID." });
  const lesson = await LiveLesson.findOneAndDelete({
    _id: req.params.id,
    school: req.schoolId,
    ownerId: req.user._id,
  });
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found." });
  return res.json({ success: true, message: "Lesson deleted." });
});

export const createLiveSession = asyncHandler(async (req, res) => {
  const { lessonId, classId } = req.body || {};
  if (!validId(lessonId) || !validId(classId)) {
    return res.status(400).json({ success: false, message: "Choose a valid lesson and class." });
  }
  const [lesson, classDoc] = await Promise.all([
    LiveLesson.findOne({ _id: lessonId, school: req.schoolId, ownerId: req.user._id }),
    findTeacherClass(req, classId),
  ]);
  if (!lesson) return res.status(404).json({ success: false, message: "Lesson not found or not owned by you." });
  if (!classDoc) return res.status(403).json({ success: false, message: "You are not assigned to that class." });
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
      slides: lesson.slides.map((slide) => slide.toObject()),
    },
    rosterSnapshot,
    rosterCapturedAt: new Date(),
    classId: classDoc._id,
    teacherId: req.user._id,
    joinCode,
  });
  await appendLiveEvent(session, "session:created", { role: req.user.role, userId: req.user._id });
  return res.status(201).json({
    success: true,
    data: {
      session: {
        _id: session._id,
        status: session.status,
        joinCode: session.joinCode,
        classId: session.classId,
        lessonTitle: lesson.title,
      },
    },
  });
});

export const listLiveSessions = asyncHandler(async (req, res) => {
  const sessions = await LiveSession.find({ school: req.schoolId, teacherId: req.user._id })
    .sort({ createdAt: -1 })
    .select("lessonSnapshot.title classId status joinCode currentSlideIndex createdAt startedAt endedAt")
    .populate("classId", "name grade section")
    .lean();
  return res.json({ success: true, data: { sessions } });
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
  if (!isOwner && !isStudent) return res.status(403).json({ success: false, message: "You are not a participant in this session." });
  const state = await getStateForUser(session, req.user);
  const payload = {
    _id: String(session._id),
    status: session.status,
    joinCode: isOwner ? session.joinCode : undefined,
    lessonTitle: session.lessonSnapshot.title,
    classId: String(session.classId),
    currentSlideIndex: session.currentSlideIndex,
    totalSlides: session.lessonSnapshot.slides.length,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    state,
  };
  if (isOwner) payload.roster = formatRoster(await getSessionStudents(session));
  return res.json({ success: true, data: { session: payload } });
});

export const getLiveSessionReplay = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  const [students, events] = await Promise.all([
    getSessionStudents(session),
    LiveSessionEvent.find({ sessionId: session._id, school: req.schoolId })
      .sort({ seq: 1 })
      .lean(),
  ]);
  return res.json({
    success: true,
    data: {
      session: {
        id: String(session._id),
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationMs: session.startedAt
          ? Math.max(0, (session.endedAt || new Date()).getTime() - session.startedAt.getTime())
          : 0,
      },
      lesson: session.lessonSnapshot,
      students,
      events,
    },
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

export const getLiveSessionReport = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req, res);
  if (!session) return;
  const [students, responses, events] = await Promise.all([
    getSessionStudents(session),
    LiveResponse.find({ sessionId: session._id, school: req.schoolId }).lean(),
    LiveSessionEvent.find({ sessionId: session._id, school: req.schoolId }).sort({ seq: 1 }).lean(),
  ]);
  const questionSlides = session.lessonSnapshot.slides.filter((slide) => slide.question);
  const perQuestion = questionSlides.map((slide) => {
    const answers = responses.filter((response) => response.slideId === String(slide._id));
    return {
      slideId: String(slide._id),
      prompt: slide.question.prompt,
      answered: answers.length,
      correct: answers.filter((answer) => answer.isCorrect).length,
      wrong: answers.filter((answer) => !answer.isCorrect).length,
      unanswered: Math.max(0, students.length - answers.length),
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
    const joinedEvent = events.find((event) => event.type === "presence:joined" && String(event.actor?.userId) === studentId);
    const correct = answers.filter((answer) => answer.isCorrect).length;
    return {
      studentId,
      name: student.name,
      answered: answers.length,
      correct,
      wrong: answers.length - correct,
      unanswered: Math.max(0, questionSlides.length - answers.length),
      scorePercent: questionSlides.length ? Math.round((correct / questionSlides.length) * 100) : 0,
      totalAwaySeconds: awayDurationForStudent(events, studentId, endedAt),
      joinedAt: joinedEvent?.at || null,
    };
  });
  return res.json({
    success: true,
    data: {
      session: { id: String(session._id), title: session.lessonSnapshot.title, status: session.status },
      perQuestion,
      perStudent,
    },
  });
});
