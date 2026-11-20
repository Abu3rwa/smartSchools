#!/usr/bin/env node
/**
 * Writing feedback eval harness.
 *
 * Offline (default, and what CI runs): builds each fixture's real prompt, runs
 * the real normalisation over its recorded reply, and writes the report the
 * gate test checks. No provider call, no database.
 *
 * Live (`--live`): sends each fixture's prompt N times, so score stability and
 * real token counts are measured. Spend is capped by `--limit` (default 10
 * runs) and printed with a cost estimate; this mode needs OPENAI_API_KEY.
 *
 *   node scripts/eval-writing.js
 *   node scripts/eval-writing.js --live --runs=3 --limit=10
 *   node scripts/eval-writing.js --out=docs/plans/writing-assistant-improvements/eval-baseline.json
 *
 * Relative `--out` and `--fixtures` paths resolve against the repository root,
 * so the command works from any directory.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { connectAi } from "../utils/connectAi.js";
import { costCents, tokenCounts } from "../services/aiCreditService.js";
import { extractJsonObject } from "../services/writingAssistantPrompts.js";
import {
  EVAL_THRESHOLDS,
  assertEvalThresholds,
  buildFixturePrompt,
  evaluateWritingFixture,
  scoreStability,
  summarizeEval,
} from "../services/writingEvalService.js";
import {
  WRITING_PROMPT_VERSIONS,
  WRITING_SCHEMA_VERSION,
} from "../services/writingPromptVersions.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DEFAULT_FIXTURES = join(HERE, "..", "tests", "fixtures", "writing-eval");
const DEFAULT_OUT = join(
  ROOT,
  "docs",
  "plans",
  "writing-assistant-improvements",
  "eval-baseline.json",
);

const fromRoot = (value) => (isAbsolute(value) ? value : join(ROOT, value));

const parseArgs = (argv) => {
  const options = { live: false, runs: 3, limit: 10, out: DEFAULT_OUT, fixtures: DEFAULT_FIXTURES };
  for (const arg of argv) {
    if (arg === "--live") options.live = true;
    else if (arg.startsWith("--runs=")) options.runs = Number(arg.slice(7)) || 3;
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8)) || 10;
    else if (arg.startsWith("--out=")) options.out = fromRoot(arg.slice(6));
    else if (arg.startsWith("--fixtures=")) options.fixtures = fromRoot(arg.slice(11));
  }
  options.runs = Math.max(2, options.runs);
  return options;
};

export const loadFixtures = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));

const printSummary = (summary, stability) => {
  console.log(
    `fixtures ${summary.usable}/${summary.fixtures} usable; quote validity ${summary.minQuoteValidity.value ?? "n/a"} (min); ` +
      `feedback grade ${summary.maxFeedbackGrade.value ?? "n/a"} (max); duplicated items ${summary.maxDuplicatedFeedbackItems.value ?? "n/a"} (max); ` +
      `prompt ~${summary.maxPromptTokensEstimate.value ?? "n/a"} tokens (max); safety problems ${summary.totalSafetyProblems}; ` +
      `fact citations ${summary.citationsValid}/${summary.citationsRequested} real (${summary.fabricatedCitations} invented)`,
  );
  if (stability?.measured) {
    console.log(
      `stability: ${stability.runs} runs per fixture, max criterion std. dev. ${stability.maxStdDev}, total-score spread ${stability.totalScoreSpread}`,
    );
  }
};

/** Live runs for one fixture: N replies, their scores, and what they cost. */
const runLiveFixture = async (fixture, runs) => {
  const prompt = buildFixturePrompt(fixture);
  const replies = [];
  const scoreRuns = [];
  const spend = { runs: 0, totalTokens: 0, costCents: 0, failures: 0 };
  for (let index = 0; index < runs; index += 1) {
    const startedAt = Date.now();
    const reply = await connectAi(prompt, {
      provider: "openai",
      ...(process.env.WRITING_AI_MODEL
        ? { modelName: process.env.WRITING_AI_MODEL }
        : {}),
      usage: false,
    });
    const latencyMs = Date.now() - startedAt;
    const parsed = extractJsonObject(reply.text);
    const tokens = tokenCounts(reply);
    spend.runs += 1;
    spend.totalTokens += tokens.totalTokens;
    spend.costCents += costCents(tokens);
    if (!parsed) {
      spend.failures += 1;
      console.log(`  ${fixture.id} run ${index + 1}: unreadable reply (${latencyMs}ms)`);
      continue;
    }
    const result = evaluateWritingFixture(fixture, { reply: parsed });
    if (!result.ok) {
      spend.failures += 1;
      console.log(`  ${fixture.id} run ${index + 1}: unusable (${result.error})`);
      continue;
    }
    replies.push(result);
    scoreRuns.push(result.scores);
    console.log(
      `  ${fixture.id} run ${index + 1}: ${tokens.totalTokens} tokens, ${spend.costCents.toFixed(2)}¢ so far, ${latencyMs}ms`,
    );
  }
  return { replies, stability: scoreStability(scoreRuns), spend };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.live) {
    // Offline mode never needs the provider or a key; live mode reads the
    // server's own .env so the script runs the same model the service does.
    const { config } = await import("dotenv");
    config({ path: join(HERE, "..", ".env") });
  }
  const fixtures = loadFixtures(options.fixtures);
  if (!fixtures.length) {
    console.error(`No fixtures in ${options.fixtures}`);
    process.exitCode = 1;
    return;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.live ? "live" : "offline",
    promptVersions: WRITING_PROMPT_VERSIONS,
    schemaVersion: WRITING_SCHEMA_VERSION,
    thresholds: EVAL_THRESHOLDS,
    fixtures: [],
  };

  let stability = { measured: false, runs: 0, maxStdDev: 0, perFixture: [] };
  if (!options.live) {
    report.fixtures = fixtures.map((fixture) => evaluateWritingFixture(fixture));
  } else {
    if (!process.env.OPENAI_API_KEY) {
      console.error("Live mode needs OPENAI_API_KEY in the environment.");
      process.exitCode = 1;
      return;
    }
    const perFixtureRuns = Math.max(2, options.runs);
    const capped = fixtures.slice(
      0,
      Math.max(1, Math.floor(options.limit / perFixtureRuns)),
    );
    report.skipped = fixtures.slice(capped.length).map((fixture) => fixture.id);
    report.spend = { runs: 0, totalTokens: 0, costCents: 0, failures: 0 };
    const perFixture = [];
    for (const fixture of capped) {
      console.log(`${fixture.id} (${perFixtureRuns} live runs)`);
      const live = await runLiveFixture(fixture, perFixtureRuns);
      for (const key of ["runs", "totalTokens", "costCents", "failures"]) {
        report.spend[key] += live.spend[key];
      }
      const usable = live.replies.at(-1);
      report.fixtures.push(usable || { id: fixture.id, ok: false, error: "no usable live reply" });
      perFixture.push({ id: fixture.id, ...live.stability });
    }
    stability = {
      measured: perFixture.length > 0,
      runs: perFixtureRuns,
      maxStdDev: perFixture.reduce((max, row) => Math.max(max, row.maxStdDev), 0),
      totalScoreSpread: perFixture.reduce(
        (max, row) => Math.max(max, row.totalScoreSpread),
        0,
      ),
      perFixture,
    };
    console.log(
      `spend: ${report.spend.runs} runs, ${report.spend.totalTokens} tokens, ~${report.spend.costCents.toFixed(2)}¢ provider cost`,
    );
  }

  report.summary = summarizeEval(report.fixtures);
  report.stability = stability;
  const problems = assertEvalThresholds(report.summary, { stability });
  report.problems = problems;

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printSummary(report.summary, stability);
  console.log(`report: ${options.out}`);
  if (problems.length) {
    console.error("FAILED:");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  }
};

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main();
}
