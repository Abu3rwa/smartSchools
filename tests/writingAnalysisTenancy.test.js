import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import WritingAnalysis from "../models/WritingAnalysis.js";
import Teacher from "../models/Teacher.js";
import Class from "../models/Class.js";
import {
  getAnalysis,
  listAnalyses,
  publishAnalysis,
  updateAnalysis,
} from "../services/writingAnalysisService.js";

/*
 * J1 for Writing Analysis: a run is visible only inside its school, and only to
 * an admin, the class teacher, or a teacher assigned to that class subject.
 */

const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const otherSchoolId = oid();
const userId = oid();
const teacherId = oid();
const strangerTeacherId = oid();
const classId = oid();
const subjectId = oid();
const analysisId = oid();

const chain = (value) => {
  const query = {
    select: () => query,
    populate: () => query,
    sort: () => query,
    limit: () => query,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const stub = (target, key, replacement) => {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
};

const withStubs = async (stubs, run) => {
  const restores = stubs.map(([target, key, replacement]) =>
    stub(target, key, replacement),
  );
  try {
    await run();
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
};

const analysisDoc = (overrides = {}) => ({
  _id: analysisId,
  school: schoolId,
  class: classId,
  subject: subjectId,
  status: "done",
  publish: { state: "not_published" },
  ...overrides,
});

const forbidden = (pattern) => (error) => {
  assert.equal(error.statusCode, 403, error.message);
  if (pattern) assert.match(error.message, pattern);
  return true;
};

const missing = (error) => {
  assert.equal(error.statusCode, 404, error.message);
  return true;
};

const classDoc = (overrides = {}) => ({
  _id: classId,
  subjects: [],
  classTeacher: null,
  ...overrides,
});

test("another school's analysis is missing, not forbidden", async () => {
  await withStubs(
    [[WritingAnalysis, "findOne", () => chain(null)]],
    () =>
      assert.rejects(
        getAnalysis({ schoolId: otherSchoolId, analysisId, userId }),
        missing,
      ),
  );
});

test("a teacher outside the class cannot read the analysis", async () => {
  await withStubs(
    [
      [WritingAnalysis, "findOne", () => chain(analysisDoc())],
      [Teacher, "findOne", () => chain({ _id: strangerTeacherId })],
      [Class, "findOne", () => chain(classDoc())],
    ],
    () =>
      assert.rejects(
        getAnalysis({ schoolId, analysisId, userId }),
        forbidden(/do not teach this class/),
      ),
  );
});

test("a user without a teacher profile cannot read the analysis", async () => {
  await withStubs(
    [
      [WritingAnalysis, "findOne", () => chain(analysisDoc())],
      [Teacher, "findOne", () => chain(null)],
      [Class, "findOne", () => chain(classDoc())],
    ],
    () =>
      assert.rejects(
        getAnalysis({ schoolId, analysisId, userId }),
        forbidden(/teacher or an admin/),
      ),
  );
});

test("the class teacher reads their own class analysis", async () => {
  await withStubs(
    [
      [WritingAnalysis, "findOne", () => chain(analysisDoc())],
      [Teacher, "findOne", () => chain({ _id: teacherId })],
      [Class, "findOne", () => chain(classDoc({ classTeacher: teacherId }))],
    ],
    async () => {
      const result = await getAnalysis({ schoolId, analysisId, userId });
      assert.equal(result._id, analysisId);
      assert.equal(result.enabled, true);
    },
  );
});

test("an admin reads it without a class membership", async () => {
  await withStubs([[WritingAnalysis, "findOne", () => chain(analysisDoc())]], async () => {
    const result = await getAnalysis({
      schoolId,
      analysisId,
      userId,
      isAdmin: true,
    });
    assert.equal(result._id, analysisId);
  });
});

test("editing an analysis needs the subject assignment, not just the school", async () => {
  await withStubs(
    [
      [WritingAnalysis, "findOne", () => chain(analysisDoc())],
      [Teacher, "findOne", () => chain({ _id: teacherId })],
      [Class, "findById", () => chain(classDoc({ classTeacher: strangerTeacherId }))],
    ],
    () =>
      assert.rejects(
        updateAnalysis({
          schoolId,
          analysisId,
          userId,
          edits: { standards: [{ standard: "RL.5.1", teacherLevel: 3 }] },
        }),
        forbidden(/assigned to teach this subject/),
      ),
  );
});

test("publishing another teacher's subject analysis is refused", async () => {
  await withStubs(
    [
      [WritingAnalysis, "findOne", () => chain(analysisDoc())],
      [Teacher, "findOne", () => chain({ _id: strangerTeacherId })],
      [Class, "findById", () => chain(classDoc())],
    ],
    () =>
      assert.rejects(
        publishAnalysis({ schoolId, analysisId, userId }),
        forbidden(/assigned to teach this subject/),
      ),
  );
});

test("a non-admin's analysis list is filtered to their own runs", async () => {
  const filters = [];
  await withStubs(
    [
      [Teacher, "findOne", () => chain({ _id: teacherId })],
      [
        WritingAnalysis,
        "find",
        (filter) => {
          filters.push(filter);
          return chain([]);
        },
      ],
    ],
    async () => {
      // No class filter here: this test is about whose runs are listed.
      await listAnalyses({ schoolId, studentId: oid(), userId });
      await listAnalyses({ schoolId, studentId: oid(), userId, isAdmin: true });
    },
  );

  assert.equal(String(filters[0].school), schoolId);
  assert.equal(String(filters[0].runBy), userId);
  assert.equal(filters[1].runBy, undefined, "an admin sees every run");
});
