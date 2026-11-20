import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVAL_THRESHOLDS,
  assertEvalThresholds,
  assertReport,
  evaluateWritingFixture,
  scoreStability,
  summarizeEval,
} from "../services/writingEvalService.js";
import { WRITING_PROMPT_VERSIONS } from "../services/writingPromptVersions.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "fixtures", "writing-eval");
const REPORT_PATH = join(
  HERE,
  "..",
  "..",
  "docs",
  "plans",
  "writing-assistant-improvements",
  "eval-baseline.json",
);

const fixtures = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8")));

const results = fixtures.map((fixture) => evaluateWritingFixture(fixture));
const summary = summarizeEval(results);

test("every fixture is a complete, uniquely named case", () => {
  assert.ok(fixtures.length >= 3);
  const ids = fixtures.map((fixture) => fixture.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const fixture of fixtures) {
    assert.ok(fixture.draft?.sections?.length, `${fixture.id} has no draft`);
    assert.ok(fixture.assignment?.rubric?.length, `${fixture.id} has no rubric`);
    assert.ok(
      fixture.sampleReply?.sections?.length,
      `${fixture.id} has no recorded reply`,
    );
  }
});

test("the offline eval passes every quality threshold", () => {
  const problems = assertEvalThresholds(summary);
  assert.deepEqual(problems, []);
  assert.equal(summary.usable, summary.fixtures);
});

test("each fixture's prompt carries the facts, the guardrails and no name", () => {
  for (const row of results) {
    assert.equal(row.ok, true, `${row.id}: ${row.error}`);
    assert.equal(row.prompt.hasFactsBlock, true, `${row.id} lost the facts block`);
    assert.equal(row.prompt.hasGuardrails, true, `${row.id} lost the guardrails`);
    assert.equal(row.prompt.leaksName, false, `${row.id} leaked the name`);
  }
});

test("the committed baseline matches these fixtures and still passes", () => {
  const report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
  assert.deepEqual(assertReport(report), []);
  assert.equal(
    report.promptVersions.feedback,
    WRITING_PROMPT_VERSIONS.feedback,
    "regenerate docs/plans/writing-assistant-improvements/eval-baseline.json after a prompt change",
  );
  const reported = new Set(report.fixtures.map((row) => row.id));
  for (const fixture of fixtures) {
    assert.ok(reported.has(fixture.id), `baseline is missing ${fixture.id}`);
  }
});

test("the V2 emerging fixture is trimmed to its budget and keeps mechanics apart", () => {
  const row = results.find((item) => item.id === "grade5-uniforms-v2-budget");
  assert.ok(row, "the Phase 3 contract fixture is missing");
  assert.equal(row.ok, true, row.error);
  assert.equal(row.focus.tier, "emerging");
  assert.equal(row.focus.compliant, true);
  assert.ok(row.focus.totalImprovements <= row.focus.budget.totalImprovements);
  assert.ok(
    row.focus.sectionsWithImprovements <= row.focus.budget.sectionsWithImprovements,
  );
  assert.ok(row.focus.priorities <= row.focus.budget.priorities);
  assert.ok(row.focus.dropped.improvements >= 1, "the budget must drop something");
  assert.equal(row.mechanics.coachingLeaks, 0);
  assert.equal(row.mechanics.proposed, 4);
  assert.equal(row.mechanics.kept, 2, "only word fixes present in the draft survive");
  assert.equal(row.mechanics.dropped, 2);
  assert.deepEqual(row.mechanics.byCategory, { spelling: 2 });
  assert.equal(row.mechanics.anchored, 2, "every kept correction carries a verified span");
  assert.deepEqual(
    row.mechanics.reviews,
    { checked: 0, partial: 2, unavailable: 1 },
    "invalid candidates downgrade the check to partial; a missing language response is unavailable",
  );
  assert.equal(row.readabilityChild.ok, true);
  assert.ok(
    row.interventions.some((item) => item.repeat && !item.needsRewrite),
    "a repeated step with a fresh scaffold clears the publish block",
  );
  assert.equal(
    row.scores.find((item) => item.key === "conventions").focusExcluded,
    true,
    "a criterion outside this week's taught focus is excluded",
  );
  assert.equal(
    row.scores.find((item) => item.key === "ideas").focusExcluded,
    false,
  );
});

test("an invented quote is measured as invalid", () => {
  const [fixture] = fixtures;
  const reply = JSON.parse(JSON.stringify(fixture.sampleReply));
  reply.sections[0].evidence = "words the child never wrote";
  const result = evaluateWritingFixture(fixture, { reply });
  assert.equal(result.ok, true);
  assert.ok(result.quotes.validity < 1);
});

test("a criterion that swings between runs fails the stability gate", () => {
  const stability = scoreStability([
    [{ key: "ideas", score: 1 }],
    [{ key: "ideas", score: 5 }],
    [{ key: "ideas", score: 2 }],
  ]);
  assert.equal(stability.measured, true);
  assert.ok(stability.maxStdDev > EVAL_THRESHOLDS.maxCriterionStdDev);
  const problems = assertEvalThresholds(summary, { stability });
  assert.ok(problems.some((problem) => problem.includes("score std. dev.")));
});
