import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClassEngagementChartData,
  buildStudentEngagementChartData,
} from "./liveLessonEngagementCharts.js";

test("class weekly chart uses weighted session denominators", () => {
  const result = buildClassEngagementChartData([
    {
      sessionId: "one",
      title: "Lesson one",
      date: "2026-05-04T10:00:00.000Z",
      rosterCount: 20,
      joinedCount: 10,
      participatingCount: 5,
      questionOpportunities: 40,
      submittedAnswers: 20,
    },
    {
      sessionId: "two",
      title: "Lesson two",
      date: "2026-05-06T10:00:00.000Z",
      rosterCount: 5,
      joinedCount: 5,
      participatingCount: 4,
      questionOpportunities: 10,
      submittedAnswers: 5,
    },
  ], "week");

  assert.equal(result.length, 1);
  assert.equal(result[0].lessonCount, 2);
  assert.equal(result[0].attendanceRate, 60);
  assert.equal(result[0].participationRate, 36);
  assert.equal(result[0].answerCompletionRate, 50);
});

test("lesson granularity keeps separate lessons even when their timestamps match", () => {
  const result = buildClassEngagementChartData([
    { sessionId: "one", title: "First", date: "2026-05-04T10:00:00.000Z", rosterCount: 1 },
    { sessionId: "two", title: "Second", date: "2026-05-04T10:00:00.000Z", rosterCount: 1 },
  ], "lesson");

  assert.equal(result.length, 2);
});

test("lesson engagement chart data keeps observable engagement separate from answer completion", () => {
  const [lesson] = buildClassEngagementChartData([{
    sessionId: "chromebook-essay",
    title: "Informative Essay Writing - How to Use Your Chromebook Effectively",
    date: "2026-10-15T10:00:00.000Z",
    rosterCount: 16,
    joinedCount: 15,
    participatingCount: 14,
    questionOpportunities: 64,
    submittedAnswers: 26,
  }], "lesson");

  assert.equal(lesson.answerCompletionRate, 41);
  assert.equal(lesson.answerCompletionNumerator, 26);
  assert.equal(lesson.answerCompletionDenominator, 64);
  assert.equal(lesson.participationRate, 88);
  assert.equal(lesson.participationNumerator, 14);
  assert.equal(lesson.participationDenominator, 16);
  assert.equal(lesson.attendanceRate, 94);
  assert.equal(lesson.attendanceNumerator, 15);
  assert.equal(lesson.attendanceDenominator, 16);
  assert.equal(Object.hasOwn(lesson, "accuracyRate"), false);
});

test("student monthly chart counts only sessions where they were rostered", () => {
  const result = buildStudentEngagementChartData([
    {
      date: "2026-05-04T10:00:00.000Z",
      joined: true,
      participated: true,
      answers: 2,
      questions: 4,
    },
    {
      date: "2026-05-12T10:00:00.000Z",
      joined: false,
      participated: false,
      answers: 0,
      questions: 4,
    },
  ], "month");

  assert.equal(result.length, 1);
  assert.equal(result[0].lessonCount, 2);
  assert.equal(result[0].attendanceRate, 50);
  assert.equal(result[0].participationRate, 50);
  assert.equal(result[0].answerCompletionRate, 25);
});
