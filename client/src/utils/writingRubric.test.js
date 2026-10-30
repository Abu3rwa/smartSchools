import test from "node:test";
import assert from "node:assert/strict";
import { rubricLevel, rubricRows } from "./writingRubric.js";

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