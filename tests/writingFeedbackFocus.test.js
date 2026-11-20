import test from "node:test";
import assert from "node:assert/strict";

import {
  FOCUS_BUDGETS,
  applyFocusBudget,
  budgetForTier,
  configSnapshotFor,
} from "../services/writingAssistantLogic.js";
import { normalizeFeedback } from "../services/writingAssistantPrompts.js";

const assignment = {
  sections: [
    { key: "introduction", label: "Introduction", kind: "introduction" },
    { key: "body", label: "Body", kind: "body" },
    { key: "conclusion", label: "Conclusion", kind: "conclusion" },
  ],
  rubric: [
    { key: "ideas", label: "Ideas", maxScore: 5 },
    { key: "organisation", label: "Organisation", maxScore: 5 },
    { key: "conventions", label: "Conventions", maxScore: 5 },
  ],
};

const draft = {
  number: 1,
  sections: [
    {
      key: "introduction",
      index: 0,
      text: "I think uniforms are good becaus they are fair.",
    },
    {
      key: "body",
      index: 0,
      text: "First, uniforms save time in the morning becase everyone wears the same clothes.",
    },
    {
      key: "conclusion",
      index: 0,
      text: "I think uniforms are good for our school.",
    },
  ],
};

const snapshot = configSnapshotFor(assignment);

const section = (key, index, patch = {}) => ({
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

const reply = (sections, patch = {}) => ({
  sections,
  overall: {
    summary: "You have a clear idea.",
    nextPriorities: ["Add one example.", "Join two short sentences.", "Write one more reason."],
  },
  scores: [
    { key: "ideas", score: 3, evidence: "I think uniforms are good" },
    { key: "organisation", score: 3, evidence: "First, uniforms save time" },
    { key: "conventions", score: 2, evidence: "they are fair" },
  ],
  ...patch,
});

test("an unknown tier gets the developing budget, never the widest one", () => {
  assert.deepEqual(budgetForTier("nope"), FOCUS_BUDGETS.developing);
  assert.deepEqual(budgetForTier(""), FOCUS_BUDGETS.developing);
  assert.equal(budgetForTier("emerging").totalImprovements, 3);
});

test("the emerging budget trims sections, improvements and priorities", () => {
  const budgeted = applyFocusBudget({
    tier: "emerging",
    sections: [
      section("introduction", 0, {
        evidence: "I think uniforms are good",
        improvements: ["One.", "Two."],
        strengths: ["A", "B"],
      }),
      section("body", 0, {
        evidence: "uniforms save time",
        improvements: ["Three.", "Four."],
      }),
      section("conclusion", 0, {
        evidence: "good for our school",
        improvements: ["Five."],
      }),
    ],
    priorities: ["p1", "p2", "p3"],
  });

  assert.equal(budgeted.focus.tier, "emerging");
  const kept = budgeted.sections.reduce(
    (sum, row) => sum + row.improvements.length,
    0,
  );
  assert.ok(kept <= FOCUS_BUDGETS.emerging.totalImprovements);
  assert.ok(
    budgeted.sections.filter((row) => row.improvements.length).length <=
      FOCUS_BUDGETS.emerging.sectionsWithImprovements,
  );
  assert.ok(
    budgeted.sections.every(
      (row) => row.improvements.length <= FOCUS_BUDGETS.emerging.improvementsPerSection,
    ),
  );
  assert.equal(budgeted.sections[0].strengths.length, 1);
  assert.equal(budgeted.priorities.length, 1);
  assert.ok(budgeted.dropped.improvements.length >= 1);
  assert.equal(budgeted.dropped.priorities.length, 2);
});

test("an anchored section keeps its improvement before an unanchored one", () => {
  const budgeted = applyFocusBudget({
    tier: "emerging",
    sections: [
      section("introduction", 0, { improvements: ["unquoted first"] }),
      section("body", 0, { improvements: ["unquoted second"] }),
      section("conclusion", 0, {
        evidence: "good for our school",
        improvements: ["quoted"],
      }),
    ],
    priorities: [],
  });

  assert.deepEqual(budgeted.sections[0].improvements, ["unquoted first"]);
  assert.deepEqual(budgeted.sections[1].improvements, []);
  assert.deepEqual(budgeted.sections[2].improvements, ["quoted"]);
  assert.deepEqual(
    budgeted.dropped.improvements.map((row) => row.text),
    ["unquoted second"],
  );
});

test("V2 keeps word fixes in mechanics and out of coaching", () => {
  const normalized = normalizeFeedback({
    parsed: reply([
      section("introduction", 0, {
        strengths: [
          { text: "Your idea is clear.", evidence: "I think uniforms are good" },
          { text: "Warm praise.", evidence: "words the child never wrote" },
        ],
        improvements: [
          "Fix becaus → because.",
          "Add one more reason.",
        ],
        evidence: "I think uniforms are good becaus they are fair",
        nextStep: "Write one more reason.",
        mechanics: [
          {
            category: "spelling",
            original: "becaus",
            correction: "because",
            explanation: "Because ends with the letter e.",
          },
          { original: "zzznotinthedraft", correction: "nothing" },
        ],
        mechanicsReview: { reviewed: true, hasMore: false },
      }),
      section("body", 0, {
        evidence: "uniforms save time",
        nextStep: "Add one example.",
        mechanics: [
          {
            category: "spelling",
            original: "becase",
            correction: "because",
            explanation: "Because ends with the letter e.",
          },
        ],
        mechanicsReview: { reviewed: true, hasMore: false },
      }),
      section("conclusion", 0, {
        evidence: "good for our school",
        nextStep: "Say how uniforms help next year.",
      }),
    ]),
    draft,
    snapshot,
    assignment,
    feedbackV2: true,
  });

  assert.equal(normalized.ok, true);
  const introduction = normalized.sections[0];
  assert.deepEqual(introduction.strengths, ["Your idea is clear."]);
  assert.deepEqual(introduction.improvements, ["Add one more reason."]);
  assert.deepEqual(introduction.mechanics, [
    {
      category: "spelling",
      original: "becaus",
      correction: "because",
      explanation: "Because ends with the letter e.",
      anchor: { start: 26, end: 32 },
    },
  ]);
  assert.deepEqual(introduction.mechanicsReview, {
    version: 1,
    status: "partial",
    reasons: ["invalid_candidate"],
  });
  assert.deepEqual(normalized.sections[1].mechanics, [
    {
      category: "spelling",
      original: "becase",
      correction: "because",
      explanation: "Because ends with the letter e.",
      anchor: { start: 41, end: 47 },
    },
  ]);
  assert.deepEqual(normalized.sections[1].mechanicsReview, {
    version: 1,
    status: "checked",
  });
  assert.equal(normalized.sections[2].mechanics.length, 0);
  assert.deepEqual(normalized.sections[2].mechanicsReview, {
    version: 1,
    status: "unavailable",
    reasons: ["missing_response"],
  });
});

test("a V2 strength without real words in the draft is dropped", () => {
  const normalized = normalizeFeedback({
    parsed: reply([
      section("body", 0, {
        strengths: [
          { text: "Great job.", evidence: "not in this draft" },
          { text: "You named a reason early.", evidence: "uniforms save time" },
        ],
        nextStep: "Add one example.",
      }),
    ]),
    draft,
    snapshot,
    assignment,
    feedbackV2: true,
  });

  assert.deepEqual(normalized.sections[0].strengths, [
    "You named a reason early.",
  ]);
});

test("a repeated next step with a fresh scaffold clears the publish block", () => {
  const previousNextSteps = [
    { key: "introduction", index: 0, nextStep: "Add one more reason." },
  ];
  const normalized = normalizeFeedback({
    parsed: reply([
      section("introduction", 0, {
        evidence: "I think uniforms are good",
        nextStep: "Add one more reason.",
        scaffold: { kind: "frame", text: "Try: Uniforms are good because ____." },
      }),
    ]),
    draft,
    snapshot,
    assignment,
    feedbackV2: true,
    repeatGuard: true,
    previousNextSteps,
  });

  const introduction = normalized.sections[0];
  assert.equal(introduction.nextStep, "Try: Uniforms are good because ____.");
  assert.equal(introduction.intervention.repeat, true);
  assert.equal(introduction.intervention.needsRewrite, false);
  assert.deepEqual(introduction.scaffold, {
    kind: "frame",
    text: "Try: Uniforms are good because ____.",
  });
});

test("a repeat with no fresh scaffold is marked for rewrite", () => {
  const normalized = normalizeFeedback({
    parsed: reply([
      section("introduction", 0, {
        evidence: "I think uniforms are good",
        nextStep: "Add one more reason.",
      }),
    ]),
    draft,
    snapshot,
    assignment,
    feedbackV2: true,
    repeatGuard: true,
    previousNextSteps: [
      { key: "introduction", index: 0, nextStep: "Add one more reason." },
    ],
  });

  assert.equal(normalized.sections[0].intervention.repeat, true);
  assert.equal(normalized.sections[0].intervention.needsRewrite, true);
});

test("taught focus excludes untaught criteria from the total, but never all of them", () => {
  const taught = normalizeFeedback({
    parsed: reply([
      section("body", 0, { evidence: "uniforms save time", nextStep: "Add one example." }),
    ]),
    draft,
    snapshot,
    assignment,
    feedbackV2: true,
    taughtFocus: ["Ideas", "Organisation"],
  });

  assert.deepEqual(
    taught.scores.map((row) => [row.key, row.focusExcluded === true]),
    [
      ["ideas", false],
      ["organisation", false],
      ["conventions", true],
    ],
  );
  assert.equal(taught.totalScore, 6);

  const unmatched = normalizeFeedback({
    parsed: reply([
      section("body", 0, { evidence: "uniforms save time", nextStep: "Add one example." }),
    ]),
    draft,
    snapshot,
    assignment,
    feedbackV2: true,
    taughtFocus: ["Typing"],
  });
  assert.equal(unmatched.scores.some((row) => row.focusExcluded), false);
});

test("flag-off replies keep the coaching shape and report an unavailable language check", () => {
  const plain = normalizeFeedback({
    parsed: reply([
      section("body", 0, {
        strengths: ["A plain string strength."],
        improvements: ["Keep a plain improvement."],
        evidence: "uniforms save time",
        nextStep: "Add one example.",
      }),
    ]),
    draft,
    snapshot,
    assignment,
  });

  const body = plain.sections[0];
  assert.deepEqual(body.strengths, ["A plain string strength."]);
  assert.deepEqual(body.mechanics, []);
  assert.deepEqual(body.mechanicsReview, {
    version: 1,
    status: "unavailable",
    reasons: ["missing_response"],
  });
  assert.equal("scaffold" in body, false);
  assert.equal(body.intervention, undefined);
});
