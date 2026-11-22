import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import LiveLessonDraft from "../models/LiveLessonDraft.js";
import { updateDraftItemTexts } from "../controllers/liveLessonDraftController.js";
import {
  compileAiSlide,
  listTextSlots,
} from "../services/liveLessonHtmlContractService.js";

const schoolId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const draftId = new mongoose.Types.ObjectId();

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

const compile = (texts = { title: "The water cycle", body: "Water moves through air and land." }) =>
  compileAiSlide({
    html: fragment,
    texts,
    speakerNotes: "Ask where the water goes after it rains.",
    palette: "teal",
    language: "en",
  });

const storedContent = () => {
  const compiled = compile();
  assert.equal(compiled.ok, true, compiled.violations?.join(" | "));
  return {
    title: compiled.texts.title,
    body: "",
    examples: [],
    speakerNotes: compiled.speakerNotes,
    aiHtml: true,
    html: compiled.html,
    fragment: compiled.fragment,
    texts: compiled.texts,
    slots: listTextSlots(compiled.fragment),
    palette: "teal",
  };
};

const draftDoc = () => ({
  _id: draftId,
  school: schoolId,
  ownerId,
  status: "content",
  version: 3,
  activeOp: null,
  setup: { language: "en" },
  items: [
    {
      itemId: "itm_1",
      rev: 4,
      kind: "slide",
      slideType: "content",
      outline: { title: "The water cycle", brief: "" },
      content: storedContent(),
      status: "ready",
      failure: null,
      previous: null,
      edited: false,
      regenCount: 0,
    },
  ],
  toObject() {
    return { ...this, items: this.items.map((item) => ({ ...item })) };
  },
});

const invoke = (handler) => (req) => {
  const body = {};
  let resolveResponse;
  const responded = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const collect = (payload) => {
    Object.assign(body, payload);
    resolveResponse();
    return undefined;
  };
  handler({ ...req }, {
    json: collect,
    status: () => ({ json: collect }),
  }, (error) => {
    body.error = error;
    resolveResponse();
  });
  return responded.then(() => {
    if (body.error) throw body.error;
    return body;
  });
};

const callTexts = invoke(updateDraftItemTexts);

const stubDraft = (t, draft = draftDoc()) => {
  t.mock.method(LiveLessonDraft, "findOne", async () => draft);
  t.mock.method(LiveLessonDraft, "findById", async () => draft);
};

const request = (overrides = {}) => ({
  params: { id: String(draftId), itemId: "itm_1" },
  body: { rev: 4, texts: { title: "Water on the move" } },
  schoolId,
  user: { _id: ownerId },
  ...overrides,
});

test("saving slot texts rebuilds the page and bumps rev under the expected value", async (context) => {
  const draft = draftDoc();
  stubDraft(context, draft);
  let filter = null;
  let update = null;
  context.mock.method(LiveLessonDraft, "updateOne", async (filterValue, updateValue) => {
    filter = filterValue;
    update = updateValue;
    return { modifiedCount: 1 };
  });

  const response = await callTexts(request({
    body: {
      rev: 4,
      texts: {
        title: "Water on the move",
        body: "Evaporation lifts water; condensation forms clouds.",
      },
    },
  }));

  assert.deepEqual(filter.items, { $elemMatch: { itemId: "itm_1", rev: 4 } });
  assert.deepEqual(update.$inc, { "items.$.rev": 1 });
  const content = update.$set["items.$.content"];
  assert.equal(update.$set["items.$.edited"], true);
  assert.equal(update.$set["items.$.status"], "ready");
  assert.equal(content.palette, "teal", "the chosen palette survives a text edit");
  assert.equal(content.fragment, draft.items[0].content.fragment, "the design is untouched");
  assert.equal(content.speakerNotes, "Ask where the water goes after it rains.");
  assert.equal(content.texts.title, "Water on the move");
  assert.match(content.html, /Water on the move/);
  assert.equal(content.title, "Water on the move");
  assert.deepEqual(update.$set["items.$.previous"], {
    content: draft.items[0].content,
    rev: 4,
  });
  assert.equal(response.success, true);
  assert.ok(response.data.draft);
});

test("a stale rev is refused before anything is written", async (context) => {
  stubDraft(context);
  let writes = 0;
  context.mock.method(LiveLessonDraft, "updateOne", async () => {
    writes += 1;
    return { modifiedCount: 1 };
  });

  await assert.rejects(
    callTexts(request({ body: { rev: 3, texts: { title: "New title" } } })),
    (error) => error.code === "REV_CONFLICT" && error.statusCode === 409,
  );
  assert.equal(writes, 0);
});

test("clearing a slot is refused because every slot needs text", async (context) => {
  stubDraft(context);
  context.mock.method(LiveLessonDraft, "updateOne", async () => ({ modifiedCount: 1 }));

  await assert.rejects(
    callTexts(request({ body: { rev: 4, texts: { title: "   " } } })),
    (error) => error.code === "CONTENT_INVALID" && /text is empty/.test(error.message),
  );
});

test("a text key with no matching slot is refused", async (context) => {
  stubDraft(context);
  context.mock.method(LiveLessonDraft, "updateOne", async () => ({ modifiedCount: 1 }));

  await assert.rejects(
    callTexts(request({ body: { rev: 4, texts: { extra: "Not on the page" } } })),
    (error) => error.code === "CONTENT_INVALID" && /no matching slot/.test(error.message),
  );
});

test("text beyond the slot cap is refused instead of silently cut", async (context) => {
  stubDraft(context);
  context.mock.method(LiveLessonDraft, "updateOne", async () => ({ modifiedCount: 1 }));

  await assert.rejects(
    callTexts(request({ body: { rev: 4, texts: { body: "a".repeat(281) } } })),
    (error) => error.code === "VALIDATION" && error.statusCode === 422,
  );
});

test("a legacy designed slide is not editable through the slot endpoint", async (context) => {
  const draft = draftDoc();
  draft.items[0].content = {
    title: "Old slide",
    body: "Plain text",
    examples: [],
    speakerNotes: "",
  };
  stubDraft(context, draft);
  context.mock.method(LiveLessonDraft, "updateOne", async () => ({ modifiedCount: 1 }));

  await assert.rejects(
    callTexts(request({ body: { rev: 4, texts: { title: "New" } } })),
    (error) => error.code === "CONTENT_INVALID" && error.statusCode === 422,
  );
});
