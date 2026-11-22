import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILDER_LIMITS,
  QUESTION_KINDS,
  QUESTION_KIND_OPTIONS,
  allItemsReady,
  balanceCredits,
  costCredits,
  createDefaultSetup,
  describeItemAnswer,
  draftFromResponse,
  draftToSetup,
  errorCopy,
  fileTypeInfo,
  nextGenerationBatch,
  outlineCounts,
  progressStats,
  questionKindCounts,
  setupFormValues,
  setupPatchBody,
  sourceStats,
  stageFromDraft,
  stepAvailability,
  subjectsForClass,
  suggestSetupDefaults,
  totalItemCount,
  validateFiles,
  validateSetup,
} from "./liveLessonBuilderForm.js";

const item = (overrides) => ({
  itemId: "item-1",
  kind: "slide",
  slideType: "content",
  questionKind: "",
  status: "outlined",
  ...overrides,
});

test("draftToSetup reads the server view and keeps supported choices", () => {
  const setup = draftToSetup({
    setup: {
      title: "The Bill of Rights",
      grade: "Grade 5",
      subjectText: "Social Studies",
      language: "ar",
      level: "stretch",
      slideCount: 8,
      questionCount: 5,
      questionKinds: ["mcq", "nope", "tf"],
      palette: "teal",
      generationMode: "low",
      attestation: { noStudentData: true },
    },
  });
  assert.equal(setup.title, "The Bill of Rights");
  assert.equal(setup.language, "ar");
  assert.equal(setup.level, "stretch");
  assert.deepEqual(setup.questionKinds, ["mcq", "tf"]);
  assert.equal(setup.palette, "teal");
  assert.equal(setup.generationMode, "low");
  assert.equal(setup.attestationNoStudentData, true);
  const defaults = draftToSetup({});
  assert.equal(defaults.palette, "navy");
  assert.equal(defaults.generationMode, "high");
  assert.equal(draftToSetup({ setup: { palette: "auto" } }).palette, "auto");
});

test("setup values sent to the server carry the palette and mode", () => {
  const setup = { ...createDefaultSetup(), palette: "sunset", generationMode: "low" };
  const values = setupFormValues(setup);
  assert.equal(values.palette, "sunset");
  assert.equal(values.generationMode, "low");
  const body = setupPatchBody(setup, 4);
  assert.equal(body.palette, "sunset");
  assert.equal(body.generationMode, "low");
  assert.equal(body.version, 4);
});

test("validateSetup names the first broken limit", () => {
  const base = {
    title: "Lesson",
    slideCount: 8,
    questionCount: 5,
    questionKinds: ["mcq"],
  };
  assert.equal(validateSetup(base), "");
  assert.equal(validateSetup({ ...base, slideCount: 0 }), "validation.slides");
  assert.equal(validateSetup({ ...base, questionCount: -1 }), "validation.questions");
  assert.equal(validateSetup({ ...base, questionKinds: [] }), "validation.questionKinds");
  assert.equal(
    validateSetup({ ...base, title: "x".repeat(BUILDER_LIMITS.titleMax + 1) }),
    "validation.title",
  );
});

test("the next batch comes from the server plan and skips attempts", () => {
  const draft = {
    items: [
      item({ itemId: "s1" }),
      item({ itemId: "s2" }),
      item({ itemId: "s3", status: "ready" }),
      item({ itemId: "q1", kind: "question", questionKind: "mcq", slideType: "question" }),
      item({ itemId: "s4" }),
    ],
    generationPlan: [
      { kind: "slide", itemIds: ["s1"] },
      { kind: "slide", itemIds: ["s2"] },
      { kind: "slide", itemIds: ["s3"] },
      { kind: "slide", itemIds: ["s4"] },
      { kind: "question", itemIds: ["q1"] },
    ],
  };
  assert.deepEqual(nextGenerationBatch(draft), ["s1"]);
  assert.deepEqual(nextGenerationBatch(draft, new Set(["s1"])), ["s2"]);
  assert.deepEqual(
    nextGenerationBatch({ ...draft, items: draft.items.map((row) => (row.itemId === "s1" ? { ...row, status: "ready" } : row)) }),
    ["s2"],
  );
  assert.deepEqual(
    nextGenerationBatch({ ...draft, items: draft.items.map((row) => (["s1", "s2", "s4"].includes(row.itemId) ? { ...row, status: "ready" } : row)) }),
    ["q1"],
  );
  assert.deepEqual(nextGenerationBatch({ items: [] }), []);
});

test("a low-mode plan hands the whole slide batch to one call", () => {
  const ids = ["s1", "s2", "s3", "s4", "s5", "s6"];
  const draft = {
    items: ids.map((itemId) => item({ itemId })),
    generationPlan: [{ kind: "slide", itemIds: ids }],
  };
  assert.deepEqual(nextGenerationBatch(draft), ids);
  assert.deepEqual(nextGenerationBatch(draft, new Set(["s2"])), ["s1", "s3", "s4", "s5", "s6"]);
});

test("progress and readiness count only ready items", () => {
  const items = [
    item({ status: "ready" }),
    item({ itemId: "2", status: "failed" }),
    item({ itemId: "3", status: "outlined" }),
    item({ itemId: "4", status: "ready" }),
  ];
  assert.deepEqual(progressStats(items), {
    total: 4,
    ready: 2,
    failed: 1,
    remaining: 2,
    percent: 50,
  });
  assert.equal(allItemsReady(items), false);
  assert.equal(allItemsReady([item({ status: "ready" })]), true);
  assert.equal(allItemsReady([]), false);
});

test("costs round up and balances round down", () => {
  assert.equal(costCredits(0), 0);
  assert.equal(costCredits(0.2), 1);
  assert.equal(costCredits(1.01), 2);
  assert.equal(costCredits(2), 2);
  assert.equal(balanceCredits(419.9), 419);
  assert.equal(balanceCredits(null), 0);
});

test("sourceStats adds pending files to the server count", () => {
  const stats = sourceStats({
    draft: {
      setup: {
        sourceChars: 12400,
        files: [{ fileId: "a" }],
        sourceTruncated: true,
        redactions: { emails: 2, phones: 1 },
      },
    },
    pendingFiles: [{}, {}],
    pastedText: "short",
  });
  assert.equal(stats.files, 3);
  assert.equal(stats.characters, 12400);
  assert.equal(stats.truncated, true);
  assert.deepEqual(stats.redactions, { emails: 2, phones: 1 });
});

test("outline and question mix reflect edits", () => {
  const items = [
    item(),
    item({ itemId: "2", kind: "question", questionKind: "mcq" }),
    item({ itemId: "3", kind: "question", questionKind: "multi_select" }),
    item({ itemId: "4", kind: "question", questionKind: "mcq" }),
  ];
  assert.deepEqual(outlineCounts(items), { total: 4, slides: 1, questions: 3 });
  assert.deepEqual(questionKindCounts(items), { mcq: 2, multi_select: 1 });
});

test("every supported question kind is offered with a label key", () => {
  assert.deepEqual(QUESTION_KINDS, [
    "mcq",
    "tf",
    "multi_select",
    "matching",
    "ordering",
    "fill_in_blank",
    "numeric",
    "text",
  ]);
  assert.deepEqual(
    QUESTION_KIND_OPTIONS.map((option) => option.value),
    [...QUESTION_KINDS],
  );
  assert.deepEqual(
    QUESTION_KIND_OPTIONS.map((option) => option.labelKey),
    QUESTION_KINDS.map((kind) => `questionKinds.${kind}`),
  );
});

test("question kind counts cover advanced kinds", () => {
  const items = [
    item({ itemId: "1", kind: "question", questionKind: "matching" }),
    item({ itemId: "2", kind: "question", questionKind: "ordering" }),
    item({ itemId: "3", kind: "question", questionKind: "fill_in_blank" }),
    item({ itemId: "4", kind: "question", questionKind: "numeric" }),
    item({ itemId: "5", kind: "question", questionKind: "text" }),
    item({ itemId: "6", kind: "question", questionKind: "matching" }),
  ];
  assert.deepEqual(questionKindCounts(items), {
    matching: 2,
    ordering: 1,
    fill_in_blank: 1,
    numeric: 1,
    text: 1,
  });
});

test("describeItemAnswer writes an answer key for every question kind", () => {
  const options = [
    { id: "a", text: "One" },
    { id: "b", text: "Two" },
    { id: "c", text: "Three" },
  ];
  assert.deepEqual(
    describeItemAnswer({ kind: "mcq", options, correctOptionId: "b" }),
    ["Two"],
  );
  assert.deepEqual(
    describeItemAnswer({ kind: "tf", options, correctOptionId: "a" }),
    ["One"],
  );
  assert.deepEqual(
    describeItemAnswer({ kind: "multi_select", options, correctOptionIds: ["a", "c"] }),
    ["One", "Three"],
  );
  assert.deepEqual(
    describeItemAnswer({
      kind: "matching",
      matchingPairs: [
        { left: "Amendment 1", right: "Religion and speech" },
        { left: "Amendment 2", right: "Right to bear arms" },
      ],
    }),
    ["Amendment 1 = Religion and speech", "Amendment 2 = Right to bear arms"],
  );
  assert.deepEqual(
    describeItemAnswer({
      kind: "ordering",
      orderingItems: [{ text: "First" }, { text: "Second" }, { text: "Third" }],
    }),
    ["1. First", "2. Second", "3. Third"],
  );
  assert.deepEqual(
    describeItemAnswer({
      kind: "fill_in_blank",
      blanks: [
        { id: "b1", accepts: ["liberty", "freedom"] },
        { id: "b2", accepts: [] },
      ],
    }),
    ["b1: liberty / freedom"],
  );
  assert.deepEqual(describeItemAnswer({ kind: "numeric", numericRule: { value: 42, unit: "cm" } }), ["42 cm"]);
  assert.deepEqual(
    describeItemAnswer({ kind: "numeric", numericRule: { mode: "range", min: 1, max: 5, unit: "m" } }),
    ["1–5 m"],
  );
  assert.deepEqual(
    describeItemAnswer({ kind: "numeric", numericRule: { mode: "tolerance", value: 10, tolerance: 1, unit: "kg" } }),
    ["10 ± 1 kg"],
  );
  assert.deepEqual(
    describeItemAnswer({ kind: "numeric", numericRule: { mode: "relative", value: 50, tolerance: 5 } }),
    ["50 ± 5%"],
  );
  assert.deepEqual(describeItemAnswer({ kind: "text", criteria: "Names two examples" }), ["Names two examples"]);
  assert.deepEqual(describeItemAnswer({}), []);
});

test("step availability follows the draft status and readiness", () => {
  const outlined = {
    items: [item()],
  };
  assert.deepEqual(stepAvailability(outlined), {
    source: true,
    plan: true,
    slides: true,
    approve: false,
  });
  assert.equal(stepAvailability(null).plan, false);
  assert.equal(
    stepAvailability({ items: [item({ status: "ready" })] }).approve,
    true,
  );
});

test("subject resolution keeps only the class subjects", () => {
  const subjects = [
    { _id: "s1", name: "English" },
    { _id: "s2", name: "Math" },
    { _id: "s3", name: "Science" },
  ];
  const classItem = { _id: "c1", grade: 5, subjects: [{ subject: "s2" }, { subject: { _id: "s3" } }] };
  assert.deepEqual(
    subjectsForClass(classItem, subjects).map((subject) => subject._id),
    ["s2", "s3"],
  );
  const setup = suggestSetupDefaults(
    { grade: "", subjectText: "" },
    [classItem],
    subjects,
  );
  assert.equal(setup.grade, "Grade 5");
  assert.equal(setup.subjectText, "Math");
  const kept = suggestSetupDefaults(
    { grade: "Grade 4", subjectText: "Science" },
    [classItem],
    subjects,
  );
  assert.equal(kept.grade, "Grade 4");
  assert.equal(kept.subjectText, "Science");
});

test("file validation rejects type, size and overflow", () => {
  const good = { name: "notes.pdf", type: "application/pdf", size: 1024 };
  assert.deepEqual(validateFiles([good], 0).errors, []);
  assert.equal(validateFiles([good], 0).accepted.length, 1);
  assert.equal(
    validateFiles([{ name: "virus.exe", type: "", size: 10 }]).errors[0].key,
    "validation.fileType",
  );
  assert.equal(
    validateFiles([{ name: "big.pdf", type: "application/pdf", size: BUILDER_LIMITS.maxFileBytes + 1 }]).errors[0].key,
    "validation.fileSize",
  );
  assert.equal(validateFiles([good], BUILDER_LIMITS.maxFiles).errors[0].key, "validation.fileCount");
});

test("file types are labelled for the source list", () => {
  assert.deepEqual(fileTypeInfo({ name: "a.pdf" }), { label: "PDF", tone: "pdf" });
  assert.deepEqual(fileTypeInfo({ name: "a.jpg" }), { label: "IMG", tone: "img" });
  assert.deepEqual(fileTypeInfo({ name: "a.docx" }), { label: "DOC", tone: "doc" });
  assert.deepEqual(fileTypeInfo({ name: "a.pptx" }), { label: "PPT", tone: "doc" });
  assert.deepEqual(fileTypeInfo({ name: "a.txt" }), { label: "TXT", tone: "doc" });
});

test("draftFromResponse unwraps the GET draft envelope", () => {
  const draft = { _id: "draft-1", status: "content", items: [] };
  // The service already unwraps data.data, so the page receives { draft }.
  assert.equal(draftFromResponse({ draft }), draft);
  // A regression guard: treating that wrapper as the draft hid every field.
  assert.equal(draftFromResponse(draft), null);
  assert.equal(draftFromResponse(null), null);
});

test("stageFromDraft maps every draft status", () => {
  assert.equal(stageFromDraft(null), "source");
  assert.equal(stageFromDraft({ status: "setup" }), "source");
  assert.equal(stageFromDraft({ status: "outline" }), "plan");
  assert.equal(stageFromDraft({ status: "content" }), "slides");
  assert.equal(stageFromDraft({ status: "approved" }), "approve");
});

test("errorCopy prefers a translated code and falls back to the server sentence", () => {
  const t = (key, options) =>
    key === "errors.REV_CONFLICT" ? "Reload before saving." : options?.defaultValue ?? key;
  assert.equal(
    errorCopy(t, { response: { data: { code: "REV_CONFLICT", message: "English" } } }),
    "Reload before saving.",
  );
  assert.equal(
    errorCopy(t, { response: { data: { code: "UNKNOWN", message: "Server said this" } } }),
    "Server said this",
  );
  assert.equal(errorCopy(t, new Error("Broken")), "Broken");
});

test("total item count is the setup's slide plus question count", () => {
  assert.equal(totalItemCount({ slideCount: 8, questionCount: 5 }), 13);
  assert.equal(totalItemCount({}), 0);
});
