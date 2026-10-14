import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

const optionSchema = new Schema(
  {
    id: { type: String, required: true, maxlength: 20 },
    text: { type: String, required: true, maxlength: 300 },
  },
  { _id: false },
);

const questionSchema = new Schema(
  {
    kind: { type: String, enum: ["mcq", "tf"], required: true },
    prompt: { type: String, required: true, maxlength: 500 },
    options: { type: [optionSchema], required: true },
    correctOptionId: { type: String, required: true, maxlength: 20 },
    explanation: { type: String, maxlength: 2000, default: "" },
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
  },
  { timestamps: false },
);

const liveLessonSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", default: null, index: true },
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
liveLessonSchema.index(
  { originShareInvitationId: 1 },
  { unique: true, partialFilterExpression: { originShareInvitationId: { $type: "objectId" } } },
);
liveLessonSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveLesson || mongoose.model("LiveLesson", liveLessonSchema);
