import assert from "node:assert/strict";
import test from "node:test";
import Class from "../models/Class.js";
import LiveLesson from "../models/LiveLesson.js";
import LiveSession from "../models/LiveSession.js";
import Teacher from "../models/Teacher.js";
import { buildClassMovePatch, moveLiveLessonToClass } from "../helpers/liveLessonYearMove.js";
import { listLiveLessonMoveTargets, moveLiveLessonYear } from "../controllers/liveLessonController.js";

const oid = (suffix) => `507f1f77bcf86cd7994390${suffix}`;
const teacherId = oid("11");
const schoolId = oid("12");
const lessonId = oid("13");
const oldClassId = oid("14");
const newClassId = oid("15");
const subjectId = oid("16");
const teacherRecordId = oid("17");

const lastYearClass = {
  _id: oldClassId,
  name: "Grade 5-G",
  academicYear: "2025-2026",
  subjects: [{ subject: subjectId, teacher: teacherRecordId }],
};

// What rollover actually creates: the right name and year, no subjects or
// class teacher assigned yet.
const freshNextYearClass = {
  _id: newClassId,
  name: "Grade 5-G",
  academicYear: "2026-2027",
  subjects: [],
};

const invoke = (handler) => (req) => {
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
  handler({ ...req }, {
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

const callMove = invoke(moveLiveLessonYear);
const callTargets = invoke(listLiveLessonMoveTargets);

const lessonDoc = (overrides = {}) => {
  const doc = {
    _id: lessonId,
    classId: oldClassId,
    subjectId,
    subject: "Mathematics",
    academicYear: "2025-2026",
    set(values) {
      Object.assign(this, values);
      this.applied = values;
    },
    save: async () => undefined,
    populate: async () => undefined,
    ...overrides,
  };
  return doc;
};

const stubTeacherScope = (t, classDoc) => {
  t.mock.method(Teacher, "findOne", () => ({
    select: () => ({ lean: async () => ({ _id: teacherRecordId }) }),
  }));
  t.mock.method(Class, "findOne", async () => classDoc);
};

test("a move keeps the subject link when the destination class teaches it", () => {
  const { patch, subjectCleared } = buildClassMovePatch(
    lessonDoc(),
    { ...freshNextYearClass, subjects: [{ subject: subjectId }] },
  );
  assert.equal(subjectCleared, false);
  assert.equal(String(patch.classId), newClassId);
  assert.equal(patch.academicYear, "2026-2027");
  assert.equal(patch.subjectId, undefined);
  assert.equal(patch.subject, undefined);
});

test("a move into a freshly copied class clears the subject link and keeps the subject name", () => {
  const { patch, subjectCleared } = buildClassMovePatch(lessonDoc(), freshNextYearClass);
  assert.equal(subjectCleared, true);
  assert.equal(patch.subjectId, null);
  assert.equal(patch.academicYear, "2026-2027");
  assert.equal(patch.subject, undefined);
});

test("a class without an academic year leaves the lesson without one", () => {
  const { patch } = buildClassMovePatch(lessonDoc({ subjectId: null }), { _id: newClassId, name: "Loose" });
  assert.equal(patch.academicYear, null);
});

test("a scheduled or live session blocks the move and nothing is written", async (t) => {
  t.mock.method(LiveSession, "findOne", () => ({
    select: () => ({ lean: async () => ({ _id: oid("18"), status: "waiting" }) }),
  }));
  let saved = null;
  const result = await moveLiveLessonToClass({
    lesson: lessonDoc(),
    targetClass: freshNextYearClass,
    save: (patch) => {
      saved = patch;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "open_session");
  assert.equal(saved, null);
});

test("an ended session does not block the move", async (t) => {
  t.mock.method(LiveSession, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));
  let saved;
  const result = await moveLiveLessonToClass({
    lesson: lessonDoc(),
    targetClass: freshNextYearClass,
    save: async (patch) => {
      saved = patch;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(saved.academicYear, "2026-2027");
});

test("the endpoint refuses to move a lesson into a class the caller does not teach", async (t) => {
  const lesson = lessonDoc();
  t.mock.method(LiveLesson, "findOne", async () => lesson);
  stubTeacherScope(t, null);
  const body = await callMove({
    params: { id: lessonId },
    body: { classId: newClassId },
    user: { _id: teacherId, role: "teacher" },
    schoolId,
  });
  assert.equal(body.success, false);
  assert.equal(body.message, "You are not assigned to that class.");
  assert.equal(lesson.applied, undefined);
});

test("the endpoint refuses when the lesson is already on that class", async (t) => {
  const lesson = lessonDoc();
  t.mock.method(LiveLesson, "findOne", async () => lesson);
  const body = await callMove({
    params: { id: lessonId },
    body: { classId: oldClassId },
    user: { _id: teacherId, role: "teacher" },
    schoolId,
  });
  assert.equal(body.success, false);
  assert.match(body.message, /already assigned/);
});

test("the endpoint rejects a blocked session before writing", async (t) => {
  const lesson = lessonDoc();
  t.mock.method(LiveLesson, "findOne", async () => lesson);
  stubTeacherScope(t, { ...lastYearClass, _id: newClassId });
  t.mock.method(LiveSession, "findOne", () => ({
    select: () => ({ lean: async () => ({ _id: oid("18"), status: "live" }) }),
  }));
  const body = await callMove({
    params: { id: lessonId },
    body: { classId: newClassId },
    user: { _id: teacherId, role: "teacher" },
    schoolId,
  });
  assert.equal(body.success, false);
  assert.match(body.message, /End or delete/);
  assert.equal(lesson.applied, undefined);
});

test("the endpoint moves the lesson and says so when the subject link had to be cleared", async (t) => {
  const lesson = lessonDoc();
  t.mock.method(LiveLesson, "findOne", async () => lesson);
  stubTeacherScope(t, freshNextYearClass);
  t.mock.method(LiveSession, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));
  const body = await callMove({
    params: { id: lessonId },
    body: { classId: newClassId },
    user: { _id: teacherId, role: "teacher" },
    schoolId,
  });
  assert.equal(body.success, true);
  assert.equal(body.data.subjectCleared, true);
  assert.match(body.message, /subject link was cleared/);
  assert.equal(lesson.academicYear, "2026-2027");
  assert.equal(lesson.subjectId, null);
  assert.equal(lesson.subject, "Mathematics");
  assert.deepEqual(lesson.applied, { classId: newClassId, academicYear: "2026-2027", subjectId: null });
});

test("a missing or malformed class id is a bad request, not a lookup", async (t) => {
  let lookedUp = false;
  t.mock.method(LiveLesson, "findOne", async () => {
    lookedUp = true;
    return lessonDoc();
  });
  const body = await callMove({
    params: { id: lessonId },
    body: {},
    user: { _id: teacherId, role: "teacher" },
    schoolId,
  });
  assert.equal(body.success, false);
  assert.match(body.message, /Choose the class/);
  assert.equal(lookedUp, false);
});

const classListChain = (docs) => ({
  select: () => ({ sort: () => ({ lean: async () => docs }) }),
});

const stubTeacherClasses = (t, docs) => {
  t.mock.method(Teacher, "findOne", () => ({
    select: () => ({ lean: async () => ({ _id: teacherRecordId }) }),
  }));
  t.mock.method(Class, "find", () => classListChain(docs));
};

test("the move picker offers every year the teacher teaches and flags what each move costs", async (t) => {
  const lesson = lessonDoc({ academicYear: null });
  t.mock.method(LiveLesson, "findOne", async () => lesson);
  stubTeacherClasses(t, [freshNextYearClass, lastYearClass]);
  t.mock.method(LiveSession, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));

  const body = await callTargets({
    params: { id: lessonId },
    user: { _id: teacherId, role: "teacher" },
    schoolId,
  });

  // A lesson filed before academicYear existed reads its year off its class.
  assert.equal(body.data.lesson.academicYear, "2025-2026");
  assert.deepEqual(body.data.academicYears, ["2026-2027", "2025-2026"]);
  assert.equal(body.data.canMove, true);
  const current = body.data.targets.find((target) => target.isCurrentClass);
  const nextYear = body.data.targets.find((target) => target.academicYear === "2026-2027");
  assert.equal(String(current._id), oldClassId);
  assert.equal(current.subjectCleared, false);
  assert.equal(nextYear.subjectCleared, true);
});

test("the picker says a lesson cannot move while a session is open", async (t) => {
  t.mock.method(LiveLesson, "findOne", async () => lessonDoc());
  stubTeacherClasses(t, [freshNextYearClass]);
  t.mock.method(LiveSession, "findOne", () => ({
    select: () => ({ lean: async () => ({ _id: oid("18"), status: "waiting" }) }),
  }));

  const body = await callTargets({
    params: { id: lessonId },
    user: { _id: teacherId, role: "teacher" },
    schoolId,
  });
  assert.equal(body.data.canMove, false);
  assert.equal(body.data.blockingSessionStatus, "waiting");
});

test("a teacher with no assigned class gets no picker", async (t) => {
  t.mock.method(LiveLesson, "findOne", async () => lessonDoc());
  t.mock.method(Teacher, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));

  const body = await callTargets({
    params: { id: lessonId },
    user: { _id: teacherId, role: "teacher" },
    schoolId,
  });
  assert.equal(body.success, false);
  assert.equal(body.message, "You are not assigned to any class.");
});
