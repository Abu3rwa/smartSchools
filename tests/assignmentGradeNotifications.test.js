import test from "node:test";
import assert from "node:assert/strict";
import Assignment from "../models/Assignment.js";
import Grade from "../models/Grade.js";
import Notification from "../models/Notification.js";
import Student from "../models/Student.js";
import notificationService from "../services/notificationService.js";
import { gradeAssignment } from "../controllers/assignmentController.js";

const assignment = {
  _id: "assignment-1",
  school: "school-1",
  class: "class-1",
  subject: "subject-1",
  status: "closed",
  title: "Homework",
  maxMarks: 10,
  assignmentTypeKey: "homework",
};

const invokeGrade = async ({ existingGrade } = {}, t) => {
  t.mock.method(Assignment, "findOne", async () => assignment);
  t.mock.method(Student, "find", () => ({
    select: () => ({ lean: async () => [{ _id: "student-1" }] }),
  }));
  t.mock.method(Grade, "findOne", () => ({
    select: () => ({ lean: async () => existingGrade }),
  }));
  t.mock.method(Grade, "findOneAndUpdate", async (_filter, update) => ({
    ...update.$set,
    student: "student-1",
  }));
  t.mock.method(Notification, "find", () => ({
    select: () => ({ lean: async () => [] }),
  }));
  const parentCalls = [];
  const studentCalls = [];
  t.mock.method(
    notificationService,
    "sendAssignmentGradedNotification",
    async (params) => {
      parentCalls.push(params);
    },
  );
  t.mock.method(
    notificationService,
    "sendStudentAssignmentGradedNotification",
    async (params) => {
      studentCalls.push(params);
    },
  );

  const response = { statusCode: 200, body: null };
  let resolveResponse;
  let rejectResponse;
  const responseDone = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
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

  await gradeAssignment(
    {
      params: { id: assignment._id },
      schoolId: "school-1",
      user: { role: "admin", _id: "admin-1" },
      body: { rows: [{ studentId: "student-1", marks: 8, maxMarks: 10 }] },
    },
    response,
    (error) => {
      rejectResponse(error);
    },
  );
  await responseDone;

  return { response, parentCalls, studentCalls };
};

test("unchanged assignment grade does not send graded emails", async (t) => {
  const { response, parentCalls, studentCalls } = await invokeGrade(
    {
      existingGrade: { marks: 8, maxMarks: 10 },
    },
    t,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(parentCalls.length, 0);
  assert.equal(studentCalls.length, 0);
});

test("changed or new assignment grade sends graded emails", async (t) => {
  const changed = await invokeGrade(
    {
      existingGrade: { marks: 7, maxMarks: 10 },
    },
    t,
  );
  assert.equal(changed.parentCalls.length, 1);
  assert.equal(changed.studentCalls.length, 1);

  const created = await invokeGrade({}, t);
  assert.equal(created.parentCalls.length, 1);
  assert.equal(created.studentCalls.length, 1);
});
