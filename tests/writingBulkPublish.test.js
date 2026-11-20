/**
 * F7: the class-wide publish. The preview must name every row that cannot go
 * out, the publish must run the single publish path per clean row, and no row
 * may disappear between preview and result.
 */
import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import Student from "../models/Student.js";
import School from "../models/School.js";
import {
  MAX_BULK_PUBLISH,
  bulkPublish,
  previewBulkPublish,
} from "../services/writingBulkPublishService.js";

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
    populate: () => builder,
  };
  return builder;
};

const assignmentDoc = () => ({
  _id: assignmentId,
  assignedBy: userId,
  isActive: true,
  title: "Should our school have a longer recess?",
  topic: "Should our school have a longer recess?",
  writingType: "essay",
  workflow: {},
});

const makeStudent = (firstName, lastName) => ({
  _id: oid(),
  firstName,
  lastName,
  email: `${firstName.toLowerCase()}@school.example`,
  user: { email: `${firstName.toLowerCase()}@school.example` },
  getAllContactEmailEntries: () => [
    { type: "mother", email: `mum.${firstName.toLowerCase()}@home.example` },
  ],
});

const makeDraft = (overrides = {}) => ({
  _id: oid(),
  withdrawn: false,
  number: 1,
  sections: [
    { key: "body", index: 0, text: "Schools should wear uniforms." },
  ],
  ...overrides,
});

const makeFeedback = (project, draft, overrides = {}) => ({
  _id: oid(),
  project: project._id,
  assignment: assignmentId,
  draft: draft._id,
  kind: "feedback",
  aiStatus: "done",
  publish: { state: "draft" },
  language: "en",
  overall: {
    summary: "Your opening states the claim clearly.",
    nextPriorities: [],
  },
  sections: [],
  scores: [],
  spellingTargets: [],
  comparison: {},
  ...overrides,
});

const makeProject = (student, draft, overrides = {}) => ({
  _id: oid(),
  assignment: assignmentId,
  student: {
    _id: student._id,
    firstName: student.firstName,
    lastName: student.lastName,
  },
  stage: "submitted",
  status: "submitted",
  latestDraft: draft._id,
  draftCount: 1,
  ...overrides,
});

/** Ten rows, one good and nine blocked, each for a different reason. */
const buildBoard = () => {
  const student = makeStudent("Areen", "Hassan");
  const rows = {};

  const add = (key, overrides = {}) => {
    const draft = makeDraft(overrides.draft);
    const project = makeProject(student, draft, overrides.project);
    const feedback = makeFeedback(project, draft, overrides.feedback);
    rows[key] = { project, draft, feedback };
  };

  add("ok", {
    feedback: {
      sections: [
        {
          key: "body",
          index: 0,
          label: "Body",
          evidence: "Schools should wear uniforms",
          strengths: ["The claim is stated up front."],
        },
      ],
    },
  });
  add("token", {
    feedback: { overall: { summary: "Dear {{name}}, clear opening.", nextPriorities: [] } },
  });
  add("anchor", {
    feedback: {
      sections: [
        {
          key: "body",
          index: 0,
          label: "Opening",
          evidence: "The bell rings loudly at noon.",
        },
      ],
    },
  });
  add("already", {
    project: { stage: "feedback_published" },
    feedback: { publish: { state: "published" } },
  });
  add("stage", {
    project: { stage: "revising" },
  });
  add("notReady", {
    feedback: { aiStatus: "pending" },
  });
  add("returned", {
    draft: { withdrawn: true },
  });
  add("repeats", {
    feedback: {
      sections: [
        { key: "body", index: 0, label: "Body", intervention: { needsRewrite: true } },
      ],
    },
  });
  add("locked", {
    project: { teacherOverride: { stageLockedTo: "revising" } },
  });

  const missing = { projectId: oid(), studentName: "", reasons: ["not-found"] };
  return { student, rows, missing };
};

const previewStubs = ({ board, students, school, assignment = assignmentDoc() }) => [
  [WritingAssignment, "findOne", () => chain(assignment)],
  [
    WritingProject,
    "find",
    () => chain(Object.values(board.rows).map((row) => row.project)),
  ],
  [
    WritingDraft,
    "find",
    () => chain(Object.values(board.rows).map((row) => row.draft)),
  ],
  [
    WritingAssessment,
    "find",
    () => chain(Object.values(board.rows).map((row) => row.feedback)),
  ],
  [Student, "find", () => chain(students)],
  [School, "findOne", () => chain(school)],
];

const reasonOf = (preview, projectId) =>
  preview.rows.find((row) => row.projectId === projectId).reasons;

test("the preview names every row that cannot go out, and why", async () => {
  const board = buildBoard();
  const selection = [
    board.rows.ok.project._id,
    board.rows.token.project._id,
    board.rows.anchor.project._id,
    board.rows.already.project._id,
    board.rows.stage.project._id,
    board.rows.notReady.project._id,
    board.rows.returned.project._id,
    board.rows.repeats.project._id,
    board.rows.locked.project._id,
    board.missing.projectId,
  ];
  const previous = process.env.WRITING_EMAIL_DELIVERY;
  process.env.WRITING_EMAIL_DELIVERY = "both";
  try {
    await withStubs(
      previewStubs({
        board,
        students: [board.student],
        school: {
          name: "Al Noor School",
          settings: { writingFeedback: { marksMode: "words" } },
        },
      }),
      async () => {
        const preview = await previewBulkPublish({
          schoolId,
          assignmentId,
          userId,
          projectIds: selection,
        });

        assert.deepEqual(reasonOf(preview, board.rows.ok.project._id), []);
        assert.deepEqual(reasonOf(preview, board.rows.token.project._id), ["tokens"]);
        assert.deepEqual(reasonOf(preview, board.rows.anchor.project._id), ["anchors"]);
        // An already-published row must not collect stage or anchor noise.
        assert.deepEqual(reasonOf(preview, board.rows.already.project._id), ["already"]);
        assert.deepEqual(reasonOf(preview, board.rows.stage.project._id), ["stage"]);
        assert.deepEqual(reasonOf(preview, board.rows.notReady.project._id), ["not-ready"]);
        assert.deepEqual(reasonOf(preview, board.rows.returned.project._id), ["returned"]);
        assert.deepEqual(reasonOf(preview, board.rows.repeats.project._id), ["repeats"]);
        assert.deepEqual(reasonOf(preview, board.rows.locked.project._id), ["locked"]);
        assert.deepEqual(reasonOf(preview, board.missing.projectId), ["not-found"]);

        assert.deepEqual(preview.summary, {
          selected: 10,
          eligible: 1,
          blocked: 9,
          reasons: {
            tokens: 1,
            anchors: 1,
            already: 1,
            stage: 1,
            "not-ready": 1,
            returned: 1,
            repeats: 1,
            locked: 1,
            "not-found": 1,
          },
        });

        const good = preview.rows.find(
          (row) => row.projectId === board.rows.ok.project._id,
        );
        assert.deepEqual(good.email, { students: 1, parents: 1, note: "" });
        assert.deepEqual(preview.email, { students: 1, parents: 1 });
        assert.ok(preview.sampleEmail);
        assert.equal(preview.sampleEmail.role, "parents");
        assert.match(preview.sampleEmail.subject, /draft 1/);
        assert.ok(preview.sampleEmail.html.includes("Areen"));
        assert.ok(preview.sampleEmail.html.includes("Schools should wear uniforms"));
      },
    );
  } finally {
    if (previous === undefined) delete process.env.WRITING_EMAIL_DELIVERY;
    else process.env.WRITING_EMAIL_DELIVERY = previous;
  }
});

test("only the owning teacher or an admin can publish the class", async () => {
  const board = buildBoard();
  const assignment = { ...assignmentDoc(), assignedBy: oid() };
  await withStubs(
    previewStubs({
      board,
      students: [board.student],
      school: null,
      assignment,
    }),
    async () => {
      await assert.rejects(
        previewBulkPublish({
          schoolId,
          assignmentId,
          userId,
          projectIds: [board.rows.ok.project._id],
        }),
        (error) => {
          assert.equal(error.statusCode, 403);
          return true;
        },
      );
      await assert.rejects(
        previewBulkPublish({
          schoolId,
          assignmentId: "not-an-id",
          userId,
          projectIds: [board.rows.ok.project._id],
        }),
        (error) => {
          assert.equal(error.statusCode, 404);
          return true;
        },
      );
    },
  );
});

test("an empty or oversized selection is refused", async () => {
  const board = buildBoard();
  await withStubs(
    previewStubs({ board, students: [], school: null }),
    async () => {
      await assert.rejects(
        previewBulkPublish({ schoolId, assignmentId, userId, projectIds: [] }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /at least one/);
          return true;
        },
      );
      const tooMany = Array.from({ length: MAX_BULK_PUBLISH + 1 }, () => oid());
      await assert.rejects(
        previewBulkPublish({
          schoolId,
          assignmentId,
          userId,
          projectIds: tooMany,
        }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /more than/);
          return true;
        },
      );
    },
  );
});

/** The publish path per row: the single assessment service, stubbed at the models. */
const publishStubs = ({ board, missingAssessmentId }) => {
  const rows = Object.values(board.rows);
  const projectById = new Map(
    rows.map((row) => [String(row.project._id), row.project]),
  );
  const assessmentById = new Map(
    rows.map((row) => [String(row.feedback._id), row.feedback]),
  );
  if (missingAssessmentId) assessmentById.delete(String(missingAssessmentId));
  const draftById = new Map(
    rows.map((row) => [String(row.draft._id), row.draft]),
  );
  return [
    ...previewStubs({ board, students: [board.student], school: null }),
    [
      WritingProject,
      "findOne",
      async (query) => projectById.get(String(query._id)) || null,
    ],
    [
      WritingDraft,
      "findOne",
      (query) => chain(draftById.get(String(query._id)) || {}),
    ],
    [
      WritingAssessment,
      "findOne",
      (query) => assessmentById.get(String(query._id)) || null,
    ],
    [WritingAssessment, "findOneAndUpdate", async () => ({ _id: oid() })],
    [WritingAssessment, "updateOne", async () => ({ ok: 1 })],
  ];
};

test("bulk publish runs the single publish for each clean row and reports the rest", async () => {
  const board = buildBoard();
  const ok = board.rows.ok;
  const anchor = board.rows.anchor;
  // A round that disappears between preview and publish must surface as failed.
  const failDraft = makeDraft();
  const failProject = makeProject(board.student, failDraft);
  const fail = makeFeedback(failProject, failDraft);
  board.rows.fail = { project: failProject, draft: failDraft, feedback: fail };
  ok.feedback.save = async () => {};
  ok.project.save = async () => {};

  const previous = process.env.WRITING_EMAIL_DELIVERY;
  process.env.WRITING_EMAIL_DELIVERY = "off";
  try {
    await withStubs(
      publishStubs({ board, missingAssessmentId: fail._id }),
      async () => {
        const result = await bulkPublish({
          schoolId,
          assignmentId,
          userId,
          projectIds: [
            ok.project._id,
            anchor.project._id,
            failProject._id,
          ],
        });

        assert.deepEqual(result.summary, {
          selected: 3,
          published: 1,
          already: 0,
          failed: 1,
          blocked: 1,
        });
        const byId = new Map(result.rows.map((row) => [row.projectId, row]));
        assert.equal(byId.get(ok.project._id).status, "published");
        assert.equal(byId.get(anchor.project._id).status, "blocked");
        assert.deepEqual(byId.get(anchor.project._id).reasons, ["anchors"]);
        assert.equal(byId.get(failProject._id).status, "failed");
        assert.equal(byId.get(failProject._id).statusCode, 404);
        assert.match(byId.get(failProject._id).message, /Assessment not found/);
        // The clean row went through the real publish: the stage moved.
        assert.equal(ok.project.stage, "feedback_published");
      },
    );
  } finally {
    if (previous === undefined) delete process.env.WRITING_EMAIL_DELIVERY;
    else process.env.WRITING_EMAIL_DELIVERY = previous;
  }
});

test("a round published mid-run is reported as already, not failed", async () => {
  const board = buildBoard();
  const ok = board.rows.ok;
  ok.feedback.save = async () => {};
  ok.project.save = async () => {};

  const stubs = publishStubs({ board });
  stubs.push([WritingAssessment, "findOneAndUpdate", async () => null]);
  stubs.push([
    WritingAssessment,
    "findOne",
    () => ({
      ...ok.feedback,
      lean: async () => ({ publish: { state: "published" } }),
    }),
  ]);

  const previous = process.env.WRITING_EMAIL_DELIVERY;
  process.env.WRITING_EMAIL_DELIVERY = "off";
  try {
    await withStubs(stubs, async () => {
      const result = await bulkPublish({
        schoolId,
        assignmentId,
        userId,
        projectIds: [ok.project._id],
      });
      assert.deepEqual(result.summary, {
        selected: 1,
        published: 0,
        already: 1,
        failed: 0,
        blocked: 0,
      });
      assert.equal(result.rows[0].status, "already");
    });
  } finally {
    if (previous === undefined) delete process.env.WRITING_EMAIL_DELIVERY;
    else process.env.WRITING_EMAIL_DELIVERY = previous;
  }
});
