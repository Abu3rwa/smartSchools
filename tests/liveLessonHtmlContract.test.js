import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_SLIDE_ROLE_IDS,
  buildAiSlideDocument,
  compileAiSlide,
  validateAiSlideFragment,
} from "../services/liveLessonHtmlContractService.js";
import { paletteById } from "../config/liveLessonPalettes.js";

const fragment = `<section class="slide" data-slide-root>
<style>
.slide{display:flex;flex-direction:column;justify-content:center;padding:4vmin;background:var(--slide-bg);gap:2vmin}
.kicker{color:var(--slide-accent);font-size:3vmin;letter-spacing:.1em}
h1{color:var(--slide-ink);margin:0;line-height:1.05}
.chip{background:rgba(255,255,255,.12);border:1px solid var(--slide-accent-line);border-radius:999px;padding:1vmin 2vmin}
.lead{color:var(--slide-ink-muted);font-size:4.6vmin;line-height:1.5}
@keyframes rise{from{opacity:0;transform:translateY(2vmin)}to{opacity:1;transform:none}}
.kicker,h1,.lead,.chip{animation:rise .6s ease-out both}
</style>
<span class="kicker" data-static>KEY IDEA</span>
<h1 data-text="title" data-role="title" style="font-size:8vmin"></h1>
<div class="chip"><span data-text="goal-1" data-role="support" style="font-size:3.6vmin"></span></div>
<p class="lead" data-text="body" data-role="main" style="font-size:4.6vmin"></p>
</section>`;

const texts = {
  title: "The water cycle",
  "goal-1": "Explain evaporation",
  body: "Water moves between the ocean, the air and the land.",
};

const compile = (overrides = {}) => compileAiSlide({
  html: fragment,
  texts,
  speakerNotes: "Ask: where does the water go?",
  palette: "teal",
  language: "en",
  ...overrides,
});

const violationsOf = (result) => String(result.violations?.join(" | ") || "");

test("a valid AI fragment compiles into the shared shell with injected text", () => {
  const result = compile();
  assert.equal(result.ok, true, violationsOf(result));
  assert.equal(result.fragment, fragment);
  assert.match(result.html, /^<!doctype html>/);
  assert.match(result.html, /<html lang="en" dir="ltr">/);
  assert.match(result.html, /The water cycle/);
  assert.match(result.html, /Water moves between the ocean/);
  assert.match(result.html, /--slide-bg:linear-gradient/);
  assert.match(result.html, /--slide-palette:"teal"/);
  assert.match(result.html, /prefers-reduced-motion/);
  assert.match(result.html, /KEY IDEA/);
  assert.equal(result.speakerNotes, "Ask: where does the water go?");
});

test("injected text is escaped and multi-line slots become <br>", () => {
  const result = compile({
    texts: { ...texts, title: "3 < 5 & 7 > 2", body: "Line one\nLine two" },
  });
  assert.equal(result.ok, true, violationsOf(result));
  assert.match(result.html, /3 &lt; 5 &amp; 7 &gt; 2/);
  assert.match(result.html, /Line one<br>Line two/);
  assert.doesNotMatch(result.html, /<script/i);
});

test("every role range is enforced through the inline font-size", () => {
  assert.deepEqual([...AI_SLIDE_ROLE_IDS].sort(), ["learner", "main", "meta", "section", "support", "title"]);
  const tooSmall = compile().html.replace('font-size:8vmin', "font-size:5vmin");
  const result = validateAiSlideFragment({ html: tooSmall, texts, language: "en" });
  assert.equal(result.ok, false);
  assert.match(violationsOf(result), /outside 6\.7–8\.9vmin/);

  const missing = fragment.replace(' data-role="title" style="font-size:8vmin"', ' data-role="title"');
  const missingResult = validateAiSlideFragment({ html: missing, texts, language: "en" });
  assert.match(violationsOf(missingResult), /exactly one inline font-size/);
});

test("the text map and the slots must agree exactly", () => {
  const missingText = validateAiSlideFragment({
    html: fragment,
    texts: { title: "Only a title" },
    language: "en",
  });
  assert.equal(missingText.ok, false);
  assert.match(violationsOf(missingText), /Slot "goal-1" has no text/);

  const extraText = validateAiSlideFragment({
    html: fragment,
    texts: { ...texts, stray: "No slot" },
    language: "en",
  });
  assert.match(violationsOf(extraText), /Text "stray" has no matching slot/);
});

test("a teaching slide needs a title, one root and the shared root attributes", () => {
  const noTitle = fragment.replace('data-role="title"', 'data-role="section"');
  assert.match(
    violationsOf(validateAiSlideFragment({ html: noTitle, texts, language: "en" })),
    /needs one title slot/,
  );

  const noRoot = fragment.replace(' data-slide-root', "");
  assert.match(
    violationsOf(validateAiSlideFragment({ html: noRoot, texts, language: "en" })),
    /data-slide-root/,
  );

  const twoRoots = `<div class="slide" data-slide-root></div>${fragment}`;
  const result = validateAiSlideFragment({ html: twoRoots, texts, language: "en" });
  assert.match(violationsOf(result), /exactly one root element/);
});

test("off-palette colors are rejected in styles and SVG paint", () => {
  const hex = fragment.replace("color:var(--slide-ink);", "color:#ff0000;");
  assert.match(
    violationsOf(validateAiSlideFragment({ html: hex, texts, language: "en" })),
    /Color "color: #ff0000"/,
  );

  const named = fragment.replace("background:var(--slide-bg)", "background:white");
  assert.match(
    violationsOf(validateAiSlideFragment({ html: named, texts, language: "en" })),
    /must use a palette variable/,
  );

  const svg = fragment.replace(
    "</section>",
    '<svg viewBox="0 0 10 10" aria-hidden><circle cx="5" cy="5" r="4" fill="#00ff00"/></svg></section>',
  );
  const result = validateAiSlideFragment({ html: svg, texts, language: "en" });
  assert.match(violationsOf(result), /SVG paint "fill"/);
});

test("the fragment must stay self-contained and free of page-level markup", () => {
  const script = fragment.replace("</section>", "<script>alert(1)</script></section>");
  const result = validateAiSlideFragment({ html: script, texts, language: "en" });
  assert.equal(result.ok, false);
  assert.match(violationsOf(result), /not an allowed element|<script/);

  const styled = fragment.replace(".slide{", "body{");
  assert.match(
    violationsOf(validateAiSlideFragment({ html: styled, texts, language: "en" })),
    /must not style html, body or :root/,
  );

  const external = fragment.replace("background:var(--slide-bg)", "background:url(https://x.test/a.png)");
  assert.match(
    violationsOf(validateAiSlideFragment({ html: external, texts, language: "en" })),
    /url\(\) is not allowed|external URLs/,
  );
});

test("motion rules: entrance animation, bounded duration, no infinite loop", () => {
  const noAnimation = fragment.replace(/@keyframes[\s\S]*?\}\n\.kicker/, ".kicker");
  assert.match(
    violationsOf(validateAiSlideFragment({ html: noAnimation, texts, language: "en" })),
    /@keyframes/,
  );

  const slow = fragment.replace("animation:rise .6s ease-out both", "animation:rise 2.4s ease-out both");
  assert.match(
    violationsOf(validateAiSlideFragment({ html: slow, texts, language: "en" })),
    /within 1200 ms/,
  );

  const looping = fragment.replace("animation:rise .6s ease-out both", "animation:rise .6s ease-out infinite");
  assert.match(
    violationsOf(validateAiSlideFragment({ html: looping, texts, language: "en" })),
    /must not loop/,
  );
});

test("decorative text is short and never a substitute for a slot", () => {
  const longStatic = fragment.replace("KEY IDEA", "A".repeat(60));
  assert.match(
    violationsOf(validateAiSlideFragment({ html: longStatic, texts, language: "en" })),
    /limited to 40 characters/,
  );

  const rawText = fragment.replace(
    '<span class="kicker" data-static>KEY IDEA</span>',
    '<span class="kicker">KEY IDEA</span>',
  );
  assert.match(
    violationsOf(validateAiSlideFragment({ html: rawText, texts, language: "en" })),
    /empty data-text slot/,
  );
});

test("an Arabic slide may not use letter-spacing and wraps right-to-left", () => {
  const arabicFragment = fragment.replace(";letter-spacing:.1em", "");
  const arabicTexts = { title: "دورة الماء", "goal-1": "التبخر", body: "الماء يتحرك" };
  const arabic = compile({ html: arabicFragment, texts: arabicTexts, language: "ar" });
  assert.equal(arabic.ok, true, violationsOf(arabic));
  assert.match(arabic.html, /<html lang="ar" dir="rtl">/);

  const result = validateAiSlideFragment({ html: fragment, texts: arabicTexts, language: "ar" });
  assert.match(violationsOf(result), /letter-spacing/);
});

test("the shell follows the selected palette and defaults to navy", () => {
  const teal = buildAiSlideDocument({ fragment: "<section class=\"slide\"></section>", palette: "teal" });
  assert.match(teal, /--slide-accent:#5eead4/);
  assert.match(teal, /--slide-palette:"teal"/);
  const fallback = buildAiSlideDocument({ fragment: "", palette: "not-a-palette" });
  assert.match(fallback, new RegExp(`--slide-palette:"${paletteById("navy").id}"`));
});
