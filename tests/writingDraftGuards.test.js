import test from "node:test";
import assert from "node:assert/strict";

import { guardScores } from "../services/writingScoreGuards.js";
import { draftPrecheck } from "../services/writingDraftPrecheck.js";
import { computeDraftMetrics } from "../services/writingDraftMetrics.js";

const snapshot = {
  sections: [
    { key: "introduction", required: true, kind: "opening" },
    { key: "body", required: true, kind: "body" },
    { key: "counterargument", required: false, kind: "counterargument" },
  ],
};

const counterDraft = {
  number: 1,
  sections: [
    { key: "introduction", index: 0, label: "Introduction", text: "I think we should have less homework every night." },
    { key: "body", index: 0, label: "Body", text: "In Finland students have about thirty minutes of homework a night." },
    {
      key: "counterargument",
      index: 0,
      label: "Counterargument",
      text: "Some people think homework teaches time management. But I disagree because children need time to play.",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Score guards (C3/A9)                                                */
/* ------------------------------------------------------------------ */

test("an empty section earns nothing, whatever the model said", () => {
  const metrics = computeDraftMetrics({
    draft: {
      number: 1,
      sections: [{ key: "introduction", index: 0, text: "" }],
    },
  });
  const guarded = guardScores({
    sections: [{ key: "introduction", index: 0, score: 3, maxScore: 5 }],
    scores: [],
    snapshot,
    metrics,
  });
  assert.equal(guarded.sections[0].score, 0);
  assert.deepEqual(guarded.adjustments, [
    {
      target: "section",
      key: "introduction",
      index: 0,
      from: 3,
      to: 0,
      reason: "empty_section",
    },
  ]);
});

test("a rebuttal that names the other side but uses no lesson fact cannot score full marks", () => {
  const metrics = computeDraftMetrics({ draft: counterDraft });
  const sections = [
    { key: "introduction", index: 0, score: 4, maxScore: 5 },
    { key: "counterargument", index: 0, score: 5, maxScore: 5 },
  ];
  const guarded = guardScores({
    sections,
    scores: [],
    snapshot,
    metrics,
    packCoverage: { bySection: { "counterargument:0": [] } },
  });
  assert.equal(guarded.sections[1].score, 4);
  assert.equal(guarded.adjustments[0].reason, "rebuttal_without_pack_evidence");
});

test("a rebuttal that cites a lesson fact keeps its full marks", () => {
  const metrics = computeDraftMetrics({ draft: counterDraft });
  const guarded = guardScores({
    sections: [{ key: "counterargument", index: 0, score: 5, maxScore: 5 }],
    scores: [],
    snapshot,
    metrics,
    packCoverage: { bySection: { "counterargument:0": ["f2"] } },
  });
  assert.equal(guarded.sections[0].score, 5);
  assert.deepEqual(guarded.adjustments, []);
});

test("with no pack the rebuttal guard stays off", () => {
  const metrics = computeDraftMetrics({ draft: counterDraft });
  const guarded = guardScores({
    sections: [{ key: "counterargument", index: 0, score: 5, maxScore: 5 }],
    scores: [],
    snapshot,
    metrics,
    packCoverage: null,
  });
  assert.equal(guarded.sections[0].score, 5);
  assert.deepEqual(guarded.adjustments, []);
});

test("a missing required section caps organisation marks and names what is missing", () => {
  const metrics = computeDraftMetrics({ draft: counterDraft });
  const scores = [
    { key: "organisation", label: "Organisation", score: 5, maxScore: 5 },
    { key: "ideas", label: "Ideas", score: 5, maxScore: 5 },
  ];
  const guarded = guardScores({
    sections: [],
    scores,
    snapshot: {
      ...snapshot,
      sections: [
        ...snapshot.sections,
        { key: "conclusion", required: true, kind: "conclusion" },
      ],
    },
    metrics,
  });
  assert.equal(guarded.scores[0].score, 4);
  assert.equal(guarded.scores[1].score, 5);
  assert.equal(guarded.adjustments[0].reason, "missing_required_section");
  assert.equal(guarded.adjustments[0].detail, "conclusion");
});

test("organisation marks below the maximum are left alone", () => {
  const metrics = computeDraftMetrics({ draft: counterDraft });
  const guarded = guardScores({
    sections: [],
    scores: [{ key: "organisation", label: "Organisation", score: 3, maxScore: 5 }],
    snapshot,
    metrics,
  });
  assert.equal(guarded.scores[0].score, 3);
  assert.deepEqual(guarded.adjustments, []);
});

/* ------------------------------------------------------------------ */
/* Pre-checks (A10)                                                    */
/* ------------------------------------------------------------------ */

const precheckFor = (draft, assignment = { minWords: 40 }) => {
  const metrics = computeDraftMetrics({ draft });
  return draftPrecheck({ assignment, draft, metrics });
};

test("an empty draft is answered without an AI run", () => {
  const result = precheckFor({
    number: 1,
    sections: [{ key: "body", index: 0, text: "" }],
  });
  assert.equal(result.code, "empty");
  assert.match(result.guidance, /No feedback was generated and no credit was used/);
  assert.match(result.childMessage, /Write a first sentence/);
});

test("a draft below the task's own minimum stops before a run", () => {
  const result = precheckFor({
    number: 1,
    sections: [{ key: "body", index: 0, text: "I like writing. It is fun." }],
  });
  assert.equal(result.code, "below_minimum");
  assert.match(result.guidance, /has 6 words/);
  assert.match(result.guidance, /at least 40/);
});

test("a single-sentence draft asks for sentences, not feedback", () => {
  const result = precheckFor(
    {
      number: 1,
      sections: [
        {
          key: "body",
          index: 0,
          text: "I think we should have less homework because we need time to play outside every day.",
        },
      ],
    },
    { minWords: 10 },
  );
  assert.equal(result.code, "single_sentence");
  assert.match(result.guidance, /no credit was used/);
});

test("a draft that arrived mostly as a blocked paste is flagged", () => {
  const text = "The lesson says that communities help each other in many ways. ".repeat(4);
  const result = precheckFor({
    number: 1,
    sections: [{ key: "body", index: 0, text }],
    pasteAttempts: [{ chars: text.length }],
  });
  assert.equal(result.code, "pasted");
  assert.match(result.guidance, /Check with the student/);
});

test("a normal draft goes on to the AI", () => {
  assert.equal(precheckFor(counterDraft, { minWords: 10 }), null);
});
