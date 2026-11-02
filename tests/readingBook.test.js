import assert from "node:assert/strict";
import test from "node:test";

import ReadingAssignment from "../models/ReadingAssignment.js";
import ReadingCompletion from "../models/ReadingCompletion.js";
import ReadingModelAudio from "../models/ReadingModelAudio.js";
import ReadingFluencyProgress from "../models/ReadingFluencyProgress.js";
import ReadingProgressState from "../models/ReadingProgressState.js";
import SimplifiedText from "../models/SimplifiedText.js";
import Student from "../models/Student.js";
import {
  createAssignment,
  evaluateCriticalThinkingAnswer,
  finishReading,
  getBookForStudent,
  startReading,
  updateAssignmentPublish,
  updateProgress
} from "../services/readingAssistantService.js";
import { getStudentAssignmentView } from "../services/readingFluency/readingFluencyService.js";
import { getModelAudio } from "../services/readingFluency/modelAudioService.js";
import {
  isAssignmentLocked,
  resolveOpenStudentAssignment,
  sanitizePublishPatch,
  sanitizePublishSettings
} from "../services/readingGate/publish.js";

const schoolId = "507f1f77bcf86cd799439012";
const studentId = "507f1f77bcf86cd799439013";

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

const assignment = (overrides = {}) => ({
  _id: "507f1f77bcf86cd799439014",
  school: schoolId,
  students: [studentId],
  isActive: true,
  isPublished: true,
  publishAt: null,
  readingGate: { enabled: false },
  ...overrides
});

test("publishing defaults to on and old rows without the fields stay open", () => {
  assert.equal(ReadingAssignment.schema.path("isPublished").defaultValue, true);
  assert.equal(ReadingAssignment.schema.path("publishAt").defaultValue, null);
  assert.equal(isAssignmentLocked({}), false);
  assert.equal(isAssignmentLocked({ isPublished: true, publishAt: null }), false);
  assert.equal(isAssignmentLocked({ isPublished: false }), true);
  assert.equal(isAssignmentLocked({ isPublished: true, publishAt: new Date(Date.now() + 60_000) }), true);
  assert.equal(isAssignmentLocked({ isPublished: true, publishAt: new Date(Date.now() - 60_000) }), false);
});

test("publish settings default, validate, and clear their date", () => {
  assert.deepEqual(sanitizePublishSettings({}), { isPublished: true, publishAt: null });
  assert.deepEqual(sanitizePublishSettings({ isPublished: false }), { isPublished: false, publishAt: null });
  const date = sanitizePublishSettings({ publishAt: "2026-11-10T08:00:00.000Z" });
  assert.equal(date.publishAt.toISOString(), "2026-11-10T08:00:00.000Z");
  assert.throws(() => sanitizePublishSettings({ isPublished: "yes" }), /on or off/);
  assert.throws(() => sanitizePublishSettings({ publishAt: "soon" }), /valid publish date/);

  assert.deepEqual(sanitizePublishPatch({ isPublished: false }), { isPublished: false });
  assert.deepEqual(sanitizePublishPatch({ publishAt: null }), { publishAt: null });
  assert.throws(() => sanitizePublishPatch({}), /Choose whether to publish/);
});

test("the book hides every locked chapter behind a stub", async (t) => {
  const locked = assignment({
    _id: "a-locked",
    text: { _id: "t-locked", title: "Secret title", subjectArea: "Science" },
    instructions: "Secret instructions",
    isPublished: false,
    createdAt: new Date("2026-09-01")
  });
  const scheduled = assignment({
    _id: "a-scheduled",
    text: { _id: "t-scheduled", title: "Future title" },
    isPublished: true,
    publishAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date("2026-09-02")
  });
  const open = assignment({
    _id: "a-open",
    text: { _id: "t-open", title: "Open title", subjectArea: "History", topicTags: ["past"], language: "en" },
    readingGate: { enabled: true, minReadSeconds: 45, lockScope: "quiz" },
    instructions: "Read carefully",
    createdAt: new Date("2026-09-03")
  });

  t.mock.method(ReadingAssignment, "find", () => query([locked, scheduled, open]));
  t.mock.method(ReadingCompletion, "find", () => query([{
    assignment: "a-open",
    completedAt: new Date(),
    correctCount: 2,
    totalCount: 3
  }]));
  t.mock.method(ReadingProgressState, "find", () => query([{
    assignment: "a-open",
    readStartedAt: new Date("2026-09-04T08:00:00.000Z"),
    readFinishedAt: new Date("2026-09-04T08:10:00.000Z")
  }]));
  t.mock.method(ReadingFluencyProgress, "find", () => query([]));

  const chapters = await getBookForStudent(studentId, schoolId, "2026-2027");
  assert.equal(chapters.length, 3);
  assert.deepEqual(chapters.map((chapter) => chapter.chapterNumber), [1, 2, 3]);
  assert.deepEqual(chapters[0], {
    _id: "a-locked",
    chapterNumber: 1,
    locked: true,
    publishAt: null
  });
  assert.equal(chapters[1].locked, true);
  assert.ok(chapters[1].publishAt instanceof Date);
  assert.equal("text" in chapters[1], false);
  assert.match(JSON.stringify(chapters.slice(0, 2)), /^(?!.*Secret)(?!.*Future title)/s);

  const openChapter = chapters[2];
  assert.equal(openChapter.locked, false);
  assert.equal(openChapter.text.title, "Open title");
  assert.deepEqual(openChapter.score, { correctCount: 2, totalCount: 3 });
  assert.equal(openChapter.completed, true);
  assert.equal(openChapter.readingGate.unlocked, true);
  assert.equal(openChapter.readingGate.minReadSeconds, 45);
});

const lockedGateAssignment = (overrides = {}) => assignment({
  readingGate: { enabled: true, lockScope: "quiz_and_thinking", minReadSeconds: 10 },
  isPublished: false,
  ...overrides
});

test("locked readings are refused by the gate endpoints", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(lockedGateAssignment()));

  await assert.rejects(
    () => startReading(schoolId, studentId, "a1", "2026-2027"),
    (error) => error.statusCode === 403 && error.code === "READING_NOT_PUBLISHED"
  );
  await assert.rejects(
    () => finishReading(schoolId, studentId, "a1", "2026-2027"),
    (error) => error.statusCode === 403 && error.code === "READING_NOT_PUBLISHED"
  );
});

test("locked readings are refused when saving or evaluating answers", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(lockedGateAssignment()));
  t.mock.method(ReadingAssignment, "find", () => query([lockedGateAssignment()]));

  await assert.rejects(
    () => updateProgress(studentId, "t1", 1, 1, schoolId, "a1", "2026-2027", {}),
    (error) => error.statusCode === 403 && error.code === "READING_NOT_PUBLISHED"
  );
  await assert.rejects(
    () => evaluateCriticalThinkingAnswer(schoolId, {
      textId: "t1",
      question: "Why?",
      studentAnswer: "Because.",
      academicYear: "2026-2027",
      tracking: { studentId }
    }),
    (error) => error.statusCode === 403 && error.code === "READING_NOT_PUBLISHED"
  );
});

test("locked readings are refused by fluency and its model voice", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(
    lockedGateAssignment({ text: { _id: "t1", title: "Secret" } })
  ));
  t.mock.method(ReadingAssignment, "find", () => query([lockedGateAssignment()]));

  await assert.rejects(
    () => getStudentAssignmentView({
      schoolId,
      studentId,
      assignmentId: "a1",
      academicYear: "2026-2027"
    }),
    (error) => error.statusCode === 403 && error.code === "READING_NOT_PUBLISHED"
  );
  await assert.rejects(
    () => getModelAudio({
      schoolId,
      textId: "t1",
      blockKey: "p-0",
      studentId,
      academicYear: "2026-2027"
    }),
    (error) => error.statusCode === 403 && error.code === "READING_NOT_PUBLISHED"
  );
});

test("feedback needs an assignment and a question from that reading", async (t) => {
  t.mock.method(ReadingAssignment, "find", () => query([assignment()]));
  t.mock.method(SimplifiedText, "findOne", () => query({
    originalText: "A passage.",
    criticalThinkingQuestions: [{ question: "Why did it happen?" }]
  }));

  await assert.rejects(
    () => evaluateCriticalThinkingAnswer(schoolId, {
      textId: "t1",
      question: "Why did it happen?",
      studentAnswer: "Because.",
      tracking: { userId: "u1", studentId: null }
    }),
    (error) => error.statusCode === 404 && error.code === "READING_ASSIGNMENT_NOT_FOUND"
  );

  await assert.rejects(
    () => evaluateCriticalThinkingAnswer(schoolId, {
      textId: "t1",
      question: "Something unrelated?",
      studentAnswer: "Because.",
      tracking: { studentId }
    }),
    (error) => error.statusCode === 400 && error.code === "READING_QUESTION_NOT_FOUND"
  );
});

test("feedback is refused when the student has no assignment for the text", async (t) => {
  t.mock.method(ReadingAssignment, "find", () => query([]));

  await assert.rejects(
    () => evaluateCriticalThinkingAnswer(schoolId, {
      textId: "t1",
      question: "Why?",
      studentAnswer: "Because.",
      tracking: { studentId }
    }),
    (error) => error.statusCode === 404 && error.code === "READING_ASSIGNMENT_NOT_FOUND"
  );
});

test("feedback is gated until the student finishes reading", async (t) => {
  t.mock.method(ReadingAssignment, "find", () => query([
    assignment({
      readingGate: { enabled: true, lockScope: "quiz_and_thinking", minReadSeconds: 0 }
    })
  ]));
  t.mock.method(SimplifiedText, "findOne", () => query({
    originalText: "A passage.",
    criticalThinkingQuestions: [{ question: "Why did it happen?" }]
  }));
  t.mock.method(ReadingProgressState, "findOne", () => query({ readFinishedAt: null }));
  t.mock.method(ReadingCompletion, "exists", async () => null);

  await assert.rejects(
    () => evaluateCriticalThinkingAnswer(schoolId, {
      textId: "t1",
      question: "Why did it happen?",
      studentAnswer: "Because.",
      tracking: { studentId }
    }),
    (error) => error.statusCode === 403 && error.code === "READING_GATE_LOCKED"
  );
});

test("the assignment lookup only sees active rows of that text", async (t) => {
  let filter = null;
  t.mock.method(ReadingAssignment, "find", (value) => {
    filter = value;
    return query([assignment()]);
  });

  await resolveOpenStudentAssignment({
    schoolId,
    studentId,
    textId: "t1",
    assignmentId: "a1",
    academicYear: "2026-2027"
  });

  assert.deepEqual(filter, {
    school: schoolId,
    students: studentId,
    isActive: true,
    academicYear: "2026-2027",
    text: "t1",
    _id: "a1"
  });
});

test("model audio accepts any open assignment of the same text", async (t) => {
  const locked = lockedGateAssignment({ _id: "a-locked", text: "t1" });
  const open = assignment({ _id: "a-open", text: "t1" });
  t.mock.method(ReadingAssignment, "find", () => query([locked, open]));
  t.mock.method(ReadingModelAudio, "findOne", () => query(null));

  await assert.rejects(
    () => getModelAudio({ schoolId, textId: "t1", blockKey: "p-0", studentId }),
    (error) => error.code === "MODEL_AUDIO_NOT_FOUND"
  );

  t.mock.method(ReadingAssignment, "find", () => query([locked]));
  await assert.rejects(
    () => getModelAudio({ schoolId, textId: "t1", blockKey: "p-0", studentId }),
    (error) => error.statusCode === 403 && error.code === "READING_NOT_PUBLISHED"
  );

  t.mock.method(ReadingAssignment, "find", () => query([]));
  await assert.rejects(
    () => getModelAudio({ schoolId, textId: "t1", blockKey: "p-0", studentId }),
    (error) => error.statusCode === 404 && error.code === "MODEL_AUDIO_TEXT_NOT_FOUND"
  );
});

test("only the assigning teacher or an admin can publish", async (t) => {
  const owner = "507f1f77bcf86cd799439015";
  const other = "507f1f77bcf86cd799439016";
  let saved = false;
  const doc = {
    ...assignment(),
    assignedBy: owner,
    isPublished: true,
    publishAt: null,
    save: async () => { saved = true; }
  };
  t.mock.method(ReadingAssignment, "findOne", () => query(doc));

  await assert.rejects(
    () => updateAssignmentPublish(schoolId, "a1", other, false, { isPublished: false }),
    (error) => error.statusCode === 403
  );

  const result = await updateAssignmentPublish(schoolId, "a1", owner, false, {
    isPublished: false,
    publishAt: "2026-12-01T08:00:00.000Z"
  });
  assert.equal(saved, true);
  assert.equal(result.isPublished, false);
  assert.equal(result.publishAt.toISOString(), "2026-12-01T08:00:00.000Z");

  saved = false;
  await updateAssignmentPublish(schoolId, "a1", other, true, { isPublished: true });
  assert.equal(saved, true);
});

test("createAssignment stores publishing choices and rejects bad dates", async (t) => {
  t.mock.method(SimplifiedText, "findOne", () => query({
    _id: "t1",
    language: "en",
    comprehensionQuestions: [],
    criticalThinkingQuestions: []
  }));
  t.mock.method(Student, "find", () => query([{ _id: studentId }]));
  let created = null;
  t.mock.method(ReadingAssignment, "create", async (payload) => {
    created = payload;
    return { _id: "a1", populate: async () => ({ _id: "a1" }) };
  });

  await createAssignment(
    schoolId,
    {
      textId: "t1",
      studentIds: [studentId],
      isPublished: false,
      publishAt: "2026-12-01T08:00:00.000Z"
    },
    "teacher-1",
    "2026-2027",
    null,
    true
  );
  assert.equal(created.isPublished, false);
  assert.equal(created.publishAt.toISOString(), "2026-12-01T08:00:00.000Z");

  await assert.rejects(
    () => createAssignment(
      schoolId,
      { textId: "t1", studentIds: [studentId], publishAt: "not-a-date" },
      "teacher-1",
      "2026-2027",
      null,
      true
    ),
    /valid publish date/
  );
});
