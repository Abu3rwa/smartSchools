import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { restoreSourceCopy } from "../services/liveLessonBuilderDraftService.js";
import {
  combineSourceText,
  hashSeed,
} from "../services/liveLessonBuilderSanitizeService.js";
import {
  readDraftSource,
  resetSourceStore,
} from "../services/liveLessonSourceStore.js";

const draftId = "66aa0000000000000000000a";
const fileRow = { fileId: "file-1", name: "notes.pdf", chars: 18, sourceType: "pdf" };
const fileText = "Water evaporates.";
const pasted = "Teacher notes";

const hashFor = ({ pastedText = "", files = [] }) => hashSeed(
  combineSourceText({ pastedText, files, maxChars: 30000 }).text,
);

const memoryDraft = ({
  files = [fileRow],
  pastedChars = pasted.length,
  textHash,
} = {}) => ({
  _id: draftId,
  setup: { sourceMeta: { storage: "memory", pastedChars, files, textHash } },
});

const uploadHash = (files = [{ ...fileRow, text: fileText }], pastedText = pasted) =>
  hashFor({ pastedText, files });

beforeEach(() => resetSourceStore());

test("the browser copy puts the source back after the store is gone", () => {
  const draft = memoryDraft({ textHash: uploadHash() });
  assert.throws(
    () => readDraftSource(draft),
    (error) => error.statusCode === 409 && error.code === "SOURCE_UNAVAILABLE",
  );

  const result = restoreSourceCopy({
    draft,
    files: [{ fileId: "file-1", text: fileText }],
    pastedText: pasted,
  });

  assert.equal(result.restored, true);
  assert.equal(result.files, 1);
  const source = readDraftSource(draft);
  assert.equal(source.available, true);
  assert.match(source.text, /Teacher notes/);
  assert.match(source.text, /Water evaporates\./);
});

test("a pasted-only draft restores the same way", () => {
  const draft = memoryDraft({
    files: [],
    pastedChars: pasted.length,
    textHash: hashFor({ pastedText: pasted, files: [] }),
  });
  assert.equal(
    restoreSourceCopy({ draft, files: [], pastedText: pasted }).restored,
    true,
  );
  assert.match(readDraftSource(draft).text, /Teacher notes/);
});

test("text that no longer matches the upload fingerprint is refused", () => {
  const draft = memoryDraft({ textHash: uploadHash() });
  assert.throws(
    () => restoreSourceCopy({
      draft,
      files: [{ fileId: "file-1", text: "A different document" }],
      pastedText: pasted,
    }),
    (error) => error.statusCode === 409 && error.code === "SOURCE_MISMATCH",
  );
});

test("the copy may only name files this draft has", () => {
  const draft = memoryDraft({ textHash: uploadHash() });
  assert.throws(
    () => restoreSourceCopy({
      draft,
      files: [{ fileId: "file-9", text: fileText }],
      pastedText: pasted,
    }),
    (error) => error.statusCode === 422 && error.code === "VALIDATION",
  );
  assert.throws(
    () => restoreSourceCopy({
      draft,
      files: [
        { fileId: "file-1", text: fileText },
        { fileId: "file-1", text: fileText },
      ],
      pastedText: pasted,
    }),
    (error) => error.statusCode === 422 && error.code === "VALIDATION",
  );
});

test("a copy missing one of the files cannot restore a partial source", () => {
  const draft = memoryDraft({ textHash: uploadHash() });
  assert.throws(
    () => restoreSourceCopy({ draft, files: [], pastedText: pasted }),
    (error) => error.statusCode === 409 && error.code === "SOURCE_RESTORE_INCOMPLETE",
  );
  assert.throws(
    () => restoreSourceCopy({
      draft,
      files: [{ fileId: "file-1", text: fileText }],
      pastedText: "",
    }),
    (error) => error.statusCode === 409 && error.code === "SOURCE_RESTORE_INCOMPLETE",
  );
});

test("a draft that still holds its source in Mongo is not restorable", () => {
  assert.throws(
    () => restoreSourceCopy({
      draft: {
        _id: draftId,
        setup: { sourceMeta: { storage: "mongo", textHash: uploadHash() } },
      },
      files: [{ fileId: "file-1", text: fileText }],
      pastedText: pasted,
    }),
    (error) => error.statusCode === 409 && error.code === "SOURCE_NOT_VOLATILE",
  );
});

test("a draft without a stored fingerprint refuses every copy", () => {
  assert.throws(
    () => restoreSourceCopy({
      draft: memoryDraft({ textHash: "" }),
      files: [{ fileId: "file-1", text: fileText }],
      pastedText: pasted,
    }),
    (error) => error.statusCode === 409 && error.code === "SOURCE_MISMATCH",
  );
});
