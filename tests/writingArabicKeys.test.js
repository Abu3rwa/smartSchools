import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRubricRows,
  normalizeSectionRows,
} from "../services/writingAssistantService.js";

// Keys arrive from the builder already lowercase, so the server keeps every row
// instead of dropping the ones whose label has no Latin letters in it.

test("an Arabic section name keeps its letters as the key", () => {
  const rows = normalizeSectionRows([
    { key: "المقدمة", label: "المقدمة", required: true },
    { key: "الزي_المدرسي", label: "الزي المدرسي", required: true },
    { key: "الخاتمة", label: " الخاتمة ", required: true },
  ]);

  assert.deepEqual(
    rows.map((row) => row.key),
    ["المقدمة", "الزي_المدرسي", "الخاتمة"],
  );
  assert.deepEqual(
    rows.map((row) => row.label),
    ["المقدمة", "الزي المدرسي", "الخاتمة"],
  );
});

test("a row without a key is dropped, so the editor must derive one", () => {
  // The builder sends row.key || slugify(label); the server never guesses.
  assert.equal(normalizeSectionRows([{ label: "أسبابي" }]).length, 0);
  assert.equal(normalizeRubricRows([{ label: "الأفكار" }]).length, 0);
  const derived = normalizeSectionRows([{ key: "أسبابي", label: "أسبابي" }]);
  assert.equal(derived.length, 1);
  assert.equal(derived[0].label, "أسبابي");
});

test("a repeated Arabic key is skipped rather than saved twice", () => {
  const rows = normalizeSectionRows([
    { key: "المقدمة", label: "المقدمة" },
    { key: "المقدمة", label: "مقدمة ثانية" },
    { key: "الخاتمة", label: "الخاتمة" },
  ]);
  assert.deepEqual(
    rows.map((row) => row.label),
    ["المقدمة", "الخاتمة"],
  );
});

test("an Arabic rubric criterion keeps its label, score and sections", () => {
  const rows = normalizeRubricRows([
    {
      key: "الأفكار",
      label: "الأفكار",
      description: "فكرتان واضحتان",
      maxScore: 5,
      appliesToSections: ["المقدمة"],
    },
    { key: "الأسلوب", label: "الأسلوب", maxScore: 3 },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].key, "الأفكار");
  assert.equal(rows[0].label, "الأفكار");
  assert.equal(rows[0].description, "فكرتان واضحتان");
  assert.equal(rows[0].maxScore, 5);
  assert.deepEqual(rows[0].appliesToSections, ["المقدمة"]);
  assert.equal(rows[1].maxScore, 3);
});
