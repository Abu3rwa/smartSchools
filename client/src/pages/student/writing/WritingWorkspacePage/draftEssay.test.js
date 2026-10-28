import { test } from "node:test";
import assert from "node:assert/strict";
import { essayParagraphs } from "./draftEssay.js";

const assignment = {
  sections: [
    { key: "intro", label: "Introduction" },
    { key: "body", label: "Body paragraph", repeatable: true },
    { key: "conclusion", label: "Conclusion" },
  ],
};

test("paragraphs follow the assignment order, not the order they were written", () => {
  const result = essayParagraphs({
    assignment,
    sections: [
      { key: "conclusion", index: 0, text: "Last." },
      { key: "body", index: 1, text: "Second body." },
      { key: "intro", index: 0, text: "First." },
      { key: "body", index: 0, text: "First body." },
    ],
  });
  assert.deepEqual(result.map((row) => row.text), [
    "First.",
    "First body.",
    "Second body.",
    "Last.",
  ]);
});

test("paragraphs from an older assignment version still show, after the known ones", () => {
  const result = essayParagraphs({
    assignment,
    sections: [
      { key: "legacy", index: 0, text: "Old part." },
      { key: "intro", index: 0, text: "First." },
    ],
  });
  assert.deepEqual(result.map((row) => row.key), ["intro", "legacy"]);
});

test("empty sections are dropped and text is trimmed", () => {
  const result = essayParagraphs({
    assignment,
    sections: [
      { key: "intro", index: 0, text: "   " },
      { key: "body", index: 0, text: "  Real text.  " },
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "Real text.");
});

test("the paragraph keeps its slot so feedback can be matched", () => {
  const [paragraph] = essayParagraphs({
    assignment,
    sections: [{ key: "body", index: 2, text: "Third body." }],
  });
  assert.equal(paragraph.key, "body");
  assert.equal(paragraph.index, 2);
});
