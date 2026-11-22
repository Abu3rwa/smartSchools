import { LIVE_QUESTION_KINDS } from "../constants/liveLessonQuestionKinds.js";
import { normalizeLiveQuestion } from "./liveLessonQuestionService.js";
import { LIVE_LESSON_BUILDER } from "../config/liveLessonBuilderConfig.js";
import {
  bodyLines,
  cleanLine,
  cleanText,
  shuffleWithSeed,
} from "./liveLessonBuilderSanitizeService.js";
import { buildDesignedSlide } from "./liveLessonDesignedSlideService.js";

/**
 * Items are the only truth inside a draft. This pure function turns them into
 * the slide shape the rest of the live lesson app already renders and grades,
 * so approval and the wizard preview cannot disagree.
 */

const TEACHING_TYPES = new Set(["opening", "goals", "content", "examples", "activity", "exit-ticket"]);

const listText = (rows, maxLength) => (Array.isArray(rows) ? rows : [])
  .map((row) => cleanLine(row, maxLength))
  .filter(Boolean);

export const prepareQuestion = (question, { itemId, draftId, index }) => {
  if (!question || typeof question !== "object") return null;
  const kind = LIVE_QUESTION_KINDS.includes(String(question.kind || "")) ? String(question.kind) : "mcq";
  const options = (Array.isArray(question.options) ? question.options : [])
    .map((option) => ({
      id: cleanLine(option?.id, 20),
      text: cleanLine(option?.text, LIVE_LESSON_BUILDER.optionChars),
    }))
    .filter((option) => option.id && option.text)
    .slice(0, 6);
  // The answer key is stable; only the visible order changes, so a student who
  // answers C still named the same option id in the data.
  const ordered = kind === "tf" ? options : shuffleWithSeed(options, `${draftId}:${itemId}:options`);

  const normalized = normalizeLiveQuestion({
    kind,
    prompt: cleanLine(question.prompt, LIVE_LESSON_BUILDER.promptMax),
    options: ordered,
    correctOptionId: cleanLine(question.correctOptionId, 20),
    correctOptionIds: listText(question.correctOptionIds, 20),
    matchingPairs: (Array.isArray(question.matchingPairs) ? question.matchingPairs : []).map((pair) => ({
      left: cleanLine(pair?.left, 300),
      right: cleanLine(pair?.right, 300),
    })),
    orderingItems: (Array.isArray(question.orderingItems) ? question.orderingItems : []).map((item) => ({
      id: cleanLine(item?.id, 40),
      text: cleanLine(item?.text, 300),
    })),
    blanks: (Array.isArray(question.blanks) ? question.blanks : []).map((blank) => ({
      id: cleanLine(blank?.id, 40),
      accepts: listText(blank?.accepts, 300),
    })),
    numericRule: question.numericRule || null,
    explanation: cleanText(question.explanation, { maxLength: LIVE_LESSON_BUILDER.explanationMax }),
    guidance: cleanText(question.guidance, { maxLength: 500 }),
    criteria: cleanText(question.criteria, { maxLength: 1000 }),
    minWords: Math.max(0, Math.min(2000, Number(question.minWords) || 0)),
    maxWords: Math.max(0, Math.min(2000, Number(question.maxWords) || 0)),
  }, { salt: `ai:${draftId}:${index}` });

  return normalized;
};

export const compileItemToSlide = ({ item, index, draftId, language = "en", setupPalette = "" }) => {
  const outline = item?.outline || {};
  const content = item?.content || {};
  const title = cleanLine(content.title || outline.title, 200);
  if (item?.kind === "question") {
    const question = prepareQuestion(content.question || content, {
      itemId: item.itemId,
      draftId,
      index,
    });
    // A question with no prompt would render as a blank slide; the item simply
    // has nothing to show yet (it is still outline-only or failed).
    if (!question?.prompt) return null;
    const evidence = cleanLine(content.evidence, LIVE_LESSON_BUILDER.evidenceMax);
    return {
      order: index,
      type: "question",
      title: title || cleanLine(question.prompt, 200),
      body: "",
      html: "",
      examples: [],
      imageUrl: "",
      speakerNotes: evidence ? `Source: ${evidence}` : "",
      question,
      variants: [],
    };
  }

  const type = TEACHING_TYPES.has(item?.slideType) ? item.slideType : "content";
  // New teaching slides are model-authored pages; the wrapped document was
  // validated and palette-bound when it was generated. Legacy drafts (and any
  // item without a stored page) still compile through the designed renderer.
  if (content.aiHtml === true && String(content.html || "").trim()) {
    return {
      order: index,
      type: "html",
      title,
      body: "",
      html: content.html,
      examples: [],
      imageUrl: "",
      speakerNotes: cleanText(content.speakerNotes, { maxLength: LIVE_LESSON_BUILDER.notesMax }),
      variants: [],
    };
  }
  const examples = type === "examples"
    ? listText(content.examples, LIVE_LESSON_BUILDER.exampleChars).slice(0, LIVE_LESSON_BUILDER.examplesMax)
    : [];
  const lines = type === "examples"
    ? []
    : bodyLines(cleanText(content.body, { maxLength: LIVE_LESSON_BUILDER.bodyMax }))
      .slice(0, LIVE_LESSON_BUILDER.bodyLinesMax);
  const body = lines.join("\n");
  // Legacy teaching slides: the model supplied text and a layout name only; the
  // markup and palette come from the server renderer.
  const designed = buildDesignedSlide({
    slideType: type,
    title,
    body,
    examples,
    blocks: content.blocks,
    layout: content.layout,
    language,
    seed: `${draftId}:${item?.itemId || index}`,
    setupPalette,
  });

  return {
    order: index,
    type: "html",
    title,
    body,
    html: designed.html,
    examples,
    imageUrl: "",
    speakerNotes: cleanText(content.speakerNotes, { maxLength: LIVE_LESSON_BUILDER.notesMax }),
    variants: [],
  };
};

export const compileDraftItems = ({ items = [], draftId, language = "en", setupPalette = "" }) => {
  const slides = [];
  const skippedItemIds = [];
  items.forEach((item, index) => {
    const slide = compileItemToSlide({ item, index, draftId, language, setupPalette });
    if (slide) slides.push(slide);
    else skippedItemIds.push(item.itemId);
  });
  return {
    slides,
    counts: {
      slides: items.filter((item) => item.kind === "slide").length,
      questions: items.filter((item) => item.kind === "question").length,
      saved: slides.length,
    },
    skippedItemIds,
  };
};

export const countPlanItems = (items = []) => ({
  slides: items.filter((item) => item.kind === "slide").length,
  questions: items.filter((item) => item.kind === "question").length,
  total: items.length,
});
