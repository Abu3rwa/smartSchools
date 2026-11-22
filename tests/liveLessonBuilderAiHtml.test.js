import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAiSlideContent,
  slideHtmlPrompt,
} from "../services/liveLessonBuilderAiService.js";
import {
  compileDraftItems,
  compileItemToSlide,
} from "../services/liveLessonBuilderCompileService.js";

const setup = {
  language: "en",
  palette: "teal",
  generationMode: "high",
};

const item = {
  itemId: "itm_1",
  kind: "slide",
  slideType: "content",
  outline: { title: "The water cycle", brief: "Explain how water moves" },
};

const fragment = `<section class="slide" data-slide-root>
<style>
.slide{display:flex;flex-direction:column;justify-content:center;padding:4vmin;background:var(--slide-bg)}
h1{color:var(--slide-ink);margin:0}
.lead{color:var(--slide-ink-muted)}
@keyframes rise{from{opacity:0;transform:translateY(2vmin)}to{opacity:1;transform:none}}
h1,.lead{animation:rise .6s ease-out both}
</style>
<h1 data-text="title" data-role="title" style="font-size:8vmin"></h1>
<p class="lead" data-text="body" data-role="main" style="font-size:4.6vmin"></p>
</section>`;

const slide = {
  html: fragment,
  texts: {
    title: "The water cycle",
    body: "Water moves between the ocean, the air and the land.",
  },
  speakerNotes: "Ask where the water goes after it rains.",
};

const violationsOf = (error) => String(error.violations?.join(" | ") || error.message);

test("the slide prompt carries the slot, type, palette and source rules", () => {
  const prompt = slideHtmlPrompt({
    setup: { ...setup, grade: "Grade 5", subjectText: "Science" },
    sourceText: "Evaporation lifts water into the air.",
    items: [item],
  });
  assert.match(prompt, /data-text/);
  assert.match(prompt, /data-role/);
  assert.match(prompt, /6\.7–8\.9vmin/);
  assert.match(prompt, /var\(--slide-bg\)/);
  assert.match(prompt, /--slide-accent/);
  assert.match(prompt, /exactly one <style>/);
  assert.match(prompt, /@keyframes/);
  assert.match(prompt, /Grade 5/);
  assert.match(prompt, /Evaporation lifts water into the air\./);
  assert.match(prompt, /itm_1/);
  // The model now owns the markup; the old "never write HTML" rule is gone.
  assert.doesNotMatch(prompt, /never write HTML/i);
  assert.doesNotMatch(prompt, /personal data of a student/);
  assert.match(prompt, /Never include a student's name/);
});

test("the prompt names every requested slide in low mode order", () => {
  const prompt = slideHtmlPrompt({
    setup: { ...setup, generationMode: "low" },
    sourceText: "",
    items: [
      item,
      { ...item, itemId: "itm_2", slideType: "goals", outline: { title: "Goals", brief: "" } },
      { ...item, itemId: "itm_3", slideType: "exit-ticket", outline: { title: "Exit", brief: "" } },
    ],
  });
  assert.match(prompt, /exactly these slides/i);
  assert.ok(prompt.indexOf("itm_1") < prompt.indexOf("itm_2"));
  assert.ok(prompt.indexOf("itm_2") < prompt.indexOf("itm_3"));
  assert.match(prompt, /goals: Two to five goals/);
  assert.match(prompt, /exit-ticket: One reflection prompt/);
});

test("a conforming slide becomes palette-bound AI content", () => {
  const content = normalizeAiSlideContent({
    item,
    slide,
    setup,
    draftId: "draft_1",
    index: 0,
  });
  assert.equal(content.aiHtml, true);
  assert.equal(content.title, "The water cycle");
  assert.equal(content.palette, "teal");
  assert.match(content.html, /--slide-palette:"teal"/);
  assert.match(content.html, /Water moves between the ocean/);
  assert.equal(content.slots[0].role, "title");
  assert.equal(content.slots[1].role, "main");
  assert.equal(content.speakerNotes, slide.speakerNotes);
});

test("auto palette keeps the deterministic per-slide choice", () => {
  const content = normalizeAiSlideContent({
    item,
    slide,
    setup: { ...setup, palette: "auto" },
    draftId: "draft_1",
    index: 0,
  });
  assert.match(content.html, /--slide-palette:"(navy|plum|forest|sunset|teal)"/);
});

test("an invalid slide failure carries the fragment and violations for repair", () => {
  assert.throws(
    () => normalizeAiSlideContent({
      item,
      slide: { ...slide, texts: { ...slide.texts, title: "" } },
      setup,
      draftId: "draft_1",
      index: 0,
    }),
    (error) => {
      assert.equal(error.code, "CONTENT_INVALID");
      assert.ok(error.violations.length > 0);
      assert.equal(error.fragment, fragment);
      assert.match(violationsOf(error), /empty|title/i);
      return true;
    },
  );
});

test("English text in an Arabic lesson is rejected before it is stored", () => {
  assert.throws(
    () => normalizeAiSlideContent({
      item,
      slide,
      setup: { ...setup, language: "ar" },
      draftId: "draft_1",
      index: 0,
    }),
    (error) => error.code === "LANGUAGE_MISMATCH",
  );
});

test("compiling prefers the stored AI page over the legacy designer", () => {
  const content = normalizeAiSlideContent({ item, slide, setup, draftId: "draft_1", index: 0 });
  const compiled = compileItemToSlide({
    item: { ...item, content },
    index: 0,
    draftId: "draft_1",
    language: "en",
    setupPalette: "teal",
  });
  assert.equal(compiled.type, "html");
  assert.equal(compiled.html, content.html);
  assert.equal(compiled.title, "The water cycle");
});

test("legacy items still compile and receive the chosen palette", () => {
  const compiled = compileDraftItems({
    items: [{ ...item, content: { title: "Legacy", body: "Body line" } }],
    draftId: "draft_1",
    setupPalette: "sunset",
  });
  assert.equal(compiled.slides.length, 1);
  assert.match(compiled.slides[0].html, /data-palette="sunset"/);
});
