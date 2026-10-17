import assert from "node:assert/strict";
import test from "node:test";
import LiveSession from "../models/LiveSession.js";
import {
  safeSlide,
  sanitizeStudentReplayEvents,
} from "../services/liveLessonService.js";

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
