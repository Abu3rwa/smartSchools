import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FLUENCY_SETTINGS,
  mergeFluencySettings,
  sanitizeFluencySettings
} from "../services/readingFluency/settings.js";
import { fluencyPartsForText } from "../services/readingFluency/parts.js";

const sectionedText = () => ({
  originalText: "first section body",
  originalComplexity: null,
  simplifiedVersions: [],
  sections: [
    { order: 1, title: "Money", text: "word ".repeat(260).trim() },
    { order: 2, title: "Protest", text: "A short section about the repeal." }
  ]
});

test("fluency settings default to off with no parts", () => {
  assert.deepEqual(sanitizeFluencySettings({}), {
    ...DEFAULT_FLUENCY_SETTINGS,
    parts: []
  });
  assert.equal(sanitizeFluencySettings({}).enabled, false);
});

test("turning reading aloud on requires at least one part", () => {
  assert.throws(
    () => sanitizeFluencySettings({ enabled: true, parts: [] }),
    (error) => error.code === "FLUENCY_SETTINGS_INVALID" && /at least one part/.test(error.message)
  );
});

test("numeric settings are clamped and the two reading limits cannot cross", () => {
  const settings = sanitizeFluencySettings({
    enabled: true,
    parts: [{ key: "s-1", level: null }],
    minReadings: 99,
    maxReadingsPerPart: 99,
    targetAccuracy: 250,
    targetWpm: 999
  });
  assert.equal(settings.minReadings, 10);
  assert.equal(settings.maxReadingsPerPart, 20);
  assert.equal(settings.targetAccuracy, 100);
  assert.equal(settings.targetWpm, 400);

  assert.throws(
    () => sanitizeFluencySettings({
      enabled: true,
      parts: [{ key: "s-1", level: null }],
      minReadings: 5,
      maxReadingsPerPart: 4
    }),
    /cannot be lower/
  );
});

test("part levels must be whole numbers between 1 and 20", () => {
  assert.throws(
    () => sanitizeFluencySettings({ parts: [{ key: "s-1", level: 0 }] }),
    /whole number between 1 and 20/
  );
  assert.throws(
    () => sanitizeFluencySettings({ parts: [{ key: "s-1", level: 2.5 }] }),
    /whole number between 1 and 20/
  );
  assert.deepEqual(
    sanitizeFluencySettings({ parts: [{ key: "s-1", level: null }] }).parts,
    [{ key: "s-1", level: null }]
  );
});

test("old assignments without the block read as off instead of throwing", () => {
  assert.deepEqual(mergeFluencySettings(undefined), {
    ...DEFAULT_FLUENCY_SETTINGS,
    parts: []
  });
  assert.equal(mergeFluencySettings({ enabled: true, parts: [] }).enabled, false);
});

test("parts are checked against the real blocks of the text", () => {
  const { warnings } = fluencyPartsForText(sectionedText(), [
    { key: "s-1", level: null },
    { key: "s-2", level: null }
  ]);
  assert.deepEqual(warnings.map((warning) => warning.key), ["s-1"]);
  assert.equal(warnings[0].wordCount, 260);

  assert.throws(
    () => fluencyPartsForText(sectionedText(), [{ key: "s-9", level: null }]),
    (error) => error.code === "FLUENCY_PART_UNKNOWN"
  );
});

test("a part pinned to a level must exist at that level", () => {
  assert.throws(
    () => fluencyPartsForText(sectionedText(), [{ key: "s-1", level: 5 }]),
    /not in level 5/
  );
});
