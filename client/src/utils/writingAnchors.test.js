import test from "node:test";
import assert from "node:assert/strict";
import { anchorEssay, anchorSegments, unplacedNotes } from "./writingAnchors.js";

test("anchorSegments highlights the exact quote and keeps the rest plain", () => {
  const text = "Inside, the bread sellers shouted over the diesel engines and it was loud.";
  const segments = anchorSegments(text, "the bread sellers shouted over the diesel engines", 2);
  assert.deepEqual(segments, [
    { text: "Inside, ", mark: null },
    { text: "the bread sellers shouted over the diesel engines", mark: 2 },
    { text: " and it was loud.", mark: null },
  ]);
});

test("anchorSegments tolerates collapsed whitespace and different case", () => {
  const segments = anchorSegments("We  walked\npast the stalls.", "we walked past the stalls", 1);
  assert.equal(segments[0].mark, 1);
  assert.equal(segments[0].text, "We  walked\npast the stalls");
  assert.equal(segments.map((row) => row.text).join(""), "We  walked\npast the stalls.");
});

test("anchorSegments leaves the paragraph alone when the quote is not there", () => {
  const text = "Then it was over and we went home.";
  assert.deepEqual(anchorSegments(text, "a sentence the student never wrote", 1), [
    { text, mark: null },
  ]);
  assert.deepEqual(anchorSegments(text, "", 1), [{ text, mark: null }]);
  assert.deepEqual(anchorSegments(text, "ab", 1), [{ text, mark: null }]);
  assert.deepEqual(anchorSegments("", "anything at all", 1), [{ text: "", mark: null }]);
});

test("anchorSegments treats regex characters in a quote as literal text", () => {
  const text = "It cost 5.00 (five) dollars [really].";
  const segments = anchorSegments(text, "5.00 (five) dollars [really]", 3);
  assert.equal(segments.length, 3);
  assert.equal(segments[1].mark, 3);
  assert.equal(segments[1].text, "5.00 (five) dollars [really]");
});

test("anchorSegments matches an Arabic quote", () => {
  const segments = anchorSegments("كان السوق مزدحما جدا.", "السوق مزدحما", 1);
  assert.equal(segments.filter((row) => row.mark !== null).length, 1);
});

test("anchorEssay numbers only the paragraphs whose quote is really there", () => {
  const paragraphs = [
    { key: "opening", index: 0, text: "I am going to tell you about a place." },
    { key: "middle", index: 0, text: "The bread sellers shouted over the engines." },
    { key: "ending", index: 0, text: "Then it was over and we went home." },
  ];
  const notes = [
    { key: "opening", index: 0, evidence: "I am going to tell you about a place." },
    { key: "middle", index: 0, evidence: "a quote that is not in this paragraph" },
    { key: "ending", index: 0, evidence: "Then it was over and we went home." },
  ];
  const rows = anchorEssay(paragraphs, notes);

  assert.deepEqual(rows.map((row) => row.number), [1, 0, 2]);
  assert.equal(rows[1].segments.length, 1);
  assert.equal(rows[1].segments[0].mark, null);
  assert.equal(rows[1].note.evidence, "a quote that is not in this paragraph");
  assert.equal(rows[2].segments[0].mark, 2);
});

test("anchorEssay survives a paragraph with no feedback at all", () => {
  const rows = anchorEssay([{ key: "opening", index: 0, text: "A first line." }], []);
  assert.equal(rows[0].number, 0);
  assert.equal(rows[0].note, null);
  assert.deepEqual(rows[0].segments, [{ text: "A first line.", mark: null }]);
  assert.deepEqual(anchorEssay([], []), []);
});

test("a note whose slot does not line up still sits under the line it quotes", () => {
  const paragraphs = [
    { key: "body", index: 0, text: "Recess gives students a break from lessons." },
    { key: "body", index: 1, text: "Some students need freetime to relax with friends." },
    { key: "conclusion", index: 0, text: "So the school should keep a longer recess." },
  ];
  // The reply numbered both body paragraphs 0, so the second note has no slot.
  const notes = [
    { key: "body", index: 0, evidence: "a break from lessons", nextStep: "Add an example." },
    { key: "body", index: 0, evidence: "need freetime to relax", nextStep: "Say why." },
  ];
  const rows = anchorEssay(paragraphs, notes);

  assert.equal(rows[1].note, notes[1]);
  assert.equal(rows[1].number, 2);
  assert.equal(rows[1].segments[1].text, "need freetime to relax");
  assert.equal(rows[2].note, null);
  // Each note is used once, however many paragraphs contain its words.
  assert.equal(rows.filter((row) => row.note).length, 2);
});

test("unplacedNotes keeps every note no paragraph could take", () => {
  const paragraphs = [
    { key: "body", index: 0, text: "Recess gives students a break from lessons." },
    { key: "body", index: 1, text: "Some students need freetime to relax with friends." },
  ];
  const notes = [
    { key: "body", index: 0, evidence: "a break from lessons" },
    { key: "body", index: 5, evidence: "" },
    { key: "conclusion", index: 0, evidence: "words the student never wrote" },
  ];

  const loose = unplacedNotes(paragraphs, notes);
  assert.deepEqual(loose, [notes[1], notes[2]]);
  // The placed note never shows up twice.
  assert.equal(unplacedNotes(paragraphs, notes).includes(notes[0]), false);
});

test("a note for a part written once lands on it even when its index drifted", () => {
  const paragraphs = [
    { key: "opening", index: 0, text: "Recess helps students." },
    { key: "ending", index: 0, text: "So recess should be longer." },
  ];
  // A legacy run numbered parts from 1 and kept no quote.
  const notes = [
    { key: "opening", index: 1, evidence: "" },
    { key: "ending", index: 1, evidence: "" },
  ];
  const rows = anchorEssay(paragraphs, notes);

  assert.equal(rows[0].note, notes[0]);
  assert.equal(rows[1].note, notes[1]);
  assert.equal(rows[0].number, 0);
  assert.deepEqual(unplacedNotes(paragraphs, notes), []);
});

test("unplacedNotes treats notes as leftovers only once, matching anchorEssay", () => {
  const paragraphs = [
    { key: "body", index: 0, text: "Recess gives students a break from lessons." },
    { key: "body", index: 1, text: "Some students need freetime to relax with friends." },
  ];
  const notes = [
    { key: "body", index: 0, evidence: "a break from lessons" },
    { key: "body", index: 0, evidence: "need freetime to relax" },
    { key: "body", index: 2, evidence: "a break from lessons" },
  ];

  // Paragraph 0 takes the first note by slot, paragraph 1 takes the second by
  // quote, so only the note about a part that no longer exists is left over.
  assert.deepEqual(unplacedNotes(paragraphs, notes), [notes[2]]);
  assert.deepEqual(unplacedNotes(paragraphs, []), []);
  assert.deepEqual(unplacedNotes([], notes), notes);
});