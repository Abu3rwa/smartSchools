import test from "node:test";
import assert from "node:assert/strict";
import { assertLiveLessonHtmlSafe, inspectLiveLessonHtml } from "../services/liveLessonHtmlSafety.js";

test("allows inline CSS animation without requiring AI review", async () => {
  const html = "<style>@keyframes fade{from{opacity:0}to{opacity:1}}</style><h1 class='fade'>Hello</h1>";
  assert.equal(inspectLiveLessonHtml(html), "");
  await assertLiveLessonHtmlSafe({ slides: [{ type: "html", html }] });
});

test("rejects scripts when school AI review is disabled", async () => {
  const html = "<h1>Hello</h1><script>document.body.classList.add('ready')</script>";
  assert.match(inspectLiveLessonHtml(html), /review is disabled/);
  await assert.rejects(
    assertLiveLessonHtmlSafe({ slides: [{ type: "html", html }] }),
    /review is disabled/,
  );
});

test("blocks external resources and script browser capabilities before AI review", async () => {
  assert.match(inspectLiveLessonHtml('<img src="https://example.com/image.png">', { aiReviewEnabled: true }), /External resources/);
  assert.match(inspectLiveLessonHtml("<script>fetch('https://example.com')</script>", { aiReviewEnabled: true }), /browser capabilities/);
  assert.match(inspectLiveLessonHtml("<script>while (true) {}</script>", { aiReviewEnabled: true }), /Unbounded JavaScript loops/);
});

test("requires a passing AI review before accepting scripts", async () => {
  const slides = [{ type: "html", html: "<script>document.body.classList.add('ready')</script>" }];
  let reviews = 0;
  await assertLiveLessonHtmlSafe({
    slides,
    aiReviewEnabled: true,
    review: async () => {
      reviews += 1;
      return { safe: false, findings: [{ slide: 1, reason: "Suspicious behavior." }] };
    },
  }).then(
    () => assert.fail("Expected unsafe slide review to fail."),
    (error) => assert.match(error.message, /Slide 1: Suspicious behavior/),
  );
  assert.equal(reviews, 1);
});
