import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import Class from "../models/Class.js";
import LiveGroup from "../models/LiveGroup.js";
import LiveLesson from "../models/LiveLesson.js";
import Student from "../models/Student.js";
import {
  createLiveGroup,
  deleteLiveGroup,
  listLiveGroups,
  updateLiveGroup,
} from "../controllers/liveLessonGroupController.js";

const schoolId = new mongoose.Types.ObjectId();
const classId = new mongoose.Types.ObjectId();
const groupId = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();
const otherStudentId = new mongoose.Types.ObjectId();
const admin = { _id: new mongoose.Types.ObjectId(), role: "admin", school: schoolId };

// A mongoose query reads both as a promise and as a chain, so the doubles have to as well.
const chain = (value) => ({
  select: () => chain(value),
  sort: () => chain(value),
  populate: () => chain(value),
  lean: async () => value,
  then: (resolve) => resolve(value),
});

// asyncHandler answers the response out of band, so the payload arrives through res.json.
const run = (handler, { params = {}, query = {}, body = {} } = {}) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve(payload);
        return this;
      },
    };
    handler({ user: admin, schoolId, params, query, body }, res, (error) => {
      reject(error || new Error("The handler answered without a response body."));
    });
  });

test("the group list carries the groups and the class roster the panel needs", async (t) => {
  t.mock.method(Class, "findOne", () => chain({ _id: classId }));
  t.mock.method(LiveGroup, "find", () =>
    chain([{ _id: groupId, name: "Needs support", order: 1, studentIds: [studentId] }]));
  t.mock.method(Student, "find", () => chain([
    { _id: new mongoose.Types.ObjectId(), user: { _id: studentId }, firstName: "Amina", lastName: "Ali" },
    { _id: new mongoose.Types.ObjectId(), user: { _id: otherStudentId }, firstName: "Yusuf", lastName: "Noor" },
  ]));

  const result = await run(listLiveGroups, { query: { classId: String(classId) } });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.groups, [{
    _id: String(groupId),
    name: "Needs support",
    order: 1,
    studentIds: [String(studentId)],
  }]);
  assert.deepEqual(result.data.students, [
    { id: String(studentId), name: "Amina Ali" },
    { id: String(otherStudentId), name: "Yusuf Noor" },
  ]);
});

test("a staff member outside the class cannot reach its groups", async (t) => {
  t.mock.method(Class, "findOne", () => chain(null));
  const result = await run(listLiveGroups, { query: { classId: String(classId) } });
  assert.equal(result.success, false);
  assert.match(result.message, /not authorized/i);
});

test("creating a group needs a free name and students who are not already grouped", async (t) => {
  t.mock.method(Class, "findOne", () => chain({ _id: classId }));

  t.mock.method(LiveGroup, "exists", async () => true);
  assert.equal(
    (await run(createLiveGroup, { body: { classId, name: "Needs support" } })).success,
    false,
  );

  t.mock.method(LiveGroup, "exists", async () => false);
  t.mock.method(Student, "find", () => chain([{ user: studentId }]));
  const unenrolled = await run(createLiveGroup, {
    body: { classId, name: "Needs support", studentIds: [String(otherStudentId)] },
  });
  assert.equal(unenrolled.success, false);
  assert.match(unenrolled.message, /enrolled in this class/i);

  t.mock.method(Student, "find", () => chain([{ user: studentId }, { user: otherStudentId }]));
  t.mock.method(LiveGroup, "find", () =>
    chain([{ name: "Ready to stretch", studentIds: [otherStudentId] }]));
  const taken = await run(createLiveGroup, {
    body: { classId, name: "Needs support", studentIds: [String(otherStudentId)] },
  });
  assert.equal(taken.success, false);
  assert.match(taken.message, /already in Ready to stretch/i);
});

test("a new group lands after the highest order the class already uses", async (t) => {
  t.mock.method(Class, "findOne", () => chain({ _id: classId }));
  t.mock.method(LiveGroup, "exists", async () => false);
  t.mock.method(LiveGroup, "findOne", () => chain({ order: 4 }));
  t.mock.method(LiveGroup, "find", () => chain([]));
  let created = null;
  t.mock.method(LiveGroup, "create", async (values) => {
    created = values;
    return { ...values, _id: groupId };
  });

  const result = await run(createLiveGroup, { body: { classId, name: "Needs support" } });
  assert.equal(result.success, true);
  assert.equal(created.order, 5);
  assert.equal(String(created.school), String(schoolId));
  assert.equal(String(created.classId), String(classId));
});

test("renaming a group keeps one name per class and refuses another class's group", async (t) => {
  const group = {
    _id: groupId,
    classId,
    name: "Needs support",
    studentIds: [],
    order: 1,
    save: async () => {},
  };
  t.mock.method(LiveGroup, "findOne", async () => group);
  t.mock.method(Class, "findOne", () => chain({ _id: classId }));
  t.mock.method(LiveGroup, "exists", async () => true);
  const clash = await run(updateLiveGroup, { params: { groupId }, body: { name: "Ready to stretch" } });
  assert.equal(clash.success, false);
  assert.match(clash.message, /already has a group/i);

  t.mock.method(LiveGroup, "exists", async () => false);
  const renamed = await run(updateLiveGroup, { params: { groupId }, body: { name: "Support" } });
  assert.equal(renamed.success, true);
  assert.equal(renamed.data.group.name, "Support");

  t.mock.method(Class, "findOne", () => chain(null));
  const denied = await run(updateLiveGroup, { params: { groupId }, body: { name: "Again" } });
  assert.equal(denied.success, false);
  assert.match(denied.message, /not authorized/i);
});

test("a group a lesson still sends questions to cannot be deleted", async (t) => {
  let deleted = false;
  const group = {
    _id: groupId,
    classId,
    name: "Needs support",
    studentIds: [],
    deleteOne: async () => {
      deleted = true;
    },
  };
  t.mock.method(LiveGroup, "findOne", async () => group);
  t.mock.method(Class, "findOne", () => chain({ _id: classId }));
  t.mock.method(LiveLesson, "findOne", () => chain({ title: "Figurative Language" }));

  const blocked = await run(deleteLiveGroup, { params: { groupId } });
  assert.equal(blocked.success, false);
  assert.match(blocked.message, /Figurative Language/);
  assert.equal(deleted, false);

  t.mock.method(LiveLesson, "findOne", () => chain(null));
  assert.equal((await run(deleteLiveGroup, { params: { groupId } })).success, true);
  assert.equal(deleted, true);
});
