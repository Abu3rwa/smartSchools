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
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    subject: { type: String, trim: true, maxlength: 120, default: "" },
    grade: { type: String, trim: true, maxlength: 80, default: "" },
    language: { type: String, trim: true, maxlength: 20, default: "en" },
    source: { type: String, enum: ["csv"], default: "csv" },
    slides: { type: [slideSchema], required: true, validate: [(slides) => slides.length > 0 && slides.length <= 200, "Lessons need 1–200 slides"] },
  },
  { timestamps: true },
);

liveLessonSchema.index({ school: 1, ownerId: 1, updatedAt: -1 });
liveLessonSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveLesson || mongoose.model("LiveLesson", liveLessonSchema);
