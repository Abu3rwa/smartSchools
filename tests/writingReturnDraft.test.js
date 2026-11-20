import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import {
  publishAssessment,
  returnDraftToStudent,
} from "../services/writingAssistantAssessmentService.js";

const oid = () => new mongoose.Types.ObjectId().toString();
const HERE = dirname(fileURLToPath(import.meta.url));

const schoolId = oid();
const userId = oid();
const assignmentId = oid();
const previousDraftId = oid();

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

const assignmentDoc = () => ({ _id: assignmentId, assignedBy: userId, isActive: true });

const draftDoc = (overrides = {}) => ({
  _id: oid(),
  project: oid(),
  number: 2,
  title: "Why uniforms help",
  sections: [
    { key: "intro", index: 0, label: "Introduction", text: "Schools should wear uniforms.", words: 4 },
    { key: "body", index: 1, label: "Body", text: "They make mornings easier.", words: 4 },
  ],
  totalWords: 8,
  withdrawn: false,
  save: async () => {},
  ...overrides,
});

const projectDoc = (draft, overrides = {}) => ({
  _id: oid(),
  assignment: assignmentId,
  stage: "submitted",
  status: "submitted",
  latestDraft: draft._id,
  latestAssessment: null,
  draftCount: 2,
  autosave: { title: "", sections: [], updatedAt: null },
  save: async () => {},
  ...overrides,
});

const leanOf = (value) => ({ select: () => ({ lean: async () => value }) });

/** The four reads returnDraftToStudent makes, in call order, keyed by filter. */
const returnStubs = ({ draft, project, previous = null, published = null, latest = null, cancelled = 1, kept = 0 }) => [
  [WritingProject, "findOne", async () => project],
  [WritingAssignment, "findOne", () => ({ lean: async () => assignmentDoc() })],
  [
    WritingDraft,
    "findOne",
    (filter) => {
      if (filter.number) {
        return { sort: () => leanOf(previous) };
      }
      return draft;
    },
  ],
  [
    WritingAssessment,
    "findOne",
    (filter) =>
      leanOf(filter["publish.state"] ? published : latest),
  ],
  [WritingAssessment, "updateMany", async () => ({ modifiedCount: cancelled })],
  [WritingAssessment, "countDocuments", async () => kept],
];

test("returning a submission needs a reason", async () => {
  const draft = draftDoc();
  const project = projectDoc(draft);
  await withStubs(returnStubs({ draft, project }), async () => {
    await assert.rejects(
      returnDraftToStudent({ schoolId, projectId: project._id, userId, payload: {} }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /why/i);
        return true;
      },
    );
    assert.equal(draft.withdrawn, false);
  });
});

test("only a submission still waiting on the teacher can be returned", async () => {
  for (const stage of ["drafting", "feedback_published", "compared"]) {
    const draft = draftDoc();
    const project = projectDoc(draft, { stage });
    await withStubs(returnStubs({ draft, project }), async () => {
      await assert.rejects(
        returnDraftToStudent({
          schoolId,
          projectId: project._id,
          userId,
          payload: { reason: "Sent by mistake" },
        }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /waiting on you/);
          return true;
        },
      );
      assert.equal(project.stage, stage);
    });
  }
});

test("published feedback blocks the return", async () => {
  const draft = draftDoc();
  const project = projectDoc(draft);
  await withStubs(
    returnStubs({ draft, project, published: { _id: oid() } }),
    async () => {
      await assert.rejects(
        returnDraftToStudent({
          schoolId,
          projectId: project._id,
          userId,
          payload: { reason: "Sent by mistake" },
        }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /already published/);
          return true;
        },
      );
      assert.equal(draft.withdrawn, false);
    },
  );
});

test("a draft can only be returned once", async () => {
  const draft = draftDoc({ withdrawn: true, withdrawal: { reason: "Sent by mistake" } });
  const project = projectDoc(draft);
  await withStubs(returnStubs({ draft, project }), async () => {
    await assert.rejects(
      returnDraftToStudent({
        schoolId,
        projectId: project._id,
        userId,
        payload: { reason: "Sent by mistake" },
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /already been returned/);
        return true;
      },
    );
  });
});

test("a return withdraws the draft, restores the text and records the reason", async () => {
  const draft = draftDoc();
  const project = projectDoc(draft, {
    latestAssessment: oid(),
  });
  const previous = { _id: previousDraftId, number: 1 };
  let draftSaved = false;
  let projectSaved = false;
  let cancelFilter = null;
  draft.save = async () => {
    draftSaved = true;
  };
  project.save = async () => {
    projectSaved = true;
  };

  const stubs = returnStubs({
    draft,
    project,
    previous,
    latest: { draft: draft._id },
    cancelled: 1,
    kept: 1,
  });
  const updateMany = stubs[4][2];
  stubs[4][2] = async (filter, update) => {
    cancelFilter = { filter, update };
    return updateMany(filter, update);
  };

  await withStubs(stubs, async () => {
    const result = await returnDraftToStudent({
      schoolId,
      projectId: project._id,
      userId,
      payload: { reason: "Pressed submit by mistake" },
    });

    assert.equal(draftSaved, true);
    assert.equal(draft.withdrawn, true);
    assert.equal(draft.withdrawal.by, userId);
    assert.equal(draft.withdrawal.reason, "Pressed submit by mistake");
    assert.ok(draft.withdrawal.at instanceof Date);

    // Exactly the text that was sent, nothing else, is back in the editor.
    assert.equal(project.autosave.title, "Why uniforms help");
    assert.deepEqual(
      project.autosave.sections.map((row) => ({ key: row.key, index: row.index, text: row.text })),
      [
        { key: "intro", index: 0, text: "Schools should wear uniforms." },
        { key: "body", index: 1, text: "They make mornings easier." },
      ],
    );
    assert.equal(project.autosave.sections[0].label, undefined);

    // The number is free again and the project forgets the withdrawn revision.
    assert.equal(project.draftCount, 1);
    assert.equal(project.latestDraft, previousDraftId);
    assert.equal(project.latestAssessment, null);
    assert.equal(project.stage, "drafting");
    assert.equal(project.status, "in_progress");
    assert.deepEqual(
      project.stageHistory.map((row) => ({ from: row.from, to: row.to, reason: row.reason })),
      [{ from: "submitted", to: "drafting", reason: "Pressed submit by mistake" }],
    );

    // An in-flight run is cancelled; a finished one is kept for the record.
    assert.deepEqual(cancelFilter.filter.aiStatus, { $in: ["pending", "running"] });
    assert.equal(cancelFilter.update.$set.aiErrorCode, "RETURNED_TO_STUDENT");
    assert.equal(result.cancelledAssessments, 1);
    assert.equal(result.keptAssessments, 1);
    assert.equal(result.draft.number, 2);
    assert.equal(result.project.stage, "drafting");
    assert.equal(projectSaved, true);
  });
});

test("a return from feedback_ready keeps a finished assessment of another draft", async () => {
  const draft = draftDoc();
  const keptAssessmentId = oid();
  const project = projectDoc(draft, {
    stage: "feedback_ready",
    latestAssessment: keptAssessmentId,
  });
  await withStubs(
    returnStubs({
      draft,
      project,
      previous: { _id: previousDraftId, number: 1 },
      latest: { draft: previousDraftId },
    }),
    async () => {
      await returnDraftToStudent({
        schoolId,
        projectId: project._id,
        userId,
        payload: { reason: "Wrong draft was sent" },
      });
      assert.equal(project.stage, "drafting");
      // The kept assessment belongs to the previous draft, so the board keeps it.
      assert.equal(project.latestAssessment, keptAssessmentId);
    },
  );
});

test("feedback from a returned submission cannot be published", async () => {
  const draftId = oid();
  const assessment = {
    _id: oid(),
    project: oid(),
    assignment: assignmentId,
    draft: draftId,
    publish: { state: "draft" },
    aiStatus: "done",
  };
  const project = projectDoc(draftDoc(), { _id: assessment.project });
  await withStubs(
    [
      [WritingAssessment, "findOne", async () => assessment],
      [WritingProject, "findOne", async () => project],
      [WritingAssignment, "findOne", () => ({ lean: async () => assignmentDoc() })],
      [WritingDraft, "findOne", () => leanOf({ withdrawn: true })],
    ],
    async () => {
      await assert.rejects(
        publishAssessment({ schoolId, assessmentId: assessment._id, userId }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /returned to the student/);
          return true;
        },
      );
    },
  );
});

test("the unique draft number applies to live drafts only", () => {
  const indexes = WritingDraft.schema.indexes();
  const row = indexes.find(
    ([fields]) =>
      fields.school === 1 && fields.project === 1 && fields.number === 1,
  );
  assert.ok(row, "the draft number index exists");
  assert.equal(row[1].unique, true);
  assert.deepEqual(row[1].partialFilterExpression, { withdrawn: false });
});

test("submitting reuses the number of a withdrawn draft", async () => {
  const source = await readFile(
    join(HERE, "..", "services", "writingAssistantService.js"),
    "utf8",
  );
  const highest = source.match(
    /const highest = await WritingDraft\.findOne\(\{[\s\S]{0,220}?\}\)/,
  );
  assert.ok(highest, "the highest-number query is present");
  assert.match(highest[0], /withdrawn: \{ \$ne: true \}/);

  const studentDrafts = source.match(
    /const drafts = await WritingDraft\.find\(\{[\s\S]{0,220}?\}\)/,
  );
  assert.ok(studentDrafts, "the student draft list query is present");
  assert.match(studentDrafts[0], /withdrawn: \{ \$ne: true \}/);
});
