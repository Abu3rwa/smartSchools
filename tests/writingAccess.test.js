import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import SpellingAnalysis from "../models/SpellingAnalysis.js";
import {
  assertProjectVisibleToTeacher,
  getAssignmentForTeacher,
  getClassProgress,
  getProjectHistory,
  getTeacherBoard,
} from "../services/writingAssistantService.js";

const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const ownerId = oid();
const otherTeacherId = oid();
const adminId = oid();
const assignmentId = oid();
const projectId = oid();
const studentId = oid();

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

const assignmentDoc = () => ({
  _id: assignmentId,
  school: schoolId,
  assignedBy: ownerId,
  title: "School uniforms",
  rubric: [],
  students: [],
});

const withAssignment = async (run) => {
  const restore = stub(WritingAssignment, "findOne", () => chain(assignmentDoc()));
  try {
    await run();
  } finally {
    restore();
  }
};

const rejectsForbidden = async (promise) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, 403);
    assert.match(error.message, /Only the teacher who created this writing task/);
    return true;
  });
};

/* ------------------------------------------------------------------ */
/* The four reads                                                      */
/* ------------------------------------------------------------------ */

test("a teacher cannot read another teacher's writing task", async () => {
  await withAssignment(() =>
    rejectsForbidden(
      getAssignmentForTeacher({
        schoolId,
        assignmentId,
        userId: otherTeacherId,
      }),
    ),
  );
});

test("the creator and an admin still read the writing task", async () => {
  await withAssignment(async () => {
    const forCreator = await getAssignmentForTeacher({
      schoolId,
      assignmentId,
      userId: ownerId,
    });
    assert.equal(forCreator._id, assignmentId);

    const forAdmin = await getAssignmentForTeacher({
      schoolId,
      assignmentId,
      userId: adminId,
      isAdmin: true,
    });
    assert.equal(forAdmin._id, assignmentId);
  });
});

test("a teacher cannot read another teacher's board", async () => {
  await withAssignment(() =>
    rejectsForbidden(
      getTeacherBoard({
        schoolId,
        assignmentId,
        userId: otherTeacherId,
      }),
    ),
  );
});

test("the creator reads the board, and an empty roster stays empty", async () => {
  const restores = [
    stub(WritingAssignment, "findOne", () => chain(assignmentDoc())),
    stub(WritingProject, "find", () => chain([])),
  ];
  try {
    const board = await getTeacherBoard({
      schoolId,
      assignmentId,
      userId: ownerId,
    });
    assert.deepEqual(board.rows, []);
    assert.equal(board.assignment._id, assignmentId);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test("class progress forwards the caller, so a non-owner is refused", async () => {
  await withAssignment(() =>
    rejectsForbidden(
      getClassProgress({
        schoolId,
        assignmentId,
        userId: otherTeacherId,
      }),
    ),
  );
});

test("a teacher cannot read another teacher's project history", async () => {
  const project = {
    _id: projectId,
    school: schoolId,
    assignment: assignmentId,
    student: { _id: studentId, firstName: "Sara", lastName: "Ali", studentId: "S1" },
    stage: "submitted",
    draftCount: 1,
  };
  const restores = [
    stub(WritingProject, "findOne", () => chain(project)),
    stub(WritingAssignment, "findOne", () => chain(assignmentDoc())),
    stub(WritingDraft, "find", () => chain([])),
    stub(WritingAssessment, "find", () => chain([])),
    stub(SpellingAnalysis, "findOne", () => chain(null)),
  ];
  try {
    await rejectsForbidden(
      getProjectHistory({
        schoolId,
        projectId,
        userId: otherTeacherId,
      }),
    );
  } finally {
    restores.forEach((restore) => restore());
  }
});

/* ------------------------------------------------------------------ */
/* Project-level guard used by the teacher PDF                         */
/* ------------------------------------------------------------------ */

test("the teacher PDF guard resolves the project's task before deciding", async () => {
  const restores = [
    stub(WritingProject, "findOne", () => chain({ _id: projectId, assignment: assignmentId })),
    stub(WritingAssignment, "findOne", () => chain({ _id: assignmentId, assignedBy: ownerId })),
  ];
  try {
    await assertProjectVisibleToTeacher({
      schoolId,
      projectId,
      userId: ownerId,
    });
    await assertProjectVisibleToTeacher({
      schoolId,
      projectId,
      userId: adminId,
      isAdmin: true,
    });
    await rejectsForbidden(
      assertProjectVisibleToTeacher({
        schoolId,
        projectId,
        userId: otherTeacherId,
      }),
    );
  } finally {
    restores.forEach((restore) => restore());
  }
});

test("a missing project is a 404, not a permission error", async () => {
  const restore = stub(WritingProject, "findOne", () => chain(null));
  try {
    await assert.rejects(
      assertProjectVisibleToTeacher({
        schoolId,
        projectId,
        userId: otherTeacherId,
      }),
      (error) => error.statusCode === 404,
    );
  } finally {
    restore();
  }
});

/* ------------------------------------------------------------------ */
/* Controllers must actually pass the caller to those services         */
/* ------------------------------------------------------------------ */

test("every patched read is called with the caller's identity", async () => {
  const source = await readFile(
    new URL("../controllers/writingController.js", import.meta.url),
    "utf8",
  );

  const calls = [
    "getAssignmentForTeacher",
    "getTeacherBoard",
    "getClassProgress",
    "getProjectHistory",
  ];
  for (const name of calls) {
    const start = source.indexOf(`writingService.${name}(`);
    assert.ok(start > -1, `${name} must be used by the controller`);
    const block = source.slice(start, start + 400);
    assert.match(block, /userId: req\.user\._id/, `${name} must receive the caller`);
    assert.match(block, /isAdmin: isAdminUser\(req\.user\)/, `${name} must receive the admin flag`);
  }

  const pdfStart = source.indexOf("export const exportProjectPdfForTeacher");
  assert.ok(pdfStart > -1);
  assert.match(
    source.slice(pdfStart, pdfStart + 400),
    /assertProjectVisibleToTeacher\(\{/,
    "the teacher PDF must assert ownership before rendering",
  );
});
