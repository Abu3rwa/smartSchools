import {
  DEFAULT_WORKFLOW,
  presetRubric,
  presetSections,
} from "../../../../constants/writingPresets.js";

/** Keys the server derives from a label; kept here so the editor shows what is stored. */
export const slugify = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, "_")
  .replace(/[^a-z0-9_]/g, "")
  .slice(0, 40);

export const emptySupports = () => ({
  wordBank: [],
  transitions: [],
  sentenceStarters: [],
  guidingQuestions: [],
  modelText: "",
  plannerPrompt: "",
});

export const emptyForm = () => ({
  title: "",
  instructions: "",
  writingType: "essay",
  topic: "",
  classId: "",
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
    supports: { ...emptySupports(), ...(assignment.supports || {}) },
    rubric: (assignment.rubric || presetRubric()).map((row) => ({
      key: row.key,
      label: row.label,
      description: row.description || "",
      maxScore: num(row.maxScore, 1) || 1,
      appliesToSections: row.appliesToSections || ["*"],
    })),
    workflow: { ...DEFAULT_WORKFLOW, ...(assignment.workflow || {}) },
    aiConstraints: assignment.aiConstraints || "",
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
    supports: Object.entries(form.supports || {})
      .filter(([key, value]) => !["modelText", "plannerPrompt"].includes(key) && Array.isArray(value) && value.length)
      .map(([key, value]) => ({ key, items: value.length })),
    drafts: num(form.workflow?.maxDrafts, 1) || 1,
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

  const sections = (form.sections || []).map((row) => ({
    ...normalizeSectionRow(row),
    key: String(row.key || "").trim() || slugify(row.label),
  }));
  if (!sections.length) errors.sections = "noSections";
  else if (sections.some((row) => !row.label?.trim() || !row.key)) errors.sections = "sectionIncomplete";
  else if (uniqueKeys(sections)) errors.sections = "duplicateSection";

  const rubric = form.rubric || [];
  if (!rubric.length) errors.rubric = "noRubric";
  else if (rubric.some((row) => !row.label?.trim() || num(row.maxScore) <= 0)) errors.rubric = "rubricIncomplete";

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
  dueDate: form.dueDate || undefined,
  minWords: num(form.minWords),
  maxWords: num(form.maxWords),
  expectedLevel: String(form.expectedLevel || "").trim(),
  goals: (form.goals || [])
    .map((row) => ({ student: row.student, text: String(row.text || "").trim() }))
    .filter((row) => row.student && row.text),
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
});
