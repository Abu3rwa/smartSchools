import assert from "node:assert/strict";
import test from "node:test";
import { AITokenUsage } from "../models/AITokenUsage.js";
import aiService from "../services/aiservice.js";
import liveLessonMarkDraftService, { MAX_DRAFT_ANSWERS } from "../services/liveLessonMarkDraftService.js";

const schoolId = "507f1f77bcf86cd799439012";
const teacherId = "507f1f77bcf86cd799439014";

const entry = (index, overrides = {}) => ({
  studentId: `student-${index}`,
  level: null,
  prompt: "Why does the character lie?",
  guidance: "Name the motive.",
  expected: "",
  answer: `He is afraid of the guard, so he lies. [${index}]`,
  ...overrides,
});

/** What the feature asked, and what it billed, without touching a network or a database. */
const stubGenerate = (t, handler) => {
  const calls = { prompts: [], usage: [] };
  t.mock.method(aiService, "generateStructuredJson", async ({ prompt }) => {
    calls.prompts.push(prompt);
    return handler(prompt);
  });
  t.mock.method(AITokenUsage, "create", async (payload) => {
    calls.usage.push(payload);
    return { _id: teacherId };
  });
  return calls;
};

const draftMarks = (t, options) => liveLessonMarkDraftService.draftMarks({
  schoolId,
  userId: teacherId,
  maxMarks: 2,
  ...options,
});

const reply = (drafts) => () => ({
  parsed: { drafts },
  text: "",
  tokenUsage: { input: 40, output: 20, total: 60 },
  modelName: "gemini-2.5-flash-lite",
});

test("every answer the teacher waits on gets a suggestion, on the question's own scale", async (t) => {
  const calls = stubGenerate(t, reply([
    { ref: "a1", marks: 1.4, confidence: "high", feedback: "Name the motive next time." },
    // overshoots the allocation and rambles: both are brought back inside the question
    { ref: "a2", marks: 9, confidence: "medium", feedback: "x".repeat(900) },
    // a ref that was never offered, and a repeated one, cannot reach the mark sheet
    { ref: "a9", marks: 2, confidence: "high", feedback: "invented" },
    { ref: "a1", marks: 0, confidence: "low", feedback: "duplicate" },
  ]));

  const result = await draftMarks(t, { entries: [entry(1), entry(2)] });

  assert.equal(result.unavailable, false);
  assert.deepEqual(result.drafts, [
    { studentId: "student-1", marks: 1.5, feedback: "Name the motive next time.", confidence: "high" },
    { studentId: "student-2", marks: 2, feedback: "x".repeat(400), confidence: "medium" },
  ]);
  assert.match(calls.prompts[0], /worth 2 marks/);
  assert.match(calls.prompts[0], /Why does the character lie\?/);
  assert.match(calls.prompts[0], /He is afraid of the guard/);
  // a student is only ever a ref: neither their id nor their name leaves the server
  assert.equal(calls.prompts[0].includes("student-1"), false);
  assert.equal(calls.usage.length, 1);
  assert.equal(calls.usage[0].feature, "live_lesson_mark_draft");
  assert.equal(calls.usage[0].totalTokens, 60);
});

test("a model that is not working leaves the queue exactly as it was", async (t) => {
  const broken = new Error("AI service request failed (gemini-2.5-flash-lite): unavailable");
  broken.statusCode = 503;
  stubGenerate(t, () => { throw broken; });

  assert.deepEqual(
    await draftMarks(t, { entries: [entry(1)] }),
    { drafts: [], unavailable: true, reason: "unavailable" },
  );
});

test("a school that has used up its allowance is told so in its own words", async (t) => {
  const throttled = new Error("AI service request failed: quota exceeded");
  throttled.statusCode = 429;
  stubGenerate(t, () => { throw throttled; });

  const result = await draftMarks(t, { entries: [entry(1)] });
  assert.equal(result.unavailable, true);
  assert.equal(result.reason, "credit_limit");
  assert.deepEqual(result.drafts, []);
});

test("a question nobody has answered asks nothing at all", async (t) => {
  const calls = stubGenerate(t, reply([]));

  assert.deepEqual(
    await draftMarks(t, { entries: [] }),
    { drafts: [], unavailable: false, reason: "nothing_to_draft" },
  );
  assert.equal(calls.prompts.length, 0);
  assert.equal(calls.usage.length, 0);
});

test("an answer about students nobody submitted is refused, not half-believed", async (t) => {
  stubGenerate(t, reply([{ ref: "a7", marks: 1, confidence: "high", feedback: "well done" }]));

  assert.deepEqual(
    await draftMarks(t, { entries: [entry(1)] }),
    { drafts: [], unavailable: true, reason: "unavailable" },
  );
});

test("one call covers a class, and a bigger one is cut back before it is asked", async (t) => {
  const calls = stubGenerate(t, reply([]));

  const result = await draftMarks(t, {
    entries: Array.from({ length: MAX_DRAFT_ANSWERS + 25 }, (_, index) => entry(index + 1)),
  });

  const asked = JSON.parse(calls.prompts[0].split("Answers:\n")[1].split("\n\nRequired JSON schema")[0]);
  assert.equal(asked.length, MAX_DRAFT_ANSWERS);
  assert.equal(result.unavailable, true);
});
