import assert from "node:assert/strict";
import test from "node:test";
import Class from "../models/Class.js";
import LiveGroup from "../models/LiveGroup.js";
import LiveResponse from "../models/LiveResponse.js";
import LiveSession from "../models/LiveSession.js";
import LiveSessionEvent from "../models/LiveSessionEvent.js";
import School from "../models/School.js";
import { draftLiveSessionQuestionMarks } from "../controllers/liveLessonController.js";
import liveLessonMarkDraftService, { MAX_DRAFT_ANSWERS } from "../services/liveLessonMarkDraftService.js";

const sessionId = "507f1f77bcf86cd799439011";
const schoolId = "507f1f77bcf86cd799439012";
const classId = "507f1f77bcf86cd799439013";
const teacherId = "507f1f77bcf86cd799439014";
const adaId = "507f1f77bcf86cd7994390a1";
const graceId = "507f1f77bcf86cd7994390a2";
const supportGroupId = "507f1f77bcf86cd7994390b1";
const writtenSlideId = "slide-written";
const mcqSlideId = "slide-mcq";

const query = (value) => ({
  sort() { return this; },
  select() { return this; },
  lean: async () => value,
});

const session = ({ questionMarks = [], slides = null } = {}) => ({
  _id: sessionId,
  school: schoolId,
  classId,
  teacherId,
  status: "ended",
  questionMarks,
  rosterCapturedAt: new Date("2026-10-01T09:00:00.000Z"),
  rosterSnapshot: [
    { studentId: adaId, name: "Ada" },
    { studentId: graceId, name: "Grace" },
  ],
  startedAt: new Date("2026-10-01T09:00:00.000Z"),
  endedAt: new Date("2026-10-01T09:40:00.000Z"),
  lessonSnapshot: {
    title: "Figurative Language",
    slides: slides || [
      { _id: "slide-notes", title: "Today" },
      { _id: writtenSlideId, title: "Exit ticket", question: { kind: "text", prompt: "Why does the character lie?" } },
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

const written = (studentId, text) => ({
  _id: `response-${studentId}`,
  studentId,
  slideId: writtenSlideId,
  text,
  isCorrect: null,
  score: null,
  submittedAt: new Date("2026-10-01T09:20:00.000Z"),
  latencyMs: 42000,
  grade: { status: "pending", marks: null, maxMarks: null, feedback: "", released: false },
});

const drafted = async (t, {
  body,
  draftsOn = true,
  session: fixture = session(),
  responses = [written(adaId, "He is afraid, so he lies."), written(graceId, "Because.")],
  groups = [],
  suggestion = { drafts: [], unavailable: false, reason: "" },
}) => {
  const asks = [];
  let wrote = null;
  t.mock.method(LiveSession, "findOne", () => fixture);
  t.mock.method(LiveSession, "updateOne", (filter, update) => { wrote = update; return Promise.resolve({}); });
  t.mock.method(LiveResponse, "find", () => query(responses));
  t.mock.method(LiveResponse, "bulkWrite", (operations) => { wrote = operations; return Promise.resolve({}); });
  t.mock.method(LiveSessionEvent, "find", () => query([
    { type: "question:opened", at: new Date("2026-10-01T09:10:00.000Z"), payload: { slideId: writtenSlideId }, actor: { role: "teacher", userId: teacherId } },
    { type: "question:closed", at: new Date("2026-10-01T09:25:00.000Z"), payload: { slideId: writtenSlideId }, actor: { role: "teacher", userId: teacherId } },
  ]));
  t.mock.method(LiveGroup, "find", () => query(groups));
  t.mock.method(Class, "findOne", () => query({ _id: classId, name: "7B" }));
  t.mock.method(School, "findById", () => query({
    settings: { liveLessonMarkDrafting: { aiDraftEnabled: draftsOn } },
  }));
  t.mock.method(liveLessonMarkDraftService, "draftMarks", async (options) => {
    asks.push(options);
    return suggestion;
  });

  let resolveBody;
  const settled = new Promise((resolve) => { resolveBody = resolve; });
  const respond = (value) => resolveBody(value);
  const res = { status: (code) => ({ json: (value) => respond({ ...value, statusCode: code }) }), json: respond };
  // asyncHandler swallows the handler's promise, so the response itself is what the test waits for.
  draftLiveSessionQuestionMarks(
    { params: { id: sessionId }, body, user: { _id: teacherId, role: "teacher" }, schoolId },
    res,
    (error) => respond({ error }),
  );
  const body2 = await settled;
  if (body2.error) throw body2.error;
  return { body: body2, asks, wrote };
};

test("suggested marks come back for the answers still waiting, and nothing is saved", async (t) => {
  const { body, asks, wrote } = await drafted(t, {
    body: { slideId: writtenSlideId },
    suggestion: { drafts: [{ studentId: adaId, marks: 1.5, feedback: "Say which fear.", confidence: "high" }], unavailable: false, reason: "" },
  });

  assert.equal(body.success, true);
  assert.deepEqual(body.data, {
    slideId: writtenSlideId,
    maxMarks: 2,
    pending: 2,
    drafts: [{ studentId: adaId, marks: 1.5, feedback: "Say which fear.", confidence: "high" }],
    unavailable: false,
    reason: "",
  });
  // the drafter sees exactly the teacher's queue, with the words the question asked
  assert.equal(asks.length, 1);
  assert.equal(asks[0].maxMarks, 2);
  assert.deepEqual(asks[0].entries, [
    { studentId: adaId, level: null, prompt: "Why does the character lie?", guidance: "", expected: "", answer: "He is afraid, so he lies." },
    { studentId: graceId, level: null, prompt: "Why does the character lie?", guidance: "", expected: "", answer: "Because." },
  ]);
  assert.equal(asks[0].schoolId, schoolId);
  assert.equal(asks[0].userId, teacherId);
  // an approval is not a mark: not one answer, session or gradebook row is touched
  assert.equal(wrote, null);
});

test("an admin's switch decides whether a school gets suggestions at all", async (t) => {
  const { body, asks } = await drafted(t, { body: { slideId: writtenSlideId }, draftsOn: false });
  assert.equal(body.statusCode, 403);
  assert.match(body.message, /switched off for this school/);
  assert.equal(asks.length, 0);
});

test("a question with nothing waiting asks for nothing", async (t) => {
  const { body, asks } = await drafted(t, { body: { slideId: mcqSlideId } });
  assert.deepEqual(body.data, { slideId: mcqSlideId, maxMarks: 2, pending: 0, drafts: [], unavailable: false, reason: "" });
  assert.equal(asks.length, 0);
});

test("an answer the teacher has already marked keeps their mark instead of a new suggestion", async (t) => {
  const marked = { ...written(adaId, "He is afraid, so he lies."), isCorrect: false, score: 0.5, grade: { status: "graded", marks: 1, maxMarks: 2, feedback: "Nearly.", released: false } };
  const { body } = await drafted(t, {
    body: { slideId: writtenSlideId },
    responses: [marked, written(graceId, "Because.")],
    suggestion: { drafts: [{ studentId: graceId, marks: 0.5, feedback: "One more sentence.", confidence: "low" }], unavailable: false, reason: "" },
  });

  assert.equal(body.data.pending, 1);
  assert.deepEqual(body.data.drafts.map((draft) => draft.studentId), [graceId]);
});

test("a levelled question is drafted against the words each group was given", async (t) => {
  const levelled = session({
    slides: [{
      _id: writtenSlideId,
      question: { kind: "text", prompt: "Why does the character lie?" },
      variants: [{
        groupId: supportGroupId,
        question: { kind: "text", prompt: "Is the character telling the truth? Why?", guidance: "Yes or no, then one reason." },
      }],
    }],
  });
  const { body, asks } = await drafted(t, {
    body: { slideId: writtenSlideId },
    session: levelled,
    groups: [{ _id: supportGroupId, name: "Support", studentIds: [adaId] }],
    suggestion: { drafts: [{ studentId: adaId, marks: 1, feedback: "Start with yes or no.", confidence: "medium" }], unavailable: false, reason: "" },
  });

  assert.equal(asks.length, 1);
  const ada = asks[0].entries.find((entry) => entry.studentId === adaId);
  assert.equal(ada.level, "Support");
  assert.equal(ada.prompt, "Is the character telling the truth? Why?");
  assert.equal(ada.guidance, "Yes or no, then one reason.");
  // the suggestion keeps the group's own allocation the teacher set on screen
  assert.equal(body.data.maxMarks, 2);
});

test("the allocation on screen is the scale a suggestion is written against", async (t) => {
  const { body, asks } = await drafted(t, {
    body: { slideId: writtenSlideId, maxMarks: 4 },
    session: session({ questionMarks: [{ slideId: writtenSlideId, maxMarks: 2 }] }),
  });
  assert.equal(asks[0].maxMarks, 4);
  assert.equal(body.data.maxMarks, 4);

  const nonsense = await drafted(t, { body: { slideId: writtenSlideId, maxMarks: 400 } });
  assert.equal(nonsense.body.statusCode, 400);
  assert.match(nonsense.body.message, /between 0.25 and 100/);
});

test("a class too big to draft at once is told, instead of a silent half-answer", async (t) => {
  const crowd = Array.from({ length: MAX_DRAFT_ANSWERS + 1 }, (_, index) => written(`507f1f77bcf86cd799439${String(100 + index)}`, "A short answer."));
  const { body, asks } = await drafted(t, { body: { slideId: writtenSlideId }, responses: crowd });
  assert.equal(body.statusCode, 400);
  assert.match(body.message, /Mark the rest yourself/);
  assert.equal(asks.length, 0);
});

test("a question from another session is refused before anything is asked", async (t) => {
  const { body, asks } = await drafted(t, { body: { slideId: "slide-notes" } });
  assert.equal(body.statusCode, 400);
  assert.equal(asks.length, 0);
});
