import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import ReadingAssignment from "../models/ReadingAssignment.js";
import ReadingCompletion from "../models/ReadingCompletion.js";
import ReadingModelAudio from "../models/ReadingModelAudio.js";
import ReadingProgressState from "../models/ReadingProgressState.js";
import SimplifiedText from "../models/SimplifiedText.js";
import StudentReadingProfile from "../models/StudentReadingProfile.js";
import ReadingAnswerDraft from "../models/ReadingAnswerDraft.js";
import Student from "../models/Student.js";
import {
  saveAnswerDraft,
  updateProgress,
  updateReading
} from "../services/readingAssistantService.js";
import {
  saveAnswersDraft as saveAnswersDraftController,
  updateProgress as updateProgressController
} from "../controllers/readingController.js";

const schoolId = "507f1f77bcf86cd799439101";
const teacherId = "507f1f77bcf86cd799439102";
const studentId = "507f1f77bcf86cd799439103";
const otherStudentId = "507f1f77bcf86cd799439104";
const assignmentId = "507f1f77bcf86cd799439105";
const textId = "507f1f77bcf86cd799439106";
const questionOneId = "507f1f77bcf86cd799439111";
const questionTwoId = "507f1f77bcf86cd799439112";
const thinkingOneId = "507f1f77bcf86cd799439113";
const foreignId = "507f1f77bcf86cd799439199";

/** A Mongoose-like query: chainable, awaitable, and lean-able. */
const query = (value) => {
  const chain = {
    populate: () => chain,
    select: () => chain,
    sort: () => chain,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return chain;
};

const storedQuestions = () => ({
  comprehensionQuestions: [
    {
      _id: questionOneId,
      question: "What color is the sky?",
      type: "multiple_choice",
      options: ["Blue", "Green"],
      correctIndex: 0,
      order: 1
    },
    {
      _id: questionTwoId,
      question: "How many moons?",
      type: "multiple_choice",
      options: ["One", "Two"],
      correctIndex: 1,
      order: 2
    }
  ],
  criticalThinkingQuestions: [
    {
      _id: thinkingOneId,
      question: "Why does it matter?",
      prompt: "",
      type: "short_answer",
      order: 1
    }
  ]
});

const storedReading = () => ({
  _id: textId,
  school: schoolId,
  createdBy: teacherId,
  isArchived: false,
  title: "Sky",
  originalText: "The sky is blue.",
  language: "en",
  requestedLanguages: ["en"],
  simplifiedVersions: [],
  ...storedQuestions(),
  save() {
    savedReadings.push(this);
    return Promise.resolve(this);
  }
});

let savedReadings = [];

const mockUpdateReading = (t, reading) => {
  savedReadings = [];
  t.mock.method(SimplifiedText, "findOne", () => query(reading));
  t.mock.method(ReadingModelAudio, "deleteMany", async () => ({ deletedCount: 0 }));
};

const objectivePayload = (questions) => questions.map((question) => ({
  ...(question._id ? { _id: question._id } : {}),
  question: question.question,
  type: "multiple_choice",
  options: question.options,
  correctIndex: question.correctIndex,
  order: question.order
}));

const updatePayload = (comprehension, criticalThinking) => ({
  title: "Sky",
  originalText: "The sky is blue.",
  questions: [
    ...objectivePayload(comprehension),
    ...criticalThinking.map((question) => ({
      ...(question._id ? { _id: question._id } : {}),
      question: question.question,
      prompt: question.prompt || "",
      type: "short_answer",
      order: question.order
    }))
  ]
});

test("question ids sent back from the editor survive an edit", async (t) => {
  const reading = storedReading();
  mockUpdateReading(t, reading);
  const payload = updatePayload(reading.comprehensionQuestions, reading.criticalThinkingQuestions);
  await updateReading(textId, schoolId, teacherId, false, payload);
  assert.deepEqual(
    savedReadings[0].comprehensionQuestions.map((question) => String(question._id)),
    [questionOneId, questionTwoId]
  );
  assert.equal(String(savedReadings[0].criticalThinkingQuestions[0]._id), thinkingOneId);
});

test("a reworded question keeps its id when the text still matches", async (t) => {
  const reading = storedReading();
  mockUpdateReading(t, reading);
  const payload = updatePayload(
    [
      { ...reading.comprehensionQuestions[0], _id: null, question: "  what COLOR is the sky?  " },
      reading.comprehensionQuestions[1]
    ],
    reading.criticalThinkingQuestions
  );
  await updateReading(textId, schoolId, teacherId, false, payload);
  assert.equal(String(savedReadings[0].comprehensionQuestions[0]._id), questionOneId);
  assert.equal(
    savedReadings[0].comprehensionQuestions[0].question,
    "what COLOR is the sky?"
  );
});

test("a rewritten question reuses the stored id by kind and order", async (t) => {
  const reading = storedReading();
  mockUpdateReading(t, reading);
  const payload = updatePayload(
    [
      { ...reading.comprehensionQuestions[0], _id: null, question: "Brand new wording?" },
      { ...reading.comprehensionQuestions[1], _id: null, question: "Also brand new?" }
    ],
    []
  );
  await updateReading(textId, schoolId, teacherId, false, payload);
  assert.deepEqual(
    savedReadings[0].comprehensionQuestions.map((question) => String(question._id)),
    [questionOneId, questionTwoId]
  );
});

test("an id the reading does not own is never trusted", async (t) => {
  const reading = storedReading();
  mockUpdateReading(t, reading);
  const payload = updatePayload(
    [
      { ...reading.comprehensionQuestions[0], _id: foreignId, question: "Unrelated wording?", order: 5 },
      reading.comprehensionQuestions[1]
    ],
    reading.criticalThinkingQuestions
  );
  await updateReading(textId, schoolId, teacherId, false, payload);
  assert.equal(savedReadings[0].comprehensionQuestions[0]._id, undefined);
});

test("questions the teacher removed disappear from the reading", async (t) => {
  const reading = storedReading();
  mockUpdateReading(t, reading);
  const payload = updatePayload([reading.comprehensionQuestions[1]], []);
  await updateReading(textId, schoolId, teacherId, false, payload);
  assert.equal(savedReadings[0].comprehensionQuestions.length, 1);
  assert.equal(savedReadings[0].criticalThinkingQuestions.length, 0);
});

test("duplicate question ids in one payload are rejected", async (t) => {
  const reading = storedReading();
  mockUpdateReading(t, reading);
  const payload = updatePayload(
    [
      { ...reading.comprehensionQuestions[0] },
      { ...reading.comprehensionQuestions[0], order: 2 }
    ],
    []
  );
  await assert.rejects(
    updateReading(textId, schoolId, teacherId, false, payload),
    (error) => error.statusCode === 400 && /unique/.test(error.message)
  );
});

test("a completion made before a rewrite still resolves to the kept id", async (t) => {
  const reading = storedReading();
  mockUpdateReading(t, reading);
  const completionResponses = [{ questionId: questionOneId, answer: "kept" }];
  const payload = updatePayload(
    [
      { ...reading.comprehensionQuestions[0], _id: null, question: "Totally different words?" },
      reading.comprehensionQuestions[1]
    ],
    reading.criticalThinkingQuestions
  );
  await updateReading(textId, schoolId, teacherId, false, payload);
  const currentIds = new Set(
    savedReadings[0].comprehensionQuestions.map((question) => String(question._id))
  );
  const stillResolves = completionResponses.filter((response) =>
    currentIds.has(String(response.questionId))
  );
  assert.equal(stillResolves.length, 1);
});

const draftAssignment = (gate = null) => ({
  _id: assignmentId,
  school: schoolId,
  text: textId,
  students: [studentId],
  isActive: true,
  isPublished: true,
  publishAt: null,
  ...(gate ? { readingGate: gate } : {})
});

const draftText = () => ({
  _id: textId,
  school: schoolId,
  comprehensionQuestions: storedQuestions().comprehensionQuestions,
  criticalThinkingQuestions: storedQuestions().criticalThinkingQuestions
});

const mockDraftEnvironment = (t, { assignment = draftAssignment(), finished = false, completed = false, queries = null } = {}) => {
  lastDraftWrite = null;
  t.mock.method(ReadingAssignment, "findOne", (q) => {
    if (queries) queries.push(q);
    const wanted = q?.students;
    if (wanted !== undefined && !(assignment.students || []).some((s) => String(s) === String(wanted))) {
      return query(null);
    }
    return query(assignment);
  });
  t.mock.method(ReadingCompletion, "exists", async () => completed);
  t.mock.method(ReadingProgressState, "findOne", () =>
    query(finished ? { readFinishedAt: new Date() } : null)
  );
  t.mock.method(SimplifiedText, "findOne", () => query(draftText()));
  t.mock.method(ReadingAnswerDraft, "findOneAndUpdate", (filter, update) => {
    lastDraftWrite = { filter, update };
    return query({ answers: update.$set.answers, updatedAt: update.$set.updatedAt });
  });
};

let lastDraftWrite = null;

test("drafts keep only current question ids and drop keys the gate still locks", async (t) => {
  mockDraftEnvironment(t, {
    assignment: draftAssignment({ enabled: true, lockScope: "quiz", minReadSeconds: 30 }),
    finished: false
  });
  const result = await saveAnswerDraft(schoolId, studentId, {
    assignmentId,
    textId,
    answers: {
      [questionOneId]: "0",
      [thinkingOneId]: "my thinking",
      [foreignId]: "sneaky"
    }
  });
  assert.deepEqual(result.answers, { [thinkingOneId]: "my thinking" });
  assert.deepEqual(lastDraftWrite.update.$set.answers, { [thinkingOneId]: "my thinking" });
});

test("a locked both-kinds gate drops short answers too", async (t) => {
  mockDraftEnvironment(t, {
    assignment: draftAssignment({
      enabled: true,
      lockScope: "quiz_and_thinking",
      minReadSeconds: 30
    }),
    finished: false
  });
  const result = await saveAnswerDraft(schoolId, studentId, {
    assignmentId,
    textId,
    answers: { [questionOneId]: "0", [thinkingOneId]: "my thinking" }
  });
  assert.deepEqual(result.answers, {});
});

test("a finished reading lets the draft hold every question", async (t) => {
  mockDraftEnvironment(t, {
    assignment: draftAssignment({ enabled: true, lockScope: "quiz_and_thinking", minReadSeconds: 30 }),
    finished: true
  });
  const result = await saveAnswerDraft(schoolId, studentId, {
    assignmentId,
    textId,
    answers: { [questionOneId]: "0", [thinkingOneId]: "my thinking" }
  });
  assert.deepEqual(result.answers, { [questionOneId]: "0", [thinkingOneId]: "my thinking" });
});

test("a submitted completion turns the draft into a conflict", async (t) => {
  mockDraftEnvironment(t, { completed: true });
  await assert.rejects(
    saveAnswerDraft(schoolId, studentId, { assignmentId, textId, answers: { [questionOneId]: "0" } }),
    (error) => error.statusCode === 409 && error.code === "READING_ALREADY_SUBMITTED"
  );
  assert.equal(lastDraftWrite, null);
});

test("another student's assignment is not found, and the query stays scoped", async (t) => {
  const queries = [];
  mockDraftEnvironment(t, { queries });
  await assert.rejects(
    saveAnswerDraft(schoolId, otherStudentId, { assignmentId, textId, answers: {} }),
    (error) => error.statusCode === 404 && error.code === "READING_ASSIGNMENT_NOT_FOUND"
  );
  assert.equal(queries.length, 1);
  assert.equal(String(queries[0].school), schoolId);
  assert.equal(String(queries[0].students), otherStudentId);
});

const mockProgressEnvironment = (t, { existingCompletion = null } = {}) => {
  const deletedDrafts = [];
  t.mock.method(ReadingAssignment, "findOne", () =>
    query({ _id: assignmentId, text: textId, readingGate: { enabled: false } })
  );
  t.mock.method(ReadingCompletion, "findOne", () => query(existingCompletion));
  t.mock.method(StudentReadingProfile, "findOneAndUpdate", () => query({}));
  t.mock.method(ReadingCompletion, "findOneAndUpdate", async () => ({}));
  t.mock.method(ReadingAnswerDraft, "deleteOne", async (filter) => {
    deletedDrafts.push(filter);
    return { deletedCount: 1 };
  });
  return deletedDrafts;
};

test("finishing the quiz deletes the saved draft", async (t) => {
  const deletedDrafts = mockProgressEnvironment(t, { existingCompletion: null });
  await updateProgress(studentId, textId, 1, 2, schoolId, assignmentId, null, {});
  assert.equal(deletedDrafts.length, 1);
  assert.deepEqual(deletedDrafts[0], {
    school: schoolId,
    student: studentId,
    assignment: assignmentId
  });
});

test("submitting a second time is a conflict that keeps the draft alone", async (t) => {
  const deletedDrafts = mockProgressEnvironment(t, {
    existingCompletion: { completedAt: new Date() }
  });
  await assert.rejects(
    updateProgress(studentId, textId, 1, 2, schoolId, assignmentId, null, {}),
    (error) => error.statusCode === 409 && error.code === "READING_ALREADY_SUBMITTED"
  );
  assert.equal(deletedDrafts.length, 0);
});

const mockRes = () => {
  const state = { statusCode: null, body: null };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(payload) {
      state.body = payload;
      return res;
    },
  };
  return { res, state };
};

/** The asyncHandler wrapper does not return the handler's promise. */
const settleResponse = async (state) => {
  for (let attempt = 0; attempt < 20 && state.body === null; attempt += 1) {
    await sleep(0);
  }
};

const requestWith = (body) => ({
  schoolId,
  user: { _id: "507f1f77bcf86cd799439150" },
  academicYear: "2026-2027",
  body,
});

test("an incomplete submission reports the missing question ids", async (t) => {
  t.mock.method(Student, "findOne", () => query({ _id: studentId }));
  t.mock.method(SimplifiedText, "findOne", () => query(draftText()));
  t.mock.method(ReadingAssignment, "findOne", () => query(draftAssignment()));
  const { res, state } = mockRes();
  await updateProgressController(
    requestWith({ textId, assignmentId, answers: { [questionTwoId]: "0" } }),
    res
  );
  await settleResponse(state);
  assert.equal(state.statusCode, 400);
  assert.equal(state.body.code, "READING_ANSWERS_INCOMPLETE");
  assert.deepEqual(state.body.data.missing, [questionOneId]);
});

test("the draft endpoint rejects oversized and malformed answer sets", async (t) => {
  t.mock.method(Student, "findOne", () => query({ _id: studentId }));
  const oversized = {};
  for (let index = 0; index < 61; index += 1) oversized[`k${index}`] = "0";
  const oversizedCall = mockRes();
  await saveAnswersDraftController(
    requestWith({ assignmentId, textId, answers: oversized }),
    oversizedCall.res
  );
  await settleResponse(oversizedCall.state);
  assert.equal(oversizedCall.state.statusCode, 400);

  const malformedCall = mockRes();
  await saveAnswersDraftController(
    requestWith({ assignmentId, textId, answers: { [questionOneId]: 3 } }),
    malformedCall.res
  );
  await settleResponse(malformedCall.state);
  assert.equal(malformedCall.state.statusCode, 400);
});

test("the draft endpoint stores whatever the gate allows", async (t) => {
  mockDraftEnvironment(t, {
    assignment: draftAssignment({ enabled: true, lockScope: "quiz", minReadSeconds: 30 }),
    finished: false
  });
  t.mock.method(Student, "findOne", () => query({ _id: studentId }));
  const { res, state } = mockRes();
  await saveAnswersDraftController(
    requestWith({
      assignmentId,
      textId,
      answers: { [questionOneId]: "0", [thinkingOneId]: "my thinking" }
    }),
    res
  );
  await settleResponse(state);
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body.data.answers, { [thinkingOneId]: "my thinking" });
});
