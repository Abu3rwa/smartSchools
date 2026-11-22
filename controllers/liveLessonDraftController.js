import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import AiBuilderOperation from "../models/AiBuilderOperation.js";
import AiCreditEntry from "../models/AiCreditEntry.js";
import LiveLesson from "../models/LiveLesson.js";
import LiveLessonDraft from "../models/LiveLessonDraft.js";
import School from "../models/School.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  createLiveLessonDraft,
  deleteFileFromDraft,
  discardDraftSource,
  restoreSourceCopy,
} from "../services/liveLessonBuilderDraftService.js";
import {
  compileDraftItems,
  compileItemToSlide,
} from "../services/liveLessonBuilderCompileService.js";
import {
  requestContent,
  requestPlan,
  requestRegeneratedItem,
} from "../services/liveLessonBuilderAiService.js";
import { quoteForItems, quoteForSetup } from "../services/liveLessonBuilderQuoteService.js";
import {
  admitOperationCredit,
  assertNoActiveOp,
  beginOperation,
  builderError,
  builderUsage,
  expireStaleActiveOp,
  finishOperation,
  hashPayload,
  requireVersion,
  settleOperationCredit,
} from "../services/liveLessonBuilderOperationService.js";
import {
  cleanLine,
  cleanText,
  suggestLessonTitle,
} from "../services/liveLessonBuilderSanitizeService.js";
import {
  extractBuilderDocumentText,
} from "../services/documentTextExtraction.js";
import {
  readDraftSource,
  sourceMetaSnapshot,
} from "../services/liveLessonSourceStore.js";
import {
  LIVE_LESSON_BUILDER,
  LIVE_LESSON_BUILDER_FEATURE,
  LIVE_LESSON_BUILDER_LEVELS,
  LIVE_LESSON_SLIDE_TYPES,
  builderSlideBatchMax,
  isLiveLessonBuilderPlatformEnabled,
  liveLessonBuilderModel,
  normalizeGenerationMode,
} from "../config/liveLessonBuilderConfig.js";
import { normalizeSetupPalette } from "../config/liveLessonPalettes.js";
import { isModelPriced } from "../config/aiPricing.js";
import { markUsageOutcome } from "../services/aiCreditService.js";
import { LIVE_QUESTION_KINDS } from "../constants/liveLessonQuestionKinds.js";
import { assertLiveLessonHtmlSafe } from "../services/liveLessonHtmlSafety.js";
import {
  compileAiSlide,
  listTextSlots,
} from "../services/liveLessonHtmlContractService.js";
import {
  normalizeSlides,
  resolveLessonAssignment,
  validateLessonEdit,
  validateLessonGroupOwnership,
} from "./liveLessonController.js";

const validId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

const toBool = (value) => value === true || value === "true" || value === "on" || value === 1 || value === "1";

const parseKinds = (value) => {
  if (Array.isArray(value)) return value.map((kind) => String(kind)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((kind) => String(kind));
    } catch {
      // A comma list is the other accepted spelling.
    }
    return value.split(",").map((kind) => kind.trim()).filter(Boolean);
  }
  return [];
};

const normalizeKinds = (value, fallback = ["mcq"]) => {
  const kinds = [...new Set(parseKinds(value).filter((kind) => LIVE_QUESTION_KINDS.includes(kind)))];
  return kinds.length ? kinds : fallback;
};

const nextExpiry = () => new Date(Date.now() + LIVE_LESSON_BUILDER.draftTtlMs);

/** Validates the lesson shape every draft must keep, whether it came from the
 * source step or from a later setup edit. */
export const validateDraftSetup = (setup) => {
  const slides = Number(setup?.slideCount);
  const questions = Number(setup?.questionCount);
  if (!Number.isInteger(slides) || slides < LIVE_LESSON_BUILDER.minSlides || slides > LIVE_LESSON_BUILDER.maxSlides) {
    throw builderError(422, "VALIDATION", `Choose ${LIVE_LESSON_BUILDER.minSlides}–${LIVE_LESSON_BUILDER.maxSlides} teaching slides.`);
  }
  if (!Number.isInteger(questions) || questions < 0 || questions > LIVE_LESSON_BUILDER.maxQuestions) {
    throw builderError(422, "VALIDATION", `Choose 0–${LIVE_LESSON_BUILDER.maxQuestions} questions.`);
  }
  if (slides + questions > LIVE_LESSON_BUILDER.maxItems) {
    throw builderError(422, "VALIDATION", `Keep the lesson to ${LIVE_LESSON_BUILDER.maxItems} items or fewer.`);
  }
  if (!Array.isArray(setup?.questionKinds) || !setup.questionKinds.length) {
    throw builderError(422, "VALIDATION", "Choose at least one question type.");
  }
  if (String(setup?.title || "").length > LIVE_LESSON_BUILDER.titleMax) {
    throw builderError(422, "VALIDATION", `The lesson title is limited to ${LIVE_LESSON_BUILDER.titleMax} characters.`);
  }
};

const readSetupInput = (body = {}, { partial = false } = {}) => {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const output = {};
  if (!partial || has("title")) output.title = cleanLine(body.title, LIVE_LESSON_BUILDER.titleMax);
  if (!partial || has("grade")) output.grade = cleanLine(body.grade, 80);
  if (!partial || has("subjectText")) output.subjectText = cleanLine(body.subjectText, 120);
  if (!partial || has("language")) output.language = String(body.language || "").toLowerCase() === "ar" ? "ar" : "en";
  if (!partial || has("level")) {
    output.level = LIVE_LESSON_BUILDER_LEVELS.includes(String(body.level || "")) ? String(body.level) : "";
  }
  if (!partial || has("slideCount")) {
    const slides = Number(body.slideCount);
    output.slideCount = Number.isFinite(slides) ? Math.trunc(slides) : 8;
  }
  if (!partial || has("questionCount")) {
    const questions = Number(body.questionCount);
    output.questionCount = Number.isFinite(questions) ? Math.trunc(questions) : 0;
  }
  if (!partial || has("questionKinds")) output.questionKinds = normalizeKinds(body.questionKinds);
  if (!partial || has("palette")) output.palette = normalizeSetupPalette(body.palette);
  if (!partial || has("generationMode")) output.generationMode = normalizeGenerationMode(body.generationMode);
  if (!partial || has("pastedText")) {
    const pasted = cleanText(body.pastedText, { maxLength: LIVE_LESSON_BUILDER.maxSourceChars });
    output.pastedText = pasted;
  }
  if (!partial || has("attestationNoStudentData")) {
    const confirmed = toBool(body.attestationNoStudentData);
    output.attestation = { noStudentData: confirmed, at: confirmed ? new Date() : null };
  }
  return output;
};

const extractionUsage = (req) => ({
  schoolId: req.schoolId,
  userId: req.user._id,
  feature: LIVE_LESSON_BUILDER_FEATURE,
  refs: {},
  billable: true,
});

const extractIncomingFiles = async (req) => {
  const uploads = Array.isArray(req.files) ? req.files : [];
  const usage = extractionUsage(req);
  const rows = [];
  for (const file of uploads) {
    const extracted = await extractBuilderDocumentText({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      usage: { ...usage, refs: { fileName: String(file.originalname || "").slice(0, 80) } },
      maxChars: LIVE_LESSON_BUILDER.maxSourceChars,
      maxBytes: LIVE_LESSON_BUILDER.maxFileBytes,
    });
    rows.push({
      fileId: randomUUID(),
      name: cleanLine(file.originalname, 200),
      size: file.size,
      mimeType: String(file.mimetype || ""),
      sourceType: extracted.sourceType,
      chars: extracted.text.length,
      truncated: extracted.truncated,
      pageCount: extracted.pageCount || null,
      pages: extracted.pages || null,
      uploadedAt: new Date(),
      text: extracted.text,
    });
  }
  return rows;
};

const bumpDraftExpiry = () => nextExpiry();

const sourceFiles = (draft) => (Array.isArray(draft?.setup?.sourceMeta?.files)
  ? draft.setup.sourceMeta.files.map((file) => (file.toObject ? file.toObject() : file))
  : []);

/** The ordered batches one click walks: slides first, then questions. */
const generationPlanFor = (items, setup) => {
  const slideIds = items.filter((item) => item.kind === "slide").map((item) => item.itemId);
  const questionIds = items.filter((item) => item.kind === "question").map((item) => item.itemId);
  const slideBatch = builderSlideBatchMax(setup?.generationMode);
  const batches = [];
  for (let index = 0; index < slideIds.length; index += slideBatch) {
    batches.push({ kind: "slide", itemIds: slideIds.slice(index, index + slideBatch) });
  }
  for (let index = 0; index < questionIds.length; index += LIVE_LESSON_BUILDER.chunkSize) {
    batches.push({ kind: "question", itemIds: questionIds.slice(index, index + LIVE_LESSON_BUILDER.chunkSize) });
  }
  return batches;
};

const draftView = (draft) => {
  const plain = draft.toObject ? draft.toObject({ virtuals: false }) : { ...draft };
  const rawItems = Array.isArray(plain.items) ? plain.items : [];
  const source = readDraftSource(draft, { require: false });
  // The chip needs metadata only; the text stays in the source store.
  const files = source.files.map((file) => {
    const copy = { ...file };
    delete copy.text;
    return copy;
  });
  const hasSource = source.available && Boolean(source.text.trim());
  const items = rawItems.map((item) => ({
    itemId: item.itemId,
    rev: item.rev,
    kind: item.kind,
    slideType: item.slideType,
    questionKind: item.questionKind || "",
    outline: item.outline,
    content: item.content,
    status: item.status,
    failure: item.failure,
    edited: Boolean(item.edited),
    regenCount: item.regenCount || 0,
    canUndo: Boolean(item.previous),
  }));
  const previewSlides = rawItems.map((item, index) => {
    if (!item.content) return null;
    try {
      return compileItemToSlide({
        item,
        index,
        draftId: String(plain._id),
        language: plain.setup?.language || "en",
        setupPalette: plain.setup?.palette || "",
      });
    } catch {
      return null;
    }
  });
  const ready = items.filter((item) => item.status === "ready").length;
  const failed = items.filter((item) => item.status === "failed").length;
  return {
    _id: plain._id,
    status: plain.status,
    version: plain.version,
    planVersion: plain.planVersion,
    setup: {
      title: plain.setup?.title || "",
      grade: plain.setup?.grade || "",
      subjectText: plain.setup?.subjectText || "",
      language: plain.setup?.language || "en",
      level: plain.setup?.level || "",
      slideCount: plain.setup?.slideCount ?? 0,
      questionCount: plain.setup?.questionCount ?? 0,
      questionKinds: plain.setup?.questionKinds || [],
      palette: normalizeSetupPalette(plain.setup?.palette),
      generationMode: normalizeGenerationMode(plain.setup?.generationMode),
      attestation: {
        noStudentData: plain.setup?.attestation?.noStudentData === true,
        at: plain.setup?.attestation?.at || null,
      },
      hasSource,
      sourceAvailable: source.available,
      sourceHash: String(plain.setup?.sourceMeta?.textHash || ""),
      sourceChars: source.text.length,
      pastedChars: Number(plain.setup?.sourceMeta?.pastedChars) || 0,
      sourceTruncated: source.truncated,
      redactions: source.redactions,
      files,
    },
    items,
    previewSlides,
    progress: {
      total: items.length,
      ready,
      failed,
      pending: items.length - ready - failed,
    },
    generationPlan: generationPlanFor(items, plain.setup),
    activeOp: plain.activeOp || null,
    regenTotal: plain.regenTotal || 0,
    regenLimit: LIVE_LESSON_BUILDER.maxRegensPerItem,
    regenDraftLimit: LIVE_LESSON_BUILDER.maxRegensPerDraft,
    resultLessonId: plain.resultLessonId || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    expiresAt: plain.expiresAt,
  };
};

const loadDraft = async (req, { allowFinal = false } = {}) => {
  if (!validId(req.params.id)) throw builderError(400, "VALIDATION", "Invalid draft id.");
  const draft = await LiveLessonDraft.findOne({
    _id: req.params.id,
    school: req.schoolId,
    ownerId: req.user._id,
  });
  if (!draft) throw builderError(404, "DRAFT_NOT_FOUND", "This draft was not found.");
  await expireStaleActiveOp(draft);
  if (!allowFinal && ["approved", "discarded"].includes(draft.status)) {
    throw builderError(409, "DRAFT_NOT_FOUND", "This draft is already finished.");
  }
  return draft;
};

const creditPayload = (settled) => ({
  chargedCents: settled?.charged ? settled.chargedCents : 0,
  ...(settled?.entryId ? { entryId: settled.entryId } : {}),
});

const markUnusableIfCharged = async (req, opKey) => {
  const entry = await AiCreditEntry.findOne({
    school: req.schoolId,
    operationKey: opKey,
    charged: true,
  }).select("_id").lean();
  if (entry) await markUsageOutcome({ entryId: entry._id, outcome: "unusable" });
};

const findItem = (draft, itemId) => draft.items.find((item) => item.itemId === itemId);

/** Shape checks the UI and the server share before spending any credit. */
export const assertBuilderAvailable = async (req) => {
  if (!isLiveLessonBuilderPlatformEnabled()) {
    throw builderError(404, "FEATURE_DISABLED", "The AI lesson builder is not available on this platform.");
  }
  if (!["teacher", "admin"].includes(String(req.user?.role || ""))) {
    throw builderError(403, "AI_BUILDER_DISABLED", "The AI lesson builder is not available for your role.");
  }
  const school = await School.findById(req.schoolId)
    .select("settings.liveLessonAiBuilder.enabled")
    .lean();
  if (school?.settings?.liveLessonAiBuilder?.enabled !== true) {
    throw builderError(403, "AI_BUILDER_DISABLED", "Your school admin has turned the AI lesson builder off.");
  }
  if (!isModelPriced(liveLessonBuilderModel())) {
    throw builderError(422, "MODEL_UNPRICED", "The AI model has no configured price, so the builder cannot run.");
  }
};

export const requireBuilderEnabled = asyncHandler(async (req, res, next) => {
  await assertBuilderAvailable(req);
  next();
});

export const listDrafts = asyncHandler(async (req, res) => {
  const drafts = await LiveLessonDraft.find({
    school: req.schoolId,
    ownerId: req.user._id,
    status: { $in: ["setup", "outline", "content"] },
  })
    .sort({ updatedAt: -1 })
    .limit(20)
    .select("status version setup.title setup.slideCount setup.questionCount items updatedAt expiresAt")
    .lean();
  return res.json({
    success: true,
    data: {
      drafts: drafts.map((draft) => ({
        _id: draft._id,
        status: draft.status,
        title: draft.setup?.title || "",
        slideCount: draft.setup?.slideCount || 0,
        questionCount: draft.setup?.questionCount || 0,
        readyCount: (draft.items || []).filter((item) => item.status === "ready").length,
        itemCount: (draft.items || []).length,
        updatedAt: draft.updatedAt,
        expiresAt: draft.expiresAt,
      })),
    },
  });
});

export const createDraft = asyncHandler(async (req, res) => {
  const setupInput = readSetupInput(req.body, { partial: false });
  const uploads = Array.isArray(req.files) ? req.files : [];
  if (!uploads.length && !String(setupInput.pastedText || "").trim()) {
    throw builderError(422, "VALIDATION", "Add a document or paste the lesson material before continuing.");
  }
  if (uploads.length > LIVE_LESSON_BUILDER.maxFiles) {
    throw builderError(422, "VALIDATION", `Upload at most ${LIVE_LESSON_BUILDER.maxFiles} files.`);
  }
  const files = await extractIncomingFiles(req);
  const draft = await createLiveLessonDraft({
    schoolId: req.schoolId,
    ownerId: req.user._id,
    setup: setupInput,
    files,
  });
  const source = readDraftSource(draft);
  const suggestedTitle = toBool(req.body?.suggestTitle) || !draft.setup.title
    ? suggestLessonTitle(source.text, { maxLength: LIVE_LESSON_BUILDER.titleMax })
    : "";
  if (!draft.setup.title && suggestedTitle) {
    draft.setup.title = suggestedTitle;
    await draft.save();
  }
  return res.status(201).json({
    success: true,
    data: { draft: draftView(draft), suggestedTitle },
  });
});

export const getDraft = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req, { allowFinal: true });
  return res.json({ success: true, data: { draft: draftView(draft) } });
});

export const getDraftSource = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  const source = readDraftSource(draft);
  return res.json({
    success: true,
    data: {
      text: source.text,
      pastedText: source.pastedText,
      textHash: source.hash,
      files: source.files,
      truncated: source.truncated,
      redactions: source.redactions,
    },
  });
});

/**
 * The browser keeps a copy of the extracted text; after the API restarts this
 * puts it back into the in-process store. Nothing is written to the draft.
 */
export const restoreDraftSource = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  assertNoActiveOp(draft);
  const result = restoreSourceCopy({
    draft,
    files: req.body?.files,
    pastedText: req.body?.pastedText,
  });
  return res.json({ success: true, data: result });
});

export const appendDraftSource = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  if (draft.status !== "setup" || draft.items.length) {
    throw builderError(409, "SOURCE_LOCKED", "The plan is already built from this material. Start a new draft to change the source.");
  }
  assertNoActiveOp(draft);
  const uploads = Array.isArray(req.files) ? req.files : [];
  if (!uploads.length && !Object.prototype.hasOwnProperty.call(req.body || {}, "pastedText")) {
    throw builderError(422, "VALIDATION", "Choose a file or paste text to add.");
  }
  const existing = sourceFiles(draft);
  if (existing.length + uploads.length > LIVE_LESSON_BUILDER.maxFiles) {
    throw builderError(422, "VALIDATION", `Upload at most ${LIVE_LESSON_BUILDER.maxFiles} files.`);
  }
  const added = await extractIncomingFiles(req);
  const updated = await createLiveLessonDraft({
    schoolId: req.schoolId,
    ownerId: req.user._id,
    draft,
    setup: req.body?.pastedText !== undefined
      ? { pastedText: cleanText(req.body.pastedText, { maxLength: LIVE_LESSON_BUILDER.maxSourceChars }) }
      : {},
    files: added,
    merge: true,
  });
  const suggestedTitle = toBool(req.body?.suggestTitle) || !updated.setup.title
    ? suggestLessonTitle(readDraftSource(updated).text, { maxLength: LIVE_LESSON_BUILDER.titleMax })
    : "";
  if (!updated.setup.title && suggestedTitle) {
    updated.setup.title = suggestedTitle;
    await updated.save();
  }
  return res.json({ success: true, data: { draft: draftView(updated), suggestedTitle } });
});

export const removeDraftSourceFile = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  if (draft.status !== "setup" || draft.items.length) {
    throw builderError(409, "SOURCE_LOCKED", "The plan is already built from this material.");
  }
  assertNoActiveOp(draft);
  const file = sourceFiles(draft).find((row) => row.fileId === req.params.fileId);
  if (!file) throw builderError(404, "DRAFT_NOT_FOUND", "That file is not part of this draft.");
  const updated = await deleteFileFromDraft({ draft, fileId: req.params.fileId });
  return res.json({ success: true, data: { draft: draftView(updated) } });
});

export const suggestDraftTitle = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  return res.json({
    success: true,
    data: {
      title: suggestLessonTitle(readDraftSource(draft).text, { maxLength: LIVE_LESSON_BUILDER.titleMax }),
    },
  });
});

export const updateDraftSetup = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  assertNoActiveOp(draft);
  requireVersion(req, draft);
  if (draft.items.length || draft.status !== "setup") {
    throw builderError(
      409,
      "OPERATION_IN_PROGRESS",
      "The plan is already built. Regenerate the plan to change these options.",
    );
  }
  const updates = readSetupInput(req.body, { partial: true });
  const merged = {
    ...draft.setup.toObject(),
    ...updates,
    attestation: updates.attestation || draft.setup.attestation?.toObject() || { noStudentData: false, at: null },
  };
  validateDraftSetup(merged);
  const updated = await createLiveLessonDraft({
    schoolId: req.schoolId,
    ownerId: req.user._id,
    draft,
    setup: updates,
    merge: true,
    version: draft.version,
  });
  return res.json({ success: true, data: { draft: draftView(updated) } });
});

export const quoteDraft = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req, { allowFinal: true });
  const setup = { ...draft.setup.toObject(), ...readSetupInput(req.body, { partial: true }) };
  const source = readDraftSource(draft, { require: false });
  const quote = await quoteForSetup(setup, {
    sourceChars: Number(draft.setup?.sourceMeta?.chars) || source.text.length,
    sourceHash: source.hash,
  });
  return res.json({ success: true, data: { quote } });
});

export const generateDraftPlan = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  assertNoActiveOp(draft);
  requireVersion(req, draft);
  if (draft.setup?.attestation?.noStudentData !== true) {
    throw builderError(422, "ATTESTATION_REQUIRED", "Confirm that the material contains no student personal information.");
  }
  if (!String(draft.setup?.title || "").trim()) {
    throw builderError(422, "VALIDATION", "Give the lesson a title before generating the plan.");
  }
  validateDraftSetup(draft.setup);
  if (draft.items.length && req.body?.confirmReplace !== true) {
    throw builderError(409, "PLAN_EXISTS", "Generating a new plan replaces the current one. Confirm to continue.");
  }
  const source = readDraftSource(draft);
  const quote = await quoteForSetup(draft.setup, { sourceChars: source.text.length, sourceHash: source.hash });

  const opKey = String(req.body?.opKey || "");
  const setup = draft.setup.toObject();
  const { op, replay } = await beginOperation({
    draft,
    type: "plan",
    opKey,
    payloadHash: hashPayload({
      type: "plan",
      title: setup.title,
      slideCount: setup.slideCount,
      questionCount: setup.questionCount,
      questionKinds: setup.questionKinds,
      source: source.hash,
    }),
    version: draft.version,
  });
  if (replay) {
    const fresh = await LiveLessonDraft.findById(draft._id);
    return res.json({
      success: true,
      data: { draft: draftView(fresh), op: { status: op.status, errorCode: op.errorCode || "" }, replay: true },
    });
  }

  try {
    await admitOperationCredit({ draft, op, quotedCents: quote.plan.chargedCents });
    const result = await requestPlan({
      setup,
      sourceText: source.text,
      usage: builderUsage({ schoolId: req.schoolId, userId: req.user._id, opKey }),
    });
    const items = result.items.map((item) => ({
      itemId: item.itemId,
      rev: 0,
      kind: item.kind,
      slideType: item.kind === "question" ? "question" : item.slideType,
      questionKind: item.questionKind || "",
      outline: item.outline,
      content: null,
      status: "outlined",
      failure: null,
      previous: null,
      edited: false,
      regenCount: 0,
    }));
    const updated = await LiveLessonDraft.findOneAndUpdate(
      {
        _id: draft._id,
        school: req.schoolId,
        ownerId: req.user._id,
        version: draft.version,
        "activeOp.opKey": opKey,
        status: { $in: ["setup", "outline", "content"] },
      },
      {
        $set: {
          items,
          status: "outline",
          planVersion: Number(draft.planVersion || 0) + 1,
          expiresAt: bumpDraftExpiry(),
        },
        $inc: { version: 1 },
      },
      { new: true },
    );
    if (!updated) throw builderError(409, "VERSION_CONFLICT", "The draft changed while the plan was being written. Reload and try again.");
    await finishOperation({ draftId: draft._id, opKey, status: "succeeded" });
    const settled = await settleOperationCredit({ draftId: draft._id, opKey });
    return res.json({
      success: true,
      data: { draft: draftView(updated), credit: creditPayload(settled), retried: result.retried === true },
    });
  } catch (error) {
    await finishOperation({
      draftId: draft._id,
      opKey,
      status: "failed",
      errorCode: error?.code || "AI_FAILED",
    });
    await settleOperationCredit({ draftId: draft._id, opKey });
    if (["AI_JSON_INVALID", "PLAN_INVALID", "PLAN_COUNT_MISMATCH"].includes(error?.code)) {
      await markUnusableIfCharged(req, opKey);
    }
    throw error;
  }
});

const allowedGenerateStatuses = new Set(["outlined", "stale", "failed"]);

export const generateDraftContent = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  assertNoActiveOp(draft);
  requireVersion(req, draft);
  const itemIds = Array.isArray(req.body?.itemIds) ? [...new Set(req.body.itemIds.map(String))] : [];
  if (!itemIds.length) {
    throw builderError(422, "VALIDATION", "Choose the items to generate.");
  }
  const items = itemIds.map((itemId) => findItem(draft, itemId));
  if (items.some((item) => !item)) throw builderError(404, "DRAFT_NOT_FOUND", "One of those items is no longer in the draft.");
  if (new Set(items.map((item) => item.kind)).size > 1) {
    throw builderError(422, "VALIDATION", "Generate slides and questions in separate steps.");
  }
  // A teaching slide is a whole HTML page: one per call in High mode, up to the
  // low batch size in Low mode. Questions keep their five-per-call chunk.
  const isQuestion = items[0]?.kind === "question";
  const batchMax = isQuestion ? LIVE_LESSON_BUILDER.chunkSize : builderSlideBatchMax(draft.setup?.generationMode);
  if (itemIds.length > batchMax) {
    throw builderError(422, "VALIDATION", `Generate at most ${batchMax} ${isQuestion ? "questions" : "teaching slides"} at a time.`);
  }
  if (items.some((item) => !allowedGenerateStatuses.has(item.status))) {
    throw builderError(409, "ITEMS_NOT_READY", "Those items already have content. Use Regenerate to change them.");
  }
  const source = readDraftSource(draft);
  // Admission covers the work still left in this run, not only the batch in
  // hand: a lesson that starts is affordable to the end. The estimate is
  // released down to what the calls actually used when each step settles.
  const pendingCount = draft.items.filter(
    (item) => (item.kind === "question") === isQuestion && allowedGenerateStatuses.has(item.status),
  ).length;
  const stepQuote = await quoteForItems(draft.setup, {
    slides: isQuestion ? 0 : pendingCount,
    questions: isQuestion ? pendingCount : 0,
    sourceChars: source.text.length,
    sourceHash: source.hash,
  });
  const admittedCents = stepQuote.content.chargedCents + stepQuote.repair.chargedCents;

  const opKey = String(req.body?.opKey || "");
  const setup = draft.setup.toObject();
  const { op, replay } = await beginOperation({
    draft,
    type: "generate",
    opKey,
    payloadHash: hashPayload({
      type: "generate",
      itemIds,
      revs: items.map((item) => item.rev),
      source: source.hash,
      palette: setup.palette || "",
      generationMode: setup.generationMode || "",
    }),
    itemIds,
    version: draft.version,
  });
  if (replay) {
    const fresh = await LiveLessonDraft.findById(draft._id);
    return res.json({
      success: true,
      data: {
        draft: draftView(fresh),
        results: [],
        op: { status: op.status, errorCode: op.errorCode || "" },
        replay: true,
      },
    });
  }

  try {
    await admitOperationCredit({ draft, op, quotedCents: admittedCents });
    const plainItems = items.map((item) => (item.toObject ? item.toObject() : item));
    const result = await requestContent({
      setup,
      sourceText: source.text,
      items: plainItems,
      draftId: String(draft._id),
      usage: builderUsage({ schoolId: req.schoolId, userId: req.user._id, opKey }),
    });

    const results = [];
    for (const entry of result.results) {
      const base = items.find((item) => item.itemId === entry.itemId);
      if (!base) continue;
      if (entry.ok) {
        const written = await LiveLessonDraft.updateOne(
          {
            _id: draft._id,
            school: req.schoolId,
            ownerId: req.user._id,
            "activeOp.opKey": opKey,
            items: { $elemMatch: { itemId: entry.itemId, rev: base.rev } },
          },
          {
            $set: {
              "items.$.content": entry.content,
              "items.$.status": "ready",
              "items.$.failure": null,
            },
            $inc: { "items.$.rev": 1 },
          },
        );
        results.push({
          itemId: entry.itemId,
          ok: written.modifiedCount === 1,
          code: written.modifiedCount === 1 ? "" : "ITEM_EDITED",
        });
      } else {
        await LiveLessonDraft.updateOne(
          {
            _id: draft._id,
            school: req.schoolId,
            ownerId: req.user._id,
            "activeOp.opKey": opKey,
            items: { $elemMatch: { itemId: entry.itemId, rev: base.rev } },
          },
          {
            $set: {
              "items.$.status": "failed",
              "items.$.failure": { code: entry.code, message: entry.message },
            },
          },
        );
        results.push({ itemId: entry.itemId, ok: false, code: entry.code, message: entry.message });
      }
    }

    const saved = await LiveLessonDraft.findOne({ _id: draft._id });
    const ready = saved.items.some((item) => item.status === "ready");
    if (ready && saved.status === "outline") {
      await LiveLessonDraft.updateOne({ _id: draft._id, status: "outline" }, { $set: { status: "content" } });
      saved.status = "content";
    }
    const okCount = results.filter((row) => row.ok).length;
    const status = okCount === results.length ? "succeeded" : okCount > 0 ? "partial" : "failed";
    await finishOperation({
      draftId: draft._id,
      opKey,
      status,
      errorCode: status === "failed" ? "CONTENT_INVALID" : "",
      itemFailures: results.filter((row) => !row.ok).map((row) => ({ itemId: row.itemId, code: row.code })),
    });
    const settled = await settleOperationCredit({ draftId: draft._id, opKey });
    return res.json({
      success: true,
      data: {
        draft: draftView(saved),
        results,
        credit: creditPayload(settled),
        retried: result.retried === true,
      },
    });
  } catch (error) {
    await finishOperation({
      draftId: draft._id,
      opKey,
      status: "failed",
      errorCode: error?.code || "AI_FAILED",
    });
    await settleOperationCredit({ draftId: draft._id, opKey });
    if (["AI_JSON_INVALID", "CONTENT_INVALID"].includes(error?.code)) {
      await markUnusableIfCharged(req, opKey);
    }
    throw error;
  }
});

export const regenerateDraftItem = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  assertNoActiveOp(draft);
  const item = findItem(draft, req.params.itemId);
  if (!item) throw builderError(404, "DRAFT_NOT_FOUND", "That item is no longer in the draft.");
  if (!["ready", "failed", "stale"].includes(item.status)) {
    throw builderError(409, "ITEMS_NOT_READY", "Generate this item before regenerating it.");
  }
  if (Number(item.regenCount || 0) >= LIVE_LESSON_BUILDER.maxRegensPerItem) {
    throw builderError(429, "REGEN_LIMIT", `Each item can be regenerated ${LIVE_LESSON_BUILDER.maxRegensPerItem} times.`);
  }
  if (Number(draft.regenTotal || 0) >= LIVE_LESSON_BUILDER.maxRegensPerDraft) {
    throw builderError(429, "REGEN_LIMIT", `This draft can be regenerated ${LIVE_LESSON_BUILDER.maxRegensPerDraft} times in total.`);
  }
  const instruction = cleanText(req.body?.instruction, { maxLength: LIVE_LESSON_BUILDER.regenInstructionMax });
  const presets = (Array.isArray(req.body?.presets) ? req.body.presets : [])
    .map((preset) => cleanLine(preset, 80))
    .filter(Boolean)
    .slice(0, 5);
  if (!instruction && !presets.length) {
    throw builderError(422, "VALIDATION", "Say what to change, or choose a suggestion.");
  }
  const source = readDraftSource(draft);
  const quote = await quoteForSetup(draft.setup, { sourceChars: source.text.length, sourceHash: source.hash });
  const opKey = String(req.body?.opKey || "");
  const setup = draft.setup.toObject();
  const plainItem = item.toObject ? item.toObject() : item;
  const { op, replay } = await beginOperation({
    draft,
    type: "regenerate",
    opKey,
    payloadHash: hashPayload({
      type: "regenerate",
      itemId: item.itemId,
      rev: item.rev,
      instruction,
      presets,
      keepText: toBool(req.body?.keepText),
      palette: setup.palette || "",
      generationMode: setup.generationMode || "",
      source: source.hash,
    }),
    itemIds: [item.itemId],
    version: draft.version,
  });
  if (replay) {
    const fresh = await LiveLessonDraft.findById(draft._id);
    return res.json({
      success: true,
      data: { draft: draftView(fresh), op: { status: op.status, errorCode: op.errorCode || "" }, replay: true },
    });
  }
  try {
    await admitOperationCredit({ draft, op, quotedCents: quote.regenerate.chargedCents });
    const index = draft.items.findIndex((row) => row.itemId === item.itemId);
    const result = await requestRegeneratedItem({
      setup,
      sourceText: source.text,
      item: plainItem,
      instruction,
      presets,
      keepText: toBool(req.body?.keepText),
      draftId: String(draft._id),
      index,
      usage: builderUsage({ schoolId: req.schoolId, userId: req.user._id, opKey }),
    });
    const written = await LiveLessonDraft.updateOne(
      {
        _id: draft._id,
        school: req.schoolId,
        ownerId: req.user._id,
        "activeOp.opKey": opKey,
        items: { $elemMatch: { itemId: item.itemId, rev: item.rev } },
      },
      {
        $set: {
          "items.$.content": result.content,
          "items.$.status": "ready",
          "items.$.failure": null,
          "items.$.previous": { content: item.content, rev: item.rev },
          "items.$.edited": false,
        },
        $inc: { "items.$.rev": 1, "items.$.regenCount": 1, regenTotal: 1 },
      },
    );
    if (!written.modifiedCount) throw builderError(409, "REV_CONFLICT", "This item changed while it was being rewritten. Reload and try again.");
    const saved = await LiveLessonDraft.findOne({ _id: draft._id });
    await finishOperation({ draftId: draft._id, opKey, status: "succeeded" });
    const settled = await settleOperationCredit({ draftId: draft._id, opKey });
    return res.json({
      success: true,
      data: { draft: draftView(saved), credit: creditPayload(settled) },
    });
  } catch (error) {
    await finishOperation({
      draftId: draft._id,
      opKey,
      status: "failed",
      errorCode: error?.code || "AI_FAILED",
    });
    await settleOperationCredit({ draftId: draft._id, opKey });
    if (["AI_JSON_INVALID", "CONTENT_INVALID", "LANGUAGE_MISMATCH"].includes(error?.code)) {
      await markUnusableIfCharged(req, opKey);
    }
    throw error;
  }
});

export const undoDraftItem = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  assertNoActiveOp(draft);
  const item = findItem(draft, req.params.itemId);
  if (!item) throw builderError(404, "DRAFT_NOT_FOUND", "That item is no longer in the draft.");
  if (!item.previous?.content) throw builderError(422, "VALIDATION", "There is nothing to undo for this item.");
  const previous = item.previous.toObject ? item.previous.toObject() : item.previous;
  const written = await LiveLessonDraft.updateOne(
    {
      _id: draft._id,
      school: req.schoolId,
      ownerId: req.user._id,
      activeOp: null,
      items: { $elemMatch: { itemId: item.itemId, rev: item.rev } },
    },
    {
      $set: {
        "items.$.content": previous.content,
        "items.$.previous": { content: item.content, rev: item.rev },
        "items.$.status": "ready",
        "items.$.failure": null,
      },
      $inc: { "items.$.rev": 1 },
    },
  );
  if (!written.modifiedCount) throw builderError(409, "REV_CONFLICT", "This item changed in another tab. Reload and try again.");
  const saved = await LiveLessonDraft.findById(draft._id);
  return res.json({ success: true, data: { draft: draftView(saved) } });
});

const contentFromSlide = (slide, item) => {
  if (item.kind === "question") {
    const evidence = item.content?.evidence || "";
    return { question: slide.question, evidence };
  }
  const stored = item.content || {};
  const content = {
    title: slide.title,
    body: slide.body,
    examples: slide.examples,
    speakerNotes: slide.speakerNotes,
  };
  // The design (layout + blocks) belongs to the AI generation. A teacher who
  // only changed notes or evidence keeps it; once the text changes the renderer
  // derives a fresh layout from the new plain text so stale wording cannot
  // survive inside the stored blocks.
  const textUnchanged = slide.title === stored.title
    && slide.body === stored.body
    && JSON.stringify(slide.examples || []) === JSON.stringify(stored.examples || []);
  if (textUnchanged && stored.blocks) content.blocks = stored.blocks;
  if (textUnchanged && stored.layout) content.layout = stored.layout;
  return content;
};

export const updateDraftItemContent = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  assertNoActiveOp(draft);
  const item = findItem(draft, req.params.itemId);
  if (!item) throw builderError(404, "DRAFT_NOT_FOUND", "That item is no longer in the draft.");
  const rev = Number(req.body?.rev);
  if (!Number.isInteger(rev) || rev !== Number(item.rev)) {
    throw builderError(409, "REV_CONFLICT", "This item changed in another tab. Reload before saving your edit.");
  }
  const index = draft.items.findIndex((row) => row.itemId === item.itemId);
  const candidate = {
    ...(item.toObject ? item.toObject() : item),
    content: req.body?.content ?? item.content,
  };
  const slide = compileItemToSlide({
    item: candidate,
    index,
    draftId: String(draft._id),
    language: draft.setup?.language || "en",
    setupPalette: draft.setup?.palette || "",
  });
  if (!slide) throw builderError(422, "CONTENT_INVALID", "The item content is not valid.");
  if (item.kind === "slide" && !slide.title) {
    throw builderError(422, "CONTENT_INVALID", "A slide needs a title.");
  }
  if (item.kind === "slide" && (item.slideType === "examples" ? slide.examples.length < 2 : !String(slide.body || "").trim())) {
    throw builderError(422, "CONTENT_INVALID", "A slide needs body text, and an examples slide needs at least two examples.");
  }
  if (item.kind === "question" && !slide.question) {
    throw builderError(422, "CONTENT_INVALID", "A question needs a question body.");
  }
  const content = contentFromSlide(slide, item);
  const written = await LiveLessonDraft.updateOne(
    {
      _id: draft._id,
      school: req.schoolId,
      ownerId: req.user._id,
      activeOp: null,
      items: { $elemMatch: { itemId: item.itemId, rev } },
    },
    {
      $set: {
        "items.$.content": content,
        "items.$.status": "ready",
        "items.$.failure": null,
        "items.$.edited": true,
        "items.$.previous": { content: item.content, rev },
      },
      $inc: { "items.$.rev": 1 },
    },
  );
  if (!written.modifiedCount) throw builderError(409, "REV_CONFLICT", "This item changed in another tab. Reload before saving your edit.");
  const saved = await LiveLessonDraft.findById(draft._id);
  return res.json({ success: true, data: { draft: draftView(saved) } });
});

/**
 * Visual text editing for a generated teaching slide. The fragment, palette and
 * design stay untouched; only the text map changes, so the page is rebuilt
 * deterministically with no model call and no charge.
 */
export const updateDraftItemTexts = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  assertNoActiveOp(draft);
  const item = findItem(draft, req.params.itemId);
  if (!item) throw builderError(404, "DRAFT_NOT_FOUND", "That item is no longer in the draft.");
  const stored = item.content && typeof item.content === "object"
    ? (item.content.toObject ? item.content.toObject() : item.content)
    : null;
  if (item.kind !== "slide" || stored?.aiHtml !== true || !String(stored.fragment || "").trim()) {
    throw builderError(422, "CONTENT_INVALID", "This slide is not an editable HTML slide.");
  }
  const rev = Number(req.body?.rev);
  if (!Number.isInteger(rev) || rev !== Number(item.rev)) {
    throw builderError(409, "REV_CONFLICT", "This item changed in another tab. Reload before saving your edit.");
  }
  const incoming = req.body?.texts;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    throw builderError(422, "VALIDATION", "Send the edited slide text.");
  }
  const texts = { ...(stored.texts || {}) };
  for (const [slotId, value] of Object.entries(incoming)) {
    if (typeof value !== "string") {
      throw builderError(422, "VALIDATION", "Every slide text value must be a string.");
    }
    if ([...value].length > LIVE_LESSON_BUILDER.aiSlideSlotChars) {
      throw builderError(
        422,
        "VALIDATION",
        `Each slide text field is limited to ${LIVE_LESSON_BUILDER.aiSlideSlotChars} characters.`,
      );
    }
    texts[slotId] = value;
  }
  const compiled = compileAiSlide({
    html: stored.fragment,
    texts,
    speakerNotes: stored.speakerNotes,
    palette: stored.palette,
    language: draft.setup?.language || "en",
  });
  if (!compiled.ok) {
    throw builderError(
      422,
      "CONTENT_INVALID",
      compiled.violations[0] || "The slide text is not valid.",
    );
  }
  const slots = listTextSlots(compiled.fragment);
  const titleSlot = slots.find((slot) => slot.role === "title");
  const content = {
    ...stored,
    title: cleanLine(compiled.texts[titleSlot?.id] || stored.title, LIVE_LESSON_BUILDER.titleMax),
    html: compiled.html,
    fragment: compiled.fragment,
    texts: compiled.texts,
    slots,
    speakerNotes: compiled.speakerNotes,
    aiHtml: true,
  };
  const written = await LiveLessonDraft.updateOne(
    {
      _id: draft._id,
      school: req.schoolId,
      ownerId: req.user._id,
      activeOp: null,
      items: { $elemMatch: { itemId: item.itemId, rev } },
    },
    {
      $set: {
        "items.$.content": content,
        "items.$.status": "ready",
        "items.$.failure": null,
        "items.$.edited": true,
        "items.$.previous": { content: item.content, rev },
      },
      $inc: { "items.$.rev": 1 },
    },
  );
  if (!written.modifiedCount) throw builderError(409, "REV_CONFLICT", "This item changed in another tab. Reload before saving your edit.");
  const saved = await LiveLessonDraft.findById(draft._id);
  return res.json({ success: true, data: { draft: draftView(saved) } });
});

const applyStructureOps = (items, ops) => {
  const next = items.map((item) => ({ ...item, outline: { ...(item.outline || {}) } }));
  const touched = new Set();
  ops.forEach((operation) => {
    const type = String(operation?.op || "");
    if (type === "move") {
      const from = next.findIndex((item) => item.itemId === operation.itemId);
      if (from < 0) throw builderError(422, "VALIDATION", "One moved item is no longer in the draft.");
      const [row] = next.splice(from, 1);
      const to = Math.max(0, Math.min(next.length, Number(operation.toIndex) || 0));
      next.splice(to, 0, row);
      return;
    }
    if (type === "delete") {
      const at = next.findIndex((item) => item.itemId === operation.itemId);
      if (at < 0) throw builderError(422, "VALIDATION", "One deleted item is no longer in the draft.");
      next.splice(at, 1);
      return;
    }
    if (type === "add") {
      const kind = operation.kind === "question" ? "question" : "slide";
      const slideType = kind === "question"
        ? "question"
        : LIVE_LESSON_SLIDE_TYPES.includes(String(operation.slideType || "")) ? String(operation.slideType) : "content";
      const questionKind = kind === "question"
        ? LIVE_QUESTION_KINDS.includes(String(operation.questionKind || "")) ? String(operation.questionKind) : "mcq"
        : "";
      const title = cleanLine(operation.title || operation.outline?.title, LIVE_LESSON_BUILDER.titleMax);
      if (!title) throw builderError(422, "VALIDATION", "A new item needs a title.");
      const row = {
        itemId: randomUUID(),
        rev: 0,
        kind,
        slideType,
        questionKind,
        outline: {
          title,
          brief: cleanLine(operation.brief || operation.outline?.brief, LIVE_LESSON_BUILDER.briefMax),
        },
        content: null,
        status: "outlined",
        failure: null,
        previous: null,
        edited: false,
        regenCount: 0,
      };
      const at = Math.max(0, Math.min(next.length, Number(operation.toIndex) || next.length));
      next.splice(at, 0, row);
      touched.add(row.itemId);
      return;
    }
    if (type === "retitle") {
      const row = next.find((item) => item.itemId === operation.itemId);
      if (!row) throw builderError(422, "VALIDATION", "One edited item is no longer in the draft.");
      const title = cleanLine(operation.title, LIVE_LESSON_BUILDER.titleMax);
      if (!title) throw builderError(422, "VALIDATION", "An item title cannot be empty.");
      row.outline.title = title;
      if (operation.brief !== undefined) {
        row.outline.brief = cleanLine(operation.brief, LIVE_LESSON_BUILDER.briefMax);
      }
      return;
    }
    if (type === "retype") {
      const row = next.find((item) => item.itemId === operation.itemId);
      if (!row) throw builderError(422, "VALIDATION", "One edited item is no longer in the draft.");
      if (row.kind === "slide") {
        if (!LIVE_LESSON_SLIDE_TYPES.includes(String(operation.slideType || ""))) {
          throw builderError(422, "VALIDATION", "Choose a supported slide type.");
        }
        row.slideType = String(operation.slideType);
      } else {
        if (!LIVE_QUESTION_KINDS.includes(String(operation.questionKind || ""))) {
          throw builderError(422, "VALIDATION", "Choose a supported question type.");
        }
        row.questionKind = String(operation.questionKind);
      }
      if (row.content) row.status = "stale";
      touched.add(row.itemId);
      return;
    }
    throw builderError(422, "VALIDATION", "Unsupported item change.");
  });
  return { items: next, touched };
};

export const updateDraftItems = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req);
  assertNoActiveOp(draft);
  requireVersion(req, draft);
  if (!Array.isArray(req.body?.ops) || !req.body.ops.length) {
    throw builderError(422, "VALIDATION", "Send the item changes to save.");
  }
  if (!draft.items.length) throw builderError(409, "PLAN_REQUIRED", "Generate the plan before editing its items.");
  const plainItems = draft.items.map((item) => (item.toObject ? item.toObject() : item));
  const { items } = applyStructureOps(plainItems, req.body.ops);
  const counts = {
    slides: items.filter((item) => item.kind === "slide").length,
    questions: items.filter((item) => item.kind === "question").length,
  };
  if (counts.slides < LIVE_LESSON_BUILDER.minSlides) {
    throw builderError(422, "VALIDATION", "A lesson needs at least one teaching slide.");
  }
  if (counts.slides > LIVE_LESSON_BUILDER.maxSlides || counts.questions > LIVE_LESSON_BUILDER.maxQuestions
    || items.length > LIVE_LESSON_BUILDER.maxItems) {
    throw builderError(422, "LIMIT_EXCEEDED", `Keep the lesson to ${LIVE_LESSON_BUILDER.maxSlides} slides, ${LIVE_LESSON_BUILDER.maxQuestions} questions and ${LIVE_LESSON_BUILDER.maxItems} items.`);
  }
  // Positions changed, so question order (and its salt) changed: content is
  // still valid, but a question's saved order is decided at approval.
  const updated = await LiveLessonDraft.findOneAndUpdate(
    {
      _id: draft._id,
      school: req.schoolId,
      ownerId: req.user._id,
      version: draft.version,
      activeOp: null,
    },
    {
      $set: {
        items,
        status: items.some((item) => item.status === "ready") ? "content" : "outline",
        expiresAt: bumpDraftExpiry(),
      },
      $inc: { version: 1 },
    },
    { new: true },
  );
  if (!updated) throw builderError(409, "VERSION_CONFLICT", "The draft changed in another tab. Reload before saving.");
  return res.json({ success: true, data: { draft: draftView(updated) } });
});

export const cancelDraftOperation = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req, { allowFinal: true });
  const opKey = String(req.params.opKey || "");
  const op = await AiBuilderOperation.findOne({ draftId: draft._id, opKey }).lean();
  if (!op || op.status !== "running") {
    return res.json({ success: true, data: { stopped: true, alreadyFinished: true } });
  }
  if (op.lockExpiresAt && new Date(op.lockExpiresAt).getTime() < Date.now()) {
    await expireStaleActiveOp(draft);
    await AiBuilderOperation.updateOne(
      { _id: op._id, status: "running" },
      { $set: { status: "cancelled", completedAt: new Date() } },
    );
    return res.json({ success: true, data: { stopped: true } });
  }
  await LiveLessonDraft.updateOne(
    { _id: draft._id, "activeOp.opKey": opKey },
    { $set: { "activeOp.cancelRequested": true } },
  );
  return res.json({ success: true, data: { stopped: false, pending: true } });
});

export const discardDraft = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req, { allowFinal: true });
  if (draft.status === "approved") {
    throw builderError(409, "VALIDATION", "This draft is already saved as a lesson. Delete the lesson from the library instead.");
  }
  assertNoActiveOp(draft);
  discardDraftSource(draft._id);
  await LiveLessonDraft.updateOne(
    { _id: draft._id, school: req.schoolId, ownerId: req.user._id },
    {
      $set: {
        status: "discarded",
        items: [],
        "setup.sourceText": "",
        "setup.pastedText": "",
        "setup.sourceMeta.files": [],
        "setup.sourceMeta.pastedChars": 0,
        "setup.sourceMeta.chars": 0,
        "setup.sourceMeta.textHash": "",
        expiresAt: new Date(Date.now() + LIVE_LESSON_BUILDER.tombstoneTtlMs),
      },
    },
  );
  return res.json({ success: true, data: { discarded: true } });
});

export const approveDraft = asyncHandler(async (req, res) => {
  const draft = await loadDraft(req, { allowFinal: true });
  if (draft.status === "approved") {
    const lesson = draft.resultLessonId
      ? await LiveLesson.findOne({ _id: draft.resultLessonId, school: req.schoolId, ownerId: req.user._id })
      : await LiveLesson.findOne({ sourceDraftId: draft._id, school: req.schoolId, ownerId: req.user._id });
    return res.json({
      success: true,
      data: { lessonId: lesson?._id || draft.resultLessonId, lesson, alreadyApproved: true },
    });
  }
  assertNoActiveOp(draft);
  requireVersion(req, draft);
  if (req.body?.answersChecked !== true) {
    throw builderError(422, "VALIDATION", "Confirm that you checked the questions and answers before saving.");
  }
  if (!draft.items.length) throw builderError(409, "ITEMS_NOT_READY", "Generate the lesson before approving it.");
  const notReady = draft.items.filter((item) => item.status !== "ready");
  if (notReady.length) {
    throw builderError(409, "ITEMS_NOT_READY", `${notReady.length} item${notReady.length === 1 ? "" : "s"} still need content.`);
  }
  const counts = {
    slides: draft.items.filter((item) => item.kind === "slide").length,
    questions: draft.items.filter((item) => item.kind === "question").length,
  };
  if (counts.slides < LIVE_LESSON_BUILDER.minSlides) {
    throw builderError(422, "VALIDATION", "A lesson needs at least one teaching slide.");
  }
  if (counts.slides > LIVE_LESSON_BUILDER.maxSlides || counts.questions > LIVE_LESSON_BUILDER.maxQuestions) {
    throw builderError(422, "LIMIT_EXCEEDED", "The lesson is above the builder limits.");
  }
  const assignment = await resolveLessonAssignment(req, req.body?.classId, req.body?.subjectId);
  if (assignment.error) throw builderError(400, "VALIDATION", assignment.error);
  if (!assignment.classId) {
    throw builderError(400, "VALIDATION", "Choose the class and subject this lesson is for.");
  }

  const compiled = compileDraftItems({
    items: draft.items.map((item) => (item.toObject ? item.toObject() : item)),
    draftId: String(draft._id),
    language: draft.setup.language || "en",
    setupPalette: draft.setup?.palette || "",
  });
  if (compiled.skippedItemIds.length || compiled.slides.length !== draft.items.length) {
    throw builderError(422, "CONTENT_INVALID", "One or more items could not be read. Fix them before saving.");
  }
  const lessonInput = {
    title: cleanLine(req.body?.title || draft.setup.title, 200),
    description: cleanText(req.body?.description, { maxLength: 1000 }),
    subject: assignment.subject || "",
    grade: cleanLine(draft.setup.grade, 80),
    language: draft.setup.language,
    slides: compiled.slides,
  };
  // The chip travels with the lesson; the text behind it does not.
  const lessonSourceMeta = sourceMetaSnapshot(draft.setup?.sourceMeta);
  const errors = validateLessonEdit(lessonInput);
  if (errors.length) throw builderError(422, "CONTENT_INVALID", errors[0].message);
  const groupErrors = await validateLessonGroupOwnership(req, { classId: assignment.classId, slides: compiled.slides });
  if (groupErrors.length) throw builderError(422, "CONTENT_INVALID", groupErrors[0].message);
  await assertLiveLessonHtmlSafe({
    slides: compiled.slides,
    aiReviewEnabled: false,
  });

  const opKey = String(req.body?.opKey || "");
  const { replay } = await beginOperation({
    draft,
    type: "approve",
    opKey,
    payloadHash: hashPayload({
      type: "approve",
      version: draft.version,
      classId: String(assignment.classId),
      subjectId: String(assignment.subjectId),
      title: lessonInput.title,
    }),
    version: draft.version,
  });
  if (replay) {
    const existing = await LiveLesson.findOne({ sourceDraftId: draft._id, school: req.schoolId, ownerId: req.user._id });
    if (existing) return res.json({ success: true, data: { lessonId: existing._id, lesson: existing, alreadyApproved: true } });
    // The provider-less approval was stored as succeeded but the transaction
    // never finished. Let this attempt finish the same draft; the unique
    // sourceDraftId index still makes a second lesson impossible.
    await AiBuilderOperation.updateOne(
      { draftId: draft._id, opKey, status: "succeeded" },
      { $set: { status: "running", completedAt: null } },
    );
  }

  let lesson = null;
  try {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const fresh = await LiveLessonDraft.findOne({
          _id: draft._id,
          school: req.schoolId,
          ownerId: req.user._id,
          version: draft.version,
        }).session(session);
        if (!fresh) throw builderError(409, "VERSION_CONFLICT", "The draft changed before it could be saved. Reload and try again.");
        const [created] = await LiveLesson.create([{
          school: req.schoolId,
          ownerId: req.user._id,
          classId: assignment.classId,
          academicYear: assignment.academicYear,
          subjectId: assignment.subjectId,
          subject: assignment.subject || "",
          title: lessonInput.title,
          description: lessonInput.description,
          grade: lessonInput.grade,
          language: lessonInput.language,
          isDone: false,
          source: "ai",
          sourceDraftId: draft._id,
          sourceMeta: lessonSourceMeta,
          slides: normalizeSlides(compiled.slides, `ai:${draft._id}`),
        }], { session });
        lesson = created;
        await LiveLessonDraft.updateOne(
          { _id: fresh._id, version: fresh.version },
          {
            $set: {
              status: "approved",
              resultLessonId: created._id,
              items: [],
              "setup.sourceText": "",
              "setup.pastedText": "",
              "setup.sourceMeta.files": [],
              expiresAt: new Date(Date.now() + LIVE_LESSON_BUILDER.tombstoneTtlMs),
            },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    if (error?.code === 11000) {
      // Another request created the lesson first; the unique sourceDraftId is
      // the guarantee, so finish the draft against that same lesson.
      lesson = await LiveLesson.findOne({ sourceDraftId: draft._id, school: req.schoolId, ownerId: req.user._id });
      if (lesson) {
        await LiveLessonDraft.updateOne(
          { _id: draft._id },
          {
            $set: {
              status: "approved",
              resultLessonId: lesson._id,
              items: [],
              "setup.sourceText": "",
              "setup.pastedText": "",
              "setup.sourceMeta.files": [],
              expiresAt: new Date(Date.now() + LIVE_LESSON_BUILDER.tombstoneTtlMs),
            },
          },
        );
      }
    }
    if (!lesson) {
      await finishOperation({ draftId: draft._id, opKey, status: "failed", errorCode: error?.code || "APPROVE_FAILED" });
      throw error;
    }
  }

  if (!lesson) {
    await finishOperation({ draftId: draft._id, opKey, status: "failed", errorCode: "APPROVE_FAILED" });
    throw builderError(502, "APPROVE_FAILED", "The lesson could not be saved. Reload and try again.");
  }

  await finishOperation({ draftId: draft._id, opKey, status: "succeeded" });
  discardDraftSource(draft._id);
  return res.status(201).json({
    success: true,
    data: { lessonId: lesson._id, lesson, alreadyApproved: false },
  });
});
