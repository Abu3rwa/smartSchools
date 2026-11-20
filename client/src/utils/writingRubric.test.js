import test from "node:test";
import assert from "node:assert/strict";
import {
  MARKS_MODES,
  marksModeOf,
  marksShowsNumbers,
  rubricLevel,
  rubricRows,
} from "./writingRubric.js";

test("rubricLevel reads the same on different point scales", () => {
  assert.deepEqual(rubricLevel(4, 5), rubricLevel(8, 10));
  assert.equal(rubricLevel(4, 5).level, "strong");
  assert.equal(rubricLevel(4, 5).filled, 4);
  assert.equal(rubricLevel(5, 5).filled, 5);
});

test("rubricLevel names the three verdicts a student can act on", () => {
  assert.equal(rubricLevel(5, 5).level, "strong");
  assert.equal(rubricLevel(3, 5).level, "near");
  assert.equal(rubricLevel(1, 5).level, "needs");
  assert.equal(rubricLevel(0, 5).filled, 0);
});

test("rubricLevel never divides by zero or runs past the maximum", () => {
  assert.equal(rubricLevel(3, 0).ratio, 0);
  assert.equal(rubricLevel(3, 0).level, "needs");
  assert.equal(rubricLevel(9, 5).ratio, 1);
  assert.equal(rubricLevel(-2, 5).ratio, 0);
  assert.equal(rubricLevel("nope", 5).ratio, 0);
});

test("rubricRows keeps the quote and falls back to nothing when there is none", () => {
  const rows = rubricRows([
    { key: "ideas", label: "Ideas & detail", score: 4, maxScore: 5, evidence: "the bread sellers shouted" },
    { key: "structure", label: "Structure", score: 3, maxScore: 5, explanation: "The ending arrives too soon." },
    { key: "", label: "", score: 1, maxScore: 5 },
    null,
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].evidence, "the bread sellers shouted");
  assert.equal(rows[0].level, "strong");
  assert.equal(rows[1].evidence, "");
  assert.equal(rows[1].explanation, "The ending arrives too soon.");
  assert.deepEqual(rubricRows(undefined), []);
});

test("rubricRows keeps the verdict the server already worked out", () => {
  const rows = rubricRows([
    { key: "ideas", label: "Ideas", level: "near", filled: 3, dots: 5 },
  ]);
  assert.equal(rows[0].level, "near");
  assert.equal(rows[0].filled, 3);
  assert.equal(rows[0].dots, 5);
  assert.equal(rows[0].ratio, 3 / 5);
});

test("the school's marks mode is one of three, with words as the safe default", () => {
  assert.deepEqual(MARKS_MODES, ["words", "words_numbers", "numbers"]);
  assert.equal(marksModeOf("numbers"), "numbers");
  assert.equal(marksModeOf("words_numbers"), "words_numbers");
  assert.equal(marksModeOf(undefined), "words");
  assert.equal(marksModeOf("points"), "words");
  assert.equal(marksShowsNumbers("words"), false);
  assert.equal(marksShowsNumbers("words_numbers"), true);
  assert.equal(marksShowsNumbers("numbers"), true);
});

test("rubricRows shows points only when the school asks for them", () => {
  const score = { key: "ideas", label: "Ideas", score: 4, maxScore: 5 };
  const words = rubricRows([score])[0];
  assert.equal("score" in words, false);
  assert.equal("maxScore" in words, false);
  assert.equal(words.level, "strong");

  const both = rubricRows([score], { marks: "words_numbers" })[0];
  assert.equal(both.score, 4);
  assert.equal(both.maxScore, 5);
  assert.equal(both.level, "strong");

  const numbers = rubricRows([score], { marks: "numbers" })[0];
  assert.equal(numbers.score, 4);

  // A server row without points (the child payload) never gains a fake one.
  const serverRow = rubricRows(
    [{ key: "ideas", label: "Ideas", level: "near", filled: 3, dots: 5 }],
    { marks: "numbers" },
  )[0];
  assert.equal("score" in serverRow, false);
});

test("a rubric explanation never carries marks to the child", () => {
  const rows = rubricRows([
    { key: "ideas", label: "Ideas", score: 4, maxScore: 5, explanation: "You scored 4 out of 5. The ideas are clear." },
    { key: "voice", label: "Voice", score: 8, maxScore: 10, explanation: "Your score is 8/10, but the letter sounds like you." },
    { key: "ending", label: "Ending", score: 3, maxScore: 5, explanation: "The ending arrives too soon." },
  ]);
  assert.equal(rows[0].explanation, "The ideas are clear.");
  assert.equal(rows[1].explanation, "but the letter sounds like you.");
  assert.equal(rows[2].explanation, "The ending arrives too soon.");
});