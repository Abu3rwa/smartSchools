/**
 * Offline evaluation for the writing feedback prompt.
 *
 * One fixture is a draft, its assignment shape and a recorded model reply. The
 * evaluator builds the real prompt, runs the real normalisation over the reply,
 * and reports the numbers the gate checks: quote validity, readability,
 * repetition, prompt size and safety rejections. Score stability needs repeated
 * model calls, so it is measured by the live mode of `scripts/eval-writing.js`
 * and checked here when a committed report carries it.
 *
 * Nothing here talks to the provider or the database, which is what lets the
 * gate test run in CI.
 */
import {
  buildFeedbackPrompt,
  normalizeFeedback,
} from "./writingAssistantPrompts.js";
import {
  applyFocusBudget,
  budgetForTier,
  configSnapshotFor,
} from "./writingAssistantLogic.js";
import {
  readabilityVerdict,
  simplifyFeedbackFields,
} from "./writingFeedbackReadability.js";
import {
  computeDraftMetrics,
  readabilityOf,
  scrubCountClaimsDeep,
} from "./writingDraftMetrics.js";
import { packCoverage, promptFacts } from "./writingSourcePackService.js";
import { sanitizeGeneratedFields } from "./aiPromptSafety.js";

/** A prompt change that breaks any of these does not ship. */
export const EVAL_THRESHOLDS = {
  // Feedback a Grade 5 child cannot read is unusable, whatever the marks say.
  maxFeedbackGrade: 6.5,
  // Quotes are the proof behind a note; nearly all of them must be real.
  minQuoteValidity: 0.75,
  // A priority repeated in identical words across sections teaches nothing new.
  maxDuplicatedFeedbackItems: 1,
  // Live runs: a rubric criterion whose marks swing more than this is unstable.
  maxCriterionStdDev: 0.75,
  // Prompt size guard; tokens are ~4 characters each for English prose. A
  // revision prompt legitimately carries the earlier draft, so it sits higher.
  // Raised 3000 → 3500 for the always-on four-category language contract
  // (feedback-2026-11-17.1): the worst fixture measures 3361 estimated tokens
  // with the spelling guardrails kept verbatim; headroom is ~139.
  maxPromptTokensEstimate: 3500,
  // A fact id the server never offered is an invented citation; none may ship.
  maxFabricatedCitations: 0,
};

const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const normalisedText = (value) =>
  String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

const quoteStats = (parsed, draft) => {
  const haystack = normalisedText(
    (draft?.sections || []).map((row) => String(row?.text || "")).join(" \n "),
  );
  const quotes = [];
  for (const row of parsed?.sections || []) {
    if (normalisedText(row?.evidence)) quotes.push(row.evidence);
  }
  for (const row of parsed?.scores || []) {
    if (normalisedText(row?.evidence)) quotes.push(row.evidence);
  }
  const valid = quotes.filter((quote) =>
    haystack.includes(normalisedText(quote)),
  ).length;
  return {
    quotes: quotes.length,
    valid,
    validity: quotes.length ? round(valid / quotes.length) : 1,
  };
};

const feedbackLines = (normalized) => {
  const lines = [];
  for (const section of normalized.sections || []) {
    lines.push(
      ...(section.strengths || []),
      ...(section.improvements || []),
      section.why,
      section.nextStep,
    );
  }
  lines.push(normalized.overall.summary, ...(normalized.overall.nextPriorities || []));
  return lines.filter((line) => normalisedText(line).length > 0);
};

const duplicatedItems = (lines) => {
  const counts = new Map();
  for (const line of lines) {
    const key = normalisedText(line);
    if (key.length < 12) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
};

/** The pack a fixture is judged against, with what its draft already uses. */
const packContextFor = (fixture, draft) => {
  const facts = Array.isArray(fixture.pack?.facts) ? fixture.pack.facts : [];
  if (!facts.length) return null;
  return {
    title: fixture.pack.title || "Lesson facts",
    version: Number(fixture.pack.version) || 1,
    coverage: packCoverage({ facts, draft }),
  };
};

const fixturePrompt = (fixture, metrics, pack = null) =>
  buildFeedbackPrompt({
    snapshot: configSnapshotFor(fixture.assignment || {}),
    draft: fixture.draft,
    studentName: fixture.studentName || "Jordan",
    roster: [],
    goal: fixture.goal || "",
    aiConstraints: fixture.aiConstraints || "",
    stalledTasks: fixture.stalledTasks || [],
    profile: fixture.profile || null,
    spellingCandidates: fixture.spellingCandidates || [],
    language: fixture.language || "en",
    previousDraft: fixture.previousDraft || null,
    previousAssessment: fixture.previousAssessment || null,
    metrics,
    pack,
    feedbackV2: fixture.feedbackV2 === true,
    repeatGuard: fixture.feedbackV2 === true && fixture.repeatGuard === true,
    previousNextSteps: fixture.previousNextSteps || [],
    taughtFocus: fixture.taughtFocus || [],
  });

/** The prompt a live run sends for this fixture. Offline it is measured only. */
export const buildFixturePrompt = (fixture) => {
  const draft = fixture.draft || { number: 1, sections: [] };
  return fixturePrompt(
    fixture,
    computeDraftMetrics({
      draft,
      spellingCandidates: fixture.spellingCandidates || [],
    }),
    packContextFor(fixture, draft),
  );
};

/**
 * The reply's fact ids against the ids the server offered. An id the prompt
 * never carried is an invented citation (B3), counted rather than trusted.
 */
const citationStats = (parsed, pack) => {
  const ids = (parsed?.sections || [])
    .map((row) => String(row?.factId || "").trim())
    .filter(Boolean);
  const offered = new Set(
    (pack?.coverage?.facts || [])
      .filter((fact) => !fact.used)
      .map((fact) => String(fact.id).toLowerCase()),
  );
  const valid = ids.filter((id) => offered.has(id.toLowerCase())).length;
  return { requested: ids.length, valid, fabricated: ids.length - valid };
};

/**
 * One fixture in, one result out. `reply` overrides the recorded reply, which
 * is how a live run feeds the model's answer back through the same checks.
 */
export const evaluateWritingFixture = (fixture, { reply = null } = {}) => {
  const draft = fixture.draft || { number: 1, sections: [] };
  const metrics = computeDraftMetrics({
    draft,
    spellingCandidates: fixture.spellingCandidates || [],
  });
  const pack = packContextFor(fixture, draft);
  const prompt = fixturePrompt(fixture, metrics, pack);
  const parsed = scrubCountClaimsDeep(reply || fixture.sampleReply, metrics);
  const feedbackV2 = fixture.feedbackV2 === true;
  const normalized = normalizeFeedback({
    parsed,
    draft,
    snapshot: configSnapshotFor(fixture.assignment || {}),
    assignment: fixture.assignment || {},
    spellingCandidates: fixture.spellingCandidates || [],
    studentName: fixture.studentName || "Jordan",
    roster: [],
    packFacts: pack?.coverage.facts || [],
    feedbackV2,
    repeatGuard: feedbackV2 && fixture.repeatGuard === true,
    previousNextSteps: fixture.previousNextSteps || [],
    taughtFocus: fixture.taughtFocus || [],
  });
  if (!normalized.ok) {
    return { id: fixture.id, ok: false, error: normalized.error };
  }

  const inspected = sanitizeGeneratedFields(
    {
      sections: normalized.sections,
      overall: normalized.overall,
      scores: normalized.scores,
      tasks: normalized.tasks,
      spellingTargets: normalized.spellingTargets,
    },
    { skipKeys: ["evidence", "evidenceFact", "wordUseEvidence", "spellingWins", "original"] },
  );
  // Phase 3: the child-facing view is the budgeted, simplified one, so the gate
  // measures what a Grade 5 reader actually gets, not the full analysis.
  const tier = fixture.profile?.tier || "developing";
  let child = null;
  if (feedbackV2) {
    const budgeted = applyFocusBudget({
      sections: normalized.sections,
      priorities: normalized.overall.nextPriorities,
      tier,
    });
    const simplified = simplifyFeedbackFields(
      {
        sections: budgeted.sections,
        overall: { ...normalized.overall, nextPriorities: budgeted.priorities },
      },
      tier,
    );
    const budget = budgetForTier(tier);
    const counts = simplified.sections.map((row) => (row.improvements || []).length);
    const totalImprovements = counts.reduce((sum, count) => sum + count, 0);
    const sectionsWithImprovements = counts.filter((count) => count > 0).length;
    const priorities = (simplified.overall.nextPriorities || []).length;
    child = {
      sections: simplified.sections,
      overall: simplified.overall,
      focus: {
        tier,
        budget,
        totalImprovements,
        sectionsWithImprovements,
        maxImprovementsInOneSection: counts.length ? Math.max(...counts) : 0,
        priorities,
        dropped: {
          strengths: budgeted.dropped.strengths.length,
          improvements: budgeted.dropped.improvements.length,
          priorities: budgeted.dropped.priorities.length,
        },
        compliant:
          totalImprovements <= budget.totalImprovements &&
          sectionsWithImprovements <= budget.sectionsWithImprovements &&
          counts.every((count) => count <= budget.improvementsPerSection) &&
          priorities <= budget.priorities,
      },
      readability: readabilityVerdict({ fields: simplified, tier }),
    };
  }

  const lines = feedbackLines(child || normalized);
  const readability = readabilityOf(lines.join(" "));
  const promptTokensEstimate = Math.ceil(prompt.length / 4);
  const listed = pack ? promptFacts({ coverage: pack.coverage }) : null;
  const proposedMechanics = (parsed?.sections || []).reduce(
    (sum, row) => sum + (Array.isArray(row?.mechanics) ? row.mechanics.length : 0),
    0,
  );
  const keptMechanics = normalized.sections.reduce(
    (sum, row) => sum + (row.mechanics || []).length,
    0,
  );
  // Category spread, anchor coverage and honest check status, so a prompt
  // change that silently stops checking a category or a paragraph is visible.
  const keptRows = normalized.sections.flatMap((row) => row.mechanics || []);
  const byCategory = {};
  for (const row of keptRows) {
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
  }
  const reviews = { checked: 0, partial: 0, unavailable: 0 };
  for (const row of normalized.sections) {
    const status = row.mechanicsReview?.status;
    if (status in reviews) reviews[status] += 1;
  }
  const coachingLeaks = feedbackLines(child || normalized).filter((line) =>
    /→|->/.test(String(line || "")),
  ).length;

  return {
    id: fixture.id,
    ok: true,
    source: fixture.source || "synthetic",
    prompt: {
      chars: prompt.length,
      tokensEstimate: promptTokensEstimate,
      hasFactsBlock: prompt.includes("Draft facts (computed by the server"),
      hasGuardrails: prompt.includes("never rewrite"),
      leaksName: fixture.studentName ? prompt.includes(fixture.studentName) : false,
    },
    // What the pack cost the prompt and what the reply did with it (B2/B3/H12).
    pack: pack
      ? {
          facts: pack.coverage.facts.length,
          usedInDraft: pack.coverage.usedIds.length,
          listedInPrompt: listed.facts.length,
          omittedFromPrompt: listed.omitted,
        }
      : null,
    citations: citationStats(parsed, pack),
    draft: {
      totalWords: metrics.totalWords,
      sentenceCount: metrics.sentenceCount,
      repeatedPhrases: metrics.repeatedPhrases.map((row) => row.phrase),
    },
    quotes: quoteStats(parsed, draft),
    readability,
    readabilityChild: child?.readability || null,
    focus: child?.focus || null,
    mechanics: {
      proposed: proposedMechanics,
      kept: keptMechanics,
      dropped: proposedMechanics - keptMechanics,
      coachingLeaks,
      byCategory,
      anchored: keptRows.filter((row) => Number.isInteger(row.anchor?.start)).length,
      reviews,
    },
    interventions: normalized.sections
      .filter((row) => row.intervention?.repeat)
      .map((row) => ({
        key: row.key,
        index: row.index,
        repeat: row.intervention.repeat === true,
        needsRewrite: row.intervention.needsRewrite === true,
      })),
    repetition: {
      draftRepeatedPhrases: metrics.repeatedPhrases.length,
      duplicatedFeedbackItems: duplicatedItems(lines),
    },
    safety: { problems: inspected.problems.length },
    scores: normalized.scores.map((row) => ({
      key: row.key,
      score: row.score,
      focusExcluded: row.focusExcluded === true,
    })),
    tasks: normalized.tasks.map((task) => task.text),
  };
};

/** The worst number across fixtures, plus the fixture that produced it. */
export const summarizeEval = (results) => {
  const usable = results.filter((row) => row.ok);
  const worst = (pick, compare) =>
    usable.reduce(
      (worstRow, row) => {
        const value = pick(row);
        return worstRow.value === null || compare(value, worstRow.value)
          ? { id: row.id, value }
          : worstRow;
      },
      { id: "", value: null },
    );

  const failure = (row) => !row.ok;
  return {
    fixtures: results.length,
    usable: usable.length,
    failed: results.filter(failure).map((row) => ({
      id: row.id,
      error: row.error,
    })),
    maxFeedbackGrade: worst((row) => row.readability.fleschGrade, (a, b) => a > b),
    minQuoteValidity: worst((row) => row.quotes.validity, (a, b) => a < b),
    maxDuplicatedFeedbackItems: worst(
      (row) => row.repetition.duplicatedFeedbackItems,
      (a, b) => a > b,
    ),
    maxPromptTokensEstimate: worst(
      (row) => row.prompt.tokensEstimate,
      (a, b) => a > b,
    ),
    // Phase 3: a weak writer's reply must arrive inside the focus budget, and
    // no coaching line may carry a word-fix arrow.
    focusViolations: usable
      .filter((row) => row.focus && !row.focus.compliant)
      .map((row) => row.id),
    readabilityViolations: usable
      .filter((row) => row.readabilityChild && !row.readabilityChild.ok)
      .map((row) => row.id),
    totalCoachingMechanicsLeaks: usable.reduce(
      (sum, row) => sum + (row.mechanics?.coachingLeaks || 0),
      0,
    ),
    totalMechanicsKept: usable.reduce(
      (sum, row) => sum + (row.mechanics?.kept || 0),
      0,
    ),
    totalSafetyProblems: usable.reduce(
      (sum, row) => sum + row.safety.problems,
      0,
    ),
    totalQuotes: usable.reduce((sum, row) => sum + row.quotes.quotes, 0),
    validQuotes: usable.reduce((sum, row) => sum + row.quotes.valid, 0),
    citationsRequested: usable.reduce(
      (sum, row) => sum + (row.citations?.requested || 0),
      0,
    ),
    citationsValid: usable.reduce(
      (sum, row) => sum + (row.citations?.valid || 0),
      0,
    ),
    fabricatedCitations: usable.reduce(
      (sum, row) => sum + (row.citations?.fabricated || 0),
      0,
    ),
  };
};

/**
 * Spread of marks across repeated runs of the same fixture. Live-only input:
 * `runs` is one array of `{ key, score }` rows per model call.
 */
export const scoreStability = (runs = []) => {
  const byKey = new Map();
  const totals = [];
  for (const run of runs) {
    let total = 0;
    for (const row of run) {
      if (!byKey.has(row.key)) byKey.set(row.key, []);
      byKey.get(row.key).push(Number(row.score) || 0);
      total += Number(row.score) || 0;
    }
    totals.push(total);
  }
  const stdDev = (values) => {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
    return round(Math.sqrt(variance), 2);
  };
  const perCriterion = [...byKey.entries()].map(([key, values]) => ({
    key,
    runs: values.length,
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length, 2),
    stdDev: stdDev(values),
  }));
  return {
    measured: runs.length > 1,
    runs: runs.length,
    perCriterion,
    maxStdDev: perCriterion.reduce((max, row) => Math.max(max, row.stdDev), 0),
    totalScoreSpread: totals.length
      ? round(Math.max(...totals) - Math.min(...totals), 2)
      : 0,
  };
};

/** Throws with every broken threshold listed: one failing line is not enough. */
export const assertEvalThresholds = (summary, { stability = null } = {}) => {
  const problems = [];
  if (summary.usable !== summary.fixtures) {
    problems.push(
      `${summary.fixtures - summary.usable} fixture(s) produced no usable feedback`,
    );
  }
  if (summary.maxFeedbackGrade.value > EVAL_THRESHOLDS.maxFeedbackGrade) {
    problems.push(
      `feedback grade ${summary.maxFeedbackGrade.value} in ${summary.maxFeedbackGrade.id} exceeds ${EVAL_THRESHOLDS.maxFeedbackGrade}`,
    );
  }
  if (summary.minQuoteValidity.value < EVAL_THRESHOLDS.minQuoteValidity) {
    problems.push(
      `quote validity ${summary.minQuoteValidity.value} in ${summary.minQuoteValidity.id} is below ${EVAL_THRESHOLDS.minQuoteValidity}`,
    );
  }
  if (
    summary.maxDuplicatedFeedbackItems.value >
    EVAL_THRESHOLDS.maxDuplicatedFeedbackItems
  ) {
    problems.push(
      `${summary.maxDuplicatedFeedbackItems.value} duplicated feedback item(s) in ${summary.maxDuplicatedFeedbackItems.id} exceeds ${EVAL_THRESHOLDS.maxDuplicatedFeedbackItems}`,
    );
  }
  if (summary.maxPromptTokensEstimate.value > EVAL_THRESHOLDS.maxPromptTokensEstimate) {
    problems.push(
      `prompt of ${summary.maxPromptTokensEstimate.value} estimated tokens in ${summary.maxPromptTokensEstimate.id} exceeds ${EVAL_THRESHOLDS.maxPromptTokensEstimate}`,
    );
  }
  if (summary.totalSafetyProblems > 0) {
    problems.push(`${summary.totalSafetyProblems} safety rejection(s) in recorded replies`);
  }
  if ((summary.totalCoachingMechanicsLeaks || 0) > 0) {
    problems.push(
      `${summary.totalCoachingMechanicsLeaks} coaching line(s) carry a word-fix arrow; mechanics belong in their own list`,
    );
  }
  for (const id of summary.focusViolations || []) {
    problems.push(`fixture ${id} is outside its focus budget`);
  }
  for (const id of summary.readabilityViolations || []) {
    problems.push(`fixture ${id} child-facing feedback is above its reading ceiling`);
  }
  if (
    (summary.fabricatedCitations || 0) > EVAL_THRESHOLDS.maxFabricatedCitations
  ) {
    problems.push(
      `${summary.fabricatedCitations} invented fact id(s) in recorded replies`,
    );
  }
  if (stability?.measured && stability.maxStdDev > EVAL_THRESHOLDS.maxCriterionStdDev) {
    problems.push(
      `score std. dev. ${stability.maxStdDev} exceeds ${EVAL_THRESHOLDS.maxCriterionStdDev}`,
    );
  }
  return problems;
};

/** Every fixture row of a committed report must still pass the gate. */
export const assertReport = (report) => {
  const problems = [];
  if (!report || !Array.isArray(report.fixtures) || !report.fixtures.length) {
    return ["the committed eval report has no fixtures"];
  }
  if (!["offline", "live"].includes(report.mode)) {
    problems.push("the committed eval report does not record its mode");
  }
  for (const row of report.fixtures) {
    if (!row.ok) {
      problems.push(`fixture ${row.id} is not usable: ${row.error}`);
      continue;
    }
    if (row.readability.fleschGrade > EVAL_THRESHOLDS.maxFeedbackGrade) {
      problems.push(`fixture ${row.id} feedback grade is too high`);
    }
    if (row.quotes.validity < EVAL_THRESHOLDS.minQuoteValidity) {
      problems.push(`fixture ${row.id} quote validity is too low`);
    }
    if (
      row.repetition.duplicatedFeedbackItems >
      EVAL_THRESHOLDS.maxDuplicatedFeedbackItems
    ) {
      problems.push(`fixture ${row.id} repeats a feedback item`);
    }
    if (row.prompt.tokensEstimate > EVAL_THRESHOLDS.maxPromptTokensEstimate) {
      problems.push(`fixture ${row.id} prompt is too long`);
    }
    if (row.safety.problems > 0) {
      problems.push(`fixture ${row.id} has a safety rejection`);
    }
    if ((row.citations?.fabricated || 0) > 0) {
      problems.push(`fixture ${row.id} cites a fact id that was never offered`);
    }
    if (row.focus && !row.focus.compliant) {
      problems.push(`fixture ${row.id} is outside its focus budget`);
    }
    if (row.readabilityChild && !row.readabilityChild.ok) {
      problems.push(`fixture ${row.id} child-facing feedback is above its reading ceiling`);
    }
    if ((row.mechanics?.coachingLeaks || 0) > 0) {
      problems.push(`fixture ${row.id} puts a word fix inside coaching`);
    }
  }
  if (
    report.stability?.measured &&
    report.stability.maxStdDev > EVAL_THRESHOLDS.maxCriterionStdDev
  ) {
    problems.push("committed live stability is above the allowed spread");
  }
  return problems;
};
