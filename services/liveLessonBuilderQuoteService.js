import { getMarkupPercent } from "./aiCreditService.js";
import {
  LIVE_LESSON_BUILDER,
  liveLessonBuilderModel,
  liveLessonBuilderRates,
  quoteLessonBuild,
} from "../config/liveLessonBuilderConfig.js";
import { hashSeed } from "./liveLessonBuilderSanitizeService.js";

/**
 * The cost the teacher sees before a step. Pure apart from the markup, which is
 * cached for a minute because it changes only when an admin edits it.
 */

let markupCache = { value: null, at: 0 };

export const builderMarkupPercent = async () => {
  if (markupCache.value !== null && Date.now() - markupCache.at < 60000) return markupCache.value;
  const value = await getMarkupPercent();
  markupCache = { value, at: Date.now() };
  return value;
};

const assertQuoteInputs = (setup) => {
  const slides = Number(setup?.slideCount);
  const questions = Number(setup?.questionCount);
  if (!Number.isInteger(slides) || slides < LIVE_LESSON_BUILDER.minSlides || slides > LIVE_LESSON_BUILDER.maxSlides) {
    const error = new Error(`Choose ${LIVE_LESSON_BUILDER.minSlides}–${LIVE_LESSON_BUILDER.maxSlides} teaching slides.`);
    error.statusCode = 422;
    error.code = "VALIDATION";
    throw error;
  }
  if (!Number.isInteger(questions) || questions < 0 || questions > LIVE_LESSON_BUILDER.maxQuestions) {
    const error = new Error(`Choose 0–${LIVE_LESSON_BUILDER.maxQuestions} questions.`);
    error.statusCode = 422;
    error.code = "VALIDATION";
    throw error;
  }
  if (slides + questions > LIVE_LESSON_BUILDER.maxItems) {
    const error = new Error(`Keep the lesson to ${LIVE_LESSON_BUILDER.maxItems} items or fewer.`);
    error.statusCode = 422;
    error.code = "VALIDATION";
    throw error;
  }
};

const pricedQuote = async ({
  setup,
  slideCount,
  questionCount,
  sourceChars,
  sourceHash,
}) => {
  const rates = liveLessonBuilderRates();
  if (!rates) {
    const error = new Error("This AI model has no configured price, so the builder cannot show a cost.");
    error.statusCode = 422;
    error.code = "MODEL_UNPRICED";
    throw error;
  }
  const chars = Number.isFinite(Number(sourceChars))
    ? Number(sourceChars)
    : String(setup?.sourceText || "").length;
  const quote = quoteLessonBuild({
    slideCount,
    questionCount,
    sourceChars: chars,
    language: setup.language,
    rates,
    markupPercent: await builderMarkupPercent(),
    generationMode: setup.generationMode,
  });
  return {
    ...quote,
    model: liveLessonBuilderModel(),
    quoteKey: hashSeed(
      slideCount,
      questionCount,
      setup.language,
      setup.questionKinds?.join(","),
      sourceHash || chars,
      quote.generationMode,
      JSON.stringify(rates),
    ).slice(0, 24),
  };
};

/**
 * `sourceChars` and `sourceHash` come from the source store's metadata, so a
 * quote never needs the text itself and stays stable when only the text is
 * gone. A direct call without them falls back to `setup.sourceText`.
 */
export const quoteForSetup = async (setup, { sourceChars, sourceHash } = {}) => {
  assertQuoteInputs(setup);
  return pricedQuote({
    setup,
    slideCount: Number(setup.slideCount),
    questionCount: Number(setup.questionCount),
    sourceChars,
    sourceHash,
  });
};

/**
 * The same estimate for a step that builds only some items (one content batch):
 * the admission and the cap use the work that step can actually do.
 */
export const quoteForItems = async (
  setup,
  { slides = 0, questions = 0, sourceChars, sourceHash } = {},
) => {
  const slideCount = Math.max(0, Math.trunc(Number(slides) || 0));
  const questionCount = Math.max(0, Math.trunc(Number(questions) || 0));
  if (
    slideCount + questionCount < 1
    || slideCount > LIVE_LESSON_BUILDER.maxSlides
    || questionCount > LIVE_LESSON_BUILDER.maxQuestions
    || slideCount + questionCount > LIVE_LESSON_BUILDER.maxItems
  ) {
    const error = new Error(`Keep the step to ${LIVE_LESSON_BUILDER.maxItems} items or fewer.`);
    error.statusCode = 422;
    error.code = "VALIDATION";
    throw error;
  }
  return pricedQuote({ setup, slideCount, questionCount, sourceChars, sourceHash });
};

export default quoteForSetup;
