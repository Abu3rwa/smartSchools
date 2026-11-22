import { parseBooleanEnv } from "./booleanEnv.js";
import { ratesForModel } from "./aiPricing.js";

/**
 * One place for every limit, price assumption and flag the AI lesson builder
 * uses. The plan document owns the reasoning; this file owns the numbers.
 */

export const LIVE_LESSON_BUILDER_FEATURE = "live_lesson_builder";

export const isLiveLessonBuilderPlatformEnabled = (env = process.env) =>
  parseBooleanEnv(env.LIVE_LESSON_AI_BUILDER_ENABLED);

export const liveLessonBuilderModel = (env = process.env) =>
  String(env.LIVE_LESSON_BUILDER_MODEL || env.OPENAI_MODEL || "gpt-5.4-mini").trim();

export const liveLessonBuilderRates = (env = process.env) =>
  ratesForModel(liveLessonBuilderModel(env), env);

export const liveLessonBuilderLockMs = (env = process.env) =>
  (Number(env.OPENAI_TIMEOUT_MS) || 120000) + 30000;

export const LIVE_LESSON_BUILDER = Object.freeze({
  minSlides: 1,
  maxSlides: 50,
  maxQuestions: 50,
  maxItems: 100,
  chunkSize: 5,
  maxSourceChars: 30000,
  maxFiles: 8,
  maxFileBytes: 10 * 1024 * 1024,
  titleMax: 120,
  briefMax: 300,
  bodyMax: 900,
  bodyLinesMax: 8,
  examplesMax: 4,
  exampleChars: 200,
  notesMax: 600,
  promptMax: 300,
  optionChars: 120,
  explanationMax: 400,
  evidenceMax: 300,
  // Designed teaching slides: the model supplies text and a layout name only,
  // and the server owns the markup. These budgets keep one slide inside the CSV
  // html column and the AI safety-review batch.
  designMaxHtmlChars: 20000,
  designBlocksMax: 10,
  designCardsMax: 6,
  designPointsMax: 8,
  designStepsMax: 6,
  designTextChars: 480,
  designItemChars: 180,
  designTitleItemChars: 90,
  designCalloutChars: 260,
  // AI-authored HTML teaching slides: the model returns a fragment with empty
  // text slots and the server wraps it. These caps bound one reply and one
  // visible slide.
  aiSlideMaxChars: 24000,
  aiSlideMaxSlots: 24,
  aiSlideSlotChars: 280,
  aiSlideVisibleChars: 1600,
  aiSlideStaticChars: 40,
  aiSlideStaticTotalChars: 200,
  aiSlideMaxAnimationMs: 1200,
  regenInstructionMax: 500,
  maxRegensPerItem: 3,
  maxRegensPerDraft: 30,
  draftTtlMs: 14 * 24 * 60 * 60 * 1000,
  tombstoneTtlMs: 7 * 24 * 60 * 60 * 1000,
  operationTtlMs: 30 * 24 * 60 * 60 * 1000,
  rateWindowMs: 15 * 60 * 1000,
  rateMax: 120,
});

export const LIVE_LESSON_SLIDE_TYPES = Object.freeze([
  "opening",
  "goals",
  "content",
  "examples",
  "activity",
  "exit-ticket",
]);

export const LIVE_LESSON_BUILDER_LEVELS = Object.freeze(["support", "core", "stretch"]);

// Teacher-facing generation mode: High writes one teaching slide per call, Low
// writes the whole batch in one call when the output cap allows it. This is a
// call-layout choice only; reasoning effort stays fixed at medium.
export const LIVE_LESSON_GENERATION_MODES = Object.freeze(["high", "low"]);
export const DEFAULT_GENERATION_MODE = "high";

export const normalizeGenerationMode = (value) => {
  const mode = String(value || "").trim().toLowerCase();
  return LIVE_LESSON_GENERATION_MODES.includes(mode) ? mode : DEFAULT_GENERATION_MODE;
};

export const LIVE_LESSON_HTML = Object.freeze({
  // One teaching slide: the fragment, its text map, notes and the reasoning
  // budget are all billed as output tokens.
  slideOutputTokens: 2400,
  slideMaxOutputTokens: 9000,
  callMaxOutputTokens: 16000,
  repairInputTokens: 1200,
  maxLowBatch: 6,
});

export const builderSlideBatchMax = (mode) => (
  normalizeGenerationMode(mode) === "low" ? LIVE_LESSON_HTML.maxLowBatch : 1
);

// Quote assumptions, deliberately rounded up. Gate G3 replaces them with
// measured numbers; until then the quote must never promise a cheaper lesson
// than the one the model call can produce.
export const LIVE_LESSON_QUOTE = Object.freeze({
  planSystemTokens: 1200,
  genSystemTokens: 1500,
  planTokensPerItem: 60,
  slideOutputTokens: 450,
  questionOutputTokens: 300,
  jsonOverhead: 1.2,
  setupTokens: 300,
  chunkInstructionTokens: 60,
  regenInputTokens: 300,
});

const roundCents = (value) => Math.round(Number(value) * 1000) / 1000;

export const estimateTokens = (chars, language) => {
  const text = String(chars || "").length;
  return Math.ceil(text / (String(language || "en").toLowerCase() === "ar" ? 2 : 3));
};

const costFor = (rates, inputTokens, outputTokens) =>
  ((inputTokens * rates.inputPerMillionCents) + (outputTokens * rates.outputPerMillionCents)) / 1e6;

/**
 * The same quote the client shows before a step and the server enforces before
 * a call. Pure: no AI, no database, markup passed in by the caller.
 */
export const quoteLessonBuild = ({
  slideCount,
  questionCount,
  sourceChars,
  language,
  rates,
  markupPercent,
  generationMode,
}) => {
  const slides = Math.max(0, Number(slideCount) || 0);
  const questions = Math.max(0, Number(questionCount) || 0);
  const items = slides + questions;
  const mode = normalizeGenerationMode(generationMode);
  const sourceTokens = estimateTokens(sourceChars, language);
  const planInput = LIVE_LESSON_QUOTE.planSystemTokens + sourceTokens + LIVE_LESSON_QUOTE.setupTokens;
  const planOutput = Math.ceil(items * LIVE_LESSON_QUOTE.planTokensPerItem * LIVE_LESSON_QUOTE.jsonOverhead);
  const perItemInput = 40;
  const slideFit = slides ? Math.min(builderSlideBatchMax(mode), slides) : 0;
  const slideCalls = slides ? Math.ceil(slides / builderSlideBatchMax(mode)) : 0;
  const questionFit = questions ? Math.min(LIVE_LESSON_BUILDER.chunkSize, questions) : 0;
  const questionCalls = questions ? Math.ceil(questions / LIVE_LESSON_BUILDER.chunkSize) : 0;
  const slideInput = slideCalls * (LIVE_LESSON_QUOTE.genSystemTokens + sourceTokens
    + perItemInput * slideFit + LIVE_LESSON_QUOTE.chunkInstructionTokens * slideFit);
  const questionInput = questionCalls * (LIVE_LESSON_QUOTE.genSystemTokens + sourceTokens
    + perItemInput * questionFit + LIVE_LESSON_QUOTE.chunkInstructionTokens * LIVE_LESSON_BUILDER.chunkSize);
  const slideOutput = slides * LIVE_LESSON_HTML.slideOutputTokens;
  const questionOutput = questions * LIVE_LESSON_QUOTE.questionOutputTokens;
  // One included repair per teaching slide; the teacher is never charged twice
  // for a model mistake.
  const repairCalls = slides;
  const repairInput = repairCalls * (LIVE_LESSON_QUOTE.genSystemTokens + sourceTokens
    + LIVE_LESSON_HTML.repairInputTokens);
  const repairOutput = repairCalls * LIVE_LESSON_HTML.slideOutputTokens;
  const repairProviderCostCents = roundCents(costFor(rates, repairInput, repairOutput));
  const regenerateInput = LIVE_LESSON_QUOTE.genSystemTokens + sourceTokens + LIVE_LESSON_QUOTE.regenInputTokens;
  const providerCostCents = roundCents(costFor(
    rates,
    planInput + slideInput + questionInput + repairInput,
    planOutput + slideOutput + questionOutput + repairOutput,
  ));
  const regenerateProviderCostCents = roundCents(costFor(rates, regenerateInput, LIVE_LESSON_HTML.slideOutputTokens));
  const markup = Number.isFinite(Number(markupPercent)) ? Number(markupPercent) : 0;
  const markedUp = (value) => roundCents(value * (1 + markup / 100));
  return {
    plan: {
      providerCostCents: roundCents(costFor(rates, planInput, planOutput)),
      chargedCents: markedUp(roundCents(costFor(rates, planInput, planOutput))),
      inputTokens: planInput,
      outputTokens: planOutput,
      maxOutputTokens: Math.ceil(planOutput * 1.5),
    },
    content: {
      providerCostCents: roundCents(costFor(rates, slideInput + questionInput, slideOutput + questionOutput)),
      chargedCents: markedUp(roundCents(costFor(rates, slideInput + questionInput, slideOutput + questionOutput))),
      calls: slideCalls + questionCalls,
      perChunk: {
        providerCostCents: roundCents(costFor(rates, slideInput / Math.max(1, slideCalls), slideOutput / Math.max(1, slides))),
      },
    },
    repair: {
      providerCostCents: repairProviderCostCents,
      chargedCents: markedUp(repairProviderCostCents),
      calls: repairCalls,
    },
    regenerate: {
      providerCostCents: regenerateProviderCostCents,
      chargedCents: markedUp(regenerateProviderCostCents),
    },
    total: {
      providerCostCents,
      chargedCents: markedUp(providerCostCents),
    },
    generationMode: mode,
    markupPercent: markup,
    calls: 1 + slideCalls + questionCalls + repairCalls,
  };
};
