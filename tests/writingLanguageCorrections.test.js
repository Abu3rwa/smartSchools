/**
 * Focused server tests for the four-category language-correction contract.
 *
 * These exercise the real generation-response normalizer (normalizeFeedback),
 * the additive Mongoose fields, and the child-safe projection — offline, with no
 * provider call and no database. They cover the normalization side of the plan's
 * C-matrix plus the storage/projection invariants (W01/W15/W16): exact anchors,
 * honest review status, legacy preservation, and no private diagnostics leaking
 * to the child.
 */
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { normalizeFeedback, draftPromptCoverage } from "../services/writingAssistantPrompts.js";
import { configSnapshotFor } from "../services/writingAssistantLogic.js";
import { childSections } from "../services/writingAssistantService.js";
import {
  simplifyFeedbackFields,
  feedbackReadability,
} from "../services/writingFeedbackReadability.js";
import WritingAssessment from "../models/WritingAssessment.js";
import { canonicalSectionText } from "../client/src/utils/writingMechanics.js";

/* ------------------------------------------------------------------ */
/* Deterministic fixture builders                                      */
/* ------------------------------------------------------------------ */

const d = (key, index, text) => ({ key, index, text });

const sec = (key, index, patch = {}) => ({
  key,
  index,
  label: key,
  strengths: [],
  improvements: [],
  evidence: "",
  why: "",
  nextStep: "",
  score: 3,
  ...patch,
});

const fix = (category, original, correction, explanation, extra = {}) => ({
  category,
  original,
  correction,
  explanation,
  ...extra,
});

const reviewed = { reviewed: true, hasMore: false };

const run = (draftSections, replySections, opts = {}) => {
  const keys = [...new Set(draftSections.map((row) => row.key))];
  const assignment = {
    sections: keys.map((key) => ({ key, label: key, kind: key })),
    rubric: [{ key: "ideas", label: "Ideas", maxScore: 5 }],
  };
  const snapshot = configSnapshotFor(assignment);
  const draft = { number: 1, sections: draftSections };
  const parsed = {
    sections: replySections,
    overall: { summary: "You have a clear idea.", nextPriorities: ["Add one example."] },
    scores: [{ key: "ideas", score: 3, evidence: "" }],
  };
  return normalizeFeedback({ parsed, draft, snapshot, assignment, ...opts });
};

const sliceOf = (text, row) =>
  canonicalSectionText(text).slice(row.anchor.start, row.anchor.end);

/* ------------------------------------------------------------------ */
/* C01–C06: the four categories, exact anchors, deletion               */
/* ------------------------------------------------------------------ */

test("C01: two spelling errors in one paragraph anchor independently", () => {
  const text = "sme peoeple are here.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [
        fix("spelling", "sme", "some", "Some is spelled s-o-m-e."),
        fix("spelling", "peoeple", "people", "People is spelled p-e-o-p-l-e."),
      ],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.ok, true);
  const rows = result.sections[0].mechanics;
  assert.equal(rows.length, 2);
  assert.equal(sliceOf(text, rows[0]), "sme");
  assert.equal(sliceOf(text, rows[1]), "peoeple");
  assert.equal(result.sections[0].mechanicsReview.status, "checked");
});

test("C02: a grammar correction keeps its reason through normalization", () => {
  const text = "Exercise gives healthy body.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("grammar", "healthy body", "a healthy body", "Add a before healthy body.")],
      mechanicsReview: reviewed,
    })],
  );
  const row = result.sections[0].mechanics[0];
  assert.equal(row.category, "grammar");
  assert.equal(row.correction, "a healthy body");
  assert.equal(row.explanation, "Add a before healthy body.");
  assert.equal(sliceOf(text, row), "healthy body");
});

test("C03: a past-tense fix is classified verb_tense, not grammar", () => {
  const text = "Yesterday we go outside.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("verb_tense", "go", "went", "Yesterday needs the past tense went.")],
      mechanicsReview: reviewed,
    })],
  );
  const row = result.sections[0].mechanics[0];
  assert.equal(row.category, "verb_tense");
  assert.equal(sliceOf(text, row), "go");
});

test("C04: a one-letter i → I fix is not dropped by a minimum-length rule", () => {
  const text = "i am happy.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("punctuation", "i", "I", "The word I is always capitalized.")],
      mechanicsReview: reviewed,
    })],
  );
  const row = result.sections[0].mechanics[0];
  assert.equal(row.original, "i");
  assert.equal(row.correction, "I");
  assert.deepEqual(row.anchor, { start: 0, end: 1 });
  assert.equal(sliceOf(text, row), "i");
});

test("C05: only the context-identified final punctuation is highlighted", () => {
  const text = "It is fun. Do you like it.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("punctuation", ".", "?", "A question ends with a question mark.", {
        sourceQuote: "Do you like it.",
      })],
      mechanicsReview: reviewed,
    })],
  );
  const row = result.sections[0].mechanics[0];
  assert.equal(sliceOf(text, row), ".");
  assert.equal(row.anchor.end, canonicalSectionText(text).length);
  assert.equal(row.anchor.start, text.lastIndexOf("."));
});

test("C05a: a punctuation label with no mark in the original is dropped", () => {
  const text = "Did you know that you will get higher marks if you have longer recess.";
  const result = run(
    [d("intro", 0, text)],
    [sec("intro", 0, {
      mechanics: [fix("punctuation", "higher marks", "higher marks.", "This needs a full stop to end the question sentence.")],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 0);
  assert.equal(result.sections[0].mechanicsReview.status, "partial");
  assert.ok(result.sections[0].mechanicsReview.reasons.includes("invalid_candidate"));
});

test("C05b: removing a correct comma after an opening phrase is dropped", () => {
  const text = "First of all, recess helps us focus.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("punctuation", "First of all,", "First of all", "This phrase does not need a comma here.")],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 0);
  assert.equal(result.sections[0].mechanicsReview.status, "partial");
});

test("C05c: a sentence-start capital is accepted as a punctuation fix", () => {
  const text = "After we play. last week I go.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("punctuation", "last", "Last", "Start a new sentence with a capital letter.")],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 1);
  assert.equal(result.sections[0].mechanics[0].correction, "Last");
  assert.equal(sliceOf(text, result.sections[0].mechanics[0]), "last");
});

test("C05d: a stray colon can still be removed", () => {
  const text = "so: I do not know what to say.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("punctuation", "so:", "", "Remove this colon.")],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 1);
  assert.equal(result.sections[0].mechanics[0].correction, "");
});

test("C05e: a missing apostrophe and a missing comma are accepted when no mark exists to quote", () => {
  const apostrophe = run(
    [d("body", 0, "I dont like cold lunch.")],
    [sec("body", 0, {
      mechanics: [fix("punctuation", "dont", "don't", "A contraction needs an apostrophe.")],
      mechanicsReview: reviewed,
    })],
  );
  const row = apostrophe.sections[0].mechanics[0];
  assert.equal(row.correction, "don't");
  assert.equal(sliceOf("I dont like cold lunch.", row), "dont");

  const comma = run(
    [d("body", 0, "I like apples oranges and pears.")],
    [sec("body", 0, {
      mechanics: [fix("punctuation", "apples oranges", "apples, oranges", "Separate the items in a list with commas.")],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(comma.sections[0].mechanics.length, 1);
  assert.equal(comma.sections[0].mechanics[0].correction, "apples, oranges");
});

test("C05f: an end mark added mid-sentence is still dropped, but the section's last word may take one", () => {
  const midSentence = run(
    [d("body", 0, "You earn higher marks because you work hard.")],
    [sec("body", 0, {
      mechanics: [fix("punctuation", "higher marks", "higher marks.", "End this sentence with a period.")],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(midSentence.sections[0].mechanics.length, 0);
  assert.equal(midSentence.sections[0].mechanicsReview.status, "partial");

  const atTheEnd = run(
    [d("body", 0, "We walked to the market")],
    [sec("body", 0, {
      mechanics: [fix("punctuation", "market", "market.", "End this sentence with a period.")],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(atTheEnd.sections[0].mechanics.length, 1);
  assert.equal(atTheEnd.sections[0].mechanics[0].correction, "market.");
});

test("C05h: a one-word quote resolves to the whole word, not a letter inside another word", () => {
  const text = "In class i can think better after a break.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("punctuation", "i", "I", "The word I is always capitalized.", {
        sourceQuote: "In class i can think better after a break.",
      })],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 1);
  const row = result.sections[0].mechanics[0];
  assert.equal(sliceOf(text, row), "i");
  assert.equal(row.anchor.start, text.indexOf(" i ") + 1);
});

test("C06: an explicit empty correction deletes; null or missing stays invalid", () => {
  const text = "I very like it.";
  const ok = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("grammar", "very", "", "Remove very here.")],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(ok.sections[0].mechanics.length, 1);
  assert.equal(ok.sections[0].mechanics[0].correction, "");
  assert.equal(ok.sections[0].mechanicsReview.status, "checked");

  for (const bad of [null, undefined]) {
    const result = run(
      [d("body", 0, text)],
      [sec("body", 0, {
        mechanics: [{ category: "grammar", original: "very", correction: bad, explanation: "Remove very here." }],
        mechanicsReview: reviewed,
      })],
    );
    assert.equal(result.sections[0].mechanics.length, 0);
    assert.equal(result.sections[0].mechanicsReview.status, "partial");
    assert.ok(result.sections[0].mechanicsReview.reasons.includes("invalid_candidate"));
  }
});

/* ------------------------------------------------------------------ */
/* C07–C08: ambiguity and per-slot anchoring                           */
/* ------------------------------------------------------------------ */

test("C07: a repeated word with no unique context is never guessed", () => {
  const result = run(
    [d("body", 0, "We go fast and we go slow.")],
    [sec("body", 0, {
      mechanics: [fix("verb_tense", "go", "went", "Use the past tense.")],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 0);
  assert.equal(result.sections[0].mechanicsReview.status, "partial");
  assert.ok(result.sections[0].mechanicsReview.reasons.includes("ambiguous_source"));
});

test("C08: a correction anchors only against its own section instance", () => {
  const result = run(
    [d("body", 0, "The dog ran."), d("body", 1, "The cat sat.")],
    [
      sec("body", 0, {
        mechanics: [fix("grammar", "cat", "cats", "More than one cat.")],
        mechanicsReview: reviewed,
      }),
      sec("body", 1, {
        mechanics: [fix("grammar", "cat", "cats", "More than one cat.")],
        mechanicsReview: reviewed,
      }),
    ],
  );
  const first = result.sections.find((row) => row.index === 0);
  const second = result.sections.find((row) => row.index === 1);
  // "cat" is absent from the dog paragraph: no cross-paragraph fallback.
  assert.equal(first.mechanics.length, 0);
  assert.equal(first.mechanicsReview.status, "partial");
  // The same proposal is valid in the paragraph that really contains it.
  assert.equal(second.mechanics.length, 1);
  assert.equal(sliceOf("The cat sat.", second.mechanics[0]), "cat");
  assert.equal(second.mechanicsReview.status, "checked");
});

test("a relocated coaching slot rejects its mechanics outright", () => {
  // Two reply rows both request body index 0; the second is relocated to index 1
  // by the coaching freeSlot fallback, so its corrections must not land there.
  const result = run(
    [d("body", 0, "The dog ran."), d("body", 1, "The cat sat.")],
    [
      sec("body", 0, { nextStep: "Add a detail." }),
      sec("body", 0, {
        mechanics: [fix("grammar", "cat", "cats", "More than one cat.")],
        mechanicsReview: reviewed,
      }),
    ],
  );
  const relocated = result.sections.find((row) => row.index === 1);
  assert.equal(relocated.mechanics.length, 0);
  assert.equal(relocated.mechanicsReview.status, "partial");
  assert.ok(relocated.mechanicsReview.reasons.includes("slot_mismatch"));
});

/* ------------------------------------------------------------------ */
/* C09: invalid candidates                                             */
/* ------------------------------------------------------------------ */

test("C09: invalid candidates are rejected with diagnostics, not transformed", () => {
  const result = run(
    [d("body", 0, "I like school.")],
    [sec("body", 0, {
      mechanics: [
        fix("spelling", "nonexistent", "x", "Not in the draft."),
        fix("style", "like", "love", "Not a real category."),
        { category: "grammar", original: { bad: true }, correction: "x", explanation: "Object original." },
        fix("grammar", "like", "love", "x".repeat(300)),
      ],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 0);
  const review = result.sections[0].mechanicsReview;
  assert.equal(review.status, "partial");
  assert.ok(review.reasons.includes("invalid_candidate"));
  assert.ok(review.reasons.includes("ambiguous_source"));
});

/* ------------------------------------------------------------------ */
/* C10: whitespace and Unicode boundaries                              */
/* ------------------------------------------------------------------ */

test("C10: an emoji before the error keeps raw offsets and is never split", () => {
  const text = "We  play\noutside 😊 becaus it is fun.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("spelling", "becaus", "because", "Because ends with e.")],
      mechanicsReview: reviewed,
    })],
  );
  const row = result.sections[0].mechanics[0];
  assert.equal(sliceOf(text, row), "becaus");
  const canonical = canonicalSectionText(text);
  for (const boundary of [row.anchor.start, row.anchor.end]) {
    const code = canonical.charCodeAt(boundary);
    assert.ok(!(code >= 0xdc00 && code <= 0xdfff), "boundary lands on a low surrogate");
  }
});

test("C10: a whitespace-only difference maps back to the raw source slice", () => {
  const text = "a healthy\nbody is good.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [fix("grammar", "healthy body", "a healthy body", "Add a before healthy body.")],
      mechanicsReview: reviewed,
    })],
  );
  const row = result.sections[0].mechanics[0];
  assert.equal(row.original, "healthy\nbody");
  assert.equal(sliceOf(text, row), "healthy\nbody");
  assert.equal(row.correction, "a healthy body");
});

/* ------------------------------------------------------------------ */
/* C12–C13: dedup, ordering, competing replacements                    */
/* ------------------------------------------------------------------ */

test("C12: an exact duplicate proposal is deduped without a partial penalty", () => {
  const result = run(
    [d("body", 0, "sme peoeple are here.")],
    [sec("body", 0, {
      mechanics: [
        fix("spelling", "sme", "some", "Some is spelled s-o-m-e."),
        fix("spelling", "sme", "some", "Some is spelled s-o-m-e."),
        fix("spelling", "peoeple", "people", "People is spelled p-e-o-p-l-e."),
      ],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 2);
  assert.equal(result.sections[0].mechanicsReview.status, "checked");
});

test("C13: competing replacements for one span publish neither", () => {
  const result = run(
    [d("body", 0, "I like becaus it.")],
    [sec("body", 0, {
      mechanics: [
        fix("spelling", "becaus", "because", "Because ends with e."),
        fix("spelling", "becaus", "became", "A different replacement."),
      ],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 0);
  assert.equal(result.sections[0].mechanicsReview.status, "partial");
  assert.ok(result.sections[0].mechanicsReview.reasons.includes("conflicting_span"));
});

/* ------------------------------------------------------------------ */
/* C15: privacy artifacts                                              */
/* ------------------------------------------------------------------ */

test("C15: a redaction artifact is never corrected; a clean original still anchors", () => {
  const text = "I think it is good becaus they are fair.";
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: [
        fix("spelling", "[email]", "test@example.com", "Expand the placeholder."),
        fix("spelling", "{{student}}", "Name", "Expand the token."),
        fix("spelling", "becaus", "because", "Because ends with e.", {
          sourceQuote: "good becaus [email]",
        }),
      ],
      mechanicsReview: reviewed,
    })],
  );
  const rows = result.sections[0].mechanics;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].original, "becaus");
  assert.equal(sliceOf(text, rows[0]), "becaus");
  const review = result.sections[0].mechanicsReview;
  assert.equal(review.status, "partial");
  assert.ok(review.reasons.includes("invalid_candidate"));
});

/* ------------------------------------------------------------------ */
/* C16–C17: caps and hasMore                                           */
/* ------------------------------------------------------------------ */

test("C16: more than two legitimate errors survive in one paragraph", () => {
  const result = run(
    [d("body", 0, "sme peoeple lik skool.")],
    [sec("body", 0, {
      mechanics: [
        fix("spelling", "sme", "some", "Some is spelled s-o-m-e."),
        fix("spelling", "peoeple", "people", "People is spelled p-e-o-p-l-e."),
        fix("spelling", "lik", "like", "Like ends with e."),
        fix("spelling", "skool", "school", "School is spelled s-c-h-o-o-l."),
      ],
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 4);
  assert.equal(result.sections[0].mechanicsReview.status, "checked");
});

test("C17: hasMore downgrades a complete-looking check to partial", () => {
  const result = run(
    [d("body", 0, "sme peoeple are here.")],
    [sec("body", 0, {
      mechanics: [
        fix("spelling", "sme", "some", "Some is spelled s-o-m-e."),
        fix("spelling", "peoeple", "people", "People is spelled p-e-o-p-l-e."),
      ],
      mechanicsReview: { reviewed: true, hasMore: true },
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 2);
  assert.equal(result.sections[0].mechanicsReview.status, "partial");
  assert.ok(result.sections[0].mechanicsReview.reasons.includes("has_more"));
});

test("C17: the per-section cap keeps 12 and reports partial", () => {
  const tokens = Array.from({ length: 13 }, (_, i) => `w${String(i).padStart(2, "0")}`);
  const text = tokens.join(" ");
  const result = run(
    [d("body", 0, text)],
    [sec("body", 0, {
      mechanics: tokens.map((token) => fix("spelling", token, `fixed-${token}`, "A spelling fix.")),
      mechanicsReview: reviewed,
    })],
  );
  assert.equal(result.sections[0].mechanics.length, 12);
  assert.equal(result.sections[0].mechanicsReview.status, "partial");
  assert.ok(result.sections[0].mechanicsReview.reasons.includes("limit_reached"));
});

test("C17: the whole-assessment cap keeps 48 and trims honestly", () => {
  const draftSections = [];
  const replySections = [];
  for (let s = 0; s < 5; s += 1) {
    const tokens = Array.from({ length: 10 }, (_, i) => `s${s}t${String(i).padStart(2, "0")}`);
    draftSections.push(d("body", s, tokens.join(" ")));
    replySections.push(sec("body", s, {
      mechanics: tokens.map((token) => fix("spelling", token, `fixed-${token}`, "A spelling fix.")),
      mechanicsReview: reviewed,
    }));
  }
  const result = run(draftSections, replySections);
  const total = result.sections.reduce((sum, row) => sum + row.mechanics.length, 0);
  assert.equal(total, 48);
  const trimmed = result.sections.filter((row) => row.mechanicsReview.status === "partial");
  assert.ok(trimmed.length >= 1);
  assert.ok(trimmed.some((row) => row.mechanicsReview.reasons.includes("limit_reached")));
});

/* ------------------------------------------------------------------ */
/* C18–C20: honest status for empty, missing and clipped reviews       */
/* ------------------------------------------------------------------ */

test("C18: an explicitly reviewed clean paragraph invents no error", () => {
  const result = run(
    [d("body", 0, "I like school.")],
    [sec("body", 0, { mechanics: [], mechanicsReview: reviewed })],
  );
  assert.equal(result.sections[0].mechanics.length, 0);
  assert.equal(result.sections[0].mechanicsReview.status, "checked");
  assert.equal(result.sections[0].mechanicsReview.reasons, undefined);
});

test("C19: a missing language response keeps coaching and reports unavailable", () => {
  const result = run(
    [d("body", 0, "I like school.")],
    [sec("body", 0, { nextStep: "Add one reason.", evidence: "I like school" })],
  );
  assert.equal(result.ok, true);
  assert.equal(result.sections[0].nextStep, "Add one reason.");
  assert.deepEqual(result.sections[0].mechanics, []);
  assert.equal(result.sections[0].mechanicsReview.status, "unavailable");
  assert.ok(result.sections[0].mechanicsReview.reasons.includes("missing_response"));
});

test("C20: coverage marks a clipped section incomplete and an empty one unavailable", () => {
  const big = "word ".repeat(2400);
  const coverage = draftPromptCoverage({
    number: 1,
    sections: [d("body", 0, big), d("conclusion", 0, "")],
  });
  assert.deepEqual(coverage.get("body:0"), { available: true, complete: false });
  assert.deepEqual(coverage.get("conclusion:0"), { available: false, complete: false });
});

test("C20: a clipped section is never claimed checked; an empty one is unavailable", () => {
  const big = "word ".repeat(2400);
  const result = run(
    [d("body", 0, big), d("conclusion", 0, "")],
    [
      sec("body", 0, { mechanics: [], mechanicsReview: reviewed }),
      sec("conclusion", 0, { mechanics: [], mechanicsReview: reviewed }),
    ],
  );
  const body = result.sections.find((row) => row.key === "body");
  const conclusion = result.sections.find((row) => row.key === "conclusion");
  assert.equal(body.mechanicsReview.status, "partial");
  assert.ok(body.mechanicsReview.reasons.includes("source_truncated"));
  assert.equal(conclusion.mechanicsReview.status, "unavailable");
  assert.ok(conclusion.mechanicsReview.reasons.includes("section_unavailable"));
});

/* ------------------------------------------------------------------ */
/* Storage: additive model fields preserve legacy rows                 */
/* ------------------------------------------------------------------ */

const oid = () => new mongoose.Types.ObjectId();
const assessmentDoc = (sections) =>
  new WritingAssessment({
    school: oid(),
    project: oid(),
    assignment: oid(),
    student: oid(),
    draft: oid(),
    kind: "feedback",
    aiStatus: "done",
    sections,
  });

test("W15: a legacy two-field pair validates and gains no new fields", () => {
  const doc = assessmentDoc([
    { key: "body", index: 0, mechanics: [{ original: "becaus", correction: "because" }] },
  ]);
  assert.equal(doc.validateSync(), undefined);
  const row = doc.sections[0].mechanics[0];
  assert.equal(row.original, "becaus");
  assert.equal(row.correction, "because");
  assert.equal(row.category, undefined);
  assert.equal(row.explanation, undefined);
  assert.equal(row.anchor, undefined);
  assert.equal(doc.sections[0].mechanicsReview, undefined);
});

test("a typed row with a verified anchor validates", () => {
  const doc = assessmentDoc([
    {
      key: "body",
      index: 0,
      mechanics: [
        {
          original: "becaus",
          correction: "because",
          category: "spelling",
          explanation: "Because ends with e.",
          anchor: { start: 0, end: 6 },
        },
      ],
      mechanicsReview: { version: 1, status: "checked", reasons: [] },
    },
  ]);
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.sections[0].mechanics[0].category, "spelling");
  assert.equal(doc.sections[0].mechanicsReview.status, "checked");
});

test("an out-of-enum category is refused by the schema", () => {
  const doc = assessmentDoc([
    { key: "body", index: 0, mechanics: [{ original: "x", correction: "y", category: "style" }] },
  ]);
  const error = doc.validateSync();
  assert.ok(error);
  assert.ok(error.errors["sections.0.mechanics.0.category"]);
});

test("an out-of-enum review status is refused by the schema", () => {
  const doc = assessmentDoc([
    { key: "body", index: 0, mechanicsReview: { version: 1, status: "done" } },
  ]);
  const error = doc.validateSync();
  assert.ok(error);
  assert.ok(error.errors["sections.0.mechanicsReview.status"]);
});

/* ------------------------------------------------------------------ */
/* Projection: the child sees only the public correction shape         */
/* ------------------------------------------------------------------ */

test("W01: a typed row keeps category, explanation and anchor in the projection", () => {
  const [projected] = childSections([
    {
      key: "body",
      index: 0,
      mechanics: [
        {
          original: "becaus",
          correction: "because",
          category: "spelling",
          explanation: "Because ends with e.",
          anchor: { start: 26, end: 32 },
        },
      ],
      mechanicsReview: { version: 1, status: "partial", reasons: ["invalid_candidate"] },
    },
  ]);
  assert.deepEqual(projected.mechanics[0], {
    original: "becaus",
    correction: "because",
    category: "spelling",
    explanation: "Because ends with e.",
    anchor: { start: 26, end: 32 },
  });
  assert.deepEqual(projected.mechanicsReview, { version: 1, status: "partial" });
});

test("W16: teacher-only reason codes never reach the child projection", () => {
  const [projected] = childSections([
    {
      key: "body",
      index: 0,
      mechanics: [],
      mechanicsReview: { version: 1, status: "partial", reasons: ["ambiguous_source", "limit_reached"] },
    },
  ]);
  assert.deepEqual(projected.mechanicsReview, { version: 1, status: "partial" });
  assert.equal("reasons" in projected.mechanicsReview, false);
});

test("W15: a legacy pair projects as original/correction only", () => {
  const [projected] = childSections([
    { key: "body", index: 0, mechanics: [{ original: "becaus", correction: "because" }] },
  ]);
  assert.deepEqual(projected.mechanics[0], { original: "becaus", correction: "because" });
  assert.equal("mechanicsReview" in projected, false);
});

test("a typed row without a verified anchor projects no anchor", () => {
  const [projected] = childSections([
    {
      key: "body",
      index: 0,
      mechanics: [{ original: "x", correction: "y", category: "grammar", explanation: "A fix." }],
    },
  ]);
  assert.deepEqual(projected.mechanics[0], {
    original: "x",
    correction: "y",
    category: "grammar",
    explanation: "A fix.",
  });
  assert.equal("anchor" in projected.mechanics[0], false);
});

test("W16: the projection carries no private or raw provider fields", () => {
  const [projected] = childSections([
    {
      key: "body",
      index: 0,
      aiOriginal: "raw provider text",
      score: 3,
      maxScore: 5,
      evidenceFact: { id: "f1", text: "a lesson fact" },
      mechanics: [{ original: "x", correction: "y", category: "spelling", explanation: "A fix.", anchor: { start: 0, end: 1 } }],
      mechanicsReview: { version: 1, status: "checked", reasons: [] },
    },
  ]);
  for (const forbidden of ["aiOriginal", "score", "maxScore", "evidenceFact"]) {
    assert.equal(forbidden in projected, false, `${forbidden} must not project`);
  }
});

/* ------------------------------------------------------------------ */
/* W13: readability simplification never corrupts a correction         */
/* ------------------------------------------------------------------ */

test("W13: simplifying an explanation leaves original, correction and anchor intact", () => {
  const longExplanation =
    "The word because is spelled with an e at the end, and when you write it correctly the reader can understand the reason you are giving much more easily.";
  const row = {
    original: "becaus",
    correction: "because",
    category: "spelling",
    explanation: longExplanation,
    anchor: { start: 26, end: 32 },
  };
  const fields = { sections: [{ key: "body", index: 0, mechanics: [row] }], overall: {} };
  const simplified = simplifyFeedbackFields(fields, "emerging");
  const after = simplified.sections[0].mechanics[0];
  assert.equal(after.original, "becaus");
  assert.equal(after.correction, "because");
  assert.deepEqual(after.anchor, { start: 26, end: 32 });
  assert.equal(after.category, "spelling");
  // The long sentence was re-shaped for the emerging tier, within the stored cap.
  assert.notEqual(after.explanation, longExplanation);
  assert.ok(after.explanation.length <= 240);
});

test("W13: a simplification that would exceed the cap keeps the valid explanation", () => {
  // A single very long word cannot be split below the cap; the original stays.
  const longWord = "x".repeat(250);
  const row = {
    original: "becaus",
    correction: "because",
    category: "spelling",
    explanation: longWord,
    anchor: { start: 0, end: 6 },
  };
  const fields = { sections: [{ key: "body", index: 0, mechanics: [row] }], overall: {} };
  const simplified = simplifyFeedbackFields(fields, "emerging");
  assert.equal(simplified.sections[0].mechanics[0].explanation, longWord);
  assert.deepEqual(simplified.sections[0].mechanics[0].anchor, { start: 0, end: 6 });
});

test("W13: explanations are measured in the child-facing reading level", () => {
  const base = { sections: [{ key: "body", index: 0, mechanics: [] }], overall: {} };
  const withReason = {
    sections: [
      {
        key: "body",
        index: 0,
        mechanics: [
          {
            original: "x",
            correction: "y",
            category: "spelling",
            explanation:
              "The utilization of sophisticated vocabulary necessitates comprehension of orthographic conventions.",
            anchor: { start: 0, end: 1 },
          },
        ],
      },
    ],
    overall: {},
  };
  assert.ok(feedbackReadability(withReason).score > feedbackReadability(base).score);
});