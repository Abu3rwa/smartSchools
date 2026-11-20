import {
  DEFAULT_WORKFLOW,
  presetRubric,
  presetSections,
} from "../../../../constants/writingPresets.js";

/**
 * Keys the server derives from a label; kept here so the editor shows what is
 * stored. This mirrors the server exactly (writingAssistantService
 * normalizeSectionRows): lowercase, whitespace becomes "_", every other
 * character survives — so an Arabic label keeps its letters instead of
 * collapsing to an empty or duplicate key.
 */
export const slugify = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, "_")
  .slice(0, 40);

export const emptySupports = () => ({
  wordBank: [],
  transitions: [],
  sentenceStarters: [],
  guidingQuestions: [],
  modelText: "",
  plannerPrompt: "",
  wordSupport: {
    vocabulary: { enabled: false, listIds: [] },
    spelling: { enabled: false, maxWords: 5 },
  },
});

const normalizeWordSupportForm = (input = {}) => ({
  vocabulary: {
    enabled: input?.vocabulary?.enabled === true,
    listIds: (Array.isArray(input?.vocabulary?.listIds)
      ? input.vocabulary.listIds
      : []
    ).map((id) => String(id || "").toUpperCase()),
  },
  spelling: {
    enabled: input?.spelling?.enabled === true,
    maxWords: Math.min(Math.max(Number(input?.spelling?.maxWords) || 5, 1), 10),
  },
});

export const emptyForm = () => ({
  title: "",
  instructions: "",
  writingType: "essay",
  topic: "",
  classId: "",
  audienceMode: "class",
  studentIds: [],
  dueDate: "",
  minWords: 0,
  maxWords: 0,
  expectedLevel: "",
  goals: [],
  sections: presetSections("essay"),
  supports: emptySupports(),
  rubric: presetRubric(),
  workflow: { ...DEFAULT_WORKFLOW },
  aiConstraints: "",
  // Raw textarea text; buildPayload turns it into the skill list the API takes.
  taughtFocus: "",
  sourcePackId: "",
  exemplarText: "",
});

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/** The server document is authoritative; anything missing falls back to the preset. */
export const formFromAssignment = (assignment) => {
  if (!assignment) return emptyForm();
  return {
    title: assignment.title || "",
    instructions: assignment.instructions || "",
    writingType: assignment.writingType || "essay",
    topic: assignment.topic || "",
    classId: assignment.class ? String(assignment.class) : "",
    audienceMode: assignment.audienceMode === "selected" ? "selected" : "class",
    studentIds: (assignment.students || []).map((row) => String(row?._id || row)),
    dueDate: assignment.dueDate ? new Date(assignment.dueDate).toISOString().slice(0, 10) : "",
    minWords: num(assignment.minWords),
    maxWords: num(assignment.maxWords),
    expectedLevel: assignment.expectedLevel || "",
    goals: (assignment.goals || []).map((row) => ({
      student: String(row.student?._id || row.student || ""),
      text: row.text || "",
    })),
    sections: (assignment.sections || presetSections(assignment.writingType)).map((row) => ({
      key: row.key,
      label: row.label,
      kind: row.kind || "body",
      instructions: row.instructions || "",
      required: row.required !== false,
      repeatable: row.repeatable === true,
      minCount: num(row.minCount, 1) || 1,
      maxCount: num(row.maxCount, 1) || 1,
      minWords: num(row.minWords),
      criteria: row.criteria || [],
    })),
    supports: {
      ...emptySupports(),
      ...(assignment.supports || {}),
      wordSupport: normalizeWordSupportForm(assignment.supports?.wordSupport),
    },
    rubric: (assignment.rubric || presetRubric()).map((row) => ({
      key: row.key,
      label: row.label,
      description: row.description || "",
      maxScore: num(row.maxScore, 1) || 1,
      appliesToSections: row.appliesToSections || ["*"],
    })),
    workflow: { ...DEFAULT_WORKFLOW, ...(assignment.workflow || {}) },
    aiConstraints: assignment.aiConstraints || "",
    taughtFocus: (assignment.taughtFocus || []).join("\n"),
    sourcePackId: String(assignment.sourcePack?._id || assignment.sourcePack || ""),
    exemplarText: assignment.exemplarText || "",
  };
};

/**
 * F8: a template fills the lesson — structure, supports, rubric, taught focus,
 * pack, guardrails — and leaves the audience, schedule and per-student goals to
 * the task being created.
 */
export const formFromTemplate = (form, template) => {
  const next = formFromAssignment(template);
  return {
    ...next,
    title: next.title.replace(/\s*\(template\)\s*$/i, "").trim() || form.title,
    classId: form.classId,
    audienceMode: form.audienceMode,
    studentIds: form.studentIds,
    dueDate: form.dueDate,
    goals: form.goals,
  };
};

export const applyPreset = (form, writingType) => ({
  ...form,
  writingType,
  sections: presetSections(writingType),
});

export const updateAt = (list, index, patch) => list.map((row, i) => (
  i === index ? { ...row, ...patch } : row
));

export const removeAt = (list, index) => list.filter((_, i) => i !== index);

export const moveRow = (list, index, direction) => {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const newSection = () => ({
  key: "",
  label: "",
  kind: "body",
  instructions: "",
  required: true,
  repeatable: false,
  minCount: 1,
  maxCount: 1,
  minWords: 0,
  criteria: [],
});

/** Repeatable rows need maxCount >= minCount, otherwise the server clamps and confuses the teacher. */
export const normalizeSectionRow = (row) => {
  const minCount = num(row.minCount, 1) || 1;
  const maxCount = num(row.maxCount, 1) || 1;
  if (!row.repeatable) return { ...row, minCount: 1, maxCount: 1 };
  return { ...row, minCount, maxCount: Math.max(maxCount, minCount) };
};

export const totalRubricPoints = (rubric = []) => rubric.reduce(
  (sum, row) => sum + (num(row.maxScore) || 0),
  0,
);

/** What the student will see, derived from the form so the review panel cannot drift. */
export const studentViewPreview = (form) => {
  const sections = (form.sections || []).map(normalizeSectionRow);
  const required = sections.filter((row) => row.required);
  const slots = required.reduce((sum, row) => sum + (row.repeatable ? num(row.minCount, 1) || 1 : 1), 0);
  return {
    title: form.title,
    topic: form.topic,
    instructions: form.instructions,
    sectionCount: sections.length,
    requiredCount: required.length,
    writingSlots: slots,
    minWords: num(form.minWords),
    maxWords: num(form.maxWords),
    totalPoints: totalRubricPoints(form.rubric),
    audienceMode: form.audienceMode === "selected" ? "selected" : "class",
    audienceCount: (form.studentIds || []).length,
    supports: Object.entries(form.supports || {})
      .filter(([key, value]) => !["modelText", "plannerPrompt"].includes(key) && Array.isArray(value) && value.length)
      .map(([key, value]) => ({ key, items: value.length })),
    publishesFeedback: form.workflow?.teacherPublishesFeedback !== false,
    notebookCheck: form.workflow?.requireNotebookCheck !== false,
  };
};

const uniqueKeys = (rows) => {
  const seen = new Set();
  return rows.some((row) => {
    const key = row.key;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
};

export const validateForm = (form) => {
  const errors = {};
  if (!String(form.title || "").trim()) errors.title = "title";
  if (!form.classId) errors.classId = "class";
  if (form.audienceMode === "selected" && !(form.studentIds || []).length) {
    errors.studentIds = "students";
  }

  const sections = (form.sections || []).map((row) => ({
    ...normalizeSectionRow(row),
    key: String(row.key || "").trim() || slugify(row.label),
  }));
  if (!sections.length) errors.sections = "noSections";
  else if (sections.some((row) => !row.label?.trim() || !row.key)) errors.sections = "sectionIncomplete";
  else if (uniqueKeys(sections)) errors.sections = "duplicateSection";

  // A rubric row whose key cannot be derived would be dropped by the server
  // without a word, so the teacher is stopped here instead.
  const rubric = (form.rubric || []).map((row) => ({
    ...row,
    key: String(row.key || "").trim() || slugify(row.label),
  }));
  if (!rubric.length) errors.rubric = "noRubric";
  else if (rubric.some((row) => !row.label?.trim() || !row.key || num(row.maxScore) <= 0)) errors.rubric = "rubricIncomplete";

  const min = num(form.minWords);
  const max = num(form.maxWords);
  if (max > 0 && min > max) errors.maxWords = "maxBelowMin";

  return { ok: Object.keys(errors).length === 0, errors };
};

/** Payload for POST/PATCH /writing/assignments. */
export const buildPayload = (form) => ({
  title: String(form.title || "").trim(),
  instructions: String(form.instructions || "").trim(),
  writingType: form.writingType,
  topic: String(form.topic || "").trim(),
  classId: form.classId || undefined,
  audienceMode: form.audienceMode === "selected" ? "selected" : "class",
  studentIds: form.audienceMode === "selected" ? (form.studentIds || []) : undefined,
  dueDate: form.dueDate || undefined,
  minWords: num(form.minWords),
  maxWords: num(form.maxWords),
  expectedLevel: String(form.expectedLevel || "").trim(),
  goals: (form.goals || [])
    .map((row) => ({ student: row.student, text: String(row.text || "").trim() }))
    .filter((row) => row.student && row.text)
    .filter((row) => form.audienceMode !== "selected" || (form.studentIds || []).includes(row.student)),
  sections: (form.sections || []).map((row) => {
    const normalized = normalizeSectionRow(row);
    return {
      ...normalized,
      key: String(normalized.key || "").trim() || slugify(normalized.label),
      label: String(normalized.label || "").trim() || slugify(normalized.key),
    };
  }),
  supports: {
    wordBank: form.supports?.wordBank || [],
    transitions: form.supports?.transitions || [],
    sentenceStarters: form.supports?.sentenceStarters || [],
    guidingQuestions: form.supports?.guidingQuestions || [],
    modelText: form.supports?.modelText || "",
    plannerPrompt: form.supports?.plannerPrompt || "",
    wordSupport: normalizeWordSupportForm(form.supports?.wordSupport),
  },
  rubric: (form.rubric || []).map((row) => ({
    key: String(row.key || "").trim() || slugify(row.label),
    label: String(row.label || "").trim(),
    description: row.description || "",
    maxScore: num(row.maxScore, 1) || 1,
    appliesToSections: row.appliesToSections?.length ? row.appliesToSections : ["*"],
  })),
  workflow: { ...DEFAULT_WORKFLOW, ...(form.workflow || {}) },
  aiConstraints: String(form.aiConstraints || "").trim() || undefined,
  taughtFocus: String(form.taughtFocus || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8),
  // Empty detaches the pack and clears the exemplar; both are explicit intents.
  sourcePackId: form.sourcePackId || "",
  exemplarText: String(form.exemplarText || "").trim(),
});
