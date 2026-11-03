import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";

import TutorLesson from "../models/TutorLesson.js";
import TutorSettings from "../models/TutorSettings.js";
import TutorClassAccess from "../models/TutorClassAccess.js";
import TutorWallet from "../models/TutorWallet.js";
import TutorVoiceSession from "../models/TutorVoiceSession.js";
import Subject from "../models/Subject.js";
import Class from "../models/Class.js";
import Standard from "../models/Standard.js";
import StudentLearningProfile from "../models/StudentLearningProfile.js";
import StudentReadingProfile from "../models/StudentReadingProfile.js";
import AiCreditAccount from "../models/AiCreditAccount.js";
import AiCreditSetting from "../models/AiCreditSetting.js";
import logger from "../utils/logger.js";
import { pickLessons } from "../services/tutorService.js";
import {
  clearVoiceSessionCaches,
  startVoiceSession,
} from "../services/voiceTutorService.js";
import { VOICE_DEFAULTS } from "../services/voiceTutorPricing.js";
import {
  clearSpeechCache,
  speechCacheStats,
  synthesizeSpeech,
} from "../services/voiceSpeech.js";

const schoolId = "507f1f77bcf86cd799439012";
const subjectId = "507f1f77bcf86cd799439013";
const classId = "507f1f77bcf86cd799439014";
const lessonId = "507f1f77bcf86cd799439015";
const sessionId = "507f1f77bcf86cd799439016";
const studentId = "507f1f77bcf86cd799439017";
const userId = "507f1f77bcf86cd799439018";

const query = (value) => {
  const chain = {
    select() {
      return chain;
    },
    sort() {
      return chain;
    },
    limit() {
      return chain;
    },
    lean: async () => value,
  };
  return chain;
};

const lesson = {
  _id: lessonId,
  unitNumber: 1,
  unitTitle: "Ancient Egypt",
  chapterNumber: 1,
  chapterTitle: "The Nile",
  lessonNumber: 1,
  title: "Why the Nile matters",
  content: "The Nile flooded every summer.",
  standards: [],
};

const withEnv = async (values, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const withFetch = async (fake, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};

/** Every read a session start touches, stubbed at the model boundary. */
const stubSessionReads = (t) => {
  const counters = { standards: 0 };
  t.mock.method(logger, "warn", () => {});
  t.mock.method(logger, "error", () => {});
  t.mock.method(AiCreditSetting, "findOne", () =>
    query({ voice: VOICE_DEFAULTS, markupPercent: 200 }),
  );
  t.mock.method(TutorSettings, "findOne", () =>
    query({ enabled: true, practiceEnabled: true, defaultCredits: 30 }),
  );
  t.mock.method(TutorClassAccess, "findOne", () => query(null));
  t.mock.method(AiCreditAccount, "findOne", () =>
    query({ balanceCents: 1000, paused: false }),
  );
  t.mock.method(TutorWallet, "findOne", () => query({ paused: false }));
  t.mock.method(Subject, "findOne", () => query({ _id: subjectId, name: "Social Studies" }));
  t.mock.method(Class, "findOne", () =>
    query({ _id: classId, grade: 5, name: "5A", subjects: [] }),
  );
  t.mock.method(TutorLesson, "findOne", () => query(lesson));
  t.mock.method(StudentLearningProfile, "findOne", () => query(null));
  t.mock.method(StudentReadingProfile, "findOne", () => query(null));
  t.mock.method(Standard, "find", () => {
    counters.standards += 1;
    return query([
      { code: "SS5.1", name: "Ancient Egypt", description: "The Nile" },
    ]);
  });
  t.mock.method(TutorVoiceSession, "create", async (payload) => ({
    toObject: () => ({
      _id: sessionId,
      status: "active",
      language: payload.language,
      languageLevel: payload.languageLevel,
      subject: payload.subject,
      subjectName: payload.subjectName,
      lesson: payload.lesson,
      lessonLabel: payload.lessonLabel,
      messages: payload.messages,
      messageCount: payload.messageCount,
      creditsSpent: payload.chargedCents,
    }),
  }));
  return counters;
};

const student = {
  _id: studentId,
  user: userId,
  currentClass: classId,
  enrolledClasses: [],
};

const start = (lazy = true) =>
  startVoiceSession({
    schoolId,
    student,
    subjectId,
    lessonId,
    language: "en",
    lazy,
  });

test("a pinned turn reads the one lesson and never the library", async (t) => {
  let findOneCalls = 0;
  let findCalls = 0;
  t.mock.method(TutorLesson, "findOne", () => {
    findOneCalls += 1;
    return query(lesson);
  });
  t.mock.method(TutorLesson, "find", () => {
    findCalls += 1;
    return query([lesson]);
  });

  const result = await pickLessons({
    schoolId,
    subjectId,
    grade: 5,
    question: "",
    lessonId,
    pinned: true,
  });

  assert.deepEqual(result, [lesson]);
  assert.equal(findOneCalls, 1);
  assert.equal(findCalls, 0);
});

test("a question that moved away from the pinned lesson searches the library", async (t) => {
  let findCalls = 0;
  t.mock.method(TutorLesson, "findOne", () => query(lesson));
  t.mock.method(TutorLesson, "find", () => {
    findCalls += 1;
    return query([lesson]);
  });

  const result = await pickLessons({
    schoolId,
    subjectId,
    grade: 5,
    question: "photosynthesis",
    lessonId,
    pinned: true,
  });

  assert.deepEqual(result, [lesson]);
  // One search read, then one full-text read for the chosen lessons.
  assert.equal(findCalls, 2);
});

test("standards are read once inside the cache window and again after it", async (t) => {
  clearVoiceSessionCaches();
  const counters = stubSessionReads(t);

  await withEnv({ OPENAI_API_KEY: "" }, async () => {
    await start(true);
    assert.equal(counters.standards, 1);

    await start(true);
    assert.equal(counters.standards, 1);

    clearVoiceSessionCaches();
    await start(true);
    assert.equal(counters.standards, 2);
  });

  clearVoiceSessionCaches();
});

test("the speech cache is bounded by bytes, not only by entry count", async () => {
  await withEnv(
    { OPENAI_API_KEY: "test-key", VOICE_SPEECH_CACHE_BYTES: "6" },
    async () => {
      clearSpeechCache();
      await withFetch(
        async () => new globalThis.Response(new Uint8Array([1, 2, 3]), { status: 200 }),
        async () => {
          await synthesizeSpeech({ text: "first clip" });
          await synthesizeSpeech({ text: "second clip" });
          await synthesizeSpeech({ text: "third clip" });
        },
      );
      assert.deepEqual(speechCacheStats(), { entries: 2, bytes: 6, maxBytes: 6 });

      // A single clip above the budget is returned but never kept.
      await withFetch(
        async () => new globalThis.Response(new Uint8Array(10), { status: 200 }),
        async () => {
          const big = await synthesizeSpeech({ text: "too big to keep" });
          assert.equal(big.buffer.length, 10);
        },
      );
      assert.deepEqual(speechCacheStats(), { entries: 2, bytes: 6, maxBytes: 6 });
      clearSpeechCache();
    },
  );
});
