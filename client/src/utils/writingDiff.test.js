import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_DIFF_WORDS,
  alignDraftSections,
  diffStats,
  diffWords,
} from "./writingDiff.js";

const textOf = (ops, op) =>
  ops
    .filter((row) => row.op === op)
    .map((row) => row.text)
    .join(" ");

test("a replaced word is one deletion and one insertion", () => {
  const { ops, tooLong } = diffWords(
    "The cat sat on the mat.",
    "The dog sat on the mat.",
  );
  assert.equal(tooLong, false);
  assert.equal(textOf(ops, "delete"), "cat");
  assert.equal(textOf(ops, "insert"), "dog");
  assert.equal(textOf(ops, "equal"), "The sat on the mat.");
  assert.deepEqual(diffStats(ops), { added: 1, removed: 1, unchanged: 5 });
});

test("unchanged text is one equal run and case alone is not a change", () => {
  const { ops } = diffWords("The Cat sat.", "the cat sat.");
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "equal");
  const stats = diffStats(ops);
  assert.equal(stats.added, 0);
  assert.equal(stats.removed, 0);
});

test("new and missing text are insertions and deletions", () => {
  const added = diffWords("one two", "one two three").ops;
  assert.equal(textOf(added, "insert"), "three");
  assert.equal(textOf(added, "delete"), "");

  const removed = diffWords("one two three", "one three").ops;
  assert.equal(textOf(removed, "delete"), "two");
  assert.equal(textOf(removed, "insert"), "");
});

test("an empty earlier draft shows every word as new", () => {
  const { ops } = diffWords("", "first words here");
  assert.equal(textOf(ops, "insert"), "first words here");
  assert.deepEqual(diffStats(ops), { added: 3, removed: 0, unchanged: 0 });
});

test("a draft past the word cap is reported instead of aligned", () => {
  const long = Array.from({ length: MAX_DIFF_WORDS + 1 }, (_, i) => `w${i}`).join(" ");
  const { tooLong, ops } = diffWords(long, "short");
  assert.equal(tooLong, true);
  assert.equal(diffStats(ops).removed, MAX_DIFF_WORDS + 1);
  assert.equal(diffStats(ops).added, 1);
});

test("sections are paired by key and index, keeping reading order", () => {
  const previous = {
    number: 1,
    sections: [
      { key: "intro", index: 0, label: "Intro", text: "Old intro." },
      { key: "body", index: 0, label: "Body", text: "Body stays." },
      { key: "ending", index: 0, label: "Ending", text: "Cut later." },
    ],
  };
  const current = {
    number: 2,
    sections: [
      { key: "intro", index: 0, label: "Intro", text: "New intro." },
      { key: "body", index: 0, label: "Body", text: "Body stays." },
      { key: "scene", index: 0, label: "New scene", text: "Brand new." },
    ],
  };

  const rows = alignDraftSections(previous, current);

  assert.deepEqual(
    rows.map((row) => [row.key, row.removedSection]),
    [
      ["intro:0", false],
      ["body:0", false],
      ["scene:0", false],
      ["ending:0", true],
    ],
  );
  assert.equal(rows[2].before, "");
  assert.equal(rows[2].stats.added, 2);
  assert.equal(rows[3].after, "");
  assert.equal(rows[3].stats.removed, 2);
  assert.equal(rows[1].stats.added, 0, "an untouched part says so");
});

test("without a previous draft nothing is marked as removed", () => {
  const rows = alignDraftSections(null, {
    sections: [{ key: "intro", index: 0, text: "Only draft." }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].removedSection, false);
  assert.equal(rows[0].stats.removed, 0);
});
