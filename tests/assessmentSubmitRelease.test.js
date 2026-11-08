import test from "node:test";
import assert from "node:assert/strict";
import PracticeAttempt from "../models/PracticeAttempt.js";
import PracticeSession from "../models/PracticeSession.js";
import StandardAssignment from "../models/StandardAssignment.js";
import StandardsGradebookEntry from "../models/StandardsGradebookEntry.js";
import MasteryRecord from "../models/MasteryRecord.js";
import Student from "../models/Student.js";
import { submitAnswer } from "../controllers/standardsPracticeController.js";

const studentId = "507f1f77bcf86cd799439021";
const assignmentId = "507f1f77bcf86cd799439041";
const standardId = "507f1f77bcf86cd799439031";

const leanChain = (value) => {
  const proxy = {
    select: () => proxy,
    sort: () => proxy,
    limit: () => proxy,
    populate: () => proxy,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return proxy;
};

const buildAttempt = ({ sessionType, session = null }) => ({
  _id: "507f1f77bcf86cd799439051",
  status: "pending",
  sessionType,
  session,
  student: studentId,
  standard: {
    _id: standardId,
    masteryThreshold: 80,
    masteryMinQuestions: 5,
  },
  assignment: {
    _id: assignmentId,
    class: { academicYear: "2026/2027" },
    subject: { _id: "subject-1" },
  },
  questionType: "multiple_choice",
  questionText: "Pick B",
  options: [
    { label: "A", text: "Wrong" },
    { label: "B", text: "Right" },
  ],
  correctAnswer: "B",
  explanation: "The secret explanation",
  acceptableAnswers: [],
  gradingMode: "exact",
  save: async () => {},
  toObject() {
    return { ...this };
  },
});

const stubSources = (t, { sessionType = "assessment", resultsVisibility = "manual_release", sessionStatus } = {}) => {
  const attempt = buildAttempt({
    sessionType,
    session: sessionStatus === undefined ? null : "507f1f77bcf86cd799439091",
  });
  t.mock.method(PracticeAttempt, "findById", () => leanChain(attempt));
  t.mock.method(PracticeSession, "findById", () =>
    leanChain(sessionStatus && sessionStatus !== "missing" ? { status: sessionStatus } : null),
  );
  t.mock.method(Student, "findOne", () =>
    leanChain({ _id: studentId, firstName: "Areen" }),
  );
  t.mock.method(PracticeAttempt, "calculateMastery", async () => ({
    isMastered: false,
    totalAttempts: 1,
    correctCount: 1,
    percentage: 100,
  }));
  t.mock.method(MasteryRecord, "findOne", () => leanChain(null));
  t.mock.method(MasteryRecord, "findOneAndUpdate", async () => null);
  t.mock.method(PracticeAttempt, "find", () => leanChain([]));
  t.mock.method(PracticeSession, "findOne", () => leanChain(null));
  t.mock.method(StandardAssignment, "findById", () =>
    leanChain({
      _id: assignmentId,
      assessmentConfig: { resultsVisibility },
    }),
  );
  t.mock.method(StandardsGradebookEntry, "findOne", () => leanChain(null));
  t.mock.method(StandardsGradebookEntry, "findOneAndUpdate", async () => ({
    status: "in_progress",
    score: 100,
    maxScore: 100,
  }));
  return attempt;
};

const invoke = async (t, options) => {
  const previousReview = process.env.REVIEW_QUEUE_ENABLED;
  const previousIntervention = process.env.INTERVENTION_QUEUE_ENABLED;
  process.env.REVIEW_QUEUE_ENABLED = "false";
  process.env.INTERVENTION_QUEUE_ENABLED = "false";
  t.after(() => {
    if (previousReview === undefined) delete process.env.REVIEW_QUEUE_ENABLED;
    else process.env.REVIEW_QUEUE_ENABLED = previousReview;
    if (previousIntervention === undefined)
      delete process.env.INTERVENTION_QUEUE_ENABLED;
    else process.env.INTERVENTION_QUEUE_ENABLED = previousIntervention;
  });

  stubSources(t, options);
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
  submitAnswer(
    {
      body: {
        attemptId: "507f1f77bcf86cd799439051",
        answer: "B",
        timeSpentSeconds: 5,
      },
      schoolId: "school-1",
      academicYear: "2026/2027",
      user: { _id: "user-1", role: "student" },
    },
    response,
    (error) => {
      rejectResponse(error);
    },
  );
  await responseDone;
  return response;
};

test("an unreleased assessment answer is acknowledged without revealing correctness", async (t) => {
  const response = await invoke(t, { resultsVisibility: "manual_release" });
  const data = response.body.data;

  assert.equal(response.statusCode, 200);
  assert.equal(data.resultsVisible, false);
  assert.equal(data.isCorrect, null);
  assert.equal(data.correctAnswer, "");
  assert.equal(data.correctAnswerDisplay, null);
  assert.equal(data.explanation, null);
  assert.equal(data.feedback, null);
  assert.equal(data.feedbackParts, null);
  assert.equal(data.mastery, undefined);
  assert.equal(data.newlyMastered, false);
  assert.deepEqual(data.sessionContext, {});
});

test("an immediate-release assessment still shows full feedback", async (t) => {
  const response = await invoke(t, { resultsVisibility: "immediate" });
  const data = response.body.data;

  assert.equal(response.statusCode, 200);
  assert.equal(data.resultsVisible, true);
  assert.equal(data.isCorrect, true);
  assert.equal(data.correctAnswer, "B");
  assert.equal(data.explanation, "The secret explanation");
});

test("ordinary practice keeps its feedback regardless of assessment policy", async (t) => {
  const response = await invoke(t, { sessionType: "practice" });
  const data = response.body.data;

  assert.equal(response.statusCode, 200);
  assert.equal(data.resultsVisible, true);
  assert.equal(data.isCorrect, true);
  assert.equal(data.correctAnswer, "B");
});

test("an answer to a closed session is rejected before grading", async (t) => {
  const response = await invoke(t, { sessionStatus: "completed" });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /session has closed/i);
});

test("an answer whose session no longer exists is rejected", async (t) => {
  const response = await invoke(t, { sessionStatus: "missing" });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /session has closed/i);
});