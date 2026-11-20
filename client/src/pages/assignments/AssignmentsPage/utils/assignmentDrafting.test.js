import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDraftFields,
  buildBriefRequestMeta,
  buildSourceOptions,
  buildSourceRequestFields,
  formContextFromQuestions,
  resolveSourceOption,
} from "./assignmentDrafting.js";

test("source usage reflects the selected form option", () => {
  assert.deepEqual(buildBriefRequestMeta({}), { sourceUsage: [] });
  assert.deepEqual(buildBriefRequestMeta({ useForForm: true }), {
    sourceUsage: ["form"],
  });
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

test("source options list pending files first, then saved Drive files", () => {
  const pending = new File(["a"], "worksheet.pdf", {
    type: "application/pdf",
  });
  const options = buildSourceOptions({
    pendingFiles: [pending],
    driveAttachments: [
      { fileId: "drive-1", fileName: "lesson.pdf" },
      { fileId: "", fileName: "orphan.pdf" },
    ],
  });

  assert.deepEqual(
    options.map((option) => option.value),
    ["pending:0", "drive:drive-1"],
  );
  assert.equal(options[0].label, "worksheet.pdf");
  assert.equal(options[1].label, "lesson.pdf");
});

test("a pending file is sent as bytes and a saved file is sent by id", () => {
  const pending = new File(["a"], "worksheet.pdf", {
    type: "application/pdf",
  });
  const options = buildSourceOptions({
    pendingFiles: [pending],
    driveAttachments: [{ fileId: "drive-1", fileName: "lesson.pdf" }],
  });

  assert.deepEqual(buildSourceRequestFields(options[0]), { file: pending });
  assert.deepEqual(buildSourceRequestFields(options[1]), {
    sourceFileId: "drive-1",
  });
  assert.deepEqual(buildSourceRequestFields(null), {});
  assert.equal(resolveSourceOption(options, "drive:drive-1").label, "lesson.pdf");
  assert.equal(resolveSourceOption(options, "missing"), null);
});
