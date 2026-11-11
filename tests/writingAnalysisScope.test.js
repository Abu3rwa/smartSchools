import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Class from "../models/Class.js";
import School from "../models/School.js";
import Standard from "../models/Standard.js";
import Student from "../models/Student.js";
import WritingAnalysis from "../models/WritingAnalysis.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingProject from "../models/WritingProject.js";
import StandardsGradebookEntry from "../models/StandardsGradebookEntry.js";
import StandardAssignment from "../models/StandardAssignment.js";
import AiCreditSetting from "../models/AiCreditSetting.js";
import {
  createAnalysis,
  getAnalysisScope,
  getPublishPreview,
} from "../services/writingAnalysisService.js";
import { ANALYSIS_LIMITS } from "../services/writingAnalysisLogic.js";

const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const userId = oid();
const classId = oid();
const studentId = oid();
const subjectId = oid();
const standardId = oid();
const projectId = oid();
const draftId = oid();
const analysisId = oid();

const chain = (value) => {
  const query = {
    select: () => query,
    populate: () => query,
    sort: () => query,
    limit: () => query,
    lean: async () => value,
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
  const restores = stubs.map(([target, key, value]) => stub(target, key, value));
  try {
    await run();
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
};

const classDoc = () => ({
  _id: classId,
  grade: 6,
  academicYear: "2025-2026",
  classTeacher: null,
  subjects: [{ subject: { _id: subjectId, name: "English" }, teacher: userId }],
});

const studentDoc = () => ({ _id: studentId, firstName: "Sara", lastName: "Ali" });

const standardDoc = () => ({
  _id: standardId,
  code: "W1",
  name: "Organisation",
  description: "Orders ideas into paragraphs.",
  category: "Structure",
  gradeLevel: 6,
});

const projectDoc = () => ({
  _id: projectId,
  student: studentId,
  class: classId,
  academicYear: "2025-2026",
  assignment: { _id: oid(), title: "My holiday", writingType: "narrative" },
});

const draftDoc = () => ({
  _id: draftId,
  project: projectId,
  number: 1,
  totalWords: 120,
  submittedAt: new Date(Date.UTC(2026, 0, 5, 9)).toISOString(),
  submissionSource: "student",
  sections: [{ title: "", paragraphs: [{ text: "We planted the seeds." }] }],
});

const scopeStubs = ({
  enrolled = studentDoc(),
  projects = [],
  drafts = [],
  standards = [standardDoc()],
} = {}) => [
  [Class, "findOne", () => chain(classDoc())],
  [Student, "findOne", () => chain(enrolled)],
  [Standard, "find", () => chain(standards)],
  [WritingProject, "find", () => chain(projects)],
  [WritingDraft, "find", () => chain(drafts)],
  [StandardAssignment, "distinct", async () => [standardId]],
  [WritingAnalysis, "find", () => chain([])],
  [School, "findOne", () => chain({ reportSettings: { defaultLanguage: "English" } })],
  [AiCreditSetting, "findOne", () => chain(null)],
];

test("the workspace needs a class and a student", async () => {
  await assert.rejects(
    getAnalysisScope({ schoolId, userId, isAdmin: true }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /Choose a class and a student/);
      return true;
    },
  );
});

test("a student who is not in the class is refused", async () => {
  await withStubs(scopeStubs({ enrolled: null }), async () => {
    await assert.rejects(
      getAnalysisScope({ schoolId, classId, studentId, userId, isAdmin: true }),
      (error) => {
        assert.equal(error.statusCode, 404);
        assert.match(error.message, /not in this class/);
        return true;
      },
    );
  });
});

test("the workspace resolves the subject, its standards and the assigned defaults", async () => {
  await withStubs(scopeStubs(), async () => {
    const scope = await getAnalysisScope({
      schoolId,
      classId,
      studentId,
      userId,
      isAdmin: true,
    });
    assert.equal(scope.student.name, "Sara Ali");
    assert.equal(String(scope.subject._id), subjectId);
    assert.deepEqual(scope.subjects.map((row) => row.name), ["English"]);
    assert.deepEqual(scope.standards.map((row) => row.code), ["W1"]);
    assert.deepEqual(scope.assignedStandardIds, [standardId]);
    assert.deepEqual(scope.pieces, []);
    assert.equal(scope.defaultStandardCount, ANALYSIS_LIMITS.defaultStandards);
    assert.equal(scope.pieceCap, 24);
    assert.equal(scope.estimate.pieces, 0);
  });
});

test("a chosen piece must belong to the window", async () => {
  await withStubs(scopeStubs({ projects: [projectDoc()], drafts: [draftDoc()] }), async () => {
    const common = {
      schoolId,
      classId,
      studentId,
      userId,
      isAdmin: true,
      standardIds: [standardId],
    };
    await assert.rejects(
      createAnalysis({ ...common, draftIds: [oid()] }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /not part of this window/);
        return true;
      },
    );
    await assert.rejects(createAnalysis({ ...common, draftIds: [] }), (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /at least one piece/);
      return true;
    });
  });
});

test("a run is not capped at the number of standards it pre-ticks", async () => {
  const extraIds = Array.from({ length: 20 }, oid);
  const extraStandards = extraIds.map((id) => ({ ...standardDoc(), _id: id }));
  await withStubs(
    scopeStubs({
      projects: [projectDoc()],
      drafts: [draftDoc()],
      standards: [standardDoc(), ...extraStandards],
    }),
    async () => {
      await assert.rejects(
        createAnalysis({
          schoolId,
          classId,
          studentId,
          userId,
          isAdmin: true,
          standardIds: [standardId, ...extraIds],
          draftIds: [oid()],
        }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(
            error.message,
            /not part of this window/,
            "21 standards must pass the standards check",
          );
          return true;
        },
      );
    },
  );
});

test("the estimate is priced for the chosen pieces only", async () => {
  const otherProjectId = oid();
  const otherDraftId = oid();
  const stubs = scopeStubs({
    projects: [projectDoc(), { ...projectDoc(), _id: otherProjectId }],
    drafts: [
      draftDoc(),
      { ...draftDoc(), _id: otherDraftId, project: otherProjectId, totalWords: 400 },
    ],
  });
  await withStubs(stubs, async () => {
    const common = { schoolId, classId, studentId, userId, isAdmin: true };
    const all = await getAnalysisScope(common);
    const one = await getAnalysisScope({ ...common, draftIds: draftId });
    assert.equal(all.estimate.pieces, 2);
    assert.equal(one.estimate.pieces, 1);
    assert.ok(one.estimate.totalTokens < all.estimate.totalTokens);
  });
});

const analysisDoc = () => ({
  _id: analysisId,
  student: studentId,
  class: classId,
  subject: subjectId,
  academicYear: "2025-2026",
  status: "done",
  publish: { state: "draft" },
  standards: [
    { standard: standardId, code: "W1", name: "Organisation", teacherLevel: 3 },
    { standard: oid(), code: "W2", name: "Sentences", teacherLevel: null },
  ],
});

test("the publish preview separates replacements from columns that do not exist", async () => {
  const stubs = [
    [WritingAnalysis, "findOne", () => chain(analysisDoc())],
    [StandardsGradebookEntry, "findOne", () => chain({ _id: oid(), manualScore: 2 })],
  ];
  await withStubs(stubs, async () => {
    const preview = await getPublishPreview({
      schoolId,
      analysisId,
      userId,
      isAdmin: true,
    });
    assert.equal(preview.targets, 1);
    assert.equal(preview.ready, 1);
    assert.equal(preview.replace.length, 1);
    assert.equal(preview.replace[0].previousManualScore, 2);
    assert.equal(preview.replace[0].manualScore, 3);
    assert.deepEqual(preview.missingColumns, []);
  });
});

test("a standard with no gradebook column is reported, not published silently", async () => {
  const stubs = [
    [WritingAnalysis, "findOne", () => chain(analysisDoc())],
    [StandardsGradebookEntry, "findOne", () => chain(null)],
    [StandardAssignment, "exists", async () => false],
  ];
  await withStubs(stubs, async () => {
    const preview = await getPublishPreview({
      schoolId,
      analysisId,
      userId,
      isAdmin: true,
    });
    assert.equal(preview.ready, 0);
    assert.deepEqual(preview.replace, []);
    assert.equal(preview.missingColumns.length, 1);
    assert.equal(preview.missingColumns[0].manualScore, 3);
  });
});
