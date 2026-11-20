/**
 * F6: publishing is refused while the child's text would still be broken — an
 * unfilled name token or a section quote the draft cannot anchor. The same
 * rules run in the teacher's checklist, so this pins the server's own gate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import { publishAssessment } from "../services/writingAssistantAssessmentService.js";

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

const leanOf = (value) => ({ select: () => ({ lean: async () => value }) });

const assignmentDoc = () => ({
  _id: assignmentId,
  assignedBy: userId,
  isActive: true,
});

const draftRow = () => ({
  _id: oid(),
  withdrawn: false,
  sections: [
    { key: "body", index: 0, text: "Schools should wear uniforms." },
  ],
});

const makeAssessment = (overrides = {}) => ({
  _id: oid(),
  project: oid(),
  assignment: assignmentId,
  draft: oid(),
  kind: "feedback",
  aiStatus: "done",
  publish: { state: "draft" },
  overall: { summary: "Clear opening.", nextPriorities: [] },
  sections: [],
  scores: [],
  spellingTargets: [],
  comparison: {},
  ...overrides,
});

const makeProject = (assessment, overrides = {}) => ({
  _id: assessment.project,
  assignment: assignmentId,
  stage: "submitted",
  status: "submitted",
  latestDraft: assessment.draft,
  latestAssessment: null,
  draftCount: 1,
  autosave: { title: "", sections: [], updatedAt: null },
  ...overrides,
});

const publishStubs = ({ assessment, project, draft = draftRow() }) => [
  [WritingAssessment, "findOne", async () => assessment],
  [WritingProject, "findOne", async () => project],
  [WritingAssignment, "findOne", () => ({ lean: async () => assignmentDoc() })],
  [WritingDraft, "findOne", () => leanOf(draft)],
];

test("an edited sentence with a raw token cannot be published", async () => {
  const assessment = makeAssessment();
  const project = makeProject(assessment);
  await withStubs(publishStubs({ assessment, project }), async () => {
    await assert.rejects(
      publishAssessment({
        schoolId,
        assessmentId: assessment._id,
        userId,
        payload: { overall: { summary: "Dear {{name}}, your opening is clear." } },
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /\{\{name\}\}/);
        assert.match(error.message, /student's name/);
        return true;
      },
    );
  });
});

test("a stored quote the draft does not hold cannot be published", async () => {
  const assessment = makeAssessment({
    sections: [
      {
        key: "intro",
        index: 0,
        label: "Opening",
        evidence: "The bell rings loudly at noon.",
      },
    ],
  });
  const project = makeProject(assessment);
  await withStubs(publishStubs({ assessment, project }), async () => {
    await assert.rejects(
      publishAssessment({ schoolId, assessmentId: assessment._id, userId }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.match(error.message, /Opening/);
        assert.match(error.message, /not in this draft/);
        return true;
      },
    );
  });
});

test("the student slot and a real quote pass the guard", async () => {
  const assessment = makeAssessment({
    overall: { summary: "Dear {{student}}, clear opening.", nextPriorities: [] },
    sections: [
      {
        key: "body",
        index: 0,
        label: "Body",
        evidence: "Schools should wear uniforms",
      },
    ],
  });
  // A stage the round cannot leave proves the guard itself let the payload
  // through: the next check is the one that refuses.
  const project = makeProject(assessment, { stage: "completed" });
  await withStubs(publishStubs({ assessment, project }), async () => {
    await assert.rejects(
      publishAssessment({ schoolId, assessmentId: assessment._id, userId }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.match(error.message, /moved past/);
        return true;
      },
    );
  });
});

test("a comparison round is not held to essay anchors", async () => {
  const assessment = makeAssessment({
    kind: "comparison",
    sections: [
      {
        key: "body",
        index: 0,
        label: "Body",
        evidence: "Text that moved between drafts",
      },
    ],
  });
  const project = makeProject(assessment, { stage: "completed" });
  await withStubs(publishStubs({ assessment, project }), async () => {
    await assert.rejects(
      publishAssessment({ schoolId, assessmentId: assessment._id, userId }),
      (error) => {
        // The anchor guard is skipped; the stage check is what refuses.
        assert.match(error.message, /moved past/);
        return true;
      },
    );
  });
});
