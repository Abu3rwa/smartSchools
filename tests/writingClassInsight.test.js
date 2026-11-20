/**
 * F9/F11: the reteach summary and the teacher's own review workload.
 *
 * Both read rows the module already stores — the revision ledger, section
 * notes, rubric scores, spelling near misses, teacher edits and publish times.
 * The tests pin that aggregation, the class filter, ownership, and that no
 * student name can leak into either payload.
 */
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingAssessment from "../models/WritingAssessment.js";
import {
  assignmentInsight,
  assignmentWorkload,
} from "../services/writingClassInsightService.js";

const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const userId = oid();
const assignmentId = oid();

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

const chain = (value) => {
  const builder = {
    lean: async () => value,
    exec: async () => value,
    select: () => builder,
    sort: () => builder,
    limit: () => builder,
    populate: () => builder,
  };
  return builder;
};

const assignmentDoc = (overrides = {}) => ({
  _id: assignmentId,
  assignedBy: userId,
  isActive: true,
  title: "Should our school start later?",
  ...overrides,
});

/** Mirrors the real query filters so a pending round really drops out. */
const assessmentFind = (rows) => (filter = {}) => {
  let out = rows;
  if (filter.kind) out = out.filter((row) => row.kind === filter.kind);
  if (filter.aiStatus) {
    out = out.filter((row) => row.aiStatus === filter.aiStatus);
  }
  if (filter._id?.$in) {
    const ids = new Set(filter._id.$in.map(String));
    out = out.filter((row) => ids.has(String(row._id)));
  }
  return chain(out);
};

const feedback = (overrides = {}) => ({
  _id: oid(),
  kind: "feedback",
  aiStatus: "done",
  scores: [],
  sections: [],
  wordUseEvidence: { spelling: [], vocabulary: [] },
  teacherEdits: [],
  publish: { state: "draft" },
  ...overrides,
});

const insightFixture = () => {
  const marked = feedback({
    scores: [
      { key: "ideas", label: "Ideas", score: 6, maxScore: 10 },
      { key: "grammar", label: "Grammar", score: 4, maxScore: 10 },
      // A criterion outside the taught focus is kept but never counted.
      { key: "voice", label: "Voice", score: 0, maxScore: 10, focusExcluded: true },
      // A row without a ceiling cannot become a percentage.
      { key: "unsized", label: "No ceiling", score: 5 },
    ],
    sections: [
      {
        key: "body",
        label: "Body",
        improvements: ["Add evidence"],
        evidence: "",
      },
      {
        key: "opening",
        label: "Opening",
        strengths: ["Clear claim"],
        evidence: "Schools should start later.",
      },
      {
        key: "ending",
        label: "Ending",
        nextStep: "Close the loop",
        evidenceFact: { id: "fact-1" },
      },
    ],
    wordUseEvidence: {
      spelling: [
        { word: "definitely", nearMisses: ["definately"] },
        { word: "separate", nearMisses: [] },
      ],
    },
  });
  const second = feedback({
    scores: [
      { key: "ideas", label: "Ideas", score: 8, maxScore: 10 },
      { key: "grammar", label: "Grammar", score: 4, maxScore: 10 },
    ],
    sections: [
      {
        key: "body",
        label: "Body",
        improvements: ["Add evidence"],
        evidence: "",
      },
    ],
    wordUseEvidence: {
      spelling: [{ word: "definitely", nearMisses: ["definetly"] }],
    },
  });
  const pending = feedback({
    aiStatus: "pending",
    scores: [{ key: "ideas", label: "Ideas", score: 0, maxScore: 10 }],
  });
  const projects = [
    {
      _id: oid(),
      assignment: assignmentId,
      latestAssessment: marked._id,
      revisionLedger: [
        { text: "Add evidence", status: "open" },
        { text: "Add  Evidence", status: "stalled" },
        { text: "Reread the ending", status: "done" },
      ],
    },
    {
      _id: oid(),
      assignment: assignmentId,
      latestAssessment: second._id,
      revisionLedger: [
        { text: "Use a better hook", status: "open" },
        { text: " add evidence ", status: "open" },
      ],
    },
    {
      _id: oid(),
      assignment: assignmentId,
      latestAssessment: pending._id,
      revisionLedger: [],
    },
  ];
  return { rows: [marked, second, pending], projects };
};

const insightStubs = ({
  rows = [],
  projects = [],
  assignment = assignmentDoc(),
  captured = {},
} = {}) => [
  [
    WritingAssignment,
    "findOne",
    (filter) => {
      captured.assignmentFilter = filter;
      return chain(assignment);
    },
  ],
  [
    WritingProject,
    "find",
    (filter) => {
      captured.projectFilter = filter;
      return chain(projects);
    },
  ],
  [WritingAssessment, "find", assessmentFind(rows)],
];

test("the insight names what to reteach from stored marks and ledger tasks", async () => {
  const { rows, projects } = insightFixture();
  const captured = {};

  await withStubs(insightStubs({ rows, projects, captured }), async () => {
    const result = await assignmentInsight({ schoolId, assignmentId, userId });

    assert.equal(result.students, 3);
    assert.equal(result.assessed, 2);
    assert.equal(result.stalled, 1);
    assert.deepEqual(result.commonTasks, [
      { label: "add evidence", n: 3 },
      { label: "use a better hook", n: 1 },
    ]);
    // Focus-excluded and ceiling-less scores never reach the percentage.
    assert.deepEqual(result.weakScores, [
      { label: "Grammar", percent: 40, n: 2 },
      { label: "Ideas", percent: 70, n: 2 },
    ]);
    assert.deepEqual(result.evidenceGaps, [
      { label: "Body", n: 2 },
      { label: "Ending", n: 1 },
    ]);
    assert.deepEqual(result.spellingGaps, [{ label: "definitely", n: 2 }]);
    assert.equal(result.packUse, 1);

    assert.equal(String(captured.assignmentFilter.school), schoolId);
    assert.equal(String(captured.projectFilter.assignment), assignmentId);
    assert.equal(captured.projectFilter.class, undefined);
  });
});

test("a class filter narrows the projects on the same assignment", async () => {
  const { rows, projects } = insightFixture();
  const captured = {};
  const classId = oid();

  await withStubs(insightStubs({ rows, projects, captured }), async () => {
    await assignmentInsight({ schoolId, assignmentId, classId, userId });
    assert.equal(String(captured.projectFilter.class), classId);
  });
});

test("a teacher who did not create the task is refused, admin is not", async () => {
  const { rows, projects } = insightFixture();
  const other = oid();
  const stubs = insightStubs({
    rows,
    projects,
    assignment: assignmentDoc({ assignedBy: other }),
  });

  await withStubs(stubs, async () => {
    await assert.rejects(
      assignmentInsight({ schoolId, assignmentId, userId }),
      (error) => error.statusCode === 403,
    );
    const asAdmin = await assignmentInsight({
      schoolId,
      assignmentId,
      userId,
      isAdmin: true,
    });
    assert.equal(asAdmin.assessed, 2);
  });
});

const edit = (...paths) => ({ changedPaths: paths });

const workloadFixture = () => [
  {
    _id: oid(),
    kind: "feedback",
    aiStatus: "done",
    teacherEdits: [
      edit("sections.0.strengths"),
      edit("overall.summary", "scores.1.explanation"),
    ],
    publish: {
      state: "published",
      publishedAt: new Date("2026-01-01T10:05:00Z"),
    },
    ranAt: new Date("2026-01-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T09:55:00Z"),
  },
  {
    _id: oid(),
    kind: "feedback",
    aiStatus: "done",
    teacherEdits: [],
    publish: { state: "draft" },
    ranAt: new Date("2026-01-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T09:56:00Z"),
  },
  {
    _id: oid(),
    kind: "feedback",
    aiStatus: "done",
    teacherEdits: [edit("overall.summary")],
    publish: {
      state: "published",
      publishedAt: new Date("2026-01-01T10:00:40Z"),
    },
    ranAt: new Date("2026-01-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T09:58:00Z"),
  },
  {
    _id: oid(),
    kind: "feedback",
    aiStatus: "done",
    teacherEdits: [],
    publish: {
      state: "published",
      publishedAt: new Date("2026-01-01T10:02:00Z"),
    },
    createdAt: new Date("2026-01-01T10:00:00Z"),
  },
  {
    _id: oid(),
    kind: "feedback",
    aiStatus: "done",
    teacherEdits: [],
    publish: {
      state: "published",
      publishedAt: new Date("2026-01-01T09:00:00Z"),
    },
    ranAt: new Date("2026-01-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T09:59:00Z"),
  },
];

test("the workload reports this teacher's edits and review time, no ranking", async () => {
  const rows = workloadFixture();

  await withStubs(
    [
      [WritingAssignment, "findOne", () => chain(assignmentDoc())],
      [WritingAssessment, "find", assessmentFind(rows)],
    ],
    async () => {
      const result = await assignmentWorkload({
        schoolId,
        assignmentId,
        userId,
      });

      assert.equal(result.assessments, 5);
      assert.equal(result.published, 4);
      assert.equal(result.edited, 2);
      assert.equal(result.editRate, 40);
      assert.equal(result.notesEdited, 4);
      // 300 s, 40 s and 120 s are the only publish times after the AI ran.
      assert.deepEqual(result.reviewSeconds, { average: 153, median: 120 });
      assert.equal(result.recent.length, 5);
      assert.equal(result.recent[0].notesEdited, 3);
      assert.equal(result.recent[0].reviewSeconds, 300);
      assert.equal(result.recent[1].published, false);
      assert.equal(result.recent[1].reviewSeconds, null);
      assert.equal(result.recent[1].publishedAt, null);

      const serialized = JSON.stringify(result);
      assert.ok(!/teacherId|teacherName|"teacher"/.test(serialized));
    },
  );
});
