import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PACK_FACTS,
  MAX_PROMPT_FACTS,
  factById,
  normalizePackInput,
  packCoverage,
  promptFacts,
  rankedFactsForSection,
} from "../services/writingSourcePackService.js";
import {
  buildFeedbackPrompt,
  normalizeFeedback,
  renderPriorDraft,
} from "../services/writingAssistantPrompts.js";
import { configSnapshotFor } from "../services/writingAssistantLogic.js";
import { presetRubric, presetSections } from "../constants/writingPresets.js";

const facts = [
  { id: "f1", text: "Finland gives students about thirty minutes of homework a night." },
  { id: "f2", text: "Students who sleep nine hours remember more in class." },
  { id: "f3", text: "Short quizzes at the end of a lesson help students remember more." },
];

const draft = {
  number: 1,
  sections: [
    { key: "introduction", index: 0, label: "Introduction", text: "I think our days at school are already very long." },
    { key: "body", index: 0, label: "Body", text: "In Finland students have about thirty minutes of homework a night." },
  ],
};

const assignment = () => ({
  title: "Homework",
  writingType: "essay",
  instructions: "Give an opinion with a reason.",
  expectedLevel: "Grade 5",
  minWords: 40,
  maxWords: 250,
  sections: presetSections("essay"),
  rubric: presetRubric(),
});

/* ------------------------------------------------------------------ */
/* Saving and normalising a pack                                       */
/* ------------------------------------------------------------------ */

test("pasted lesson text becomes stable, deduplicated facts with ids", () => {
  const pack = normalizePackInput({
    title: "  Homework notes  ",
    sourceText:
      "Finland gives students thirty minutes of homework. Reading at home improves vocabulary. Finland gives students thirty minutes of homework.",
  });
  assert.equal(pack.title, "Homework notes");
  assert.equal(pack.facts.length, 2);
  assert.deepEqual(pack.facts.map((row) => row.id), ["f1", "f2"]);
  assert.equal(pack.omittedFacts, 1);
});

test("a pack takes supplied facts over the pasted source, and refuses an empty one", () => {
  const pack = normalizePackInput({
    title: "Notes",
    sourceText: "A sentence that would be split.",
    facts: [{ text: "One fact about the lesson." }],
  });
  assert.deepEqual(pack.facts, [{ id: "f1", text: "One fact about the lesson." }]);
  assert.throws(() => normalizePackInput({ title: "Notes", facts: [] }), /at least one lesson fact/);
  assert.throws(() => normalizePackInput({ title: "  " }), /needs a title/);
});

test("the fact cap is reported, not hidden", () => {
  const pack = normalizePackInput({
    title: "Big pack",
    facts: Array.from({ length: MAX_PACK_FACTS + 4 }, (_, index) => ({
      text: `Lesson fact number ${index + 1} about the topic.`,
    })),
  });
  assert.equal(pack.facts.length, MAX_PACK_FACTS);
  assert.equal(pack.omittedFacts, 4);
});

/* ------------------------------------------------------------------ */
/* Coverage and ranking                                                */
/* ------------------------------------------------------------------ */

test("coverage marks a fact the draft already uses, per section and overall", () => {
  const coverage = packCoverage({ facts, draft });
  assert.deepEqual(coverage.usedIds, ["f1"]);
  assert.deepEqual(coverage.unusedIds, ["f2", "f3"]);
  assert.deepEqual(coverage.bySection["body:0"], ["f1"]);
  assert.deepEqual(coverage.bySection["introduction:0"], []);
});

test("the prompt carries unused facts first and reports what the cap dropped", () => {
  const coverage = packCoverage({ facts, draft });
  const listed = promptFacts({ coverage });
  assert.equal(listed.facts[0].id, "f2");
  assert.equal(listed.omitted, 0);

  const many = Array.from({ length: MAX_PROMPT_FACTS + 2 }, (_, index) => ({
    id: `f${index + 1}`,
    text: `Lesson fact number ${index + 1} about the wider topic.`,
  }));
  const capped = promptFacts({ coverage: packCoverage({ facts: many, draft }) });
  assert.equal(capped.facts.length, MAX_PROMPT_FACTS);
  assert.equal(capped.omitted, 2);
});

test("the evidence panel is offered facts this section does not already use", () => {
  const coverage = packCoverage({ facts, draft });
  const ranked = rankedFactsForSection({
    coverage,
    sectionKey: "body",
    index: 0,
  });
  assert.deepEqual(ranked.map((row) => row.id), ["f2", "f3"]);
  assert.equal(ranked[0].usedInDraft, false);
});

test("a fact id is resolved case-insensitively and never guessed", () => {
  assert.equal(factById(facts, "F2").text, facts[1].text);
  assert.equal(factById(facts, "f9"), null);
  assert.equal(factById(facts, ""), null);
});

/* ------------------------------------------------------------------ */
/* Prompt and reply                                                     */
/* ------------------------------------------------------------------ */

const promptFor = (pack) =>
  buildFeedbackPrompt({
    snapshot: configSnapshotFor(assignment()),
    draft,
    language: "en",
    pack,
  });

test("with a pack the prompt lists the facts by id and marks the used one", () => {
  const prompt = promptFor({
    title: "Homework notes",
    version: 2,
    coverage: packCoverage({ facts, draft }),
  });
  assert.match(prompt, /Lesson facts for this assignment \(school pack "Homework notes", version 2\)/);
  assert.match(prompt, /- f2: Students who sleep nine hours/);
  assert.match(prompt, /- f1: Finland gives students[^\n]*\[already used in the draft\]/);
  assert.match(prompt, /Facts the draft already contains: f1\./);
  assert.match(prompt, /"factId"/);
  assert.match(prompt, /never invent a fact id/);
  assert.match(prompt, /cannot receive full marks unless it uses at least one lesson fact/);
});

test("without a pack the prompt forbids demanding lesson facts", () => {
  const prompt = promptFor(null);
  assert.doesNotMatch(prompt, /Lesson facts for this assignment/);
  assert.doesNotMatch(prompt, /"factId"/);
  assert.match(prompt, /never demand a specific fact, statistic, date, quotation or page/);
  assert.match(prompt, /"a fact from your lesson"/);
});

test("a cited fact id becomes the fact text; unknown, used and repeated ids drop", () => {
  const snapshot = configSnapshotFor(assignment());
  const coverage = packCoverage({ facts, draft });
  const reply = (factId) => ({
    key: "body",
    index: 0,
    strengths: ["The example is clear."],
    improvements: ["Explain what it shows."],
    evidence: "In Finland students have about thirty minutes",
    why: "An example needs a link to the reason.",
    nextStep: "Add one sentence that starts with This shows.",
    factId,
    score: 3,
  });
  const result = normalizeFeedback({
    parsed: {
      sections: [reply("F2"), reply("f9"), reply("f1"), reply("f2")],
      overall: { nextPriorities: [] },
      scores: [],
    },
    draft: {
      number: 1,
      sections: [0, 1, 2, 3].map((index) => ({
        key: "body",
        index,
        label: "Body",
        text: "In Finland students have about thirty minutes of homework a night.",
      })),
    },
    snapshot,
    packFacts: coverage.facts,
  });
  assert.equal(result.ok, true);
  assert.equal(result.sections.length, 4);
  assert.deepEqual(result.sections[0].evidenceFact, {
    id: "f2",
    text: facts[1].text,
  });
  assert.equal(result.sections[1].evidenceFact, null);
  assert.equal(result.sections[2].evidenceFact, null);
  assert.equal(result.sections[3].evidenceFact, null);
});

/* ------------------------------------------------------------------ */
/* Long earlier drafts (H12)                                            */
/* ------------------------------------------------------------------ */

test("a short earlier draft is rendered whole", () => {
  const rendered = renderPriorDraft(
    { number: 1, sections: draft.sections },
    { number: 2, sections: draft.sections },
    {},
  );
  assert.match(rendered, /In Finland students have about thirty minutes/);
  assert.doesNotMatch(rendered, /unchanged section/);
});

test("a long earlier draft is rendered only where it changed, with the omission said", () => {
  const long = Array.from({ length: 300 }, (_, index) => `word${index}`).join(" ");
  const previousDraft = {
    number: 1,
    sections: [
      { key: "body", index: 0, label: "Body", text: `${long} stubborn opening line.` },
      { key: "body", index: 1, label: "Body", text: "first ending words here" },
    ],
  };
  const currentDraft = {
    number: 2,
    sections: [
      { key: "body", index: 0, label: "Body", text: `${long} stubborn opening line.` },
      { key: "body", index: 1, label: "Body", text: "second ending words here" },
    ],
  };
  const rendered = renderPriorDraft(previousDraft, currentDraft, {});
  assert.match(rendered, /first ending words here/);
  assert.doesNotMatch(rendered, /stubborn opening line/);
  assert.match(rendered, /1 unchanged section\(s\) of draft 1/);
});
