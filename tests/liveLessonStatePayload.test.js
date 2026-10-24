import assert from "node:assert/strict";
import test from "node:test";
import LiveGroup from "../models/LiveGroup.js";
import LiveResponse from "../models/LiveResponse.js";
import {
  applyStaffExtras,
  applyStudentAnswer,
  buildSharedState,
  getStateForUser,
} from "../services/liveLessonService.js";
import { normalizeLiveQuestion } from "../services/liveLessonQuestionService.js";

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
  assert.deepEqual(perUser, applyStudentAnswer(buildSharedState(session, { groupId: null }), answer));
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

const groupId = "507f1f77bcf86cd7994390b1";

const levelledSession = () => ({
  ...sessionFixture({ revealed: false }),
  lessonSnapshot: {
    slides: [
      {
        _id: slideId,
        type: "question",
        title: "Check for understanding",
        speakerNotes: "Only the teacher reads this.",
        question: normalizeLiveQuestion({
          kind: "matching",
          prompt: "Match each term with its meaning.",
          matchingPairs: [
            { left: "Simile", right: "A comparison using like or as" },
            { left: "Alliteration", right: "Repeated starting sounds" },
          ],
          explanation: "A simile says like or as.",
        }, { salt: "lesson:0" }),
        variants: [
          {
            groupId,
            question: normalizeLiveQuestion({
              kind: "text",
              prompt: "Explain why the narrator lies.",
              guidance: "Two sentences.",
              criteria: "Names the motive.",
            }, { salt: "lesson:0v0" }),
          },
        ],
      },
    ],
  },
});

test("a levelled slide sends each group its own question and never an answer key", async (t) => {
  t.mock.method(LiveGroup, "find", () => ({
    select: () => ({ lean: async () => [{ _id: groupId, studentIds: ["student-1"] }] }),
  }));
  t.mock.method(LiveResponse, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));

  const session = levelledSession();
  const levelled = await getStateForUser(session, { role: "student", _id: "student-1" });
  const wholeClass = await getStateForUser(session, { role: "student", _id: "student-2" });

  assert.equal(levelled.slide.question.kind, "text");
  assert.equal(levelled.slide.question.guidance, "Two sentences.");
  assert.equal(wholeClass.slide.question.kind, "matching");
  assert.deepEqual(wholeClass.slide.question.matchingColumns.terms, ["Simile", "Alliteration"]);

  for (const state of [levelled, wholeClass]) {
    const serialized = JSON.stringify(state);
    assert.equal(serialized.includes("Names the motive"), false);
    assert.equal(serialized.includes("A simile says like or as"), false);
    assert.equal(serialized.includes("Only the teacher reads this"), false);
    assert.equal(serialized.includes(groupId), false);
    assert.equal("variants" in state.slide, false);
    // The matching choices are what the student picks from; the pairing is the key.
    assert.equal("matchingPairs" in state.slide.question, false);
  }
  // The other level's content never crosses over.
  assert.equal(JSON.stringify(levelled).includes("A comparison using like or as"), false);
});

test("the teacher payload carries the key for the class question and for every level", async () => {
  const shared = buildSharedState(levelledSession());

  const staff = applyStaffExtras(shared, [{ studentId: "student-1", name: "A Student", presence: "not_joined" }]);
  assert.equal(staff.teacherAnswer.kind, "matching");
  assert.ok(staff.teacherAnswer.answerText.includes("A comparison using like or as"));
  assert.deepEqual(staff.levelAnswers, [
    { groupId, teacherAnswer: { kind: "text", correctOptionId: "", correctOptionIds: [], answerText: "", explanation: "" } },
  ]);

  // Students never get the teacher fields the staff payload adds.
  const student = applyStudentAnswer(buildSharedState(levelledSession(), { groupId }), null);
  assert.equal("teacherAnswer" in student, false);
  assert.equal("levelAnswers" in student, false);
});
