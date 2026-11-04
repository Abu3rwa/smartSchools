import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSelfCheckPatch,
  isGradeRowEdited,
  withRemovedTicks,
} from "./selfCheckMarks.js";
import { toggleSelectedRuleId } from "../../../../components/grades/selfCheckSelection.js";

const rows = [
  { studentId: "s1", marks: 4, remarks: "Completed classwork on time (+4)" },
  { studentId: "s2", marks: 2, remarks: "Active participation & focus (+2)" },
];

test("toggling a rule adds it once and removes it again", () => {
  const once = toggleSelectedRuleId([], "active-participation");
  assert.deepEqual(once, ["active-participation"]);
  assert.deepEqual(toggleSelectedRuleId(once, "active-participation"), []);
  assert.deepEqual(toggleSelectedRuleId(once, ""), once);
});

test("an untouched grid takes every submitted student", () => {
  const grades = {
    s1: { marks: "", remarks: "" },
    s2: { marks: "", remarks: "" },
  };
  const { patch, updated, skipped, conflicts } = buildSelfCheckPatch({
    rows,
    grades,
  });
  assert.deepEqual(patch, {
    s1: { marks: 4, remarks: "Completed classwork on time (+4)" },
    s2: { marks: 2, remarks: "Active participation & focus (+2)" },
  });
  assert.equal(updated, 2);
  assert.equal(skipped, 0);
  assert.equal(conflicts, 0);
});

test("a row the teacher already typed into is kept unless overwrite is asked for", () => {
  const grades = {
    s1: { marks: "7", remarks: "Nice work" },
    s2: { marks: "", remarks: "" },
  };
  const kept = buildSelfCheckPatch({ rows, grades });
  assert.deepEqual(Object.keys(kept.patch), ["s2"]);
  assert.equal(kept.conflicts, 1);
  assert.equal(kept.skipped, 1);

  const replaced = buildSelfCheckPatch({ rows, grades, overwrite: true });
  assert.deepEqual(replaced.patch.s1, {
    marks: 4,
    remarks: "Completed classwork on time (+4)",
  });
  assert.equal(replaced.updated, 2);
});

test("a remark alone counts as teacher work and rows without a student are ignored", () => {
  assert.equal(isGradeRowEdited({ marks: "", remarks: "Well done" }), true);
  assert.equal(isGradeRowEdited({ marks: 0, remarks: "" }), true);
  assert.equal(isGradeRowEdited(undefined), false);

  const { patch } = buildSelfCheckPatch({
    rows: [
      { studentId: "", marks: 1, remarks: "" },
      { studentId: "s3", marks: 0 },
    ],
    grades: {},
  });
  assert.deepEqual(patch, { s3: { marks: 0, remarks: "" } });
});
test("removing an unfair tick rebuilds the mark and remark, and nothing removed changes nothing", () => {
  const row = {
    submitted: true,
    score: 5,
    remark:
      "Completed classwork on time (+4); Playing on the Chromebook (-3); Exceptional effort (+1)",
    selectedRules: [
      { id: "on-time", label: "Completed classwork on time", value: 4 },
      { id: "chromebook", label: "Playing on the Chromebook", value: -3 },
      { id: "effort", label: "Exceptional effort", value: 1 },
    ],
  };
  assert.equal(withRemovedTicks(row, [], 10), row);

  const fixed = withRemovedTicks(row, ["chromebook"], 10);
  assert.equal(fixed.score, 5);
  assert.equal(fixed.originalScore, 5);
  assert.equal(
    fixed.remark,
    "Completed classwork on time (+4); Exceptional effort (+1)",
  );
  assert.deepEqual(
    fixed.selectedRules.map((rule) => rule.id),
    ["on-time", "effort"],
  );

  const negativeOut = withRemovedTicks({ ...row, score: 2 }, ["on-time"], 10);
  assert.equal(negativeOut.score, 0);
  assert.equal(
    negativeOut.remark,
    "Playing on the Chromebook (-3); Exceptional effort (+1)",
  );

  const all = withRemovedTicks(row, ["on-time", "chromebook", "effort"], 10);
  assert.equal(all.score, 0);
  assert.equal(all.remark, "");
});
