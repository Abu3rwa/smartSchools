import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { beforeEach } from "node:test";

import AiCreditSetting from "../models/AiCreditSetting.js";
import { extractBuilderDocumentText } from "../services/documentTextExtraction.js";
import { quoteForSetup } from "../services/liveLessonBuilderQuoteService.js";
import {
  getSourceText,
  putSourceText,
  readDraftSource,
  removeDraftSourceText,
  resetSourceStore,
  sourceMetaSnapshot,
} from "../services/liveLessonSourceStore.js";

beforeEach(() => resetSourceStore());

const draftId = "66aa00000000000000000001";
const otherDraftId = "66aa00000000000000000002";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name) => fs.readFileSync(path.join(fixturesDir, name));

const memoryDraft = ({ files = [], pastedChars = 0, pastedText = "" } = {}) => ({
  _id: draftId,
  setup: {
    pastedText,
    sourceMeta: { storage: "memory", pastedChars, files },
  },
});

test("source text round-trips per draft and per file", () => {
  putSourceText({ draftId, text: "Pasted lesson material" });
  putSourceText({ draftId, fileId: "file-1", text: "From the document" });
  putSourceText({ draftId: otherDraftId, text: "Another teacher" });

  assert.equal(getSourceText({ draftId }), "Pasted lesson material");
  assert.equal(getSourceText({ draftId, fileId: "file-1" }), "From the document");
  assert.equal(getSourceText({ draftId: otherDraftId }), "Another teacher");
  assert.equal(getSourceText({ draftId, fileId: "missing" }), null);

  removeDraftSourceText(draftId);
  assert.equal(getSourceText({ draftId }), null);
  assert.equal(getSourceText({ draftId, fileId: "file-1" }), null);
  assert.equal(getSourceText({ draftId: otherDraftId }), "Another teacher");
});

test("an entry expires after its ttl and a read renews it", () => {
  putSourceText({ draftId, text: "Short lived", ttlMs: 0 });
  assert.equal(getSourceText({ draftId }), null);

  putSourceText({ draftId, text: "Renewed" });
  assert.equal(getSourceText({ draftId }), "Renewed");
  assert.equal(getSourceText({ draftId }), "Renewed");
});

test("the store never grows past its entry cap", () => {
  for (let index = 0; index < 1001; index += 1) {
    putSourceText({ draftId: `66aa0000000000000000${String(index).padStart(4, "0")}`, text: "x" });
  }
  assert.equal(getSourceText({ draftId: "66aa00000000000000000000" }), null);
  assert.equal(getSourceText({ draftId: "66aa00000000000000001000" }), "x");
});

test("a draft source is rebuilt from pasted text and files in order", () => {
  putSourceText({ draftId, text: "Teacher notes" });
  putSourceText({ draftId, fileId: "file-1", text: "Water evaporates." });
  putSourceText({ draftId, fileId: "file-2", text: "Clouds condense." });

  const source = readDraftSource(memoryDraft({
    pastedChars: "Teacher notes".length,
    files: [
      { fileId: "file-1", name: "notes.pdf", chars: 18, pageCount: 2, pages: { first: 1, last: 2 } },
      { fileId: "file-2", name: "slides.pptx", chars: 17 },
    ],
  }));

  assert.match(source.text, /Teacher notes/);
  assert.match(source.text, /notes\.pdf/);
  assert.ok(source.text.indexOf("Water evaporates.") < source.text.indexOf("Clouds condense."));
  assert.equal(source.available, true);
  assert.equal(source.hash.length, 64);
  assert.equal(source.files[0].pageCount, 2);
  assert.deepEqual(source.files[0].pages, { first: 1, last: 2 });
  assert.equal(source.files[0].chars, 18);
  assert.equal(source.files[1].pageCount, undefined);
});

test("missing memory fails loudly instead of generating from an empty source", () => {
  assert.throws(
    () => readDraftSource(memoryDraft({ pastedChars: 40 })),
    (error) => error.statusCode === 409 && error.code === "SOURCE_UNAVAILABLE",
  );

  const quiet = readDraftSource(memoryDraft({ pastedChars: 40 }), { require: false });
  assert.equal(quiet.available, false);
  assert.equal(quiet.text, "");
});

test("a memory draft never resurrects a pasted value it no longer owns", () => {
  const source = readDraftSource(memoryDraft({ pastedText: "Old paste from before" }));
  assert.equal(source.available, true);
  assert.equal(source.text, "");
});

test("a draft written before memory-only sources still reads its stored text", () => {
  const source = readDraftSource({
    _id: draftId,
    setup: {
      pastedText: "Pasted from the old wizard",
      sourceMeta: {
        files: [{ fileId: "legacy", name: "chapter.docx", chars: 20, text: "Legacy document text" }],
      },
    },
  });
  assert.match(source.text, /Pasted from the old wizard/);
  assert.match(source.text, /Legacy document text/);
  assert.equal(source.available, true);
});

test("the combined source respects the character cap", () => {
  putSourceText({ draftId, fileId: "big", text: "a".repeat(200) });
  const source = readDraftSource(memoryDraft({ files: [{ fileId: "big", name: "big.txt", chars: 200 }] }), {
    maxChars: 50,
  });
  assert.equal(source.text.length, 50);
  assert.equal(source.truncated, true);
});

test("the lesson snapshot keeps names and pages and drops every text field", () => {
  const snapshot = sourceMetaSnapshot({
    storage: "memory",
    textHash: "abc",
    pastedChars: 12,
    files: [
      {
        fileId: "file-1",
        name: "Science notes.pdf",
        sourceType: "pdf",
        chars: 900,
        pageCount: 2,
        pages: { first: 1, last: 2 },
        text: "must not travel",
      },
    ],
  });
  assert.deepEqual(snapshot, {
    origin: "paste",
    pastedChars: 12,
    files: [{
      name: "Science notes.pdf",
      sourceType: "pdf",
      chars: 900,
      pageCount: 2,
      pages: { first: 1, last: 2 },
    }],
  });
});

test("a PDF reports its page count and a complete page range", async () => {
  const result = await extractBuilderDocumentText({
    buffer: fixture("two-page.pdf"),
    fileName: "two-page.pdf",
    mimeType: "application/pdf",
  });
  assert.equal(result.sourceType, "pdf");
  assert.equal(result.pageCount, 2);
  assert.deepEqual(result.pages, { first: 1, last: 2 });
  assert.match(result.text, /Water cycle/);
});

test("a PDF past the page cap reports only the count, never a range", async () => {
  const result = await extractBuilderDocumentText({
    buffer: fixture("long.pdf"),
    fileName: "long.pdf",
    mimeType: "application/pdf",
  });
  assert.equal(result.pageCount, 41);
  assert.equal(result.pages, null);
});

test("a cut PDF text drops the page range too", async () => {
  const result = await extractBuilderDocumentText({
    buffer: fixture("two-page.pdf"),
    fileName: "two-page.pdf",
    mimeType: "application/pdf",
    maxChars: 5,
  });
  assert.equal(result.truncated, true);
  assert.equal(result.pageCount, 2);
  assert.equal(result.pages, null);
});

test("plain text gets no page numbers at all", async () => {
  const result = await extractBuilderDocumentText({
    buffer: Buffer.from("The water cycle has four stages."),
    fileName: "notes.txt",
    mimeType: "text/plain",
  });
  assert.equal(result.sourceType, "text");
  assert.equal(result.pageCount, null);
  assert.equal(result.pages, null);
});

const settingQuery = (value) => {
  const query = { select: () => query, lean: async () => value };
  return query;
};

test("a quote can be priced from a hash without the text", async (t) => {
  t.mock.method(AiCreditSetting, "findOne", () => settingQuery({ markupPercent: 25 }));
  const setup = { slideCount: 3, questionCount: 2, language: "en", questionKinds: ["mcq"] };
  const withHash = await quoteForSetup(setup, { sourceChars: 2400, sourceHash: "hash-a" });
  const otherHash = await quoteForSetup(setup, { sourceChars: 2400, sourceHash: "hash-b" });
  const fromText = await quoteForSetup({ ...setup, sourceText: "x".repeat(2400) });
  assert.equal(withHash.quoteKey === otherHash.quoteKey, false);
  assert.equal(withHash.total.chargedCents, fromText.total.chargedCents);
});
