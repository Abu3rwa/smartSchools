import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";
import { LIVE_QUESTION_KINDS } from "../constants/liveLessonQuestionKinds.js";

const { Schema } = mongoose;

const optionSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 20 },
    text: { type: String, required: true, maxlength: 300 },
  },
  { _id: false },
);

const matchingPairSchema = new Schema(
  {
    left: { type: String, required: true, maxlength: 300 },
    right: { type: String, required: true, maxlength: 300 },
  },
  { _id: false },
);

// Ordering ids are written once when the question is authored, so a student answer keeps naming
// the same item even after the lesson is edited or a slide changes position.
const orderingItemSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 40 },
    text: { type: String, required: true, maxlength: 300 },
  },
  { _id: false },
);

const blankSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 40 },
    accepts: { type: [String], default: [] },
  },
  { _id: false },
);

// Numbers stay strings: the numeric engine compares them as exact rationals, and a float column
// would silently round what the teacher wrote.
const numericRuleSchema = new Schema(
  {
    mode: { type: String, enum: ["exact", "tolerance", "relative", "range"], default: "exact" },
    value: { type: String, maxlength: 40, default: "" },
    min: { type: String, maxlength: 40, default: "" },
    max: { type: String, maxlength: 40, default: "" },
    tolerance: { type: String, maxlength: 40, default: "" },
    unit: { type: String, maxlength: 40, default: "" },
    decimalPlaces: { type: String, maxlength: 6, default: "" },
    allowFractions: { type: Boolean, default: false },
    allowPercent: { type: Boolean, default: false },
  },
  { _id: false },
);

const questionSchema = new Schema(
  {
    kind: { type: String, enum: LIVE_QUESTION_KINDS, required: true },
    prompt: { type: String, required: true, maxlength: 500 },
    options: { type: [optionSchema], default: [] },
    correctOptionId: { type: String, maxlength: 20, default: "" },
    correctOptionIds: { type: [String], default: [] },
    matchingPairs: { type: [matchingPairSchema], default: [] },
    orderingItems: { type: [orderingItemSchema], default: [] },
    blanks: { type: [blankSchema], default: [] },
    numericRule: { type: numericRuleSchema, default: undefined },
    // Written answers carry the teacher's own expectation and marking focus; the reader — a
    // teacher now, a drafter later — grades against these words and nothing else.
    guidance: { type: String, maxlength: 500, default: "" },
    criteria: { type: String, maxlength: 1000, default: "" },
    minWords: { type: Number, min: 0, max: 2000, default: 0 },
    maxWords: { type: Number, min: 0, max: 2000, default: 0 },
    explanation: { type: String, maxlength: 2000, default: "" },
  },
  { _id: false },
);

const variantSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "LiveGroup", required: true },
    question: { type: questionSchema, required: true },
  },
  { _id: false },
);

const slideSchema = new Schema(
  {
    order: { type: Number, required: true, min: 0 },
    type: {
      type: String,
      enum: ["opening", "goals", "content", "examples", "html", "question", "activity", "exit-ticket"],
      required: true,
    },
    title: { type: String, maxlength: 200, default: "" },
    body: { type: String, maxlength: 5000, default: "" },
    html: { type: String, maxlength: 100000, default: "" },
    examples: { type: [String], default: [] },
    imageUrl: { type: String, maxlength: 2048, default: "" },
    speakerNotes: { type: String, maxlength: 2000, default: "" },
    question: { type: questionSchema, default: undefined },
    // Students in these groups get the variant instead of `question`; anyone not in a listed group,
    // and the whole class when there are no variants, still answers `question`.
    variants: { type: [variantSchema], default: [] },
  },
  { timestamps: false },
);

const liveLessonSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null, index: true },
    // Mirrors classId's academic year so a lesson can be moved year to year without
    // losing which year it was written for. Null for lessons created before this
    // field existed, or lessons never linked to a class.
    academicYear: { type: String, trim: true, default: null },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    subject: { type: String, trim: true, maxlength: 120, default: "" },
    grade: { type: String, trim: true, maxlength: 80, default: "" },
    language: { type: String, trim: true, maxlength: 20, default: "en" },
    isDone: { type: Boolean, default: false },
    source: { type: String, enum: ["csv"], default: "csv" },
    originLessonId: { type: Schema.Types.ObjectId, ref: "LiveLesson", default: null },
    originOwnerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    originShareInvitationId: { type: Schema.Types.ObjectId, ref: "LiveLessonShareInvitation", default: undefined },
    slides: { type: [slideSchema], required: true, validate: [(slides) => slides.length > 0 && slides.length <= 200, "Lessons need 1–200 slides"] },
  },
  { timestamps: true },
);

liveLessonSchema.index({ school: 1, ownerId: 1, updatedAt: -1 });
liveLessonSchema.index({ school: 1, academicYear: 1 });
liveLessonSchema.index(
  { originShareInvitationId: 1 },
  { unique: true, partialFilterExpression: { originShareInvitationId: { $type: "objectId" } } },
);
liveLessonSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveLesson || mongoose.model("LiveLesson", liveLessonSchema);
