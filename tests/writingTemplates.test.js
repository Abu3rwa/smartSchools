/**
 * F8: a template must reproduce the lesson's feedback behaviour — taught focus,
 * rubric, supports, workflow, lesson facts and guardrails — not only its text.
 */
import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingSourcePack from "../models/WritingSourcePack.js";
import Class from "../models/Class.js";
import Student from "../models/Student.js";
import {
  instantiateTemplate,
  saveAsTemplate,
} from "../services/writingAssistantService.js";

const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const userId = oid();
const assignmentId = oid();
const classId = oid();
const studentId = oid();
const packId = oid();

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
    select: () => builder,
    sort: () => builder,
    populate: () => builder,
  };
  return builder;
};

const lessonConfig = () => ({
  _id: assignmentId,
  school: schoolId,
  assignedBy: userId,
  title: "Homework in Finland",
  instructions: "Write an opinion.",
  writingType: "essay",
  topic: "Should homework be banned?",
  isActive: true,
  isTemplate: false,
  minWords: 120,
  maxWords: 0,
  expectedLevel: "grade 5",
  sections: [{ key: "body", label: "Body", kind: "body", required: true }],
  supports: {
    wordBank: ["because"],
    transitions: [],
    sentenceStarters: [],
    guidingQuestions: [],
    modelText: "",
    plannerPrompt: "",
    wordSupport: {
      vocabulary: { enabled: false, listIds: [] },
      spelling: { enabled: true, maxWords: 4 },
    },
  },
  rubric: [{ key: "ideas", label: "Ideas", maxScore: 5 }],
  workflow: { teacherPublishesFeedback: false },
  aiConstraints: "Never rewrite the student's sentences.",
  taughtFocus: ["Topic sentences", "One reason per paragraph"],
  sourcePack: packId,
  exemplarText: "A strong example.",
});

const captureCreate = () => {
  const captured = { value: null };
  const create = async (payload) => {
    captured.value = payload;
    return { toObject: () => ({ ...payload, _id: oid() }) };
  };
  return { captured, create };
};

test("a saved template keeps the lesson settings, not just its words", async () => {
  const source = lessonConfig();
  const { captured, create } = captureCreate();
  await withStubs(
    [
      [WritingAssignment, "findOne", () => chain(source)],
      [WritingAssignment, "create", create],
    ],
    async () => {
      await saveAsTemplate({ schoolId, assignmentId, userId });
    },
  );
  assert.equal(captured.value.isTemplate, true);
  assert.deepEqual(captured.value.taughtFocus, [
    "Topic sentences",
    "One reason per paragraph",
  ]);
  assert.equal(String(captured.value.sourcePack), packId);
  assert.deepEqual(captured.value.supports.wordBank, ["because"]);
  assert.equal(captured.value.supports.wordSupport.spelling.enabled, true);
  assert.deepEqual(captured.value.rubric.map((row) => row.key), ["ideas"]);
  assert.equal(captured.value.workflow.teacherPublishesFeedback, false);
  assert.equal(captured.value.aiConstraints, "Never rewrite the student's sentences.");
  assert.equal(captured.value.exemplarText, "A strong example.");
  assert.deepEqual(captured.value.sections.map((row) => row.key), ["body"]);
});

test("instantiating a template reproduces its behaviour on the new task", async () => {
  const template = {
    ...lessonConfig(),
    title: "Homework in Finland (template)",
    isTemplate: true,
  };
  const { captured, create } = captureCreate();
  const previous = process.env.WRITING_SOURCE_PACKS;
  process.env.WRITING_SOURCE_PACKS = "1";
  try {
    await withStubs(
      [
        [WritingAssignment, "findOne", () => chain(template)],
        [WritingAssignment, "create", create],
        [Class, "findOne", () => chain({ _id: classId })],
        [Student, "find", () => chain([{ _id: studentId }])],
        [WritingSourcePack, "findOne", () => chain({ _id: packId })],
      ],
      async () => {
        await instantiateTemplate({
          schoolId,
          templateId: assignmentId,
          userId,
          isAdmin: true,
          payload: {
            title: "Homework in Finland — 5R",
            classId,
          },
        });
      },
    );
  } finally {
    if (previous === undefined) delete process.env.WRITING_SOURCE_PACKS;
    else process.env.WRITING_SOURCE_PACKS = previous;
  }
  assert.equal(captured.value.isTemplate, false);
  assert.equal(captured.value.title, "Homework in Finland — 5R");
  assert.equal(String(captured.value.class), classId);
  assert.deepEqual(captured.value.taughtFocus, [
    "Topic sentences",
    "One reason per paragraph",
  ]);
  assert.equal(String(captured.value.sourcePack), packId);
  assert.deepEqual(captured.value.rubric.map((row) => row.key), ["ideas"]);
  assert.equal(captured.value.workflow.teacherPublishesFeedback, false);
  assert.deepEqual(captured.value.sections.map((row) => row.key), ["body"]);
});
