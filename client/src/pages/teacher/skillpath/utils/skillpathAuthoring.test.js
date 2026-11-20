import assert from "node:assert/strict";
import test from "node:test";
import {
  ITEM_TYPES,
  normalizeItemType,
  blankDraft,
  draftFromItem,
  itemPayloadFromDraft,
  validateDraft,
  nextOptionId,
  newSubmissionId,
  csvPreviewPayload,
  poolPreviewPayload,
  importCommitPayload
} from "./skillpathAuthoring.js";

const SKILL = "cccccccccccccccccccccccc";

const validDraft = (patch = {}) => ({ ...blankDraft(SKILL), prompt: "Pick the synonym of happy.", ...patch });

const codes = (errors) => errors.map((error) => error.code);

test("legacy type names normalize to the shared names", () => {
  assert.equal(normalizeItemType("mcq"), "multiple_choice");
  assert.equal(normalizeItemType("fill_blank"), "fill_in_blank");
  assert.equal(normalizeItemType("ordering"), "ordering");
  assert.equal(ITEM_TYPES.length, 7);
});

test("a blank multiple-choice draft validates and keeps its options", () => {
  const draft = validDraft({
    options: [{ id: "a", text: "glad" }, { id: "b", text: "sad" }],
    correctOptionId: "a"
  });
  const { payload, errors } = validateDraft(draft);
  assert.deepEqual(errors, []);
  assert.equal(payload.type, "multiple_choice");
  assert.equal(payload.correctOptionId, "a");
  assert.equal(payload.options.length, 2);
});

test("multiple choice needs two options and a correct one among them", () => {
  const one = validateDraft(validDraft({ options: [{ id: "a", text: "glad" }], correctOptionId: "a" }));
  assert.ok(codes(one.errors).includes("validOptions"));
  const wrongKey = validateDraft(validDraft({
    options: [{ id: "a", text: "glad" }, { id: "b", text: "sad" }],
    correctOptionId: "c"
  }));
  assert.ok(codes(wrongKey.errors).includes("validCorrect"));
  const duplicate = validateDraft(validDraft({
    options: [{ id: "a", text: "glad" }, { id: "b", text: "Glad " }],
    correctOptionId: "a"
  }));
  assert.ok(codes(duplicate.errors).includes("validOptionDuplicate"));
});

test("multiple select needs at least two correct keys among the options", () => {
  const draft = validDraft({
    type: "multiple_select",
    options: [{ id: "a", text: "glad" }, { id: "b", text: "joyful" }, { id: "c", text: "sad" }],
    correctKeys: ["a", "b"]
  });
  const { payload, errors } = validateDraft(draft);
  assert.deepEqual(errors, []);
  assert.equal(payload.correctAnswer, "a|b");
  const single = validateDraft({ ...draft, correctKeys: ["a"] });
  assert.ok(codes(single.errors).includes("validMultiCorrect"));
  const foreign = validateDraft({ ...draft, correctKeys: ["a", "z"] });
  assert.ok(codes(foreign.errors).includes("validMultiCorrect"));
});

test("true/false payloads carry true or false only", () => {
  const { payload, errors } = validateDraft(validDraft({ type: "true_false", trueFalse: "false", prompt: "The sky is green." }));
  assert.deepEqual(errors, []);
  assert.equal(payload.correctAnswer, "false");
});

test("matching needs complete pairs without separator characters", () => {
  const draft = validDraft({
    type: "matching",
    prompt: "Match each word to its meaning.",
    pairs: [{ left: "glad", right: "happy" }, { left: "weary", right: "tired" }]
  });
  const { payload, errors } = validateDraft(draft);
  assert.deepEqual(errors, []);
  assert.deepEqual(payload.matchingPairs, [{ left: "glad", right: "happy" }, { left: "weary", right: "tired" }]);
  const incomplete = validateDraft({ ...draft, pairs: [...draft.pairs, { left: "cold", right: "" }] });
  assert.ok(codes(incomplete.errors).includes("validPairComplete"));
  const separators = validateDraft({ ...draft, pairs: [{ left: "a|b", right: "x" }, { left: "c", right: "y" }] });
  assert.ok(codes(separators.errors).includes("validPairSeparators"));
});

test("ordering keeps row ids stable so the stored answer key stays valid", () => {
  const rows = [{ id: "o1", text: "First" }, { id: "o2", text: "Second" }, { id: "o3", text: "Third" }];
  const draft = validDraft({ type: "ordering", prompt: "Put the steps in order.", orderRows: rows });
  const { payload, errors } = validateDraft(draft);
  assert.deepEqual(errors, []);
  assert.deepEqual(payload.orderingItems, rows);
  const reordered = { ...draft, orderRows: [rows[2], rows[0], rows[1]] };
  assert.deepEqual(itemPayloadFromDraft(reordered).orderingItems.map((row) => row.id), ["o3", "o1", "o2"]);
  const tooFew = validateDraft({ ...draft, orderRows: rows.slice(0, 2) });
  assert.ok(codes(tooFew.errors).includes("validOrderCount"));
  const duplicated = validateDraft({ ...draft, orderRows: [rows[0], rows[1], { id: "o4", text: "first" }] });
  assert.ok(codes(duplicated.errors).includes("validOrderDuplicate"));
});

test("numeric rules validate per mode", () => {
  const exact = validateDraft(validDraft({
    type: "numeric_response", prompt: "What is 7 × 8?",
    numeric: { ...blankDraft().numeric, mode: "exact", value: "56" }
  }));
  assert.deepEqual(exact.errors, []);
  assert.equal(exact.payload.numericRule.value, "56");
  const tolerance = validateDraft(validDraft({
    type: "numeric_response", prompt: "Estimate the length.",
    numeric: { ...blankDraft().numeric, mode: "tolerance", value: "10", tolerance: "0.5", unit: "cm" }
  }));
  assert.deepEqual(tolerance.errors, []);
  assert.equal(tolerance.payload.numericRule.tolerance, "0.5");
  assert.equal(tolerance.payload.numericRule.unit, "cm");
  const missingTolerance = validateDraft(validDraft({
    type: "numeric_response", prompt: "Estimate.",
    numeric: { ...blankDraft().numeric, mode: "tolerance", value: "10", tolerance: "" }
  }));
  assert.ok(codes(missingTolerance.errors).includes("validTolerance"));
  const range = validateDraft(validDraft({
    type: "numeric_response", prompt: "Give a reasonable estimate.",
    numeric: { ...blankDraft().numeric, mode: "range", min: "10", max: "20" }
  }));
  assert.deepEqual(range.errors, []);
  const badNumber = validateDraft(validDraft({
    type: "numeric_response", prompt: "What is 7 × 8?",
    numeric: { ...blankDraft().numeric, mode: "exact", value: "fifty-six" }
  }));
  assert.ok(codes(badNumber.errors).includes("validNumber"));
});

test("fill-in-the-blank needs exactly one blank and accepted answers", () => {
  const draft = validDraft({ type: "fill_in_blank", prompt: "The opposite of hot is ___.", acceptedText: "cold\nchilly\n" });
  const { payload, errors } = validateDraft(draft);
  assert.deepEqual(errors, []);
  assert.deepEqual(payload.acceptedAnswers, ["cold", "chilly"]);
  const noBlank = validateDraft({ ...draft, prompt: "The opposite of hot." });
  assert.ok(codes(noBlank.errors).includes("validBlankCount"));
  const noAnswer = validateDraft({ ...draft, acceptedText: "  \n" });
  assert.ok(codes(noAnswer.errors).includes("validAnswer"));
});

test("every draft needs a prompt and a real skill id", () => {
  const { errors } = validateDraft(validDraft({ prompt: "  ", skillId: "" }));
  assert.ok(codes(errors).includes("validPrompt"));
  assert.ok(codes(errors).includes("validSkill"));
});

test("draftFromItem round-trips a stored item of each type", () => {
  const stored = {
    externalId: "item-x",
    type: "matching",
    prompt: "Match.",
    matchingPairs: [{ left: "glad", right: "happy" }, { left: "weary", right: "tired" }],
    correctAnswer: "glad::happy|weary::tired",
    skillId: SKILL,
    difficulty: 2,
    explanation: "Because."
  };
  const draft = draftFromItem(stored, 3);
  assert.equal(draft.index, 3);
  const { payload, errors } = validateDraft(draft);
  assert.deepEqual(errors, []);
  assert.deepEqual(payload.matchingPairs, stored.matchingPairs);

  const legacy = draftFromItem({ externalId: "old", type: "mcq", prompt: "Pick.", options: [{ id: "a", text: "x" }, { id: "b", text: "y" }], correctOptionId: "b", skillId: SKILL, difficulty: 1 }, 0);
  assert.equal(legacy.type, "multiple_choice");
  assert.equal(legacy.correctOptionId, "b");
});

test("option ids stay unique past z", () => {
  const options = "abcdefghijklmnopqrstuvwxyz".split("").map((id) => ({ id, text: id }));
  assert.equal(nextOptionId(options), "opt26");
});

test("submission ids satisfy the server receipt pattern", () => {
  assert.match(newSubmissionId(), /^[A-Za-z0-9_-]{8,100}$/);
});

test("csv preview payloads speak the server contract", () => {
  const single = csvPreviewPayload({ mode: "single", type: "multiple_choice", content: "csv", skillId: SKILL, operation: "create", newPackTitle: " New pack " });
  assert.equal(single.mode, "single");
  assert.equal(single.skillId, SKILL);
  assert.equal(single.operation, "create");
  assert.deepEqual(single.newPack, { title: "New pack" });
  const replace = csvPreviewPayload({ mode: "single", type: "ordering", content: "csv", skillId: SKILL, operation: "replace", packId: "p1" });
  assert.equal(replace.operation, "replace");
  assert.equal(replace.packId, "p1");
  const bulk = csvPreviewPayload({ mode: "bulk", type: "multiple_choice", content: "csv", operation: "create" });
  assert.equal(bulk.mode, "advanced");
  assert.equal(bulk.skillId, undefined);
});

test("pool preview payloads carry the selection and destination", () => {
  const payload = poolPreviewPayload({ poolId: "pool1", questionIds: ["q1", "q2"], skillId: SKILL, operation: "create", newPackTitle: "From pool" });
  assert.deepEqual(payload, {
    source: "pool",
    poolId: "pool1",
    questionIds: ["q1", "q2"],
    skillId: SKILL,
    operation: "create",
    newPack: { title: "From pool" }
  });
});

test("commit payloads add token, submission id, confirmations and row disposition", () => {
  const state = {
    source: "pool", poolId: "pool1", questionIds: [], skillId: SKILL,
    operation: "create", newPackTitle: "Pack", submissionId: "sp-abc12345",
    confirmations: ["replace", "validRows"], validOnly: true
  };
  const payload = importCommitPayload(state, { token: "tok" });
  assert.equal(payload.token, "tok");
  assert.equal(payload.submissionId, "sp-abc12345");
  assert.deepEqual(payload.confirmations, ["replace", "validRows"]);
  assert.equal(payload.rowDisposition, "valid_rows");
  assert.equal(importCommitPayload({ ...state, validOnly: false }, { token: "tok" }).rowDisposition, "all");
});