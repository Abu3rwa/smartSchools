import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import ReadingAssignment from "../models/ReadingAssignment.js";
import ReadingModelAudio from "../models/ReadingModelAudio.js";
import SimplifiedText from "../models/SimplifiedText.js";
import {
  buildWordTimes,
  clearModelAudioCache,
  dropModelAudioForText,
  generateModelAudio,
  getModelAudio,
  isModelAudioAllowed,
  pruneModelAudioForText
} from "../services/readingFluency/modelAudioService.js";
import { alignReferenceToTranscript } from "../services/readingFluency/align.js";
import { normalizeReference, normalizeTranscript } from "../services/readingFluency/normalize.js";
import { readingTextHash } from "../utils/readingBlocks.js";
import { PASSAGE, timedWords } from "./fixtures/readingFluency.js";

const schoolId = "507f1f77bcf86cd799439012";
const teacherId = "507f1f77bcf86cd799439015";
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

const textDocument = () => ({
  _id: textId,
  school: schoolId,
  title: "Creating a Nation",
  language: "english",
  originalText: PASSAGE,
  originalComplexity: null,
  sections: [],
  simplifiedVersions: [],
  vocabularySubstitutions: []
});

const multiPartDocument = () => ({
  ...textDocument(),
  originalText: Array.from(
    { length: 9 },
    (_, index) => `Paragraph ${index + 1} is read aloud here.`
  ).join("\n\n")
});

const transcriptWithTimes = (text) => {
  const timed = timedWords(text, { wordSeconds: 0.3 });
  return {
    text,
    words: timed,
    segments: [],
    duration: timed.length ? timed[timed.length - 1].end : 0,
    model: "whisper-1"
  };
};

const aligned = (text) => {
  const reference = normalizeReference(text);
  const transcript = normalizeTranscript(text, { words: timedWords(text) });
  return {
    reference,
    transcript,
    alignment: alignReferenceToTranscript(reference, transcript)
  };
};

test("word times follow the reference words, including multi-word numbers", () => {
  const reference = normalizeReference("In 1770, the crowd fired.");
  const transcript = normalizeTranscript("in seventeen seventy the crowd fired", {
    words: [
      { word: "in", start: 0, end: 0.2 },
      { word: "seventeen", start: 0.2, end: 0.5 },
      { word: "seventy", start: 0.5, end: 0.8 },
      { word: "the", start: 0.8, end: 1 },
      { word: "crowd", start: 1, end: 1.4 },
      { word: "fired", start: 1.4, end: 1.8 }
    ]
  });
  const alignment = alignReferenceToTranscript(reference, transcript);
  const times = buildWordTimes({ reference, transcript, alignment, duration: 1.8 });

  assert.equal(times.length, reference.wordCount);
  assert.deepEqual(times[0], [0, 0.2]);
  assert.deepEqual(times[1], [0.2, 0.8]);
  assert.deepEqual(times[2], [0.8, 1]);
  assert.deepEqual(times[4], [1.4, 1.8]);
});

test("a word missing from the transcription gets the gap between its neighbours", () => {
  const reference = normalizeReference("In 1770, the crowd fired.");
  const transcript = normalizeTranscript("in seventeen seventy crowd fired", {
    words: [
      { word: "in", start: 0, end: 0.2 },
      { word: "seventeen", start: 0.2, end: 0.5 },
      { word: "seventy", start: 0.5, end: 0.8 },
      { word: "crowd", start: 1, end: 1.4 },
      { word: "fired", start: 1.4, end: 1.8 }
    ]
  });
  const alignment = alignReferenceToTranscript(reference, transcript);
  const times = buildWordTimes({ reference, transcript, alignment, duration: 1.8 });

  assert.deepEqual(times[2], [0.8, 1]);
  for (let index = 1; index < times.length; index += 1) {
    assert.ok(times[index][0] >= times[index - 1][0]);
    assert.ok(times[index][1] >= times[index][0]);
  }
});

test("every reference word gets a time pair even without any timings", () => {
  const { reference, transcript, alignment } = aligned(PASSAGE);
  const times = buildWordTimes({ reference, transcript, alignment, duration: 0 });
  assert.equal(times.length, reference.wordCount);
  for (const [start, end] of times) {
    assert.ok(Number.isFinite(start));
    assert.ok(end > start);
  }
});

test("model audio is on unless the platform turns it off", () => {
  assert.equal(isModelAudioAllowed({}), true);
  assert.equal(isModelAudioAllowed({ READING_FLUENCY_AUDIO: "false" }), false);
  assert.equal(isModelAudioAllowed({ READING_FLUENCY_AUDIO: "true" }), true);
});

test("generation stores the clip and word times, then charges once", async (t) => {
  const stored = [];
  t.mock.method(SimplifiedText, "findOne", () => query(textDocument()));
  t.mock.method(ReadingModelAudio, "find", (filter) => query(
    stored.filter((row) => (filter?.textHash?.$in || []).includes(row.textHash))
  ));
  t.mock.method(ReadingModelAudio, "create", async (payload) => {
    stored.push(payload);
    return payload;
  });

  const charges = [];
  const credit = {
    assertHasCredit: async () => ({ balanceCents: 1000 }),
    chargeUsage: async (payload) => {
      charges.push(payload);
      return { charged: true, chargedCents: 3 };
    }
  };

  const result = await generateModelAudio({
    schoolId,
    textId,
    userId: teacherId,
    blocks: [{ key: "p-0", level: null }]
  }, {
    synthesize: async () => ({
      buffer: Buffer.from("model audio"),
      contentType: "audio/mpeg"
    }),
    transcribe: async () => transcriptWithTimes(PASSAGE),
    credit
  });

  assert.equal(result.generated, 1);
  assert.equal(result.failed, 0);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].blockKey, "p-0");
  assert.equal(stored[0].level, null);
  assert.equal(stored[0].wordTimes.length, normalizeReference(PASSAGE).wordCount);
  assert.equal(Buffer.isBuffer(stored[0].data), true);
  assert.deepEqual(stored[0].data, Buffer.from("model audio"));

  assert.equal(charges.length, 1);
  assert.equal(charges[0].feature, "reading-fluency");
  assert.equal(charges[0].outcome, "model-audio");
  assert.equal(charges[0].audio.ttsModel, "gpt-4o-mini-tts");
  assert.equal(charges[0].audio.sttModel, "whisper-1");
  assert.ok(charges[0].extraCostCents > 0);
});

test("existing audio is never generated or charged again", async (t) => {
  const hash = readingTextHash({
    targetLevel: null,
    blockKey: "p-0",
    text: PASSAGE
  });
  t.mock.method(SimplifiedText, "findOne", () => query(textDocument()));
  t.mock.method(ReadingModelAudio, "find", (filter) => query(
    (filter?.textHash?.$in || []).includes(hash) ? [{ textHash: hash }] : []
  ));
  let created = 0;
  t.mock.method(ReadingModelAudio, "create", async () => {
    created += 1;
    return {};
  });
  let charged = 0;
  const credit = {
    assertHasCredit: async () => {
      throw new Error("should not check credit when nothing is missing");
    },
    chargeUsage: async () => {
      charged += 1;
      return {};
    }
  };

  const result = await generateModelAudio({
    schoolId,
    textId,
    userId: teacherId,
    blocks: [{ key: "p-0", level: null }]
  }, {
    synthesize: async () => ({ buffer: Buffer.from("model audio"), contentType: "audio/mpeg" }),
    transcribe: async () => transcriptWithTimes(PASSAGE),
    credit
  });

  assert.equal(result.generated, 0);
  assert.equal(result.skipped, 1);
  assert.equal(created, 0);
  assert.equal(charged, 0);
});

test("generation is batched and reports how many parts are left", async (t) => {
  clearModelAudioCache();
  const stored = [];
  let synthesized = 0;
  t.mock.method(SimplifiedText, "findOne", () => query(multiPartDocument()));
  t.mock.method(ReadingModelAudio, "find", (filter) => query(
    stored.filter((row) => (filter?.textHash?.$in || []).includes(row.textHash))
  ));
  t.mock.method(ReadingModelAudio, "create", async (payload) => {
    stored.push(payload);
    return payload;
  });
  let charged = 0;
  const deps = {
    synthesize: async ({ text }) => {
      synthesized += 1;
      return { buffer: Buffer.from(text), contentType: "audio/mpeg" };
    },
    transcribe: async ({ buffer }) => transcriptWithTimes(buffer.toString()),
    credit: {
      assertHasCredit: async () => ({ balanceCents: 1000 }),
      chargeUsage: async () => {
        charged += 1;
        return { charged: true, chargedCents: 1 };
      }
    }
  };

  const first = await generateModelAudio({ schoolId, textId, userId: teacherId }, deps);
  assert.equal(first.generated, 6);
  assert.equal(first.remaining, 3);
  assert.equal(synthesized, 6);

  const second = await generateModelAudio(
    { schoolId, textId, userId: teacherId, limit: 2 },
    deps
  );
  assert.equal(second.generated, 2);
  assert.equal(second.remaining, 1);
  assert.equal(synthesized, 8);

  const third = await generateModelAudio({ schoolId, textId, userId: teacherId }, deps);
  assert.equal(third.generated, 1);
  assert.equal(third.remaining, 0);
  assert.equal(synthesized, 9);
  assert.equal(charged, 3);
});

test("a served clip is cached, so replay does not query the database again", async (t) => {
  clearModelAudioCache();
  const hash = readingTextHash({ targetLevel: null, blockKey: "p-0", text: PASSAGE });
  const doc = {
    blockKey: "p-0",
    level: null,
    textHash: hash,
    data: Buffer.from("model audio"),
    contentType: "audio/mpeg",
    wordTimes: [],
    speechSeconds: 1
  };
  let queries = 0;
  t.mock.method(ReadingAssignment, "findOne", () => query({ _id: "assignment-1" }));
  t.mock.method(ReadingModelAudio, "findOne", () => {
    queries += 1;
    return query(doc);
  });

  await getModelAudio({ schoolId, textId, blockKey: "p-0", hash, studentId: "student-1" });
  const replay = await getModelAudio({ schoolId, textId, blockKey: "p-0", hash, studentId: "student-1" });

  assert.equal(queries, 1);
  assert.equal(replay.textHash, hash);
});

test("pruning drops clips the current text no longer produces", async (t) => {
  const text = multiPartDocument();
  t.mock.method(SimplifiedText, "findOne", () => query(text));
  let filter = null;
  t.mock.method(ReadingModelAudio, "deleteMany", async (value) => {
    filter = value;
    return { deletedCount: 2 };
  });

  const result = await pruneModelAudioForText({ schoolId, textId });
  const expected = text.originalText.split("\n\n").map((paragraph, index) =>
    readingTextHash({ targetLevel: null, blockKey: `p-${index}`, text: paragraph })
  );

  assert.equal(result.removed, 2);
  assert.deepEqual(filter, {
    school: schoolId,
    text: textId,
    textHash: { $nin: expected }
  });
});

test("an archived text drops every clip it owns", async (t) => {
  let filter = null;
  t.mock.method(ReadingModelAudio, "deleteMany", async (value) => {
    filter = value;
    return { deletedCount: 4 };
  });

  const result = await dropModelAudioForText({ schoolId, textId });

  assert.equal(result.removed, 4);
  assert.deepEqual(filter, { school: schoolId, text: textId });
});

test("streaming by text hash ignores the reader's level label", async (t) => {
  clearModelAudioCache();
  const hash = readingTextHash({ targetLevel: null, blockKey: "p-0", text: PASSAGE });
  let filter = null;
  t.mock.method(ReadingAssignment, "findOne", () => query({ _id: "assignment-1" }));
  t.mock.method(ReadingModelAudio, "findOne", (queryFilter) => {
    filter = queryFilter;
    return query({
      blockKey: "p-0",
      level: null,
      textHash: hash,
      data: Buffer.from("model audio"),
      contentType: "audio/mpeg",
      wordTimes: [[0, 1]],
      speechSeconds: 1
    });
  });

  const doc = await getModelAudio({
    schoolId,
    textId,
    blockKey: "p-0",
    level: 8,
    hash: hash.toUpperCase(),
    studentId: "student-1"
  });

  assert.equal(filter.textHash, hash);
  assert.equal(filter.level, undefined);
  assert.equal(doc.textHash, hash);
});

test("an invalid model voice hash is rejected", async (t) => {
  t.mock.method(ReadingAssignment, "findOne", () => query({ _id: "assignment-1" }));
  await assert.rejects(
    getModelAudio({
      schoolId,
      textId,
      blockKey: "p-0",
      hash: "not-a-hash",
      studentId: "student-1"
    }),
    (error) => error.statusCode === 400 && error.code === "MODEL_AUDIO_HASH_INVALID"
  );
});

test("the platform switch stops generation before any paid work", async (t) => {
  t.mock.method(SimplifiedText, "findOne", () => query(textDocument()));
  let synthesized = 0;

  await assert.rejects(
    generateModelAudio({
      schoolId,
      textId,
      userId: teacherId,
      blocks: [{ key: "p-0", level: null }],
      env: { READING_FLUENCY_AUDIO: "false" }
    }, {
      synthesize: async () => {
        synthesized += 1;
        return { buffer: Buffer.from("x"), contentType: "audio/mpeg" };
      }
    }),
    (error) => error.code === "MODEL_AUDIO_DISABLED"
  );
  assert.equal(synthesized, 0);
});
