import assert from "node:assert/strict";
import test from "node:test";
import Class from "../models/Class.js";
import LiveGroup from "../models/LiveGroup.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import { getLiveSessionReport } from "../controllers/liveLessonController.js";

const sessionId = "507f1f77bcf86cd799439011";
const schoolId = "507f1f77bcf86cd799439012";
const classId = "507f1f77bcf86cd799439013";
const teacherId = "507f1f77bcf86cd799439014";
const supportGroupId = "507f1f77bcf86cd799439015";

const query = (value) => ({
  sort() { return this; },
  select() { return this; },
  lean: async () => value,
});

const response = (data) => ({
  _id: `${data.slideId}:${data.studentId}`,
  school: schoolId,
  sessionId,
  submittedAt: new Date("2026-10-01T09:10:00.000Z"),
  latencyMs: 4000,
  selectedOptionId: "",
  response: null,
  text: "",
  isCorrect: null,
  score: null,
  grade: { status: "auto", marks: null, maxMarks: null, feedback: "", released: false },
  ...data,
});

const sessionFixture = ({ responses, events }) => ({
  _id: sessionId,
  school: schoolId,
  classId,
  teacherId,
  status: "ended",
  questionOpen: false,
  currentSlideIndex: 2,
  startedAt: new Date("2026-10-01T09:00:00.000Z"),
  endedAt: new Date("2026-10-01T09:40:00.000Z"),
  createdAt: new Date("2026-10-01T08:55:00.000Z"),
  paused: false,
  pausedAt: null,
  totalPausedMs: 0,
  rosterCapturedAt: new Date("2026-10-01T08:58:00.000Z"),
  rosterSnapshot: [
    { studentId: "ada", name: "Ada" },
    { studentId: "grace", name: "Grace" },
    { studentId: "ida", name: "Ida" },
  ],
  lessonSnapshot: {
    title: "Figurative Language",
    subject: "ELA",
    slides: [
      {
        // Written before question kinds existed: no kind at all, only options.
        _id: "slide-1",
        type: "question",
        title: "Check 1",
        question: {
          prompt: "Which word means the same as brave?",
          options: [{ id: "a", text: "bold" }, { id: "b", text: "timid" }],
          correctOptionId: "a",
        },
      },
      {
        _id: "slide-2",
        type: "question",
        title: "Exit ticket",
        question: {
          kind: "text",
          prompt: "Explain why the narrator lies.",
          guidance: "Two sentences.",
          criteria: "Names the motive.",
        },
      },
      {
        _id: "slide-3",
        type: "question",
        title: "Levelled check",
        question: {
          kind: "mcq",
          prompt: "Class: which is a simile?",
          options: [{ id: "c1", text: "brave as a lion" }, { id: "c2", text: "a lion" }],
          correctOptionId: "c1",
        },
        variants: [{
          groupId: supportGroupId,
          question: {
            kind: "mcq",
            prompt: "Support: which is an idiom?",
            options: [{ id: "s1", text: "it is raining cats" }, { id: "s2", text: "cats" }],
            correctOptionId: "s1",
          },
        }],
      },
    ],
  },
  // Report code reads the document the way mongoose hands it over.
  toObject() { return this; },
  responses,
  events,
});

const runReport = async (t, { responses, events }) => {
  const session = sessionFixture({ responses, events });
  t.mock.method(LiveSession, "findOne", async () => session);
  t.mock.method(LiveResponse, "find", () => query(responses));
  t.mock.method(LiveSessionEvent, "find", () => query(events));
  t.mock.method(Class, "findOne", () => query({ _id: classId, name: "Grade 7 Blue", grade: "7", section: "Blue" }));
  t.mock.method(LiveGroup, "find", () => query([
    { _id: supportGroupId, name: "Needs support", studentIds: ["ada"] },
  ]));

  let resolveBody;
  const settled = new Promise((resolve) => { resolveBody = resolve; });
  const respond = (value) => resolveBody(value);
  const res = {
    status(code) { return { json: respond }; },
    json: respond,
  };
  // asyncHandler swallows the handler's promise, so the response itself is what the test waits for.
  getLiveSessionReport(
    { params: { id: sessionId }, user: { _id: teacherId, role: "teacher" }, schoolId },
    res,
    (error) => respond({ error }),
  );
  const body = await settled;
  assert.equal(body.error, undefined, body.error?.stack || "");
  assert.equal(body.success, true, JSON.stringify(body));
  return body.data;
};

const openedEvents = (slideIds) => slideIds.flatMap((slideId, index) => [
  { type: "question:opened", at: new Date(`2026-10-01T09:0${index + 1}:00.000Z`), payload: { slideId }, actor: { role: "teacher", userId: teacherId } },
  { type: "question:closed", at: new Date(`2026-10-01T09:1${index + 1}:00.000Z`), payload: { slideId }, actor: { role: "teacher", userId: teacherId } },
]).concat(
  ["ada", "grace"].flatMap((studentId) => [
    { type: "presence:joined", at: new Date("2026-10-01T09:00:00.000Z"), payload: { studentId }, actor: { role: "student", userId: studentId } },
  ]),
);

test("the report reads a kind-less legacy question as the option question it is", async (t) => {
  const report = await runReport(t, {
    responses: [
      response({ studentId: "ada", slideId: "slide-1", selectedOptionId: "a", isCorrect: true, score: 1 }),
      response({ studentId: "grace", slideId: "slide-1", selectedOptionId: "b", isCorrect: false, score: 0 }),
    ],
    events: openedEvents(["slide-1"]),
  });

  const [first] = report.perQuestion;
  assert.equal(first.slideId, "slide-1");
  assert.equal(first.kind, "mcq");
  assert.equal(first.key, "bold");
  assert.deepEqual(first.options.map((option) => [option.id, option.correct]), [["a", true], ["b", false]]);
  assert.deepEqual(first.perOption, { a: 1, b: 1 });
  assert.equal(first.answered, 2);
  assert.equal(first.correct, 1);
  assert.equal(first.wrong, 1);
  assert.equal(first.percentCorrect, 50);
  assert.equal(first.unanswered, 1);
  assert.equal(first.awaiting, 0);

  const ada = report.perStudent.find((student) => student.studentId === "ada");
  assert.equal(ada.answerDetails[0].selectedAnswer, "bold");
  assert.equal(ada.answerDetails[0].correctAnswer, "bold");
  assert.equal(ada.answerDetails[0].result, "correct");
  assert.equal(ada.correct, 1);
  assert.equal(ada.scorePercent, 100);
});

test("a written answer nobody has marked waits in the queue instead of scoring zero", async (t) => {
  const report = await runReport(t, {
    responses: [
      response({ studentId: "ada", slideId: "slide-2", text: "He lies to stay safe.", grade: { status: "pending", marks: null, maxMarks: null, feedback: "", released: false } }),
      response({ studentId: "grace", slideId: "slide-2", text: "He lies because he is afraid.", grade: { status: "graded", marks: 1, maxMarks: 2, feedback: "Nearly there.", released: false } }),
    ],
    events: openedEvents(["slide-2"]),
  });

  const written = report.perQuestion.find((question) => question.slideId === "slide-2");
  assert.equal(written.kind, "text");
  assert.deepEqual(written.options, []);
  assert.equal(written.key, "");
  assert.equal(written.guidance, undefined);
  assert.equal(written.answered, 2);
  assert.equal(written.pending, 1);
  assert.equal(written.correct, 0);
  assert.equal(written.wrong, 0);
  // Only the marked answer is credited, so the teacher's own queue is not counted as a wrong.
  assert.equal(written.percentCorrect, 50);
  assert.equal(report.summary.awaitingMarks, 1);
  assert.deepEqual(written.answers.map((row) => [row.name, row.state, row.credit]), [
    ["Ada", "pending", null],
    ["Grace", "partial", 0.5],
  ]);

  const ada = report.perStudent.find((student) => student.studentId === "ada");
  const detail = ada.answerDetails.find((answer) => answer.slideId === "slide-2");
  assert.equal(detail.result, "pending");
  assert.equal(detail.credit, null);
  assert.equal(detail.selectedAnswer, "He lies to stay safe.");
  assert.equal(ada.toMark, 1);
  assert.equal(ada.scorePercent, 0);
  assert.equal(ada.answered, 1);
});

test("a levelled slide reports each group against the question that group was shown", async (t) => {
  const report = await runReport(t, {
    responses: [
      response({ studentId: "ada", slideId: "slide-3", selectedOptionId: "s1", isCorrect: true, score: 1 }),
      response({ studentId: "grace", slideId: "slide-3", selectedOptionId: "c2", isCorrect: false, score: 0 }),
    ],
    events: openedEvents(["slide-3"]),
  });

  const levelled = report.perQuestion.find((question) => question.slideId === "slide-3");
  assert.deepEqual(levelled.levels.map((level) => [level.level, level.key, level.answered, level.percentCorrect]), [
    ["Class", "brave as a lion", 1, 0],
    ["Needs support", "it is raining cats", 1, 100],
  ]);

  const ada = report.perStudent.find((student) => student.studentId === "ada");
  const detail = ada.answerDetails.find((answer) => answer.slideId === "slide-3");
  assert.equal(detail.level, "Needs support");
  assert.equal(detail.prompt, "Support: which is an idiom?");
  assert.equal(detail.correctAnswer, "it is raining cats");
  assert.equal(detail.selectedAnswer, "it is raining cats");
});
