import test from "node:test";
import assert from "node:assert/strict";

import {
  atomicTasks,
  classifyNewIssue,
  computedImprovements,
  diffStory,
  filterImprovementClaims,
  graduatedWords,
  rankSpellingCandidates,
  rankSupportWords,
  sanitizeLedgerRows,
  stallSuggestion,
  supportDefaultShown,
  verifyTaskQuote,
} from "../services/writingRevisionIntelligence.js";

/* ------------------------------------------------------------------ */
/* D1. Atomic tasks                                                    */
/* ------------------------------------------------------------------ */

test("a bundled instruction becomes two single-action tasks", () => {
  assert.deepEqual(
    atomicTasks([
      "Add a detail about the playground and explain why it matters.",
    ]),
    ["Add a detail about the playground", "explain why it matters."],
  );
});

test("a noun phrase completing the verb gets its own task", () => {
  assert.deepEqual(atomicTasks(["Fix the spelling and the clarity."]), [
    "Fix the spelling",
    "Fix the clarity.",
  ]);
});

test("atomic tasks drop duplicates and uncheckable fragments, three at most", () => {
  assert.deepEqual(
    atomicTasks([
      "Fix",
      "Add a detail",
      "add a detail",
      "Use a comma",
      "Check the tense",
      "Read the ending",
    ]),
    ["Add a detail", "Use a comma", "Check the tense"],
  );
});

/* ------------------------------------------------------------------ */
/* D5. Task quotes                                                     */
/* ------------------------------------------------------------------ */

test("a task is verified only by a new quote from the new draft", () => {
  const result = verifyTaskQuote({
    note: 'You now wrote "the dog barked loudly".',
    currentText: "Then the dog barked loudly at me.",
    previousText: "The dog was quiet.",
  });
  assert.equal(result.verified, true);
  assert.equal(result.quote, "the dog barked loudly");
});

test("quoting the earlier draft proves nothing", () => {
  assert.deepEqual(
    verifyTaskQuote({
      note: "You wrote the dog barked loudly.",
      currentText: "Then the dog barked loudly at me.",
      previousText: "The dog barked loudly all night.",
    }),
    { verified: false, quote: "" },
  );
});

test("a note without a checkable quote stays unverified", () => {
  assert.deepEqual(
    verifyTaskQuote({ note: "Good job", currentText: "Anything at all." }),
    { verified: false, quote: "" },
  );
});

/* ------------------------------------------------------------------ */
/* D3. Computed improvements                                           */
/* ------------------------------------------------------------------ */

const scores = (...rows) => rows.map(([key, label, value]) => ({ key, label, score: value, maxScore: 4 }));

test("every improvement fact is read from saved data", () => {
  const facts = computedImprovements({
    previousScores: scores(["organization", "Organization", 2]),
    currentScores: [
      ...scores(["organization", "Organization", 3]),
      ...scores(["voice", "Voice", 2]),
      { key: "wordChoice", label: "Word choice", score: 1, focusExcluded: true },
    ],
    taskResults: [
      { text: "Add a reason.", applied: true },
      { text: "Use a comma.", applied: false },
    ],
    spellingWins: [{ word: "because" }],
    addedSections: [{ key: "conclusion", index: 2 }],
    sectionLabels: { "conclusion:2": "Conclusion" },
  });
  assert.deepEqual(
    facts.map((fact) => [fact.kind, fact.label]),
    [
      ["rubric", "Organization"],
      ["task", "Add a reason."],
      ["spelling", "because"],
      ["structure", "Conclusion"],
    ],
  );
});

test("a flat or excluded score is not an improvement", () => {
  assert.deepEqual(
    computedImprovements({
      previousScores: scores(["organization", "Organization", 3]),
      currentScores: scores(["organization", "Organization", 3]),
    }),
    [],
  );
});

test("a claim with no computed fact behind it is dropped", () => {
  const kept = filterImprovementClaims({
    facts: [
      { kind: "rubric", label: "Organization", detail: "" },
      { kind: "spelling", label: "because", detail: "" },
    ],
    claims: ["Your organization got stronger.", "You used beautiful imagery."],
  });
  // The real claim stays, the invented one goes, and the unnamed fact is added.
  assert.deepEqual(kept, ["Your organization got stronger.", "because"]);
});

/* ------------------------------------------------------------------ */
/* D4. New issues                                                      */
/* ------------------------------------------------------------------ */

test("an issue is new only when its evidence was not in the earlier draft", () => {
  assert.deepEqual(
    classifyNewIssue({
      text: "The ending stops suddenly.",
      evidence: "and then we went home",
      previousText: "We played football.",
      currentText: "We played football and then we went home",
    }),
    {
      text: "The ending stops suddenly.",
      evidence: "and then we went home",
      verified: true,
    },
  );
});

test("an issue present in both drafts is unresolved, never new", () => {
  assert.equal(
    classifyNewIssue({
      text: "The ending stops suddenly.",
      evidence: "and then we went home",
      previousText: "We played football and then we went home",
      currentText: "We played football and then we went home",
    }),
    null,
  );
});

test("an issue with no quote is kept as unverified", () => {
  assert.deepEqual(
    classifyNewIssue({ text: "The ending stops suddenly.", currentText: "x" }),
    { text: "The ending stops suddenly.", evidence: "", verified: false },
  );
});

/* ------------------------------------------------------------------ */
/* D6. Meaningful change story                                         */
/* ------------------------------------------------------------------ */

const storyOf = (alignment, sectionLabels = {}) =>
  diffStory(alignment, { sectionLabels });

test("a new or removed part is named outright", () => {
  const story = storyOf(
    {
      added: [{ key: "conclusion", index: 2, text: "A closing sentence." }],
      removed: [{ key: "introduction", index: 0, text: "One two three." }],
      matched: [],
    },
    { "conclusion:2": "Conclusion", "introduction:0": "Introduction" },
  );
  assert.deepEqual(
    story.changes.map((row) => [row.kind, row.label]),
    [
      ["added", "Conclusion"],
      ["removed", "Introduction"],
    ],
  );
  assert.equal(story.mostlyReworded, false);
});

test("a synonym swap is reworded, not progress", () => {
  const story = storyOf({
    matched: [
      {
        key: "introduction",
        index: 0,
        changed: true,
        before: { text: "We need uniforms because they are fair." },
        after: { text: "We need uniforms since they are fair." },
      },
    ],
  });
  assert.equal(story.changes[0].kind, "reworded");
  assert.equal(story.mostlyReworded, true);
});

test("a rebuilt paragraph is rewritten", () => {
  const story = storyOf({
    matched: [
      {
        key: "body",
        index: 0,
        changed: true,
        before: { text: "Uniforms are fair." },
        after: { text: "Every child deserves the same clothes at school." },
      },
    ],
  });
  assert.equal(story.changes[0].kind, "rewritten");
  assert.equal(story.mostlyReworded, false);
});

/* ------------------------------------------------------------------ */
/* D2. Stall suggestions                                               */
/* ------------------------------------------------------------------ */

test("the stall suggestion escalates with the ignored checks", () => {
  assert.equal(stallSuggestion({ unresolvedStreak: 2 }), "reduce");
  assert.equal(stallSuggestion({ unresolvedStreak: 3 }), "model");
  assert.equal(stallSuggestion({ unresolvedStreak: 6 }), "conference");
});

/* ------------------------------------------------------------------ */
/* G3/G4/G6. Spelling targets                                          */
/* ------------------------------------------------------------------ */

test("emerging readers get two targets, everyone else three", () => {
  const candidates = ["badge", "cougar", "denim", "ember"].map((word) => ({
    word,
    grade: "G4",
    week: 1,
  }));
  assert.equal(
    rankSpellingCandidates({ candidates, tier: "emerging" }).length,
    2,
  );
  assert.equal(
    rankSpellingCandidates({ candidates, tier: "developing" }).length,
    3,
  );
});

test("a graduated word is never offered again", () => {
  const picked = rankSpellingCandidates({
    candidates: [
      { word: "badge", grade: "G4", week: 1 },
      { word: "cougar", grade: "G4", week: 2 },
    ],
    graduatedWords: ["badge"],
  });
  assert.deepEqual(picked.map((row) => row.word), ["cougar"]);
});

test("a word carried over from earlier feedback says so", () => {
  const picked = rankSpellingCandidates({
    candidates: [
      { word: "badge", grade: "G4", week: 1 },
      { word: "cougar", grade: "G4", week: 2 },
    ],
    publishedTargets: [{ word: "cougar" }],
  });
  assert.equal(picked[0].word, "cougar");
  assert.equal(picked[0].reason, "Was a target in earlier feedback.");
  assert.equal(picked[1].reason, "On the student's missed-word list.");
});

test("a word related to the draft says which draft word it matches", () => {
  const picked = rankSpellingCandidates({
    candidates: [{ word: "walking", grade: "G4", week: 2 }],
    draftText: "I walk to school every morning.",
  });
  assert.equal(picked[0].word, "walking");
  assert.equal(picked[0].reason, "Uses words from this draft (walk).");
});

test("the ranking score is a detail, not part of the stored target", () => {
  const [row] = rankSpellingCandidates({
    candidates: [{ word: "badge", grade: "G4", week: 1 }],
  });
  assert.deepEqual(Object.keys(row).sort(), ["grade", "reason", "week", "word"]);
});

/* ------------------------------------------------------------------ */
/* G1/G8. Support words                                                */
/* ------------------------------------------------------------------ */

test("used words come first, then earlier feedback, then the rest", () => {
  const rows = rankSupportWords({
    rows: [
      { word: "garden", week: 1 },
      { word: "beautiful", week: 2 },
      { word: "because", week: 3, source: "feedback" },
    ],
    draftText: "My garden is green.",
  });
  assert.deepEqual(
    rows.map((row) => row.word),
    ["garden", "because", "beautiful"],
  );
});

test("a word the teacher set aside sinks to the end and is marked", () => {
  const rows = rankSupportWords({
    rows: [
      { word: "garden", week: 1 },
      { word: "because", week: 3, source: "feedback" },
      { word: "beautiful", week: 2 },
    ],
    draftText: "My garden is green.",
    setAside: ["garden"],
  });
  assert.deepEqual(
    rows.map((row) => row.word),
    ["because", "beautiful", "garden"],
  );
  assert.equal(rows.at(-1).setAside, true);
});

test("words that fit the topic rise above unrelated ones", () => {
  const rows = rankSupportWords({
    rows: [
      { word: "because", week: 3 },
      { word: "garden", week: 1 },
    ],
    assignment: { title: "Garden days", topic: "garden" },
  });
  assert.deepEqual(
    rows.map((row) => row.word),
    ["garden", "because"],
  );
});

test("support rows keep their own fields and leak no ranking details", () => {
  const [row] = rankSupportWords({
    rows: [
      {
        word: "garden",
        grade: "G4",
        week: 2,
        source: "spelling",
        forms: ["gardens"],
      },
    ],
  });
  assert.deepEqual(Object.keys(row).sort(), [
    "forms",
    "grade",
    "setAside",
    "source",
    "week",
    "word",
  ]);
});

test("the default view shows eight words", () => {
  assert.equal(supportDefaultShown(), 8);
});

/* ------------------------------------------------------------------ */
/* G6. Graduation                                                      */
/* ------------------------------------------------------------------ */

test("two consecutive published wins graduate a word", () => {
  const published = (words) => ({
    publish: { state: "published" },
    spellingWins: words.map((word) => ({ word })),
  });
  assert.deepEqual(
    graduatedWords([
      published(["Because", "judged"]),
      published(["because"]),
    ]),
    ["Because"],
  );
});

test("one published round is not enough to graduate", () => {
  assert.deepEqual(
    graduatedWords([
      {
        publish: { state: "published" },
        spellingWins: [{ word: "because" }],
      },
      {
        publish: { state: "unpublished" },
        spellingWins: [{ word: "because" }],
      },
    ]),
    [],
  );
});

/* ------------------------------------------------------------------ */
/* D7. Ledger integrity                                                */
/* ------------------------------------------------------------------ */

test("ledger rows are deduped by id and normalized", () => {
  const rows = sanitizeLedgerRows([
    {
      id: "1",
      text: "Add a detail",
      status: "open",
      checks: "2",
      lastCheckedDraft: "3",
    },
    { id: "1", text: "Duplicate", status: "resolved" },
    { id: "", text: "No id" },
    { id: "2", text: "Fix the commas", status: "nonsense" },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    id: "1",
    text: "Add a detail",
    introducedDraft: 1,
    checks: 2,
    unresolvedStreak: 0,
    status: "open",
    lastCheckedDraft: 3,
  });
  assert.deepEqual(rows[1], {
    id: "2",
    text: "Fix the commas",
    introducedDraft: 1,
    checks: 0,
    unresolvedStreak: 0,
    status: "open",
  });
});
