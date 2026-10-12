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

export const safeSlide = (slide, revealed) => {
  if (!slide) return null;
  const serialized = typeof slide.toObject === "function" ? slide.toObject() : { ...slide };
  if (!revealed && serialized.question) {
    const safeQuestion = { ...serialized.question };
    delete safeQuestion.correctOptionId;
    delete safeQuestion.explanation;
    serialized.question = safeQuestion;
  }
  return serialized;
};

export const getStateForUser = async (session, user) => {
  const slides = session.lessonSnapshot?.slides || [];
  const slide = slides[session.currentSlideIndex] || null;
  const revealed = Boolean(slide && session.revealedSlideIds.includes(String(slide._id)));
  const student = user.role === "student";
  const existingAnswer =
    student && slide
      ? await LiveResponse.findOne({
          sessionId: session._id,
          studentId: user._id,
          slideId: String(slide._id),
        })
          .select("selectedOptionId isCorrect")
          .lean()
      : null;
  const state = {
    sessionId: String(session._id),
    status: session.status,
    currentSlideIndex: session.currentSlideIndex,
    totalSlides: slides.length,
    slideHidden: session.slideHidden,
    questionOpen: session.questionOpen,
    slide: safeSlide(slide, !student || revealed),
    myAnswer: existingAnswer ? { selectedOptionId: existingAnswer.selectedOptionId } : null,
    ...(student && revealed && existingAnswer ? { myIsCorrect: existingAnswer.isCorrect } : {}),
    revealed: revealed && slide?.question
      ? {
          correctOptionId: slide.question.correctOptionId,
          explanation: slide.question.explanation || "",
        }
      : null,
  };
  if (user.role !== "teacher" && user.role !== "admin" && user.role !== "department_principal") {
    return state;
  }

  const roster = await getSessionStudents(session);
  const responses = slide?.question
    ? await LiveResponse.find({ sessionId: session._id, slideId: String(slide._id) })
        .select("studentId selectedOptionId isCorrect latencyMs")
        .lean()
    : [];
  const responseByStudent = new Map(responses.map((response) => [String(response.studentId), response]));
  const students = roster.map((studentRecord) => {
    const studentId = String(studentRecord.studentId);
    const response = responseByStudent.get(studentId);
    return {
      studentId,
      name: studentRecord.name,
      status: response ? (response.isCorrect ? "correct" : "wrong") : "unanswered",
      selectedOptionId: response?.selectedOptionId || null,
      latencyMs: response?.latencyMs ?? null,
    };
  });
  state.roster = students.map(({ studentId, name }) => ({
    studentId,
    name,
    presence: "not_joined",
  }));
  state.answers = slide?.question
    ? {
        slideId: String(slide._id),
        kind: slide.question.kind,
        totalStudents: students.length,
        answered: responses.length,
        correctCount: responses.filter((response) => response.isCorrect).length,
        wrongCount: responses.filter((response) => !response.isCorrect).length,
        unansweredCount: Math.max(0, students.length - responses.length),
        perOption: Object.fromEntries(
          slide.question.options.map((option) => [
            option.id,
            responses.filter((response) => response.selectedOptionId === option.id).length,
          ]),
        ),
        students,
      }
    : null;
  return state;
};

export const formatRoster = (students, presenceMap = new Map()) =>
  students.map((student) => ({
    studentId: String(student.user?._id || student.studentId || ""),
    name: student.name || `${student.firstName || ""} ${student.lastName || ""}`.trim(),
    presence: presenceMap.get(String(student.user?._id || student.studentId || "")) || "not_joined",
  }));
