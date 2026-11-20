import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import { buildNoteRewritePrompt } from "../services/writingAssistantPrompts.js";
import { regenerateNote } from "../services/writingAssistantAssessmentService.js";

const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const userId = oid();
const assignmentId = oid();
const draftId = oid();

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

const assessmentDoc = (overrides = {}) => ({
  _id: oid(),
  project: oid(),
  assignment: assignmentId,
  draft: draftId,
  kind: "feedback",
  aiStatus: "done",
  language: "en",
  publish: { state: "draft" },
  ...overrides,
});

const projectDoc = () => ({ _id: assessmentDoc().project, assignment: assignmentId });

const stubsFor = (assessment, { draft = null, assignment = null } = {}) => [
  [WritingAssessment, "findOne", async () => assessment],
  [WritingProject, "findOne", async () => projectDoc()],
  [
    WritingAssignment,
    "findOne",
    () => ({
      lean: async () =>
        assignment || { _id: assignmentId, assignedBy: userId, isActive: true },
    }),
  ],
  [
    WritingDraft,
    "findOne",
    () => ({
      lean: async () =>
        draft || {
          _id: draftId,
          withdrawn: false,
          sections: [{ key: "body", index: 0, label: "Body", text: "They help." }],
        },
    }),
  ],
];

const payload = { mode: "shorter", field: "improvement", key: "body", index: 0, text: "Make it clearer." };

test("the rewrite prompt carries only the one section and the one note", () => {
  const prompt = buildNoteRewritePrompt({
    mode: "specific",
    field: "improvement",
    sectionLabel: "Body",
    sectionText: "Uniforms save time in the morning.",
    note: "Say more about time.",
    language: "en",
  });
  assert.match(prompt, /one section/i);
  assert.match(prompt, /Uniforms save time in the morning\./);
  assert.match(prompt, /Say more about time\./);
  assert.match(prompt, /exact word, phrase or sentence/);
  assert.match(prompt, /\{"note":/);
  assert.doesNotMatch(prompt, /Uniforms are cheap/);
});

test("each mode carries its own instruction and Arabic keeps its language line", () => {
  const shorter = buildNoteRewritePrompt({ mode: "shorter", field: "nextStep", sectionText: "x", note: "y" });
  const simpler = buildNoteRewritePrompt({ mode: "simpler", field: "nextStep", sectionText: "x", note: "y", language: "ar" });
  assert.match(shorter, /half the words/);
  assert.match(simpler, /everyday words/);
  assert.match(simpler, /Modern Standard Arabic/);
  assert.match(shorter, /English/);
});

test("published feedback is never rewritten", async () => {
  const assessment = assessmentDoc({ publish: { state: "published" } });
  await withStubs(stubsFor(assessment), async () => {
    await assert.rejects(
      regenerateNote({ schoolId, assessmentId: assessment._id, userId, payload }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.match(error.message, /Published feedback/);
        return true;
      },
    );
  });
});

test("only the supported rewrite modes and note fields are accepted", async () => {
  const assessment = assessmentDoc();
  await withStubs(stubsFor(assessment), async () => {
    await assert.rejects(
      regenerateNote({
        schoolId,
        assessmentId: assessment._id,
        userId,
        payload: { ...payload, mode: "louder" },
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /how the note should change/);
        return true;
      },
    );
    await assert.rejects(
      regenerateNote({
        schoolId,
        assessmentId: assessment._id,
        userId,
        payload: { ...payload, field: "summary" },
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /which note/);
        return true;
      },
    );
  });
});

test("an empty note or a missing section costs nothing", async () => {
  const assessment = assessmentDoc();
  await withStubs(stubsFor(assessment), async () => {
    await assert.rejects(
      regenerateNote({
        schoolId,
        assessmentId: assessment._id,
        userId,
        payload: { ...payload, text: "   " },
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /no note/);
        return true;
      },
    );
    await assert.rejects(
      regenerateNote({
        schoolId,
        assessmentId: assessment._id,
        userId,
        payload: { ...payload, key: "conclusion" },
      }),
      (error) => {
        assert.equal(error.statusCode, 404);
        assert.match(error.message, /not part of this draft/);
        return true;
      },
    );
  });
});

test("a withdrawn submission cannot be rewritten", async () => {
  const assessment = assessmentDoc();
  const draft = {
    _id: draftId,
    withdrawn: true,
    sections: [{ key: "body", index: 0, text: "text" }],
  };
  await withStubs(stubsFor(assessment, { draft }), async () => {
    await assert.rejects(
      regenerateNote({ schoolId, assessmentId: assessment._id, userId, payload }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /returned to the student/);
        return true;
      },
    );
  });
});
