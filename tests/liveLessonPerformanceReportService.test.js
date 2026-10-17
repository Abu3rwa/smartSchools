import assert from "node:assert/strict";
import test from "node:test";
import Class from "../models/Class.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import { buildLiveLessonPerformanceReport } from "../services/liveLessonPerformanceReportService.js";

const sessionId = "507f1f77bcf86cd799439011";
const studentId = "507f1f77bcf86cd799439012";
const otherStudentId = "507f1f77bcf86cd799439013";
const unrosteredStudentId = "507f1f77bcf86cd799439014";

const buildQuery = (value) => ({
  sort() { return this; },
  limit() { return this; },
  select() { return this; },
  lean: async () => value,
});

test("performance report returns roster-scoped session engagement and selected student points", async () => {
  const originals = {
    classExists: Class.exists,
    sessionFind: LiveSession.find,
    responseFind: LiveResponse.find,
    eventFind: LiveSessionEvent.find,
  };
  const sessions = [{
    _id: sessionId,
    rosterCapturedAt: new Date("2026-05-04T09:00:00.000Z"),
    rosterSnapshot: [
      { studentId, name: "Ada" },
      { studentId: otherStudentId, name: "Grace" },
    ],
    lessonSnapshot: { title: "Fractions", slides: [{ question: true }] },
    startedAt: new Date("2026-05-04T10:00:00.000Z"),
    endedAt: new Date("2026-05-04T10:30:00.000Z"),
    createdAt: new Date("2026-05-04T09:00:00.000Z"),
  }];

  Class.exists = async () => true;
  LiveSession.find = () => buildQuery(sessions);
  LiveResponse.find = () => buildQuery([
    { sessionId, studentId, isCorrect: true },
    { sessionId, studentId: unrosteredStudentId, isCorrect: true },
  ]);
  LiveSessionEvent.find = () => buildQuery([
    {
      sessionId,
      type: "presence:joined",
      actor: { userId: studentId },
      at: new Date("2026-05-04T10:00:00.000Z"),
    },
  ]);

  try {
    const report = await buildLiveLessonPerformanceReport({
      req: { user: { role: "teacher" }, schoolId: "school-1" },
      classId: "507f1f77bcf86cd799439015",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      studentId,
      resolveClass: async () => ({ _id: "507f1f77bcf86cd799439015", name: "Class 5" }),
    });

    assert.equal(report.sessions[0].rosterCount, 2);
    assert.equal(report.sessions[0].joinedCount, 1);
    assert.equal(report.sessions[0].participatingCount, 1);
    assert.equal(report.sessions[0].submittedAnswers, 1);
    assert.equal(report.sessions[0].questionOpportunities, 2);
    assert.equal(report.sessions[0].attendanceRate, 50);
    assert.equal(report.studentSessionMetrics.length, 1);
    assert.equal(report.studentSessionMetrics[0].studentId, studentId);
    assert.equal(report.studentSessionMetrics[0].joined, true);
    assert.equal(report.studentSessionMetrics[0].answers, 1);
  } finally {
    Class.exists = originals.classExists;
    LiveSession.find = originals.sessionFind;
    LiveResponse.find = originals.responseFind;
    LiveSessionEvent.find = originals.eventFind;
  }
});

test("performance report rejects invalid selected student IDs", async () => {
  await assert.rejects(
    buildLiveLessonPerformanceReport({
      req: { user: { role: "teacher" }, schoolId: "school-1" },
      classId: "507f1f77bcf86cd799439015",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      studentId: "not-an-id",
      resolveClass: async () => null,
    }),
    { message: "Choose a valid student.", statusCode: 400 },
  );
});
