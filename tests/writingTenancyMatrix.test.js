import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import SpellingAnalysis from "../models/SpellingAnalysis.js";
import SpellingRetestItem from "../models/SpellingRetestItem.js";
import Student from "../models/Student.js";
import {
  assessDraft,
  compareDrafts,
  publishAssessment,
  saveAssessmentEdits,
} from "../services/writingAssistantAssessmentService.js";
import {
  autosaveProject,
  getStudentProject,
  markNotebookWritten,
  openProject,
  recordPasteAttempt,
  submitDraft,
} from "../services/writingAssistantService.js";

/*
 * J1/J2: every endpoint resolves the object through the school and the caller.
 * A teacher who did not create the task, and a student who is not the author,
 * get nothing — not a redacted answer.
 */

const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const otherSchoolId = oid();
const ownerId = oid();
const otherTeacherId = oid();
const studentId = oid();
const otherStudentId = oid();
const assignmentId = oid();
const projectId = oid();
const draftId = oid();
const assessmentId = oid();

// A Mongoose query is awaitable and chainable; the stub has to be both, or an
// `await findOne()` would resolve to the query wrapper instead of its result.
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

const assignmentDoc = (overrides = {}) => ({
  _id: assignmentId,
  school: schoolId,
  assignedBy: ownerId,
  title: "School uniforms",
  students: [],
  rubric: [],
  ...overrides,
});

const projectDoc = () => ({
  _id: projectId,
  school: schoolId,
  assignment: assignmentId,
  student: studentId,
  stage: "submitted",
  latestDraft: draftId,
  draftCount: 1,
});

const draftDoc = () => ({
  _id: draftId,
  school: schoolId,
  project: projectId,
  assignment: assignmentId,
  student: studentId,
  number: 1,
  sections: [],
});

const assessmentDoc = (overrides = {}) => ({
  _id: assessmentId,
  school: schoolId,
  project: projectId,
  assignment: assignmentId,
  draft: draftId,
  student: studentId,
  kind: "feedback",
  aiStatus: "done",
  publish: { state: "draft" },
  ...overrides,
});

const forbidden = (error) => {
  assert.equal(error.statusCode, 403, error.message);
  return true;
};

const missing = (error) => {
  assert.equal(error.statusCode, 404, error.message);
  return true;
};

/** Every model the draft context reads, answered from one set of documents. */
const draftContextStubs = ({ draft = draftDoc() } = {}) => [
  [WritingDraft, "findOne", () => chain(draft)],
  [WritingProject, "findOne", () => chain(projectDoc())],
  [WritingAssignment, "findOne", () => chain(assignmentDoc())],
  [Student, "findOne", () => chain({ _id: studentId, firstName: "Sara" })],
  [Student, "find", () => chain([])],
  [WritingAssessment, "find", () => chain([])],
  [SpellingAnalysis, "findOne", () => chain(null)],
  [SpellingRetestItem, "find", () => chain([])],
];

const assessmentStubs = () => [
  [WritingAssessment, "findOne", () => chain(assessmentDoc())],
  [WritingProject, "findOne", () => chain(projectDoc())],
  [WritingAssignment, "findOne", () => chain(assignmentDoc())],
];

/* ------------------------------------------------------------------ */
/* Teacher: the AI entry points refuse a non-owner                     */
/* ------------------------------------------------------------------ */

test("a teacher cannot assess another teacher's draft", async () => {
  await withStubs(draftContextStubs(), () =>
    assert.rejects(
      assessDraft({ schoolId, draftId, userId: otherTeacherId }),
      forbidden,
    ),
  );
});

test("a teacher cannot compare another teacher's drafts", async () => {
  await withStubs(draftContextStubs(), () =>
    assert.rejects(
      compareDrafts({ schoolId, draftId, userId: otherTeacherId }),
      forbidden,
    ),
  );
});

test("another school's draft is missing, not forbidden", async () => {
  await withStubs(
    [[WritingDraft, "findOne", () => chain(null)]],
    () =>
      assert.rejects(
        assessDraft({ schoolId: otherSchoolId, draftId, userId: otherTeacherId }),
        missing,
      ),
  );
});

test("a teacher cannot edit another teacher's assessment", async () => {
  await withStubs(assessmentStubs(), () =>
    assert.rejects(
      saveAssessmentEdits({
        schoolId,
        assessmentId,
        userId: otherTeacherId,
        payload: { overall: { summary: "mine now" } },
      }),
      forbidden,
    ),
  );
});

test("a teacher cannot publish another teacher's assessment", async () => {
  await withStubs(assessmentStubs(), () =>
    assert.rejects(
      publishAssessment({ schoolId, assessmentId, userId: otherTeacherId }),
      forbidden,
    ),
  );
});

test("another school's assessment is missing, not forbidden", async () => {
  await withStubs(
    [[WritingAssessment, "findOne", () => chain(null)]],
    () =>
      assert.rejects(
        publishAssessment({
          schoolId: otherSchoolId,
          assessmentId,
          userId: otherTeacherId,
        }),
        missing,
      ),
  );
});

/* ------------------------------------------------------------------ */
/* Student: the project is resolved through the caller, never a body id */
/* ------------------------------------------------------------------ */

const foreignProject = () => [
  [WritingProject, "findOne", () => chain(null)],
];

test("a student cannot read another student's project", async () => {
  await withStubs(foreignProject(), () =>
    assert.rejects(
      getStudentProject({ schoolId, projectId, studentId: otherStudentId }),
      missing,
    ),
  );
});

test("a student cannot autosave into another student's project", async () => {
  await withStubs(foreignProject(), () =>
    assert.rejects(
      autosaveProject({
        schoolId,
        projectId,
        studentId: otherStudentId,
        payload: { sections: [{ key: "body", text: "x" }] },
      }),
      missing,
    ),
  );
});

test("a student cannot submit another student's project", async () => {
  await withStubs(foreignProject(), () =>
    assert.rejects(
      submitDraft({
        schoolId,
        projectId,
        studentId: otherStudentId,
        payload: {},
      }),
      missing,
    ),
  );
});

test("a student cannot mark another student's paste attempt", async () => {
  await withStubs(foreignProject(), () =>
    assert.rejects(
      recordPasteAttempt({
        schoolId,
        projectId,
        studentId: otherStudentId,
        payload: { text: "pasted" },
      }),
      missing,
    ),
  );
});

test("a student cannot mark another student's notebook written", async () => {
  await withStubs(foreignProject(), () =>
    assert.rejects(
      markNotebookWritten({
        schoolId,
        projectId,
        studentId: otherStudentId,
      }),
      missing,
    ),
  );
});

test("a student cannot open a task that is not assigned to them", async () => {
  await withStubs(
    [
      [WritingAssignment, "findOne", () => chain(assignmentDoc())],
      [Student, "findOne", () => chain({ _id: otherStudentId })],
    ],
    () =>
      assert.rejects(
        openProject({
          schoolId,
          studentId: otherStudentId,
          assignmentId,
        }),
        forbidden,
      ),
  );
});

test("every student surface asks for the project by school and by student", async () => {
  const filters = [];
  const record = (filter) => {
    filters.push(filter);
    return chain(null);
  };
  const calls = [
    () => getStudentProject({ schoolId, projectId, studentId: otherStudentId }),
    () =>
      autosaveProject({
        schoolId,
        projectId,
        studentId: otherStudentId,
        payload: { sections: [{ key: "body", text: "x" }] },
      }),
    () =>
      submitDraft({
        schoolId,
        projectId,
        studentId: otherStudentId,
        payload: {},
      }),
    () =>
      recordPasteAttempt({
        schoolId,
        projectId,
        studentId: otherStudentId,
        payload: { text: "pasted" },
      }),
    () =>
      markNotebookWritten({ schoolId, projectId, studentId: otherStudentId }),
  ];

  await withStubs([[WritingProject, "findOne", record]], async () => {
    for (const call of calls) await assert.rejects(call(), missing);
  });
  assert.equal(filters.length, calls.length);
  for (const filter of filters) {
    assert.equal(String(filter.school), schoolId);
    assert.equal(String(filter.student), otherStudentId);
    assert.equal(String(filter._id), projectId);
  }
});

/* ------------------------------------------------------------------ */
/* The controller takes the student from the token, not from the request */
/* ------------------------------------------------------------------ */

test("no student controller reads a student id out of the request", async () => {
  const source = await readFile(
    new URL("../controllers/writingController.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("/* Student — no AI is reachable");
  assert.ok(start > -1, "the student section must exist");
  const studentSection = source.slice(start);

  assert.doesNotMatch(studentSection, /req\.(body|params|query)\.studentId/);
  const handlers = studentSection.match(/export const \w+/g) || [];
  assert.ok(handlers.length >= 8, "every student route has a handler");
  for (const handler of handlers) {
    const blockStart = studentSection.indexOf(handler);
    const block = studentSection.slice(blockStart, studentSection.indexOf("export const", blockStart + handler.length));
    assert.match(
      block,
      /studentForRequest\(req\)/,
      `${handler} must resolve the student from the sign-in`,
    );
  }
});
