import assert from "node:assert/strict";
import test from "node:test";

import {
  arabicScriptRatio,
  cleanLine,
  cleanText,
  combineSourceText,
  hashSeed,
  redactSourceText,
  shuffleWithSeed,
  suggestLessonTitle,
} from "../services/liveLessonBuilderSanitizeService.js";
import {
  compileDraftItems,
  compileItemToSlide,
  countPlanItems,
  prepareQuestion,
} from "../services/liveLessonBuilderCompileService.js";
import {
  LIVE_LESSON_BUILDER,
  estimateTokens,
  quoteLessonBuild,
} from "../config/liveLessonBuilderConfig.js";
import {
  normalizeSlideContent,
  parsePlanItems,
} from "../services/liveLessonBuilderAiService.js";

const rates = {
  model: "gpt-5.4-mini",
  inputPerMillionCents: 75,
  cachedInputPerMillionCents: 7.5,
  outputPerMillionCents: 450,
};

const draftId = "665f1f77bcf86cd799439011";

test("cleanText removes tags, control, zero-width and bidi characters but keeps plain signs", () => {
  const dirty = "Hello\u200b <script>alert(1)</script>\u202Eworld\u0007\n\n\n\n3 < 5 and 7 > 2 | line";
  const clean = cleanText(dirty);
  assert.ok(!clean.includes("<script>"));
  assert.ok(!clean.includes("\u200b"));
  assert.ok(!clean.includes("\u202e"));
  assert.ok(!clean.includes("\u0007"));
  assert.ok(!clean.includes("|"));
  assert.ok(clean.includes("\u2223"));
  assert.ok(clean.includes("3 < 5 and 7 > 2"));
  assert.ok(!clean.includes("\n\n\n"));
});

test("cleanLine flattens newlines and respects the length cap", () => {
  assert.equal(cleanLine("first\nsecond"), "first second");
  assert.equal(cleanLine("abcdef", 3), "abc");
});

test("redactSourceText replaces emails and long phone numbers but keeps year ranges", () => {
  const { text, redactions } = redactSourceText(
    "Email the teacher at maya.h@example.com or call +218 91 123 4567. The years 2023 - 2024.",
  );
  assert.ok(text.includes("[email]"));
  assert.ok(text.includes("[number]"));
  assert.ok(text.includes("2023 - 2024"));
  assert.deepEqual(redactions, { emails: 1, phones: 1 });
});

test("combineSourceText caps the combined text and labels each file", () => {
  const pasted = combineSourceText({ pastedText: "Pasted paragraph.", files: [], maxChars: 30000 });
  assert.equal(pasted.text, "Pasted paragraph.");

  const combined = combineSourceText({
    pastedText: "Pasted paragraph.",
    files: [
      { name: "chapter.pdf", text: "Chapter body." },
      { name: "worksheet.docx", text: "Worksheet body." },
    ],
    maxChars: 200,
  });
  assert.ok(combined.text.includes("--- file: chapter.pdf ---"));
  assert.ok(combined.text.includes("--- file: worksheet.docx ---"));
  assert.ok(combined.text.length <= 200);

  const tight = combineSourceText({
    pastedText: "a".repeat(50),
    files: [{ name: "big.txt", text: "b".repeat(100) }],
    maxChars: 60,
  });
  assert.equal(tight.truncated, true);
  assert.ok(tight.text.length <= 60);
});

test("suggestLessonTitle reads the document and never the file name", () => {
  const source = [
    "--- file: 5-R-Ahmed.docx ---",
    "The Water Cycle",
    "Water moves between the ocean, the air and the land.",
    "Page 12",
  ].join("\n");
  assert.equal(suggestLessonTitle(source), "The Water Cycle");
  assert.equal(suggestLessonTitle("--- file: secret-name.pdf ---"), "");
});

test("arabicScriptRatio separates Arabic prose from English prose", () => {
  assert.equal(arabicScriptRatio("دورة الماء في الطبيعة"), 1);
  assert.equal(arabicScriptRatio("The water cycle"), 0);
  const mixed = arabicScriptRatio("Water ماء");
  assert.ok(mixed > 0 && mixed < 1);
});

test("option shuffling is deterministic and leaves the answer key intact", () => {
  const options = [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
    { id: "d", text: "D" },
  ];
  const first = shuffleWithSeed(options, "seed-1").map((option) => option.id);
  const second = shuffleWithSeed(options, "seed-1").map((option) => option.id);
  assert.deepEqual(first, second);
  assert.deepEqual([...first].sort(), ["a", "b", "c", "d"]);

  const item = { itemId: "itm_1" };
  const question = {
    kind: "mcq",
    prompt: "Which is water?",
    options,
    correctOptionId: "b",
  };
  const prepared = prepareQuestion(question, { itemId: item.itemId, draftId, index: 0 });
  assert.equal(prepared.correctOptionId, "b");
  assert.equal(prepared.options.length, 4);
  const again = prepareQuestion(question, { itemId: item.itemId, draftId, index: 0 });
  assert.deepEqual(
    prepared.options.map((option) => option.id),
    again.options.map((option) => option.id),
  );
});

test("true/false options keep their order", () => {
  const prepared = prepareQuestion({
    kind: "tf",
    prompt: "Water evaporates.",
    options: [{ id: "true", text: "True" }, { id: "false", text: "False" }],
    correctOptionId: "true",
  }, { itemId: "itm_tf", draftId, index: 1 });
  assert.deepEqual(prepared.options.map((option) => option.id), ["true", "false"]);
});

test("a platform question compiles into a native question slide with its evidence", () => {
  const slide = compileItemToSlide({
    item: {
      itemId: "itm_q1",
      kind: "question",
      outline: { title: "Warm-up" },
      content: {
        title: "Warm-up",
        evidence: "Water moves between the ocean, air and land.",
        question: {
          kind: "mcq",
          prompt: "What happens when water heats up?",
          options: [
            { id: "a", text: "It evaporates" },
            { id: "b", text: "It freezes" },
          ],
          correctOptionId: "a",
          explanation: "Heat turns liquid water into vapour.",
        },
      },
    },
    index: 3,
    draftId,
  });
  assert.equal(slide.order, 3);
  assert.equal(slide.type, "question");
  assert.equal(slide.title, "Warm-up");
  assert.equal(slide.speakerNotes, "Source: Water moves between the ocean, air and land.");
  assert.equal(slide.question.correctOptionId, "a");
  assert.ok(slide.question.options.some((option) => option.id === "a"));
});

test("teaching items compile into designed HTML slides and keep their body lines and examples", () => {
  const content = compileItemToSlide({
    item: {
      itemId: "itm_s1",
      kind: "slide",
      slideType: "examples",
      outline: { title: "Examples" },
      content: { title: "Everyday examples", examples: ["Rain", "Snow", "Hail", "", "x".repeat(300)] },
    },
    index: 0,
    draftId,
  });
  assert.equal(content.type, "html");
  assert.deepEqual(content.examples.slice(0, 3), ["Rain", "Snow", "Hail"]);
  assert.equal(content.examples[3].length, LIVE_LESSON_BUILDER.exampleChars);
  assert.match(content.html, /^<!doctype html>/i);
  assert.match(content.html, /Everyday examples/);
  assert.match(content.html, /Rain/);

  const body = compileItemToSlide({
    item: {
      itemId: "itm_s2",
      kind: "slide",
      slideType: "content",
      outline: { title: "What is the water cycle?" },
      content: { title: "What is the water cycle?", body: "Line one\nLine two" },
    },
    index: 1,
    draftId,
  });
  assert.equal(body.body, "Line one\nLine two");
  assert.match(body.html, /Line one/);
  assert.match(body.html, /Line two/);
  assert.doesNotMatch(body.html, /<script/i);
});

test("designed slide HTML escapes visible text and keeps the document self-contained", () => {
  const slide = compileItemToSlide({
    item: {
      itemId: "itm_esc",
      kind: "slide",
      slideType: "content",
      content: { title: "3 < 5 & 7 > 2", body: "Compare 3 < 5 with 7 > 2" },
    },
    index: 0,
    draftId,
  });
  assert.match(slide.html, /3 &lt; 5 &amp; 7 &gt; 2/);
  assert.doesNotMatch(slide.html, /<img|<iframe|<link|<script/i);
  assert.doesNotMatch(slide.html, /url\(|@import/i);
  assert.doesNotMatch(slide.html, /https?:\/\//i);
});

test("an Arabic lesson compiles designed slides right-to-left", () => {
  const slide = compileItemToSlide({
    item: {
      itemId: "itm_ar",
      kind: "slide",
      slideType: "goals",
      content: { title: "أهداف الدرس", body: "الهدف الأول\nالهدف الثاني" },
    },
    index: 0,
    draftId,
    language: "ar",
  });
  assert.match(slide.html, /<html lang="ar" dir="rtl">/);
  assert.match(slide.html, /أهداف الدرس<\/span>/);
  assert.doesNotMatch(slide.html, /Lesson goals/);
});

test("an unknown slide type becomes a content slide instead of breaking the renderer", () => {
  const slide = compileItemToSlide({
    item: {
      itemId: "itm_s3",
      kind: "slide",
      slideType: "not-a-type",
      content: { title: "Fallback", body: "Body" },
    },
    index: 0,
    draftId,
  });
  assert.equal(slide.type, "html");
  assert.match(slide.html, /Key idea/);
  assert.match(slide.html, /Fallback/);
});

test("compiling a draft reports skipped items without inventing slides", () => {
  const items = [
    { itemId: "itm_1", kind: "slide", slideType: "content", content: { title: "One", body: "Body" } },
    { itemId: "itm_2", kind: "slide", slideType: "content", content: { title: "Empty outline only" } },
    { itemId: "itm_3", kind: "question", content: {} },
  ];
  const compiled = compileDraftItems({ items, draftId });
  assert.equal(compiled.slides.length, 2);
  assert.deepEqual(compiled.skippedItemIds, ["itm_3"]);
  assert.deepEqual(compiled.counts, { slides: 2, questions: 1, saved: 2 });
  assert.deepEqual(countPlanItems(items), { slides: 2, questions: 1, total: 3 });
});

test("the quote charges more for more items and honours the markup", () => {
  const small = quoteLessonBuild({
    slideCount: 5,
    questionCount: 3,
    sourceChars: 2000,
    language: "en",
    rates,
    markupPercent: 50,
  });
  const large = quoteLessonBuild({
    slideCount: 20,
    questionCount: 15,
    sourceChars: 2000,
    language: "en",
    rates,
    markupPercent: 50,
  });
  assert.ok(large.total.providerCostCents > small.total.providerCostCents);
  assert.ok(large.total.chargedCents > large.total.providerCostCents);
  // High writes one teaching slide per call and includes one repair per slide.
  assert.equal(small.calls, 1 + 5 + Math.ceil(3 / LIVE_LESSON_BUILDER.chunkSize) + 5);
  const low = quoteLessonBuild({
    slideCount: 5,
    questionCount: 3,
    sourceChars: 2000,
    language: "en",
    rates,
    markupPercent: 50,
    generationMode: "low",
  });
  assert.equal(low.generationMode, "low");
  assert.equal(low.content.calls, 1 + Math.ceil(3 / LIVE_LESSON_BUILDER.chunkSize));
  assert.equal(low.calls, 1 + 1 + Math.ceil(3 / LIVE_LESSON_BUILDER.chunkSize) + 5);
  assert.ok(low.total.providerCostCents < small.total.providerCostCents);
  assert.ok(small.repair.calls === 5 && small.repair.chargedCents > 0);
  assert.ok(small.regenerate.chargedCents > 0);
});

test("Arabic source text is estimated with more tokens than English", () => {
  assert.ok(estimateTokens("م".repeat(200), "ar") > estimateTokens("a".repeat(200), "en"));
});

test("hashSeed is stable and different inputs differ", () => {
  assert.equal(hashSeed("a", 1), hashSeed("a", 1));
  assert.notEqual(hashSeed("a", 1), hashSeed("a", 2));
});

const planSetup = (slideCount, questionCount) => ({
  slideCount,
  questionCount,
  questionKinds: ["mcq", "matching"],
});

test("an examples slide written as body lines keeps those lines as examples", () => {
  const content = normalizeSlideContent({
    item: { slideType: "examples" },
    slide: { title: "Examples", body: "Rain fell all morning.\nSnow covered the road.\nRain fell all morning." },
  });
  assert.deepEqual(content.examples, ["Rain fell all morning.", "Snow covered the road."]);
  assert.equal(content.body, "");
  assert.throws(
    () => normalizeSlideContent({
      item: { slideType: "examples" },
      slide: { title: "Examples", body: "Only one example." },
    }),
    (error) => error.code === "CONTENT_INVALID",
  );
});

test("a plan labels questions as question slides and still counts them as questions", () => {
  const items = parsePlanItems({
    items: [
      { kind: "slide", slideType: "opening", title: "Open", brief: "Starts the lesson." },
      { kind: "slide", slideType: "question", questionKind: "mcq", title: "Check", brief: "Checks it." },
      { title: "Match", brief: "Pairs.", questionKind: "matching" },
    ],
  }, planSetup(1, 2));
  assert.deepEqual(items.map((item) => item.kind), ["slide", "question", "question"]);
  assert.equal(items[1].slideType, "question");
  assert.equal(items[2].questionKind, "matching");
});

test("a plan with surplus items is trimmed to the requested counts in plan order", () => {
  const row = (kind, title) => ({
    kind,
    slideType: kind === "slide" ? "content" : "question",
    questionKind: kind === "question" ? "mcq" : "",
    title,
    brief: "Brief.",
  });
  const items = parsePlanItems({
    items: [
      row("slide", "S1"),
      row("question", "Q1"),
      row("slide", "S2"),
      row("slide", "S3"),
      row("question", "Q2"),
    ],
  }, planSetup(2, 1));
  assert.deepEqual(items.map((item) => item.outline.title), ["S1", "Q1", "S2"]);
});

test("a plan that is short of the requested counts still fails", () => {
  assert.throws(
    () => parsePlanItems({
      items: [
        { kind: "slide", slideType: "content", title: "Only slide", brief: "Brief." },
        { kind: "question", questionKind: "mcq", title: "Only question", brief: "Brief." },
      ],
    }, planSetup(2, 2)),
    (error) => error.code === "PLAN_COUNT_MISMATCH",
  );
});
