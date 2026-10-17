import Class from "../models/Class.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import { activeLiveSessionDurationMs, getSessionPauseAccounting } from "./liveSessionTime.js";

const MAX_SESSIONS_PER_REPORT = 500;
const toId = (value) => String(value || "");

const parseDateRange = (dateFrom, dateTo) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom || "") || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo || "")) {
    throw Object.assign(new Error("Choose a valid start and end date."), { statusCode: 400 });
  }
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
    || start.toISOString().slice(0, 10) !== dateFrom
    || end.toISOString().slice(0, 10) !== dateTo
    || start > end) {
    throw Object.assign(new Error("The date range is invalid. Check that the start is not after the end."), { statusCode: 400 });
  }
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw Object.assign(new Error("Choose a date range of 12 months or less."), { statusCode: 400 });
  }
  return { start, end };
};

const awaySeconds = (events, endAt) => {
  let awayAt = null;
  let total = 0;
  for (const event of events) {
    if (event.type === "presence:away" || event.type === "presence:left") awayAt = event.at;
    if ((event.type === "presence:back" || event.type === "presence:joined") && awayAt) {
      total += Math.max(0, new Date(event.at).getTime() - new Date(awayAt).getTime());
      awayAt = null;
    }
  }
  if (awayAt) total += Math.max(0, new Date(endAt).getTime() - new Date(awayAt).getTime());
  return Math.round(total / 1000);
};

const percent = (value, total) => total ? Math.round((value / total) * 100) : 0;

export const buildLiveLessonPerformanceReport = async ({
  req,
  classId,
  dateFrom,
  dateTo,
  studentId: selectedStudentId,
  resolveClass,
  resolveStudents,
}) => {
  if (!classId || !/^[a-f\d]{24}$/i.test(String(classId))) {
    throw Object.assign(new Error("Choose a valid class."), { statusCode: 400 });
  }
  if (selectedStudentId && !/^[a-f\d]{24}$/i.test(String(selectedStudentId))) {
    throw Object.assign(new Error("Choose a valid student."), { statusCode: 400 });
  }
  const { start, end } = parseDateRange(dateFrom, dateTo);
  const classDoc = await resolveClass(req, classId);
  if (!classDoc) {
    throw Object.assign(new Error("You are not assigned to that class."), { statusCode: 403 });
  }
  if (req.user.role === "department_principal") {
    const departmentId = req.departmentId || req.user.department?._id || req.user.department;
    if (!departmentId) {
      throw Object.assign(new Error("Department scope is required to view class performance reports."), { statusCode: 403 });
    }
    const allowedClass = await Class.exists({
      _id: classDoc._id,
      school: req.schoolId,
      department: departmentId,
    });
    if (!allowedClass) {
      throw Object.assign(new Error("You are not authorized to view reports for this class."), { statusCode: 403 });
    }
  }

  const sessions = await LiveSession.find({
    school: req.schoolId,
    classId: classDoc._id,
    status: "ended",
    $or: [
      { startedAt: { $gte: start, $lte: end } },
      { startedAt: { $exists: false }, createdAt: { $gte: start, $lte: end } },
    ],
  })
    .sort({ startedAt: 1, createdAt: 1, _id: 1 })
    .limit(MAX_SESSIONS_PER_REPORT + 1)
    .select("_id lessonSnapshot rosterSnapshot rosterCapturedAt startedAt endedAt createdAt classId totalPausedMs paused pausedAt")
    .lean();
  if (sessions.length > MAX_SESSIONS_PER_REPORT) {
    throw Object.assign(new Error("This date range contains too many sessions. Narrow the range to 500 sessions or fewer."), { statusCode: 400 });
  }
  const sessionWithoutRoster = sessions.find((session) => !session.rosterCapturedAt);
  const fallbackRoster = sessionWithoutRoster && resolveStudents
    ? await resolveStudents(sessionWithoutRoster)
    : null;

  const sessionIds = sessions.map((session) => session._id);
  const [responses, events] = sessionIds.length
    ? await Promise.all([
      LiveResponse.find({ school: req.schoolId, sessionId: { $in: sessionIds } })
        .select("sessionId studentId slideId isCorrect latencyMs")
        .lean(),
      LiveSessionEvent.find({
        school: req.schoolId,
        sessionId: { $in: sessionIds },
        type: { $in: [
          "presence:joined", "presence:left", "presence:away", "presence:back",
          "session:paused", "session:resumed", "session:ended",
        ] },
      })
        .select("sessionId type at actor payload")
        .sort({ at: 1 })
        .lean(),
    ])
    : [[], []];

  const responsesBySession = new Map();
  for (const response of responses) {
    const key = toId(response.sessionId);
    if (!responsesBySession.has(key)) responsesBySession.set(key, []);
    responsesBySession.get(key).push(response);
  }
  const eventsBySessionStudent = new Map();
  const joinedStudentsBySession = new Map();
  for (const event of events) {
    const sessionKey = toId(event.sessionId);
    const studentKey = toId(event.actor?.userId || event.payload?.studentId);
    if (!studentKey) continue;
    if (event.type === "presence:joined") {
      if (!joinedStudentsBySession.has(sessionKey)) joinedStudentsBySession.set(sessionKey, new Set());
      joinedStudentsBySession.get(sessionKey).add(studentKey);
    }
    const key = `${sessionKey}:${studentKey}`;
    if (!eventsBySessionStudent.has(key)) eventsBySessionStudent.set(key, []);
    eventsBySessionStudent.get(key).push(event);
  }

  const studentStats = new Map();
  const sessionMetrics = [];
  const studentSessionMetrics = [];
  let totalRoster = 0;
  let totalJoined = 0;
  let totalParticipating = 0;
  let totalQuestions = 0;
  let totalAnswers = 0;
  let totalCorrect = 0;
  let durationSumMinutes = 0;

  for (const session of sessions) {
    const sid = toId(session._id);
    const roster = session.rosterCapturedAt
      ? Array.isArray(session.rosterSnapshot) ? session.rosterSnapshot : []
      : fallbackRoster || [];
    const questionCount = (session.lessonSnapshot?.slides || []).filter((slide) => slide.question).length;
    const sessionResponses = responsesBySession.get(sid) || [];
    const sessionJoined = joinedStudentsBySession.get(sid) || new Set();
    const sessionEvents = events.filter((event) => toId(event.sessionId) === sid);
    const pauseAccounting = getSessionPauseAccounting(sessionEvents);
    const durationMinutes = activeLiveSessionDurationMs({
      ...session,
      totalPausedMs: Number(session.totalPausedMs) || pauseAccounting.totalPausedMs,
      pausedAt: session.pausedAt || pauseAccounting.pausedAt,
      paused: Boolean(session.paused || (!session.endedAt && pauseAccounting.pausedAt)),
    }) / 60000;
    const rosterIds = new Set(roster.map((student) => toId(student.studentId)).filter(Boolean));
    const rosterResponses = sessionResponses.filter((response) => rosterIds.has(toId(response.studentId)));
    totalRoster += roster.length;
    totalJoined += [...sessionJoined].filter((id) => rosterIds.has(id)).length;
    totalQuestions += roster.length * questionCount;
    totalAnswers += rosterResponses.length;
    totalCorrect += rosterResponses.filter((response) => response.isCorrect).length;
    durationSumMinutes += durationMinutes;
    const participatingIds = new Set(sessionResponses
      .map((response) => toId(response.studentId))
      .filter((id) => rosterIds.has(id)));
    totalParticipating += participatingIds.size;

    for (const student of roster) {
      const studentId = toId(student.studentId);
      if (!studentId) continue;
      const key = studentId;
      if (!studentStats.has(key)) {
        studentStats.set(key, {
          studentId,
          name: student.name || "Student",
          sessions: 0,
          joined: 0,
          answers: 0,
          correct: 0,
          questions: 0,
          awaySeconds: 0,
        });
      }
      const stats = studentStats.get(key);
      stats.sessions += 1;
      stats.questions += questionCount;
      const joined = sessionJoined.has(studentId);
      if (joined) stats.joined += 1;
      const studentResponses = sessionResponses.filter((response) => toId(response.studentId) === studentId);
      if (selectedStudentId && studentId === String(selectedStudentId)) {
        studentSessionMetrics.push({
          sessionId: sid,
          studentId,
          name: student.name || "Student",
          title: session.lessonSnapshot?.title || "Live lesson",
          date: session.startedAt || session.createdAt,
          joined,
          participated: studentResponses.length > 0,
          answers: studentResponses.length,
          correct: studentResponses.filter((response) => response.isCorrect).length,
          questions: questionCount,
        });
      }
      stats.answers += studentResponses.length;
      stats.correct += studentResponses.filter((response) => response.isCorrect).length;
      stats.awaySeconds += awaySeconds(
        eventsBySessionStudent.get(`${sid}:${studentId}`) || [],
        session.endedAt || session.startedAt
      );
    }

    sessionMetrics.push({
      sessionId: sid,
      title: session.lessonSnapshot?.title || "Live lesson",
      date: session.startedAt || session.createdAt,
      rosterCount: roster.length,
      joinedCount: [...sessionJoined].filter((id) => rosterIds.has(id)).length,
      participatingCount: participatingIds.size,
      questionOpportunities: roster.length * questionCount,
      submittedAnswers: rosterResponses.length,
      correctAnswers: rosterResponses.filter((response) => response.isCorrect).length,
      attendanceRate: percent([...sessionJoined].filter((id) => rosterIds.has(id)).length, roster.length),
      engagementRate: percent(participatingIds.size, roster.length),
      accuracyRate: percent(rosterResponses.filter((response) => response.isCorrect).length, rosterResponses.length),
      responseCount: rosterResponses.length,
      questionCount,
      durationMinutes: Math.round(durationMinutes),
    });
  }

  const students = [...studentStats.values()]
    .map((student) => ({
      ...student,
      attendanceRate: percent(student.joined, student.sessions),
      engagementRate: percent(student.answers, student.questions),
      accuracyRate: percent(student.correct, student.answers),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    class: {
      id: toId(classDoc._id),
      name: classDoc.name || "Class",
      grade: classDoc.grade ?? null,
      section: classDoc.section || "",
    },
    dateFrom,
    dateTo,
    summary: {
      sessionCount: sessions.length,
      studentCount: students.length,
      averageAttendanceRate: percent(totalJoined, totalRoster),
      participationRate: percent(totalParticipating, totalRoster),
      averageEngagementRate: percent(totalAnswers, totalQuestions),
      averageAccuracyRate: percent(totalCorrect, totalAnswers),
      responseCount: totalAnswers,
      averageSessionMinutes: sessions.length ? Math.round(durationSumMinutes / sessions.length) : 0,
    },
    sessions: sessionMetrics,
    students,
    studentSessionMetrics: selectedStudentId
      ? studentSessionMetrics
      : [],
  };
};
