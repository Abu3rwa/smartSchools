import test from "node:test";
import assert from "node:assert/strict";
import StandardAssignment from "../models/StandardAssignment.js";
import Student from "../models/Student.js";
import StandardsGradebookEntry from "../models/StandardsGradebookEntry.js";
import PracticeAttempt from "../models/PracticeAttempt.js";
import { getMyAssessmentResultDetail } from "../controllers/standardsPracticeController.js";

const ACADEMIC_YEAR = "2026/2027";

const assignment = {
  _id: "6af075f7d1712618b41696bd",
  title: "Unit 3 Assessment",
  isActive: true,
  students: [],
  class: { _id: "class-1", academicYear: ACADEMIC_YEAR },
  subject: { _id: "subject-1", name: "Science" },
  standard: { _id: "standard-1", code: "5-ESS2-1", name: "Earth systems" },
  practiceConfig: { sessionType: "assessment" },
  assessmentConfig: {
    maxMarks: 10,
    passMarks: 5,
    resultsVisibility: "manual_release",
  },
};

const student = {
  _id: "student-1",
  currentClass: { _id: "class-1", academicYear: ACADEMIC_YEAR },
};

const answeredAttempts = [
  {
    _id: "attempt-1",
    questionText: "Which layer is the outermost?",
    questionType: "multiple_choice",
    studentAnswer: "B",
    correctAnswer: "B",
    isCorrect: true,
    score: 1,
    feedback: "Correct.",
    status: "answered",
    answeredAt: "2026-11-07T09:00:00.000Z",
  },
  {
    _id: "attempt-2",
    questionText: "Explain condensation.",
    questionType: "short_answer",
    studentAnswer: "Water vapour cools into droplets.",
    correctAnswer: "Water vapour cools and condenses.",
    isCorrect: false,
    score: 0,
    feedback: "Mention cooling.",
    status: "pending_review",
    answeredAt: "2026-11-07T09:05:00.000Z",
  },
];

const chain = (value) => {
  const proxy = {
    populate: () => proxy,
    select: () => proxy,
    sort: () => proxy,
    lean: async () => value,
  };
  return proxy;
};

const invoke = async ({ entry, attempts = answeredAttempts } = {}, t) => {
  t.mock.method(Student, "findOne", () => chain(student));
  t.mock.method(StandardAssignment, "findById", () => chain(assignment));
  t.mock.method(StandardsGradebookEntry, "findOne", () => chain(entry));
  t.mock.method(PracticeAttempt, "find", () => chain(attempts));

  const response = { statusCode: 200, body: null };
  let resolveResponse;
  let rejectResponse;
  const responseDone = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  response.status = function setStatus(code) {
    this.statusCode = code;
    return this;
  };
  response.json = function sendJson(payload) {
    this.body = payload;
    resolveResponse();
    return this;
  };

  await getMyAssessmentResultDetail(
    {
      params: { assignmentId: assignment._id },
      query: {},
      academicYear: ACADEMIC_YEAR,
      schoolId: "school-1",
      user: { role: "student", _id: "user-1" },
    },
    response,
    (error) => rejectResponse(error),
  );
  await responseDone;

  return response;
};

test("a submitted assessment with unreleased results returns 403 and no question data", async (t) => {
  const response = await invoke(
    {
      entry: {
        status: "submitted",
        score: 8,
        maxScore: 10,
        percentage: 80,
        submittedAt: "2026-11-07T10:00:00.000Z",
      },
    },
    t,
  );

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, "RESULTS_NOT_RELEASED");
  assert.equal(response.body.data, undefined);
});

test("a released assessment returns the per-question result with no rubric leakage", async (t) => {
  const response = await invoke(
    {
      entry: {
        status: "released",
        score: 8,
        maxScore: 10,
        percentage: 80,
        submittedAt: "2026-11-07T10:00:00.000Z",
        releasedAt: "2026-11-08T08:00:00.000Z",
        totalAnswered: 2,
        correctCount: 1,
        metadata: { pendingReviewCount: 1 },
      },
    },
    t,
  );

  assert.equal(response.statusCode, 200);
  const data = response.body.data;
  assert.equal(data.title, "Unit 3 Assessment");
  assert.equal(data.standard.code, "5-ESS2-1");
  assert.equal(data.score, 8);
  assert.equal(data.maxScore, 10);
  assert.equal(data.percentage, 80);
  assert.equal(data.scale4, 3.2);
  assert.equal(data.passMarks, 5);
  assert.equal(data.isPassed, true);
  assert.equal(data.resultsVisible, true);
  assert.equal(data.totalAnswered, 2);
  assert.equal(data.correctCount, 1);

  assert.equal(data.questions.length, 2);
  assert.deepEqual(data.questions[0], {
    id: "attempt-1",
    questionText: "Which layer is the outermost?",
    questionType: "multiple_choice",
    studentAnswer: "B",
    correctAnswer: "B",
    isCorrect: true,
    score: 1,
    feedback: "Correct.",
    explanation: "",
    requiresTeacherReview: false,
    answeredAt: "2026-11-07T09:00:00.000Z",
  });
  assert.equal(data.questions[1].requiresTeacherReview, true);

  const serialized = JSON.stringify(data);
  assert.equal(serialized.includes("rubric"), false);
  assert.equal(serialized.includes("modelAnswer"), false);
});
