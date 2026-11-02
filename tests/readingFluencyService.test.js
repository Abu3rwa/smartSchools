import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { URL } from "node:url";

import ReadingAssignment from "../models/ReadingAssignment.js";
import ReadingFluencyAttempt from "../models/ReadingFluencyAttempt.js";
import ReadingFluencyProgress from "../models/ReadingFluencyProgress.js";
import SimplifiedText from "../models/SimplifiedText.js";
import StudentReadingProfile from "../models/StudentReadingProfile.js";
import {
  DAILY_ATTEMPT_LIMIT,
  FLUENCY_CONSENT_VERSION,
  LISTEN_DEDUPE_MS,
  findPartAudio,
  recordConsent,
  recordListen,
  scoreAttempt,
  truncateTranscript
} from "../services/readingFluency/readingFluencyService.js";
import { readingTextHash } from "../utils/readingBlocks.js";
import { PASSAGE, firstWords, timedWords } from "./fixtures/readingFluency.js";

const schoolId = "507f1f77bcf86cd799439012";
const studentId = "507f1f77bcf86cd799439013";
const otherStudentId = "507f1f77bcf86cd799439014";
const teacherId = "507f1f77bcf86cd799439015";
const assignmentId = "507f1f77bcf86cd799439016";
const textId = "507f1f77bcf86cd799439017";

/** A Mongoose-like query: chainable, awaitable, and lean-able. */
const query = (value) => {
  const chain = {
    populate: () => chain,
    select: () => chain,
    sort: () => chain,
    session: () => chain,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return chain;
};

const assignment = (overrides = {}) => ({
  _id: assignmentId,
  school: schoolId,
  students: [studentId],
  assignedBy: teacherId,
  isActive: true,
  academicYear: "2026-2027",
  instructions: "",
  text: { _id: textId, title: "Creating a Nation", language: "english" },
  fluency: {
    enabled: true,
    parts: [{ key: "p-0", level: null }],
    minReadings: 1,
    maxReadingsPerPart: 6,
    targetAccuracy: 95,
    targetWpm: null,
    showPace: true,
    requireListenFirst: false
  },
  ...overrides
});

const textDocument = () => {
  const doc = {
    _id: textId,
    school: schoolId,
    title: "Creating a Nation",
    language: "english",
    originalText: PASSAGE,
    originalComplexity: null,
    sections: [],
    simplifiedVersions: [],
    vocabularySubstitutions: [],
    criticalThinkingQuestions: [],
    comprehensionQuestions: []
  };
  doc.toObject = () => doc;
  return doc;
};

const progressRow = () => ({
  listens: 0,
  readings: 1,
  attempts: 1,
  first: { accuracy: 100, wpm: 120 },
  best: { accuracy: 100, wpm: 120 },
  latest: { accuracy: 100, wpm: 120, at: new Date() },
  goalMet: true,
  focusWords: []
});

const consentedProfile = () => ({
  micConsent: {
    acceptedAt: new Date("2026-10-01T10:00:00Z"),
    version: FLUENCY_CONSENT_VERSION
  }
});

const stubReading = (t, overrides = {}) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(overrides.assignment ?? assignment()));
  t.mock.method(SimplifiedText, "findOne", () => query(textDocument()));
  t.mock.method(
    StudentReadingProfile,
    "findOne",
    () => query(overrides.profile === undefined ? consentedProfile() : overrides.profile)
  );
};

const stubAttemptStore = (t, {
  existing = null,
  counts = [0, 0],
  progress = progressRow(),
  prior = null
} = {}) => {
  const created = [];
  const updates = [];
  t.mock.method(ReadingFluencyAttempt, "findOne", () => query(existing));
  let countIndex = 0;
  t.mock.method(ReadingFluencyAttempt, "countDocuments", () => {
    const value = counts[Math.min(countIndex, counts.length - 1)];
    countIndex += 1;
    return query(value);
  });
  t.mock.method(ReadingFluencyProgress, "findOne", () => query(prior));
  t.mock.method(ReadingFluencyProgress, "findOneAndUpdate", (filter, update) => {
    updates.push(update);
    return query(progress);
  });
  t.mock.method(ReadingFluencyAttempt, "create", async ([payload]) => {
    created.push(payload);
    return [{
      ...payload,
      _id: "attempt-1",
      createdAt: new Date(),
      toObject() { return { ...payload, _id: "attempt-1", createdAt: new Date() }; }
    }];
  });
  t.mock.method(ReadingFluencyAttempt, "updateOne", async () => ({ modifiedCount: 1 }));
  return { created, updates, countIndex: () => countIndex };
};

const perfectTranscript = () => ({
  text: PASSAGE,
  words: timedWords(PASSAGE, { wordSeconds: 0.3 }),
  segments: [],
  duration: 24,
  model: "whisper-1"
});

/** A full, accurate read at a chosen speed: slower words mean a lower pace. */
const transcriptAtPace = (wordSeconds) => {
  const words = timedWords(PASSAGE, { wordSeconds });
  return {
    text: PASSAGE,
    words,
    segments: [],
    duration: Math.round(words[words.length - 1].end),
    model: "whisper-1"
  };
};

const unheardTranscript = () => ({
  text: "Thank you for watching",
  words: [],
  segments: [],
  duration: 3,
  model: "whisper-1"
});

const fluency = (overrides = {}) => ({
  enabled: true,
  parts: [{ key: "p-0", level: null }],
  minReadings: 1,
  maxReadingsPerPart: 6,
  targetAccuracy: 95,
  targetWpm: null,
  showPace: true,
  requireListenFirst: false,
  ...overrides
});

const attemptArgs = (overrides = {}) => ({
  schoolId,
  studentId,
  assignmentId,
  blockKey: "p-0",
  level: 8,
  recordedSec: 24,
  idempotencyKey: "key-1",
  buffer: Buffer.from("fake audio bytes"),
  mimeType: "audio/webm",
  academicYear: "2026-2027",
  timeZone: "UTC",
  ...overrides
});

const silentCredit = () => {
  const charges = [];
  return {
    charges,
    credit: {
      assertHasCredit: async () => ({ balanceCents: 1000 }),
      chargeUsage: async (payload) => {
        charges.push(payload);
        return { charged: true, chargedCents: 1 };
      }
    }
  };
};

/** Score one recording against the given settings and prior progress row. */
const runAttempt = async (t, {
  settings = fluency(),
  transcript = perfectTranscript(),
  prior = null,
  recordedSec = 24
} = {}) => {
  stubReading(t, { assignment: assignment({ fluency: settings }) });
  const store = stubAttemptStore(t, { prior });
  const { credit, charges } = silentCredit();
  const result = await scoreAttempt(attemptArgs({ recordedSec }), {
    transcribe: async () => transcript,
    runTransaction: async (run) => run({ id: "session" }),
    credit
  });
  return { result, store, charges, written: store.updates[0].$set };
};

test("a perfect recording is scored, persisted and charged exactly once", async (t) => {
  stubReading(t);
  const store = stubAttemptStore(t);
  const { credit, charges } = silentCredit();
  let transcribed = 0;

  const result = await scoreAttempt(attemptArgs(), {
    transcribe: async () => {
      transcribed += 1;
      return perfectTranscript();
    },
    runTransaction: async (run) => run({ id: "session" }),
    credit
  });

  assert.equal(transcribed, 1);
  assert.equal(result.attempt.status, "scored");
  assert.equal(result.attempt.blockKey, "p-0");
  assert.equal(result.attempt.accuracy, 100);
  assert.equal(result.attempt.completion, 100);
  assert.equal(result.attempt.counted, true);
  assert.equal(result.attempt.attemptNumber, 1);
  assert.equal(result.feedback.tier, "strong");
  assert.equal(store.created.length, 1);
  assert.equal(charges.length, 1);
  assert.equal(charges[0].feature, "reading-fluency");
  assert.equal(String(charges[0].userId), teacherId);
  assert.equal(charges[0].audio.sttModel, "whisper-1");
});

test("the recording bytes are never part of the stored attempt", async (t) => {
  stubReading(t);
  const store = stubAttemptStore(t);
  const { credit } = silentCredit();

  await scoreAttempt(attemptArgs(), {
    transcribe: async () => perfectTranscript(),
    runTransaction: async (run) => run({ id: "session" }),
    credit
  });

  const [payload] = store.created;
  assert.equal("audio" in payload, false);
  assert.equal("buffer" in payload, false);
  assert.equal("recording" in payload, false);
  assert.equal(payload.transcript, PASSAGE);
  assert.equal(JSON.stringify(payload).includes("fake audio bytes"), false);
});

test("a student who is not on the assignment cannot record", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(null));
  t.mock.method(SimplifiedText, "findOne", () => query(textDocument()));
  t.mock.method(StudentReadingProfile, "findOne", () => query(null));
  stubAttemptStore(t);
  const { credit } = silentCredit();
  let transcribed = 0;

  await assert.rejects(
    scoreAttempt(attemptArgs({ studentId: otherStudentId }), {
      transcribe: async () => { transcribed += 1; return perfectTranscript(); },
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 404 && error.code === "FLUENCY_ASSIGNMENT_NOT_FOUND"
  );
  assert.equal(transcribed, 0);
});

test("an inactive assignment is rejected before any paid work", async (t) => {
  const findOne = t.mock.method(ReadingAssignment, "findOne", () => query(null));
  stubAttemptStore(t);
  const { credit } = silentCredit();

  await assert.rejects(
    scoreAttempt(attemptArgs(), {
      transcribe: async () => perfectTranscript(),
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.code === "FLUENCY_ASSIGNMENT_NOT_FOUND"
  );
  assert.equal(findOne.mock.calls[0].arguments[0].isActive, true);
});

test("a part that is not enabled cannot be read", async (t) => {
  stubReading(t);
  stubAttemptStore(t);
  const { credit } = silentCredit();

  await assert.rejects(
    scoreAttempt(attemptArgs({ blockKey: "p-9" }), {
      transcribe: async () => perfectTranscript(),
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 409 && error.code === "FLUENCY_PART_NOT_ENABLED"
  );
});

test("the per-part cap stops another attempt", async (t) => {
  stubReading(t);
  stubAttemptStore(t, { counts: [0, 6] });
  const { credit } = silentCredit();
  let transcribed = 0;

  await assert.rejects(
    scoreAttempt(attemptArgs(), {
      transcribe: async () => { transcribed += 1; return perfectTranscript(); },
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 409 && error.code === "FLUENCY_PART_CAP_REACHED"
  );
  assert.equal(transcribed, 0);
});

test("the daily recording safety cap stops the twenty-first attempt", async (t) => {
  stubReading(t);
  stubAttemptStore(t, { counts: [DAILY_ATTEMPT_LIMIT] });
  const { credit } = silentCredit();

  await assert.rejects(
    scoreAttempt(attemptArgs(), {
      transcribe: async () => perfectTranscript(),
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 429 && error.code === "FLUENCY_DAILY_CAP_REACHED"
  );
});

test("a school with no credit left cannot transcribe", async (t) => {
  stubReading(t);
  stubAttemptStore(t);
  let transcribed = 0;
  const credit = {
    assertHasCredit: async () => {
      throw Object.assign(new Error("no credit"), { statusCode: 402, code: "AI_CREDIT_REQUIRED" });
    },
    chargeUsage: async () => ({ charged: true, chargedCents: 0 })
  };

  await assert.rejects(
    scoreAttempt(attemptArgs(), {
      transcribe: async () => { transcribed += 1; return perfectTranscript(); },
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.code === "AI_CREDIT_REQUIRED"
  );
  assert.equal(transcribed, 0);
});

test("a retried idempotency key returns the first result and never charges again", async (t) => {
  stubReading(t);
  const existing = {
    _id: "attempt-1",
    student: studentId,
    assignment: assignmentId,
    blockKey: "p-0",
    attemptNumber: 1,
    status: "scored",
    counted: true,
    accuracy: 100,
    completion: 100,
    wpm: 120,
    wordsAttempted: 74,
    wordsCorrect: 74,
    longPauses: 0,
    issues: [],
    pauses: []
  };
  t.mock.method(ReadingFluencyAttempt, "findOne", () => query(existing));
  t.mock.method(ReadingFluencyProgress, "findOne", () => query(progressRow()));
  let transcribed = 0;
  const { credit, charges } = silentCredit();

  const result = await scoreAttempt(attemptArgs(), {
    transcribe: async () => { transcribed += 1; return perfectTranscript(); },
    runTransaction: async (run) => run({}),
    credit
  });

  assert.equal(transcribed, 0);
  assert.equal(charges.length, 0);
  assert.equal(result.attempt.id, "attempt-1");
  assert.equal(result.attempt.blockKey, "p-0");
  assert.equal(result.attempt.accuracy, 100);
});

test("a reused idempotency key for another student is a conflict", async (t) => {
  stubReading(t);
  t.mock.method(ReadingFluencyAttempt, "findOne", () => query({
    student: otherStudentId,
    assignment: assignmentId,
    blockKey: "p-0"
  }));
  const { credit } = silentCredit();

  await assert.rejects(
    scoreAttempt(attemptArgs(), {
      transcribe: async () => perfectTranscript(),
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 409 && error.code === "FLUENCY_IDEMPOTENCY_CONFLICT"
  );
});

test("a recording longer than four minutes is refused", async (t) => {
  stubReading(t);
  const { credit } = silentCredit();

  await assert.rejects(
    scoreAttempt(attemptArgs({ recordedSec: 300 }), {
      transcribe: async () => perfectTranscript(),
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 422 && error.code === "FLUENCY_RECORDING_TOO_LONG"
  );
});

test("a recording that runs to the auto-stop is accepted", async (t) => {
  const { result, store } = await runAttempt(t, { recordedSec: 240 });

  assert.equal(result.attempt.status, "scored");
  assert.equal(store.created[0].recordedSec, 240);
});

test("a recording that overshoots the auto-stop is accepted and stored at the cap", async (t) => {
  const { result, store } = await runAttempt(t, { recordedSec: 250 });

  assert.equal(result.attempt.status, "scored");
  assert.equal(store.created[0].recordedSec, 240);
});

test("billing without a measured duration falls back to the capped client length", async (t) => {
  const unmeasured = perfectTranscript();
  delete unmeasured.duration;
  const { charges } = await runAttempt(t, { transcript: unmeasured, recordedSec: 250 });

  assert.equal(charges[0].audio.transcriptSeconds, 240);
});

test("billing uses the duration Whisper measured, not the client's number", async (t) => {
  const { charges } = await runAttempt(t, { recordedSec: 250 });

  assert.equal(charges[0].audio.transcriptSeconds, 24);
});

test("no pace target leaves the goal on accuracy and readings", async (t) => {
  const { written } = await runAttempt(t, {
    settings: fluency({ targetWpm: null }),
    transcript: transcriptAtPace(0.3)
  });

  assert.equal(written.goalMet, true);
  assert.ok(written.bestWpm > 0);
});

test("a pace target of zero is the same as no target", async (t) => {
  const { written } = await runAttempt(t, {
    settings: fluency({ targetWpm: 0 }),
    transcript: transcriptAtPace(2)
  });

  assert.equal(written.goalMet, true);
});

test("an accurate read below the pace target does not meet the goal", async (t) => {
  const { written } = await runAttempt(t, {
    settings: fluency({ targetWpm: 400 }),
    transcript: transcriptAtPace(0.3)
  });

  assert.equal(written.best.accuracy, 100);
  assert.ok(written.bestWpm < 400);
  assert.equal(written.goalMet, false);
});

test("the pace goal keeps an earlier faster read that was less accurate", async (t) => {
  const { written } = await runAttempt(t, {
    settings: fluency({ minReadings: 2, targetWpm: 60 }),
    transcript: transcriptAtPace(2),
    prior: {
      readings: 1,
      attempts: 1,
      first: { accuracy: 96, wpm: 80 },
      best: { accuracy: 96, wpm: 80 },
      bestWpm: 80,
      latest: { accuracy: 96, wpm: 80, at: new Date() },
      goalMet: false,
      focusWords: []
    }
  });

  assert.equal(written.best.accuracy, 100);
  assert.ok(written.best.wpm < 60);
  assert.equal(written.bestWpm, 80);
  assert.equal(written.goalMet, true);
});

test("the pace goal still applies when pace is hidden from the student", async (t) => {
  const { result, written } = await runAttempt(t, {
    settings: fluency({ showPace: false, targetWpm: 400 }),
    transcript: transcriptAtPace(0.3)
  });

  assert.equal(result.attempt.wpm, null);
  assert.equal(written.goalMet, false);
});

test("a read that does not count never sets a best pace", async (t) => {
  const said = firstWords(PASSAGE, 20);
  const { written } = await runAttempt(t, {
    settings: fluency({ targetWpm: 60 }),
    transcript: {
      text: said,
      words: timedWords(said),
      segments: [],
      duration: 9,
      model: "whisper-1"
    }
  });

  assert.equal(written.bestWpm, null);
  assert.equal(written.goalMet, false);
});

test("a recording that is not heard never takes away a met goal", async (t) => {
  const { result, written } = await runAttempt(t, {
    settings: fluency({ targetWpm: 400 }),
    transcript: unheardTranscript(),
    prior: {
      readings: 2,
      attempts: 2,
      first: { accuracy: 96, wpm: 80 },
      best: { accuracy: 96, wpm: 80 },
      bestWpm: 420,
      latest: { accuracy: 96, wpm: 80, at: new Date() },
      goalMet: true,
      focusWords: []
    }
  });

  assert.equal(result.attempt.status, "not_heard");
  assert.equal(written.goalMet, true);
  assert.equal(written.bestWpm, 420);
});

test("model audio generated without a level still matches a levelled reader", () => {
  const text = "The colonists were angry.";
  const atNull = readingTextHash({ targetLevel: null, blockKey: "p-0", text });
  const atEight = readingTextHash({ targetLevel: 8, blockKey: "p-0", text });
  const row = { blockKey: "p-0", level: null, textHash: atNull };

  assert.equal(
    findPartAudio({
      audioRows: [row],
      partKey: "p-0",
      level: 8,
      textHash: atEight,
      text
    }),
    row
  );
});

test("an exact level and hash match wins when several versions exist", () => {
  const text = "The colonists were angry.";
  const rowNull = {
    blockKey: "p-0",
    level: null,
    textHash: readingTextHash({ targetLevel: null, blockKey: "p-0", text })
  };
  const rowEight = {
    blockKey: "p-0",
    level: 8,
    textHash: readingTextHash({ targetLevel: 8, blockKey: "p-0", text })
  };

  assert.equal(
    findPartAudio({
      audioRows: [rowNull, rowEight],
      partKey: "p-0",
      level: 8,
      textHash: rowEight.textHash,
      text
    }),
    rowEight
  );
});

test("model audio is not reused after the block text changes", () => {
  const text = "The colonists were angry.";
  const row = {
    blockKey: "p-0",
    level: null,
    textHash: readingTextHash({ targetLevel: null, blockKey: "p-0", text })
  };

  assert.equal(
    findPartAudio({
      audioRows: [row],
      partKey: "p-0",
      level: 8,
      textHash: readingTextHash({ targetLevel: 8, blockKey: "p-0", text: "A new text." }),
      text: "A new text."
    }),
    null
  );
});

test("the fluency service does not call the language model", async () => {
  const source = await import("node:fs/promises")
    .then((fs) => fs.readFile(
      new URL("../services/readingFluency/readingFluencyService.js", import.meta.url),
      "utf8"
    ));
  assert.equal(source.includes("connectAi"), false);
  assert.equal(source.includes("generateStructuredJson"), false);
});

test("two identical requests in flight share one transcription", async (t) => {
  stubReading(t);
  stubAttemptStore(t);
  const { credit } = silentCredit();
  let transcribed = 0;
  const deps = {
    transcribe: async () => {
      transcribed += 1;
      await sleep(10);
      return perfectTranscript();
    },
    runTransaction: async (run) => run({ id: "session" }),
    credit
  };

  const [one, two] = await Promise.all([
    scoreAttempt(attemptArgs(), deps),
    scoreAttempt(attemptArgs(), deps)
  ]);

  assert.equal(transcribed, 1);
  assert.equal(one.attempt.id, two.attempt.id);
  assert.equal(one.attempt.status, "scored");
});

test("an attempt-number duplicate is retried inside the same request", async (t) => {
  stubReading(t);
  stubAttemptStore(t);
  const { credit } = silentCredit();
  let calls = 0;
  const runTransaction = async (fn) => {
    calls += 1;
    if (calls === 1) {
      const error = new Error("duplicate attemptNumber");
      error.code = 11000;
      error.keyPattern = { attemptNumber: 1 };
      throw error;
    }
    return fn({ id: "session" });
  };

  const result = await scoreAttempt(attemptArgs(), {
    transcribe: async () => perfectTranscript(),
    runTransaction,
    credit
  });

  assert.equal(calls, 2);
  assert.equal(result.attempt.status, "scored");
});

test("an attempt-number conflict that never clears fails with 409", async (t) => {
  stubReading(t);
  stubAttemptStore(t);
  const { credit } = silentCredit();
  let transcribed = 0;
  let calls = 0;
  const runTransaction = async () => {
    calls += 1;
    const error = new Error("duplicate attemptNumber");
    error.code = 11000;
    error.keyPattern = { attemptNumber: 1 };
    throw error;
  };

  await assert.rejects(
    scoreAttempt(attemptArgs(), {
      transcribe: async () => { transcribed += 1; return perfectTranscript(); },
      runTransaction,
      credit
    }),
    (error) => error.statusCode === 409 && error.code === "FLUENCY_ATTEMPT_CONFLICT"
  );
  assert.equal(calls, 3);
  assert.equal(transcribed, 1);
});

test("a parallel second part over the cap is refused and the reservation is released", async (t) => {
  stubReading(t, { assignment: assignment({ fluency: fluency({ maxReadingsPerPart: 1 }) }) });
  stubAttemptStore(t, { counts: [0, 0] });
  const { credit } = silentCredit();
  let transcribed = 0;
  const deps = {
    transcribe: async () => {
      transcribed += 1;
      await sleep(20);
      return perfectTranscript();
    },
    runTransaction: async (run) => run({ id: "session" }),
    credit
  };

  const [one, two] = await Promise.allSettled([
    scoreAttempt(attemptArgs({ idempotencyKey: "key-a" }), deps),
    scoreAttempt(attemptArgs({ idempotencyKey: "key-b" }), deps)
  ]);
  const won = one.status === "fulfilled" ? one : two;
  const lost = one.status === "rejected" ? one : two;

  assert.equal(won.status, "fulfilled");
  assert.equal(won.value.attempt.status, "scored");
  assert.equal(lost.status, "rejected");
  assert.equal(lost.reason.code, "FLUENCY_PART_CAP_REACHED");
  assert.equal(transcribed, 1);

  const follow = await scoreAttempt(attemptArgs({ idempotencyKey: "key-c" }), {
    transcribe: async () => perfectTranscript(),
    runTransaction: async (run) => run({ id: "session" }),
    credit
  });
  assert.equal(follow.attempt.status, "scored");
});

test("a charge that throws still returns the scored attempt and flags it", async (t) => {
  stubReading(t);
  const store = stubAttemptStore(t);
  const updates = [];
  t.mock.method(ReadingFluencyAttempt, "updateOne", async (filter, update) => {
    updates.push(update);
    return { modifiedCount: 1 };
  });
  const credit = {
    assertHasCredit: async () => ({ balanceCents: 1000 }),
    chargeUsage: async () => { throw new Error("charge boom"); }
  };

  const result = await scoreAttempt(attemptArgs(), {
    transcribe: async () => perfectTranscript(),
    runTransaction: async (run) => run({ id: "session" }),
    credit
  });

  assert.equal(result.attempt.status, "scored");
  assert.equal(store.created.length, 1);
  assert.ok(updates.some((update) => update.$set?.chargeFailed === true));
});

test("a charge that reports an error is flagged the same as a thrown one", async (t) => {
  stubReading(t);
  stubAttemptStore(t);
  const updates = [];
  t.mock.method(ReadingFluencyAttempt, "updateOne", async (filter, update) => {
    updates.push(update);
    return { modifiedCount: 1 };
  });
  const credit = {
    assertHasCredit: async () => ({ balanceCents: 1000 }),
    chargeUsage: async () => ({ charged: false, error: true })
  };

  const result = await scoreAttempt(attemptArgs(), {
    transcribe: async () => perfectTranscript(),
    runTransaction: async (run) => run({ id: "session" }),
    credit
  });

  assert.equal(result.attempt.status, "scored");
  assert.ok(updates.some((update) => update.$set?.chargeFailed === true));
});

test("replaying an uncharged attempt charges once and clears the flag", async (t) => {
  const existing = {
    _id: "attempt-1",
    student: studentId,
    assignment: assignmentId,
    blockKey: "p-0",
    attemptNumber: 1,
    status: "scored",
    counted: true,
    accuracy: 100,
    completion: 100,
    wpm: 120,
    recordedSec: 24,
    sttModel: "whisper-1",
    chargeFailed: true,
    issues: [],
    pauses: []
  };
  stubReading(t);
  stubAttemptStore(t, { existing });
  const updates = [];
  t.mock.method(ReadingFluencyAttempt, "updateOne", async (filter, update) => {
    updates.push(update);
    return { modifiedCount: 1 };
  });
  const { credit, charges } = silentCredit();
  let transcribed = 0;

  const result = await scoreAttempt(attemptArgs(), {
    transcribe: async () => { transcribed += 1; return perfectTranscript(); },
    runTransaction: async (run) => run({}),
    credit
  });

  assert.equal(transcribed, 0);
  assert.equal(charges.length, 1);
  assert.ok(updates.some((update) => update.$set?.chargeFailed === false));
  assert.equal(result.attempt.id, "attempt-1");
});

test("a transcript far longer than the passage is truncated before alignment", () => {
  const words = Array.from({ length: 5000 }, (_, index) => ({
    display: `w${index}`,
    normalized: `w${index}`,
    start: index,
    end: index + 1
  }));
  const transcript = { text: words.map((word) => word.display).join(" "), words };
  const reference = { wordCount: 100 };

  const out = truncateTranscript(transcript, reference);

  assert.equal(out.words.length, 350);
  assert.equal(out.text, transcript.text);
  assert.equal(transcript.words.length, 5000);
});

test("a transcript within the limit is returned unchanged", () => {
  const transcript = {
    text: "hi",
    words: [{ display: "hi", normalized: "hi", start: 0, end: 1 }]
  };
  assert.equal(truncateTranscript(transcript, { wordCount: 100 }), transcript);
});

test("a malformed assignment id is refused before any database work", async (t) => {
  const findOne = t.mock.method(ReadingFluencyAttempt, "findOne", () => query(null));
  const { credit } = silentCredit();
  let transcribed = 0;

  await assert.rejects(
    scoreAttempt(attemptArgs({ assignmentId: "not-an-object-id" }), {
      transcribe: async () => { transcribed += 1; return perfectTranscript(); },
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 400 && error.code === "INVALID_ID"
  );
  assert.equal(transcribed, 0);
  assert.equal(findOne.mock.calls.length, 0);
});

test("an over-long part key is refused", async (t) => {
  stubReading(t);
  stubAttemptStore(t);
  const { credit } = silentCredit();

  await assert.rejects(
    scoreAttempt(attemptArgs({ blockKey: "x".repeat(121) }), {
      transcribe: async () => perfectTranscript(),
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 400 && error.code === "FLUENCY_PART_REQUIRED"
  );
});

test("an unknown level is refused before any paid work", async (t) => {
  stubReading(t);
  stubAttemptStore(t);
  const { credit } = silentCredit();
  let transcribed = 0;

  await assert.rejects(
    scoreAttempt(attemptArgs({ level: 3 }), {
      transcribe: async () => { transcribed += 1; return perfectTranscript(); },
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 400 && error.code === "FLUENCY_INVALID_LEVEL"
  );
  assert.equal(transcribed, 0);
});

const stubListenStore = (t, { lastListenAt = null, listens = 0 } = {}) => {
  const state = { listens, lastListenAt };
  t.mock.method(ReadingFluencyProgress, "findOneAndUpdate", (filter, update) => {
    const cutoff = filter?.$or?.find((clause) => clause.lastListenAt?.$lte)
      ?.lastListenAt.$lte;
    if (state.lastListenAt && (!cutoff || state.lastListenAt > cutoff)) {
      const error = new Error("E11000 duplicate key error");
      error.code = 11000;
      return { lean: () => Promise.reject(error) };
    }
    state.listens += update.$inc.listens;
    state.lastListenAt = update.$set.lastListenAt;
    return query({ listens: state.listens });
  });
  t.mock.method(ReadingFluencyProgress, "findOne", () => query({ listens: state.listens }));
  return state;
};

test("a listen is counted once within twenty seconds", async (t) => {
  stubReading(t);
  const state = stubListenStore(t);

  const first = await recordListen({ schoolId, studentId, assignmentId, blockKey: "p-0" });
  const second = await recordListen({ schoolId, studentId, assignmentId, blockKey: "p-0" });

  assert.equal(first.counted, true);
  assert.equal(first.listens, 1);
  assert.equal(second.counted, false);
  assert.equal(second.listens, 1);
  assert.equal(state.listens, 1);
});

test("a listen counts again after the dedupe window", async (t) => {
  stubReading(t);
  const state = stubListenStore(t, {
    lastListenAt: new Date(Date.now() - LISTEN_DEDUPE_MS - 1000),
    listens: 3
  });

  const result = await recordListen({ schoolId, studentId, assignmentId, blockKey: "p-0" });

  assert.equal(result.counted, true);
  assert.equal(result.listens, 4);
  assert.equal(state.listens, 4);
});

test("a listen for a part that is not enabled is refused", async (t) => {
  stubReading(t);
  stubListenStore(t);

  await assert.rejects(
    recordListen({ schoolId, studentId, assignmentId, blockKey: "p-9" }),
    (error) => error.statusCode === 409 && error.code === "FLUENCY_PART_NOT_ENABLED"
  );
});

test("accepting consent is recorded once and stays idempotent", async (t) => {
  let profile = { micConsent: { acceptedAt: null, version: 0 } };
  t.mock.method(StudentReadingProfile, "findOne", () => query(profile));
  t.mock.method(StudentReadingProfile, "findOneAndUpdate", (filter, update) => {
    profile = {
      ...profile,
      micConsent: {
        acceptedAt: update.$set["micConsent.acceptedAt"],
        version: update.$set["micConsent.version"]
      }
    };
    return query(profile);
  });

  const first = await recordConsent({ schoolId, studentId });
  const second = await recordConsent({ schoolId, studentId });

  assert.equal(first.accepted, true);
  assert.equal(first.version, FLUENCY_CONSENT_VERSION);
  assert.ok(first.acceptedAt instanceof Date);
  assert.equal(second.accepted, true);
  assert.deepEqual(second.acceptedAt, first.acceptedAt);
});

test("a recording without microphone consent is refused before transcription", async (t) => {
  stubReading(t, { profile: null });
  stubAttemptStore(t);
  const { credit } = silentCredit();
  let transcribed = 0;

  await assert.rejects(
    scoreAttempt(attemptArgs(), {
      transcribe: async () => { transcribed += 1; return perfectTranscript(); },
      runTransaction: async (run) => run({}),
      credit
    }),
    (error) => error.statusCode === 403 && error.code === "FLUENCY_CONSENT_REQUIRED"
  );
  assert.equal(transcribed, 0);
});
