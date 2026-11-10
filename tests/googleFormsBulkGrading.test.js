import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers";
import GoogleFormGrading from "../models/GoogleFormGrading.js";
import { googleFormResponseVersion } from "../services/googleFormsAssignmentService.js";
import { gradeAllGoogleFormSubmissions } from "../services/googleFormsGradingService.js";

const assignment = {
  _id: "assignment-1",
  metadata: {
    googleForm: {
      questions: [
        {
          questionId: "q1",
          type: "short_answer",
          points: 2,
          title: "Explain the water cycle",
          modelAnswer: "Evaporation, condensation, precipitation",
          rubric: "",
        },
        {
          questionId: "q2",
          type: "multiple_choice",
          points: 1,
          title: "Pick one",
          options: ["A", "B"],
          correctAnswer: "A",
        },
      ],
    },
  },
};

const submission = (id, studentId, answers = []) => ({
  _id: id,
  school: "school-1",
  assignment: "assignment-1",
  student: studentId,
  answers,
});

const mockStoredGradings = (t, rows) => {
  let calls = 0;
  t.mock.method(GoogleFormGrading, "find", () => {
    calls += 1;
    return { lean: async () => rows };
  });
  return () => calls;
};

test("bulk grading grades pending responses and survives one failure", async (t) => {
  mockStoredGradings(t, []);

  let active = 0;
  let peak = 0;
  const gradedStudents = [];
  const gradeOne = async ({ submission: row }) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 0));
    active -= 1;
    if (row.student === "student-2") {
      const error = new Error("AI grading failed. Try again.");
      error.code = "AI_CREDIT_REQUIRED";
      throw error;
    }
    gradedStudents.push(row.student);
    return { skipped: false, graded: 2, failed: 0 };
  };

  const summary = await gradeAllGoogleFormSubmissions({
    assignment,
    submissions: [
      submission("s1", "student-1"),
      submission("s2", "student-2"),
      submission("s3", "student-3"),
    ],
    concurrency: 2,
    gradeOne,
  });

  assert.equal(summary.total, 3);
  assert.equal(summary.graded, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.skipped, 0);
  assert.deepEqual(gradedStudents.sort(), ["student-1", "student-3"]);
  assert.equal(summary.failures.length, 1);
  assert.equal(summary.failures[0].studentId, "student-2");
  assert.equal(summary.failures[0].code, "AI_CREDIT_REQUIRED");
  assert.ok(peak <= 2, `ran ${peak} gradings at once`);
});

test("bulk grading reads stored suggestions once for the whole run", async (t) => {
  const calls = mockStoredGradings(t, []);

  await gradeAllGoogleFormSubmissions({
    assignment,
    submissions: [
      submission("s1", "student-1"),
      submission("s2", "student-2"),
      submission("s3", "student-3"),
    ],
    gradeOne: async () => ({ skipped: false, graded: 1, failed: 0 }),
  });

  assert.equal(calls(), 1);
});

test("bulk grading skips a response whose suggestion still matches it", async (t) => {
  const answers = [{ questionId: "q1", values: ["Water evaporates and rains"] }];
  mockStoredGradings(t, [
    {
      student: "student-1",
      status: "suggested",
      responseVersion: googleFormResponseVersion(answers),
      questions: [{ questionId: "q1", suggestedFeedback: "Good." }],
    },
  ]);

  let calls = 0;
  const summary = await gradeAllGoogleFormSubmissions({
    assignment,
    submissions: [submission("s1", "student-1", answers)],
    gradeOne: async () => {
      calls += 1;
      return { skipped: false, graded: 1, failed: 0 };
    },
  });

  assert.equal(summary.skipped, 1);
  assert.equal(summary.graded, 0);
  assert.equal(calls, 0);
});

test("bulk grading regrades a response whose answers changed", async (t) => {
  mockStoredGradings(t, [
    {
      student: "student-1",
      status: "suggested",
      responseVersion: "an-older-version",
      questions: [{ questionId: "q1", suggestedFeedback: "Good." }],
    },
  ]);

  let calls = 0;
  const summary = await gradeAllGoogleFormSubmissions({
    assignment,
    submissions: [
      submission("s1", "student-1", [
        { questionId: "q1", values: ["A brand new answer"] },
      ]),
    ],
    gradeOne: async () => {
      calls += 1;
      return { skipped: false, graded: 1, failed: 0 };
    },
  });

  assert.equal(calls, 1);
  assert.equal(summary.graded, 1);
});

test("bulk grading counts an unusable suggestion as a failure", async (t) => {
  mockStoredGradings(t, []);

  const summary = await gradeAllGoogleFormSubmissions({
    assignment,
    submissions: [submission("s1", "student-1")],
    gradeOne: async () => ({ skipped: false, graded: 0, failed: 1 }),
  });

  assert.equal(summary.graded, 0);
  assert.equal(summary.failed, 1);
  assert.equal(summary.failures[0].code, "GRADING_FAILED");
});

test("bulk grading refuses a quiz without short answers", async () => {
  await assert.rejects(
    () =>
      gradeAllGoogleFormSubmissions({
        assignment: {
          _id: "assignment-2",
          metadata: {
            googleForm: {
              questions: [
                { questionId: "q1", type: "multiple_choice", points: 1 },
              ],
            },
          },
        },
        submissions: [],
        gradeOne: async () => ({ skipped: false, graded: 1, failed: 0 }),
      }),
    (error) => error.code === "NO_SHORT_ANSWERS",
  );
});
