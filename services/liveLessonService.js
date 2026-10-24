import LiveGroup from "../models/LiveGroup.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import Student from "../models/Student.js";
import {
  buildLiveStudentQuestion,
  buildLiveTeacherAnswer,
  resolveLiveQuestionForStudent,
} from "./liveLessonQuestionService.js";

export const studentEnrollmentFilter = (classId, userId) => ({
  user: userId,
  $or: [{ currentClass: classId }, { enrolledClasses: classId }],
});

export const isStudentEnrolled = async (classId, userId) =>
  Boolean(await Student.exists(studentEnrollmentFilter(classId, userId)));

export const listEnrolledUserIds = async (classId) => {
  const students = await Student.find({
    $or: [{ currentClass: classId }, { enrolledClasses: classId }],
  })
    .select("user")
    .lean();
  return new Set(students.map((student) => String(student.user)));
};

export const listClassStudents = async (classId) =>
  Student.find({
    $or: [{ currentClass: classId }, { enrolledClasses: classId }],
  })
    .select("user firstName lastName")
    .populate("user", "_id")
    .lean();

export const getSessionStudents = async (session) => {
  if (session.rosterCapturedAt && Array.isArray(session.rosterSnapshot)) {
    return session.rosterSnapshot.map((student) => ({
      studentId: String(student.studentId),
      name: student.name || "Student",
    }));
  }
  return (await listClassStudents(session.classId)).map((student) => ({
    studentId: String(student.user?._id || ""),
    name: `${student.firstName} ${student.lastName}`.trim(),
  }));
};

export const liveEventActorRole = (role) =>
  ["teacher", "admin", "department_principal"].includes(role) ? "teacher" : role;

/**
 * One shuffle per session slide and level: the authored order never reaches a browser, while every
 * student in a level sees the same layout so the teacher can talk the class through it.
 */
export const liveQuestionSeed = (session, slide, groupId) =>
  `${session._id}:${slide._id}:${groupId || "class"}`;

export const groupIdsByStudent = async (session, studentIds = []) => {
  const wanted = studentIds.length ? new Set(studentIds.map(String)) : null;
  const groups = await LiveGroup.find({ school: session.school, classId: session.classId })
    .select("_id studentIds")
    .lean();
  const byStudent = new Map();
  for (const group of groups) {
    for (const studentId of group.studentIds || []) {
      const key = String(studentId);
      if (!wanted || wanted.has(key)) byStudent.set(key, String(group._id));
    }
  }
  return byStudent;
};

export const groupIdForStudent = async (session, studentId) =>
  (await groupIdsByStudent(session, [studentId])).get(String(studentId)) || null;

export const resolveLiveSessionSubjectId = (lesson, classSubjects = []) => {
  const assignedSubjectIds = new Set(classSubjects
    .map((assignment) => String(assignment.subject?._id || assignment.subject || ""))
    .filter(Boolean));
  if (lesson.subjectId && assignedSubjectIds.has(String(lesson.subjectId))) {
    return String(lesson.subjectId);
  }

  const normalizedLessonSubject = String(lesson.subject || "").trim().toLowerCase();
  if (!normalizedLessonSubject) return null;
  const matchingSubjectIds = new Set(classSubjects
    .filter((assignment) => (
      assignment.subject?.name?.trim().toLowerCase() === normalizedLessonSubject
    ))
    .map((assignment) => String(assignment.subject?._id || assignment.subject || ""))
    .filter(Boolean));
  return matchingSubjectIds.size === 1 ? [...matchingSubjectIds][0] : null;
};

export const appendLiveEvent = async (session, type, actor, payload = {}, at = new Date()) => {
  const updated = await LiveSession.findOneAndUpdate(
    { _id: session._id, school: session.school },
    { $inc: { eventSeq: 1 } },
    { new: true },
  );
  if (!updated) throw new Error("Live session disappeared while recording an event.");
  session.eventSeq = updated.eventSeq;
  const offsetMs = Math.max(0, at.getTime() - (session.startedAt || session.createdAt).getTime());
  return LiveSessionEvent.create({
    school: session.school,
    sessionId: session._id,
    seq: updated.eventSeq,
    type,
    at,
    offsetMs,
    actor: { role: liveEventActorRole(actor.role), userId: actor.userId },
    payload,
  });
};

// Any field that carries the answer key, whatever kind the question is.
const TEACHER_ONLY_SLIDE_FIELDS = [
  "correctOptionId",
  "correctOptionIds",
  "correctAnswer",
  "matchingPairs",
  "blanks",
  "numericRule",
  "orderingKey",
  "criteria",
  "explanation",
];

export const safeSlide = (slide) => {
  if (!slide) return null;
  const serialized = typeof slide.toObject === "function" ? slide.toObject() : { ...slide };
  delete serialized.speakerNotes;
  // A levelled variant is only meaningful to the group it was written for, and its key would be
  // readable by any student who opened the payload.
  delete serialized.variants;
  if (serialized.question) {
    const safeQuestion = { ...serialized.question };
    TEACHER_ONLY_SLIDE_FIELDS.forEach((field) => {
      delete safeQuestion[field];
    });
    serialized.question = safeQuestion;
  }
  return serialized;
};

export const sanitizeStudentReplayEvents = (events) => events
  .filter((event) => [
    "session:started",
    "session:paused",
    "session:resumed",
    "session:ended",
    "slide:changed",
    "slide:hidden",
    "question:opened",
    "question:closed",
    "results:revealed",
    "students:fullscreen",
    "students:fullscreen-exited",
  ].includes(event.type))
  .map((event) => ({
    seq: event.seq,
    type: event.type,
    at: event.at,
    offsetMs: event.offsetMs,
    actor: { role: "teacher" },
    payload: {
      ...(event.payload?.slideId ? { slideId: event.payload.slideId } : {}),
      ...(Number.isInteger(event.payload?.index) ? { index: event.payload.index } : {}),
      ...(typeof event.payload?.hidden === "boolean" ? { hidden: event.payload.hidden } : {}),
      ...(typeof event.payload?.enabled === "boolean" ? { enabled: event.payload.enabled } : {}),
    },
  }));

const STAFF_ROLES = ["teacher", "admin", "department_principal"];

/**
 * Everything about a session that is identical for every viewer, split out so a
 * broadcast can build it once and overlay the two per-student fields. A student viewer gets the
 * question levelled for their group, shuffled for that group, and with the key removed.
 */
export const buildSharedState = (session, viewer = null) => {
  const slides = session.lessonSnapshot?.slides || [];
  const slide = slides[session.currentSlideIndex] || null;
  const question = viewer
    ? resolveLiveQuestionForStudent(slide, viewer.groupId)
    : slide?.question || null;
  const viewSlide = viewer && question && slide
    ? {
      ...(typeof slide.toObject === "function" ? slide.toObject() : slide),
      question: buildLiveStudentQuestion(question, liveQuestionSeed(session, slide, viewer.groupId)),
    }
    : slide;
  const questionRevealed = Boolean(
    viewSlide && session.revealedSlideIds.includes(String(viewSlide._id)),
  );
  return {
    slide,
    question,
    questionRevealed,
    state: {
      sessionId: String(session._id),
      status: session.status,
      startedAt: session.startedAt || null,
      timerDurationMinutes: session.timerDurationMinutes || 0,
      paused: Boolean(session.paused),
      pausedAt: session.pausedAt || null,
      totalPausedMs: Number(session.totalPausedMs) || 0,
      currentSlideIndex: session.currentSlideIndex,
      totalSlides: slides.length,
      slideHidden: session.slideHidden,
      studentsFullscreen: Boolean(session.studentsFullscreen),
      questionOpen: session.questionOpen,
      slide: safeSlide(viewSlide),
      myAnswer: null,
      revealed: Boolean(questionRevealed && question),
    },
  };
};

export const applyStudentAnswer = (shared, answer) => ({
  ...shared.state,
  myAnswer: answer
    ? {
      ...(answer.selectedOptionId ? { selectedOptionId: answer.selectedOptionId } : {}),
      ...(answer.response === null || answer.response === undefined ? {} : { response: answer.response }),
      ...(answer.text ? { text: answer.text } : {}),
    }
    : null,
  ...(shared.questionRevealed && answer
    ? {
      myIsCorrect: answer.isCorrect ?? null,
      ...(answer.score === null || answer.score === undefined ? {} : { myScore: answer.score }),
    }
    : {}),
  ...(answer?.grade?.released && answer?.grade?.feedback
    ? { myGrade: { marks: answer.grade.marks, maxMarks: answer.grade.maxMarks, feedback: answer.grade.feedback } }
    : {}),
});

export const applyStaffExtras = (shared, roster) => ({
  ...shared.state,
  teacherAnswer: buildLiveTeacherAnswer(shared.question),
  ...(roster ? { roster } : {}),
});

export const getStateForUser = async (session, user) => {
  if (user.role === "student") {
    const slide = (session.lessonSnapshot?.slides || [])[session.currentSlideIndex] || null;
    const shared = buildSharedState(session, {
      groupId: slide?.variants?.length ? await groupIdForStudent(session, user._id) : null,
    });
    const existingAnswer = shared.slide
      ? await LiveResponse.findOne({
          sessionId: session._id,
          studentId: user._id,
          slideId: String(shared.slide._id),
        })
          .select("selectedOptionId response text isCorrect score grade")
          .lean()
      : null;
    return applyStudentAnswer(shared, existingAnswer);
  }
  const shared = buildSharedState(session);
  if (!STAFF_ROLES.includes(user.role)) return { ...shared.state };

  const roster = (await getSessionStudents(session)).map(({ studentId, name }) => ({
    studentId: String(studentId),
    name,
    presence: "not_joined",
  }));
  return applyStaffExtras(shared, roster);
};

export const formatRoster = (students, presenceMap = new Map()) =>
  students.map((student) => ({
    studentId: String(student.user?._id || student.studentId || ""),
    name: student.name || `${student.firstName || ""} ${student.lastName || ""}`.trim(),
    presence: presenceMap.get(String(student.user?._id || student.studentId || "")) || "not_joined",
  }));
