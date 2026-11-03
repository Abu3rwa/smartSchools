import test from "node:test";
import assert from "node:assert/strict";
import { buildLiveLessonReportHtml, withTimeout } from "../services/liveLessonReportPdfService.js";

const answerDetail = (mark) => ({
  questionNumber: 1,
  title: "Warm-up",
  prompt: "What is 1/2 + 1/4?",
  selectedAnswer: "3/4",
  correctAnswer: "3/4",
  result: mark > 0 ? "correct" : "wrong",
  marks: mark,
  maxMarks: 2,
  marksSource: mark === null ? null : "auto",
  status: "answered",
});

const report = {
  session: {
    title: "Fractions review",
    status: "ended",
    class: { name: "Grade 5A" },
    subject: "Math",
    startedAt: "2026-10-01T08:00:00.000Z",
    endedAt: "2026-10-01T08:45:00.000Z",
  },
  summary: {
    rosterCount: 2,
    joinedCount: 2,
    questionCount: 1,
    presentedQuestionCount: 1,
    submittedAnswers: 2,
    awaitingMarks: 0,
  },
  perQuestion: [{
    slideId: "slide-1",
    title: "Warm-up",
    prompt: "What is 1/2 + 1/4?",
    answered: 2,
    correct: 1,
    partial: 0,
    wrong: 1,
    pending: 0,
    percentCorrect: 50,
    answers: [],
  }],
  perStudent: [
    {
      studentId: "student-a",
      name: "Ada",
      joined: true,
      answered: 1,
      correct: 1,
      partial: 0,
      wrong: 0,
      toMark: 0,
      scorePercent: 100,
      totalAwaySeconds: 0,
      answerDetails: [answerDetail(2)],
      presenceEvents: [],
    },
    {
      studentId: "student-b",
      name: "Bo",
      joined: true,
      answered: 1,
      correct: 0,
      partial: 0,
      wrong: 1,
      toMark: 0,
      scorePercent: 0,
      totalAwaySeconds: 0,
      answerDetails: [answerDetail(0)],
      presenceEvents: [],
    },
  ],
};

test("the class report carries every student sheet and the class numbers", () => {
  const html = buildLiveLessonReportHtml(report, { type: "session" });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Session summary/);
  assert.match(html, /Ada/);
  assert.match(html, /Bo/);
  assert.match(html, /2 \/ 2/);
});

test("a student report contains only the students that were chosen", () => {
  const html = buildLiveLessonReportHtml(report, { type: "session", studentIds: ["student-a"] });
  assert.match(html, /Ada/);
  assert.doesNotMatch(html, /Bo/);
  assert.match(html, /Selected students: 1 of 2/);
});

test("a render that outstays its budget is rejected as a 504", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10), (error) => {
    assert.equal(error.statusCode, 504);
    assert.equal(error.message, "The PDF took too long to prepare. Please try again.");
    return true;
  });
});

test("a step that finishes inside its budget is returned untouched", async () => {
  assert.equal(await withTimeout(Promise.resolve("rendered"), 50), "rendered");
});
