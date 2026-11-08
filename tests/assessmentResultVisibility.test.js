import test from "node:test";
import assert from "node:assert/strict";
import { isAssessmentResultVisible } from "../services/assessment/resultVisibility.js";

const NOW = new Date("2026-11-08T12:00:00.000Z");

test("immediate visibility always releases", () => {
  assert.equal(
    isAssessmentResultVisible({ resultsVisibility: "immediate" }, null, NOW),
    true,
  );
});

test("manual release stays hidden until the teacher releases", () => {
  assert.equal(
    isAssessmentResultVisible({ resultsVisibility: "manual_release" }, null, NOW),
    false,
  );
  assert.equal(
    isAssessmentResultVisible(
      { resultsVisibility: "manual_release" },
      { status: "submitted" },
      NOW,
    ),
    false,
  );
});

test("a released entry is visible even under manual release", () => {
  assert.equal(
    isAssessmentResultVisible(
      { resultsVisibility: "manual_release" },
      { status: "released" },
      NOW,
    ),
    true,
  );
});

test("a reached release date opens the results", () => {
  assert.equal(
    isAssessmentResultVisible(
      {
        resultsVisibility: "manual_release",
        resultsReleaseAt: "2026-11-08T11:59:59.000Z",
      },
      { status: "submitted" },
      NOW,
    ),
    true,
  );
});

test("a future release date keeps the results hidden", () => {
  assert.equal(
    isAssessmentResultVisible(
      {
        resultsVisibility: "manual_release",
        resultsReleaseAt: "2026-11-09T00:00:00.000Z",
      },
      { status: "submitted" },
      NOW,
    ),
    false,
  );
});

test("an invalid release date never opens the results", () => {
  assert.equal(
    isAssessmentResultVisible(
      { resultsVisibility: "manual_release", resultsReleaseAt: "not-a-date" },
      null,
      NOW,
    ),
    false,
  );
});

test("missing config defaults to hidden, not released", () => {
  assert.equal(isAssessmentResultVisible({}, null, NOW), false);
  assert.equal(isAssessmentResultVisible(undefined, null, NOW), false);
});