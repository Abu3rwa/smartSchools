import test from "node:test";
import assert from "node:assert/strict";
import PracticeAttempt from "../models/PracticeAttempt.js";
import StandardAssignment from "../models/StandardAssignment.js";
import StandardsGradebookEntry from "../models/StandardsGradebookEntry.js";
import { overrideAttemptGrading } from "../controllers/standardsPracticeController.js";

const studentId = "507f1f77bcf86cd799439021";
const assignmentId = "507f1f77bcf86cd799439041";
const standardId = "507f1f77bcf86cd799439031";
const sessionId = "507f1f77bcf86cd799439071";
const entryId = "507f1f77bcf86cd799439091";
const attemptId = "507f1f77bcf86cd799439051";

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

// Two answered rows (one flipped correct by a teacher override) plus one row
// still waiting on review: the recount must keep the review row out of the
// score but surface it as pendingReviewCount.
const attemptRows = [
  { status: "answered", isCorrect: true, teacherOverride: null },
  { status: "answered", isCorrect: false, teacherOverride: { isCorrect: true } },
  { status: "pending_review", isCorrect: null, teacherOverride: null },
];

const invoke = async (t, { entrySession = sessionId } = {}) => {
  const captures = { countFilter: null, updates: [] };
  const attempt = {
    _id: attemptId,
    student: studentId,
    assignment: assignmentId,
    standard: standardId,
    status: "pending_review",
    isCorrect: null,
    teacherOverride: null,
    save: async () => {},
  };

  t.mock.method(PracticeAttempt, "findOne", () => leanChain(attempt));
  t.mock.method(StandardAssignment, "findById", () =>
    leanChain({
      _id: assignmentId,
      class: "class-1",
      subject: "subject-1",
      standard: standardId,
      academicYear: "2026/2027",
      assessmentConfig: { maxMarks: 10 },
    }),
  );
  t.mock.method(StandardsGradebookEntry, "findOne", () =>
    leanChain({
      _id: entryId,
      maxScore: 10,
      manualScore: null,
      isManualEntry: false,
      session: entrySession,
    }),
  );
  t.mock.method(PracticeAttempt, "find", (filter) => {
    captures.countFilter = filter;
    return leanChain(attemptRows);
  });
  t.mock.method(StandardsGradebookEntry, "findByIdAndUpdate", async (id, update) => {
    captures.updates.push({ id, update });
    return {};
  });
  t.mock.method(PracticeAttempt, "calculateMastery", async () => ({
    isMastered: false,
    totalAttempts: 2,
    correctCount: 2,
    percentage: 100,
  }));

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
  overrideAttemptGrading(
    {
      params: { attemptId },
      body: { isCorrect: true, reason: "Accepted meaning" },
      schoolId: "school-1",
      user: { _id: "user-1", role: "admin" },
    },
    response,
    (error) => rejectResponse(error),
  );
  await responseDone;
  return { response, captures, attempt };
};

test("a review override recounts with the recorded session scope and teacher overrides", async (t) => {
  const { response, captures } = await invoke(t);

  assert.equal(response.statusCode, 200);
  assert.equal(captures.countFilter.session, sessionId);
  assert.deepEqual(captures.countFilter.status, {
    $in: ["answered", "pending_review"],
  });
  assert.equal(captures.updates.length, 1);
  assert.equal(captures.updates[0].id, entryId);
  const set = captures.updates[0].update.$set;
  assert.equal(set.totalAnswered, 2);
  assert.equal(set.correctCount, 2);
  assert.equal(set["metadata.pendingReviewCount"], 1);
  assert.equal(set.percentage, 100);
  assert.equal(set.effectiveScore, 4);
});

test("an entry without a recorded session recounts across the whole assignment", async (t) => {
  const { response, captures } = await invoke(t, { entrySession: null });

  assert.equal(response.statusCode, 200);
  assert.equal(captures.countFilter.session, undefined);
  assert.equal(captures.updates[0].update.$set.totalAnswered, 2);
});