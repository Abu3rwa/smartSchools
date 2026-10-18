import assert from "node:assert/strict";
import test from "node:test";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import {
  getStateForUser,
  safeSlide,
  sanitizeStudentReplayEvents,
} from "../services/liveLessonService.js";

const questionSession = {
  _id: "session-1",
  status: "live",
  lessonSnapshot: {
    slides: [{
      _id: "slide-1",
      question: {
        prompt: "Which is correct?",
        options: [{ id: "a", text: "A" }],
        correctOptionId: "a",
        explanation: "Because A is correct.",
      },
    }],
  },
  currentSlideIndex: 0,
  revealedSlideIds: [],
  rosterCapturedAt: new Date(),
  rosterSnapshot: [{ studentId: "student-1", name: "Ada" }],
};

test("teacher live state provides roster and answer key without loading students' responses", async (t) => {
  t.mock.method(LiveResponse, "find", () => {
    throw new Error("Teacher live state should not query student responses.");
  });

  const state = await getStateForUser(questionSession, {
    _id: "teacher-1",
    role: "teacher",
  });

  assert.equal(state.answers, undefined);
  assert.deepEqual(state.roster, [{
    studentId: "student-1",
    name: "Ada",
    presence: "not_joined",
  }]);
  assert.equal(state.teacherAnswer.correctOptionId, "a");
});

test("student live state still returns their own answer after results are revealed", async (t) => {
  const selectedOptionId = "a";
  t.mock.method(LiveResponse, "findOne", () => ({
    select() { return this; },
    lean: async () => ({ selectedOptionId, isCorrect: true }),
  }));

  const state = await getStateForUser({
    ...questionSession,
    revealedSlideIds: ["slide-1"],
  }, { _id: "student-1", role: "student" });

  assert.deepEqual(state.myAnswer, { selectedOptionId });
  assert.equal(state.myIsCorrect, true);
  assert.equal(state.revealed, true);
});

test("student replay strips answer keys from lesson slides", () => {
  const slide = safeSlide({
    _id: "slide-1",
    speakerNotes: "Teacher-only answer notes.",
    question: {
      prompt: "Which is correct?",
      options: [{ id: "a", text: "A" }],
      correctOptionId: "a",
      explanation: "Because A is correct.",
    },
  });

  assert.equal(slide.question.correctOptionId, undefined);
  assert.equal(slide.question.explanation, undefined);
  assert.equal(slide.question.prompt, "Which is correct?");
  assert.equal(slide.speakerNotes, undefined);
});

test("student replay retains teacher timeline events but strips answer and presence data", () => {
  const safeEvents = sanitizeStudentReplayEvents([
    {
      seq: 1,
      type: "slide:changed",
      at: new Date("2026-10-17T10:00:00Z"),
      offsetMs: 0,
      actor: { role: "teacher", userId: "teacher-id" },
      payload: { index: 2, slideId: "slide-1", secret: "discard" },
    },
    {
      seq: 2,
      type: "answer:submitted",
      actor: { role: "student", userId: "student-id" },
      payload: { studentId: "student-id", selectedOptionId: "b", isCorrect: false },
    },
    {
      seq: 3,
      type: "presence:away",
      actor: { role: "student", userId: "student-id" },
      payload: { reason: "visibility_hidden" },
    },
  ]);

  assert.equal(safeEvents.length, 1);
  assert.deepEqual(safeEvents[0].actor, { role: "teacher" });
  assert.deepEqual(safeEvents[0].payload, { slideId: "slide-1", index: 2 });
  assert.equal(safeEvents[0].payload.secret, undefined);
});

test("student replay sharing defaults to off", () => {
  assert.equal(LiveSession.schema.path("replayAvailable").defaultValue, false);
});
