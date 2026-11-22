// Pure authoring helpers shared by the pack editor and the import dialog.
// Rules mirror services/languageGameItems.js on the server; the server stays
// authoritative, these checks only save the teacher a round trip.

export const ITEM_TYPES = [
  "multiple_choice",
  "true_false",
  "multiple_select",
  "matching",
  "ordering",
  "fill_in_blank",
  "numeric_response"
];

const TYPE_ALIASES = { mcq: "multiple_choice", fill_blank: "fill_in_blank" };

export const normalizeItemType = (type) => TYPE_ALIASES[type] || type;

export const TYPE_LABEL_KEY = {
  multiple_choice: "typeMcq",
  true_false: "typeTrueFalse",
  multiple_select: "typeMultiSelect",
  matching: "typeMatching",
  ordering: "typeOrdering",
  fill_in_blank: "typeFillBlank",
  numeric_response: "typeNumeric"
};

export const LIMITS = {
  prompt: 1000,
  option: 500,
  minOptions: 2,
  maxOptions: 6,
  minPairs: 2,
  maxPairs: 6,
  term: 120,
  minOrder: 3,
  maxOrder: 8,
  orderingText: 200,
  acceptedAnswer: 300,
  maxAcceptedAnswers: 20,
  explanation: 1000,
  unit: 40,
  rewardNote: 300
};

const trim = (value) => String(value ?? "").trim();
const isObjectId = (value) => /^[0-9a-f]{24}$/i.test(trim(value));
const isNumeric = (value) => /^-?\d+(\.\d+)?$/.test(trim(value)) || /^-?\d+\s*\/\s*\d+$/.test(trim(value));

export const newExternalId = () => `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const newSubmissionId = () => `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const newOrderRowId = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const nextOptionId = (options) => {
  const used = new Set((options || []).map((option) => option.id));
  let index = 0;
  let id = String.fromCharCode(97 + index);
  while (used.has(id)) {
    index += 1;
    id = index < 26 ? String.fromCharCode(97 + index) : `opt${index}`;
  }
  return id;
};

const blankOptions = () => ["a", "b", "c", "d"].map((id) => ({ id, text: "" }));
const blankNumeric = () => ({
  mode: "exact", value: "", tolerance: "", min: "", max: "", unit: "",
  allowFractions: false, allowPercent: false
});

export const blankDraft = (skillId = "") => ({
  externalId: newExternalId(),
  index: -1,
  type: "multiple_choice",
  prompt: "",
  skillId,
  difficulty: 1,
  explanation: "",
  options: blankOptions(),
  correctOptionId: "a",
  correctKeys: [],
  trueFalse: "true",
  pairs: [{ left: "", right: "" }, { left: "", right: "" }],
  orderRows: [newOrderRowId(), newOrderRowId(), newOrderRowId()].map((id) => ({ id, text: "" })),
  numeric: blankNumeric(),
  acceptedText: ""
});

export const draftFromItem = (item, index) => {
  const type = normalizeItemType(item.type);
  return {
    ...blankDraft(item.skillId ? String(item.skillId) : ""),
    externalId: item.externalId,
    index,
    type,
    prompt: item.prompt || "",
    difficulty: Number(item.difficulty) || 1,
    explanation: item.explanation || "",
    options: (type === "multiple_choice" || type === "multiple_select") && item.options?.length
      ? item.options.map((option) => ({ ...option }))
      : blankOptions(),
    correctOptionId: item.correctOptionId || "a",
    correctKeys: String(item.correctAnswer || "").split("|").map((key) => key.trim()).filter(Boolean),
    trueFalse: item.correctAnswer === "false" ? "false" : "true",
    pairs: item.matchingPairs?.length
      ? item.matchingPairs.map((pair) => ({ left: pair.left || "", right: pair.right || "" }))
      : [{ left: "", right: "" }, { left: "", right: "" }],
    orderRows: item.orderingItems?.length
      ? item.orderingItems.map((entry) => ({ id: entry.id, text: entry.text || "" }))
      : blankDraft().orderRows,
    numeric: item.numericRule ? { ...blankNumeric(), ...item.numericRule } : blankNumeric(),
    acceptedText: (item.acceptedAnswers || []).join("\n")
  };
};

const cleanOptions = (draft) => (draft.options || [])
  .map((option) => ({ id: trim(option.id), text: trim(option.text) }))
  .filter((option) => option.id && option.text);

const cleanPairs = (draft) => (draft.pairs || [])
  .map((pair) => ({ left: trim(pair.left), right: trim(pair.right) }))
  .filter((pair) => pair.left || pair.right);

const cleanOrderRows = (draft) => (draft.orderRows || [])
  .map((row) => ({ id: trim(row.id), text: trim(row.text) }))
  .filter((row) => row.text);

const cleanAccepted = (draft) => {
  const seen = new Set();
  const answers = [];
  for (const line of String(draft.acceptedText || "").split("\n")) {
    const answer = trim(line);
    if (!answer) continue;
    const key = answer.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }
  return answers;
};

const cleanNumericRule = (draft) => {
  const numeric = draft.numeric || blankNumeric();
  const rule = { mode: numeric.mode || "exact" };
  if (rule.mode === "range") {
    rule.min = trim(numeric.min);
    rule.max = trim(numeric.max);
  } else {
    rule.value = trim(numeric.value);
    if ((rule.mode === "tolerance" || rule.mode === "relative") && trim(numeric.tolerance)) {
      rule.tolerance = trim(numeric.tolerance);
    }
  }
  if (trim(numeric.unit)) rule.unit = trim(numeric.unit);
  if (numeric.allowFractions) rule.allowFractions = true;
  if (numeric.allowPercent) rule.allowPercent = true;
  return rule;
};

export const itemPayloadFromDraft = (draft) => {
  const type = normalizeItemType(draft.type);
  const payload = {
    externalId: trim(draft.externalId),
    type,
    prompt: trim(draft.prompt),
    options: [],
    correctOptionId: "",
    correctAnswer: "",
    acceptedAnswers: [],
    matchingPairs: [],
    orderingItems: [],
    numericRule: null,
    explanation: trim(draft.explanation),
    skillId: trim(draft.skillId),
    difficulty: Number(draft.difficulty) || 1
  };
  if (type === "multiple_choice") {
    payload.options = cleanOptions(draft);
    payload.correctOptionId = trim(draft.correctOptionId);
  } else if (type === "multiple_select") {
    payload.options = cleanOptions(draft);
    payload.correctAnswer = (draft.correctKeys || []).map(trim).filter(Boolean).join("|");
  } else if (type === "true_false") {
    payload.correctAnswer = draft.trueFalse === "false" ? "false" : "true";
  } else if (type === "matching") {
    payload.matchingPairs = cleanPairs(draft).filter((pair) => pair.left && pair.right);
  } else if (type === "ordering") {
    payload.orderingItems = cleanOrderRows(draft);
  } else if (type === "numeric_response") {
    payload.numericRule = cleanNumericRule(draft);
  } else if (type === "fill_in_blank") {
    payload.acceptedAnswers = cleanAccepted(draft);
  }
  return payload;
};

// Returns { payload, errors }; errors carry i18n codes under editor.* so the
// same rules read correctly in English and Arabic.
export const validateDraft = (draft) => {
  const errors = [];
  const add = (field, code, params) => errors.push({ field, code, ...(params ? { params } : {}) });
  const payload = itemPayloadFromDraft(draft);
  const type = payload.type;

  if (!payload.prompt) add("prompt", "validPrompt");
  else if (payload.prompt.length > LIMITS.prompt) add("prompt", "validPromptLength", { max: LIMITS.prompt });
  if (!isObjectId(payload.skillId)) add("skillId", "validSkill");
  if (payload.explanation.length > LIMITS.explanation) add("explanation", "validExplanationLength", { max: LIMITS.explanation });
  if (![1, 2, 3].includes(payload.difficulty)) add("difficulty", "validDifficulty");

  if (type === "multiple_choice" || type === "multiple_select") {
    const options = payload.options;
    if (options.length < LIMITS.minOptions) add("options", "validOptions");
    if (options.length > LIMITS.maxOptions) add("options", "validOptionsMax", { max: LIMITS.maxOptions });
    const labels = new Set();
    for (const option of options) {
      if (option.text.length > LIMITS.option) add("options", "validOptionLength", { max: LIMITS.option });
      const key = option.text.toLowerCase();
      if (labels.has(key)) add("options", "validOptionDuplicate");
      labels.add(key);
    }
    if (type === "multiple_choice") {
      if (!options.some((option) => option.id === payload.correctOptionId)) add("correctOptionId", "validCorrect");
    } else {
      const ids = new Set(options.map((option) => option.id));
      const keys = (draft.correctKeys || []).filter((key) => ids.has(key));
      if (keys.length < 2) add("correctKeys", "validMultiCorrect");
    }
  } else if (type === "true_false") {
    if (!["true", "false"].includes(payload.correctAnswer)) add("correctAnswer", "validTrueFalse");
  } else if (type === "matching") {
    const pairs = cleanPairs(draft);
    if (pairs.some((pair) => !pair.left || !pair.right)) add("matchingPairs", "validPairComplete");
    const complete = pairs.filter((pair) => pair.left && pair.right);
    if (complete.length < LIMITS.minPairs) add("matchingPairs", "validPairs", { min: LIMITS.minPairs });
    if (complete.length > LIMITS.maxPairs) add("matchingPairs", "validPairsMax", { max: LIMITS.maxPairs });
    for (const pair of complete) {
      if (pair.left.length > LIMITS.term || pair.right.length > LIMITS.term) {
        add("matchingPairs", "validPairLength", { max: LIMITS.term });
      }
      if (/[|]/.test(pair.left + pair.right) || (pair.left + pair.right).includes("::")) {
        add("matchingPairs", "validPairSeparators");
      }
    }
  } else if (type === "ordering") {
    const rows = cleanOrderRows(draft);
    if ((draft.orderRows || []).some((row) => !trim(row.text))) add("orderingItems", "validOrderEmpty");
    if (rows.length < LIMITS.minOrder || rows.length > LIMITS.maxOrder) {
      add("orderingItems", "validOrderCount", { min: LIMITS.minOrder, max: LIMITS.maxOrder });
    }
    const texts = new Set();
    for (const row of rows) {
      if (row.text.length > LIMITS.orderingText) add("orderingItems", "validOrderLength", { max: LIMITS.orderingText });
      const key = row.text.toLowerCase();
      if (texts.has(key)) add("orderingItems", "validOrderDuplicate");
      texts.add(key);
    }
  } else if (type === "numeric_response") {
    const rule = payload.numericRule;
    if (rule.mode === "range") {
      if (!isNumeric(rule.min) || !isNumeric(rule.max)) add("numericRule", "validRange");
    } else {
      if (!isNumeric(rule.value)) add("numericRule", "validNumber");
      if ((rule.mode === "tolerance" || rule.mode === "relative") && !isNumeric(rule.tolerance)) {
        add("numericRule", "validTolerance");
      }
    }
    if (rule.unit && rule.unit.length > LIMITS.unit) add("numericRule", "validUnitLength", { max: LIMITS.unit });
  } else if (type === "fill_in_blank") {
    if ((payload.prompt.match(/___/g) || []).length !== 1) add("prompt", "validBlankCount");
    if (payload.acceptedAnswers.length === 0) add("acceptedAnswers", "validAnswer");
    if (payload.acceptedAnswers.length > LIMITS.maxAcceptedAnswers) {
      add("acceptedAnswers", "validAnswersMax", { max: LIMITS.maxAcceptedAnswers });
    }
    if (payload.acceptedAnswers.some((answer) => answer.length > LIMITS.acceptedAnswer)) {
      add("acceptedAnswers", "validAnswerLength", { max: LIMITS.acceptedAnswer });
    }
  }

  return { payload, errors };
};

/* ------------------------------------------------------------------ */
/* Import payloads                                                     */
/* ------------------------------------------------------------------ */

const destinationFields = (state) => {
  const fields = { skillId: state.skillId || "" };
  if (state.operation === "replace") {
    fields.operation = "replace";
    fields.packId = state.packId || "";
  } else {
    fields.operation = "create";
    fields.newPack = { title: trim(state.newPackTitle) };
  }
  return fields;
};

export const csvPreviewPayload = (state) => ({
  mode: state.mode === "bulk" ? "advanced" : "single",
  type: state.type,
  content: state.content,
  ...(state.mode === "bulk" ? { operation: state.operation === "replace" ? "replace" : "create" } : destinationFields(state))
});

export const poolPreviewPayload = (state) => ({
  source: "pool",
  poolId: state.poolId || "",
  questionIds: state.questionIds || [],
  ...destinationFields(state)
});

export const importPreviewPayload = (state) => (
  state.source === "pool" ? poolPreviewPayload(state) : csvPreviewPayload(state)
);

// The one-skill layout needs a skill and a destination; the many-packs layout
// names both in the file, so it must not demand a skill before previewing.
export const isBulkLayout = (state) =>
  state.source !== "pool" && state.mode === "bulk";

export const canPreviewImport = (state) => {
  const destinationReady = isBulkLayout(state)
    ? true
    : Boolean(state.skillId) && (state.operation !== "replace" || Boolean(state.packId));
  const sourceReady = state.source === "pool"
    ? Boolean(state.poolId)
    : Boolean(state.content.trim());
  return destinationReady && sourceReady;
};

export const importCommitPayload = (state, preview) => ({
  ...importPreviewPayload(state),
  token: preview?.token || "",
  submissionId: state.submissionId || "",
  confirmations: state.confirmations || [],
  rowDisposition: state.validOnly ? "valid_rows" : "all"
});