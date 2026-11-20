import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_EXPLANATION_CHARS,
  acceptCorrections,
  canonicalSectionText,
  composeParagraphRuns,
  correctionsBySlot,
  deriveReviewStatus,
  describeLanguageSection,
  resolveCorrectionSpan,
  resolveParagraphCorrections,
  validateCorrection,
} from "./writingMechanics.js";
import { anchorSegments } from "./writingAnchors.js";
import { languageDraftFixture } from "./writingMechanicsFixture.js";

const section = "It will make them have healthy body and increase their focus.";
const row = (overrides = {}) => ({
  category: "grammar",
  original: "healthy body",
  correction: "a healthy body",
  explanation: "Use “a” before the singular countable noun “body”.",
  ...overrides,
});

test("canonical text matches the essay's trimmed section text", () => {
  assert.equal(canonicalSectionText("  hello \n"), "hello");
  assert.equal(canonicalSectionText(null), "");
});

test("resolveCorrectionSpan finds a unique literal occurrence", () => {
  const resolved = resolveCorrectionSpan(section, "healthy body");
  assert.deepEqual(resolved, {
    ok: true,
    start: 23,
    end: 35,
    original: "healthy body",
  });
});

test("single-character corrections survive exact matching", () => {
  const text = "i am here";
  const resolved = resolveCorrectionSpan(text, "i");
  assert.deepEqual(resolved, { ok: true, start: 0, end: 1, original: "i" });
});

test("punctuation proposals use an existing context span", () => {
  const text = "ready to learn";
  const resolved = resolveCorrectionSpan(text, "ready to learn");
  assert.deepEqual(resolved, {
    ok: true,
    start: 0,
    end: 14,
    original: "ready to learn",
  });
});

test("repeated words need a unique sourceQuote instead of a first-match guess", () => {
  const text = "we can go now or we can go later";
  assert.deepEqual(resolveCorrectionSpan(text, "go"), {
    ok: false,
    reason: "ambiguous",
  });
  const narrowed = resolveCorrectionSpan(text, "go", "now or we can go later");
  assert.deepEqual(narrowed, { ok: true, start: 24, end: 26, original: "go" });
});

test("a contradictory sourceQuote never wins by default", () => {
  const text = "go home. go outside.";
  assert.deepEqual(resolveCorrectionSpan(text, "go", "not in this text"), {
    ok: false,
    reason: "ambiguous",
  });
});

test("whitespace-only equivalence keeps the raw source slice", () => {
  const text = "We  walked\npast the  stalls.";
  const resolved = resolveCorrectionSpan(text, "We walked past the stalls");
  assert.equal(resolved.ok, true);
  assert.equal(resolved.original, "We  walked\npast the  stalls");
  assert.equal(text.slice(resolved.start, resolved.end), resolved.original);
});

test("case and punctuation are not folded", () => {
  const text = "The teacher said Good morning.";
  assert.deepEqual(resolveCorrectionSpan(text, "good morning"), {
    ok: false,
    reason: "missing",
  });
});

test("surrogate pairs are never split", () => {
  const text = "😀 then we go outside";
  const resolved = resolveCorrectionSpan(text, "then");
  assert.equal(resolved.ok, true);
  assert.equal(text.slice(resolved.start, resolved.end), "then");
});

test("validateCorrection accepts a teacher anchor only when the slice matches", () => {
  const good = validateCorrection(section, row({ anchor: { start: 23, end: 35 } }));
  assert.equal(good.ok, true);
  assert.deepEqual(good.value.anchor, { start: 23, end: 35 });
  const bad = validateCorrection(section, row({ anchor: { start: 0, end: 12 } }));
  assert.deepEqual(bad, {
    ok: false,
    code: "WRITING_MECHANICS_ANCHOR_MISMATCH",
  });
});

test("deletion is an empty correction, missing correction is refused", () => {
  const deleted = validateCorrection(section, row({ correction: "" }));
  assert.equal(deleted.ok, true);
  assert.equal(deleted.value.correction, "");
  const missing = validateCorrection(section, row({ correction: null }));
  assert.deepEqual(missing, {
    ok: false,
    code: "WRITING_MECHANICS_INVALID",
  });
});

test("invalid categories, no-op edits and overlong reasons are refused", () => {
  assert.equal(validateCorrection(section, row({ category: "style" })).ok, false);
  assert.equal(validateCorrection(section, row({ correction: "healthy body" })).ok, false);
  const long = validateCorrection(
    section,
    row({ explanation: "x".repeat(MAX_EXPLANATION_CHARS + 1) }),
  );
  assert.deepEqual(long, { ok: false, code: "WRITING_MECHANICS_INVALID" });
  const html = validateCorrection(section, row({ explanation: "<b>bold</b>" }));
  assert.equal(html.ok, false);
  const objects = validateCorrection(section, row({ original: { text: "healthy body" } }));
  assert.equal(objects.ok, false);
});

test("fabricated quotes are refused", () => {
  const fake = validateCorrection(section, row({ original: "very healthy body" }));
  assert.deepEqual(fake, {
    ok: false,
    code: "WRITING_MECHANICS_ANCHOR_MISMATCH",
  });
});

test("acceptCorrections dedupes, refuses competing spans and caps", () => {
  const base = validateCorrection(section, row()).value;
  const duplicate = acceptCorrections([base, { ...base }]);
  assert.equal(duplicate.rows.length, 1);
  assert.equal(duplicate.dropped, 1);

  const conflict = acceptCorrections([
    base,
    { ...base, correction: "the healthy body" },
  ]);
  assert.equal(conflict.rows.length, 0);
  assert.equal(conflict.dropped, 2);

  const many = Array.from({ length: 14 }, (_, index) => ({
    category: "spelling",
    original: `word${index}`,
    correction: `fix${index}`,
    explanation: "Fix the word.",
    anchor: { start: index, end: index + 5 },
  }));
  const capped = acceptCorrections(many, { limit: 12 });
  assert.equal(capped.rows.length, 12);
  assert.equal(capped.dropped, 2);
});

test("status derivation never claims a complete check after a drop", () => {
  assert.equal(deriveReviewStatus({ reviewed: true }), "checked");
  assert.equal(deriveReviewStatus({ reviewed: true, dropped: 1 }), "partial");
  assert.equal(deriveReviewStatus({ reviewed: true, hasMore: true }), "partial");
  assert.equal(deriveReviewStatus({ reviewed: false }), "partial");
  assert.equal(
    deriveReviewStatus({ reviewed: true, responsePresent: false }),
    "unavailable",
  );
  assert.equal(
    deriveReviewStatus({ reviewed: true, sectionAvailable: false }),
    "unavailable",
  );
});

test("language block wording follows the stored status and row type", () => {
  const typedRow = { category: "spelling", original: "sme", correction: "some" };
  const legacyRow = { original: "sme", correction: "some" };

  const checkedEmpty = describeLanguageSection({ mechanics: [], status: "checked" });
  assert.equal(checkedEmpty.show, true);
  assert.equal(checkedEmpty.heading, "typed");
  assert.equal(checkedEmpty.message, "noneSuggested");

  const partial = describeLanguageSection({
    mechanics: [typedRow],
    status: "partial",
  });
  assert.equal(partial.typed.length, 1);
  assert.equal(partial.message, "partial");

  const unavailable = describeLanguageSection({ mechanics: [], status: "unavailable" });
  assert.equal(unavailable.message, "unavailable");

  const historical = describeLanguageSection({ mechanics: [legacyRow] });
  assert.equal(historical.heading, "legacy");
  assert.equal(historical.message, null);
  assert.equal(historical.show, true);

  assert.equal(describeLanguageSection({ mechanics: [], status: null }).show, false);
});

test("the frozen fixture layers coaching over language on the same words", () => {
  const { draft, assessment } = languageDraftFixture();
  const paragraphs = draft.sections.map((row) => ({
    key: row.key,
    index: row.index,
    text: canonicalSectionText(row.text),
  }));
  const rows = resolveParagraphCorrections(
    paragraphs,
    correctionsBySlot(assessment.sections),
  );

  assert.equal(rows[0].mechanics.length, 1);
  assert.equal(rows[0].mechanics[0].number, 1);
  assert.deepEqual(rows[0].mechanics[0].anchor, { start: 23, end: 35 });
  assert.deepEqual(rows[0].mechanicsReview, { version: 1, status: "checked" });

  assert.deepEqual(
    rows[1].mechanics.map((row) => [row.number, row.category]),
    [
      [2, "verb_tense"],
      [3, "punctuation"],
    ],
  );
  assert.equal(rows[1].mechanicsReview.status, "partial");

  // Historical pair: listed without a number, never highlighted.
  assert.deepEqual(
    rows[2].mechanicsList.map((row) => row.number),
    [null, null],
  );
  assert.equal(rows[2].mechanics.length, 0);
  assert.equal(rows[2].mechanicsReview, null);

  const overlapping = composeParagraphRuns({
    text: rows[0].text,
    coachingSegments: anchorSegments(rows[0].text, assessment.sections[0].evidence, 1),
    corrections: rows[0].mechanics,
  });
  assert.equal(overlapping.map((run) => run.text).join(""), rows[0].text);
  const both = overlapping.filter(
    (run) => run.coachingMark === 1 && run.mechanics.length > 0,
  );
  assert.equal(both.length, 1);
  assert.equal(both[0].text, "healthy body");
  assert.deepEqual(both[0].mechanics, [1]);

  const tense = composeParagraphRuns({
    text: rows[1].text,
    corrections: rows[1].mechanics,
  });
  assert.equal(tense.map((run) => run.text).join(""), rows[1].text);
  assert.deepEqual(
    tense.filter((run) => run.mechanics.length > 0).map((run) => [run.text, run.mechanics]),
    [
      ["go", [2]],
      ["outside", [3]],
    ],
  );
});

test("composeParagraphRuns keeps the text exactly and layers both marks", () => {
  const text = "It will make them have healthy body.";
  const coachingSegments = [
    { text: "It will make them have ", mark: null },
    { text: "healthy body", mark: 1 },
    { text: ".", mark: null },
  ];
  const corrections = [
    { number: 2, anchor: { start: 23, end: 35 } },
    { number: 3, anchor: { start: 35, end: 36 } },
  ];
  const runs = composeParagraphRuns({ text, coachingSegments, corrections });
  assert.equal(runs.map((run) => run.text).join(""), text);
  const red = runs.filter((run) => run.mechanics.length > 0);
  assert.deepEqual(
    red.map((run) => [run.text, run.mechanics]),
    [
      ["healthy body", [2]],
      [".", [3]],
    ],
  );
  const coached = runs.filter((run) => run.coachingMark === 1);
  assert.equal(coached.map((run) => run.text).join(""), "healthy body");
});

test("composeParagraphRuns ignores out-of-range anchors without losing text", () => {
  const text = "A short sentence.";
  const runs = composeParagraphRuns({
    text,
    corrections: [{ number: 1, anchor: { start: 50, end: 60 } }],
  });
  assert.equal(runs.map((run) => run.text).join(""), text);
  assert.equal(runs.some((run) => run.mechanics.length), false);
});

test("resolveParagraphCorrections numbers in reading order and drops stale anchors", () => {
  const paragraphs = [
    { key: "body", index: 0, text: "we can go now or we can go later" },
    { key: "body", index: 1, text: "Yesterday we go outside." },
  ];
  const rowsBySlot = new Map([
    [
      "body:0",
      {
        mechanics: [
          {
            category: "verb_tense",
            original: "go",
            correction: "went",
            explanation: "Past tense needed.",
            anchor: { start: 7, end: 9 },
          },
        ],
        mechanicsReview: { version: 1, status: "checked" },
      },
    ],
    [
      "body:1",
      {
        mechanics: [
          {
            category: "verb_tense",
            original: "go",
            correction: "went",
            explanation: "Past tense needed.",
            anchor: { start: 13, end: 15 },
          },
          {
            category: "spelling",
            original: "outside",
            correction: "outside",
            explanation: "No change.",
            anchor: { start: 17, end: 24 },
          },
        ],
        mechanicsReview: { version: 1, status: "partial" },
      },
    ],
  ]);
  const rows = resolveParagraphCorrections(paragraphs, rowsBySlot);
  assert.equal(rows[0].mechanics.length, 1);
  assert.equal(rows[0].mechanics[0].number, 1);
  assert.equal(rows[1].mechanics.length, 1);
  assert.equal(rows[1].mechanics[0].number, 2);
  assert.equal(rows[1].mechanicsReview.status, "partial");
  // The second row of the second paragraph failed its slice check but is listed.
  assert.equal(rows[1].mechanicsList.length, 2);
  assert.deepEqual(rows[1].mechanicsList.map((row) => row.number), [2, 3]);
});
