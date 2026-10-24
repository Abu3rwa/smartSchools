import assert from "node:assert/strict";
import test from "node:test";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import { updateLiveSessionQuestionMarks } from "../controllers/liveLessonController.js";

const sessionId = "507f1f77bcf86cd799439011";
const schoolId = "507f1f77bcf86cd799439012";
const teacherId = "507f1f77bcf86cd799439014";
const adaId = "507f1f77bcf86cd7994390a1";
const graceId = "507f1f77bcf86cd7994390a2";
const writtenSlideId = "slide-written";
const mcqSlideId = "slide-mcq";

const sessionFixture = (questionMarks = []) => ({
  _id: sessionId,
  school: schoolId,
  classId: "507f1f77bcf86cd799439013",
  teacherId,
  status: "ended",
  questionMarks,
  lessonSnapshot: {
    title: "Figurative Language",
    slides: [
      { _id: writtenSlideId, question: { kind: "text", prompt: "Explain the metaphor." } },
      {
        _id: mcqSlideId,
        question: {
          kind: "mcq",
          prompt: "Which is a simile?",
          options: [{ id: "a", text: "as brave as a lion" }, { id: "b", text: "a lion" }],
          correctOptionId: "a",
        },
      },
    ],
  },
  toObject() { return this; },
});

const mark = (body, { session = sessionFixture(), answered = [adaId, graceId] } = {}) => {
  let written;
  const pushes = [];
  const originals = {
    findOne: LiveSession.findOne,
    updateOne: LiveSession.updateOne,
    responseFind: LiveResponse.find,
    bulkWrite: LiveResponse.bulkWrite,
  };
  LiveSession.findOne = async () => session;
  LiveSession.updateOne = (filter, update) => { pushes.push({ filter, update }); return Promise.resolve({}); };
  LiveResponse.find = () => ({
    select: () => ({ lean: async () => answered.map((studentId) => ({ studentId })) }),
  });
  LiveResponse.bulkWrite = (operations) => { written = operations; return Promise.resolve({}); };

  const restore = () => {
    LiveSession.findOne = originals.findOne;
    LiveSession.updateOne = originals.updateOne;
    LiveResponse.find = originals.responseFind;
    LiveResponse.bulkWrite = originals.bulkWrite;
  };

  let resolveBody;
  const settled = new Promise((resolve) => { resolveBody = resolve; });
  const res = {
    status: (code) => ({ json: (value) => resolveBody({ ...value, statusCode: code }) }),
    json: (value) => resolveBody(value),
  };
  updateLiveSessionQuestionMarks(
    { params: { id: sessionId }, body, user: { _id: teacherId, role: "teacher" }, schoolId },
    res,
    (error) => resolveBody({ error }),
  );
  return settled.then(async (body2) => {
    restore();
    if (body2.error) throw body2.error;
    if (body2.success !== true) return { failure: body2 };
    // Every update names the school and the session, so no request can mark another school's answer.
    written?.forEach((operation) => {
      assert.deepEqual(operation.updateOne.filter, {
        school: schoolId, sessionId, slideId: body.slideId, studentId: operation.updateOne.filter.studentId,
      });
    });
    return { data: body2.data, written, pushes: pushes.map((push) => push.update) };
  });
};

const gradeOf = (operation) => operation.updateOne.update.$set;

test("a written answer is marked, released and worth its share of the question", async () => {
  const { data, written } = await mark({
    slideId: writtenSlideId,
    maxMarks: 2,
    marks: [
      { studentId: adaId, marks: 1, feedback: "Name the motive next time.", released: true },
      { studentId: graceId, marks: 2, feedback: "", released: false },
    ],
  });

  assert.deepEqual(data, { slideId: writtenSlideId, maxMarks: 2, marked: 2, released: 1 });
  const ada = gradeOf(written[0]);
  assert.equal(ada["grade.status"], "graded");
  assert.equal(ada["grade.marks"], 1);
  assert.equal(ada["grade.maxMarks"], 2);
  assert.equal(ada["grade.feedback"], "Name the motive next time.");
  assert.equal(ada["grade.released"], true);
  // half credit is a score, not a correct answer, exactly like a half-awarded objective answer
  assert.equal(ada.isCorrect, false);
  assert.equal(ada.score, 0.5);
  assert.equal(gradeOf(written[1]).isCorrect, true);
  assert.equal(gradeOf(written[1]).score, 1);
});

test("the allocation a question is worth is kept on the session", async () => {
  const { pushes } = await mark({
    slideId: writtenSlideId,
    maxMarks: 3,
    marks: [{ studentId: adaId, marks: 3 }],
  });
  assert.deepEqual(pushes, [
    { $pull: { questionMarks: { slideId: writtenSlideId } } },
    { $push: { questionMarks: { slideId: writtenSlideId, maxMarks: 3 } } },
  ]);

  // and a session that already stores it is not rewritten for the same number
  const again = await mark(
    { slideId: writtenSlideId, marks: [{ studentId: adaId, marks: 3 }] },
    { session: sessionFixture([{ slideId: writtenSlideId, maxMarks: 3 }]) },
  );
  assert.deepEqual(again.pushes, []);
  assert.deepEqual(again.data.maxMarks, 3);
});

test("a blank mark returns the answer to the queue without touching the engine's verdict", async () => {
  const { written } = await mark({
    slideId: mcqSlideId,
    maxMarks: 1,
    marks: [{ studentId: adaId, marks: "", feedback: "keep the comment", released: true }],
  });
  const cleared = gradeOf(written[0]);
  assert.equal(cleared["grade.status"], "pending");
  assert.equal(cleared["grade.marks"], null);
  assert.equal(cleared["grade.released"], false);
  assert.equal(cleared["grade.feedback"], "keep the comment");
  // an objective answer falls back to what the grader said, so isCorrect and score are left alone
  assert.equal("isCorrect" in cleared, false);
  assert.equal("score" in cleared, false);
});

test("marking refuses a number the question cannot pay out", async () => {
  const tooHigh = await mark({
    slideId: writtenSlideId, maxMarks: 2, marks: [{ studentId: adaId, marks: 3 }],
  });
  assert.equal(tooHigh.failure?.statusCode, 400);
  assert.match(tooHigh.failure.message, /between 0 and 2/);

  const notAQuestion = await mark({
    slideId: "slide-notes", marks: [{ studentId: adaId, marks: 1 }],
  });
  assert.equal(notAQuestion.failure?.statusCode, 400);

  const neverAnswered = await mark({
    slideId: writtenSlideId, marks: [{ studentId: "507f1f77bcf86cd7994390a9", marks: 1 }],
  });
  assert.equal(neverAnswered.failure?.statusCode, 400);
  assert.match(neverAnswered.failure.message, /submitted/);

  const twice = await mark({
    slideId: writtenSlideId, marks: [{ studentId: adaId, marks: 1 }, { studentId: adaId, marks: 2 }],
  });
  assert.equal(twice.failure?.statusCode, 400);
});
