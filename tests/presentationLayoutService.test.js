import assert from "node:assert/strict";
import test from "node:test";

import { applyLayoutToSlide } from "../services/presentationLayoutService.js";

test("applyLayoutToSlide rejects invalid layouts", () => {
  const slide = { layout: "title-body" };

  assert.throws(
    () => applyLayoutToSlide({ slide, layout: "not-a-layout", preserveContent: true }),
    (error) => {
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test("applyLayoutToSlide preserves content but clears incompatible fields", () => {
  const slide = {
    layout: "comparison",
    title: "Title",
    bodyHtml: "<p>Body</p>",
    bodyHtml2: "<p>Body 2</p>",
    imageUrl: "https://example.com/image.png",
    imageAlt: "Image",
    imageCaption: "Caption",
  };

  const updated = applyLayoutToSlide({
    slide,
    layout: "title-body",
    preserveContent: true,
  });

  assert.equal(updated.layout, "title-body");
  assert.equal(updated.bodyHtml, "<p>Body</p>");
  assert.equal(updated.bodyHtml2, "");
  assert.equal(updated.imageUrl, "");
  assert.equal(updated.imageAlt, "");
  assert.equal(updated.imageCaption, "");
});

test("applyLayoutToSlide normalize mode resets non-layout-safe fields", () => {
  const slide = {
    layout: "comparison",
    title: "Title",
    subtitle: "Subtitle",
    bodyHtml: "<p>Body</p>",
    bodyHtml2: "<p>Body 2</p>",
    speakerNotes: "Notes",
    imageUrl: "https://example.com/image.png",
    imageAlt: "Image",
    imageCaption: "Caption",
  };

  const updated = applyLayoutToSlide({
    slide,
    layout: "two-column",
    preserveContent: false,
  });

  assert.equal(updated.layout, "two-column");
  assert.equal(updated.subtitle, "");
  assert.equal(updated.bodyHtml, "<p>Body</p>");
  assert.equal(updated.bodyHtml2, "");
  assert.equal(updated.imageUrl, "");
  assert.equal(updated.imageAlt, "");
  assert.equal(updated.imageCaption, "");
});
