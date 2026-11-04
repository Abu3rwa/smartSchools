import {
  buildClassworkRemark,
  calculateClassworkScore,
} from "../../../../components/grades/classworkBehaviorUtils.js";

export const isGradeRowEdited = (row = {}) =>
  String(row?.marks ?? "").trim() !== "" ||
  String(row?.remarks ?? "").trim() !== "";

/**
 * A student's row after the teacher removed ticks that were not fair. The mark
 * and remark are rebuilt with the same rules the server used.
 */
export const withRemovedTicks = (row, removedIds = [], maxMarks) => {
  const removed = new Set(removedIds);
  const ticked = Array.isArray(row?.selectedRules) ? row.selectedRules : [];
  if (!row?.submitted || !ticked.some((rule) => removed.has(rule.id)))
    return row;

  const kept = ticked.filter((rule) => !removed.has(rule.id));
  const rules = kept.map((rule) => ({
    ...rule,
    direction: rule.value < 0 ? "negative" : "positive",
  }));
  const { score, selectedRules } = calculateClassworkScore({
    maxMarks,
    selectedRuleIds: rules.map((rule) => rule.id),
    rules,
    mode: "additive",
  });
  return {
    ...row,
    selectedRules: kept,
    score,
    remark: buildClassworkRemark(selectedRules),
    originalScore: row.score,
  };
};

/**
 * Builds the marks patch for "Use these marks". Rows the teacher already
 * touched are skipped unless overwrite is true, so typing always wins by default.
 */
export const buildSelfCheckPatch = ({
  rows = [],
  grades = {},
  overwrite = false,
}) => {
  const patch = {};
  let updated = 0;
  let skipped = 0;
  let conflicts = 0;

  rows.forEach((row) => {
    const studentId = row?.studentId;
    if (!studentId) return;
    const edited = isGradeRowEdited(grades[studentId]);
    if (edited) conflicts += 1;
    if (edited && !overwrite) {
      skipped += 1;
      return;
    }
    patch[studentId] = { marks: row.marks, remarks: row.remarks || "" };
    updated += 1;
  });

  return { patch, updated, skipped, conflicts };
};
