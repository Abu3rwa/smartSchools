import assert from "node:assert/strict";
import test from "node:test";
import Class from "../models/Class.js";
import LiveLesson from "../models/LiveLesson.js";
import LiveSession from "../models/LiveSession.js";
import { copyClassesFromYear } from "../controllers/academicYearRolloverController.js";

const oid = (suffix) => `507f1f77bcf86cd7994390${suffix}`;
const schoolId = oid("12");
const oldClassId = oid("14");
const newClassId = oid("15");
const lessonId = oid("13");
const subjectId = oid("16");

const previousYearClass = {
  _id: oldClassId,
  name: "Grade 5-G",
  grade: 5,
  section: "G",
  academicYear: "2025-2026",
};

const callRollover = (req) => {
  const body = {};
  let resolveResponse;
  const responded = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const collect = (payload) => {
    Object.assign(body, payload);
    resolveResponse();
    return undefined;
  };
  copyClassesFromYear({ ...req }, {
    json: collect,
    status: () => ({ json: collect }),
  }, (error) => {
    body.error = error;
    resolveResponse();
  });
  return responded.then(() => {
    if (body.error) throw body.error;
    return body;
  });
};

const stubClassCopy = (t) => {
  t.mock.method(Class, "find", async () => [previousYearClass]);
  t.mock.method(Class, "findOne", async () => null);
  t.mock.method(Class, "create", async (payload) => ({
    _id: newClassId,
    subjects: [],
    ...payload,
  }));
};

const req = (body) => ({
  body,
  user: { _id: oid("11"), role: "admin" },
  schoolId,
});

const lessonChain = (lessons) => ({
  select: () => ({ lean: async () => lessons }),
});

test("rollover leaves the lesson library alone unless it is asked to carry it", async (t) => {
  stubClassCopy(t);
  let lessonsRead = 0;
  t.mock.method(LiveLesson, "find", () => {
    lessonsRead++;
    return lessonChain([]);
  });

  const body = await callRollover(req({
    fromAcademicYear: "2025-2026",
    toAcademicYear: "2026-2027",
  }));

  assert.equal(lessonsRead, 0);
  assert.equal(body.data.liveLessons, null);
});

test("carrying lessons re-points each one to the copied class and its new year", async (t) => {
  stubClassCopy(t);
  t.mock.method(LiveLesson, "find", () => lessonChain([{
    _id: lessonId,
    classId: oldClassId,
    subjectId,
    academicYear: "2025-2026",
  }]));
  t.mock.method(LiveSession, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));
  const writes = [];
  t.mock.method(LiveLesson, "updateOne", (filter, update) => {
    writes.push({ filter, update });
    return Promise.resolve({ modifiedCount: 1 });
  });

  const body = await callRollover(req({
    fromAcademicYear: "2025-2026",
    toAcademicYear: "2026-2027",
    includeLiveLessons: true,
  }));

  assert.deepEqual(body.data.liveLessons, {
    scanned: 1,
    moved: 1,
    subjectCleared: 1,
    skippedOpenSession: 0,
  });
  assert.deepEqual(writes[0].filter, { _id: lessonId, school: schoolId });
  assert.deepEqual(writes[0].update.$set, {
    classId: newClassId,
    academicYear: "2026-2027",
    subjectId: null,
  });
});

test("a lesson with a session still running is skipped, not moved", async (t) => {
  stubClassCopy(t);
  t.mock.method(LiveLesson, "find", () => lessonChain([{ _id: lessonId, classId: oldClassId, subjectId }]));
  t.mock.method(LiveSession, "findOne", () => ({
    select: () => ({ lean: async () => ({ _id: oid("18"), status: "live" }) }),
  }));
  let wrote = false;
  t.mock.method(LiveLesson, "updateOne", () => {
    wrote = true;
    return Promise.resolve({ modifiedCount: 1 });
  });

  const body = await callRollover(req({
    fromAcademicYear: "2025-2026",
    toAcademicYear: "2026-2027",
    includeLiveLessons: true,
  }));

  assert.equal(wrote, false);
  assert.deepEqual(body.data.liveLessons, {
    scanned: 1,
    moved: 0,
    subjectCleared: 0,
    skippedOpenSession: 1,
  });
});

test("a non-boolean carry-over flag is refused before any class is created", async (t) => {
  let created = 0;
  t.mock.method(Class, "find", async () => [previousYearClass]);
  t.mock.method(Class, "findOne", async () => null);
  t.mock.method(Class, "create", async () => {
    created++;
    return {};
  });

  const body = await callRollover(req({
    fromAcademicYear: "2025-2026",
    toAcademicYear: "2026-2027",
    includeLiveLessons: "yes",
  }));

  assert.equal(body.success, false);
  assert.match(body.message, /includeLiveLessons must be true or false/);
  assert.equal(created, 0);
});
