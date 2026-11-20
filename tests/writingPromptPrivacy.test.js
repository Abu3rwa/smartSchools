import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setTimeout as delay } from "node:timers/promises";
/* global process -- the harness starts and stops the provider key and flags */

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import WritingFailureAlert from "../models/WritingFailureAlert.js";
import SpellingAnalysis from "../models/SpellingAnalysis.js";
import SpellingRetestItem from "../models/SpellingRetestItem.js";
import Student from "../models/Student.js";
import School from "../models/School.js";
import AiCreditAccount from "../models/AiCreditAccount.js";
import AiCreditEntry from "../models/AiCreditEntry.js";
import AiCreditSetting from "../models/AiCreditSetting.js";
import User from "../models/User.js";

import { assessDraft, saveAssessmentEdits } from "../services/writingAssistantAssessmentService.js";
import {
  buildComparisonPrompt,
  buildFeedbackPrompt,
  normalizeFeedback,
} from "../services/writingAssistantPrompts.js";
import {
  buildPieceEvidencePrompt,
  normalizePieceEvidence,
  promptSafeText,
} from "../services/writingAnalysisPrompts.js";
import { buildFeedbackEmail } from "../services/writingFeedbackEmailService.js";
import { listCreditHistory } from "../services/aiCreditService.js";
import {
  cleanGeneratedString,
  sanitizeGeneratedFields,
} from "../services/aiPromptSafety.js";
import {
  WRITING_PROMPT_VERSIONS,
  WRITING_SCHEMA_VERSION,
} from "../services/writingPromptVersions.js";

/*
 * Phase 1 probes. The prompt assertions read the body actually posted to the
 * provider, not a rebuilt string, so a future caller that forgets to pass the
 * name or the roster fails here rather than shipping a child's name.
 */

const oid = () => new mongoose.Types.ObjectId().toString();
const schoolId = oid();
const teacherId = oid();
const studentId = oid();
const classId = oid();
const assignmentId = oid();
const projectId = oid();
const draftId = oid();

const chain = (value) => {
  const query = {
    select: () => query,
    populate: () => query,
    sort: () => query,
    skip: () => query,
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

const snapshot = () => ({
  title: "Should school uniforms be required?",
  topic: "School uniforms",
  instructions: "Write three paragraphs. Sara Ahmed must give a reason.",
  writingType: "persuasive",
  expectedLevel: "Grade 5",
  minWords: 120,
  maxWords: 300,
  sections: [
    { key: "body", label: "Body", kind: "body", criteria: ["one reason"], instructions: "" },
  ],
  rubric: [{ key: "ideas", label: "Ideas", maxScore: 5, appliesToSections: ["*"] }],
});

const essayText =
  "I think uniforms are fair. My friend Mohammed Haddad agrees with me. " +
  "Sara Ahmed wrote this draft. Call me on 0912345678 or email sara@example.com.";

const draftDoc = (number = 1) => ({
  _id: draftId,
  school: schoolId,
  project: projectId,
  assignment: assignmentId,
  student: studentId,
  number,
  title: "Uniforms",
  totalWords: 30,
  sections: [{ key: "body", index: 0, label: "Body", text: essayText, words: 30 }],
  configSnapshot: snapshot(),
});

const assignmentDoc = () => ({
  _id: assignmentId,
  school: schoolId,
  assignedBy: teacherId,
  class: classId,
  audienceMode: "class",
  students: [],
  title: "Should school uniforms be required?",
  topic: "School uniforms",
  aiConstraints: "Keep it short. Ahmed should not use long words.",
  goals: [{ student: studentId, text: "Help Sara Ahmed add a reason." }],
  workflow: { teacherPublishesFeedback: true },
  rubric: snapshot().rubric,
  sections: snapshot().sections,
});

const projectDoc = () => ({
  _id: projectId,
  school: schoolId,
  assignment: assignmentId,
  student: studentId,
  latestDraft: draftId,
  stage: "submitted",
  status: "submitted",
  draftCount: 1,
  revisionLedger: [],
  save: async () => {},
});

const assessmentDoc = () => {
  const doc = {
    _id: oid(),
    school: schoolId,
    project: projectId,
    assignment: assignmentId,
    student: studentId,
    draft: draftId,
    kind: "feedback",
    aiStatus: "running",
    publish: { state: "draft" },
    sections: [],
    scores: [],
    tasks: [],
    set(values) {
      Object.assign(this, values);
    },
    save: async () => {},
    toObject() {
      return { ...this };
    },
  };
  return doc;
};

const replyBody = (fields) => ({
  model: "gpt-5.4-mini",
  choices: [{ message: { content: JSON.stringify(fields) } }],
  usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200 },
});

const goodReply = () => ({
  sections: [
    {
      key: "body",
      index: 0,
      strengths: ["{{student}} states a clear opinion."],
      improvements: ["Add one reason after the first sentence."],
      evidence: "I think uniforms are fair",
      why: "The task asks for a reason.",
      nextStep: "{{student}} should add a reason.",
      score: 3,
    },
  ],
  overall: {
    summary: "{{student}} has a clear opinion and needs one reason.",
    nextPriorities: ["Add a reason", "Check the spelling of fair"],
  },
  scores: [{ key: "ideas", score: 3, explanation: "One idea is held.", evidence: "I think uniforms are fair" }],
  spellingTargets: [],
  recommendation: { path: "revise", reason: "One more draft will help." },
});

/**
 * Every model call the assess path makes, plus the credit gate. The provider is
 * a stubbed fetch, so the assertions read the real request body.
 */
const withAssessStubs = async (
  t,
  {
    reply = goodReply(),
    number = 1,
    previousAssessment = null,
    gate = null,
    onCall = null,
    fetchError = null,
  } = {},
  run,
) => {
  const calls = { prompts: [], entries: [], unusable: [], alerts: [] };
  const doc = assessmentDoc();
  const project = projectDoc();
  // A revision round reads the feedback of the draft before this one; the two
  // drafts are different documents, as they are in the database.
  const previousDraftId = oid();

  const savedKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test";
  t.after(() => {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  });

  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.prompts.push(JSON.parse(init.body).messages[0].content);
    // K6 tests hold the provider here to see what the request answers meanwhile.
    if (onCall) onCall();
    if (gate) await gate;
    if (fetchError) throw fetchError;
    return { ok: true, status: 200, json: async () => replyBody(reply) };
  });

  const restores = [
    stub(WritingDraft, "findOne", (filter) =>
      chain(
        Number(filter.number)
          ? { ...draftDoc(number - 1), _id: previousDraftId }
          : draftDoc(number),
      ),
    ),
    stub(WritingProject, "findOne", async () => project),
    stub(WritingAssignment, "findOne", () => chain(assignmentDoc())),
    stub(Student, "findOne", () => chain({ _id: studentId, firstName: "Sara", lastName: "Ahmed" })),
    stub(Student, "find", () =>
      chain([
        { _id: studentId, firstName: "Sara", lastName: "Ahmed" },
        { _id: oid(), firstName: "Mohammed", lastName: "Haddad" },
      ]),
    ),
    stub(SpellingAnalysis, "findOne", () => chain(null)),
    stub(SpellingRetestItem, "find", () => chain([])),
    stub(School, "findOne", () => chain({ name: "Test School", reportSettings: { defaultLanguage: "english" } })),
    stub(AiCreditAccount, "findOne", () => chain({ balanceCents: 100000, paused: false })),
    stub(AiCreditSetting, "findOne", () => chain({ markupPercent: 30 })),
    stub(WritingAssessment, "find", () => chain([])),
    stub(WritingAssessment, "updateOne", async () => ({ modifiedCount: 0 })),
    stub(WritingAssessment, "findOne", (filter) => {
      if (filter.draft && filter["publish.state"]) return chain(null);
      if (filter.kind === "feedback" && filter.aiStatus === "done") {
        // Only the draft the row belongs to matches, as in the database.
        const ownsDraft =
          previousAssessment &&
          String(previousAssessment.draft) === String(filter.draft);
        return chain(ownsDraft ? previousAssessment : null);
      }
      return chain(null);
    }),
    stub(WritingAssessment, "create", async () => doc),
    stub(WritingFailureAlert, "updateOne", async () => ({ modifiedCount: 0 })),
    stub(WritingFailureAlert, "findOneAndUpdate", async (filter) => {
      calls.alerts.push({ code: filter.code });
      return {
        _id: oid(),
        school: filter.school,
        code: filter.code,
        count: 1,
        firstAt: new Date(),
        lastAt: new Date(),
        alertedAt: null,
      };
    }),
    stub(AiCreditEntry, "create", async (input) => {
      const row = Array.isArray(input) ? input[0] : input;
      calls.entries.push(row);
      return Array.isArray(input) ? [{ ...row, toObject: () => row }] : { ...row, toObject: () => row };
    }),
    stub(AiCreditEntry, "findByIdAndUpdate", async (filter, update) => {
      calls.unusable.push({ filter, update });
      return null;
    }),
    stub(AiCreditAccount, "findOneAndUpdate", () =>
      chain({ _id: oid(), balanceCents: 100000, schoolCents: 100000, lowBalanceCents: 0, alerts: {} }),
    ),
    stub(AiCreditAccount, "updateOne", async () => ({ modifiedCount: 1 })),
    stub(User, "findOne", () => chain(null)),
  ];
  t.mock.method(mongoose.connection, "transaction", async (callback) => callback({}));

  try {
    await run({ calls, doc, project, previousDraftId });
  } finally {
    restores.forEach((restore) => restore());
  }
};

const assess = () =>
  assessDraft({ schoolId, draftId, userId: teacherId, language: "en" });

const LEAKS = ["Sara", "Ahmed", "Mohammed", "Haddad", "0912345678", "sara@example.com"];

const assertNoLeaks = (prompt) => {
  for (const leak of LEAKS) {
    assert.equal(prompt.includes(leak), false, `prompt leaked ${leak}`);
  }
};

/* ------------------------------------------------------------------ */
/* What the provider actually receives                                 */
/* ------------------------------------------------------------------ */

test("the posted request carries no name, name part, phone, email or classmate", async (t) => {
  await withAssessStubs(t, {}, async ({ calls }) => {
    await assess();
    assert.equal(calls.prompts.length, 1);
    assertNoLeaks(calls.prompts[0]);
    assert.match(calls.prompts[0], /\{\{student\}\}/);
    assert.match(calls.prompts[0], /a classmate/);
  });
});

test("a revision round does not re-inject the name from stored feedback", async (t) => {
  const previousAssessment = {
    _id: oid(),
    sections: [
      { key: "body", index: 0, label: "Body", nextStep: "Sara Ahmed should add a reason.", improvements: [] },
    ],
    tasks: [{ id: "t1", text: "Sara Ahmed must fix the spelling of fair." }],
    overall: { nextPriorities: [] },
  };
  await withAssessStubs(t, { number: 2, previousAssessment }, async ({ calls, previousDraftId }) => {
    previousAssessment.draft = previousDraftId;
    await assess();
    assertNoLeaks(calls.prompts[0]);
    assert.match(calls.prompts[0], /Feedback given on draft 1/);
  });
});

test("the credit row keeps the student id and no name", async (t) => {
  await withAssessStubs(t, {}, async ({ calls }) => {
    await assess();
    assert.equal(calls.entries.length, 1);
    const [entry] = calls.entries;
    assert.equal(String(entry.student), String(studentId));
    assert.equal(entry.studentName, "");
  });
});

/* ------------------------------------------------------------------ */
/* What is stored                                                      */
/* ------------------------------------------------------------------ */

test("aiOriginal stays tokenised while the saved feedback is filled", async (t) => {
  await withAssessStubs(t, {}, async ({ doc }) => {
    await assess();
    assert.match(doc.aiOriginal.overall.summary, /\{\{student\}\}/);
    assert.equal(doc.aiOriginal.overall.summary.includes("Sara"), false);
    assert.match(doc.overall.summary, /Sara Ahmed/);
    assert.equal(doc.overall.summary.includes("{{student}}"), false);
  });
});

test("a finished assessment records which prompt made it and what it cost", async (t) => {
  await withAssessStubs(t, {}, async ({ doc }) => {
    await assess();
    assert.equal(doc.promptVersion, WRITING_PROMPT_VERSIONS.feedback);
    assert.equal(doc.schemaVersion, WRITING_SCHEMA_VERSION);
    assert.equal(doc.usage.totalTokens, 1200);
    assert.equal(typeof doc.usage.latencyMs, "number");
    assert.ok(doc.usage.latencyMs >= 0);
    // The facts stored alongside are counts of this draft, never model prose.
    assert.equal(doc.metrics.totalWords > 0, true);
    assert.equal("sections" in doc.metrics, false);
  });
});

test("a stated word count that contradicts the draft is corrected before storage", async (t) => {
  const reply = goodReply();
  reply.overall.summary =
    "{{student}} wrote 300 words and 12 sentences, with a clear opinion.";
  await withAssessStubs(t, { reply }, async ({ doc }) => {
    await assess();
    assert.equal(doc.overall.summary.includes("300 words"), false);
    assert.equal(doc.overall.summary.includes("12 sentences"), false);
    assert.match(doc.overall.summary, /\d+ words/);
    // The quote is the child's own words and stays as written.
    assert.match(doc.sections[0].evidence, /I think uniforms are fair/);
  });
});

test("the metrics kill switch drops the facts and scrub, not the stored record", async (t) => {
  const saved = process.env.WRITING_METRICS;
  process.env.WRITING_METRICS = "0";
  t.after(() => {
    if (saved === undefined) delete process.env.WRITING_METRICS;
    else process.env.WRITING_METRICS = saved;
  });
  const reply = goodReply();
  reply.overall.summary = "{{student}} wrote 300 words.";
  await withAssessStubs(t, { reply }, async ({ doc, calls }) => {
    await assess();
    assert.doesNotMatch(calls.prompts[0], /Draft facts/);
    assert.match(doc.overall.summary, /300 words/);
    // The computed facts are still stored: the switch changes the prompt only.
    assert.equal(doc.metrics.totalWords > 0, true);
  });
});

test("a religious formula in the reply is removed before it is stored", async (t) => {
  const reply = goodReply();
  reply.overall.summary = "{{student}} has a clear opinion, God willing.";
  await withAssessStubs(t, { reply }, async ({ doc }) => {
    await assess();
    assert.equal(doc.overall.summary.includes("God willing"), false);
    assert.match(doc.overall.summary, /clear opinion/);
  });
});

test("a reply that cannot be made safe is refused, not stored", async (t) => {
  const reply = goodReply();
  reply.overall.summary = "This draft is stupid.";
  await withAssessStubs(t, { reply }, async ({ doc }) => {
    await assert.rejects(assess(), (error) => {
      assert.equal(error.statusCode, 422);
      return true;
    });
    assert.equal(doc.aiStatus, "failed");
    assert.equal(doc.overall, undefined);
  });
});

test("a provider failure feeds the admin outage monitor", async (t) => {
  await withAssessStubs(
    t,
    { fetchError: new Error("Provider gateway unreachable") },
    async ({ calls, doc }) => {
      await assert.rejects(assess(), (error) => {
        assert.equal(error.statusCode, 422);
        return true;
      });
      await delay(0);
      assert.equal(doc.aiStatus, "failed");
      assert.equal(calls.alerts.length, 1);
      assert.equal(calls.alerts[0].code, "AI_PROVIDER_ERROR");
    },
  );
});

/* ------------------------------------------------------------------ */
/* K6: a detached run outlives the request                             */
/* ------------------------------------------------------------------ */

test("a detached run answers with the claimed row before the provider replies", async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let providerReached;
  const reached = new Promise((resolve) => {
    providerReached = resolve;
  });
  await withAssessStubs(t, { gate, onCall: providerReached }, async ({ doc, project }) => {
    const result = await assessDraft({
      schoolId,
      draftId,
      userId: teacherId,
      language: "en",
      force: true,
      detached: true,
    });
    // The request is answered while the provider is still holding the reply;
    // the claimed row is what the review panel polls from here on.
    assert.equal(result.pending, true);
    assert.equal(doc.aiStatus, "running");
    await reached;
    assert.equal(doc.aiStatus, "running");
    assert.equal(project.stage, "submitted");

    release();
    for (let i = 0; i < 100 && doc.aiStatus !== "done"; i += 1) {
      await delay(5);
    }
    assert.equal(doc.aiStatus, "done");
    assert.match(doc.overall.summary, /Sara Ahmed/);
  });
});

/* ------------------------------------------------------------------ */
/* Prompt shapes, without the database                                 */
/* ------------------------------------------------------------------ */

const promptFor = (extra = {}) =>
  buildFeedbackPrompt({
    snapshot: snapshot(),
    draft: draftDoc(),
    studentName: "Sara Ahmed",
    roster: ["Mohammed Haddad"],
    goal: "Help Sara Ahmed add a reason.",
    aiConstraints: "Keep it short. Ahmed should not use long words.",
    language: "en",
    ...extra,
  });

test("the comparison prompt scrubs the same fields as the feedback prompt", () => {
  const prompt = buildComparisonPrompt({
    snapshot: snapshot(),
    previousDraft: draftDoc(1),
    currentDraft: draftDoc(2),
    previousAssessment: {
      sections: [{ key: "body", label: "Body", nextStep: "Sara Ahmed should add a reason." }],
      tasks: [{ id: "t1", text: "Sara Ahmed must fix fair." }],
    },
    studentName: "Sara Ahmed",
    roster: ["Mohammed Haddad"],
    goal: "Help Sara Ahmed add a reason.",
    aiConstraints: "Ahmed should not use long words.",
    language: "en",
  });
  assertNoLeaks(prompt);
});

test("a common-word name leaves the essay readable", () => {
  const prompt = buildFeedbackPrompt({
    snapshot: snapshot(),
    draft: {
      number: 1,
      sections: [{ key: "body", index: 0, text: "I may go out. It will rain. We hope it is fun." }],
    },
    studentName: "May",
    language: "en",
  });
  assert.match(prompt, /I may go out\. It will rain\. We hope it is fun\./);
});

test("a quote of the tokenised draft is kept as real evidence", () => {
  const result = normalizeFeedback({
    parsed: {
      sections: [
        { key: "body", index: 0, evidence: "{{student}} wrote this draft", nextStep: "Add a reason." },
      ],
      overall: { summary: "A clear opinion." },
    },
    draft: draftDoc(),
    snapshot: snapshot(),
    studentName: "Sara Ahmed",
    roster: ["Mohammed Haddad"],
  });
  assert.equal(result.ok, true);
  assert.equal(result.sections[0].evidence, "{{student}} wrote this draft");
});

test("a model's own spelling of the name slot becomes the one token", () => {
  const result = normalizeFeedback({
    parsed: {
      sections: [{ key: "body", index: 0, nextStep: "{{student_name}} should add a reason." }],
      overall: { summary: "{{name}} has a clear opinion. {{anything}} else." },
    },
    draft: draftDoc(),
    snapshot: snapshot(),
    studentName: "Sara Ahmed",
  });
  assert.equal(result.sections[0].nextStep, "{{student}} should add a reason.");
  assert.equal(result.overall.summary, "{{student}} has a clear opinion. else.");
});

test("the prompt shape probe covers a goal and constraints that name the child", () => {
  assertNoLeaks(promptFor());
});
/* ------------------------------------------------------------------ */
/* The analysis prompt is the reference implementation                 */
/* ------------------------------------------------------------------ */

test("the analysis prompt carries no name, phone, email or classmate", () => {
  const prompt = buildPieceEvidencePrompt({
    text: essayText,
    standards: [{ standard: "std1", code: "R.1", name: "States an opinion" }],
    writingType: "persuasive",
    studentName: "Sara Ahmed",
    roster: ["Mohammed Haddad"],
  });
  assertNoLeaks(prompt);
  assert.match(prompt, /a classmate/);
});

test("a common-word name leaves the analysed piece readable", () => {
  const safe = promptSafeText("I may go out. It will rain. We hope it is fun.", "May");
  assert.equal(safe, "I may go out. It will rain. We hope it is fun.");
});

test("a quote that names a classmate is still verified against the piece", () => {
  const result = normalizePieceEvidence({
    parsed: {
      standards: [
        {
          key: "S1",
          opportunity: true,
          judgment: "met",
          quote: "My friend a classmate is coming",
          note: "Names a friend in the opening.",
        },
      ],
    },
    text: "My friend Mohammed is coming. I think it is fair.",
    standards: [{ standard: "std1", code: "R.1", name: "States an opinion" }],
    studentName: "Sara Ahmed",
  });
  assert.equal(result.ok, true);
  assert.equal(result.quotesKept, 1);
  assert.equal(result.standards[0].quote, "My friend a classmate is coming");
});

test("a classmate quote that was invented is dropped", () => {
  const result = normalizePieceEvidence({
    parsed: {
      standards: [
        {
          key: "S1",
          opportunity: true,
          judgment: "met",
          quote: "My friend a classmate won the race yesterday",
          note: "Names a friend.",
        },
      ],
    },
    text: "My friend Mohammed is coming. I think it is fair.",
    standards: [{ standard: "std1", code: "R.1", name: "States an opinion" }],
    studentName: "Sara Ahmed",
  });
  assert.equal(result.standards[0].quote, "");
  assert.equal(result.quotesDropped, 1);
});

/* ------------------------------------------------------------------ */
/* A teacher edit is inspected before it is stored                     */
/* ------------------------------------------------------------------ */

const editableAssessment = () => ({
  _id: oid(),
  school: schoolId,
  project: projectId,
  assignment: assignmentId,
  draft: draftId,
  kind: "feedback",
  aiStatus: "done",
  publish: { state: "draft" },
  sections: [
    {
      key: "body",
      index: 0,
      strengths: [],
      improvements: [],
      evidence: "",
      why: "",
      nextStep: "Add a reason.",
      score: 3,
      maxScore: 5,
    },
  ],
  overall: { summary: "A clear opinion.", nextPriorities: [] },
  scores: [],
  tasks: [],
  set(values) {
    Object.assign(this, values);
  },
  save: async () => {},
  toObject() {
    return { ...this };
  },
});

const withEditStubs = (t, run, doc = editableAssessment()) => {
  const restores = [
    stub(WritingAssessment, "findOne", async () => doc),
    stub(WritingProject, "findOne", async () => ({
      _id: projectId,
      stage: "submitted",
      status: "submitted",
      draftCount: 1,
    })),
    stub(WritingAssignment, "findOne", () => chain({ assignedBy: teacherId })),
  ];
  t.after(() => restores.forEach((restore) => restore()));
  return run(doc);
};

test("a teacher edit that would hurt a child is refused and not saved", async (t) => {
  await withEditStubs(t, async (doc) => {
    await assert.rejects(
      saveAssessmentEdits({
        schoolId,
        assessmentId: String(doc._id),
        userId: teacherId,
        payload: { sections: [{ key: "body", index: 0, nextStep: "This is stupid." }] },
      }),
      (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /cannot be sent to a child/);
        assert.match(error.message, /stupid/);
        return true;
      },
    );
    assert.equal(doc.sections[0].nextStep, "Add a reason.");
  });
});

test("a teacher edit that is safe is saved", async (t) => {
  await withEditStubs(t, async (doc) => {
    await saveAssessmentEdits({
      schoolId,
      assessmentId: String(doc._id),
      userId: teacherId,
      payload: { overall: { summary: "{{student}} states a clear opinion." } },
    });
    assert.equal(doc.overall.summary, "{{student}} states a clear opinion.");
  });
});

test("a teacher's own mark is recorded over the server's clamp", async (t) => {
  const doc = editableAssessment();
  doc.scoreAdjustments = [
    { target: "section", key: "body", index: 0, from: 4, to: 1, reason: "empty_section" },
    { target: "score", key: "ideas", from: 5, to: 2, reason: "empty_section" },
  ];
  doc.scores = [
    { key: "ideas", label: "Ideas", score: 2, maxScore: 5, explanation: "", evidence: "" },
  ];
  await withEditStubs(
    t,
    async (saved) => {
      await saveAssessmentEdits({
        schoolId,
        assessmentId: String(saved._id),
        userId: teacherId,
        payload: {
          sections: [{ key: "body", index: 0, score: 4 }],
          scores: [{ key: "ideas", score: 5 }],
        },
      });
      assert.equal(saved.sections[0].score, 4);
      assert.equal(saved.scores[0].score, 5);
      assert.equal(saved.scoreAdjustments[0].overriddenByTeacher, true);
      assert.equal(saved.scoreAdjustments[1].overriddenByTeacher, true);
      assert.equal(saved.scoreAdjustments[0].from, 4);
    },
    doc,
  );
});

/* ------------------------------------------------------------------ */
/* Inspection units                                                    */
/* ------------------------------------------------------------------ */

test("a generated string keeps its wording but loses a formula", () => {
  const result = cleanGeneratedString("A clear opinion, God willing.");
  assert.equal(result.problems.length, 0);
  assert.equal(result.text, "A clear opinion.");
});

test("an unsalvageable generated string reports the problem and the path", () => {
  const result = sanitizeGeneratedFields({
    overall: { summary: "This draft is stupid." },
    sections: [{ key: "body", nextStep: "Add a reason." }],
  });
  assert.deepEqual(result.problems, [
    { path: "overall.summary", problem: "inappropriate-language:stupid" },
  ]);
  assert.equal(result.value.sections[0].nextStep, "Add a reason.");
});

test("a verbatim quote is never rewritten by the inspector", () => {
  const result = sanitizeGeneratedFields(
    { sections: [{ key: "body", evidence: "the stupid goat ran" }] },
    { skipKeys: ["evidence"] },
  );
  assert.equal(result.problems.length, 0);
  assert.equal(result.value.sections[0].evidence, "the stupid goat ran");
});

/* ------------------------------------------------------------------ */
/* The name is resolved where it is shown                              */
/* ------------------------------------------------------------------ */

test("the family email fills a name slot added after the AI run", () => {
  const email = buildFeedbackEmail({
    role: "parent",
    language: "en",
    studentName: "Sara Ahmed",
    schoolName: "Test School",
    assignment: { title: "Uniforms" },
    project: { stage: "published" },
    draft: { number: 1, totalWords: 30, sections: [{ key: "body", label: "Body", text: essayText }] },
    assessment: {
      sections: [
        { key: "body", index: 0, strengths: [], improvements: [], evidence: "", nextStep: "{{student}} should add a reason." },
      ],
      overall: { summary: "{{student}} has a clear opinion." },
      scores: [],
      tasks: [],
      spellingTargets: [],
    },
  });
  const html = `${email.html || ""}${email.text || ""}`;
  assert.equal(/\{\{/.test(html), false, "no token may reach the family");
  assert.match(html, /Sara Ahmed/);
});

test("credit history resolves the student's name at display time", async (t) => {
  const restores = [
    stub(AiCreditEntry, "find", () =>
      chain([
        {
          _id: oid(),
          type: "usage",
          feature: "writing",
          student: studentId,
          studentName: "",
        },
      ]),
    ),
    stub(AiCreditEntry, "countDocuments", async () => 1),
    stub(Student, "find", () =>
      chain([{ _id: studentId, firstName: "Sara", lastName: "Ahmed" }]),
    ),
  ];
  t.after(() => restores.forEach((restore) => restore()));
  const history = await listCreditHistory({ schoolId, userId: teacherId });
  assert.equal(history.rows[0].studentName, "Sara Ahmed");
});
