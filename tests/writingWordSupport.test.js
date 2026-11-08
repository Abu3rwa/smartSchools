import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeWordUse,
  applyWordUseDecisions,
  normalizeWordSupport,
} from "../services/writingWordSupportService.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.join(here, relative), "utf8");

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

test("word support keeps only real list ids and needs at least one to enable", () => {
  const config = normalizeWordSupport({
    vocabulary: {
      enabled: true,
      listIds: ["s1-l1", "S1-L1", "S2-L12", "not-a-list", "", null],
    },
    spelling: { enabled: true, maxWords: 99 },
  });
  assert.deepEqual(config.vocabulary.listIds, ["S1-L1", "S2-L12"]);
  assert.equal(config.vocabulary.enabled, true);
  assert.equal(config.spelling.enabled, true);
  assert.equal(config.spelling.maxWords, 10);

  const empty = normalizeWordSupport({
    vocabulary: { enabled: true, listIds: [] },
    spelling: { enabled: false, maxWords: 0 },
  });
  assert.equal(empty.vocabulary.enabled, false, "enabled without lists is off");
  assert.equal(empty.spelling.maxWords, 5);
  assert.equal(empty.spelling.enabled, false);
});

test("word support is off unless a source is explicitly enabled", () => {
  const config = normalizeWordSupport({
    vocabulary: { listIds: ["S1-L1"] },
    spelling: {},
  });
  assert.equal(config.vocabulary.enabled, false);
  assert.equal(config.spelling.enabled, false);
});

/* ------------------------------------------------------------------ */
/* Deterministic analysis                                              */
/* ------------------------------------------------------------------ */

const support = {
  enabled: true,
  spelling: {
    enabled: true,
    maxWords: 3,
    status: "available",
    words: [
      { word: "beautiful", grade: "G4", week: 3, source: "spelling" },
      { word: "because", grade: "G4", week: 2, source: "spelling" },
    ],
  },
  vocabulary: {
    enabled: true,
    status: "available",
    lists: [],
    words: [
      {
        word: "photosynthesis",
        baseWord: "photosynthesis",
        listId: "S1-L1",
        meaning: "how plants make food",
      },
      {
        word: "runs",
        baseWord: "run",
        listId: "S1-L1",
        meaning: "moves quickly",
      },
    ],
  },
};

test("a spelling word counts only as the whole word, case-insensitively", () => {
  const result = analyzeWordUse({
    draftText: "It was BEAUTIFUL, and beautifully done.",
    wordSupport: support,
  });
  const beautiful = result.spelling.find((row) => row.word === "beautiful");
  assert.equal(beautiful.used, true);
  assert.equal(beautiful.count, 1);
  const because = result.spelling.find((row) => row.word === "because");
  assert.equal(because.used, false);
  assert.deepEqual(because.nearMisses, []);
});

test("vocabulary matches a base form and reports a conservative near miss", () => {
  const result = analyzeWordUse({
    draftText: "She runs daily. The photosyntesis diagram is clear.",
    wordSupport: support,
  });
  const run = result.vocabulary.find((row) => row.word === "runs");
  assert.equal(run.used, true);
  const plant = result.vocabulary.find(
    (row) => row.word === "photosynthesis",
  );
  assert.equal(plant.used, false);
  assert.deepEqual(plant.nearMisses, ["photosyntesis"]);
});

test("short words never produce a near miss", () => {
  const result = analyzeWordUse({
    draftText: "the cat sat",
    wordSupport: {
      enabled: true,
      spelling: {
        enabled: true,
        words: [{ word: "bat" }],
      },
      vocabulary: { enabled: false, words: [] },
    },
  });
  assert.deepEqual(result.spelling[0].nearMisses, []);
});

test("no enabled sources means no evidence at all", () => {
  assert.equal(
    analyzeWordUse({
      draftText: "anything",
      wordSupport: { enabled: false, spelling: { words: [] }, vocabulary: { words: [] } },
    }),
    null,
  );
  assert.equal(analyzeWordUse({ draftText: "anything", wordSupport: null }), null);
});

test("teacher decisions only touch the named row and stay reversible", () => {
  const evidence = analyzeWordUse({
    draftText: "It was beautiful.",
    wordSupport: support,
  });
  const changed = applyWordUseDecisions({
    evidence,
    decisions: [
      { source: "spelling", word: "beautiful", decision: "confirmed" },
      { source: "spelling", word: "because", decision: "rejected" },
      { source: "vocabulary", word: "missing-word", decision: "confirmed" },
    ],
  });
  assert.deepEqual(changed.sort(), ["spelling.beautiful", "spelling.because"]);
  assert.equal(
    evidence.spelling.find((row) => row.word === "beautiful").teacherDecision,
    "confirmed",
  );
  assert.equal(
    evidence.spelling.find((row) => row.word === "because").teacherDecision,
    "rejected",
  );

  applyWordUseDecisions({
    evidence,
    decisions: [{ source: "spelling", word: "beautiful", decision: "" }],
  });
  assert.equal(
    evidence.spelling.find((row) => row.word === "beautiful").teacherDecision,
    "",
  );
});

/* ------------------------------------------------------------------ */
/* Export boundary                                                     */
/* ------------------------------------------------------------------ */

test("the student export is student-only and the teacher export is staff-only", async () => {
  const routes = await read("../routes/writingRoutes.js");
  const student = routes.match(
    /router\.get\(\s*"\/projects\/:projectId\/export\.pdf",\s*authorize\("student"\),\s*exportProjectPdf,?\s*\)/,
  );
  assert.ok(student, "the student export must be authorize(student)");

  const teacher = routes.match(
    /router\.get\(\s*"\/projects\/:projectId\/export\/teacher\.pdf",\s*staff,\s*exportProjectPdfForTeacher,?\s*\)/,
  );
  assert.ok(teacher, "the teacher export must stay behind staff");
  assert.equal(
    /export\.pdf[^\n]*parent/.test(routes),
    false,
    "writing has no parent export",
  );
});

test("the PDF service never imports the AI", async () => {
  const source = await read("../services/writingDraftPdfService.js");
  for (const forbidden of ["connectAi", "aiService", "gemini", "openai"]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `writingDraftPdfService must not reference ${forbidden}`,
    );
  }
});

test("the student project resolves word support only for the signed-in student", async () => {
  const source = await read("../services/writingAssistantService.js");
  const start = source.indexOf("export const getStudentProject");
  const end = source.indexOf("export const getStudentFeed");
  const view = source.slice(start, end);
  assert.ok(view.includes("student: studentId"), "the project query stays scoped");
  assert.ok(
    view.includes("resolveWritingWordSupport"),
    "the rail gets per-student words on read",
  );
});
