import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import Class from "../models/Class.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import errorHandler from "../middleware/errorHandler.js";
import {
  createAssignment,
  deactivateAssignment,
  markNotebookWritten,
} from "../services/writingAssistantService.js";
import {
  overrideStage,
  recordNotebookReview,
} from "../services/writingAssistantAssessmentService.js";

const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const userId = oid();
const studentId = oid();

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

const runHandler = (error) => {
  const response = { statusCode: 200, body: null };
  response.status = function setStatus(code) {
    this.statusCode = code;
    return this;
  };
  response.json = function sendJson(body) {
    this.body = body;
    return this;
  };
  errorHandler(
    error,
    { headers: {}, method: "POST", originalUrl: "/test" },
    response,
    () => {},
  );
  return response;
};

/* ------------------------------------------------------------------ */
/* Duplicate keys                                                      */
/* ------------------------------------------------------------------ */

test("a collision on a known writing index answers 409 with a recoverable code", () => {
  const response = runHandler(
    Object.assign(new Error("E11000 duplicate key error"), {
      code: 11000,
      keyValue: { school: schoolId, project: oid(), number: 2 },
    }),
  );
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "DUPLICATE_RECORD");
  assert.match(response.body.message, /Refresh the page and try again/i);

  const projectRow = runHandler(
    Object.assign(new Error("E11000 duplicate key error"), {
      code: 11000,
      keyValue: { school: schoolId, assignment: oid(), student: studentId },
    }),
  );
  assert.equal(projectRow.statusCode, 409);
  assert.equal(projectRow.body.code, "DUPLICATE_RECORD");
});

test("an unrelated duplicate keeps the generic 400", () => {
  const response = runHandler(
    Object.assign(new Error("E11000 duplicate key error"), {
      code: 11000,
      keyValue: { email: "teacher@school.com" },
    }),
  );
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 11000);
});

/* ------------------------------------------------------------------ */
/* Hiding a task that already has work                                 */
/* ------------------------------------------------------------------ */

const assignmentDoc = (overrides = {}) => ({
  _id: oid(),
  assignedBy: userId,
  isActive: true,
  ...overrides,
});

test("hiding a task with sent work asks first and names how many children", async () => {
  const assignment = assignmentDoc();
  let saved = false;
  assignment.save = async () => {
    saved = true;
  };

  await withStubs(
    [
      [WritingAssignment, "findOne", async () => assignment],
      [WritingProject, "countDocuments", async () => 3],
    ],
    async () => {
      await assert.rejects(
        deactivateAssignment({
          schoolId,
          assignmentId: assignment._id,
          userId,
        }),
        (error) => {
          assert.equal(error.statusCode, 409);
          assert.equal(error.code, "CONFIRM_DEACTIVATE");
          assert.equal(error.data.sentWork, 3);
          assert.match(error.message, /3 students have already sent work/);
          return true;
        },
      );
      assert.equal(assignment.isActive, true, "nothing is hidden before the confirm");
      assert.equal(saved, false);

      const result = await deactivateAssignment({
        schoolId,
        assignmentId: assignment._id,
        userId,
        confirmed: true,
      });
      assert.equal(result.isActive, false);
      assert.equal(assignment.isActive, false);
      assert.equal(saved, true);
    },
  );
});

test("a task nobody has written in hides without a prompt", async () => {
  const assignment = assignmentDoc();
  let asked = false;
  assignment.save = async () => {};

  await withStubs(
    [
      [WritingAssignment, "findOne", async () => assignment],
      [
        WritingProject,
        "countDocuments",
        async () => {
          asked = true;
          return 0;
        },
      ],
    ],
    async () => {
      const result = await deactivateAssignment({
        schoolId,
        assignmentId: assignment._id,
        userId,
      });
      assert.equal(result.isActive, false);
      assert.equal(asked, true);
    },
  );
});

/* ------------------------------------------------------------------ */
/* Notebook hand-off respects the teacher's lock                       */
/* ------------------------------------------------------------------ */

const studentProject = (overrides = {}) => ({
  _id: oid(),
  student: studentId,
  stage: "ready_for_notebook",
  notebook: { state: "not_requested" },
  teacherOverride: {},
  set(key, value) {
    if (key === "notebook") this.notebook = value;
    if (key === "notebook.state") this.notebook = { ...this.notebook, state: value };
  },
  save: async () => {},
  ...overrides,
});

test("the notebook hand-off works from the ready stage", async () => {
  const project = studentProject();
  await withStubs([[WritingProject, "findOne", async () => project]], async () => {
    const result = await markNotebookWritten({
      schoolId,
      projectId: project._id,
      studentId,
    });
    assert.equal(result.stage, "awaiting_notebook_check");
    assert.equal(project.notebook.state, "requested");
  });
});

test("a locked project cannot be walked back into the check stage", async () => {
  const project = studentProject({
    stage: "revising",
    notebook: { state: "requested" },
    teacherOverride: { stageLockedTo: "revising" },
  });
  await withStubs([[WritingProject, "findOne", async () => project]], async () => {
    await assert.rejects(
      markNotebookWritten({ schoolId, projectId: project._id, studentId }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /ready for the notebook/);
        return true;
      },
    );
    assert.equal(project.stage, "revising");
  });
});

test("forcing a stage clears the stale notebook mark", async () => {
  const project = studentProject({
    stage: "ready_for_notebook",
    notebook: { state: "requested", requestedAt: new Date() },
    assignment: oid(),
  });
  await withStubs(
    [
      [WritingProject, "findOne", async () => project],
      [WritingAssignment, "findOne", () => ({ lean: async () => assignmentDoc() })],
    ],
    async () => {
      await overrideStage({
        schoolId,
        projectId: project._id,
        userId,
        payload: { stage: "revising", reason: "Needs another paragraph" },
      });
      assert.equal(project.stage, "revising");
      assert.equal(project.notebook.state, "not_requested");
      assert.equal(project.teacherOverride.stageLockedTo, "revising");
    },
  );
});

/* ------------------------------------------------------------------ */
/* D8: stage moves are recorded, backward moves need a reason          */
/* ------------------------------------------------------------------ */

const stageProject = (stage, overrides = {}) =>
  studentProject({ stage, assignment: oid(), ...overrides });

test("a forward stage move is recorded without asking for a reason", async () => {
  const project = stageProject("drafting");
  await withStubs(
    [
      [WritingProject, "findOne", async () => project],
      [WritingAssignment, "findOne", () => ({ lean: async () => assignmentDoc() })],
    ],
    async () => {
      await overrideStage({
        schoolId,
        projectId: project._id,
        userId,
        payload: { stage: "submitted" },
      });
      assert.deepEqual(
        project.stageHistory.map((row) => ({ from: row.from, to: row.to })),
        [{ from: "drafting", to: "submitted" }],
      );
      assert.equal(project.stageHistory[0].by, userId);
      assert.equal(project.stageHistory[0].reason, "");
    },
  );
});

test("a backward stage move without a reason is refused", async () => {
  const project = stageProject("compared");
  await withStubs(
    [
      [WritingProject, "findOne", async () => project],
      [WritingAssignment, "findOne", () => ({ lean: async () => assignmentDoc() })],
    ],
    async () => {
      await assert.rejects(
        overrideStage({
          schoolId,
          projectId: project._id,
          userId,
          payload: { stage: "revising" },
        }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /reason/i);
          return true;
        },
      );
      assert.equal(project.stage, "compared");
      assert.equal(project.stageHistory, undefined);
    },
  );
});

test("the backward move's reason is kept with the stage history", async () => {
  const project = stageProject("compared");
  await withStubs(
    [
      [WritingProject, "findOne", async () => project],
      [WritingAssignment, "findOne", () => ({ lean: async () => assignmentDoc() })],
    ],
    async () => {
      await overrideStage({
        schoolId,
        projectId: project._id,
        userId,
        payload: { stage: "revising", reason: "Second paragraph lost its evidence" },
      });
      assert.equal(project.stage, "revising");
      assert.equal(project.stageHistory.length, 1);
      assert.equal(project.stageHistory[0].from, "compared");
      assert.equal(project.stageHistory[0].to, "revising");
      assert.equal(
        project.stageHistory[0].reason,
        "Second paragraph lost its evidence",
      );
    },
  );
});

test("sending a notebook back for revision needs a note and is recorded", async () => {
  const project = stageProject("awaiting_notebook_check", {
    notebook: { state: "requested" },
  });
  await withStubs(
    [
      [WritingProject, "findOne", async () => project],
      [WritingAssignment, "findOne", () => ({ lean: async () => assignmentDoc() })],
    ],
    async () => {
      await assert.rejects(
        recordNotebookReview({
          schoolId,
          projectId: project._id,
          userId,
          payload: { state: "revision_required" },
        }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /note/i);
          return true;
        },
      );
      assert.equal(project.stage, "awaiting_notebook_check");

      const result = await recordNotebookReview({
        schoolId,
        projectId: project._id,
        userId,
        payload: { state: "revision_required", note: "Add the missing example." },
      });
      assert.equal(result.project.stage, "revising");
      assert.equal(project.notebook.state, "revision_required");
      assert.equal(project.stageHistory.length, 1);
      assert.equal(project.stageHistory[0].to, "revising");
      assert.equal(project.stageHistory[0].reason, "Add the missing example.");
    },
  );
});

/* ------------------------------------------------------------------ */
/* Setting work is limited to the classes the teacher teaches           */
/* ------------------------------------------------------------------ */

const classLookup = (doc) => ({ select: () => ({ lean: async () => doc }) });

test("a teacher cannot set work for a class they do not teach", async () => {
  const teacherId = oid();
  const stubs = [
    [Teacher, "findOne", async () => ({ _id: teacherId })],
    [
      Class,
      "findOne",
      () =>
        classLookup({
          classTeacher: oid(),
          subjects: [{ teacher: oid() }],
        }),
    ],
  ];
  await withStubs(stubs, async () => {
    await assert.rejects(
      createAssignment({
        schoolId,
        userId,
        payload: { title: "A task", writingType: "essay", classId: oid() },
      }),
      (error) => {
        assert.equal(error.statusCode, 403);
        assert.match(error.message, /do not teach this class/);
        return true;
      },
    );
  });
});

test("the class teacher passes the class check", async () => {
  const teacherId = oid();
  const stubs = [
    [Teacher, "findOne", async () => ({ _id: teacherId })],
    [
      Class,
      "findOne",
      () =>
        classLookup({
          classTeacher: teacherId,
          subjects: [{ teacher: oid() }],
        }),
    ],
    [
      Student,
      "find",
      () => ({ select: () => ({ lean: async () => [] }) }),
    ],
  ];
  await withStubs(stubs, async () => {
    await assert.rejects(
      createAssignment({
        schoolId,
        userId,
        payload: { title: "A task", writingType: "essay", classId: oid() },
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /No students matched that class/);
        return true;
      },
    );
  });
});
