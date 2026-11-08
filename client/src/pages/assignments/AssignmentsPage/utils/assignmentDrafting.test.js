import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDraftFields,
  attachFileToForm,
  buildBriefRequestMeta,
  detachFileFromForm,
  formContextFromQuestions,
} from "./assignmentDrafting.js";

test("source usage reflects the selected form and attachment options", () => {
  assert.deepEqual(buildBriefRequestMeta({}), { sourceUsage: [] });
  assert.deepEqual(buildBriefRequestMeta({ useForForm: true }), {
    sourceUsage: ["form"],
  });
  assert.deepEqual(buildBriefRequestMeta({ attachFile: true }), {
    sourceUsage: ["attachment"],
  });
  assert.deepEqual(
    buildBriefRequestMeta({ useForForm: true, attachFile: true }),
    { sourceUsage: ["form", "attachment"] },
  );
});

test("form context only carries non-empty question titles", () => {
  const questions = [
    { title: "  What is 2 + 2?  " },
    { title: "" },
    { prompt: "Untitled shape is ignored" },
    { title: "Name the planet closest to the sun." },
  ];

  assert.deepEqual(formContextFromQuestions(questions), [
    "What is 2 + 2?",
    "Name the planet closest to the sun.",
  ]);
  assert.deepEqual(formContextFromQuestions(null), []);
});

test("draft fields replace title, summary, and instructions only", () => {
  const form = {
    title: "Old title",
    summary: "Old summary",
    instructions: "Old instructions",
    assignmentTypeId: "type-1",
    maxMarks: 20,
    isGraded: true,
    dueDate: "2026-11-20",
    studentIds: ["student-1"],
  };

  const next = applyDraftFields(form, {
    title: "New title",
    summary: "New summary",
    instructions: "New instructions",
    maxMarks: 0,
    isGraded: false,
    extra: "ignored",
  });

  assert.deepEqual(next, {
    ...form,
    title: "New title",
    summary: "New summary",
    instructions: "New instructions",
  });
  assert.notEqual(next, form);
});

test("non-string draft values leave the existing field untouched", () => {
  const form = { title: "Kept", summary: "", instructions: "Kept" };

  const next = applyDraftFields(form, {
    title: undefined,
    summary: 42,
    instructions: null,
  });

  assert.deepEqual(next, form);
});

test("attaching the source file adds it once and keeps other attachments", () => {
  const existing = new File(["a"], "worksheet.pdf", {
    type: "application/pdf",
  });
  const source = new File(["b"], "lesson.pdf", { type: "application/pdf" });
  const form = { attachmentFiles: [existing] };

  const attached = attachFileToForm(form, source);
  assert.deepEqual(attached.attachmentFiles, [existing, source]);

  const again = attachFileToForm(attached, source);
  assert.equal(again, attached);
  assert.deepEqual(attachFileToForm({}, source).attachmentFiles, [source]);
});

test("detaching the source file removes only that file", () => {
  const existing = new File(["a"], "worksheet.pdf", {
    type: "application/pdf",
  });
  const source = new File(["b"], "lesson.pdf", { type: "application/pdf" });
  const form = { attachmentFiles: [existing, source] };

  assert.deepEqual(detachFileFromForm(form, source).attachmentFiles, [existing]);
  assert.equal(detachFileFromForm(form, new File(["c"], "other.pdf")), form);
  assert.equal(detachFileFromForm(form, null), form);
});
