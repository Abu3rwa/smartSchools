import test from "node:test";
import assert from "node:assert/strict";

import { buildDraftSheet } from "../services/writingDraftReportService.js";
import { rubricHtml, rubricText } from "../services/writingFeedbackEmailBlocks.js";
import { rubricRows } from "../client/src/utils/writingRubric.js";

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

const sheet = (showScores) =>
  buildDraftSheet({
    school: { name: "Test School" },
    student: { firstName: "Amina", lastName: "Yusuf" },
    assignment: { title: "My week" },
    draft: { number: 1, sections: [{ key: "body", label: "Body", text: "My week was quiet." }] },
    assessment,
    showScores,
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
