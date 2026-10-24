import assert from "node:assert/strict";
import test from "node:test";
import LiveGroup from "../models/LiveGroup.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import Student from "../models/Student.js";
import { getLiveSessionReplay } from "../controllers/liveLessonController.js";

const sessionId = "507f1f77bcf86cd799439011";
const schoolId = "507f1f77bcf86cd799439012";
const classId = "507f1f77bcf86cd799439013";
const adaId = "507f1f77bcf86cd799439014";
const supportGroupId = "507f1f77bcf86cd799439015";

const query = (value) => ({
  sort() { return this; },
  select() { return this; },
  lean: async () => value,
});

const session = {
  _id: sessionId,
  school: schoolId,
  classId,
  teacherId: "507f1f77bcf86cd799439016",
  status: "ended",
  replayAvailable: true,
  startedAt: new Date("2026-10-01T09:00:00.000Z"),
  endedAt: new Date("2026-10-01T09:40:00.000Z"),
  lessonSnapshot: {
    title: "Figurative Language",
    slides: [
      {
        _id: "slide-1",
        title: "Exit ticket",
        question: {
          kind: "mcq",
          prompt: "What does the idiom mean?",
          options: [{ id: "a", text: "It is raining" }],
          correctOptionId: "a",
        },
        variants: [{
          groupId: supportGroupId,
          question: {
            kind: "mcq",
            prompt: "Which picture shows cats and dogs falling?",
            options: [{ id: "a", text: "Rain" }],
            correctOptionId: "a",
          },
        }],
      },
      {
        _id: "slide-2",
        question: { kind: "text", prompt: "Why does the character lie?" },
      },
    ],
  },
};

const runReplay = async (t, responses) => {
  const calls = [];
  t.mock.method(LiveSession, "findOne", () => session);
  t.mock.method(Student, "exists", async () => true);
  t.mock.method(LiveSessionEvent, "find", () => query([]));
  t.mock.method(LiveGroup, "find", () => query([{ _id: supportGroupId, studentIds: [adaId] }]));
  t.mock.method(LiveResponse, "find", (filter) => {
    calls.push(filter);
    return query(responses);
  });

  let resolveBody;
  const settled = new Promise((resolve) => { resolveBody = resolve; });
  const respond = (value) => resolveBody(value);
  const res = { status: () => ({ json: respond }), json: respond };
  // asyncHandler swallows the handler's promise, so the response itself is what the test waits for.
  getLiveSessionReplay(
    { params: { id: sessionId }, user: { _id: adaId, role: "student" }, schoolId },
    res,
    (error) => respond({ error }),
  );
  const body = await settled;
  assert.equal(body.error, undefined, body.error?.stack || "");
  assert.equal(body.success, true, JSON.stringify(body));
  return { data: body.data, calls };
};

test("a student replay carries only the marks the teacher released", async (t) => {
  const { data, calls } = await runReplay(t, [
    {
      slideId: "slide-1",
      studentId: adaId,
      grade: { status: "auto", marks: null, maxMarks: null, feedback: "", released: false },
    },
    {
      slideId: "slide-2",
      studentId: adaId,
      submittedAt: new Date("2026-10-01T09:12:00.000Z"),
      grade: { status: "graded", marks: 1, maxMarks: 2, feedback: "Add one example.", released: true },
    },
  ]);

  assert.deepEqual(calls[0], { school: schoolId, sessionId, studentId: adaId },
    "A student's marks are read under their own tenant and their own id.");
  assert.deepEqual(data.students, [], "No other student is named in a student replay.");

  const [first, second] = data.myResults;
  assert.equal(first.released, false);
  assert.equal(first.marks, null);
  assert.equal(first.feedback, "");
  assert.equal(second.released, true);
  assert.equal(second.marks, 1);
  assert.equal(second.maxMarks, 2);
  assert.equal(second.feedback, "Add one example.");
});

test("a student replay shows the question their level was asked, and never a key", async (t) => {
  const { data } = await runReplay(t, []);

  assert.equal(data.myResults[0].prompt, "Which picture shows cats and dogs falling?");
  assert.equal(data.myResults[1].prompt, "Why does the character lie?");
  const payload = JSON.stringify(data);
  assert.equal(payload.includes("correctOptionId"), false, "A student replay carries no answer key.");
  assert.equal(payload.includes("variants"), false, "Another level's question is not shown to this student.");
});
