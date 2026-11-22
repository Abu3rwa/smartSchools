import assert from "node:assert/strict";
import test from "node:test";
import { sourceChips } from "./liveLessonSourceChip.js";

const messages = {
  "sourceChip.pagesRange": "{{name}} · pp. {{first}}–{{last}} / {{count}}",
  "sourceChip.pagesCount": "{{name}} · {{count}} pages",
  "sourceChip.characters": "{{name}} · {{count}} characters",
  "sourceChip.pasted": "Pasted text · {{count}} characters",
};

const t = (key, vars = {}) =>
  messages[key].replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));

test("a complete PDF names its page range and total", () => {
  assert.deepEqual(
    sourceChips(
      {
        files: [
          {
            name: "bill-of-rights.pdf",
            chars: 4200,
            pageCount: 8,
            pages: { first: 1, last: 8 },
          },
        ],
        pastedChars: 0,
      },
      t,
      "en",
    ),
    ["bill-of-rights.pdf · pp. 1–8 / 8"],
  );
});

test("a PDF with only a page count reports the count", () => {
  assert.deepEqual(
    sourceChips(
      { files: [{ name: "scan.pdf", chars: 900, pageCount: 3, pages: null }] },
      t,
      "en",
    ),
    ["scan.pdf · 3 pages"],
  );
});

test("a file without page metadata reports characters", () => {
  assert.deepEqual(
    sourceChips(
      { files: [{ name: "notes.docx", chars: 1234, pageCount: null, pages: null }] },
      t,
      "en",
    ),
    ["notes.docx · 1,234 characters"],
  );
});

test("pasted text adds its own chip after the files", () => {
  assert.deepEqual(
    sourceChips(
      {
        files: [{ name: "notes.docx", chars: 20, pageCount: null }],
        pastedChars: 512,
      },
      t,
      "en",
    ),
    ["notes.docx · 20 characters", "Pasted text · 512 characters"],
  );
});

test("no source yields no chips", () => {
  assert.deepEqual(sourceChips(undefined, t, "en"), []);
  assert.deepEqual(sourceChips({ files: [], pastedChars: 0 }, t, "en"), []);
  assert.deepEqual(sourceChips({ files: [{ name: "  " }] }, t, "en"), []);
});
