import assert from "node:assert/strict";
import test from "node:test";
import process from "node:process";
import { setTimeout } from "node:timers";
import GoogleFormGrading from "../models/GoogleFormGrading.js";
import { googleFormResponseVersion } from "../services/googleFormsAssignmentService.js";
import {
  buildGradingPrompt,
  gradeGoogleFormSubmission,
  normalizeGrades,
} from "../services/googleFormsGradingService.js";

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_VISION_MODEL",
  "OPENAI_FALLBACK_MODEL",
  "OPENAI_BASE_URL",
];

const withOpenAiEnv = (t) => {
  const saved = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.OPENAI_API_KEY = "sk-test";
  t.after(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
};

const openAiReply = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 400, completion_tokens: 120, total_tokens: 520 },
  }),
});

const assignment = {
  _id: "assignment-1",
  metadata: {
    googleForm: {
      questions: [
        {
          questionId: "q1",
          type: "multiple_choice",
          points: 2,
          title: "Pick one",
          options: ["A", "B"],
          correctAnswer: "A",
        },
        {
          questionId: "q2",
          type: "short_answer",
          points: 2,
          title: "Why do gases spread?",
          modelAnswer: "Particles move quickly.",
          rubric: "1 point for mentioning movement.",
        },
        {
          questionId: "q3",
          type: "short_answer",
          points: 1,
          title: "Name a state of matter.",
          modelAnswer: "Solid",
          rubric: "",
        },
      ],
    },
  },
};

const makeSubmission = (
  answers = [
    { questionId: "q2", values: ["Because their particles move fast."] },
    { questionId: "q3", values: ["Liquid"] },
  ],
) => ({
  _id: "submission-1",
  school: "school-1",
  student: "student-1",
  studentEmail: "private@school.test",
  answers,
});

const setup = (t, { existing = null, reply, fetchImpl } = {}) => {
  withOpenAiEnv(t);
  const calls = { writes: [], prompts: [] };
  t.mock.method(GoogleFormGrading, "findOne", () => ({
    lean: async () => existing,
  }));
  t.mock.method(
    GoogleFormGrading,
    "findOneAndUpdate",
    async (filter, update, options) => {
      calls.writes.push({ filter, update, options });
      return {};
    },
  );
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.prompts.push(JSON.parse(init.body).messages.at(-1).content);
    if (fetchImpl) return fetchImpl();
    return openAiReply(
      typeof reply === "string" ? reply : JSON.stringify(reply),
    );
  });
  return calls;
};

const grade = (submission = makeSubmission()) =>
  gradeGoogleFormSubmission({ assignment, submission });

test("the prompt carries the reference, the untrusted-data rule and no student identity", () => {
  const prompt = buildGradingPrompt([
    {
      questionId: "q2",
      question: "Why do gases spread?",
      points: 2,
      modelAnswer: "Particles move quickly.",
      rubric: "1 point for movement.",
      answer: "Porque sus partículas se mueven rápido.",
    },
  ]);
  assert.match(prompt, /Grade by meaning, not exact wording/);
  assert.match(prompt, /UNTRUSTED DATA/);
  assert.match(prompt, /PRIVACY \(must always hold\)/);
  assert.match(prompt, /CONTENT SAFETY \(must always hold\)/);
  assert.match(prompt, /Particles move quickly\./);
  assert.match(
    prompt,
    /primary language used by the question and its grading reference/i,
  );
  assert.match(prompt, /do not switch feedback to the answer's language/i);
});

test("valid suggestions are persisted and earlier approvals survive a regrade", async (t) => {
  const submission = makeSubmission();
  const calls = setup(t, {
    existing: {
      status: "stale",
      responseVersion: "an-older-version",
      questions: [
        {
          questionId: "q2",
          approvedScore: 1.5,
          approvedFeedback: "Earlier approval.",
        },
      ],
    },
    reply: {
      grades: [
        { questionId: "q2", score: 2, feedback: "Correct meaning." },
        { questionId: "q3", score: 0.5, feedback: "Partly right." },
      ],
    },
  });

  const summary = await grade(submission);
  assert.deepEqual(summary, { skipped: false, graded: 2, failed: 0 });
  assert.equal(calls.writes.length, 1);
  const update = calls.writes[0].update.$set;
  assert.equal(update.status, "suggested");
  assert.equal(
    update.responseVersion,
    googleFormResponseVersion(submission.answers),
  );
  const q2 = update.questions.find((entry) => entry.questionId === "q2");
  assert.equal(q2.suggestedScore, 2);
  assert.equal(q2.approvedScore, 1.5);
  assert.equal(q2.approvedFeedback, "Earlier approval.");
  assert.equal(
    update.questions.find((entry) => entry.questionId === "q3").suggestedScore,
    0.5,
  );
  assert.equal(calls.prompts.length, 1);
  assert.doesNotMatch(calls.prompts[0], /private@school\.test/);
  assert.doesNotMatch(calls.prompts[0], /student-1/);
});

test("out-of-range scores become per-question errors while valid ones are kept", async (t) => {
  const calls = setup(t, {
    reply: {
      grades: [
        { questionId: "q2", score: 5, feedback: "Too generous." },
        { questionId: "q3", score: 0.5, feedback: "Partly right." },
      ],
    },
  });
  const summary = await grade();

  assert.deepEqual(summary, { skipped: false, graded: 1, failed: 1 });
  const questions = calls.writes[0].update.$set.questions;
  const q2 = questions.find((entry) => entry.questionId === "q2");
  assert.equal(q2.suggestedScore, null);
  assert.match(q2.error, /usable score/);
  assert.equal(
    questions.find((entry) => entry.questionId === "q3").suggestedScore,
    0.5,
  );
  assert.equal(calls.writes[0].update.$set.status, "suggested");
});

test("a wholly malformed reply fails without inventing any score", async (t) => {
  const calls = setup(t, { reply: { grades: "not a list" } });
  const summary = await grade();

  assert.deepEqual(summary, { skipped: false, graded: 0, failed: 2 });
  const update = calls.writes[0].update.$set;
  assert.equal(update.status, "failed");
  assert.ok(update.questions.every((entry) => entry.suggestedScore === null));
});

test("empty answers score zero deterministically and cost no AI call", async (t) => {
  const calls = setup(t, { reply: { grades: [] } });
  const summary = await grade(
    makeSubmission([{ questionId: "q2", values: ["   "] }]),
  );

  assert.deepEqual(summary, { skipped: false, graded: 2, failed: 0 });
  assert.equal(calls.prompts.length, 0);
  const questions = calls.writes[0].update.$set.questions;
  assert.ok(questions.every((entry) => entry.suggestedScore === 0));
});

test("an unchanged suggested or approved response is skipped without a new charge", async (t) => {
  const submission = makeSubmission();
  for (const status of ["suggested", "approved"]) {
    const calls = setup(t, {
      existing: {
        status,
        responseVersion: googleFormResponseVersion(submission.answers),
      },
      reply: { grades: [] },
    });
    const summary = await grade(submission);

    assert.deepEqual(summary, { skipped: true, graded: 0, failed: 0 });
    assert.equal(calls.prompts.length, 0);
    assert.equal(calls.writes.length, 0);
  }
});

test("quizzes without short answers refuse grading", async (t) => {
  setup(t, { reply: { grades: [] } });
  const objectiveOnly = {
    metadata: {
      googleForm: { questions: [assignment.metadata.googleForm.questions[0]] },
    },
  };
  await assert.rejects(
    () =>
      gradeGoogleFormSubmission({
        assignment: objectiveOnly,
        submission: makeSubmission(),
      }),
    (error) => error.code === "NO_SHORT_ANSWERS" && error.statusCode === 400,
  );
});

test("a transport failure is stored as failed, never as a zero grade", async (t) => {
  const calls = setup(t, {
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  const summary = await grade();

  assert.equal(summary.graded, 0);
  assert.equal(summary.failed, 2);
  const update = calls.writes[0].update.$set;
  assert.equal(update.status, "failed");
  assert.ok(
    update.questions.every(
      (entry) => entry.suggestedScore === null && entry.error,
    ),
  );
});

test("one invalid JSON reply is retried once before giving up", async (t) => {
  withOpenAiEnv(t);
  t.mock.method(GoogleFormGrading, "findOne", () => ({
    lean: async () => null,
  }));
  t.mock.method(GoogleFormGrading, "findOneAndUpdate", async () => ({}));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return openAiReply(
      calls === 1
        ? "Sorry, I cannot grade that."
        : JSON.stringify({
            grades: [
              { questionId: "q2", score: 2, feedback: "Right." },
              { questionId: "q3", score: 1, feedback: "Right." },
            ],
          }),
    );
  });

  const summary = await grade();
  assert.equal(calls, 2);
  assert.equal(summary.graded, 2);
});

test("a second concurrent run for the same response is refused", async (t) => {
  setup(t, {
    fetchImpl: () =>
      new Promise((resolve) => {
        setTimeout(
          () =>
            resolve(
              openAiReply(
                JSON.stringify({
                  grades: [
                    { questionId: "q2", score: 2, feedback: "Right." },
                    { questionId: "q3", score: 1, feedback: "Right." },
                  ],
                }),
              ),
            ),
          40,
        );
      }),
  });
  const [first, second] = await Promise.allSettled([grade(), grade()]);

  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  assert.equal(second.reason.code, "GRADING_IN_PROGRESS");
});

test("partial credit is rounded to two decimals and capped by the question points", () => {
  const items = [{ questionId: "q2", points: 2 }];
  const [rounded] = normalizeGrades(
    { grades: [{ questionId: "q2", score: 1.257, feedback: " ok " }] },
    items,
  );
  assert.equal(rounded.suggestedScore, 1.26);
  assert.equal(rounded.suggestedFeedback, "ok");

  const [negative] = normalizeGrades(
    { grades: [{ questionId: "q2", score: -1 }] },
    items,
  );
  assert.equal(negative.suggestedScore, null);
  const [missing] = normalizeGrades({ grades: [] }, items);
  assert.equal(missing.suggestedScore, null);
});
