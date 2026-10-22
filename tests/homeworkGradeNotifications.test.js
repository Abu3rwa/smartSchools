import test from "node:test";
import assert from "node:assert/strict";
import HomeworkAssignment from "../models/HomeworkAssignment.js";
import HomeworkSubmission from "../models/HomeworkSubmission.js";
import Grade from "../models/Grade.js";
import Student from "../models/Student.js";
import notificationService from "../services/notificationService.js";
import { bulkGradeHomework } from "../controllers/gradebookController.js";

const assignment = {
  _id: "homework-1",
  school: "school-1",
  class: "class-1",
  subject: "subject-1",
  academicYear: "2025-2026",
  status: "published",
  title: "Homework 5",
  maxMarks: 10,
};

const invokeBulkGrade = async ({ existingGrade, marks = 8 }, t) => {
  t.mock.method(HomeworkAssignment, "findOne", () => ({
    lean: async () => assignment,
  }));
  t.mock.method(Student, "find", () => ({
    select: () => ({ lean: async () => [{ _id: "student-1" }] }),
  }));
  t.mock.method(Grade, "findOne", () => ({
    select: () => ({ lean: async () => existingGrade }),
  }));
  t.mock.method(Grade, "findOneAndUpdate", async (_filter, update) => ({
    _id: "grade-1",
    ...update.$set,
  }));
  t.mock.method(HomeworkSubmission, "findOneAndUpdate", (_filter, update) => {
    const doc = { _id: "submission-1", ...(update.$set || {}) };
    const promise = Promise.resolve(doc);
    promise.lean = () => Promise.resolve(doc);
    return promise;
  });
  const parentCalls = [];
  t.mock.method(notificationService, "sendHomeworkGradedNotification", async (params) => {
    parentCalls.push(params);
  });

  const response = { statusCode: 200, body: null };
  let resolveResponse;
  const responseDone = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  response.status = function setStatus(code) {
    this.statusCode = code;
    return this;
  };
  response.json = function sendJson(body) {
    this.body = body;
    resolveResponse();
    return this;
  };

  await bulkGradeHomework(
    {
      schoolId: "school-1",
      user: { role: "admin", _id: "admin-1" },
      body: {
        homeworkAssignmentId: assignment._id,
        sendNotifications: true,
        rows: [{ studentId: "student-1", marks, maxMarks: 10 }],
      },
    },
    response,
    (error) => {
      resolveResponse();
      throw error;
    }
  );
  await responseDone;

  return { response, parentCalls };
};

test("unchanged homework grade does not send graded emails", async (t) => {
  const { response, parentCalls } = await invokeBulkGrade(
    { existingGrade: { marks: 8, maxMarks: 10 } },
    t
  );

  assert.equal(response.statusCode, 200);
  assert.equal(parentCalls.length, 0);
});

test("changed or new homework grade sends the graded email", async (t) => {
  const changed = await invokeBulkGrade({ existingGrade: { marks: 7, maxMarks: 10 } }, t);
  assert.equal(changed.parentCalls.length, 1);

  const created = await invokeBulkGrade({}, t);
  assert.equal(created.parentCalls.length, 1);
});
