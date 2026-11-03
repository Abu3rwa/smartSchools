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
import {
  clearVoiceSessionCaches,
  getVoiceClip,
  startVoiceSession,
} from "../services/voiceTutorService.js";
import { VOICE_DEFAULTS } from "../services/voiceTutorPricing.js";
import { clearSpeechCache } from "../services/voiceSpeech.js";

const schoolId = "507f1f77bcf86cd799439012";
const subjectId = "507f1f77bcf86cd799439013";
const classId = "507f1f77bcf86cd799439014";
const lessonId = "507f1f77bcf86cd799439015";
const sessionId = "507f1f77bcf86cd799439016";
const studentId = "507f1f77bcf86cd799439017";
const userId = "507f1f77bcf86cd799439018";
const turnId = "507f1f77bcf86cd799439019";

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

const student = {
  _id: studentId,
  user: userId,
  currentClass: classId,
  enrolledClasses: [],
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

/** A fake provider: chat always fails, speech returns three MP3-ish bytes. */
const fakeProvider = () => {
  const calls = { chat: 0, speech: 0 };
  const fetch = async (url) => {
    if (String(url).includes("/audio/speech")) {
      calls.speech += 1;
      return new globalThis.Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    calls.chat += 1;
    return new globalThis.Response(JSON.stringify({ error: { message: "down" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetch };
};

/** Every read a session start touches, stubbed at the model boundary. */
const stubSessionReads = (t, created) => {
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
  t.mock.method(Standard, "find", () => query([]));
  t.mock.method(TutorVoiceSession, "create", async (payload) => {
    created.push(payload);
    return {
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
    };
  });
};

const start = (lazy) =>
  startVoiceSession({ schoolId, student, subjectId, lessonId, language: "en", lazy });

test("a lazy start answers with clip addresses, not audio bytes", async (t) => {
  clearVoiceSessionCaches();
  clearSpeechCache();
  const created = [];
  stubSessionReads(t, created);

  await withEnv({ OPENAI_API_KEY: "" }, async () => {
    const original = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = async () => {
      fetches += 1;
      throw new Error("no provider may be contacted");
    };
    try {
      const result = await start(true);

      assert.equal(result.audio, null);
      assert.deepEqual(result.segments, []);
      assert.deepEqual(result.clips, [{ index: 0, kind: "lead" }]);
      assert.equal(result.audioPending, true);
      assert.equal(typeof result.turnId, "string");
      assert.equal(fetches, 0);
    } finally {
      globalThis.fetch = original;
    }
  });

  const [payload] = created;
  const [message] = payload.messages;
  assert.equal(message.segments.length, 1);
  assert.equal(message.segments[0].kind, "lead");
  assert.equal(typeof message.segments[0].text, "string");
  assert.ok(message.speechSeconds > 0);
  assert.equal("audio" in message, false);
  assert.equal("buffer" in message, false);
});

test("without the flag the response still carries the inline audio", async (t) => {
  clearVoiceSessionCaches();
  clearSpeechCache();
  const created = [];
  stubSessionReads(t, created);
  const provider = fakeProvider();

  await withEnv({ OPENAI_API_KEY: "test-key" }, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = provider.fetch;
    try {
      const result = await start(false);

      // The old contract: a clip per board part, each carrying its own audio.
      assert.equal("audio" in result, true);
      assert.equal(result.audio, null);
      assert.equal(result.segments.length, 1);
      assert.equal(result.segments[0].kind, "lead");
      assert.match(result.segments[0].audio, /^data:audio\/mpeg;base64,/);
      assert.equal("audioPending" in result, false);
      assert.equal(provider.calls.chat, 1);
      assert.equal(provider.calls.speech, 1);
    } finally {
      globalThis.fetch = original;
    }
  });

  assert.equal(created.length, 1);
});

test("one saved clip is bytes, and only for the session's own student", async (t) => {
  clearVoiceSessionCaches();
  clearSpeechCache();
  t.mock.method(logger, "warn", () => {});
  t.mock.method(AiCreditSetting, "findOne", () =>
    query({ voice: VOICE_DEFAULTS, markupPercent: 200 }),
  );
  t.mock.method(AiCreditAccount, "findOne", () => {
    throw new Error("reading a clip must never touch the wallet");
  });
  const filters = [];
  t.mock.method(TutorVoiceSession, "findOne", (filter) => {
    filters.push(filter);
    return query({
      messages: [{ segments: [{ kind: "lead", text: "Welcome back." }] }],
    });
  });
  const provider = fakeProvider();

  await withEnv({ OPENAI_API_KEY: "test-key" }, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = provider.fetch;
    try {
      const clip = await getVoiceClip({
        schoolId,
        student,
        sessionId,
        turnId,
        clipIndex: 0,
      });

      assert.deepEqual([...clip.buffer], [1, 2, 3]);
      assert.equal(clip.contentType, "audio/mpeg");
      assert.deepEqual(clip && Object.keys(clip).sort(), ["buffer", "contentType"]);
      assert.equal(provider.calls.speech, 1);
    } finally {
      globalThis.fetch = original;
    }
  });

  const [filter] = filters;
  assert.equal(String(filter._id), sessionId);
  assert.equal(filter.school, schoolId);
  assert.equal(String(filter.student), studentId);
  assert.equal(String(filter["messages.turnId"]), turnId);
});

test("another student's session and a missing clip are both a 404", async (t) => {
  clearVoiceSessionCaches();
  t.mock.method(AiCreditSetting, "findOne", () =>
    query({ voice: VOICE_DEFAULTS, markupPercent: 200 }),
  );
  let fetches = 0;
  const provider = fakeProvider();
  const original = globalThis.fetch;
  globalThis.fetch = (...args) => {
    fetches += 1;
    return provider.fetch(...args);
  };

  try {
    await withEnv({ OPENAI_API_KEY: "test-key" }, async () => {
      t.mock.method(TutorVoiceSession, "findOne", () => query(null));
      await assert.rejects(
        getVoiceClip({ schoolId, student, sessionId, turnId, clipIndex: 0 }),
        (error) => error.statusCode === 404,
      );

      t.mock.method(TutorVoiceSession, "findOne", () =>
        query({ messages: [{ segments: [{ kind: "lead", text: "Welcome back." }] }] }),
      );
      await assert.rejects(
        getVoiceClip({ schoolId, student, sessionId, turnId, clipIndex: 5 }),
        (error) => error.statusCode === 404,
      );
      await assert.rejects(
        getVoiceClip({ schoolId, student, sessionId, turnId, clipIndex: "x" }),
        (error) => error.statusCode === 404,
      );
    });
  } finally {
    globalThis.fetch = original;
  }

  assert.equal(fetches, 0);
});
