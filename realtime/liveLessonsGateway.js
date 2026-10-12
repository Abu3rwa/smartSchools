import jwt from "jsonwebtoken";
import process from "node:process";
import { clearInterval, clearTimeout, setInterval, setTimeout } from "node:timers";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import User from "../models/User.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import logger from "../utils/logger.js";
import {
  appendLiveEvent,
  formatRoster,
  getSessionStudents,
  getStateForUser,
  isStudentEnrolled,
} from "../services/liveLessonService.js";

const AUTH_TIMEOUT_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 15000;
const RATE_WINDOW_MS = 60 * 1000;
const MAX_ACTIONS_PER_WINDOW = 120;
const OPEN = 1;
const connections = new Set();
const sessionSockets = new Map();
const studentPresence = new Map();
const studentStatuses = new Map();

const socketKey = (sessionId, studentId) => `${sessionId}:${studentId}`;
const sessionKey = (sessionId) => String(sessionId);
const send = (socket, payload) => {
  if (socket.readyState === OPEN) socket.send(JSON.stringify(payload));
};

const broadcast = (sessionId, payload, teacherOnly = false) => {
  const sockets = sessionSockets.get(sessionKey(sessionId));
  if (!sockets) return;
  for (const socket of sockets) {
    if (!teacherOnly || socket.__liveRole !== "student") send(socket, payload);
  }
};

const connectPresence = (socket) => {
  if (socket.__liveRole !== "student") return;
  const key = socketKey(socket.__liveSessionId, socket.__liveUserId);
  const sockets = studentPresence.get(key) || new Set();
  sockets.add(socket);
  studentPresence.set(key, sockets);
};

const detachSocket = (socket) => {
  connections.delete(socket);
  const current = sessionSockets.get(sessionKey(socket.__liveSessionId));
  if (current) {
    current.delete(socket);
    if (current.size === 0) sessionSockets.delete(sessionKey(socket.__liveSessionId));
  }
  if (socket.__liveRole === "student") {
    const key = socketKey(socket.__liveSessionId, socket.__liveUserId);
    const sockets = studentPresence.get(key);
    if (sockets) {
      sockets.delete(socket);
      if (!sockets.size) studentPresence.delete(key);
    }
  }
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

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const configured = [
    process.env.CLIENT_URL,
    ...(process.env.ALLOWED_ORIGINS || "").split(","),
    "http://localhost:5173",
    "https://schoolos-is02.onrender.com",
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const projectPrefix = process.env.FIREBASE_PROJECT_ID || "smile3-8c8c5";
  return configured.includes(origin) ||
    origin === `https://${projectPrefix}.web.app` ||
    origin === `https://${projectPrefix}.firebaseapp.com`;
};

const emitRoster = async (session) => {
  const students = await getSessionStudents(session);
  broadcast(session._id, {
    type: "roster:update",
    data: { roster: formatRoster(students, getPresenceMap(session._id)) },
  }, true);
};

const broadcastState = async (session) => {
  const sockets = sessionSockets.get(sessionKey(session._id));
  if (!sockets) return;
  for (const socket of sockets) {
    if (socket.__liveRole === "student" && !(await isStudentEnrolled(session.classId, socket.__liveUserId))) {
      fail(socket, null, "FORBIDDEN", "You are no longer enrolled in this class.");
      socket.close(1008, "Class enrollment changed");
      continue;
    }
    const state = await getStateForUser(session, socket.__liveUser);
    if (socket.__liveRole === "student") {
      send(socket, { type: "session:state", data: state });
    } else {
      state.roster = formatRoster(await getSessionStudents(session), getPresenceMap(session._id));
      send(socket, { type: "teacher:state", data: state });
    }
  }
};

const fail = (socket, requestId, code, message) =>
  send(socket, { type: "ack", requestId, ok: false, error: { code, message } });

const persistPresence = async (session, socket, action) => {
  const now = new Date();
  await appendLiveEvent(
    session,
    action === "away" ? "presence:away" : "presence:back",
    { role: "student", userId: socket.__liveUserId },
    { studentId: String(socket.__liveUserId) },
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

const answerStateForTeacher = async (session, slide) => {
  const students = await getSessionStudents(session);
  const responses = await LiveResponse.find({
    sessionId: session._id,
    slideId: String(slide._id),
  }).lean();
  const responseByStudent = new Map(responses.map((response) => [String(response.studentId), response]));
  const studentRows = students.map((student) => {
    const studentId = String(student.studentId);
    const response = responseByStudent.get(studentId);
    return {
      studentId,
      name: student.name,
      status: response ? (response.isCorrect ? "correct" : "wrong") : "unanswered",
      selectedOptionId: response?.selectedOptionId || null,
      latencyMs: response?.latencyMs ?? null,
    };
  });
  return {
    slideId: String(slide._id),
    kind: slide.question.kind,
    totalStudents: studentRows.length,
    answered: responses.length,
    correctCount: responses.filter((response) => response.isCorrect).length,
    wrongCount: responses.filter((response) => !response.isCorrect).length,
    unansweredCount: Math.max(0, studentRows.length - responses.length),
    perOption: Object.fromEntries(
      slide.question.options.map((option) => [
        option.id,
        responses.filter((response) => response.selectedOptionId === option.id).length,
      ]),
    ),
    students: studentRows,
  };
};

const handleAction = async (socket, message) => {
  const { action, data = {}, requestId } = message;
  const session = await LiveSession.findOne({
    _id: socket.__liveSessionId,
    school: socket.__liveSchoolId,
  });
  if (!session) return fail(socket, requestId, "NOT_FOUND", "Live session not found.");
  if (session.status === "ended" && action !== "session:state") {
    return fail(socket, requestId, "SESSION_ENDED", "This session has ended.");
  }
  const isTeacher = socket.__liveRole !== "student";
  const userId = String(socket.__liveUserId);
  if (!isTeacher && !(await isStudentEnrolled(session.classId, userId))) {
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
    await persistPresence(session, socket, action.endsWith("away") ? "away" : "back");
    return send(socket, { type: "ack", requestId, ok: true });
  }
  if (!isTeacher) {
    if (action !== "answer:submit") {
      return fail(socket, requestId, "FORBIDDEN", "Students cannot control the lesson.");
    }
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    if (
      session.status !== "live" ||
      !session.questionOpen ||
      !slide?.question ||
      String(slide._id) !== String(data.slideId)
    ) {
      return fail(socket, requestId, "QUESTION_CLOSED", "This question is not open for answers.");
    }
    if (!slide.question.options.some((option) => option.id === data.selectedOptionId)) {
      return fail(socket, requestId, "VALIDATION", "Choose one of the available answers.");
    }
    const submittedAt = new Date();
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
      selectedOptionId: data.selectedOptionId,
      isCorrect: data.selectedOptionId === slide.question.correctOptionId,
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
        selectedOptionId: data.selectedOptionId,
        isCorrect: response.isCorrect,
        latencyMs: response.latencyMs,
      },
      submittedAt,
    );
    send(socket, { type: "ack", requestId, ok: true, data: { locked: true } });
    const answers = await answerStateForTeacher(session, slide);
    broadcast(session._id, { type: "answers:update", data: answers }, true);
    return;
  }

  if (String(session.teacherId) !== userId) {
    return fail(socket, requestId, "FORBIDDEN", "Only the session teacher can control it.");
  }
  if (action === "session:start") {
    if (session.status !== "waiting") return fail(socket, requestId, "BAD_STATE", "Only a waiting session can start.");
    session.status = "live";
    session.startedAt = new Date();
    await session.save();
    await appendLiveEvent(session, "session:started", { role: "teacher", userId: socket.__liveUserId });
  } else if (action === "slide:change") {
    const index = Number(data.index);
    if (!Number.isInteger(index) || index < 0 || index >= session.lessonSnapshot.slides.length) {
      return fail(socket, requestId, "VALIDATION", "Slide index is out of range.");
    }
    if (session.status !== "live") return fail(socket, requestId, "BAD_STATE", "Start the lesson before changing slides.");
    if (session.questionOpen) {
      const current = session.lessonSnapshot.slides[session.currentSlideIndex];
      session.questionOpen = false;
      await appendLiveEvent(session, "question:closed", { role: "teacher", userId: socket.__liveUserId }, { slideId: String(current._id) });
    }
    session.currentSlideIndex = index;
    session.slideHidden = false;
    await session.save();
    const slide = session.lessonSnapshot.slides[index];
    await appendLiveEvent(session, "slide:changed", { role: "teacher", userId: socket.__liveUserId }, { index, slideId: String(slide._id) });
  } else if (action === "slide:hide") {
    if (session.status !== "live" || typeof data.hidden !== "boolean") {
      return fail(socket, requestId, "VALIDATION", "A live session and a boolean hidden value are required.");
    }
    session.slideHidden = data.hidden;
    await session.save();
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    await appendLiveEvent(session, "slide:hidden", { role: "teacher", userId: socket.__liveUserId }, { hidden: data.hidden, slideId: String(slide._id) });
  } else if (action === "question:open" || action === "question:close") {
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    if (session.status !== "live" || !slide?.question) {
      return fail(socket, requestId, "BAD_STATE", "The current slide is not a live question.");
    }
    const opening = action === "question:open";
    session.questionOpen = opening;
    await session.save();
    await appendLiveEvent(session, opening ? "question:opened" : "question:closed", { role: "teacher", userId: socket.__liveUserId }, { slideId: String(slide._id) });
  } else if (action === "results:reveal") {
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    if (session.status !== "live" || !slide?.question) {
      return fail(socket, requestId, "BAD_STATE", "The current slide is not a live question.");
    }
    session.revealedSlideIds.addToSet(String(slide._id));
    session.questionOpen = false;
    await session.save();
    await appendLiveEvent(session, "results:revealed", { role: "teacher", userId: socket.__liveUserId }, { slideId: String(slide._id) });
  } else if (action === "session:end") {
    if (session.status === "waiting") return fail(socket, requestId, "BAD_STATE", "Start the session before ending it.");
    session.status = "ended";
    session.endedAt = new Date();
    session.questionOpen = false;
    await session.save();
    await appendLiveEvent(session, "session:ended", { role: "teacher", userId: socket.__liveUserId });
  } else {
    return fail(socket, requestId, "VALIDATION", "Unknown lesson action.");
  }

  send(socket, { type: "ack", requestId, ok: true });
  if (action === "results:reveal") {
    const slide = session.lessonSnapshot.slides[session.currentSlideIndex];
    const responses = await LiveResponse.find({ sessionId: session._id, slideId: String(slide._id) })
      .select("studentId isCorrect")
      .lean();
    for (const client of sessionSockets.get(sessionKey(session._id)) || []) {
      if (client.__liveRole !== "student") continue;
      const result = responses.find((response) => String(response.studentId) === String(client.__liveUserId));
      send(client, {
        type: "results:revealed",
        data: {
          slideId: String(slide._id),
          correctOptionId: slide.question.correctOptionId,
          explanation: slide.question.explanation || "",
          myIsCorrect: result?.isCorrect ?? null,
        },
      });
    }
  }
  await broadcastState(session);
}

const authenticate = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id)
    .select("_id role school isActive")
    .setOptions({ skipTenantFilter: true });
  if (!user || !user.isActive || !user.school) return null;
  return user;
};

export const initLiveLessonsGateway = (httpServer) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname !== "/ws/live-lessons") return;
    if (!isAllowedOrigin(request.headers.origin)) {
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
          } else if (String(session.teacherId) !== socket.__liveUserId) {
            return fail(socket, message.requestId, "FORBIDDEN", "Only the session teacher can join the teacher console.");
          }
          socket.__liveSessionId = String(session._id);
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
          return;
        }
        if (message.type === "action") {
          if (!socket.__liveSessionId) return fail(socket, message.requestId, "BAD_STATE", "Join a lesson first.");
          const now = Date.now();
          if (!socket.__actionWindowStartedAt || now - socket.__actionWindowStartedAt >= RATE_WINDOW_MS) {
            socket.__actionWindowStartedAt = now;
            socket.__actionCount = 0;
          }
          socket.__actionCount += 1;
          if (socket.__actionCount > MAX_ACTIONS_PER_WINDOW) {
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
      if (sessionId && wasStudent && !studentPresence.has(socketKey(sessionId, userId))) {
        const statuses = studentStatuses.get(sessionKey(sessionId)) || new Map();
        const previousStatus = statuses.get(String(userId));
        statuses.set(String(userId), "disconnected");
        studentStatuses.set(sessionKey(sessionId), statuses);
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
