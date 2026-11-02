import assert from "node:assert/strict";
import test from "node:test";

import ReadingAssignment from "../models/ReadingAssignment.js";
import ReadingCompletion from "../models/ReadingCompletion.js";
import ReadingProgressState from "../models/ReadingProgressState.js";
import SimplifiedText from "../models/SimplifiedText.js";
import StudentReadingProfile from "../models/StudentReadingProfile.js";
import {
  HEARTBEAT_CAP_SECONDS,
  assertReadingUnlocked,
  finishReading,
  recordReadingHeartbeat,
  startReading,
  updateProgress
} from "../services/readingAssistantService.js";
import {
  DEFAULT_READING_GATE,
  autoMinReadSeconds,
  gateLocksQuestions,
  mergeReadingGate,
  requiredReadSeconds,
  sanitizeReadingGate,
  wordCountForLevel
} from "../services/readingGate/settings.js";
import { stripLockedQuestions } from "../services/readingGate/response.js";
import {
  autoMinReadSeconds as clientAutoMinReadSeconds,
  requiredReadSeconds as clientRequiredReadSeconds
} from "../client/src/pages/student/reading/ReadingViewPage/readingGate.js";

const schoolId = "507f1f77bcf86cd799439012";
const studentId = "507f1f77bcf86cd799439013";
const assignmentId = "507f1f77bcf86cd799439014";
const textId = "507f1f77bcf86cd799439017";

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

const gateAssignment = (gate = {}) => ({
  _id: assignmentId,
  text: textId,
  readingGate: { enabled: true, lockScope: "quiz_and_thinking", minReadSeconds: 10, ...gate }
});

const mockProfile = (t, level = 8) => {
  t.mock.method(StudentReadingProfile, "findOne", () => query({ currentReadingLevel: level }));
};

test("gate settings default to off with automatic time", () => {
  assert.deepEqual(sanitizeReadingGate({}), { ...DEFAULT_READING_GATE });
  assert.equal(sanitizeReadingGate({}).enabled, false);
  assert.equal(sanitizeReadingGate({}).minReadSeconds, null);
});

test("unknown lock scopes are rejected and times are clamped or null", () => {
  assert.throws(
    () => sanitizeReadingGate({ lockScope: "everything" }),
    (error) => error.code === "READING_GATE_INVALID" && /lock scope/.test(error.message)
  );
  assert.throws(
    () => sanitizeReadingGate({ minReadSeconds: "soon" }),
    /must be a number of seconds/
  );
  assert.equal(sanitizeReadingGate({ minReadSeconds: -5 }).minReadSeconds, 0);
  assert.equal(sanitizeReadingGate({ minReadSeconds: 5000 }).minReadSeconds, 1800);
  assert.equal(sanitizeReadingGate({ minReadSeconds: "" }).minReadSeconds, null);
  assert.equal(sanitizeReadingGate({ minReadSeconds: 12.6 }).minReadSeconds, 13);
});

test("old assignments without the block read as off instead of throwing", () => {
  assert.deepEqual(mergeReadingGate(undefined), { ...DEFAULT_READING_GATE });
  assert.equal(mergeReadingGate({ enabled: true, lockScope: "bogus" }).enabled, false);
});

test("automatic reading time is half a minute per 200 words, clamped 15-300s", () => {
  assert.equal(autoMinReadSeconds(0), 15);
  assert.equal(autoMinReadSeconds(199), 30);
  assert.equal(autoMinReadSeconds(200), 30);
  assert.equal(autoMinReadSeconds(201), 31);
  assert.equal(autoMinReadSeconds(4000), 300);
  assert.equal(requiredReadSeconds({ minReadSeconds: 45 }, 4000), 45);
  assert.equal(requiredReadSeconds({ minReadSeconds: null }, 200), 30);
});

test("server and client agree on the reading-time formula", () => {
  for (const words of [0, 1, 199, 200, 201, 999, 1000, 2000, 4000, 10000]) {
    assert.equal(clientAutoMinReadSeconds(words), autoMinReadSeconds(words));
  }
  const gates = [
    { minReadSeconds: null },
    { minReadSeconds: 0 },
    { minReadSeconds: 45 },
    { minReadSeconds: 9999 }
  ];
  for (const gate of gates) {
    for (const words of [0, 200, 4000]) {
      assert.equal(clientRequiredReadSeconds(gate, words), requiredReadSeconds(gate, words));
    }
  }
});

test("a gate with no questions in its scope has nothing to lock", () => {
  assert.equal(gateLocksQuestions({ enabled: true, lockScope: "quiz" }, 0, 2), false);
  assert.equal(gateLocksQuestions({ enabled: true, lockScope: "quiz" }, 1, 0), true);
  assert.equal(gateLocksQuestions({ enabled: true, lockScope: "quiz_and_thinking" }, 0, 2), true);
  assert.equal(gateLocksQuestions({ enabled: true, lockScope: "quiz_and_thinking" }, 0, 0), false);
  assert.equal(gateLocksQuestions({ enabled: false, lockScope: "quiz" }, 3, 3), false);
});

test("the time follows the version the student is viewing", () => {
  const text = {
    originalText: "one two three",
    simplifiedVersions: [
      { targetLevel: 5, simplifiedText: "a b c d e f" },
      { targetLevel: 9, simplifiedText: "a b c d e f g h" }
    ]
  };
  assert.equal(wordCountForLevel(text, 5), 6);
  assert.equal(wordCountForLevel(text, 9), 8);
  assert.equal(wordCountForLevel(text, null), 3);
  assert.equal(wordCountForLevel({ originalText: "a b" }, 5), 2);
});

const lockedResult = (readingGate) => ({
  readingGate,
  text: {
    comprehensionQuestions: [{ _id: "q1" }],
    criticalThinkingQuestions: [{ _id: "t1" }]
  },
  comprehensionQuestions: [{ _id: "q1" }],
  criticalThinkingQuestions: [{ _id: "t1" }]
});

test("a locked quiz and thinking result keeps counts but loses the questions", () => {
  const result = stripLockedQuestions(lockedResult({
    enabled: true,
    unlocked: false,
    lockScope: "quiz_and_thinking"
  }));
  assert.deepEqual(result.questionCounts, { comprehension: 1, criticalThinking: 1 });
  assert.deepEqual(result.comprehensionQuestions, []);
  assert.deepEqual(result.criticalThinkingQuestions, []);
  assert.deepEqual(result.text.comprehensionQuestions, []);
  assert.deepEqual(result.text.criticalThinkingQuestions, []);
});

test("quiz-only locking leaves the thinking questions in the payload", () => {
  const result = stripLockedQuestions(lockedResult({
    enabled: true,
    unlocked: false,
    lockScope: "quiz"
  }));
  assert.deepEqual(result.comprehensionQuestions, []);
  assert.equal(result.criticalThinkingQuestions.length, 1);
  assert.equal(result.text.comprehensionQuestions.length, 0);
  assert.equal(result.text.criticalThinkingQuestions.length, 1);
});

test("disabled and unlocked gates do not change the questions", () => {
  const disabled = stripLockedQuestions(lockedResult({ enabled: false, unlocked: false }));
  assert.equal(disabled.comprehensionQuestions.length, 1);
  assert.equal(disabled.criticalThinkingQuestions.length, 1);

  const unlocked = stripLockedQuestions(lockedResult({
    enabled: true,
    unlocked: true,
    lockScope: "quiz_and_thinking"
  }));
  assert.equal(unlocked.comprehensionQuestions.length, 1);
  assert.equal(unlocked.criticalThinkingQuestions.length, 1);
});

test("read-start records one start per student and assignment", async (t) => {
  const startedAt = new Date("2026-11-02T08:00:00.000Z");
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({ originalText: "short passage" }));
  mockProfile(t, 5);
  let startedPatch = null;
  t.mock.method(ReadingProgressState, "findOneAndUpdate", (filter, update) => {
    startedPatch = update;
    return query({
      readStartedAt: startedAt,
      readFinishedAt: null,
      readSeconds: 0
    });
  });

  const state = await startReading(schoolId, studentId, assignmentId, "2026-2027");
  assert.equal(state.readStartedAt, startedAt);
  assert.equal(state.readSeconds, 0);
  assert.equal(state.requiredSeconds, 10);
  assert.equal(state.unlocked, false);
  assert.equal(state.enabled, true);
  assert.ok(startedPatch.$setOnInsert.lastBeatAt instanceof Date);
});

test("read-finish rejects an early finish and reports the remaining time", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({ originalText: "short passage" }));
  mockProfile(t, 5);
  t.mock.method(ReadingProgressState, "findOne", () => query({
    readStartedAt: new Date(Date.now() - 1000),
    readFinishedAt: null
  }));
  t.mock.method(ReadingCompletion, "exists", async () => null);
  t.mock.method(ReadingProgressState, "findOneAndUpdate", () => query({}));

  await assert.rejects(
    () => finishReading(schoolId, studentId, assignmentId, "2026-2027"),
    (error) => error.statusCode === 409
      && error.code === "READING_GATE_NOT_FINISHED"
      && error.data.remainingSeconds > 0
      && error.data.requiredSeconds === 10
  );
});

test("read-finish unlocks after enough time has passed", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({ originalText: "short passage" }));
  mockProfile(t, 5);
  t.mock.method(ReadingProgressState, "findOne", () => query({
    readStartedAt: new Date(Date.now() - 60_000),
    readFinishedAt: null
  }));
  t.mock.method(ReadingCompletion, "exists", async () => null);
  let finishedAt = null;
  t.mock.method(ReadingProgressState, "findOneAndUpdate", () => {
    finishedAt = new Date();
    return query({ readStartedAt: new Date(Date.now() - 60_000), readFinishedAt: finishedAt });
  });

  const state = await finishReading(schoolId, studentId, assignmentId, "2026-2027");
  assert.equal(state.unlocked, true);
  assert.ok(finishedAt);
  assert.equal(state.requiredSeconds, 10);
});

test("read-finish allows the last few seconds the client counted", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({ originalText: "short passage" }));
  mockProfile(t, 5);
  t.mock.method(ReadingCompletion, "exists", async () => null);
  let credited = 4;
  t.mock.method(ReadingProgressState, "findOne", () => query({
    readStartedAt: new Date(Date.now() - 60_000),
    readFinishedAt: null,
    readSeconds: credited
  }));
  t.mock.method(ReadingProgressState, "findOneAndUpdate", () => query({ readFinishedAt: new Date() }));

  await assert.rejects(
    () => finishReading(schoolId, studentId, assignmentId, "2026-2027"),
    (error) => error.code === "READING_GATE_NOT_FINISHED"
      && error.data.remainingSeconds === 6
  );

  credited = 5;
  const state = await finishReading(schoolId, studentId, assignmentId, "2026-2027");
  assert.equal(state.unlocked, true);
});

test("read-finish ignores the level the client sends", async (t) => {
  const short = Array.from({ length: 400 }, (_, index) => `s${index}`).join(" ");
  const long = Array.from({ length: 1000 }, (_, index) => `l${index}`).join(" ");
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment({ minReadSeconds: null })));
  t.mock.method(SimplifiedText, "findOne", () => query({
    originalText: short,
    simplifiedVersions: [
      { targetLevel: 5, simplifiedText: short },
      { targetLevel: 9, simplifiedText: long }
    ]
  }));
  mockProfile(t, 8);
  t.mock.method(ReadingCompletion, "exists", async () => null);
  t.mock.method(ReadingProgressState, "findOne", () => query({
    readStartedAt: new Date(Date.now() - 200_000),
    readFinishedAt: null,
    readSeconds: 150
  }));
  t.mock.method(ReadingProgressState, "findOneAndUpdate", () => query({ readFinishedAt: new Date() }));

  const state = await finishReading(schoolId, studentId, assignmentId, "2026-2027", { level: 5 });
  assert.equal(state.requiredSeconds, 150);
  assert.equal(state.wordCount, 1000);
  assert.equal(state.unlocked, true);
});

test("a heartbeat credits the visible gap and caps runaway ones", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({ originalText: "short passage" }));
  mockProfile(t, 5);
  let lastBeatAt = new Date(Date.now() - 10_000);
  t.mock.method(ReadingProgressState, "findOne", () => query({
    readStartedAt: new Date(Date.now() - 120_000),
    readFinishedAt: null,
    readSeconds: 12,
    lastBeatAt
  }));
  let patch = null;
  let match = null;
  t.mock.method(ReadingProgressState, "findOneAndUpdate", (filter, update) => {
    match = filter;
    patch = update;
    return query({ readSeconds: 22 });
  });

  const data = await recordReadingHeartbeat(schoolId, studentId, assignmentId, "2026-2027");
  assert.equal(patch.$inc.readSeconds, 10);
  assert.equal(match.lastBeatAt.getTime(), lastBeatAt.getTime());
  assert.equal(data.readSeconds, 22);
  assert.equal(data.requiredSeconds, 10);
  assert.equal(data.unlocked, false);

  lastBeatAt = new Date(Date.now() - 3_600_000);
  const capped = await recordReadingHeartbeat(schoolId, studentId, assignmentId, "2026-2027");
  assert.equal(patch.$inc.readSeconds, HEARTBEAT_CAP_SECONDS);
  assert.equal(capped.readSeconds, 22);
});

test("a heartbeat with no previous beat credits nothing", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({ originalText: "short passage" }));
  mockProfile(t, 5);
  t.mock.method(ReadingProgressState, "findOne", () => query({
    readStartedAt: new Date(Date.now() - 10_500),
    readFinishedAt: null,
    readSeconds: 0,
    lastBeatAt: null
  }));
  let patch = null;
  t.mock.method(ReadingProgressState, "findOneAndUpdate", (filter, update) => {
    patch = update;
    return query({ readSeconds: 0 });
  });

  const data = await recordReadingHeartbeat(schoolId, studentId, assignmentId, "2026-2027");
  assert.equal(patch.$inc.readSeconds, 0);
  assert.equal(data.readSeconds, 0);
});

test("a heartbeat closer than the minimum gap credits nothing", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({ originalText: "short passage" }));
  mockProfile(t, 5);
  t.mock.method(ReadingProgressState, "findOne", () => query({
    readStartedAt: new Date(Date.now() - 120_000),
    readFinishedAt: null,
    readSeconds: 12,
    lastBeatAt: new Date(Date.now() - 1000)
  }));
  let patch = null;
  t.mock.method(ReadingProgressState, "findOneAndUpdate", (filter, update) => {
    patch = update;
    return query({ readSeconds: 12 });
  });

  const data = await recordReadingHeartbeat(schoolId, studentId, assignmentId, "2026-2027");
  assert.equal(patch.$inc.readSeconds, 0);
  assert.equal(data.readSeconds, 12);
});

test("the first heartbeat keeps wall-clock time on a pre-heartbeat document", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({ originalText: "short passage" }));
  mockProfile(t, 5);
  t.mock.method(ReadingProgressState, "findOne", () => query({
    readStartedAt: new Date(Date.now() - 100_000),
    readFinishedAt: null
  }));
  let patch = null;
  t.mock.method(ReadingProgressState, "findOneAndUpdate", (filter, update) => {
    patch = update;
    return query({ readSeconds: update.$set.readSeconds });
  });

  const data = await recordReadingHeartbeat(schoolId, studentId, assignmentId, "2026-2027");
  assert.equal(patch.$inc, undefined);
  assert.ok(patch.$set.readSeconds >= 99);
  assert.ok(data.readSeconds >= 99);
});

test("a heartbeat changes nothing on a disabled gate", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment({ enabled: false })));

  const data = await recordReadingHeartbeat(schoolId, studentId, assignmentId, "2026-2027");
  assert.deepEqual(data, { readSeconds: 0, unlocked: true });
});

test("a heartbeat on a locked reading is refused", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query({
    ...gateAssignment(),
    isPublished: false
  }));

  await assert.rejects(
    () => recordReadingHeartbeat(schoolId, studentId, assignmentId, "2026-2027"),
    (error) => error.statusCode === 403 && error.code === "READING_NOT_PUBLISHED"
  );
});

test("an existing completion unlocks the reading even without time", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({ originalText: "short passage" }));
  mockProfile(t, 5);
  t.mock.method(ReadingProgressState, "findOne", () => query({
    readStartedAt: new Date(),
    readFinishedAt: null
  }));
  t.mock.method(ReadingCompletion, "exists", async () => ({ _id: "completion-1" }));

  const state = await finishReading(schoolId, studentId, assignmentId, "2026-2027");
  assert.equal(state.unlocked, true);
});

test("the gate blocks the quiz until the reading is finished", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({
    comprehensionQuestions: [{ _id: "q1" }],
    criticalThinkingQuestions: []
  }));
  t.mock.method(ReadingProgressState, "findOne", () => query({ readFinishedAt: null }));
  t.mock.method(ReadingCompletion, "exists", async () => null);

  await assert.rejects(
    () => updateProgress(studentId, textId, 1, 1, schoolId, assignmentId, "2026-2027"),
    (error) => error.statusCode === 403 && error.code === "READING_GATE_LOCKED"
  );
});

test("the quiz saves once the reading is finished", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(gateAssignment()));
  t.mock.method(SimplifiedText, "findOne", () => query({
    comprehensionQuestions: [{ _id: "q1" }],
    criticalThinkingQuestions: []
  }));
  t.mock.method(ReadingProgressState, "findOne", () => query({ readFinishedAt: new Date() }));
  t.mock.method(ReadingCompletion, "exists", async () => null);
  t.mock.method(StudentReadingProfile, "findOneAndUpdate", async () => ({
    currentReadingLevel: 5,
    comprehensionAccuracy: 100
  }));
  t.mock.method(ReadingCompletion, "findOneAndUpdate", async () => ({}));

  const profile = await updateProgress(
    studentId,
    textId,
    1,
    1,
    schoolId,
    assignmentId,
    "2026-2027",
    { q1: "0" }
  );
  assert.equal(profile.currentReadingLevel, 5);
});

test("quiz-and-thinking scope blocks both, quiz scope blocks only the quiz", async (t) => {
  t.mock.method(ReadingProgressState, "findOne", () => query({ readFinishedAt: null }));
  t.mock.method(ReadingCompletion, "exists", async () => null);

  await assert.rejects(
    () => assertReadingUnlocked(schoolId, studentId, gateAssignment(), "quiz"),
    (error) => error.code === "READING_GATE_LOCKED"
  );
  await assert.rejects(
    () => assertReadingUnlocked(schoolId, studentId, gateAssignment(), "thinking"),
    (error) => error.code === "READING_GATE_LOCKED"
  );

  const quizOnly = gateAssignment({ lockScope: "quiz" });
  await assert.rejects(
    () => assertReadingUnlocked(schoolId, studentId, quizOnly, "quiz"),
    (error) => error.code === "READING_GATE_LOCKED"
  );
  await assert.doesNotReject(
    () => assertReadingUnlocked(schoolId, studentId, quizOnly, "thinking")
  );
});
