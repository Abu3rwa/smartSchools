import assert from "node:assert/strict";
import test from "node:test";
import LiveResponse from "../models/LiveResponse.js";
import {
  applyStaffExtras,
  applyStudentAnswer,
  buildSharedState,
  getStateForUser,
} from "../services/liveLessonService.js";

const sessionId = "507f1f77bcf86cd799439011";
const slideId = "607f1f77bcf86cd7994390aa";

const sessionFixture = ({ revealed = true } = {}) => ({
  _id: sessionId,
  school: "507f1f77bcf86cd799439012",
  classId: "507f1f77bcf86cd799439013",
  status: "live",
  startedAt: new Date("2026-10-01T09:00:00.000Z"),
  currentSlideIndex: 0,
  slideHidden: false,
  studentsFullscreen: false,
  questionOpen: !revealed,
  paused: false,
  pausedAt: null,
  totalPausedMs: 0,
  timerDurationMinutes: 20,
  revealedSlideIds: revealed ? [slideId] : [],
  rosterCapturedAt: new Date("2026-10-01T08:55:00.000Z"),
  rosterSnapshot: [{ studentId: "student-1", name: "A Student" }],
  lessonSnapshot: {
    slides: [
      {
        _id: slideId,
        type: "question",
        title: "What is 2 + 2?",
        speakerNotes: "Ask a child to explain their thinking.",
        question: {
          prompt: "What is 2 + 2?",
          options: [
            { id: "a", text: "4" },
            { id: "b", text: "5" },
          ],
          correctOptionId: "a",
          explanation: "Counting on from two gives four.",
        },
      },
    ],
  },
});

test("the broadcast payload a student receives matches the per-user payload", async (t) => {
  const answer = { selectedOptionId: "a", isCorrect: true };
  t.mock.method(LiveResponse, "findOne", () => ({
    select: () => ({ lean: async () => answer }),
  }));

  const session = sessionFixture();
  const perUser = await getStateForUser(session, { role: "student", _id: "student-1" });
  assert.deepEqual(perUser, applyStudentAnswer(buildSharedState(session), answer));
  assert.equal(perUser.myAnswer.selectedOptionId, "a");
  assert.equal(perUser.myIsCorrect, true);
  assert.equal(perUser.revealed, true);
});

test("an unrevealed question never exposes the result to the student", async (t) => {
  t.mock.method(LiveResponse, "findOne", () => ({
    select: () => ({ lean: async () => ({ selectedOptionId: "b", isCorrect: false }) }),
  }));

  const state = await getStateForUser(
    sessionFixture({ revealed: false }),
    { role: "student", _id: "student-1" },
  );
  assert.equal(state.revealed, false);
  assert.equal("myIsCorrect" in state, false);
  assert.deepEqual(state.myAnswer, { selectedOptionId: "b" });
});

test("no viewer payload carries speaker notes, the key or the explanation", async (t) => {
  t.mock.method(LiveResponse, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));

  const serialized = JSON.stringify(
    await getStateForUser(sessionFixture(), { role: "student", _id: "student-1" }),
  );
  assert.equal(serialized.includes("Ask a child"), false);
  assert.equal(serialized.includes("Counting on from two"), false);

  const shared = buildSharedState(sessionFixture());
  const staff = applyStaffExtras(
    shared,
    shared.state.roster || [{ studentId: "student-1", name: "A Student", presence: "not_joined" }],
  );
  assert.equal(staff.teacherAnswer.correctOptionId, "a");
  assert.equal(staff.teacherAnswer.explanation, "Counting on from two gives four.");
});

test("staff payloads still carry the roster with a not-joined presence", async () => {
  const state = await getStateForUser(sessionFixture(), { role: "teacher", _id: "teacher-1" });
  assert.equal(state.myAnswer, null);
  assert.deepEqual(state.roster, [
    { studentId: "student-1", name: "A Student", presence: "not_joined" },
  ]);
  assert.equal(state.totalSlides, 1);
  assert.equal(state.timerDurationMinutes, 20);
});
