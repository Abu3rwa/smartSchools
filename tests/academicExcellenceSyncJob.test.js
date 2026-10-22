import test from "node:test";
import assert from "node:assert/strict";
import School from "../models/School.js";
import Student from "../models/Student.js";
import { syncObjectivesForGrade } from "../jobs/academicExcellenceSyncJob.js";

test("grade-triggered objective sync passes the school document to the mastery service", async (t) => {
  const school = { _id: "school-1" };
  const findSchool = t.mock.method(School, "findById", () => ({
    lean: async () => school,
  }));
  t.mock.method(Student, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));

  const result = await syncObjectivesForGrade({
    schoolId: school._id,
    studentId: "student-1",
    subjectId: "subject-1",
    classId: "class-1",
    academicYear: "2026-2027",
  });

  assert.equal(findSchool.mock.calls.length, 1);
  assert.equal(findSchool.mock.calls[0].arguments[0], school._id);
  assert.deepEqual(result, { synced: 0, objectives: [] });
});
