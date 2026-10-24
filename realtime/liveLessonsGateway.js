import jwt from "jsonwebtoken";
import process from "node:process";
import { clearInterval, clearTimeout, setInterval, setTimeout } from "node:timers";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import Class from "../models/Class.js";
import User from "../models/User.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import logger from "../utils/logger.js";
import { isAllowedRequestOrigin } from "../utils/requestOrigins.js";
import { staffClassQuery } from "../helpers/liveLessonAccess.js";
import { resumeLiveSessionPause } from "../services/liveSessionTime.js";
import {
  appendLiveEvent,
  applyStaffExtras,
  applyStudentAnswer,
  buildSharedState,
  formatRoster,
  groupIdForStudent,
  groupIdsByStudent,
  listClassStudents,
  listEnrolledUserIds,
  getSessionStudents,
  isStudentEnrolled,
} from "../services/liveLessonService.js";
import { isLiveWrittenKind, liveQuestionKind } from "../constants/liveLessonQuestionKinds.js";
import {
  gradeLiveAnswer,
  isLiveAnswerEmpty,
  resolveLiveQuestionForStudent,
  sanitizeLiveAnswer,
} from "../services/liveLessonQuestionService.js";

const AUTH_TIMEOUT_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 15000;
const RATE_WINDOW_MS = 60 * 1000;
// Presence frames repeat on a timer for every student, so they may reuse a recently
// read session document. Anything that changes lesson state still reads it fresh.
const SESSION_CACHE_TTL_MS = 15000;
const RATE_LIMITS = {
  action: 120,
  join: 20,
  cursor: 1000,
};
const OPEN = 1;
const connections = new Set();
const sessionSockets = new Map();
const studentPresence = new Map();
const studentStatuses = new Map();
const cursorSpotlights = new Map();

const socketKey = (sessionId, studentId) => `${sessionId}:${studentId}`;
const sessionKey = (sessionId) => String(sessionId);
const send = (socket, payload) => {
  if (socket.readyState === OPEN) socket.send(JSON.stringify(payload));
};

const takeRateToken = (socket, bucket) => {
  const limit = RATE_LIMITS[bucket];
  if (!Number.isFinite(limit)) return true;
  const buckets = socket.__rateBuckets || (socket.__rateBuckets = {});
  const now = Date.now();
  const window = buckets[bucket];
  if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
    buckets[bucket] = { startedAt: now, count: 1 };
    return true;
  }
  window.count += 1;
  return window.count <= limit;
};

const broadcast = (sessionId, payload, teacherOnly = false) => {
  const sockets = sessionSockets.get(sessionKey(sessionId));
  if (!sockets) return;
  for (const socket of sockets) {
    if (!teacherOnly || socket.__liveRole !== "student") send(socket, payload);
  }
};

const broadcastCursorSpotlight = (sessionId, spotlight) => {
  for (const socket of sessionSockets.get(sessionKey(sessionId)) || []) {
    send(socket, { type: "cursor:spotlight", data: spotlight });
  }
};

const resetCursorSpotlight = (sessionId) => {
  const sockets = sessionSockets.get(sessionKey(sessionId));
  if (!sockets?.size) {
    cursorSpotlights.delete(sessionKey(sessionId));
    return;
  }
  const spotlight = { enabled: false, visible: false, x: null, y: null };
  cursorSpotlights.set(sessionKey(sessionId), spotlight);
  broadcastCursorSpotlight(sessionId, spotlight);
};

const hideCursorSpotlight = (sessionId) => {
  const current = cursorSpotlights.get(sessionKey(sessionId));
  if (!current?.enabled || !current.visible) return;
  const spotlight = { ...current, visible: false, x: null, y: null };
  cursorSpotlights.set(sessionKey(sessionId), spotlight);
  broadcastCursorSpotlight(sessionId, spotlight);
};

const handleCursorMessage = (socket, message) => {
  if (
    !socket.__liveIsOwner ||
    !socket.__liveSessionId ||
    socket.__liveSessionEnded
  ) {
    return;
  }

  const sessionId = socket.__liveSessionId;
  const action = message.action;
  const data = message.data && typeof message.data === "object" ? message.data : {};
  const current = cursorSpotlights.get(sessionKey(sessionId)) || {
    enabled: false,
    visible: false,
    x: null,
    y: null,
  };

  if (action === "toggle") {
    if (typeof data.enabled !== "boolean") return;
    const now = Date.now();
    if (now - (socket.__lastCursorControlAt || 0) < 100) return;
    socket.__lastCursorControlAt = now;
    const spotlight = data.enabled
      ? { enabled: true, visible: false, x: null, y: null }
      : { enabled: false, visible: false, x: null, y: null };
    cursorSpotlights.set(sessionKey(sessionId), spotlight);
    broadcastCursorSpotlight(sessionId, spotlight);
    return;
  }

  if (!current.enabled) return;
  if (action === "hide") {
    const now = Date.now();
    if (now - (socket.__lastCursorHideAt || 0) < 33) return;
    socket.__lastCursorHideAt = now;
    hideCursorSpotlight(sessionId);
    return;
  }
  if (
    action !== "move" ||
    !Number.isFinite(data.x) ||
    !Number.isFinite(data.y) ||
    data.x < 0 ||
    data.x > 1 ||
    data.y < 0 ||
    data.y > 1
  ) {
    return;
  }

  const now = Date.now();
  if (now - (socket.__lastCursorUpdateAt || 0) < 33) return;
  socket.__lastCursorUpdateAt = now;
  const spotlight = { enabled: true, visible: true, x: data.x, y: data.y };
  cursorSpotlights.set(sessionKey(sessionId), spotlight);
  broadcastCursorSpotlight(sessionId, spotlight);
};

const connectPresence = (socket) => {
  if (socket.__liveRole !== "student") return;
  const key = socketKey(socket.__liveSessionId, socket.__liveUserId);
  const sockets = studentPresence.get(key) || new Set();
  sockets.add(socket);
  studentPresence.set(key, sockets);
};

const removeFromSession = (socket, { markLeft = false } = {}) => {
  const key = sessionKey(socket.__liveSessionId);
  const current = sessionSockets.get(key);
  if (current) {
    current.delete(socket);
    if (current.size === 0) {
      sessionSockets.delete(key);
      cursorSpotlights.delete(key);
      studentStatuses.delete(key);
    }
  }
  if (socket.__liveRole === "student") {
    const presenceKey = socketKey(socket.__liveSessionId, socket.__liveUserId);
    const sockets = studentPresence.get(presenceKey);
    if (sockets) {
      sockets.delete(socket);
      if (!sockets.size) studentPresence.delete(presenceKey);
    }
    if (markLeft && sessionSockets.has(key)) {
      const statuses = studentStatuses.get(key) || new Map();
      statuses.set(String(socket.__liveUserId), "disconnected");
      studentStatuses.set(key, statuses);
    }
  }
};

const detachSocket = (socket) => {
  connections.delete(socket);
  removeFromSession(socket);
  socket.__liveSessionCache = null;
};

const getPresenceMap = (sessionId) => {
  const result = new Map(studentStatuses.get(sessionKey(sessionId)) || []);
  for (const [key, sockets] of studentPresence.entries()) {
    if (!key.startsWith(`${sessionId}:`)) continue;
    const userId = key.slice(String(sessionId).length + 1);
    const active = [...sockets].some(
      (socket) => !socket.__liveAway && Date.now() - socket.__lastPingAt < HEARTBEAT_TIMEOUT_MS,
    );
    const recentlyConnected = [...sockets].some(
      (socket) => Date.now() - socket.__lastPingAt < HEARTBEAT_TIMEOUT_MS,
    );
    result.set(userId, active ? "in_lesson" : recentlyConnected ? "away" : "disconnected");
  }
  return result;
};

const emitRoster = async (session) => {
  const students = await getSessionStudents(session);
  broadcast(session._id, {
    type: "roster:update",
    data: { roster: formatRoster(students, getPresenceMap(session._id)) },
  }, true);
};

const broadcastState = async (session) => {
  const sockets = [...(sessionSockets.get(sessionKey(session._id)) || [])];
  if (!sockets.length) return;
  const slide = (session.lessonSnapshot?.slides || [])[session.currentSlideIndex] || null;
  const leveled = Boolean(slide?.variants?.length);
  const studentSockets = sockets.filter((socket) => socket.__liveRole === "student");
  const staffSockets = sockets.filter((socket) => socket.__liveRole !== "student");

  // One enrollment read and one answer read for the whole room, instead of a
  // round trip per socket on every slide change.
  const enrolledIds = studentSockets.length ? await listEnrolledUserIds(session.classId) : null;
  const answers = studentSockets.length && slide
    ? await LiveResponse.find({
        sessionId: session._id,
        slideId: String(slide._id),
        studentId: { $in: [...new Set(studentSockets.map((socket) => socket.__liveUserId))] },
      })
        .select("studentId selectedOptionId response text isCorrect score grade")
        .lean()
    : [];
  const answerByStudent = new Map(answers.map((answer) => [String(answer.studentId), answer]));
  // Groups only matter while the slide is levelled, so a normal lesson never pays for the read.
  const groupByStudent = studentSockets.length && leveled
    ? await groupIdsByStudent(session, studentSockets.map((socket) => socket.__liveUserId))
    : null;

  // One payload per level, not per student: a class of thirty on three levels builds three states.
  const sharedByLevel = new Map();
  const sharedForLevel = (groupId) => {
    const key = groupId || "class";
    if (!sharedByLevel.has(key)) sharedByLevel.set(key, buildSharedState(session, { groupId }));
    return sharedByLevel.get(key);
  };

  for (const socket of studentSockets) {
    socket.__liveSessionCache = { id: String(session._id), at: Date.now(), session };
    if (!enrolledIds.has(String(socket.__liveUserId))) {
      fail(socket, null, "FORBIDDEN", "You are no longer enrolled in this class.");
      socket.close(1008, "Class enrollment changed");
      continue;
    }
    const groupId = groupByStudent?.get(String(socket.__liveUserId)) || null;
    send(socket, {
      type: "session:state",
      data: applyStudentAnswer(sharedForLevel(groupId), answerByStudent.get(String(socket.__liveUserId)) || null),
    });
  }

  if (!staffSockets.length) return;
  const staffState = applyStaffExtras(
    buildSharedState(session),
    formatRoster(await getSessionStudents(session), getPresenceMap(session._id)),
  );
  for (const socket of staffSockets) {
    socket.__liveSessionCache = { id: String(session._id), at: Date.now(), session };
    send(socket, { type: "teacher:state", data: staffState });
  }
};

const fail = (socket, requestId, code, message) =>
  send(socket, { type: "ack", requestId, ok: false, error: { code, message } });

const persistPresence = async (session, socket, action, reason) => {
  const now = new Date();
  const payload = { studentId: String(socket.__liveUserId) };
  if (reason) payload.reason = reason;
  await appendLiveEvent(
    session,
    action === "away" ? "presence:away" : "presence:back",
    { role: "student", userId: socket.__liveUserId },
    payload,
    now,
  );
  socket.__liveAway = action === "away";
  const statuses = studentStatuses.get(sessionKey(session._id)) || new Map();
  const sockets = studentPresence.get(socketKey(session._id, socket.__liveUserId)) || new Set();
  statuses.set(
    String(socket.__liveUserId),
    [...sockets].some((candidate) => !candidate.__liveAway) ? "in_lesson" : "away",
  );
  studentStatuses.set(sessionKey(session._id), statuses);
  await emitRoster(session);
};

const handleAction = async (socket, message) => {
  const { action, data = {}, requestId } = message;
  const cacheable = action === "presence:ping" || action === "session:state";
  const cached = socket.__liveSessionCache;
  let session = cacheable
    && cached?.id === String(socket.__liveSessionId)
    && Date.now() - cached.at < SESSION_CACHE_TTL_MS
    ? cached.session
    : null;
  if (!session) {
    session = await LiveSession.findOne({
      _id: socket.__liveSessionId,
      school: socket.__liveSchoolId,
    });
    if (session) socket.__liveSessionCache = { id: String(session._id), at: Date.now(), session };
  }
  if (!session) return fail(socket, requestId, "NOT_FOUND", "Live session not found.");
  if (session.status === "ended" && action !== "session:state") {
    return fail(socket, requestId, "SESSION_ENDED", "This session has ended.");
  }
  const isTeacher = socket.__liveRole !== "student";
  const userId = String(socket.__liveUserId);
  // Enrollment is proved at join and re-checked for every socket on every state
  // broadcast, so a heartbeat-only frame does not need its own read; the moment a
  // student stops being enrolled the next broadcast closes their socket.
  if (!isTeacher && action !== "presence:ping" && !(await isStudentEnrolled(session.classId, userId))) {
    return fail(socket, requestId, "FORBIDDEN", "You are no longer enrolled in this class.");
  }

  if (action === "presence:ping") {
    socket.__lastPingAt = Date.now();
    if (socket.__heartbeatLost) {
      socket.__heartbeatLost = false;
      socket.__liveAway = false;
      const statuses = studentStatuses.get(sessionKey(session._id)) || new Map();
      statuses.set(userId, "in_lesson");
      studentStatuses.set(sessionKey(session._id), statuses);
      await appendLiveEvent(
  session,
  "presence:back",
  { role: "student", userId: socket.__liveUserId },
  { studentId: userId, reason: "heartbeat_resumed" },
      );
      await emitRoster(session);
    }
    return send(socket, { type: "ack", requestId, ok: true });
  }
  if (action === "presence:away" || action === "presence:back") {
    if (isTeacher) return fail(socket, requestId, "FORBIDDEN", "Only students report presence.");
    const expectedReason = action.endsWith("away") ? "visibility_hidden" : "visibility_visible";
    if (data.reason && data.reason !== expectedReason) {
      return fail(socket, requestId, "VALIDATION", "Invalid presence event reason.");
    }
    await persistPresence(session, socket, action.endsWith("away") ? "away" : "back", data.reason);
    return send(socket, { type: "ack", requestId, ok: true });
  }
  if (!isTeacher) {
    if (action !== "answer:submit") {
      return fail(socket, requestId, "FORBIDDEN", "Students cannot control the lesson.");
    }
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    if (
      session.status !== "live" ||
      session.paused ||
      !session.questionOpen ||
      !slide?.question ||
      String(slide._id) !== String(data.slideId)
    ) {
      return fail(socket, requestId, "QUESTION_CLOSED", "This question is not open for answers.");
    }
    const submittedAt = new Date();
    // A levelled slide sends each group its own question, so the answer is checked and graded
    // against the version this student was actually shown.
    const groupId = slide.variants?.length ? await groupIdForStudent(session, userId) : null;
    const question = resolveLiveQuestionForStudent(slide, groupId);
    const kind = liveQuestionKind(question);
    const answer = sanitizeLiveAnswer(question, data);
    if (isLiveAnswerEmpty(question, answer)) {
      return fail(socket, requestId, "VALIDATION", "Answer the question before submitting it.");
    }
    const graded = gradeLiveAnswer(question, answer);
    const openedEvent = await LiveSessionEvent.findOne({
      sessionId: session._id,
      type: "question:opened",
      "payload.slideId": String(slide._id),
    }).sort({ seq: -1 }).lean();
    const response = await LiveResponse.create({
      school: session.school,
      sessionId: session._id,
      studentId: socket.__liveUserId,
      slideId: String(slide._id),
      selectedOptionId: answer.selectedOptionId || "",
      ...("response" in answer ? { response: answer.response } : {}),
      ...("text" in answer ? { text: answer.text } : {}),
      isCorrect: graded.isCorrect,
      score: graded.score,
      grade: {
        status: graded.status,
        source: isLiveWrittenKind(kind) ? "teacher" : "objective",
        released: false,
        feedback: graded.feedback,
      },
      submittedAt,
      latencyMs: openedEvent ? Math.max(0, submittedAt.getTime() - new Date(openedEvent.at).getTime()) : 0,
    }).catch(async (error) => {
      if (error?.code === 11000) return null;
      throw error;
    });
    if (!response) return fail(socket, requestId, "ALREADY_ANSWERED", "Your answer has already been submitted.");
    await appendLiveEvent(
      session,
      "answer:submitted",
      { role: "student", userId: socket.__liveUserId },
      {
        studentId: userId,
        slideId: String(slide._id),
        kind,
        ...(groupId ? { groupId } : {}),
        ...(answer.selectedOptionId ? { selectedOptionId: answer.selectedOptionId } : {}),
        isCorrect: response.isCorrect,
        ...(response.score === null || response.score === undefined ? {} : { score: response.score }),
        latencyMs: response.latencyMs,
      },
      submittedAt,
    );
    send(socket, { type: "ack", requestId, ok: true, data: { locked: true } });
    return;
  }

  if (String(session.teacherId) !== userId) {
    return fail(socket, requestId, "FORBIDDEN", "Only the session teacher can control it.");
  }
  if (
    session.paused &&
    !["session:resume", "session:pause", "session:end"].includes(action)
  ) {
    return fail(socket, requestId, "SESSION_PAUSED", "Resume the lesson before controlling it.");
  }
  if (action === "session:start") {
    if (session.status !== "waiting") return fail(socket, requestId, "BAD_STATE", "Only a waiting session can start.");
    if (session.scheduledAt) {
      session.rosterSnapshot = (await listClassStudents(session.classId))
        .map((student) => ({
          studentId: String(student.user?._id || ""),
          name: `${student.firstName} ${student.lastName}`.trim(),
        }))
        .filter((student) => student.studentId);
      session.rosterCapturedAt = new Date();
    }
    session.status = "live";
    session.paused = false;
    session.startedAt = new Date();
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    session.questionOpen = Boolean(
      slide?.question && !session.revealedSlideIds.includes(String(slide._id)),
    );
    await session.save();
    await appendLiveEvent(session, "session:started", { role: "teacher", userId: socket.__liveUserId });
    if (session.questionOpen) {
      await appendLiveEvent(
        session,
        "question:opened",
        { role: "teacher", userId: socket.__liveUserId },
        { slideId: String(slide._id) },
      );
    }
  } else if (action === "session:pause" || action === "session:resume") {
    if (session.status !== "live") {
      return fail(socket, requestId, "BAD_STATE", "Only a live session can be paused or resumed.");
    }
    const paused = action === "session:pause";
    if (Boolean(session.paused) === paused) {
      return fail(socket, requestId, "BAD_STATE", paused ? "The session is already paused." : "The session is not paused.");
    }
    const currentSlide = session.lessonSnapshot.slides[session.currentSlideIndex];
    if (paused) {
      session.paused = true;
      session.pausedAt = new Date();
      if (session.questionOpen) {
        session.questionOpen = false;
        await appendLiveEvent(
          session,
          "question:closed",
          { role: "teacher", userId: socket.__liveUserId },
          { slideId: String(currentSlide._id) },
        );
      }
    } else {
      resumeLiveSessionPause(session);
      session.questionOpen = Boolean(
        currentSlide?.question && !session.revealedSlideIds.includes(String(currentSlide._id)),
      );
    }
    await session.save();
    await appendLiveEvent(
      session,
      paused ? "session:paused" : "session:resumed",
      { role: "teacher", userId: socket.__liveUserId },
    );
    if (!paused && session.questionOpen) {
      await appendLiveEvent(
        session,
        "question:opened",
        { role: "teacher", userId: socket.__liveUserId },
        { slideId: String(currentSlide._id) },
      );
    }
  } else if (action === "slide:change") {
    const index = Number(data.index);
    if (!Number.isInteger(index) || index < 0 || index >= session.lessonSnapshot.slides.length) {
      return fail(socket, requestId, "VALIDATION", "Slide index is out of range.");
    }
    if (session.status !== "live") return fail(socket, requestId, "BAD_STATE", "Start the lesson before changing slides.");
    const current = session.lessonSnapshot.slides[session.currentSlideIndex];
    if (session.questionOpen && current?.question) {
      session.questionOpen = false;
      await appendLiveEvent(session, "question:closed", { role: "teacher", userId: socket.__liveUserId }, { slideId: String(current._id) });
    }
    session.currentSlideIndex = index;
    session.slideHidden = false;
    const slide = session.lessonSnapshot.slides[index];
    session.questionOpen = Boolean(
      slide?.question && !session.revealedSlideIds.includes(String(slide._id)),
    );
    await session.save();
    await appendLiveEvent(session, "slide:changed", { role: "teacher", userId: socket.__liveUserId }, { index, slideId: String(slide._id) });
    hideCursorSpotlight(session._id);
    if (session.questionOpen) {
      await appendLiveEvent(
        session,
        "question:opened",
        { role: "teacher", userId: socket.__liveUserId },
        { slideId: String(slide._id) },
      );
    }
  } else if (action === "slide:hide") {
    if (session.status !== "live" || typeof data.hidden !== "boolean") {
      return fail(socket, requestId, "VALIDATION", "A live session and a boolean hidden value are required.");
    }
    session.slideHidden = data.hidden;
    await session.save();
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    await appendLiveEvent(session, "slide:hidden", { role: "teacher", userId: socket.__liveUserId }, { hidden: data.hidden, slideId: String(slide._id) });
    if (data.hidden) hideCursorSpotlight(session._id);
  } else if (action === "students:fullscreen") {
    if (session.status !== "live" || typeof data.enabled !== "boolean") {
      return fail(socket, requestId, "VALIDATION", "A live session and a boolean fullscreen value are required.");
    }
    session.studentsFullscreen = data.enabled;
    await session.save();
    await appendLiveEvent(
      session,
      data.enabled ? "students:fullscreen" : "students:fullscreen-exited",
      { role: "teacher", userId: socket.__liveUserId },
      { enabled: data.enabled },
    );
  } else if (action === "results:reveal") {
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    if (session.status !== "live" || !slide?.question) {
      return fail(socket, requestId, "BAD_STATE", "The current slide is not a live question.");
    }
    session.revealedSlideIds.addToSet(String(slide._id));
    if (session.questionOpen) {
      await appendLiveEvent(
        session,
        "question:closed",
        { role: "teacher", userId: socket.__liveUserId },
        { slideId: String(slide._id) },
      );
    }
    session.questionOpen = false;
    await session.save();
    await appendLiveEvent(session, "results:revealed", { role: "teacher", userId: socket.__liveUserId }, { slideId: String(slide._id) });
  } else if (action === "session:end") {
    if (session.status === "waiting") return fail(socket, requestId, "BAD_STATE", "Start the session before ending it.");
    session.status = "ended";
    session.endedAt = new Date();
    resumeLiveSessionPause(session, session.endedAt);
    session.questionOpen = false;
    session.studentsFullscreen = false;
    await session.save();
    for (const client of sessionSockets.get(sessionKey(session._id)) || []) {
      client.__liveSessionEnded = true;
    }
    resetCursorSpotlight(session._id);
    await appendLiveEvent(session, "session:ended", { role: "teacher", userId: socket.__liveUserId });
  } else {
    return fail(socket, requestId, "VALIDATION", "Unknown lesson action.");
  }

  send(socket, { type: "ack", requestId, ok: true });
  if (action === "results:reveal") {
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    const responses = await LiveResponse.find({ sessionId: session._id, slideId: String(slide._id) })
      .select("studentId isCorrect score")
      .lean();
    for (const client of sessionSockets.get(sessionKey(session._id)) || []) {
      if (client.__liveRole !== "student") continue;
      const result = responses.find((response) => String(response.studentId) === String(client.__liveUserId));
      send(client, {
        type: "results:revealed",
        data: {
          slideId: String(slide._id),
          // A written answer has no verdict yet: null keeps the popup honest that the teacher
          // still has to mark it.
          myIsCorrect: result?.isCorrect ?? null,
          ...(result?.score === null || result?.score === undefined ? {} : { myScore: result.score }),
        },
      });
    }
  }
  await broadcastState(session);
}

const authenticate = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id)
    .select("_id role school department isActive")
    .setOptions({ skipTenantFilter: true });
  if (!user || !user.isActive || !user.school) return null;
  return user;
};

const canObserveSession = async (user, session) => {
  const access = await staffClassQuery(user, session.school, session.classId, {
    requireActiveTeacher: true,
  });
  if (!access) return false;
  if (access.scope?.wholeSchool) {
    // Documented school-wide principal mode. Logged because a principal who was
    // never given a department should not silently gain this reach.
    logger.warn("live_lessons_whole_school_principal_access", {
      userId: String(user._id),
      sessionId: String(session._id),
      schoolId: String(session.school),
    });
  }
  return Boolean(await Class.exists(access.query));
};

export const initLiveLessonsGateway = (httpServer) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname !== "/ws/live-lessons") return;
    if (!isAllowedRequestOrigin(request.headers.origin)) {
      logger.warn("live_lessons_origin_blocked", { origin: request.headers.origin });
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit("connection", webSocket, request);
    });
  });

  wss.on("connection", (socket) => {
    connections.add(socket);
    let isAuthenticated = false;
    const timeout = setTimeout(() => {
      if (!isAuthenticated) socket.close(1008, "Authentication timeout");
    }, AUTH_TIMEOUT_MS);

    socket.on("message", (raw) => {
      void (async () => {
        let message;
        try {
          message = JSON.parse(String(raw));
        } catch {
          return fail(socket, null, "VALIDATION", "Invalid WebSocket message.");
        }

        if (!isAuthenticated) {
          if (message.type !== "auth" || typeof message.token !== "string") {
            socket.close(1008, "Authentication required");
            return;
          }
          const user = await authenticate(message.token);
          if (!user) {
            socket.close(1008, "Unauthorized");
            return;
          }
          clearTimeout(timeout);
          isAuthenticated = true;
          socket.__liveUser = user;
          socket.__liveUserId = String(user._id);
          socket.__liveSchoolId = String(user.school);
          socket.__liveRole = user.role;
          socket.__lastPingAt = Date.now();
          send(socket, { type: "authenticated", data: { role: user.role } });
          return;
        }

        if (message.type === "join") {
          if (!takeRateToken(socket, "join")) {
            return fail(socket, message.requestId, "RATE_LIMITED", "Too many join attempts. Wait a moment and try again.");
          }
          const session = await LiveSession.findOne({
            _id: message.sessionId,
            school: socket.__liveSchoolId,
          });
          if (!session) return fail(socket, message.requestId, "NOT_FOUND", "Live session not found.");
          if (session.status === "ended") return fail(socket, message.requestId, "SESSION_ENDED", "This lesson has ended.");
          if (socket.__liveRole === "student") {
            if (!(await isStudentEnrolled(session.classId, socket.__liveUserId))) {
              return fail(socket, message.requestId, "FORBIDDEN", "You are not enrolled in this class.");
            }
          } else if (
            String(session.teacherId) !== socket.__liveUserId &&
            !(await canObserveSession(socket.__liveUser, session))
          ) {
            return fail(socket, message.requestId, "FORBIDDEN", "You are not authorized to view this class session.");
          }
          if (socket.__liveSessionId && socket.__liveSessionId !== String(session._id)) {
            removeFromSession(socket, { markLeft: true });
          }
          socket.__liveSessionId = String(session._id);
          socket.__liveSessionCache = { id: String(session._id), at: Date.now(), session };
          socket.__liveIsOwner = String(session.teacherId) === socket.__liveUserId;
          socket.__liveSessionEnded = false;
          const sockets = sessionSockets.get(sessionKey(session._id)) || new Set();
          sockets.add(socket);
          sessionSockets.set(sessionKey(session._id), sockets);
          socket.__lastPingAt = Date.now();
          socket.__liveAway = false;
          connectPresence(socket);
          const statuses = studentStatuses.get(sessionKey(session._id)) || new Map();
          if (socket.__liveRole === "student") {
            statuses.set(socket.__liveUserId, "in_lesson");
            await appendLiveEvent(
              session,
              "presence:joined",
              { role: "student", userId: socket.__liveUserId },
              { studentId: socket.__liveUserId },
            );
          }
          studentStatuses.set(sessionKey(session._id), statuses);
          send(socket, { type: "joined", data: { sessionId: String(session._id) } });
          await broadcastState(session);
          await emitRoster(session);
          send(socket, {
            type: "cursor:spotlight",
            data: cursorSpotlights.get(sessionKey(session._id)) || {
              enabled: false,
              visible: false,
              x: null,
              y: null,
            },
          });
          return;
        }
        if (message.type === "cursor") {
          if (!takeRateToken(socket, "cursor")) return;
          handleCursorMessage(socket, message);
          return;
        }
        if (message.type === "action") {
          if (!socket.__liveSessionId) return fail(socket, message.requestId, "BAD_STATE", "Join a lesson first.");
          if (!takeRateToken(socket, "action")) {
            return fail(socket, message.requestId, "RATE_LIMITED", "Too many live lesson actions. Wait a moment and try again.");
          }
          await handleAction(socket, message);
          return;
        }
        fail(socket, message.requestId, "VALIDATION", "Unknown live lesson message.");
      })().catch((error) => {
        logger.error("live_lesson_websocket_action_failed", {
          error: error?.message || String(error),
          userId: socket.__liveUserId,
          sessionId: socket.__liveSessionId,
        });
        fail(socket, null, "INTERNAL", "The lesson action could not be completed.");
      });
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      const sessionId = socket.__liveSessionId;
      const userId = socket.__liveUserId;
      const wasStudent = socket.__liveRole === "student";
      detachSocket(socket);
      if (socket.__liveIsOwner && sessionId) {
        const remainingOwner = [...(sessionSockets.get(sessionKey(sessionId)) || [])]
          .some((candidate) => candidate.__liveIsOwner);
        if (!remainingOwner) resetCursorSpotlight(sessionId);
      }
      if (sessionId && wasStudent && !studentPresence.has(socketKey(sessionId, userId))) {
        const key = sessionKey(sessionId);
        // Only rooms with someone still watching keep a presence map; an empty room
        // is pruned by detachSocket, and its audit trail lives in LiveSessionEvent.
        const previousStatus = sessionSockets.has(key)
          ? (studentStatuses.get(key) || new Map()).get(String(userId))
          : undefined;
        if (sessionSockets.has(key)) {
          const statuses = studentStatuses.get(key) || new Map();
          statuses.set(String(userId), "disconnected");
          studentStatuses.set(key, statuses);
        }
        if (previousStatus !== "disconnected") {
          void (async () => {
            const session = await LiveSession.findOne({ _id: sessionId, school: socket.__liveSchoolId });
            if (!session) return;
            await appendLiveEvent(
              session,
              "presence:left",
              { role: "student", userId },
              { studentId: userId },
            );
            await emitRoster(session);
          })().catch((error) => {
            logger.error("live_lesson_presence_disconnect_failed", {
              error: error?.message || String(error),
              sessionId,
              userId,
            });
          });
        }
      }
    });
    socket.on("error", (error) => {
      logger.warn("live_lesson_websocket_error", { error: error?.message || String(error) });
    });
  });

  const sweepTimer = setInterval(() => {
    for (const key of studentStatuses.keys()) {
      if (!sessionSockets.has(key)) studentStatuses.delete(key);
    }
    for (const socket of connections) {
      if (socket.readyState !== OPEN || !socket.__liveSessionId || socket.__liveRole !== "student") continue;
      if (Date.now() - socket.__lastPingAt > HEARTBEAT_TIMEOUT_MS && !socket.__heartbeatLost) {
        socket.__liveAway = true;
        socket.__heartbeatLost = true;
        const sessionId = socket.__liveSessionId;
        const statuses = studentStatuses.get(sessionKey(sessionId)) || new Map();
        const otherActiveTab = [...(studentPresence.get(socketKey(sessionId, socket.__liveUserId)) || [])]
          .some((candidate) =>
            candidate !== socket &&
            !candidate.__liveAway &&
            Date.now() - candidate.__lastPingAt < HEARTBEAT_TIMEOUT_MS,
          );
        statuses.set(String(socket.__liveUserId), otherActiveTab ? "in_lesson" : "disconnected");
        studentStatuses.set(sessionKey(sessionId), statuses);
        void LiveSession.findOne({ _id: sessionId, school: socket.__liveSchoolId })
          .then(async (session) => {
            if (!session) return;
            if (!otherActiveTab) {
              await appendLiveEvent(
                session,
                "presence:left",
                { role: "system", userId: socket.__liveUserId },
                { studentId: socket.__liveUserId, reason: "heartbeat_timeout" },
              );
            }
            await emitRoster(session);
          })
          .catch((error) => {
            logger.error("live_lesson_heartbeat_expired_failed", {
              error: error?.message || String(error),
              sessionId,
              userId: socket.__liveUserId,
            });
          });
      }
    }
  }, 5000);
  wss.on("close", () => clearInterval(sweepTimer));
  logger.info("live_lessons_websocket_started", { path: "/ws/live-lessons" });
  return wss;
};

export const closeLiveSessionConnections = (sessionId) => {
  const key = sessionKey(sessionId);
  resetCursorSpotlight(sessionId);
  const sockets = sessionSockets.get(key);
  if (sockets) {
    for (const socket of [...sockets]) {
      send(socket, { type: "session:deleted" });
      detachSocket(socket);
      socket.close(4004, "Live session deleted");
    }
  }
  studentStatuses.delete(key);
};

export const broadcastLiveSessionState = async (session) => {
  if (session.status === "ended") {
    for (const socket of sessionSockets.get(sessionKey(session._id)) || []) {
      socket.__liveSessionEnded = true;
    }
    resetCursorSpotlight(session._id);
  }
  broadcast(session._id, { type: "session:ended" });
  await broadcastState(session);
};
