import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import Student from "../models/Student.js";
import TutorVoiceSession from "../models/TutorVoiceSession.js";
import logger from "../utils/logger.js";
import {
  classRoster,
  clearVoiceRosterCache,
  scrubVoiceTurn,
} from "../services/voiceTutorPrivacy.js";
import {
  buildTurnMessages,
  createTurnTiming,
  logVoiceTurnTiming,
} from "../services/voiceTutorService.js";

const schoolId = "507f1f77bcf86cd799439012";

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

const student = { firstName: "Layla", lastName: "Hassan" };
const roster = ["Layla Hassan", "Omar Khaled", "Sara Ali"];

test("a child's own words are scrubbed only on their way into the prompt", () => {
  const transcript =
    "Layla Hassan here. Email layla.h@example.com or call 01012345678. " +
    "Omar Khaled said Sara was right. I am a girl in grade 5 and I speak English.";
  const prior = [
    { role: "student", text: "Layla Hassan asked what Omar Khaled meant." },
    { role: "tutor", text: "Layla Hassan, that is a strong question." },
  ];

  const safe = scrubVoiceTurn({ transcript, prior, student, roster });

  assert.match(safe.transcript, /\{\{student\}\}/);
  for (const leaked of ["Layla", "Hassan", "Omar", "Khaled", "Sara"]) {
    assert.equal(safe.transcript.includes(leaked), false, `${leaked} leaked`);
  }
  assert.match(safe.transcript, /\[email\]/);
  assert.match(safe.transcript, /\[number\]/);
  // Group facts are not identity: they stay.
  assert.match(safe.transcript, /girl/);
  assert.match(safe.transcript, /grade 5/);
  assert.match(safe.transcript, /English/);

  assert.match(safe.prior[0].text, /\{\{student\}\}/);
  assert.equal(/Layla|Hassan|Omar|Khaled/.test(safe.prior[0].text), false);
  assert.notEqual(safe.prior[0], prior[0]);
  // Tutor messages are model output, never re-written.
  assert.equal(safe.prior[1], prior[1]);
  // The stored turn keeps exactly what the student said.
  assert.match(prior[0].text, /Layla Hassan/);
});

test("the class roster is read once per class within the ten minute window", async (t) => {
  clearVoiceRosterCache();
  let reads = 0;
  t.mock.method(Student, "find", () => {
    reads += 1;
    return query([
      { firstName: "Omar", lastName: "Khaled" },
      { firstName: "Sara", lastName: "Ali" },
      { firstName: "", lastName: "" },
    ]);
  });

  const first = await classRoster({ schoolId, classId: "class-a" });
  const second = await classRoster({ schoolId, classId: "class-a" });
  assert.deepEqual(first, ["Omar Khaled", "Sara Ali"]);
  assert.deepEqual(second, first);
  assert.equal(reads, 1);

  await classRoster({ schoolId, classId: "class-b" });
  assert.equal(reads, 2);

  clearVoiceRosterCache();
  await classRoster({ schoolId, classId: "class-a" });
  assert.equal(reads, 3);
});

test("a failed roster read is never cached", async (t) => {
  clearVoiceRosterCache();
  let reads = 0;
  t.mock.method(Student, "find", () => {
    reads += 1;
    if (reads === 1) throw new Error("roster read failed");
    return query([{ firstName: "Sara", lastName: "Ali" }]);
  });

  await assert.rejects(
    classRoster({ schoolId, classId: "class-a" }),
    /roster read failed/,
  );
  assert.deepEqual(
    await classRoster({ schoolId, classId: "class-a" }),
    ["Sara Ali"],
  );
  assert.equal(reads, 2);
});

test("a stored turn keeps the words, never the audio bytes", () => {
  const turnId = "507f1f77bcf86cd799439099";
  const { segments, messages } = buildTurnMessages({
    transcript: "Omar Khaled said the Nile floods.",
    transcriptSeconds: 4.2,
    parsed: { spoken: "Good thinking.", lead: "Nice start.", blocks: [] },
    segments: [
      {
        kind: "lead",
        index: 0,
        text: "Welcome back.",
        audio: "data:audio/mpeg;base64,AAAA",
        buffer: Buffer.from("mp3"),
      },
    ],
    lessons: [{ _id: "507f1f77bcf86cd799439011" }],
    reply: { totalTokenCount: 42 },
    turnId,
    price: 3,
    speechSeconds: 2.5,
  });

  assert.deepEqual(segments, [
    { kind: "lead", index: 0, text: "Welcome back." },
  ]);
  assert.deepEqual(messages[0], {
    role: "student",
    text: "Omar Khaled said the Nile floods.",
    transcriptSeconds: 4.2,
    at: messages[0].at,
  });
  assert.deepEqual(messages[1].segments, segments);
  assert.equal(messages[1].turnId, turnId);
  assert.equal(messages[1].credits, 3);

  const serialized = JSON.stringify(messages);
  assert.equal(/data:audio|base64|"buffer"/i.test(serialized), false);
  // The schema itself has nowhere to keep a recording or a clip.
  const paths = Object.keys(TutorVoiceSession.schema.paths);
  assert.equal(paths.some((path) => /audio|buffer|base64|clip/i.test(path)), false);
});

test("the timing line carries numbers and the school id only", (t) => {
  const lines = [];
  t.mock.method(logger, "info", (event, payload) => {
    lines.push({ event, payload });
  });

  const timing = createTurnTiming();
  timing.step("session");
  timing.step("context");
  logVoiceTurnTiming({ schoolId, timing, responseBytes: 1234 });

  assert.equal(lines.length, 1);
  const [{ event, payload }] = lines;
  assert.equal(event, "voice_tutor_turn_timing");
  assert.deepEqual(Object.keys(payload).sort(), [
    "responseBytes",
    "schoolId",
    "steps",
    "totalMs",
  ]);
  assert.equal(payload.schoolId, schoolId);
  assert.equal(payload.responseBytes, 1234);
  assert.deepEqual(Object.keys(payload.steps).sort(), ["context", "session"]);
  assert.ok(Object.values(payload.steps).every(Number.isFinite));
  assert.equal(/Layla|Omar|transcript|studentId|@/i.test(JSON.stringify(payload)), false);
});
