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
import Teacher from "../models/Teacher.js";
import {
  createAnalysis,
  getAnalysisScope,
  getPublishPreview,
  listAnalyses,
  publishAnalysis,
  runAnalysis,
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
    session: () => query,
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
  // The service selects each project's final draft in the database; the stub
  // hands back one grouped row per draft, which is the same shape.
  [WritingDraft, "aggregate", async () => drafts.map((draft) => ({ _id: draft.project, draft }))],
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
  const assignmentId = oid();
  const entryFilters = [];
  const stubs = [
    [WritingAnalysis, "findOne", () => chain(analysisDoc())],
    [
      StandardAssignment,
      "find",
      () => chain([{ _id: assignmentId, standard: standardId }]),
    ],
    [
      StandardsGradebookEntry,
      "find",
      (filter) => {
        entryFilters.push(filter);
        return chain([
          {
            _id: oid(),
            assignment: assignmentId,
            manualScore: 2,
            semester: 1,
          },
        ]);
      },
    ],
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
    // The gradebook enforces school + assignment + student. Looking a row up by
    // the current semester is what missed saved scores and collided on create.
    assert.equal(entryFilters.length, 1);
    assert.equal(entryFilters[0].assignment.$in.length, 1);
    assert.equal(entryFilters[0].semester, undefined);
    assert.equal(entryFilters[0].student, studentId);
  });
});

test("a standard with no gradebook column is reported, not published silently", async () => {
  const stubs = [
    [WritingAnalysis, "findOne", () => chain(analysisDoc())],
    [StandardAssignment, "find", () => chain([])],
    [StandardsGradebookEntry, "find", () => chain([])],
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

/* ------------------------------------------------------------------ */
/* A retry spends the owning teacher's credit. It must pass the same    */
/* visibility check as every read, before it claims anything.           */
/* ------------------------------------------------------------------ */

const outsiderTeacherId = oid();

// A retry needs at least one failed piece, and an empty selection so the run
// finalizes immediately instead of starting background AI work.
const retryAnalysisDoc = () => ({
  ...analysisDoc(),
  status: "failed",
  draftSelection: [],
  pieceRuns: [{ draft: draftId, aiStatus: "failed" }],
});

const retryStubs = ({ teachesClass, onClaim }) => [
  // getTeacherProfile awaits the query directly, so this must be a plain
  // promise, not the chainable lean() stub the reads use.
  [Teacher, "findOne", async () => ({ _id: outsiderTeacherId })],
  [
    Class,
    "findOne",
    () =>
      chain({
        _id: classId,
        classTeacher: teachesClass ? outsiderTeacherId : null,
        subjects: teachesClass
          ? [{ subject: subjectId, teacher: outsiderTeacherId }]
          : [{ subject: subjectId, teacher: oid() }],
      }),
  ],
  [WritingAnalysis, "findOne", () => chain(retryAnalysisDoc())],
  [WritingAnalysis, "findById", () => chain(null)],
  [
    WritingAnalysis,
    "findOneAndUpdate",
    () => {
      onClaim();
      return chain(retryAnalysisDoc());
    },
  ],
];

test("a teacher who does not teach the class cannot retry the analysis", async () => {
  let claimed = false;
  await withStubs(
    retryStubs({ teachesClass: false, onClaim: () => { claimed = true; } }),
    async () => {
      await assert.rejects(
        runAnalysis({ schoolId, analysisId, userId, onlyFailed: true }),
        (error) => {
          assert.equal(error.statusCode, 403);
          assert.match(error.message, /do not teach this class/);
          return true;
        },
      );
    },
  );
  assert.equal(
    claimed,
    false,
    "the run must be refused before any claim is written",
  );
});

test("an admin may retry an analysis in a class they do not teach", async () => {
  let claimed = false;
  await withStubs(
    retryStubs({ teachesClass: false, onClaim: () => { claimed = true; } }),
    async () => {
      await runAnalysis({
        schoolId,
        analysisId,
        userId,
        isAdmin: true,
        onlyFailed: true,
      });
    },
  );
  assert.equal(claimed, true, "an admin must reach the claim");
});

test("the owning teacher may retry their own analysis", async () => {
  let claimed = false;
  await withStubs(
    retryStubs({ teachesClass: true, onClaim: () => { claimed = true; } }),
    async () => {
      await runAnalysis({ schoolId, analysisId, userId, onlyFailed: true });
    },
  );
  assert.equal(claimed, true, "the class teacher must reach the claim");
});

/* ------------------------------------------------------------------ */
/* What a teacher may quote and list                                    */
/* ------------------------------------------------------------------ */

test("a teacher can only analyse drafts from tasks they set", async () => {
  const teacherId = oid();
  const mine = {
    ...projectDoc(),
    assignment: {
      _id: oid(),
      title: "Mine",
      writingType: "essay",
      assignedBy: userId,
    },
  };
  const theirs = {
    ...projectDoc(),
    _id: oid(),
    assignment: {
      _id: oid(),
      title: "Theirs",
      writingType: "essay",
      assignedBy: oid(),
    },
  };
  const mineDraft = { ...draftDoc(), _id: oid() };
  const theirDraft = { ...draftDoc(), _id: oid(), project: theirs._id };
  const ownedClass = {
    ...classDoc(),
    classTeacher: teacherId,
    subjects: [{ subject: { _id: subjectId, name: "English" }, teacher: teacherId }],
  };
  const stubs = [
    [Class, "findOne", () => chain(ownedClass)],
    [Student, "findOne", () => chain(studentDoc())],
    [Standard, "find", () => chain([standardDoc()])],
    [WritingProject, "find", () => chain([mine, theirs])],
    [WritingDraft, "find", () => chain([mineDraft, theirDraft])],
    [WritingDraft, "aggregate", async () =>
      [mineDraft, theirDraft].map((draft) => ({ _id: draft.project, draft }))],
    [StandardAssignment, "distinct", async () => [standardId]],
    [WritingAnalysis, "find", () => chain([])],
    [School, "findOne", () => chain({ reportSettings: { defaultLanguage: "English" } })],
    [AiCreditSetting, "findOne", () => chain(null)],
    [Teacher, "findOne", async () => ({ _id: teacherId })],
  ];
  await withStubs(stubs, async () => {
    const teacherScope = await getAnalysisScope({
      schoolId,
      classId,
      studentId,
      userId,
      isAdmin: false,
    });
    assert.deepEqual(
      teacherScope.pieces.map((row) => String(row.draft)),
      [String(mineDraft._id)],
      "another teacher's task must not be quotable",
    );

    const adminScope = await getAnalysisScope({
      schoolId,
      classId,
      studentId,
      userId,
      isAdmin: true,
    });
    assert.equal(adminScope.pieces.length, 2, "an admin still sees the class");
  });
});

test("a teacher lists only the analyses they ran", async () => {
  const filters = [];
  const stubs = [
    [
      WritingAnalysis,
      "find",
      (filter) => {
        filters.push(filter);
        return chain([]);
      },
    ],
  ];
  await withStubs(stubs, async () => {
    await listAnalyses({ schoolId, studentId, userId, isAdmin: false });
    await listAnalyses({ schoolId, studentId, userId, isAdmin: true });
  });
  assert.equal(String(filters[0].runBy), String(userId));
  assert.equal(String(filters[0].student), String(studentId));
  assert.equal("runBy" in filters[1], false);
});

/* ------------------------------------------------------------------ */
/* Publishing writes the row the gradebook already has                  */
/* ------------------------------------------------------------------ */

test("publish updates the saved entry by assignment and records the grades together", async () => {
  const assignmentId = oid();
  const entryId = oid();
  const analysisUpdates = [];
  const entryUpdates = [];
  const claimFilters = [];
  const session = {
    withTransaction: async (run) => run(),
    endSession: async () => {},
  };
  const stubs = [
    [mongoose, "startSession", async () => session],
    [WritingAnalysis, "findOne", () => chain(analysisDoc())],
    [
      WritingAnalysis,
      "findOneAndUpdate",
      (filter) => {
        claimFilters.push(filter);
        return chain(analysisDoc());
      },
    ],
    [WritingAnalysis, "updateOne", async (filter, update) => {
      analysisUpdates.push({ filter, update });
    }],
    [Class, "findOne", () => chain(classDoc())],
    [
      StandardAssignment,
      "find",
      () => chain([{ _id: assignmentId, standard: standardId }]),
    ],
    [
      StandardsGradebookEntry,
      "find",
      () =>
        chain([
          { _id: entryId, assignment: assignmentId, manualScore: 2, semester: 1 },
        ]),
    ],
    [
      StandardsGradebookEntry,
      "updateOne",
      async (filter, update) => {
        entryUpdates.push({ filter, update });
      },
    ],
    [
      StandardsGradebookEntry,
      "create",
      async () => {
        throw new Error("an existing entry must be updated, never created");
      },
    ],
    [Standard, "find", () => chain([standardDoc()])],
  ];
  await withStubs(stubs, async () => {
    const result = await publishAnalysis({
      schoolId,
      analysisId,
      userId,
      isAdmin: true,
      confirmOverwrite: true,
    });
    assert.equal(result.grades.length, 1);
    assert.equal(String(result.grades[0].entry), entryId);
  });
  assert.equal(claimFilters[0]["publish.state"].$ne, "published");
  assert.equal(entryUpdates.length, 1);
  assert.equal(entryUpdates[0].update.$set.manualScore, 3);
  assert.equal(entryUpdates[0].update.$set.isManualEntry, true);
  assert.deepEqual(
    analysisUpdates.map((row) => Object.keys(row.update.$set)),
    [["publish.grades"]],
  );
  assert.equal(String(analysisUpdates[0].update.$set["publish.grades"][0].entry), String(entryId));
});

test("publishing refuses in the write itself when the analysis is already published", async () => {
  const session = {
    withTransaction: async (run) => run(),
    endSession: async () => {},
  };
  let entriesWritten = 0;
  const stubs = [
    [mongoose, "startSession", async () => session],
    [WritingAnalysis, "findOne", () => chain(analysisDoc())],
    [WritingAnalysis, "findOneAndUpdate", () => chain(null)],
    [Class, "findOne", () => chain(classDoc())],
    [
      StandardsGradebookEntry,
      "updateOne",
      async () => {
        entriesWritten += 1;
      },
    ],
    [
      StandardsGradebookEntry,
      "create",
      async () => {
        entriesWritten += 1;
      },
    ],
  ];
  await withStubs(stubs, async () => {
    await assert.rejects(
      publishAnalysis({ schoolId, analysisId, userId, isAdmin: true }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /already published/);
        return true;
      },
    );
  });
  assert.equal(entriesWritten, 0, "a lost claim must not write a gradebook row");
});

test("an entry left on a deactivated assignment is updated, not duplicated", async () => {
  const activeAssignmentId = oid();
  const oldEntryId = oid();
  const filters = [];
  const session = {
    withTransaction: async (run) => run(),
    endSession: async () => {},
  };
  const stubs = [
    [mongoose, "startSession", async () => session],
    [WritingAnalysis, "findOne", () => chain(analysisDoc())],
    [WritingAnalysis, "findOneAndUpdate", () => chain(analysisDoc())],
    [WritingAnalysis, "updateOne", async () => {}],
    [Class, "findOne", () => chain(classDoc())],
    [
      StandardAssignment,
      "find",
      () => chain([{ _id: activeAssignmentId, standard: standardId }]),
    ],
    [
      StandardsGradebookEntry,
      "find",
      (filter) => {
        filters.push(filter);
        // The active assignment has no row; the old row belongs to one that
        // was deactivated and is only reachable by the gradebook fields.
        return chain(
          filter.assignment
            ? []
            : [
                {
                  _id: oldEntryId,
                  standard: standardId,
                  assignment: oid(),
                  manualScore: 1,
                  semester: 2,
                },
              ],
        );
      },
    ],
    [StandardsGradebookEntry, "updateOne", async () => {}],
    [
      StandardsGradebookEntry,
      "create",
      async () => {
        throw new Error("the existing row must be updated");
      },
    ],
    [Standard, "find", () => chain([standardDoc()])],
  ];
  await withStubs(stubs, async () => {
    const result = await publishAnalysis({
      schoolId,
      analysisId,
      userId,
      isAdmin: true,
      confirmOverwrite: true,
    });
    assert.equal(String(result.grades[0].entry), oldEntryId);
  });
  assert.equal(filters.length, 2, "the fallback lookup runs once for the leftovers");
  assert.equal(filters[1].semester, undefined);
});
