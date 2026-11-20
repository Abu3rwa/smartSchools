import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDraftSheet } from "../services/writingDraftReportService.js";
import { rubricHtml, rubricText } from "../services/writingFeedbackEmailBlocks.js";
import { rubricRows } from "../client/src/utils/writingRubric.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// R7: the teacher keeps the numbers; the child and the family read a verdict.
const assessment = {
  language: "en",
  scores: [
    {
      key: "ideas",
      label: "Ideas",
      score: 4,
      maxScore: 5,
      explanation: "You scored 4 out of 5. The ideas are clear.",
    },
    { key: "ending", label: "Ending", score: 2, maxScore: 5, explanation: "" },
  ],
  sections: [],
  overall: {},
};

const sheet = (showScores, marks = "words") =>
  buildDraftSheet({
    school: { name: "Test School" },
    student: { firstName: "Amina", lastName: "Yusuf" },
    assignment: { title: "My week" },
    draft: { number: 1, sections: [{ key: "body", label: "Body", text: "My week was quiet." }] },
    assessment,
    showScores,
    marks,
  });

const rubricBlock = (html) => {
  const start = html.indexOf(">Rubric<");
  return start === -1 ? "" : html.slice(start, html.indexOf("</table>", start));
};

// What a reader actually sees on the sheet, without the tags (whose "</h3>"
// would otherwise count as a digit).
const rubricWords = (html) => rubricBlock(html).replace(/<[^>]+>/g, " ");

test("the printed student sheet shows a verdict per criterion, never a mark", () => {
  const html = sheet(false);
  const words = rubricWords(html);
  assert.match(words, /Strong/);
  assert.match(words, /Needs work/);
  assert.doesNotMatch(words, /\d/);
  assert.doesNotMatch(html, /\d+\s*\/\s*\d+/);
  assert.doesNotMatch(html, /out of 5/);
  assert.doesNotMatch(html, /scored/);
});

test("the printed teacher sheet still carries the marks", () => {
  const block = rubricBlock(sheet(true));
  assert.match(block, /4 \/ 5/);
  assert.match(block, /2 \/ 5/);
  assert.doesNotMatch(block, /Strong/);
});

test("the student sheet follows the school marks policy it was printed under", () => {
  const wordsAndNumbers = rubricBlock(sheet(false, "words_numbers"));
  assert.match(wordsAndNumbers, /Strong · 4 \/ 5/);
  const numbers = rubricBlock(sheet(false, "numbers"));
  assert.match(numbers, /4 \/ 5/);
  assert.doesNotMatch(numbers, /Strong/);
});

test("the printed sheet is a standalone A4 letterhead document (L4)", async () => {
  const html = sheet(false);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /<p class="school">Test School<\/p>/);
  assert.match(html, /Writing feedback/);
  assert.match(html, /Marks: Words only/);
  const { withPrintPageCss } = await import("../utils/printableHtml.js");
  assert.match(withPrintPageCss(html, { margin: "18mm 16mm" }), /@page\{size:A4;/);
  // Grayscale: a used spelling word is marked by a tick, not only by colour.
  assert.match(html, /\.chip\.win::before \{ content: "✓ ";/);
});

test("the student payload rows carry a level and no points at all", () => {
  const rows = rubricRows(assessment.scores);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].level, "strong");
  assert.equal(rows[0].filled, 4);
  assert.equal(rows[1].level, "needs");
  for (const row of rows) {
    assert.equal(row.score, undefined);
    assert.equal(row.maxScore, undefined);
    assert.equal(row.totalScore, undefined);
    assert.doesNotMatch(JSON.stringify(row), /"score"|"maxScore"/);
  }
  assert.doesNotMatch(rows[0].explanation, /\d/);
});

test("the family email reads the same verdicts, with no marks in the words", () => {
  const copy = {
    rubricLevel: { strong: "Strong", near: "Nearly there", needs: "Needs work" },
  };
  const bodies = [
    rubricText({ scores: assessment.scores, language: "en", copy }),
    rubricHtml({ scores: assessment.scores, language: "en", copy }),
  ];
  for (const body of bodies) {
    const words = body.replace(/<[^>]+>/g, " ");
    assert.match(words, /Strong/);
    assert.doesNotMatch(words, /\d/);
    assert.doesNotMatch(words, /scored|out of/);
  }
});

test("G7: planned spelling targets never reach a child before the teacher publishes", async () => {
  const source = await readFile(
    join(HERE, "..", "services", "writingAssistantService.js"),
    "utf8",
  );
  // getStudentProject is the child's only reader. Its assessment query must be
  // publish-gated, so an unpublished target list cannot leave the server.
  const fn = source.slice(source.indexOf("export const getStudentProject"));
  const queryStart = fn.indexOf("WritingAssessment.find");
  const query = fn.slice(queryStart, fn.indexOf(".sort(", queryStart));
  assert.match(query, /"publish\.state": "published"/);
});
