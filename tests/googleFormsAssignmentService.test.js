import assert from "node:assert/strict";
import test from "node:test";
import process from "node:process";
import { google } from "googleapis";
import Grade from "../models/Grade.js";
import GoogleFormSubmission from "../models/GoogleFormSubmission.js";
import GoogleFormGrading from "../models/GoogleFormGrading.js";
import Student from "../models/Student.js";
import googleFormsOAuthService from "../services/googleFormsOAuthService.js";
import { gradeTypeCategoryFromAssignmentKey } from "../utils/assignmentGradeCategory.js";

test("assignment categories distinguish classwork from quizzes", () => {
  assert.deepEqual(gradeTypeCategoryFromAssignmentKey("classwork"), {
    gradeType: "classwork",
    category: "classwork",
  });
  assert.deepEqual(gradeTypeCategoryFromAssignmentKey("quiz"), {
    gradeType: "quiz",
    category: "quiz",
  });
  assert.deepEqual(gradeTypeCategoryFromAssignmentKey("test"), {
    gradeType: "monthly_test",
    category: "test",
  });
  assert.deepEqual(gradeTypeCategoryFromAssignmentKey("google_form"), {
    gradeType: "quiz",
    category: "quiz",
  });
  assert.deepEqual(gradeTypeCategoryFromAssignmentKey("custom"), {
    gradeType: "other",
    category: "other",
  });
});

const {
  syncGoogleQuizResponses,
  validateGoogleFormQuestions,
  DEFAULT_SHORT_ANSWER_POINTS,
  MAX_MODEL_ANSWER_CHARS,
  MAX_RUBRIC_CHARS,
} = await import("../services/googleFormsAssignmentService.js");

test("sync writes the selected assignment category for new and existing grades", async (t) => {
  const originalEnabled = process.env.GOOGLE_FORMS_ENABLED;
  const originalSchools = process.env.GOOGLE_FORMS_SCHOOL_IDS;
  process.env.GOOGLE_FORMS_ENABLED = "true";
  delete process.env.GOOGLE_FORMS_SCHOOL_IDS;
  t.after(() => {
    if (originalEnabled === undefined) delete process.env.GOOGLE_FORMS_ENABLED;
    else process.env.GOOGLE_FORMS_ENABLED = originalEnabled;
    if (originalSchools === undefined)
      delete process.env.GOOGLE_FORMS_SCHOOL_IDS;
    else process.env.GOOGLE_FORMS_SCHOOL_IDS = originalSchools;
  });
  t.mock.method(googleFormsOAuthService, "getAuthorizedClient", async () => ({
    auth: {},
  }));
  t.mock.method(google, "forms", () => ({
    forms: {
      get: async () => ({
        data: { settings: { emailCollectionType: "VERIFIED" } },
      }),
      responses: {
        list: async () => ({
          data: {
            responses: [
              {
                respondentEmail: "student@example.com",
                responseId: "response-1",
                lastSubmittedTime: "2026-11-05T12:00:00Z",
                totalScore: 5,
              },
            ],
          },
        }),
      },
    },
  }));
  t.mock.method(Student, "find", () => ({
    populate: () => ({
      select: async () => [{ _id: "student-1", email: "student@example.com" }],
    }),
  }));
  t.mock.method(GoogleFormSubmission, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));
  t.mock.method(GoogleFormSubmission, "findOneAndUpdate", async () => ({}));
  t.mock.method(GoogleFormGrading, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));
  t.mock.method(Grade, "findOne", () => ({
    select: () => ({ lean: async () => null }),
  }));
  const gradeWrites = [];
  t.mock.method(Grade, "findOneAndUpdate", async (filter, update, options) => {
    gradeWrites.push({ filter, update, options });
  });
  const assignment = {
    _id: "assignment-1",
    assignmentTypeKey: "classwork",
    title: "From colonies to new nation",
    maxMarks: 10,
    class: "class-1",
    subject: "subject-1",
    teacher: "teacher-1",
    academicYear: "year-1",
    metadata: {
      googleForm: { formId: "form-1", objectivePoints: 10, questions: [] },
    },
  };

  await syncGoogleQuizResponses({
    assignment,
    actorId: "teacher-1",
    schoolId: "school-1",
  });
  assignment.assignmentTypeKey = "quiz";
  await syncGoogleQuizResponses({
    assignment,
    actorId: "teacher-1",
    schoolId: "school-1",
  });

  assert.equal(gradeWrites[0].update.$set.category, "classwork");
  assert.equal(gradeWrites[0].update.$set.gradeType, "classwork");
  assert.equal(gradeWrites[0].update.$set.marks, 5);
  assert.equal(gradeWrites[0].options.upsert, true);
  assert.equal(gradeWrites[1].update.$set.category, "quiz");
  assert.equal(gradeWrites[1].update.$set.gradeType, "quiz");
});

test("normalizes supported quiz questions and trims their content", () => {
  const questions = validateGoogleFormQuestions([
    {
      type: "multiple_choice",
      title: "  Choose a color  ",
      options: [" Red ", "Blue", "Blue"],
      correctAnswer: " Red ",
      points: 2,
    },
    {
      type: "true_false",
      title: "The sky is blue.",
      correctAnswer: "True",
      points: 1,
    },
    {
      type: "short_answer",
      title: "Explain your answer.",
      points: 2,
      modelAnswer: "  Because particles move.  ",
      rubric: " Award 1 point for mentioning movement. ",
    },
  ]);

  assert.deepEqual(questions, [
    {
      type: "multiple_choice",
      title: "Choose a color",
      options: ["Red", "Blue"],
      correctAnswer: "Red",
      points: 2,
    },
    {
      type: "true_false",
      title: "The sky is blue.",
      options: ["True", "False"],
      correctAnswer: "True",
      points: 1,
    },
    {
      type: "short_answer",
      title: "Explain your answer.",
      points: 2,
      modelAnswer: "Because particles move.",
      rubric: "Award 1 point for mentioning movement.",
    },
  ]);
});

test("rejects missing questions and unsupported question types", () => {
  assert.throws(() => validateGoogleFormQuestions([]), /between 1 and 100/);
  assert.throws(
    () =>
      validateGoogleFormQuestions([
        {
          type: "paragraph",
          title: "Explain",
          points: 0,
        },
      ]),
    /supported type/,
  );
});

test("rejects invalid objective options, answer keys, and point values", () => {
  assert.throws(
    () =>
      validateGoogleFormQuestions([
        {
          type: "multiple_choice",
          title: "Choose one",
          options: ["Only one"],
          correctAnswer: "Only one",
          points: 1,
        },
      ]),
    /2 to 20 answer options/,
  );

  assert.throws(
    () =>
      validateGoogleFormQuestions([
        {
          type: "true_false",
          title: "True or false",
          correctAnswer: "Maybe",
          points: 1,
        },
      ]),
    /identify one of its answer options/,
  );

  assert.throws(
    () =>
      validateGoogleFormQuestions([
        {
          type: "multiple_choice",
          title: "Choose one",
          options: ["One", "Two"],
          correctAnswer: "One",
          points: 1.5,
        },
      ]),
    /at least 1 point/,
  );
});

test("short answers default to 1 point and accept any positive whole value", () => {
  const [question] = validateGoogleFormQuestions([
    {
      type: "short_answer",
      title: "Explain.",
      modelAnswer: "An answer.",
    },
  ]);
  assert.equal(question.points, DEFAULT_SHORT_ANSWER_POINTS);
  assert.equal(DEFAULT_SHORT_ANSWER_POINTS, 1);

  for (const points of [0, -1, 1.5, 1001, "many"]) {
    assert.throws(
      () =>
        validateGoogleFormQuestions([
          {
            type: "short_answer",
            title: "Explain.",
            modelAnswer: "An answer.",
            points,
          },
        ]),
      /between 1 and 1000 points/,
    );
  }
});

test("publishing requires a teacher-supplied model answer or rubric; drafts may wait", () => {
  const bare = [{ type: "short_answer", title: "Explain.", points: 1 }];
  assert.throws(
    () => validateGoogleFormQuestions(bare),
    /model answer or grading rubric before the quiz can be published/,
  );
  assert.deepEqual(
    validateGoogleFormQuestions(bare, { requireRubric: false }),
    [
      {
        type: "short_answer",
        title: "Explain.",
        points: 1,
        modelAnswer: "",
        rubric: "",
      },
    ],
  );

  assert.equal(
    validateGoogleFormQuestions([{ ...bare[0], modelAnswer: "An answer." }])
      .length,
    1,
  );
  assert.equal(
    validateGoogleFormQuestions([
      { ...bare[0], rubric: "1 point per concept." },
    ]).length,
    1,
  );
  assert.throws(
    () =>
      validateGoogleFormQuestions([
        { ...bare[0], modelAnswer: "   ", rubric: "  " },
      ]),
    /model answer or grading rubric/,
  );
});

test("short-answer references are capped and a pure short-answer quiz is valid", () => {
  assert.throws(
    () =>
      validateGoogleFormQuestions([
        {
          type: "short_answer",
          title: "Explain.",
          modelAnswer: "x".repeat(MAX_MODEL_ANSWER_CHARS + 1),
        },
      ]),
    /model answer must be at most/,
  );
  assert.throws(
    () =>
      validateGoogleFormQuestions([
        {
          type: "short_answer",
          title: "Explain.",
          rubric: "x".repeat(MAX_RUBRIC_CHARS + 1),
        },
      ]),
    /rubric must be at most/,
  );

  const pureShortAnswer = validateGoogleFormQuestions([
    { type: "short_answer", title: "First.", modelAnswer: "One." },
    {
      type: "short_answer",
      title: "Second.",
      rubric: "Award partial credit per concept.",
    },
  ]);
  assert.equal(pureShortAnswer.length, 2);
  assert.ok(pureShortAnswer.every((question) => question.points >= 1));
});
