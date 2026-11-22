import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";
import { LIVE_QUESTION_KINDS } from "../constants/liveLessonQuestionKinds.js";
import {
  LIVE_LESSON_BUILDER,
  LIVE_LESSON_BUILDER_LEVELS,
  LIVE_LESSON_GENERATION_MODES,
  DEFAULT_GENERATION_MODE,
} from "../config/liveLessonBuilderConfig.js";
import { SETUP_PALETTE_VALUES, DEFAULT_SETUP_PALETTE } from "../config/liveLessonPalettes.js";

const { Schema } = mongoose;

const pageRangeSchema = new Schema(
  {
    first: { type: Number, required: true, min: 1 },
    last: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const sourceFileSchema = new Schema(
  {
    // A short client-safe id so the wizard can remove one file without ever
    // naming its position in an array that may change.
    fileId: { type: String, required: true, maxlength: 40 },
    name: { type: String, default: "", maxlength: 200 },
    size: { type: Number, default: 0, min: 0 },
    mimeType: { type: String, default: "", maxlength: 120 },
    sourceType: { type: String, default: "", maxlength: 20 },
    chars: { type: Number, default: 0, min: 0 },
    truncated: { type: Boolean, default: false },
    // Page metadata is filled only when the extractor can prove it: pdf-parse
    // reports the total page count, and the range is complete only when every
    // page was read. Word, PowerPoint, text and photos never get page numbers.
    pageCount: { type: Number, default: null, min: 1 },
    pages: { type: pageRangeSchema, default: null },
    uploadedAt: { type: Date, default: null },
    // Text kept by drafts created before memory-only sources. New uploads never
    // write it; their text lives in the in-process source store.
    text: { type: String, default: "" },
  },
  { _id: false },
);

const sourceMetaSchema = new Schema(
  {
    // "memory" means the text lives in the source store; "legacy" means this
    // draft predates it and may still carry text in Mongo.
    storage: { type: String, enum: ["memory", "legacy"], default: "legacy" },
    origin: { type: String, enum: ["paste", "upload"], default: "paste" },
    files: { type: [sourceFileSchema], default: [] },
    truncated: { type: Boolean, default: false },
    redactions: {
      emails: { type: Number, default: 0, min: 0 },
      phones: { type: Number, default: 0, min: 0 },
    },
    pastedChars: { type: Number, default: 0, min: 0 },
    // Combined, already-redacted character count: what the quote is based on.
    chars: { type: Number, default: 0, min: 0 },
    // A hash is not content, so it is safe to keep after the text is gone.
    textHash: { type: String, default: "", maxlength: 64 },
  },
  { _id: false },
);

const setupSchema = new Schema(
  {
    title: { type: String, default: "", maxlength: LIVE_LESSON_BUILDER.titleMax },
    grade: { type: String, default: "", maxlength: 80 },
    subjectText: { type: String, default: "", maxlength: 120 },
    language: { type: String, enum: ["en", "ar"], default: "en" },
    level: { type: String, enum: ["", ...LIVE_LESSON_BUILDER_LEVELS], default: "" },
    slideCount: { type: Number, default: 8, min: 0, max: LIVE_LESSON_BUILDER.maxSlides },
    questionCount: { type: Number, default: 0, min: 0, max: LIVE_LESSON_BUILDER.maxQuestions },
    questionKinds: {
      type: [{ type: String, enum: LIVE_QUESTION_KINDS }],
      default: ["mcq"],
    },
    // Colors for every teaching slide ("auto" keeps the deterministic choice)
    // and how many slides share one model call. Both lock with the plan.
    palette: { type: String, enum: [...SETUP_PALETTE_VALUES], default: DEFAULT_SETUP_PALETTE },
    generationMode: { type: String, enum: [...LIVE_LESSON_GENERATION_MODES], default: DEFAULT_GENERATION_MODE },
    // Pasted text and the combined text are owner-only and purged at approval
    // or discard. The combined value is what every prompt reads.
    pastedText: { type: String, default: "", maxlength: LIVE_LESSON_BUILDER.maxSourceChars },
    sourceText: { type: String, default: "", maxlength: LIVE_LESSON_BUILDER.maxSourceChars },
    sourceMeta: { type: sourceMetaSchema, default: () => ({}) },
    attestation: {
      noStudentData: { type: Boolean, default: false },
      at: { type: Date, default: null },
    },
  },
  { _id: false },
);

const outlineSchema = new Schema(
  {
    title: { type: String, default: "", maxlength: LIVE_LESSON_BUILDER.titleMax },
    brief: { type: String, default: "", maxlength: LIVE_LESSON_BUILDER.briefMax },
  },
  { _id: false },
);

const failureSchema = new Schema(
  {
    code: { type: String, default: "", maxlength: 60 },
    message: { type: String, default: "", maxlength: 300 },
  },
  { _id: false },
);

const itemSchema = new Schema(
  {
    itemId: { type: String, required: true, maxlength: 40 },
    rev: { type: Number, default: 0, min: 0 },
    kind: { type: String, enum: ["slide", "question"], required: true },
    slideType: { type: String, default: "content", maxlength: 20 },
    questionKind: { type: String, enum: ["", ...LIVE_QUESTION_KINDS], default: "" },
    outline: { type: outlineSchema, default: () => ({}) },
    // Content shape is owned by the builder services, not by the schema: one
    // Mixed column lets a failed or stale item keep its last good text.
    content: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ["outlined", "ready", "failed", "stale"], default: "outlined" },
    failure: { type: failureSchema, default: null },
    previous: { type: Schema.Types.Mixed, default: null },
    edited: { type: Boolean, default: false },
    regenCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const activeOpSchema = new Schema(
  {
    opKey: { type: String, default: "", maxlength: 80 },
    type: { type: String, enum: ["plan", "generate", "regenerate", "approve", ""], default: "" },
    itemIds: { type: [String], default: [] },
    startedAt: { type: Date, default: null },
    lockExpiresAt: { type: Date, default: null },
    cancelRequested: { type: Boolean, default: false },
  },
  { _id: false },
);

const liveLessonDraftSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["setup", "outline", "content", "approved", "discarded"],
      default: "setup",
      index: true,
    },
    version: { type: Number, default: 0, min: 0 },
    planVersion: { type: Number, default: 0, min: 0 },
    setup: { type: setupSchema, default: () => ({}) },
    items: { type: [itemSchema], default: [] },
    activeOp: { type: activeOpSchema, default: null },
    regenTotal: { type: Number, default: 0, min: 0 },
    resultLessonId: { type: Schema.Types.ObjectId, ref: "LiveLesson", default: null },
    expiresAt: { type: Date, default: () => new Date(Date.now() + LIVE_LESSON_BUILDER.draftTtlMs) },
  },
  { timestamps: true },
);

liveLessonDraftSchema.index({ school: 1, ownerId: 1, status: 1, updatedAt: -1 });
liveLessonDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

liveLessonDraftSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveLessonDraft
  || mongoose.model("LiveLessonDraft", liveLessonDraftSchema);
