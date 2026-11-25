import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Teacher from '../models/Teacher.js';
import Class from '../models/Class.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import Student from '../models/Student.js';
import {
  assertGradesEditable,
  getLibraryCapabilities,
} from '../services/spellingLibraryAccessService.js';

const chain = (value) => ({
  select() {
    return this;
  },
  lean: async () => value,
});

const mockTeacherScope = ({ t, schoolId, grades, classId = null }) => {
  const teacherId = new mongoose.Types.ObjectId();
  t.mock.method(Teacher, "findOne", () => ({
    _id: teacherId,
    user: new mongoose.Types.ObjectId(),
    school: schoolId,
    assignedClasses: [],
  }));
  t.mock.method(Teacher, "findById", () => chain({ assignedClasses: [] }));
  t.mock.method(Class, "find", () => ({
    distinct: async () => (classId ? [classId] : []),
  }));
  t.mock.method(TeacherPeriodAssignment, "find", () => ({
    distinct: async () => [],
  }));
  t.mock.method(Student, "find", () =>
    chain(grades.map((grade) => ({ spelling: { currentGrade: grade } }))),
  );
};

test("an acting admin gets every grade without reading teacher scope", async (t) => {
  const readScope = () => {
    throw new Error("Admin capabilities must not resolve teacher scope");
  };
  t.mock.method(Teacher, "findOne", readScope);
  t.mock.method(Student, "find", readScope);

  for (const role of ["admin", "super_admin"]) {
    const capabilities = await getLibraryCapabilities({
      schoolId: new mongoose.Types.ObjectId(),
      user: { _id: new mongoose.Types.ObjectId(), roles: ["teacher"] },
      role,
    });
    assert.equal(capabilities.canEdit, true);
    assert.equal(capabilities.canEditAllGrades, true);
    assert.deepEqual(capabilities.grades, ["KG", "G1", "G2", "G3", "G4", "G5"]);
    assert.equal(capabilities.reasonCode, null);
  }
});

test("a department principal cannot edit the library", async () => {
  const capabilities = await getLibraryCapabilities({
    schoolId: new mongoose.Types.ObjectId(),
    user: { _id: new mongoose.Types.ObjectId() },
    role: "department_principal",
  });

  assert.equal(capabilities.canEdit, false);
  assert.equal(capabilities.canEditAllGrades, false);
  assert.equal(capabilities.reasonCode, "ROLE_FORBIDDEN");
});

test("a dual-role account acting as teacher gets only placed spelling grades", async (t) => {
  const schoolId = new mongoose.Types.ObjectId();
  mockTeacherScope({
    t,
    schoolId,
    grades: ["G3", "not-a-grade", "G3"],
    classId: new mongoose.Types.ObjectId(),
  });

  const capabilities = await getLibraryCapabilities({
    schoolId,
    user: {
      _id: new mongoose.Types.ObjectId(),
      roles: ["admin", "super_admin", "teacher"],
    },
    role: "teacher",
  });

  assert.equal(capabilities.canEdit, true);
  assert.equal(capabilities.canEditAllGrades, false);
  assert.deepEqual(capabilities.grades, ["G3"]);
});

test("a teacher from another school has no library scope", async (t) => {
  const schoolId = new mongoose.Types.ObjectId();
  t.mock.method(Teacher, "findOne", () => ({
    _id: new mongoose.Types.ObjectId(),
    school: new mongoose.Types.ObjectId(),
  }));

  const capabilities = await getLibraryCapabilities({
    schoolId,
    user: { _id: new mongoose.Types.ObjectId() },
    role: "teacher",
  });

  assert.deepEqual(capabilities.grades, []);
  assert.equal(capabilities.reasonCode, "SCOPE_FORBIDDEN");
});

test("a teacher with no placed students cannot edit any grade", async (t) => {
  const schoolId = new mongoose.Types.ObjectId();
  mockTeacherScope({ t, schoolId, grades: [] });

  const capabilities = await getLibraryCapabilities({
    schoolId,
    user: { _id: new mongoose.Types.ObjectId() },
    role: "teacher",
  });
  assert.equal(capabilities.canEdit, false);

  await assert.rejects(
    () =>
      assertGradesEditable({
        schoolId,
        user: { _id: new mongoose.Types.ObjectId() },
        role: "teacher",
        grades: ["G3"],
      }),
    (error) => error.code === "SCOPE_FORBIDDEN" && error.statusCode === 403,
  );
});

test("every affected grade must be inside the teacher's scope", async (t) => {
  const schoolId = new mongoose.Types.ObjectId();
  mockTeacherScope({
    t,
    schoolId,
    grades: ["G3"],
    classId: new mongoose.Types.ObjectId(),
  });
  const user = { _id: new mongoose.Types.ObjectId(), roles: ["admin"] };

  await assert.rejects(
    () =>
      assertGradesEditable({
        schoolId,
        user,
        role: "teacher",
        grades: ["G3", "G4"],
      }),
    (error) =>
      error.code === "SCOPE_FORBIDDEN" &&
      error.details?.length === 1 &&
      error.details[0].grade === "G4",
  );

  const allowed = await assertGradesEditable({
    schoolId,
    user,
    role: "teacher",
    grades: ["G3"],
  });
  assert.deepEqual(allowed.grades, ["G3"]);
});
