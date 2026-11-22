/**
 * Pure rules for the AI lesson builder wizard. Nothing here touches React or
 * the network, so the same logic can be unit tested and reused by every step.
 */

import { LIVE_QUESTION_KINDS } from "../../../constants/liveLessonQuestionKinds.js";

export const BUILDER_LIMITS = Object.freeze({
  minSlides: 1,
  maxSlides: 50,
  maxQuestions: 50,
  maxItems: 100,
  chunkSize: 5,
  maxSourceChars: 30000,
  maxFiles: 8,
  maxFileBytes: 10 * 1024 * 1024,
  titleMax: 120,
  briefMax: 300,
  regenInstructionMax: 500,
  // Mirrors the server's per-slot edit cap and one-line roles.
  aiSlotChars: 280,
});

export const AI_SINGLE_LINE_ROLES = Object.freeze(["title", "section", "meta"]);

export const SLIDE_TYPES = Object.freeze([
  "opening",
  "goals",
  "content",
  "examples",
  "activity",
  "exit-ticket",
]);

export const QUESTION_KINDS = Object.freeze([...LIVE_QUESTION_KINDS]);

export const LEVELS = Object.freeze(["support", "core", "stretch"]);

// Mirrors the server enum; the server still normalizes every value it receives.
export const GENERATION_MODES = Object.freeze(["high", "low"]);
export const DEFAULT_GENERATION_MODE = "high";
export const DEFAULT_PALETTE = "navy";

export const GRADE_OPTIONS = Object.freeze([
  "Kindergarten",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
  "Grade 11",
  "Grade 12",
]);

export const ALLOWED_FILE_EXTENSIONS = Object.freeze([
  ".pdf",
  ".docx",
  ".pptx",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

export const ALLOWED_FILE_MIME_PREFIXES = Object.freeze([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const QUESTION_KIND_OPTIONS = Object.freeze(
  LIVE_QUESTION_KINDS.map((value) => ({
    value,
    labelKey: `questionKinds.${value}`,
  })),
);

export const SLIDE_TYPE_OPTIONS = Object.freeze([
  { value: "opening", labelKey: "slideTypes.opening" },
  { value: "goals", labelKey: "slideTypes.goals" },
  { value: "content", labelKey: "slideTypes.content" },
  { value: "examples", labelKey: "slideTypes.examples" },
  { value: "activity", labelKey: "slideTypes.activity" },
  { value: "exit-ticket", labelKey: "slideTypes.exit-ticket" },
]);

export const LEVEL_OPTIONS = Object.freeze([
  { value: "support", labelKey: "source.levelSupport" },
  { value: "core", labelKey: "source.levelCore" },
  { value: "stretch", labelKey: "source.levelStretch" },
]);

const clampInteger = (value, min, max, fallback = min) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
};

export const createDefaultSetup = () => ({
  title: "",
  grade: "",
  subjectText: "",
  language: "en",
  level: "core",
  slideCount: 8,
  questionCount: 5,
  questionKinds: ["mcq", "tf"],
  palette: DEFAULT_PALETTE,
  generationMode: DEFAULT_GENERATION_MODE,
  attestationNoStudentData: false,
});

export const draftToSetup = (draft) => {
  const setup = draft?.setup || {};
  return {
    title: setup.title || "",
    grade: setup.grade || "",
    subjectText: setup.subjectText || "",
    language: setup.language === "ar" ? "ar" : "en",
    level: LEVELS.includes(setup.level) ? setup.level : "core",
    slideCount: clampInteger(
      setup.slideCount,
      BUILDER_LIMITS.minSlides,
      BUILDER_LIMITS.maxSlides,
      8,
    ),
    questionCount: clampInteger(
      setup.questionCount,
      0,
      BUILDER_LIMITS.maxQuestions,
      0,
    ),
    questionKinds: Array.isArray(setup.questionKinds) && setup.questionKinds.length
      ? setup.questionKinds.filter((kind) => QUESTION_KINDS.includes(kind))
      : ["mcq"],
    palette: setup.palette === "auto" || (setup.palette && setup.palette !== "")
      ? String(setup.palette)
      : DEFAULT_PALETTE,
    generationMode: GENERATION_MODES.includes(setup.generationMode)
      ? setup.generationMode
      : DEFAULT_GENERATION_MODE,
    attestationNoStudentData: setup.attestation?.noStudentData === true,
  };
};

/** Fields for the multipart create request; every value is a string. */
export const setupFormValues = (setup) => ({
  title: setup.title || "",
  grade: setup.grade || "",
  subjectText: setup.subjectText || "",
  language: setup.language === "ar" ? "ar" : "en",
  level: setup.level || "core",
  slideCount: String(setup.slideCount),
  questionCount: String(setup.questionCount),
  questionKinds: JSON.stringify(setup.questionKinds || []),
  palette: setup.palette || DEFAULT_PALETTE,
  generationMode: setup.generationMode || DEFAULT_GENERATION_MODE,
  attestationNoStudentData: setup.attestationNoStudentData ? "true" : "false",
});

/** JSON body for PATCH /setup, which keeps empty strings instead of dropping them. */
export const setupPatchBody = (setup, version) => ({
  ...setupFormValues(setup),
  slideCount: Number(setup.slideCount),
  questionCount: Number(setup.questionCount),
  questionKinds: setup.questionKinds || [],
  attestationNoStudentData: setup.attestationNoStudentData === true,
  version,
});

export const buildSourceFormData = ({
  setup,
  pastedText,
  files = [],
  suggestTitle = false,
  includeSetup = true,
}) => {
  const formData = new FormData();
  if (includeSetup) {
    const values = setupFormValues(setup);
    Object.entries(values).forEach(([key, value]) => formData.append(key, value));
  }
  if (typeof pastedText === "string") {
    formData.append("pastedText", pastedText);
  }
  if (suggestTitle) formData.append("suggestTitle", "true");
  files.forEach((file) => formData.append("materialFile", file));
  return formData;
};

export const totalItemCount = (setup) =>
  Number(setup.slideCount || 0) + Number(setup.questionCount || 0);

/** First invalid setup rule, as a translation key the caller can show. */
export const validateSetup = (setup) => {
  const slides = Number(setup.slideCount);
  const questions = Number(setup.questionCount);
  if (!Number.isInteger(slides) || slides < BUILDER_LIMITS.minSlides || slides > BUILDER_LIMITS.maxSlides) {
    return "validation.slides";
  }
  if (!Number.isInteger(questions) || questions < 0 || questions > BUILDER_LIMITS.maxQuestions) {
    return "validation.questions";
  }
  if (slides + questions > BUILDER_LIMITS.maxItems) return "validation.items";
  if (!Array.isArray(setup.questionKinds) || !setup.questionKinds.length) {
    return "validation.questionKinds";
  }
  if (String(setup.title || "").length > BUILDER_LIMITS.titleMax) {
    return "validation.title";
  }
  return "";
};

export const sourceStats = ({ draft, pendingFiles = [], pastedText = "" }) => {
  const serverFiles = Array.isArray(draft?.setup?.files)
    ? draft.setup.files.length
    : 0;
  return {
    files: serverFiles + pendingFiles.length,
    characters: draft?.setup?.sourceChars || pastedText.length,
    truncated: draft?.setup?.sourceTruncated === true,
    redactions: draft?.setup?.redactions || { emails: 0, phones: 0 },
  };
};

export const formatNumber = (value, language = "en") => {
  const number = Number(value) || 0;
  try {
    return new Intl.NumberFormat(language || "en").format(number);
  } catch {
    return String(number);
  }
};

/** Costs round up: a 0.2-credit call still consumes one credit. */
export const costCredits = (cents) => {
  const value = Number(cents);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value - 1e-9);
};

export const balanceCredits = (cents) => {
  const value = Number(cents);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value + 1e-9);
};

export const isJustSaved = (savedAt, now = Date.now()) => {
  if (!savedAt) return false;
  const time = savedAt instanceof Date ? savedAt.getTime() : Number(savedAt);
  return Number.isFinite(time) && now - time < 60000;
};

/** GET /lesson-drafts/:id answers { draft }, never the draft itself. */
export const draftFromResponse = (response) => response?.draft || null;

export const stageFromDraft = (draft) => {
  if (!draft) return "source";
  if (draft.status === "approved") return "approve";
  if (draft.status === "content") return "slides";
  if (draft.status === "outline") return "plan";
  return "source";
};

export const outlineCounts = (items = []) => ({
  total: items.length,
  slides: items.filter((item) => item.kind === "slide").length,
  questions: items.filter((item) => item.kind === "question").length,
});

export const questionKindCounts = (items = []) =>
  items.reduce((counts, item) => {
    if (item.kind !== "question") return counts;
    const kind = item.questionKind || "mcq";
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {});

export const progressStats = (items = []) => {
  const ready = items.filter((item) => item.status === "ready").length;
  const failed = items.filter((item) => item.status === "failed").length;
  return {
    total: items.length,
    ready,
    failed,
    remaining: Math.max(0, items.length - ready),
    percent: items.length ? Math.round((ready / items.length) * 100) : 0,
  };
};

export const allItemsReady = (items = []) =>
  items.length > 0 && items.every((item) => item.status === "ready");

export const stepAvailability = (draft) => {
  const hasPlan = Boolean(draft?.items?.length);
  return {
    source: true,
    plan: hasPlan,
    slides: hasPlan,
    approve: hasPlan && allItemsReady(draft.items),
  };
};

/**
 * Next server call, taken from the batch layout the server publishes in
 * `generationPlan` (High = one teaching slide per call, Low = the low batch
 * size, questions in five-item chunks). Items already failed in this run are
 * skipped until retried, and the rest of a half-finished batch goes next.
 */
export const nextGenerationBatch = (draft, attempted = new Set()) => {
  const items = new Map(
    (draft?.items || []).map((item) => [item.itemId, item]),
  );
  for (const batch of draft?.generationPlan || []) {
    const ids = (batch?.itemIds || []).filter((itemId) => {
      const item = items.get(itemId);
      return (
        item &&
        ["outlined", "stale", "failed"].includes(item.status) &&
        !attempted.has(itemId)
      );
    });
    if (ids.length) return ids;
  }
  return [];
};

export const questionLetters = (count) =>
  Array.from({ length: count }, (_, index) =>
    String.fromCharCode(65 + index),
  );

export const countWords = (text) =>
  String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

export const itemStatusKey = (status) => {
  if (status === "ready") return "slides.ready";
  if (status === "failed") return "slides.failed";
  if (status === "stale") return "slides.stale";
  if (status === "generating") return "slides.generating";
  return "slides.waiting";
};

export const typeLabelKey = (item) =>
  item?.kind === "question"
    ? `questionKinds.${item.questionKind || "mcq"}`
    : `slideTypes.${SLIDE_TYPES.includes(item?.slideType) ? item.slideType : "content"}`;

/** The answer key in the teacher's own words, one string per line item. */
export const describeItemAnswer = (question = {}) => {
  const kind = QUESTION_KINDS.includes(question.kind) ? question.kind : "mcq";
  const options = Array.isArray(question.options) ? question.options : [];
  const optionText = (ids) =>
    options
      .filter((option) => ids.includes(String(option.id)))
      .map((option) => option.text)
      .filter(Boolean);
  if (kind === "mcq" || kind === "tf") {
    return optionText([String(question.correctOptionId || "")]);
  }
  if (kind === "multi_select") {
    return optionText((question.correctOptionIds || []).map(String));
  }
  if (kind === "matching") {
    return (question.matchingPairs || [])
      .filter((pair) => pair?.left || pair?.right)
      .map((pair) => `${pair.left} = ${pair.right}`);
  }
  if (kind === "ordering") {
    return (question.orderingItems || [])
      .map((item, index) => (item?.text ? `${index + 1}. ${item.text}` : ""))
      .filter(Boolean);
  }
  if (kind === "fill_in_blank") {
    return (question.blanks || [])
      .map((blank) => {
        const accepts = (blank.accepts || []).filter(Boolean);
        return accepts.length ? `${blank.id}: ${accepts.join(" / ")}` : "";
      })
      .filter(Boolean);
  }
  if (kind === "numeric") {
    const rule = question.numericRule || {};
    const unit = rule.unit ? ` ${rule.unit}` : "";
    if (rule.mode === "range" && rule.min && rule.max) return [`${rule.min}–${rule.max}${unit}`];
    if (rule.mode === "tolerance" && rule.value && rule.tolerance) {
      return [`${rule.value} ± ${rule.tolerance}${unit}`];
    }
    if (rule.mode === "relative" && rule.value && rule.tolerance) {
      return [`${rule.value} ± ${rule.tolerance}%${unit}`];
    }
    return rule.value ? [`${rule.value}${unit}`] : [];
  }
  if (kind === "text") return question.criteria ? [question.criteria] : [];
  return [];
};

export const fileTypeInfo = (file) => {
  const type = String(file?.sourceType || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  const mime = String(file?.mimeType || file?.type || "").toLowerCase();
  if (type === "pdf" || name.endsWith(".pdf") || mime === "application/pdf") {
    return { label: "PDF", tone: "pdf" };
  }
  if (
    type === "image" ||
    /\.(png|jpe?g|webp)$/.test(name) ||
    mime.startsWith("image/")
  ) {
    return { label: "IMG", tone: "img" };
  }
  if (type === "pptx" || name.endsWith(".pptx")) {
    return { label: "PPT", tone: "doc" };
  }
  if (type === "docx" || name.endsWith(".docx")) {
    return { label: "DOC", tone: "doc" };
  }
  return { label: "TXT", tone: "doc" };
};

export const fileSizeLabel = (bytes, language = "en") => {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) {
    return `${formatNumber(Math.round((value / (1024 * 1024)) * 10) / 10, language)} MB`;
  }
  if (value >= 1024) {
    return `${formatNumber(Math.round(value / 1024), language)} KB`;
  }
  return `${formatNumber(value, language)} B`;
};

export const validateFiles = (files = [], existingCount = 0) => {
  const accepted = [];
  const errors = [];
  Array.from(files).forEach((file) => {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    const extension = name.match(/\.[a-z0-9]+$/)?.[0] || "";
    const allowed =
      ALLOWED_FILE_EXTENSIONS.includes(extension) ||
      ALLOWED_FILE_MIME_PREFIXES.some((prefix) => type.startsWith(prefix));
    if (!allowed) {
      errors.push({ key: "validation.fileType", params: { name: file?.name } });
      return;
    }
    if (Number(file?.size) > BUILDER_LIMITS.maxFileBytes) {
      errors.push({ key: "validation.fileSize", params: { name: file?.name } });
      return;
    }
    accepted.push(file);
  });
  const overflow = existingCount + accepted.length - BUILDER_LIMITS.maxFiles;
  if (overflow > 0) {
    errors.push({ key: "validation.fileCount" });
    return { accepted: accepted.slice(0, Math.max(0, accepted.length - overflow)), errors };
  }
  return { accepted, errors };
};

export const subjectsForClass = (classItem, subjects = []) => {
  if (!classItem) return [];
  const ids = (classItem.subjects || [])
    .map((entry) => entry?.subject?._id || entry?.subject || entry)
    .filter(Boolean)
    .map(String);
  if (!ids.length) return [];
  return subjects.filter((subject) => ids.includes(String(subject._id)));
};

/** Fill only blank grade/subject fields from the first class, never overwrite. */
export const suggestSetupDefaults = (setup, classes = [], subjects = []) => {
  if (!classes.length) return setup;
  const firstClass = classes[0];
  const classSubjects = subjectsForClass(firstClass, subjects);
  const grade = setup.grade || (firstClass.grade ? `Grade ${firstClass.grade}` : "");
  const subjectText = setup.subjectText || classSubjects[0]?.name || "";
  if (grade === setup.grade && subjectText === setup.subjectText) return setup;
  return { ...setup, grade, subjectText };
};

export const draftUpdatedLabel = (updatedAt, language = "en", now = Date.now()) => {
  if (!updatedAt) return "";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "";
  const diffMinutes = Math.round((now - date.getTime()) / 60000);
  if (diffMinutes < 1) return null;
  try {
    return new Intl.DateTimeFormat(language || "en", {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
};

export const newOpKey = (prefix) => {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
};

export const errorCode = (error) =>
  String(error?.response?.data?.code || "");

/** Server code first (translated), then its message, then a generic sentence. */
export const errorCopy = (t, error) => {
  const code = errorCode(error);
  if (code) {
    const key = `errors.${code}`;
    const translated = t(key, { defaultValue: "" });
    if (translated && translated !== key) return translated;
  }
  return (
    error?.response?.data?.message ||
    error?.message ||
    t("errors.generic")
  );
};
