import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLiveStudentQuestion,
  gradeLiveAnswer,
  isLiveAnswerEmpty,
  normalizeLiveQuestion,
  resolveLiveQuestionForStudent,
  validateLiveQuestion,
} from "../services/liveLessonQuestionService.js";

const mcq = {
  kind: "mcq",
  prompt: "What is 2 + 2?",
  options: [{ id: "a", text: "4" }, { id: "b", text: "5" }],
  correctOptionId: "a",
};

const matching = {
  kind: "matching",
  prompt: "Match each term with its meaning.",
  matchingPairs: [
    { left: "Simile", right: "A comparison using like or as" },
    { left: "Alliteration", right: "Repeated starting sounds" },
  ],
};

const ordering = {
  kind: "ordering",
  prompt: "Put the steps in order.",
  orderingItems: [{ text: "Preheat" }, { text: "Mix" }, { text: "Bake" }],
};

const blanks = {
  kind: "fill_in_blank",
  prompt: "The {{b1}} flows through {{b2}}.",
  blanks: [
    { id: "b1", accepts: ["Nile"] },
    { id: "b2", accepts: ["Egypt", "the Egypt"] },
  ],
};

const numeric = {
  kind: "numeric",
  prompt: "How many cm is 1 m?",
  numericRule: { mode: "exact", value: "100", unit: "cm" },
};

test("every live kind the schema allows passes its own authoring rules", () => {
  [
    mcq,
    { kind: "tf", prompt: "2 + 2 is 4.", options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correctOptionId: "true" },
    { ...mcq, kind: "multi_select", correctOptionId: "", correctOptionIds: ["a", "b"] },
    matching,
    ordering,
    blanks,
    numeric,
    { kind: "text", prompt: "Explain why the narrator lies.", guidance: "Two sentences.", criteria: "Names the motive.", minWords: 20, maxWords: 120 },
  ].forEach((question) => {
    assert.deepEqual(validateLiveQuestion(question), [], `${question.kind} should be valid`);
  });
});

test("authoring rules catch a broken key instead of saving an ungradeable question", () => {
  assert.ok(validateLiveQuestion({ ...mcq, correctOptionId: "z" }).some((e) => e.field.includes("correct answer")));
  assert.ok(validateLiveQuestion({ ...matching, matchingPairs: [matching.matchingPairs[0]] }).some((e) => e.field === "question matching pairs"));
  assert.ok(validateLiveQuestion({ ...ordering, orderingItems: ordering.orderingItems.slice(0, 2) }).length);
  assert.ok(validateLiveQuestion({ ...blanks, blanks: blanks.blanks.slice(0, 1) }).length);
  // the same count is not the same blanks: a key naming a token the text lacks drops that answer
  assert.ok(
    validateLiveQuestion({ ...blanks, blanks: [blanks.blanks[0], { id: "b3", accepts: ["Cairo"] }] })
      .some((e) => e.field === "question blanks" && e.message.includes("b3")),
  );
  assert.ok(validateLiveQuestion({ kind: "text", prompt: "" }).some((e) => e.field === "question prompt"));
  // a tolerance mode with no tolerance would silently grade as an exact match
  assert.ok(validateLiveQuestion({
    kind: "numeric",
    prompt: "Estimate the height.",
    numericRule: { mode: "relative", value: "150" },
  }).some((e) => e.field === "question tolerance"));
  assert.ok(validateLiveQuestion({ kind: "bubble", prompt: "x" }).length);
});

test("ordering and blank ids are created once, server-side, so answers can name them", () => {
  const withIds = normalizeLiveQuestion(ordering, { salt: "lesson:0" });
  assert.equal(withIds.orderingItems.length, 3);
  assert.ok(withIds.orderingItems.every((item) => item.id));
  assert.deepEqual(
    normalizeLiveQuestion(withIds, { salt: "lesson:0" }).orderingItems.map((item) => item.id),
    withIds.orderingItems.map((item) => item.id),
  );
  assert.deepEqual(
    normalizeLiveQuestion({ kind: "fill_in_blank", prompt: "The {{b1}} flows.", blanks: [{ accepts: ["Nile"] }] }).blanks,
    [{ id: "b1", accepts: ["Nile"] }],
  );
});

test("objective kinds grade through the shared practice engines", () => {
  assert.deepEqual(
    { isCorrect: gradeLiveAnswer(mcq, { selectedOptionId: "a" }).isCorrect, status: gradeLiveAnswer(mcq, { selectedOptionId: "b" }).status },
    { isCorrect: true, status: "auto" },
  );
  assert.equal(gradeLiveAnswer({ ...mcq, kind: "tf" }, { selectedOptionId: "nope" }).status, "pending");

  const multi = { ...mcq, kind: "multi_select", correctOptionId: "", correctOptionIds: ["a", "b"] };
  const partial = gradeLiveAnswer(multi, { response: ["a"] });
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.score, 0);
  assert.deepEqual(partial.detail.missing, ["B"]);

  const pairs = gradeLiveAnswer(matching, {
    response: [
      { left: "Simile", right: "A comparison using like or as" },
      { left: "Alliteration", right: "Repeated starting sounds" },
    ],
  });
  assert.equal(pairs.isCorrect, true);
  assert.equal(pairs.detail.pairs.filter((pair) => pair.matched).length, 2);

  const authoredOrder = normalizeLiveQuestion(ordering, { salt: "lesson:0" });
  const ordered = gradeLiveAnswer(authoredOrder, { response: authoredOrder.orderingItems.map((item) => item.id) });
  assert.equal(ordered.isCorrect, true);

  const filled = gradeLiveAnswer(blanks, { response: [{ id: "b1", text: "the Nile." }, { id: "b2", text: "Egypt" }] });
  assert.equal(filled.isCorrect, true, "students answer in sentences, so articles and punctuation are ignored");

  const measured = gradeLiveAnswer(numeric, { response: "100cm" });
  assert.equal(measured.isCorrect, true);
  assert.equal(gradeLiveAnswer(numeric, { response: "10" }).isCorrect, false);
});

test("a written answer waits for the teacher instead of being marked automatically", () => {
  const question = { kind: "text", prompt: "Explain why the narrator lies.", criteria: "Names the motive." };
  const graded = gradeLiveAnswer(question, { text: "He lies to protect his brother." });
  assert.equal(graded.isCorrect, null);
  assert.equal(graded.score, null);
  assert.equal(graded.status, "pending");
  assert.equal(isLiveAnswerEmpty(question, { text: "   " }), true);
  assert.equal(isLiveAnswerEmpty(question, { text: "one sentence" }), false);
});

test("an empty objective answer is refused before it reaches the grader", () => {
  assert.equal(isLiveAnswerEmpty(mcq, { selectedOptionId: "" }), true);
  assert.equal(isLiveAnswerEmpty(matching, { response: [{ left: "Simile", right: "" }] }), true);
  assert.equal(isLiveAnswerEmpty(matching, { response: [{ left: "Simile", right: "A comparison" }] }), false);
  assert.equal(isLiveAnswerEmpty(blanks, { response: [{ id: "b1", text: "" }] }), true);
  assert.equal(isLiveAnswerEmpty(ordering, { response: [] }), true);
  assert.equal(isLiveAnswerEmpty(numeric, { response: "  " }), true);
});

test("students get the shuffled presentation and none of the key", () => {
  const payload = buildLiveStudentQuestion(matching, "session:student:slide");
  assert.equal(payload.matchingPairs, undefined);
  assert.equal(payload.correctAnswer, undefined);
  assert.equal(payload.explanation, undefined);
  assert.deepEqual(payload.matchingColumns.terms, ["Simile", "Alliteration"]);
  assert.equal(payload.matchingColumns.choices.length, 2);

  const ordered = buildLiveStudentQuestion(normalizeLiveQuestion(ordering, { salt: "lesson:0" }), "seed");
  assert.deepEqual(
    [...ordered.orderingItems].map((item) => item.id).sort(),
    normalizeLiveQuestion(ordering, { salt: "lesson:0" }).orderingItems.map((item) => item.id).sort(),
    "students get the same items in a shuffled order",
  );
  assert.equal(ordered.correctAnswer, undefined);

  const number = buildLiveStudentQuestion(numeric, "seed");
  assert.equal(number.numericRule, undefined);
  assert.equal(number.numericHint.unit, "cm");

  const choice = buildLiveStudentQuestion({ ...mcq, explanation: "Counting on." }, "seed");
  assert.equal(choice.correctOptionId, undefined);
  assert.equal(choice.explanation, undefined);
  assert.equal(choice.options.length, 2);

  const written = buildLiveStudentQuestion({ kind: "text", prompt: "Explain.", guidance: "Two sentences.", criteria: "Names the motive." }, "seed");
  assert.equal(written.criteria, undefined);
  assert.equal(written.guidance, "Two sentences.");
});

test("a levelled group answers its own variant and everyone else answers the default", () => {
  const groupA = "507f1f77bcf86cd7994390a1";
  const slide = {
    question: mcq,
    variants: [{ groupId: groupA, question: { ...numeric, prompt: "How many mm is 1 m?" } }],
  };
  assert.equal(resolveLiveQuestionForStudent(slide, groupA).kind, "numeric");
  assert.equal(resolveLiveQuestionForStudent(slide, "507f1f77bcf86cd7994390a2").kind, "mcq");
  assert.equal(resolveLiveQuestionForStudent(slide, null).kind, "mcq");
  assert.equal(resolveLiveQuestionForStudent({ question: mcq }, groupA).kind, "mcq");
});
