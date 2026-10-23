import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import Student from "../models/Student.js";

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

export const safeSlide = (slide) => {
  if (!slide) return null;
  const serialized = typeof slide.toObject === "function" ? slide.toObject() : { ...slide };
  delete serialized.speakerNotes;
  if (serialized.question) {
    const safeQuestion = { ...serialized.question };
    delete safeQuestion.correctOptionId;
    delete safeQuestion.explanation;
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
 * broadcast can build it once and overlay the two per-student fields.
 */
export const buildSharedState = (session) => {
  const slides = session.lessonSnapshot?.slides || [];
  const slide = slides[session.currentSlideIndex] || null;
  const questionRevealed = Boolean(
    slide && session.revealedSlideIds.includes(String(slide._id)),
  );
  return {
    slide,
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
      slide: safeSlide(slide),
      myAnswer: null,
      revealed: Boolean(questionRevealed && slide?.question),
    },
  };
};

export const applyStudentAnswer = (shared, answer) => ({
  ...shared.state,
  myAnswer: answer ? { selectedOptionId: answer.selectedOptionId } : null,
  ...(shared.questionRevealed && answer ? { myIsCorrect: answer.isCorrect } : {}),
});

export const applyStaffExtras = (shared, roster) => ({
  ...shared.state,
  teacherAnswer: shared.slide?.question
    ? {
        correctOptionId: shared.slide.question.correctOptionId,
        explanation: shared.slide.question.explanation || "",
      }
    : null,
  ...(roster ? { roster } : {}),
});

export const getStateForUser = async (session, user) => {
  const shared = buildSharedState(session);
  if (user.role === "student") {
    const existingAnswer = shared.slide
      ? await LiveResponse.findOne({
          sessionId: session._id,
          studentId: user._id,
          slideId: String(shared.slide._id),
        })
          .select("selectedOptionId isCorrect")
          .lean()
      : null;
    return applyStudentAnswer(shared, existingAnswer);
  }
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
