import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDepartmentScope,
  canAccessStaffClass,
  staffClassQuery,
} from "../helpers/liveLessonAccess.js";
import Class from "../models/Class.js";
import Teacher from "../models/Teacher.js";

const classId = "507f1f77bcf86cd799439011";
const schoolId = "507f1f77bcf86cd799439012";
const departmentId = "507f1f77bcf86cd799439013";

test("department principals keep the documented school-wide mode only when they own no department", () => {
  const scoped = {};
  assert.deepEqual(
    applyDepartmentScope(scoped, { role: "department_principal", department: departmentId }),
    { scoped: true, wholeSchool: false },
  );
  assert.equal(scoped.department, departmentId);

  const widened = {};
  assert.deepEqual(
    applyDepartmentScope(widened, { role: "department_principal", department: null }),
    { scoped: false, wholeSchool: true },
  );
  assert.equal("department" in widened, false);

  const strict = {};
  assert.deepEqual(
    applyDepartmentScope(strict, { role: "department_principal", department: null }, { denyWithoutDepartment: true }),
    { scoped: false, wholeSchool: false, denied: true },
  );
});

test("staff class queries scope each role and refuse everyone else", async (t) => {
  t.mock.method(Teacher, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "teacher-doc" }) }) }));

  const admin = await staffClassQuery({ _id: "u1", role: "admin" }, schoolId, classId);
  assert.deepEqual(admin.query, { _id: classId, school: schoolId, isActive: { $ne: false } });
  assert.equal(admin.scope, undefined);

  const principal = await staffClassQuery(
    { _id: "u2", role: "department_principal", department: departmentId },
    schoolId,
    classId,
  );
  assert.equal(principal.query.department, departmentId);

  const schoolWide = await staffClassQuery(
    { _id: "u3", role: "department_principal", department: null },
    schoolId,
    classId,
  );
  assert.equal(schoolWide.scope.wholeSchool, true);

  const teacher = await staffClassQuery({ _id: "u4", role: "teacher" }, schoolId, classId);
  assert.deepEqual(teacher.query.$or, [
    { classTeacher: "teacher-doc" },
    { "subjects.teacher": "teacher-doc" },
  ]);

  assert.equal(await staffClassQuery({ _id: "u5", role: "student" }, schoolId, classId), null);
});

test("teachers without a profile cannot reach a live class", async (t) => {
  t.mock.method(Teacher, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
  assert.equal(
    await staffClassQuery({ _id: "u6", role: "teacher" }, schoolId, classId, { requireActiveTeacher: true }),
    null,
  );
});

test("class lookups never leave the tenant", async (t) => {
  let filter;
  t.mock.method(Class, "findOne", (value) => {
    filter = value;
    return { then: (resolve) => resolve(null) };
  });
  assert.equal(await canAccessStaffClass({ _id: "u7", role: "admin" }, schoolId, classId), null);
  assert.equal(filter.school, schoolId);
  assert.equal(filter._id, classId);
});
