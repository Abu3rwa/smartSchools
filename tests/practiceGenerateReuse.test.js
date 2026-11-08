import test from "node:test";
import assert from "node:assert/strict";
import PracticeAttempt from "../models/PracticeAttempt.js";
import PracticeSession from "../models/PracticeSession.js";
import StandardAssignment from "../models/StandardAssignment.js";
import StandardQuestionPool from "../models/StandardQuestionPool.js";
import StandardsGradebookEntry from "../models/StandardsGradebookEntry.js";
import Student from "../models/Student.js";
import { generateQuestion } from "../controllers/standardsPracticeController.js";

const studentId = "507f1f77bcf86cd799439021";
const assignmentId = "507f1f77bcf86cd799439041";
const standardId = "507f1f77bcf86cd799439031";
const classId = "507f1f77bcf86cd799439061";
const sessionId = "507f1f77bcf86cd799439071";
const pendingAttemptId = "507f1f77bcf86cd799439051";

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

const buildPendingAttempt = () => ({
  _id: pendingAttemptId,
  instruction: "Choose the best answer.",
  questionText: "The question already served",
  questionType: "multiple_choice",
  options: [
    { label: "A", text: "One" },
    { label: "B", text: "Two" },
  ],
  difficulty: "medium",
  grammarLevel: null,
  skill: "Reading",
  subskill: "Details",
  attemptNumber: 3,
  passageSnapshot: null,
  toObject() {
    return { ...this };
  },
});

const poolQuestion = (text, correctLabel) => ({
  instruction: "Choose the best answer.",
  questionText: text,
  questionType: "multiple_choice",
  options: [
    { label: "A", text: "First" },
    { label: "B", text: "Second" },
  ],
  correctAnswer: correctLabel,
  explanation: "Because.",
  difficulty: "medium",
  skill: "Reading",
  subskill: "Details",
  gradingMode: "exact",
});

const invoke = async (
  t,
  {
    sessionType = "practice",
    pendingAttempt = null,
    pool = null,
    consumedCount = 0,
  } = {},
) => {
  const captures = { findOneFilter: null, countFilter: null, creates: [] };

  t.mock.method(Student, "findOne", () =>
    leanChain({ _id: studentId, firstName: "Areen", currentClass: classId }),
  );
  t.mock.method(StandardAssignment, "findById", () =>
    leanChain({
      _id: assignmentId,
      isActive: true,
      instructions: null,
      students: [],
      class: { _id: classId, academicYear: "2026/2027" },
      subject: { _id: "subject-1", name: "English" },
      standard: {
        _id: standardId,
        name: "Standard",
        masteryThreshold: 80,
        masteryMinQuestions: 5,
      },
      practiceConfig: { sessionType },
      assessmentConfig: { resultsVisibility: "immediate" },
    }),
  );
  t.mock.method(StandardQuestionPool, "findOne", () => leanChain(pool));
  t.mock.method(StandardsGradebookEntry, "findOne", () => leanChain(null));
  t.mock.method(PracticeAttempt, "calculateMastery", async () => ({
    isMastered: false,
    totalAttempts: 0,
    correctCount: 0,
    percentage: 0,
  }));
  t.mock.method(PracticeSession, "findOne", () =>
    leanChain({
      _id: sessionId,
      status: "active",
      sessionType,
      questionLimit: null,
      timeLimitSeconds: null,
      questionsAnswered: consumedCount,
      correctCount: 0,
      startedAt: new Date(),
    }),
  );
  t.mock.method(PracticeSession, "create", async () => {
    throw new Error("session create should not run when one is active");
  });
  t.mock.method(PracticeAttempt, "findOne", (filter) => {
    captures.findOneFilter = filter;
    return leanChain(pendingAttempt);
  });
  t.mock.method(PracticeAttempt, "find", () => leanChain([]));
  t.mock.method(PracticeAttempt, "countDocuments", async (filter) => {
    captures.countFilter = filter;
    return consumedCount;
  });
  t.mock.method(PracticeAttempt, "create", async (doc) => {
    captures.creates.push(doc);
    return {
      ...doc,
      _id: "507f1f77bcf86cd799439081",
      toObject() {
        return { ...this };
      },
    };
  });

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
  generateQuestion(
    {
      body: { assignmentId },
      schoolId: "school-1",
      academicYear: "2026/2027",
      user: { _id: "user-1", role: "student" },
    },
    response,
    (error) => rejectResponse(error),
  );
  await responseDone;
  return { response, captures };
};

test("a refresh re-serves the pending attempt instead of minting a new one", async (t) => {
  const { response, captures } = await invoke(t, {
    pendingAttempt: buildPendingAttempt(),
    consumedCount: 2,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.status, "question");
  assert.equal(response.body.data.question.attemptId, pendingAttemptId);
  assert.equal(
    response.body.data.question.questionText,
    "The question already served",
  );
  assert.equal(captures.creates.length, 0);
  assert.equal(captures.findOneFilter.status, "pending");
  assert.equal(captures.findOneFilter.session, sessionId);
});

test("only consumed answers advance the pool index; pending rows never do", async (t) => {
  const { response, captures } = await invoke(t, {
    sessionType: "assessment",
    pendingAttempt: null,
    consumedCount: 3,
    pool: {
      questions: [
        poolQuestion("Pool question one", "A"),
        poolQuestion("Pool question two", "B"),
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(captures.countFilter.status, {
    $in: ["answered", "pending_review"],
  });
  assert.equal(captures.creates.length, 1);
  // 3 consumed answers -> index 3 % 2 = 1 -> second pool question
  assert.equal(captures.creates[0].questionText, "Pool question two");
  assert.equal(captures.creates[0].attemptNumber, 4);
  assert.equal(response.body.data.question.attemptNumber, 4);
});